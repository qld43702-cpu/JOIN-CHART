# ============================================================
#  내 이용 상태 — GET /api/me  (Authorization: Bearer <ID 토큰>)
#  → {status: login/pending/active/expired/suspended, role}
# ============================================================
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
import _auth

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            uid,u,st=_auth.access(self.headers)
            _auth.send_json(self,200,{'status':st,'role':(u or {}).get('role')})
        except Exception:
            _auth.send_json(self,500,{'error':'server'})
