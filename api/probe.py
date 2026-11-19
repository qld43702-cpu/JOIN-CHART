# ============================================================
#  [임시] 변곡 기준 조사용 — 조사 끝나면 삭제
#  POST /api/probe {code, ncnt, pages, ref:{cross,turns,range}}   관리자(role=admin)만
#  t8465로 분봉을 받아 엔진 작도(analyze.py)로 패턴 속도·폭·변곡·위험선을 계산해 요약만 돌려준다.
# ============================================================
import os, sys, json, time, statistics, requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
import _auth
import analyze as A

BASE = "https://openapi.ls-sec.co.kr:8080"

def cross_events(bars):
    """build_drawings와 같은 기하 조건으로 교차점 '발생'을 전부 센다 (최근 5개 자르기·현재가 기준 필터 없이).
    반환: draws[(B_t1, yc)], risks[(B_t1, yc)], turns(인덱스)"""
    c = [b['c'] for b in bars]; MA2 = A.ma(c, 2); tn = A.turns(MA2, 2)
    segs = []
    for i in range(len(tn) - 1):
        a, b = tn[i], tn[i + 1]
        if b == a or MA2[a] is None or MA2[b] is None: continue
        segs.append({'t0': a, 't1': b, 'up': MA2[b] > MA2[a]})
    dr, rk = [], []
    for i in range(len(segs) - 2):
        X, M, Y = segs[i], segs[i + 1], segs[i + 2]
        down = (not X['up']) and M['up'] and (not Y['up'])
        up = X['up'] and (not M['up']) and Y['up']
        if not (down or up): continue
        sa = A.last_down_slope(MA2, X['t0'], X['t1']); sb = A.last_down_slope(MA2, Y['t0'], Y['t1'])
        if down and (sa >= 0 or sb >= 0 or sb <= sa): continue
        if up and (sa <= 0 or sb <= 0 or sb >= sa): continue
        ya1 = MA2[X['t1']]; ta1 = X['t1']; yb1 = MA2[Y['t1']]; tb1 = Y['t1']
        den = sa - sb
        if abs(den) < 1e-9: continue
        xc = (yb1 - ya1 - sb * tb1 + sa * ta1) / den; yc = ya1 + sa * (xc - ta1)
        if xc >= min(ta1, tb1) or xc < 0 or yc <= 0: continue
        (dr if down else rk).append((Y['t1'], yc))
    return dr, rk, tn

def pivots(cc, thr):
    pv = [0]; tr = 1; ex = cc[0]; exi = 0
    for i in range(1, len(cc)):
        p = cc[i]
        if tr == 1:
            if p > ex: ex = p; exi = i
            elif ex > 0 and (ex - p) / ex >= thr: pv.append(exi); tr = -1; ex = p; exi = i
        else:
            if p < ex: ex = p; exi = i
            elif ex > 0 and (p - ex) / ex >= thr: pv.append(exi); tr = 1; ex = p; exi = i
    return pv

