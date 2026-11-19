# ============================================================
#  선물·위클리옵션 API (코스피200) — 시세 LS증권, 조회 방식(실시간 아님)
#  GET /api/fo?board=1      → 선물 최근월물 1개 + 위클리옵션 전광판(가장 가까운 만기, 현재가 0.10 이상 0.60 미만)
#  GET /api/fo?code=XXXX    → 그 종목 3분·5분·10분 분석 (작도는 주식과 같은 함수)
#  이용중(active)만 실제 값. 그 외는 preview(가격 숨김) — /api/analyze와 같은 규칙.
#  LS 호출은 인스턴스 안에서 1.1초 간격(초당 1회 제한).
# ============================================================
import os, sys, json, time, datetime as _dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import requests
import _auth
import analyze as A

BASE = "https://openapi.ls-sec.co.kr:8080"
MD = "/futureoption/market-data"
CH = "/futureoption/chart"
_KST = _dt.timezone(_dt.timedelta(hours=9))

# ===== 변곡 기준 = 그 종목·그 분봉의 20봉 구간 폭 × 배수 =====
# 20봉 구간 폭: 받은 봉에서 20봉 구간(5봉씩 이동)마다 (최고가-최저가)/최저가, 그 중앙값
# 배수: 주식 기준 10/20/30% ÷ 주식 한 달(20거래일) 폭 중앙값 21.3% → 3분 0.47 / 5분 0.94 / 10분 1.41
MULT = {3: 0.47, 5: 0.94, 10: 1.41}
RANGE_W = 20
# 주식에서 각 축의 기준값 (판정 1.5%·touch_buf를 변곡 기준 대비 같은 비율로 옮기기 위함)
STOCK = {3: {'thr': 0.10, 'touch': 0.03, 'period': 'week', 'fut': 39},
         5: {'thr': 0.20, 'touch': 0.05, 'period': 'month', 'fut': 52},
         10: {'thr': 0.30, 'touch': 0.05, 'period': 'quarter', 'fut': 63}}
JUDGE_STOCK = 0.015
PAGES = 2          # 분봉 연속조회 페이지 수(500봉씩)

class LSError(Exception):
    pass

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
    except Exception: raise LSError('LS 응답 오류 (HTTP %s)' % r.status_code)
    if j.get('rsp_cd') != '00000':
        raise LSError(str(j.get('rsp_msg') or 'LS 오류') )
    return j, r.headers

def today(): return _dt.datetime.now(_KST).date()

# ===== 마스터(하루 1번) =====
_MASTER = {}
def master(tr):
    k = (tr, today().isoformat())
    if k not in _MASTER:
        if tr == 't8467': j, _ = ls('t8467', MD, {'gubun': ''})
        else: j, _ = ls('t8435', MD, {'gubun': 'WK'})
        _MASTER.clear() if len(_MASTER) > 8 else None
        _MASTER[k] = j.get(f'{tr}OutBlock') or []
    return _MASTER[k]

def nth_weekday(y, m, wd, n):
    """y년 m월의 n번째 요일(wd: 월=0 … 목=3). 없으면 None"""
    d = _dt.date(y, m, 1); d += _dt.timedelta(days=(wd - d.weekday()) % 7); d += _dt.timedelta(days=7 * (n - 1))
    return d if d.month == m else None

def next_nth(wd, n, base):
    """base 이후(당일 포함) 가장 가까운 '그 달의 n번째 요일'"""
    y, m = base.year, base.month
    for _ in range(3):
        d = nth_weekday(y, m, wd, n)
        if d and d >= base: return d
        m += 1
        if m > 12: y, m = y + 1, 1
    return None

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

