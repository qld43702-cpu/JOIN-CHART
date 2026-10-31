# ============================================================
#  인증번호 발송 — POST /api/auth_send  {phone}
#  솔라피 알림톡(실패 시 SMS 대체발송). 인증번호는 Firestore otp/{phone}에 해시로 3분 보관
#  환경변수: SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID, SOLAPI_AUTH_TEMPLATE_ID, SOLAPI_SENDER
# ============================================================
import os, sys, re, hmac, hashlib, secrets, datetime as _dt, requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
import _auth

OTP_TTL=180   # 인증번호 유효 3분
RESEND=60     # 같은 번호 재요청 간격 60초
PHONE_RE=re.compile(r'^010\d{8}$')

def code_hash(phone, code): return hashlib.sha256((phone+':'+code).encode()).hexdigest()

def solapi_send(phone, code):
    key=os.environ['SOLAPI_API_KEY']; sec=os.environ['SOLAPI_API_SECRET']
    date=_dt.datetime.now(_dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'); salt=secrets.token_hex(16)
    sig=hmac.new(sec.encode(),(date+salt).encode(),hashlib.sha256).hexdigest()
    msg={'to':phone,'from':os.environ['SOLAPI_SENDER'],
         'kakaoOptions':{'pfId':os.environ['SOLAPI_PFID'],'templateId':os.environ['SOLAPI_AUTH_TEMPLATE_ID'],
                         'variables':{'#{인증번호}':code},
                         'disableSms':False}}   # 알림톡 실패 시 SMS 대체발송
    r=requests.post('https://api.solapi.com/messages/v4/send-many/detail',timeout=10,json={'messages':[msg]},
        headers={'Authorization':f'HMAC-SHA256 apiKey={key}, date={date}, salt={salt}, signature={sig}'})
    if r.status_code!=200: return False
    return not (r.json().get('failedMessageList') or [])

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            phone=str(_auth.read_json(self).get('phone') or '').strip()
            if not PHONE_RE.match(phone): return _auth.send_json(self,400,{'error':'format'})
            ref=_auth.db().collection('otp').document(phone)
            old=ref.get()
            if old.exists:
                sent=old.to_dict().get('sentAt')
                if sent and (_auth.now()-sent).total_seconds()<RESEND:
                    return _auth.send_json(self,429,{'error':'too_fast'})
            code=str(secrets.randbelow(1000000)).zfill(6)
            if not solapi_send(phone,code): return _auth.send_json(self,502,{'error':'send_fail'})
            n=_auth.now()
            ref.set({'hash':code_hash(phone,code),'sentAt':n,'exp':n+_dt.timedelta(seconds=OTP_TTL),'tries':0})
            _auth.send_json(self,200,{'ok':True})
        except Exception:
            _auth.send_json(self,500,{'error':'send_fail'})
