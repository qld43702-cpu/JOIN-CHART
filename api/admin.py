# ============================================================
#  회원 관리 — 관리자(users/{uid}.role == "admin") 전용
#  GET  /api/admin                       → 가입자 목록
#  POST /api/admin {uid, action}          action: approve(승인 30일) / extend(연장 +30일) / suspend(정지)
# ============================================================
import os, sys, datetime as _dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
import _auth

DAYS=_dt.timedelta(days=30)

def is_admin(headers):
    uid,u,_=_auth.access(headers)
    return bool(u) and u.get('role')=='admin'

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            if not is_admin(self.headers): return _auth.send_json(self,403,{'error':'forbidden'})
            rows=[]
            for s in _auth.db().collection('users').stream():
                u=s.to_dict()
                rows.append({'uid':s.id,'phone':u.get('phone') or s.id,'status':_auth.status_of(u),
                    'createdAt':_auth.kst(u.get('createdAt')),'expiresAt':_auth.kst(u.get('expiresAt')),
                    'lastLoginAt':_auth.kst(u.get('lastLoginAt'),"%Y-%m-%d %H:%M"),'_c':u.get('createdAt')})
            rows.sort(key=lambda r:r['_c'] or _auth.now(),reverse=True)
            for r in rows: r.pop('_c')
            _auth.send_json(self,200,{'users':rows})
        except Exception:
            _auth.send_json(self,500,{'error':'server'})

    def do_POST(self):
        try:
            if not is_admin(self.headers): return _auth.send_json(self,403,{'error':'forbidden'})
            b=_auth.read_json(self); uid=str(b.get('uid') or ''); action=b.get('action')
            ref=_auth.db().collection('users').document(uid); s=ref.get()
            if not uid or not s.exists: return _auth.send_json(self,404,{'error':'not_found'})
            n=_auth.now()
            if action=='approve':
                ref.update({'approved':True,'expiresAt':n+DAYS})
            elif action=='extend':
                exp=s.to_dict().get('expiresAt')
                # 만료 전이면 기존 만료일 +30일, 이미 만료됐으면 오늘 +30일
                ref.update({'expiresAt':(exp if exp and exp>n else n)+DAYS})
            elif action=='suspend':
                ref.update({'suspended':True})
            else:
                return _auth.send_json(self,400,{'error':'action'})
            _auth.send_json(self,200,{'ok':True})
        except Exception:
            _auth.send_json(self,500,{'error':'server'})
