# ============================================================
#  [임시] t8434 응답 확인 · 월요일 만기 전광판 확인용 — 확인 끝나면 삭제
#  POST /api/probe {tr:'t8434', body}  → LS 응답 그대로
#  POST /api/probe {mode:'monday'}     → api/fo.py의 월요일 만기 전광판 함수 결과
#  관리자(role=admin)만
# ============================================================
import os, sys, json, requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
import _auth
import analyze as A

BASE = "https://openapi.ls-sec.co.kr:8080"

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            uid, u, _ = _auth.access(self.headers)
            if not (u and u.get('role') == 'admin'): return _auth.send_json(self, 403, {'error': 'forbidden'})
            q = _auth.read_json(self)
            if q.get('mode') == 'monday':
                import fo
                return _auth.send_json(self, 200, fo.probe_monday())
            if q.get('tr') != 't8434': return _auth.send_json(self, 400, {'error': 'tr_not_allowed'})
            hd = {"Content-Type": "application/json; charset=UTF-8", "authorization": f"Bearer {A.token()}", "tr_cd": "t8434", "tr_cont": "N"}
            r = requests.post(f"{BASE}/futureoption/market-data", verify=False, timeout=20, headers=hd, json={"t8434InBlock": q.get('body') or {}})
            try: j = r.json()
            except Exception: j = {'_raw': r.text[:2000]}
            _auth.send_json(self, 200, {'_http': r.status_code, 'resp': j})
        except Exception as e:
            _auth.send_json(self, 500, {'error': 'server', 'detail': str(e)[:300]})
