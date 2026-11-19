# ============================================================
#  [임시] 월요일 만기 위클리 t2301 호출 확인용 — 확인 끝나면 삭제
#  POST /api/probe {tr, body}   관리자(role=admin)만, 허용 TR: t2301
# ============================================================
import os, sys, json, time, requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from http.server import BaseHTTPRequestHandler
import _auth
import analyze as A

BASE="https://openapi.ls-sec.co.kr:8080"
ALLOW={"t2301":"/futureoption/market-data"}

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            uid,u,_=_auth.access(self.headers)
            if not (u and u.get('role')=='admin'): return _auth.send_json(self,403,{'error':'forbidden'})
            b=_auth.read_json(self); tr=str(b.get('tr') or '')
            if tr not in ALLOW: return _auth.send_json(self,400,{'error':'tr_not_allowed'})
            hd={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {A.token()}","tr_cd":tr,"tr_cont":"N"}
            r=requests.post(f"{BASE}{ALLOW[tr]}",verify=False,timeout=20,headers=hd,json={f"{tr}InBlock":b.get('body') or {}})
            try: j=r.json()
            except Exception: j={'_raw':r.text[:2000]}
            _auth.send_json(self,200,{'_http':r.status_code,'resp':j})
        except Exception as e:
            _auth.send_json(self,500,{'error':'server','detail':str(e)[:300]})
