# ============================================================
#  로그인·이용권한 공통 모듈 (api/ 안의 _ 파일 = Vercel 엔드포인트 아님)
#  환경변수: FIREBASE_SERVICE_ACCOUNT_JSON (서비스계정 JSON 전체)
# ============================================================
import os, json, datetime as _dt
import firebase_admin
from firebase_admin import credentials, auth as fb_auth, firestore

_UTC=_dt.timezone.utc
_KST=_dt.timezone(_dt.timedelta(hours=9))
def now(): return _dt.datetime.now(_UTC)

def _app():
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(os.environ['FIREBASE_SERVICE_ACCOUNT_JSON'])))

def db():
    _app(); return firestore.client()

def custom_token(uid):
    _app(); t=fb_auth.create_custom_token(uid)
    return t.decode() if isinstance(t,bytes) else t

def uid_from(headers):
    """Authorization: Bearer <Firebase ID 토큰> → uid. 없거나 무효면 None"""
    h=headers.get('Authorization') or ''
    if not h.startswith('Bearer '): return None
    _app()
    try: return fb_auth.verify_id_token(h[7:].strip())['uid']
    except Exception: return None

def get_user(uid):
    s=db().collection('users').document(uid).get()
    return s.to_dict() if s.exists else None

def status_of(u):
    """pending(대기) / active(이용중) / expired(만료) / suspended(정지)"""
    if not u: return 'pending'
    if u.get('suspended'): return 'suspended'
    if not u.get('approved'): return 'pending'
    exp=u.get('expiresAt')
    if not exp or exp<=now(): return 'expired'
    return 'active'

def access(headers):
    """(uid, users 문서, 상태). 로그인 안 됨/토큰 무효 → (None, None, 'login')"""
    uid=uid_from(headers)
    if not uid: return None,None,'login'
    u=get_user(uid)
    if u and u.get('role')=='admin': return uid,u,'active'   # 관리자는 approved·expiresAt·suspended 무관 항상 통과
    return uid,u,status_of(u)

def kst(ts, fmt="%Y-%m-%d"):
    return ts.astimezone(_KST).strftime(fmt) if ts else ''

def send_json(h, code, obj):
    h.send_response(code)
    h.send_header('Content-Type','application/json; charset=utf-8'); h.end_headers()
    h.wfile.write(json.dumps(obj,ensure_ascii=False).encode())

def read_json(h):
    n=int(h.headers.get('Content-Length') or 0)
    try: return json.loads(h.rfile.read(n) or b'{}')
    except Exception: return {}