def nearest_weekly():
    """위클리: 월요일·목요일 만기 중 가장 가까운 1개 (만기 당일까지 그 만기, 다음 날 넘김)"""
    t = today(); groups = {}
    for r in master('t8435'):
        p = (r.get('hname') or '').split()
        if len(p) < 4 or p[1] not in ('월', '목') or not p[2].startswith('W'): continue
        key = (p[1], p[2])
        g = groups.setdefault(key, {'prefix': set(), 'codes': []})
        g['prefix'].add((r.get('shcode') or '')[:5]); g['codes'].append(r.get('shcode') or '')
    best = None
    for (day, wk), g in groups.items():
        try: n = int(wk[1:])
        except Exception: continue
        ex = next_nth(0 if day == '월' else 3, n, t)
        if ex and (best is None or ex < best['expiry']):
            best = {'day': day, 'wk': wk, 'expiry': ex, 'prefix': g['prefix'], 'codes': g['codes']}
    return best

def monday_rows(wk, names):
    """월요일 만기: t8435의 그 만기 콜·풋 코드를 50개씩 t8434(멀티현재가)로 조회"""
    codes = [c for c in wk['codes'] if c]
    px = {}
    for i in range(0, len(codes), 50):
        ch = codes[i:i + 50]
        j, _ = ls('t8434', MD, {'qrycnt': len(ch), 'focode': ''.join(ch)})
        for r in j.get('t8434OutBlock1') or []:
            px[r.get('focode')] = fnum(r.get('price'))
    calls, puts = [], []
    for c in codes:
        p = px.get(c)
        if p is None or not (0.10 <= p < 0.60): continue
        nm = names.get(c, c)
        ap = fnum((nm.split() or [''])[-1].replace(',', ''))
        (calls if c.startswith('B') else puts).append({'code': c, 'name': nm, 'price': p, 'actprice': ap})
    return calls, puts

def fnum(v):
    try: return float(v)
    except Exception: return None

def board():
    ff = front_future()
    if not ff: raise LSError('선물 최근월물을 찾지 못했습니다')
    fcode = ff[1]['shcode']
    j, _ = ls('t2111', MD, {'focode': fcode}); fb = j.get('t2111OutBlock') or {}
    fut = {'code': fcode, 'name': fb.get('hname') or ff[1].get('hname'), 'price': fnum(fb.get('price')),
           'change': fnum(fb.get('change')), 'diff': fnum(fb.get('diff')), 'sign': fb.get('sign')}
    wk = nearest_weekly()
    if not wk: raise LSError('위클리옵션 만기를 찾지 못했습니다')
    names = {r.get('shcode'): (r.get('hname') or '').strip() for r in master('t8435')}
    if wk['day'] == '월':
        calls, puts = monday_rows(wk, names)
    else:
        j, _ = ls('t2301', MD, {'yyyymm': wk['wk'].ljust(6), 'gubun': 'W'})
        calls, puts, got = [], [], set()
        for blk, dst in (('t2301OutBlock1', calls), ('t2301OutBlock2', puts)):
            for r in j.get(blk) or []:
                code = r.get('optcode') or ''; got.add(code[:5])
                p = fnum(r.get('price'))
                if p is None or not (0.10 <= p < 0.60): continue
                dst.append({'code': code, 'name': names.get(code, code), 'price': p, 'actprice': fnum(r.get('actprice'))})
        # 받은 만기가 고른 만기(월/목)와 다르면 표시하지 않음
        if got and not (got & wk['prefix']):
            raise LSError('위클리 %s %s 만기 전광판을 받지 못했습니다' % (wk['day'], wk['wk']))
    calls.sort(key=lambda x: x['actprice'] or 0); puts.sort(key=lambda x: x['actprice'] or 0)
    return {'fut': fut, 'weekly': {'day': wk['day'], 'wk': wk['wk'], 'expiry': wk['expiry'].strftime('%Y%m%d')},
            'calls': calls, 'puts': puts}

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

