# ============================================================
#  3분봉 API — 관리자(users/{uid}.role == "admin") 전용, 한국 주식(숫자 6자리)만
#  GET /api/scalp?code=XXXXXX
#  시세: LS t8412 주기 3분, 500봉 × 2쪽. 결과 캐시 없음(매 요청 새로 조회). preview 응답 없음.
#  작도: 선물 첫째 탭과 같은 흐름 (analyze.py · fo.py 의 함수를 불러 쓰기만 한다)
#  첨가: 돌파 신호(거래량 배수 · VWAP 위 · 직전 고점 돌파)
# ============================================================
import os, sys, time, datetime as _dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import _auth
import _i18n as I
import analyze as A
import fo as F

VOL_MULT = 2.0      # 거래량 배수
VOL_DAYS = 5        # 같은 시각 평균을 낼 직전 거래일 수
HIGH_BARS = 20      # 직전 고점 기준 봉 수
VOL_MIN_DAYS = 3    # 같은 시각 자료가 이 일수 미만이면 거래량 배수를 내지 않는다
NCNT = 3            # 분봉 주기(분)
PAGES = 2           # 연속조회 쪽 수(500봉씩)
CH = "/stock/chart"
TAB = 0             # fo.py 의 첫째 탭 자리 (배수 0.47 · 주식 단기 기준값)
T_FIRST = '090300'  # 정규장 첫 3분봉이 끝나는 시각
T_LAST = '153000'   # 정규장 마지막 봉이 끝나는 시각
LIMIT_MSG = '호출 거래건수를 초과'   # LS 호출 한도 오류 글
RETRY_WAIT = 1.1    # 한도 오류 뒤 다시 부르기 전 기다리는 시간(초)

def is_admin(headers):
    uid, u, _ = _auth.access(headers)
    return bool(u) and u.get('role') == 'admin'

def ls_retry(*a):
    """fo.ls 와 같되, LS 가 호출 한도 오류를 주면 RETRY_WAIT 초 뒤 같은 호출을 한 번만 다시 한다"""
    try:
        return F.ls(*a)
    except F.LSError as e:
        if LIMIT_MSG not in str(e): raise
        time.sleep(RETRY_WAIT)
        return F.ls(*a)

def bars3(code):
    """LS t8412 3분봉 (d, t, o, h, l, c, v). 호출 간격·토큰은 fo.ls 그대로. 정규장 봉만 남긴다"""
    rows = []; cd = ct = ''; cont = 'N'; ck = ''
    for _ in range(PAGES):
        j, h = ls_retry('t8412', CH, {'shcode': code, 'ncnt': NCNT, 'qrycnt': 500, 'nday': '0', 'sdate': '20250101',
                                  'edate': '20991231', 'cts_date': cd, 'cts_time': ct, 'comp_yn': 'N'}, cont, ck)
        rr = j.get('t8412OutBlock1') or []
        if not rr: break
        rows.extend(rr)
        ob = j.get('t8412OutBlock') or {}
        nd, nt = (ob.get('cts_date') or '').strip(), (ob.get('cts_time') or '').strip()
        if not nd or (nd == cd and nt == ct): break
        cd, ct, cont, ck = nd, nt, 'Y', h.get('tr_cont_key') or ''
    seen = set(); out = []
    for x in rows:
        k = (x['date'], x['time'])
        if k in seen: continue
        seen.add(k)
        # 정규장만: 봉이 끝나는 시각이 09:03 ~ 15:30 인 봉 (그 밖 — 09:00 이전, 15:30 이후 ~ 20:00 — 은 버린다)
        if not (T_FIRST <= str(x['time']).zfill(6)[:6] <= T_LAST): continue
        out.append({'d': x['date'], 't': x['time'], 'o': float(x['open']), 'h': float(x['high']), 'l': float(x['low']),
                    'c': float(x['close']), 'v': float(x.get('jdiff_vol') or 0)})
    out.sort(key=lambda z: (z['d'], z['t']))
    return out

