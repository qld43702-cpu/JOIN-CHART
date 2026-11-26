# ============================================================
#  선물 API — 코스피200 선물 최근월물(시세 LS증권) + 나스닥100 선물(시세 야후 NQ=F), 조회 방식(실시간 아님)
#  GET /api/fo?board=1      → 선물 2개 (코스피200 선물 최근월물, 나스닥 선물)
#  GET /api/fo?code=XXXX    → 그 종목 분석: 5분·30분·60분 (작도는 주식과 같은 함수)
#  이용중(active)만 실제 값. 그 외는 preview(가격 숨김) — /api/analyze와 같은 규칙.
#  LS 호출은 인스턴스 안에서 1.1초 간격(초당 1회 제한).
# ============================================================
import os, sys, json, time, datetime as _dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import requests
import _auth
import _i18n as I
import analyze as A

BASE = "https://openapi.ls-sec.co.kr:8080"
MD = "/futureoption/market-data"
CH = "/futureoption/chart"
_KST = _dt.timezone(_dt.timedelta(hours=9))

# ===== 변곡 기준 = 그 종목·그 분봉의 20봉 구간 폭 × 배수 =====
# 20봉 구간 폭: 받은 봉에서 20봉 구간(5봉씩 이동)마다 (최고가-최저가)/최저가, 그 중앙값
# 배수: 주식 기준 10/20/30% ÷ 주식 한 달(20거래일) 폭 중앙값 21.3% → 첫 탭 0.47 / 둘째 탭 0.94 / 셋째 탭 1.41
# 탭(분): 선물 5·30·60 — 배수·주식 기준값은 탭 자리(첫·둘째·셋째)로 정한다
TABS_FUT = (5, 30, 60)
NAME_KR = 216      # 문구 번호(api/_i18n.py): 국내선물
NAME_NQ = 217      # 문구 번호: 나스닥 선물
NQ = 'NQ=F'        # 나스닥100 선물 (야후)
NQ_RANGE = {5: '10d', 30: '60d', 60: '3mo'}   # 분봉별 야후 조회 구간 (최근 MAXBARS봉을 채울 만큼)
MAXBARS = 1000     # 작도에 쓰는 봉 수 — 국내선물(500봉 × 2쪽)과 같게
MULT = (0.47, 0.94, 1.41)
RANGE_W = 20
# 주식에서 각 축의 기준값 (판정 1.5%·touch_buf를 변곡 기준 대비 같은 비율로 옮기기 위함)
STOCK = ({'thr': 0.10, 'touch': 0.03, 'period': 'week', 'fut': 39},
         {'thr': 0.20, 'touch': 0.05, 'period': 'month', 'fut': 52},
         {'thr': 0.30, 'touch': 0.05, 'period': 'quarter', 'fut': 63})
JUDGE_STOCK = 0.015
PAGES = 2          # 분봉 연속조회 페이지 수(500봉씩)

class LSError(I.Msg):
    """LSError(문구 번호, 값…) 또는 LSError(raw=LS가 준 글)"""
    def __init__(self, n=None, *vals, raw=None):
        if n is None: Exception.__init__(self, raw); self.n = None; self.vals = ()
        else: super().__init__(n, *vals)

_last = [0.0]
def ls(tr, path, body, cont='N', ckey=''):
    w = 1.1 - (time.time() - _last[0])
    if w > 0: time.sleep(w)
    _last[0] = time.time()
    hd = {"Content-Type": "application/json; charset=UTF-8", "authorization": f"Bearer {A.token()}",
          "tr_cd": tr, "tr_cont": cont}
    if ckey: hd["tr_cont_key"] = ckey
    r = requests.post(f"{BASE}{path}", verify=False, timeout=15, headers=hd, json={f"{tr}InBlock": body})
    try: j = r.json()
    except Exception: raise LSError(229, r.status_code)
    if j.get('rsp_cd') != '00000':
        _m = j.get('rsp_msg')
        raise (LSError(raw=str(_m)) if _m else LSError(230))
    return j, r.headers

def today(): return _dt.datetime.now(_KST).date()