def analyze_code(code):
    names = {r.get('shcode'): (r.get('hname') or '').strip() for r in master('t8435')}
    ff = front_future()
    if not (code in names or (ff and code == ff[1]['shcode'])):
        return {'error': '선물 최근월물 또는 위클리옵션 코드가 아닙니다'}
    j, _ = ls('t2111', MD, {'focode': code}); cb = j.get('t2111OutBlock') or {}
    name = cb.get('hname') or names.get(code) or code
    blk = {}; thr_info = {}
    for n in (3, 5, 10):
        b = bars(code, n)
        if not b or len(b) < 15:
            blk[n] = {'error': '데이터 부족'}; continue
        rg = range20(b) or 0
        thr = MULT[n] * rg
        st = STOCK[n]
        fo = {'thr': thr, 'judge': thr * (JUDGE_STOCK / st['thr']), 'touch': thr * (st['touch'] / st['thr'])}
        thr_info[n] = {'range20': round(rg, 6), 'thr': round(thr, 6), 'bars': len(b)}
        blk[n] = {'bars': b, 'fo': fo}
    tt = A.build_drawings(blk[3]['bars'], fo=True) if 'bars' in blk[3] else {'error': '데이터 부족'}
    mm = A.build_drawings(blk[5]['bars'], fo=True) if 'bars' in blk[5] else {'error': '데이터 부족'}
    dd = A.build_drawings(blk[10]['bars'], fo=True) if 'bars' in blk[10] else {'error': '데이터 부족'}
    # 위험선: 주식과 같은 순서 (10분 ← 5분 끌어옴, 5분·3분 자체)
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
        st = STOCK[n]
        try:
            t['projection'] = A.build_projection(t['chart'], t['draws'], risk, fut=st['fut'], market='',
                                                 period=st['period'], all_risks=t.get('all_risks'), fo=blk[n]['fo'])
            if t['projection']: t['projection']['sr_levels'] = sr
        except Exception:
            t['projection'] = None
    proj(dd, 10, sr_levels)
    proj(tt, 3, sr3)
    sr5 = sorted(set(round(d['yc'], 2) for d in (mm.get('draws') or []) if d.get('yc') and d['yc'] > 0)) if 'draws' in mm else []
    proj(mm, 5, sr5)
    for t in (dd, mm, tt):
        if isinstance(t, dict):
            xp = []
            for d in t.get('draws', []) or []:
                if d.get('yc', 0) > 0: xp.append(round(d['yc'], 2))
            for d in t.get('all_risks', []) or []:
                if d.get('yc', 0) > 0: xp.append(round(d['yc'], 2))
            if xp and isinstance(t.get('projection'), dict): t['projection']['xpoints'] = xp
            t.pop('all_risks', None)
    chg = {'change': fnum(cb.get('change')), 'diff': fnum(cb.get('diff')), 'sign': cb.get('sign'), 'price': fnum(cb.get('price'))}
    return {'종목코드': code, '종목명': name, '시장': '', '일봉': dd, '60분': mm, '10분': tt, '등락': chg,
            'fo': True, 'thr_info': {str(k): v for k, v in thr_info.items()}}

def preview_board(b):
    pv = json.loads(json.dumps(b))
    for k in ('price', 'change', 'diff', 'sign'): pv['fut'][k] = None
    for L in (pv['calls'], pv['puts']):
        for r in L: r['price'] = None
    pv['preview'] = True
    return pv

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        code = (qs.get('code', [''])[0] or '').strip().upper()
        try: st = _auth.access(self.headers)[2]
        except Exception: st = 'login'
        try:
            if qs.get('board'):
                b = board()
                if st != 'active': b = preview_board(b); b['auth'] = st
                return _auth.send_json(self, 200, b)
            if not code: return _auth.send_json(self, 200, {'error': '종목코드가 없습니다'})
            out = analyze_code(code)
            if out.get('error') or st == 'active': return _auth.send_json(self, 200, out)
            pv = A.build_preview(out); pv.pop('등락', None); pv['auth'] = st
            return _auth.send_json(self, 200, pv)
        except LSError as e:
            return _auth.send_json(self, 200, {'error': str(e), 'ls_error': True})
        except Exception as e:
            return _auth.send_json(self, 200, {'error': '조회 실패: ' + str(e)[:200]})