def signals(b):
    """봉마다 relvol · vwap · hh 와 신호. 반환: (봉마다의 값 목록, 신호가 뜬 봉 순서 목록)"""
    days = []                       # 거래일(나온 순서)
    vol_at = {}                     # (날짜, 시각) → 거래량
    for x in b:
        if not days or days[-1] != x['d']: days.append(x['d'])
        vol_at[(x['d'], x['t'])] = x['v']
    day_no = {d: k for k, d in enumerate(days)}
    rows = []; sig = []; pv = vv = 0.0; cur_d = None
    for i, x in enumerate(b):
        # 1) 거래량 배수: 같은 시각 봉의 직전 VOL_DAYS 거래일 평균 대비
        prev = days[max(0, day_no[x['d']] - VOL_DAYS):day_no[x['d']]]
        vs = [vol_at[(d, x['t'])] for d in prev if (d, x['t']) in vol_at]
        avg = (sum(vs) / len(vs)) if len(vs) >= VOL_MIN_DAYS else 0
        relvol = (x['v'] / avg) if avg > 0 else None
        # 2) VWAP: 그날 첫 봉부터 누적. 날짜가 바뀌면 새로 시작
        if x['d'] != cur_d: cur_d = x['d']; pv = vv = 0.0
        tp = (x['h'] + x['l'] + x['c']) / 3
        pv += tp * x['v']; vv += x['v']
        vwap = (pv / vv) if vv > 0 else tp
        # 3) 직전 HIGH_BARS 봉의 최고가 (이 봉 제외)
        hh = max(y['h'] for y in b[i - HIGH_BARS:i]) if i >= HIGH_BARS else None
        vol_ok = relvol is not None and relvol >= VOL_MULT
        vwap_ok = x['c'] > vwap
        high_ok = hh is not None and x['c'] > hh
        ok = vol_ok and vwap_ok and high_ok
        if ok: sig.append(i)
        rows.append({'relvol': round(relvol, 2) if relvol is not None else None, 'vwap': round(vwap, 2), 'hh': hh,
                     'c': x['c'], 'vol_ok': vol_ok, 'vwap_ok': vwap_ok, 'high_ok': high_ok, 'signal': ok})
    return rows, sig

def forming(last):
    """마지막 봉이 아직 끝나지 않았는가. LS 분봉의 시각(t)은 그 봉이 끝나는 시각 → 장중이고 지금이 그 시각 전이면 진행 중"""
    n = _dt.datetime.now(F._KST)
    if last.get('d') != n.strftime("%Y%m%d") or not A._is_market_open(): return False
    return n.strftime("%H%M%S") < str(last.get('t') or '').zfill(6)[:6]

def analyze_code(code):
    nm, mk = A.get_name(A.token(), code)
    b = bars3(code)
    if not b or len(b) < 15: return {'error': '데이터 부족'}
    # 변곡 기준·touch·judge: fo.py 첫째 탭과 같은 계산 (20봉 구간 폭 중앙값 × 배수, 주식 기준값 대비 같은 비율)
    st = F.STOCK[TAB]
    rg = F.range20(b) or 0
    thr = F.MULT[TAB] * rg
    fo = {'thr': thr, 'judge': thr * (F.JUDGE_STOCK / st['thr']), 'touch': thr * (st['touch'] / st['thr'])}
    tt = A.build_drawings(b, fo=True)
    A.resolve_risk(tt, None)
    sr = []
    for d in tt.get('draws', []):
        if d.get('yc') and d['yc'] > 0: sr.append(round(d['yc'], 2))
    for rk in tt.get('risks', []):
        if rk.get('yc') and rk['yc'] > 0: sr.append(round(rk['yc'], 2))
    sr = sorted(set(sr))
    if tt.get('chart'):
        risk = tt['risks'][0]['yc'] if tt.get('risks') else None
        try:
            tt['projection'] = A.build_projection(tt['chart'], tt['draws'], risk, fut=st['fut'], market='',
                                                  period=st['period'], all_risks=tt.get('all_risks'), fo=fo)
            if tt['projection']: tt['projection']['sr_levels'] = sr
        except Exception:
            tt['projection'] = None
    xp = []
    for d in tt.get('draws', []) or []:
        if d.get('yc', 0) > 0: xp.append(round(d['yc'], 2))
    for d in tt.get('all_risks', []) or []:
        if d.get('yc', 0) > 0: xp.append(round(d['yc'], 2))
    if xp and isinstance(tt.get('projection'), dict): tt['projection']['xpoints'] = xp
    tt.pop('all_risks', None)
    rows, sig = signals(b)
    now = dict(rows[-1]); now['forming'] = forming(b[-1])
    out = {'종목코드': code, '종목명': nm, '시장': mk}
    out.update(tt)
    out['signals'] = sig
    out['vwap'] = [r['vwap'] for r in rows]
    out['now'] = now
    return out

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            if not is_admin(self.headers): return _auth.send_json(self, 403, {'error': 'forbidden'})
        except Exception:
            return _auth.send_json(self, 403, {'error': 'forbidden'})
        code = (parse_qs(urlparse(self.path).query).get('code', [''])[0] or '').strip()
        if not (code.isdigit() and len(code) == 6): return _auth.send_json(self, 400, {'error': 'code'})
        try:
            return _auth.send_json(self, 200, analyze_code(code))
        except Exception as e:
            return _auth.send_json(self, 200, {'error': I.text(e, 'ko')[:200]})