# ===== 마스터(t8467 선물 목록: 하루 1번) =====
_MASTER = {}
def master(tr):
    k = (tr, today().isoformat()); hit = _MASTER.get(k)
    if hit: return hit[1]
    j, _ = ls('t8467', MD, {'gubun': ''})
    _MASTER.clear() if len(_MASTER) > 8 else None
    _MASTER[k] = (time.time(), j.get(f'{tr}OutBlock') or [])
    return _MASTER[k][1]

def nth_weekday(y, m, wd, n):
    """y년 m월의 n번째 요일(wd: 월=0 … 목=3). 없으면 None"""
    d = _dt.date(y, m, 1); d += _dt.timedelta(days=(wd - d.weekday()) % 7); d += _dt.timedelta(days=7 * (n - 1))
    return d if d.month == m else None

def front_future():
    """최근월물: 만기(월물 둘째 목요일) 당일까지 그 월물, 다음 날 다음 월물"""
    t = today(); best = None
    for r in master('t8467'):
        nm = (r.get('hname') or '').strip()
        if not nm.startswith('F ') or 'SP' in nm: continue
        yymm = nm.split()[1]
        try: y, m = 2000 + int(yymm[:2]), int(yymm[2:4])
        except Exception: continue
        ex = nth_weekday(y, m, 3, 2)
        if ex and ex >= t and (best is None or ex < best[0]): best = (ex, r)
    return best

def fnum(v):
    try: return float(v)
    except Exception: return None

# ===== 나스닥100 선물 (야후 NQ=F) =====
def nq_fetch(interval, rng):
    """야후 분봉 → (봉 목록[한국 시간], meta). 값이 없는 봉(휴장 구간)은 뺀다"""
    r = requests.get(f"{A.YBASE}/{NQ}", headers=A.YHEAD, timeout=10,
                     params={"range": rng, "interval": interval, "includePrePost": "false"})
    res = (r.json().get("chart") or {}).get("result")
    if not res: raise I.Msg(231, NQ)
    res = res[0]; ts = res.get("timestamp") or []
    q = (res.get("indicators", {}).get("quote") or [{}])[0]
    o, h, l, c, v = (q.get(k) or [] for k in ('open', 'high', 'low', 'close', 'volume'))
    out = []
    for i in range(len(ts)):
        if i >= len(c) or c[i] is None: continue
        dt = _dt.datetime.fromtimestamp(ts[i], _KST)
        out.append({'d': dt.strftime("%Y%m%d"), 't': dt.strftime("%H%M%S"), 'o': float(o[i] or c[i]), 'h': float(h[i] or c[i]),
                    'l': float(l[i] or c[i]), 'c': float(c[i]), 'v': float(v[i] or 0)})
    return out, (res.get("meta") or {})

def nq_quote(meta):
    """현재가·전일 대비 (LS 등락과 같은 모양: change 절댓값, sign 2=상승 5=하락)"""
    p = fnum(meta.get('regularMarketPrice')); pc = fnum(meta.get('previousClose'))
    if p is None or not pc: return {'price': p, 'change': None, 'diff': None, 'sign': None}
    ch = p - pc
    return {'price': p, 'change': round(abs(ch), 2), 'diff': round(abs(ch) / pc * 100, 2),
            'sign': '2' if ch > 0 else ('5' if ch < 0 else '3')}

def board(lang='ko'):
    ff = front_future()
    if not ff: raise LSError(232)
    fcode = ff[1]['shcode']
    j, _ = ls('t2111', MD, {'focode': fcode}); fb = j.get('t2111OutBlock') or {}
    fut = {'code': fcode, 'name': I.t(NAME_KR, lang), 'price': fnum(fb.get('price')),
           'change': fnum(fb.get('change')), 'diff': fnum(fb.get('diff')), 'sign': fb.get('sign')}
    _, meta = nq_fetch('5m', '1d')
    nq = dict({'code': NQ, 'name': I.t(NAME_NQ, lang)}, **nq_quote(meta))
    return {'fut': fut, 'nq': nq}