def win_range(bars, w):
    """길이 w봉 구간(겹치게 이동)마다 (최고가-최저가)/최저가, 중앙값"""
    w = max(2, int(round(w))); out = []
    if len(bars) < w: return None
    step = max(1, w // 4)
    for s in range(0, len(bars) - w + 1, step):
        seg = bars[s:s + w]; lo = min(b['l'] for b in seg); hi = max(b['h'] for b in seg)
        if lo > 0: out.append((hi - lo) / lo)
    return statistics.median(out) if out else None

_last = [0.0]
def fetch(code, ncnt, pages):
    rows = []; cd = ct = ''; cont = 'N'; ck = ''; more = False
    for _ in range(pages):
        w = 1.1 - (time.time() - _last[0])
        if w > 0: time.sleep(w)
        _last[0] = time.time()
        hd = {"Content-Type": "application/json; charset=UTF-8", "authorization": f"Bearer {A.token()}", "tr_cd": "t8465", "tr_cont": cont}
        if ck: hd["tr_cont_key"] = ck
        r = requests.post(f"{BASE}/futureoption/chart", verify=False, timeout=15, headers=hd,
            json={"t8465InBlock": {'shcode': code, 'ncnt': ncnt, 'qrycnt': 500, 'nday': '0', 'sdate': '', 'stime': '', 'edate': '99999999', 'etime': '', 'cts_date': cd, 'cts_time': ct, 'comp_yn': 'N'}})
        j = r.json()
        if j.get('rsp_cd') != '00000': raise RuntimeError('LS: ' + str(j.get('rsp_msg')))
        rr = j.get('t8465OutBlock1') or []; rows.extend(rr); ob = j.get('t8465OutBlock') or {}
        more = r.headers.get('tr_cont') == 'Y' and bool(rr)
        nd, nt = (ob.get('cts_date') or '').strip(), (ob.get('cts_time') or '').strip()
        if not more or not nd or (nd == cd and nt == ct): break
        cd, ct, cont, ck = nd, nt, 'Y', r.headers.get('tr_cont_key') or ''
    seen = set(); out = []
    for x in rows:
        k = (x['date'], x['time'])
        if k in seen: continue
        seen.add(k)
        out.append({'d': x['date'], 't': x['time'], 'o': float(x['open']), 'h': float(x['high']), 'l': float(x['low']), 'c': float(x['close']), 'v': float(x.get('jdiff_vol') or 0)})
    out.sort(key=lambda z: (z['d'], z['t']))
    if not more:   # 상장 이후 전부 받음 → 첫 체결 전 봉 제외
        i = 0
        while i < len(out) and out[i]['v'] <= 0: i += 1
        out = out[i:]
    return out, more

def study(code, ncnt, pages, ref):
    b, more = fetch(code, ncnt, pages)
    n = len(b)
    if n < 30: return {'code': code, 'ncnt': ncnt, 'bars': n, 'error': '봉 부족'}
    dr, rk, tn = cross_events(b)
    days = len(set(x['d'] for x in b))
    bpd = n / days                                   # 하루 평균 봉 수
    cross_rate = (len(dr) + len(rk)) / n             # 봉당 교차점
    turn_rate = len(tn) / n
    bars_c = ref['cross'] / cross_rate if cross_rate > 0 else None   # 주식 한 달 교차점 수에 걸리는 봉 수
    bars_t = ref['turns'] / turn_rate if turn_rate > 0 else None
    rng = win_range(b, bars_c) if bars_c else None
    res = {'code': code, 'ncnt': ncnt, 'bars': n, 'days': days, 'from': b[0]['d'] + ' ' + b[0]['t'][:4], 'to': b[-1]['d'] + ' ' + b[-1]['t'][:4],
           'all_history': not more, 'cross': [len(dr), len(rk)], 'turns': len(tn),
           'min_cross': round(bars_c * ncnt, 1) if bars_c else None, 'min_turns': round(bars_t * ncnt, 1) if bars_t else None,
           'days_cross': round(bars_c / bpd, 2) if bars_c else None, 'range_med': round(rng, 5) if rng else None, 'cand': {}}
    cc = [x['c'] for x in b]
    if rng:
        for k in (0.10, 0.20, 0.30):
            thr = k / ref['range'] * rng
            pv = pivots(cc, thr)[1:]                 # 0번(데이터 시작) 제외
            gaps = [(pv[i] - pv[i - 1]) * ncnt / 60 for i in range(1, len(pv))]
            res['cand'][str(int(k * 100))] = {'thr_pct': round(thr * 100, 3), 'pivots': len(pv),
                'avg_gap_h': round(sum(gaps) / len(gaps), 2) if gaps else None,
                'last2': [b[i]['d'][4:] + ' ' + b[i]['t'][:2] + ':' + b[i]['t'][2:4] for i in pv[-2:]]}
    # 위험선 확인: 엔진 그대로(build_drawings fo) + 현재가 기준 필터 단계별
    eng = A.build_drawings(b, fo=True); cur = b[-1]['c']
    res['risk'] = {'engine_all_risks': len(eng.get('all_risks', [])), 'geom': len(rk),
                   'below_cur': sum(1 for _, y in rk if y < cur),
                   'below_cur_and_ge30pct': sum(1 for _, y in rk if y < cur and y >= cur * 0.3),
                   'cur': cur, 'risk_yc_sample': [round(y, 3) for _, y in rk[-6:]]}
    return res

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            uid, u, _ = _auth.access(self.headers)
            if not (u and u.get('role') == 'admin'): return _auth.send_json(self, 403, {'error': 'forbidden'})
            q = _auth.read_json(self)
            code = str(q.get('code') or ''); ncnt = int(q.get('ncnt') or 0); pages = max(1, min(4, int(q.get('pages') or 1)))
            if ncnt not in (3, 5, 10) or not code: return _auth.send_json(self, 400, {'error': 'bad'})
            _auth.send_json(self, 200, study(code, ncnt, pages, q['ref']))
        except Exception as e:
            _auth.send_json(self, 500, {'error': 'server', 'detail': str(e)[:300]})
