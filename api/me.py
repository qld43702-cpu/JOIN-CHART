# ============================================================
#  내 이용 상태 — GET /api/me  (Authorization: Bearer <ID 토큰>)
#  → {status: login/pending/active/expired/suspended, role, phone, email, until(MM.DD), isNew}
#  이메일 링크 회원(영어 화면): 서버를 거치지 않고 로그인되므로 첫 호출 때 users/{uid} 를 만든다.
#    토큰에 확인된 이메일(email_verified)이 있을 때만. 구조는 휴대폰 회원과 같다(approved:false → 관리자 승인).
#  GET /api/me?login=1 : 방금 이메일 링크로 로그인했을 때 — lastLoginAt 기록
# ============================================================
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from firebase_admin import firestore
import _auth

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            c=_auth.claims_from(self.headers)
            if not c:
                return _auth.send_json(self,200,{'status':'login','role':None,'phone':None,'until':''})
            uid=c['uid']; u=_auth.get_user(uid); is_new=False
            email=c.get('email') if c.get('email_verified') else None
            if email:
                ref=_auth.db().collection('users').document(uid)
                if u is None:
                    ref.set({'email':email,'approved':False,'expiresAt':None,'createdAt':firestore.SERVER_TIMESTAMP,
                             'lastLoginAt':firestore.SERVER_TIMESTAMP})
                    is_new=True; u=_auth.get_user(uid)
                elif parse_qs(urlparse(self.path).query).get('login'):
                    ref.set({'lastLoginAt':firestore.SERVER_TIMESTAMP},merge=True)
            st='active' if (u and u.get('role')=='admin') else _auth.status_of(u)   # 관리자는 항상 통과 (_auth.access 와 같음)
            u=u or {}
            _auth.send_json(self,200,{'status':st,'role':u.get('role'),'phone':u.get('phone') or uid,'email':u.get('email'),
                'until':_auth.kst(u.get('expiresAt'),"%m.%d"),'isNew':is_new})
        except Exception:
            _auth.send_json(self,500,{'error':'server'})