def bars(code, ncnt):
    rows = []; cd = ct = ''; cont = 'N'; ck = ''; more = False
    for _ in range(PAGES):
        j, h = ls('t8465', CH, {'shcode': code, 'ncnt': ncnt, 'qrycnt': 500, 'nday': '0', 'sdate': '', 'stime': '',
                                'edate': '99999999', 'etime': '', 'cts_date': cd, 'cts_time': ct, 'comp_yn': 'N'}, cont, ck)
        rr = j.get('t8465OutBlock1') or []
        rows.extend(rr)
        ob = j.get('t8465OutBlock') or {}
        more = (h.get('tr_cont') == 'Y') and bool(rr)
        nd, nt = (ob.get('cts_date') or '').strip(), (ob.get('cts_time') or '').strip()
        if not more or not nd or (nd == cd and nt == ct): break
        cd, ct, cont, ck = nd, nt, 'Y', h.get('tr_cont_key') or ''
    seen = set(); out = []
    for x in rows:
        k = (x['date'], x['time'])
        if k in seen: continue
        seen.add(k)
        out.append({'d': x['date'], 't': x['time'], 'o': float(x['open']), 'h': float(x['high']), 'l': float(x['low']),
                    'c': float(x['close']), 'v': float(x.get('jdiff_vol') or 0)})
    out.sort(key=lambda z: (z['d'], z['t']))
    # 상장 이후 전부를 받은 경우: 첫 체결 전(거래량 0, 같은 가격) 봉은 뺀다
    if not more:
        i = 0
        while i < len(out) and out[i]['v'] <= 0: i += 1
        out = out[i:]
    return out

