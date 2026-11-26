# ============================================================
#  [임시] 백테스트 11차용 — 선물 분봉(t8465) 연속조회로 받기. 받은 뒤 삭제
#  POST /api/probe {code, ncnt, pages, cts_date, cts_time, cont_key}
#    → {rows:[[date,time,open,high,low,close,jdiff_vol],...], cts_date, cts_time, cont_key, more}
#  관리자(role=admin)만. t8465 만 호출한다.
# ============================================================
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
import _auth
import fo

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            uid, u, _ = _auth.access(self.headers)
            if not (u and u.get('role') == 'admin'): return _auth.send_json(self, 403, {'error': 'forbidden'})
            q = _auth.read_json(self)
            code = str(q.get('code') or '').strip().upper()[:12]
            ncnt = int(q.get('ncnt') or 0)
            if not code or ncnt not in (5, 30, 60): return _auth.send_json(self, 400, {'error': 'bad_request'})
            pages = max(1, min(4, int(q.get('pages') or 1)))
            cd = str(q.get('cts_date') or ''); ct = str(q.get('cts_time') or ''); ck = str(q.get('cont_key') or '')
            cont = 'Y' if cd else 'N'; rows = []; more = False
            for _i in range(pages):
                j, h = fo.ls('t8465', fo.CH, {'shcode': code, 'ncnt': ncnt, 'qrycnt': 500, 'nday': '0', 'sdate': '', 'stime': '',
                                             'edate': '99999999', 'etime': '', 'cts_date': cd, 'cts_time': ct, 'comp_yn': 'N'}, cont, ck)
                rr = j.get('t8465OutBlock1') or []
                rows += [[x.get('date'), x.get('time'), x.get('open'), x.get('high'), x.get('low'), x.get('close'), x.get('jdiff_vol')] for x in rr]
                ob = j.get('t8465OutBlock') or {}
                more = (h.get('tr_cont') == 'Y') and bool(rr)
                nd, nt = (ob.get('cts_date') or '').strip(), (ob.get('cts_time') or '').strip()
                if not more or not nd or (nd == cd and nt == ct): more = False; break
                cd, ct, cont, ck = nd, nt, 'Y', h.get('tr_cont_key') or ''
            _auth.send_json(self, 200, {'rows': rows, 'cts_date': cd, 'cts_time': ct, 'cont_key': ck, 'more': more})
        except fo.LSError as e:
            _auth.send_json(self, 200, {'error': 'ls', 'detail': str(e)[:200]})
        except Exception as e:
            _auth.send_json(self, 500, {'error': 'server', 'detail': str(e)[:200]})
