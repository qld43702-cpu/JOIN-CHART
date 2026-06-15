# ============================================================
#  Vercel 서버리스 함수 — 한 종목 일봉 + 60분 두 트랙 실시간 분석
#  GET /api/analyze?code=090360
#  키: Vercel 환경변수 LS_APP_KEY / LS_APP_SECRET
# ============================================================
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import os, json, requests

BASE="https://openapi.ls-sec.co.kr:8080"

def token():
    r=requests.post(f"{BASE}/oauth2/token",verify=False,
        headers={"Content-Type":"application/x-www-form-urlencoded"},
        params={"grant_type":"client_credentials","appkey":os.environ["LS_APP_KEY"],
                "appsecretkey":os.environ["LS_APP_SECRET"],"scope":"oob"})
    return r.json()["access_token"]

def get_day(tk,code):
    r=requests.post(f"{BASE}/stock/chart",verify=False,
        headers={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {tk}","tr_cd":"t8410","tr_cont":"N"},
        json={"t8410InBlock":{"shcode":code,"gubun":"2","qrycnt":200,"sdate":"20240101","edate":"20991231","cts_date":"","comp_yn":"N","sujung":"Y"}})
    rows=r.json().get("t8410OutBlock1",[])
    if not rows: return None
    out=[{'날짜':x['date'],'시가':float(x['open']),'고가':float(x['high']),'저가':float(x['low']),
          '종가':float(x['close']),'거래량':float(x['jdiff_vol'])} for x in rows]
    out.sort(key=lambda z:z['날짜']); return out

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
    out=[{'날짜':x['date'],'시간':x['time'],'시가':float(x['open']),'고가':float(x['high']),'저가':float(x['low']),
          '종가':float(x['close']),'거래량':float(x['jdiff_vol'])} for x in rows]
    seen=set(); uniq=[]
    for x in out:
        k=(x['날짜'],x['시간'])
        if k in seen: continue
        seen.add(k); uniq.append(x)
    uniq.sort(key=lambda z:(z['날짜'],z['시간'])); return uniq

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
def ema(a,s):
    k=2/(s+1); o=[a[0]]
    for i in range(1,len(a)): o.append(a[i]*k+o[-1]*(1-k))
    return o
def turns(v,w=2):
    t=[]
    for i in range(w,len(v)-w):
        if v[i] is None: continue
        seg=[x for x in v[i-w:i+w+1] if x is not None]
        if not seg: continue
        if v[i]==max(seg) or v[i]==min(seg): t.append(i)
    return t
def segs_of(MA2):
    tn=turns(MA2,2); sg=[]
    for i in range(len(tn)-1):
        a,b=tn[i],tn[i+1]
        if b==a or MA2[a] is None or MA2[b] is None: continue
        sg.append({'t0':a,'t1':b,'y0':MA2[a],'y1':MA2[b],'slope':(MA2[b]-MA2[a])/(b-a)})
    return sg

def chart_draw(d,A,B,sa,xc,yc,up_slope,entry,last,labelfn,close,openp,high,low,MA2,MA5):
    start=max(0,A['t0']-5); ch=[]
    for k in range(start,last+1):
        ch.append({'d':labelfn(d,k),'o':int(openp[k]),'h':int(high[k]),'l':int(low[k]),'c':int(close[k]),
                   'm2':round(MA2[k],1) if MA2[k] else None,'m5':round(MA5[k],1) if MA5[k] else None})
    def r(i): return i-start
    dr={'A_x0':r(A['t0']),'A_y0':A['y0'],'A_x1':r(A['t1']),'A_y1':A['y1'],
        'B_x0':r(B['t0']),'B_y0':B['y0'],'B_x1':r(B['t1']),'B_y1':B['y1'],
        'xc':xc-start,'yc':yc,'up_x0':r(A['t1']),'up_y0':MA2[A['t1']],'up_slope':up_slope,'entry_x':r(entry)}
    return ch,dr

def analyze_day(d):
    if not d or len(d)<80: return {'있음':False,'사유':'데이터 부족'}
    close=[x['종가'] for x in d];openp=[x['시가'] for x in d];high=[x['고가'] for x in d];low=[x['저가'] for x in d]
    MA2=ma(close,2);MA5=ma(close,5);MA20=ma(close,20)
    e12=ema(close,12);e26=ema(close,26);macd=[e12[i]-e26[i] for i in range(len(close))]
    sig=ema(macd,9);MACDh=[macd[i]-sig[i] for i in range(len(close))]
    last=len(d)-1; sg=segs_of(MA2)
    for i in range(len(sg)-2):
        A,M,B=sg[i],sg[i+1],sg[i+2]
        if A['slope']>=0 or M['slope']<=0 or B['slope']>=0: continue
        if B['slope']<=A['slope']: continue
        price=close[B['t1']]; a_pct=A['slope']/price*100
        if a_pct>=-0.3: continue
        sa,sb=A['slope'],B['slope']; dn=sa-sb
        if abs(dn)<1e-9: continue
        xc=(B['y1']-A['y1']-sb*B['t1']+sa*A['t1'])/dn
        if xc>=min(A['t0'],B['t0']) or xc<0: continue
        entry=B['t1']+1
        if entry>last: continue
        e=min(entry,last)
        t20=bool(close[e]>MA20[e]) if MA20[e] else False
        md=bool(MACDh[e]>0); w=sb/sa
        star='★★★' if (t20 and md and w<0.7) else '★★' if (t20 and md) else '★' if t20 else '-'
        ep=openp[entry] if entry<len(d) else close[last]
        yc=A['y1']+sa*(xc-A['t1'])
        up_slope=(MA2[B['t0']]-MA2[A['t1']])/(B['t0']-A['t1']) if B['t0']!=A['t1'] and MA2[B['t0']] and MA2[A['t1']] else 0
        ch,dr=chart_draw(d,A,B,sa,xc,yc,up_slope,entry,last,
            lambda d,k:d[k]['날짜'][4:6]+'/'+d[k]['날짜'][6:8],close,openp,high,low,MA2,MA5)
        cur=close[last]; t2=ep*1.12; stop=ep*0.96
        passed=cur>t2; bars=last-entry
        reason=''
        if star=='-': reason='추세(20일선) 아래라 진입 부적합'
        elif passed: reason='현재가가 2차 익절선을 넘어 매수 시점이 지남'
        elif bars>5: reason=f'작도 완성 후 {bars}봉 경과 — 진입 적기 지남'
        return {'있음':True,'추천도':star,'완만도':round(w,2),'20일선위':t20,'MACD양전':md,
                '진입가능':bool(star!='-' and not passed and bars<=5),'시점지남':bool(passed or bars>5),'사유':reason,
                '현재가':int(cur),'매수가':int(ep),'1차익절':int(yc),'2차익절':int(t2),'손절가':int(stop),
                '잔여여력':round((t2/cur-1)*100,1) if cur<t2 else round((cur/t2-1)*100,1),
                'chart':ch,'drawing':dr}
    return {'있음':False,'사유':'작도 구조 없음'}

def analyze_60m(d):
    if not d or len(d)<120: return {'있음':False,'사유':'데이터 부족'}
    close=[x['종가'] for x in d];openp=[x['시가'] for x in d];high=[x['고가'] for x in d];low=[x['저가'] for x in d];vol=[x['거래량'] for x in d]
    MA2=ma(close,2);MA5=ma(close,5);MA20=ma(close,20);VMA20=ma(vol,20)
    last=len(d)-1; sg=segs_of(MA2); cross=[]
    for i in range(len(sg)-2):
        A,M,B=sg[i],sg[i+1],sg[i+2]
        if A['slope']>=0 or M['slope']<=0 or B['slope']>=0: continue
        if B['slope']<=A['slope']: continue
        price=close[B['t1']]; a_pct=A['slope']/price*100
        if a_pct>=-0.1: continue
        sa,sb=A['slope'],B['slope']; dn=sa-sb
        if abs(dn)<1e-9: continue
        xc=(B['y1']-A['y1']-sb*B['t1']+sa*A['t1'])/dn
        if xc>=min(A['t0'],B['t0']) or xc<0: continue
        cross.append((A,B,sa,sb,xc))
    if not cross: return {'있음':False,'사유':'작도 구조 없음'}
    A,B,sa,sb,xc=cross[-1]; entry=B['t1']+1
    if entry>last: return {'있음':False,'사유':'작도 구조 없음'}
    e=min(entry,last)
    vol2=bool(VMA20[e] and VMA20[e]>0 and vol[e]>=VMA20[e]*2)
    t20=bool(close[e]>MA20[e]) if MA20[e] else False
    star='★★' if (vol2 and t20) else '★' if t20 else '-'
    ep=openp[entry] if entry<len(d) else close[last]
    yc=A['y1']+sa*(xc-A['t1'])
    up_slope=(MA2[B['t0']]-MA2[A['t1']])/(B['t0']-A['t1']) if B['t0']!=A['t1'] and MA2[B['t0']] and MA2[A['t1']] else 0
    ch,dr=chart_draw(d,A,B,sa,xc,yc,up_slope,entry,last,
        lambda d,k:d[k]['날짜'][4:6]+'/'+d[k]['날짜'][6:8]+' '+str(d[k]['시간']).zfill(6)[:2]+'시',close,openp,high,low,MA2,MA5)
    cur=close[last]; t=ep*1.04; stop=ep*0.98; bars=last-entry; passed=cur>t or bars>10
    reason=''
    if star=='-': reason='60분 추세 아래라 진입 부적합'
    elif not vol2: reason='거래량 2배 미충족 (신뢰도 낮음)'
    elif passed: reason=f'익절선 도달 또는 {bars}봉 경과 — 시점 지남'
    return {'있음':True,'추천도':star,'거래량2배':vol2,'20일선위':t20,
            '진입가능':bool(star=='★★' and not passed),'시점지남':bool(passed),'사유':reason,
            '현재가':int(cur),'매수가':int(ep),'익절가':int(t),'손절가':int(stop),'경과봉':int(bars),
            '잔여여력':round((t/cur-1)*100,1) if cur<t else round((cur/t-1)*100,1),
            'chart':ch,'drawing':dr}

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
            day=analyze_day(get_day(tk,code))
            m60=analyze_60m(get_60m(tk,code))
            self.wfile.write(json.dumps({'종목코드':code,'종목명':nm,'시장':mk,'일봉':day,'60분':m60},ensure_ascii=False).encode())
        except Exception as ex:
            self.wfile.write(json.dumps({'error':'분석 실패: '+str(ex)}).encode())