def range20(b):
    """20봉 구간(5봉씩 이동)마다 (최고가-최저가)/최저가 → 중앙값"""
    w = RANGE_W
    if len(b) < w: return None
    out = []
    for s in range(0, len(b) - w + 1, max(1, w // 4)):
        seg = b[s:s + w]; lo = min(x['l'] for x in seg); hi = max(x['h'] for x in seg)
        if lo > 0: out.append((hi - lo) / lo)
    if not out: return None
    out.sort(); m = len(out) // 2
    return out[m] if len(out) % 2 else (out[m - 1] + out[m]) / 2

def analyze_code(code, lang='ko'):
    is_nq = (code == NQ)
    if is_nq:
        name = I.t(NAME_NQ, lang); chg = None
    else:
        ff = front_future()
        if not (ff and code == ff[1]['shcode']):
            return {'error': I.t(233, lang)}
        j, _ = ls('t2111', MD, {'focode': code}); cb = j.get('t2111OutBlock') or {}
        name = I.t(NAME_KR, lang)
        chg = {'change': fnum(cb.get('change')), 'diff': fnum(cb.get('diff')), 'sign': cb.get('sign'), 'price': fnum(cb.get('price'))}
    tabs = TABS_FUT
    T1, T2, T3 = tabs
    blk = {}; thr_info = {}
    for i, n in enumerate(tabs):
        if is_nq:
            b, meta = nq_fetch('%dm' % n, NQ_RANGE[n])
            b = b[-MAXBARS:]
            if chg is None: chg = nq_quote(meta)
        else:
            b = bars(code, n)
        if not b or len(b) < 15:
            blk[n] = {'error': '데이터 부족'}; continue
        rg = range20(b) or 0
        thr = MULT[i] * rg
        st = STOCK[i]
        fo = {'thr': thr, 'judge': thr * (JUDGE_STOCK / st['thr']), 'touch': thr * (st['touch'] / st['thr'])}
        thr_info[n] = {'range20': round(rg, 6), 'thr': round(thr, 6), 'bars': len(b)}
        blk[n] = {'bars': b, 'fo': fo}
    tt = A.build_drawings(blk[T1]['bars'], fo=True) if 'bars' in blk[T1] else {'error': '데이터 부족'}
    mm = A.build_drawings(blk[T2]['bars'], fo=True) if 'bars' in blk[T2] else {'error': '데이터 부족'}
    dd = A.build_drawings(blk[T3]['bars'], fo=True) if 'bars' in blk[T3] else {'error': '데이터 부족'}
    # 위험선: 주식과 같은 순서 (셋째 탭 ← 둘째 탭 끌어옴, 둘째·첫 탭 자체)
    if 'draws' in dd: A.resolve_risk(dd, mm if 'draws' in mm else None)
    if 'draws' in mm: A.resolve_risk(mm, None)
    if 'draws' in tt: A.resolve_risk(tt, None)
    sr_levels = []
    if 'draws' in mm:
        for d in mm.get('draws', []):
            if d.get('yc') and d['yc'] > 0: sr_levels.append(round(d['yc'], 2))
        for rk in mm.get('risks', []):
            if rk.get('yc') and rk['yc'] > 0: sr_levels.append(round(rk['yc'], 2))
    sr_levels = sorted(set(sr_levels))
    sr3 = []
    if 'draws' in tt:
        for d in tt.get('draws', []):
            if d.get('yc') and d['yc'] > 0: sr3.append(round(d['yc'], 2))
        for rk in tt.get('risks', []):
            if rk.get('yc') and rk['yc'] > 0: sr3.append(round(rk['yc'], 2))
    sr3 = sorted(set(sr3))
    def proj(t, n, sr):
        if 'draws' not in t or not t.get('chart'): return
        risk = t['risks'][0]['yc'] if t.get('risks') else None
        st = STOCK[tabs.index(n)]
        try:
            t['projection'] = A.build_projection(t['chart'], t['draws'], risk, fut=st['fut'], market='',
                                                 period=st['period'], all_risks=t.get('all_risks'), fo=blk[n]['fo'])
            if t['projection']: t['projection']['sr_levels'] = sr
        except Exception:
            t['projection'] = None
    proj(dd, T3, sr_levels)
    proj(tt, T1, sr3)
    sr5 = sorted(set(round(d['yc'], 2) for d in (mm.get('draws') or []) if d.get('yc') and d['yc'] > 0)) if 'draws' in mm else []
    proj(mm, T2, sr5)
    for t in (dd, mm, tt):
        if isinstance(t, dict):
            xp = []
            for d in t.get('draws', []) or []:
                if d.get('yc', 0) > 0: xp.append(round(d['yc'], 2))
            for d in t.get('all_risks', []) or []:
                if d.get('yc', 0) > 0: xp.append(round(d['yc'], 2))
            if xp and isinstance(t.get('projection'), dict): t['projection']['xpoints'] = xp
            t.pop('all_risks', None)
    return {'종목코드': '', '종목명': name, '시장': '', '일봉': dd, '60분': mm, '10분': tt, '등락': chg,
            'fo': True, 'tabs': list(tabs), 'thr_info': {str(k): v for k, v in thr_info.items()}}

def preview_board(b):
    pv = json.loads(json.dumps(b))
    for it in (pv['fut'], pv['nq']):
        for k in ('price', 'change', 'diff', 'sign'): it[k] = None
    pv['preview'] = True
    return pv

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        code = (qs.get('code', [''])[0] or '').strip().upper()
        lang = I.lang_of(qs)   # 영어 화면(?lang=en)이면 이름·오류 문구를 영어로. 없으면 한국어 그대로
        try: st = _auth.access(self.headers)[2]
        except Exception: st = 'login'
        try:
            if qs.get('board'):
                b = board(lang)
                if st != 'active': b = preview_board(b); b['auth'] = st
                return _auth.send_json(self, 200, b)
            if not code: return _auth.send_json(self, 200, {'error': I.t(234, lang)})
            out = analyze_code(code, lang)
            if out.get('error') or st == 'active': return _auth.send_json(self, 200, out)
            pv = A.build_preview(out); pv.pop('등락', None); pv['auth'] = st
            return _auth.send_json(self, 200, pv)
        except LSError as e:
            return _auth.send_json(self, 200, {'error': I.text(e, lang), 'ls_error': True})
        except Exception as e:
            return _auth.send_json(self, 200, {'error': I.t(235, lang, I.text(e, lang)[:200])})
