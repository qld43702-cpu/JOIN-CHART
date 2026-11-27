# ============================================================
#  회원 관리 — 관리자(users/{uid}.role == "admin") 전용
#  GET  /api/admin                       → 가입자 목록
#  POST /api/admin {uid, action}          action: approve(승인 30일) / extend(연장 +30일) / suspend(정지) / unsuspend(해제)
#  POST /api/admin {uid, action:'memo', memo}   회원 메모 저장 (입금자명 등)
#  처리 기록: 승인하면 approvedAt, 연장하면 extendedAt 을 회원 문서에 남긴다.
# ============================================================
import os, sys, re, datetime as _dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
import _auth

DAYS=_dt.timedelta(days=30)
MEMO_MAX=200

def is_admin(headers):
    uid,u,_=_auth.access(headers)
    return bool(u) and u.get('role')=='admin'

def _ts(t):
    """정렬용 시각(초). 없으면 None"""
    try: return int(t.timestamp()) if t else None
    except Exception: return None

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            if not is_admin(self.headers): return _auth.send_json(self,403,{'error':'forbidden'})
            rows=[]; n=_auth.now(); today=n.astimezone(_auth._KST).date()
            for s in _auth.db().collection('users').stream():
                u=s.to_dict(); exp=u.get('expiresAt')
                # 가입 방식: 휴대폰(문서에 phone, 또는 문서 키가 휴대폰번호) / 이메일(영어 화면 이메일 링크 회원)
                if u.get('phone') or re.match(r'^010\d{8}$', s.id): method='phone'
                elif u.get('email'): method='email'
                else: method=''
                rows.append({'uid':s.id,'phone':u.get('phone') or u.get('email') or s.id,'method':method,
                    'status':_auth.status_of(u),
                    'createdAt':_auth.kst(u.get('createdAt')),'expiresAt':_auth.kst(exp),
                    'lastLoginAt':_auth.kst(u.get('lastLoginAt'),"%Y-%m-%d %H:%M"),
                    'approvedAt':_auth.kst(u.get('approvedAt')),'extendedAt':_auth.kst(u.get('extendedAt')),
                    'memo':str(u.get('memo') or ''),
                    # 남은 일수(한국 날짜 기준): 만료일 − 오늘. 만료일이 없으면 None
                    'daysLeft':((exp.astimezone(_auth._KST).date()-today).days if exp else None),
                    # 지금 연장하면 되는 만료일 (아래 extend 와 같은 계산): 만료 전이면 기존 만료일 +30일, 지났으면 오늘 +30일
                    'extendTo':_auth.kst((exp if exp and exp>n else n)+DAYS),
                    'createdTs':_ts(u.get('createdAt')),'expiresTs':_ts(exp),'lastLoginTs':_ts(u.get('lastLoginAt')),
                    '_c':u.get('createdAt')})
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
                ref.update({'approved':True,'expiresAt':n+DAYS,'approvedAt':n})
            elif action=='extend':
                exp=s.to_dict().get('expiresAt')
                # 만료 전이면 기존 만료일 +30일, 이미 만료됐으면 오늘 +30일
                ref.update({'expiresAt':(exp if exp and exp>n else n)+DAYS,'extendedAt':n})
            elif action=='suspend':
                ref.update({'suspended':True})
            elif action=='unsuspend':
                ref.update({'suspended':False})   # 해제 → 원래 상태(대기/이용중/만료)로
            elif action=='memo':
                ref.update({'memo':str(b.get('memo') or '')[:MEMO_MAX]})
            else:
                return _auth.send_json(self,400,{'error':'action'})
            _auth.send_json(self,200,{'ok':True})
        except Exception:
            _auth.send_json(self,500,{'error':'server'})
