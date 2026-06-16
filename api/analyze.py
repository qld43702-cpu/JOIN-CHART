# ============================================================
#  종목 작도 표시 API — 일봉 + 60분 두 트랙, 작도 다수
#  GET /api/analyze?code=090360
#  현재 시점 데이터로 작도(다수 교차점/녹색선/수평선) 다 표시
# ============================================================
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import os, json, requests

BASE="https://openapi.ls-sec.co.kr:8080"

def token():
    key=os.environ.get("LS_APP_KEY","").strip()
    secret=os.environ.get("LS_APP_SECRET","").strip()
    if not key or not secret:
        raise RuntimeError("환경변수 미설정 (LS_APP_KEY/LS_APP_SECRET)")
    r=requests.post(f"{BASE}/oauth2/token",verify=False,
        headers={"Content-Type":"application/x-www-form-urlencoded"},
        params={"grant_type":"client_credentials","appkey":key,"appsecretkey":secret,"scope":"oob"})
    j=r.json()
    if "access_token" not in j:
        raise RuntimeError("토큰 발급 실패: "+str(j.get("error_description") or j.get("error") or j))
    return j["access_token"]

def get_day(tk,code):
    r=requests.post(f"{BASE}/stock/chart",verify=False,
        headers={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {tk}","tr_cd":"t8410","tr_cont":"N"},
        json={"t8410InBlock":{"shcode":code,"gubun":"2","qrycnt":150,"sdate":"20240101","edate":"20991231","cts_date":"","comp_yn":"N","sujung":"Y"}})
    rows=r.json().get("t8410OutBlock1",[])
    if not rows: return None
    out=[{'d':x['date'],'o':float(x['open']),'h':float(x['high']),'l':float(x['low']),'c':float(x['close'])} for x in rows]
    out.sort(key=lambda z:z['d']); return out

def get_60m(tk,code):
    rows=[]; cd=""; ct=""
    for _ in range(2):
        r=requests.post(f"{BASE}/stock/chart",verify=False,
            headers={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {tk}","tr_cd":"t8412","tr_cont":"N" if cd=="" else "Y"},
            json={"t8412InBlock":{"shcode":code,"ncnt":60,"qrycnt":500,"nday":"0","sdate":"20250101","edate":"20991231","cts_date":cd,"cts_time":ct,"comp_yn":"N"}})
        j=r.json(); rr=j.get("t8412OutBlock1",[])
        if not rr: break
        rows.extend(rr)
        ob=j.get("t8412OutBlock",{}); nd=ob.get("cts_date","").strip(); nt=ob.get("cts_time","").strip()
        if (nd==cd and nt==ct) or nd=="": break
        cd,ct=nd,nt
    if not rows: return None
    seen=set(); out=[]
    for x in rows:
        k=(x['date'],x['time'])
        if k in seen: continue
        seen.add(k)
        out.append({'d':x['date'],'t':x['time'],'o':float(x['open']),'h':float(x['high']),'l':float(x['low']),'c':float(x['close'])})
    out.sort(key=lambda z:(z['d'],z['t'])); return out

def get_name(tk,code):
    try:
        r=requests.post(f"{BASE}/stock/market-data",verify=False,
            headers={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {tk}","tr_cd":"t1102","tr_cont":"N"},
            json={"t1102InBlock":{"shcode":code}})
        b=r.json().get("t1102OutBlock",{})
        return b.get("hname","").strip(), ("코스닥" if b.get("gubun","")=="2" else "코스피")
    except: return "", ""

def ma(a,w):
    o=[None]*len(a)
    for i in range(w-1,len(a)): o[i]=sum(a[i-w+1:i+1])/w
    return o
def turns(v,w=2):
    t=[]
    for i in range(w,len(v)-w):
        if v[i] is None: continue
        seg=[x for x in v[i-w:i+w+1] if x is not None]
        if not seg: continue
        if v[i]==max(seg) or v[i]==min(seg): t.append(i)
    return t
def last_down_slope(MA2,t0,t1):
    if t1-t0<=1: return (MA2[t1]-MA2[t0])/max(1,t1-t0)
    return MA2[t1]-MA2[t1-1]

def build_drawings(bars):
    """작도 다수: 모든 하락-상승-하락(상승파동1개) 작도. 교차점/녹색선 다."""
    c=[b['c'] for b in bars]
    MA2=ma(c,2)
    tn=turns(MA2,2)
    segs=[]
    for i in range(len(tn)-1):
        a,b=tn[i],tn[i+1]
        if b==a or MA2[a] is None or MA2[b] is None: continue
        segs.append({'t0':a,'t1':b,'up':MA2[b]>MA2[a]})
    # 하락 인덱스
    draws=[]
    for i in range(len(segs)-2):
        A,M,B=segs[i],segs[i+1],segs[i+2]
        if A['up'] or not M['up'] or B['up']: continue  # 하락-상승-하락
        sa=last_down_slope(MA2,A['t0'],A['t1'])
        sb=last_down_slope(MA2,B['t0'],B['t1'])
        if sa>=0 or sb>=0 or sb<=sa: continue  # B 완만
        ya1=MA2[A['t1']]; ta1=A['t1']; yb1=MA2[B['t1']]; tb1=B['t1']
        denom=sa-sb
        if abs(denom)<1e-9: continue
        xc=(yb1-ya1-sb*tb1+sa*ta1)/denom
        yc=ya1+sa*(xc-ta1)
        if xc>=min(ta1,tb1) or xc<0: continue
        # 상승파동 M 두 갈래 (변곡점)
        mt0,mt1=M['t0'],M['t1']
        m_slope=(MA2[mt1]-MA2[mt0])/(mt1-mt0) if mt1>mt0 else 0
        mk=None; s1=s2=None
        if mt1-mt0>=4:
            diffs=[abs((MA2[j+1]-MA2[j])-(MA2[j]-MA2[j-1])) for j in range(mt0+1,mt1)]
            if len(diffs)>=1:
                kidx=max(range(len(diffs)),key=lambda k:diffs[k])
                mk=mt0+1+kidx
                s1=(MA2[mk]-MA2[mt0])/(mk-mt0) if mk>mt0 else 0
                s2=(MA2[mt1]-MA2[mk])/(mt1-mk) if mt1>mk else 0
        entry=B['t1']+1
        ep=bars[entry]['o'] if entry<len(bars) else c[-1]
        draws.append({
            'A_t1':A['t1'],'A_y1':round(MA2[A['t1']],1),'A_slope':round(sa,2),
            'B_t1':B['t1'],'B_y1':round(MA2[B['t1']],1),'B_slope':round(sb,2),
            'xc':round(xc,2),'yc':round(yc,1),
            'M_t0':mt0,'M_y0':round(MA2[mt0],1),'M_t1':mt1,'M_y1':round(MA2[mt1],1),
            'M_slope':round(m_slope,2),'M_k':mk,
            'M_s1':round(s1,2) if s1 is not None else None,'M_s2':round(s2,2) if s2 is not None else None,
            'M_ky':round(MA2[mk],1) if mk is not None else None,
            'entry':entry,'ep':round(ep,1),
            'alive': yc>ep  # 교차점이 매수가보다 위 = 살아있는 작도
        })
    # 차트 데이터(2일선 포함)
    chart=[{'i':i,'d':(bars[i].get('d','')[4:6]+'/'+bars[i].get('d','')[6:8]+(' '+str(bars[i]['t']).zfill(6)[:2]+'시' if 't' in bars[i] else '')),
            'o':int(bars[i]['o']),'h':int(bars[i]['h']),'l':int(bars[i]['l']),'c':int(bars[i]['c']),
            'm2':round(MA2[i],1) if MA2[i] is not None else None} for i in range(len(bars))]
    return {'chart':chart,'draws':draws,'cur':int(c[-1])}

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs=parse_qs(urlparse(self.path).query); code=(qs.get('code',[''])[0] or '').strip()
        self.send_response(200)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin','*'); self.end_headers()
        try:
            if not code.isdigit() or len(code)!=6:
                self.wfile.write(json.dumps({'error':'종목코드 6자리'}).encode()); return
            tk=token(); nm,mk=get_name(tk,code)
            day=get_day(tk,code); m60=get_60m(tk,code)
            out={'종목코드':code,'종목명':nm,'시장':mk,
                 '일봉': build_drawings(day) if day and len(day)>30 else {'error':'데이터 부족'},
                 '60분': build_drawings(m60) if m60 and len(m60)>30 else {'error':'데이터 부족'}}
            self.wfile.write(json.dumps(out,ensure_ascii=False).encode())
        except Exception as ex:
            self.wfile.write(json.dumps({'error':'분석 실패: '+str(ex)}).encode())
