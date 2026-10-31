# ============================================================
#  인증번호 확인 — POST /api/auth_verify  {phone, code}
#  일치 → Firebase 커스텀 토큰 발급 (uid = 휴대폰번호). 첫 로그인이면 users/{uid} 생성
# ============================================================
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
from firebase_admin import firestore
import _auth
from auth_send import code_hash, PHONE_RE

MAX_TRIES=5   # 5회 틀리면 인증번호 무효

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            b=_auth.read_json(self)
            phone=str(b.get('phone') or '').strip(); code=str(b.get('code') or '').strip()
            if not PHONE_RE.match(phone): return _auth.send_json(self,400,{'error':'format'})
            db=_auth.db(); ref=db.collection('otp').document(phone); s=ref.get()
            if not s.exists: return _auth.send_json(self,400,{'error':'expired'})
            o=s.to_dict()
            if o['exp']<=_auth.now() or o.get('tries',0)>=MAX_TRIES:
                ref.delete(); return _auth.send_json(self,400,{'error':'expired'})
            if code_hash(phone,code)!=o['hash']:
                if o.get('tries',0)+1>=MAX_TRIES: ref.delete()
                else: ref.update({'tries':firestore.Increment(1)})
                return _auth.send_json(self,400,{'error':'mismatch'})
            ref.delete()
            uref=db.collection('users').document(phone)
            is_new=not uref.get().exists
            if is_new:
                uref.set({'phone':phone,'approved':False,'expiresAt':None,'createdAt':firestore.SERVER_TIMESTAMP})
            uref.set({'lastLoginAt':firestore.SERVER_TIMESTAMP},merge=True)
            _auth.send_json(self,200,{'token':_auth.custom_token(phone),'isNew':is_new})
        except Exception:
            _auth.send_json(self,500,{'error':'server'})
