# ============================================================
#  [임시] 선물옵션 TR 조사용 — 조사 끝나면 삭제
#  POST /api/probe {tr, body, cont}   관리자(role=admin)만
#  허용 TR: t8467, t8433, t2301, t2111, t8415
# ============================================================
import os, sys, json, time, requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
import _auth
import urllib3
urllib3.disable_warnings()

BASE="https://openapi.ls-sec.co.kr:8080"
ALLOW={"t8467":"/futureoption/market-data","t8433":"/futureoption/market-data",
       "t2301":"/futureoption/market-data","t2111":"/futureoption/market-data",
       "t8415":"/futureoption/chart"}

_token_cache={"tk":None,"exp":0}
def token():
    now=time.time()
    if _token_cache["tk"] and now < _token_cache["exp"]:
        return _token_cache["tk"]
    key=os.environ.get("LS_APP_KEY","").strip()
    secret=os.environ.get("LS_APP_SECRET","").strip()
    if not key or not secret:
        raise RuntimeError("환경변수 미설정 (LS_APP_KEY/LS_APP_SECRET)")
    r=requests.post(f"{BASE}/oauth2/token",verify=False,timeout=8,
        headers={"Content-Type":"application/x-www-form-urlencoded"},
        params={"grant_type":"client_credentials","appkey":key,"appsecretkey":secret,"scope":"oob"})
    j=r.json()
    if "access_token" not in j:
        raise RuntimeError("토큰 발급 실패: "+str(j.get("error_description") or j.get("error") or ""))
    _token_cache["tk"]=j["access_token"]
    _token_cache["exp"]=now + 23*3600
    return _token_cache["tk"]

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            uid,u,_=_auth.access(self.headers)
            if not (u and u.get('role')=='admin'): return _auth.send_json(self,403,{'error':'forbidden'})
            b=_auth.read_json(self); tr=str(b.get('tr') or '')
            if tr not in ALLOW: return _auth.send_json(self,400,{'error':'tr_not_allowed'})
            body=b.get('body') or {}
            cont='Y' if b.get('cont')=='Y' else 'N'
            ckey=str(b.get('cont_key') or '')
            hd={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {token()}",
                "tr_cd":tr,"tr_cont":cont}
            if ckey: hd["tr_cont_key"]=ckey
            r=requests.post(f"{BASE}{ALLOW[tr]}",verify=False,timeout=20,headers=hd,json={f"{tr}InBlock":body})
            try: j=r.json()
            except Exception: j={'_raw':r.text[:2000]}
            _auth.send_json(self,200,{'_http':r.status_code,'_tr_cont':r.headers.get('tr_cont'),
                '_tr_cont_key':r.headers.get('tr_cont_key'),'resp':j})
        except Exception as e:
            _auth.send_json(self,500,{'error':'server','detail':str(e)[:300]})
