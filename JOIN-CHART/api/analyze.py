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
    out=[{'d':x['date'],'o':float(x['open']),'h':float(x['high']),'l':float(x['low']),'c':float(x['close']),
          'v':float(x.get('volume',0) or 0)} for x in rows]
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

def trim_adjust(bars):
    """권리조정(액면분할/병합/거래정지) 구간 이후부터 시작.
    ① 거래량 3일 연속 0  ② 전일 대비 가격 갭 40%+ (수정주가로도 안 잡힌 경우)"""
    if len(bars)<10: return bars
    has_vol = 'v' in bars[0]
    cut=0
    # 거래량 3일 연속 0 → 마지막 그런 구간 다음부터 (거래량 있을 때만)
    if has_vol:
        zero=0
        for i in range(len(bars)):
            v=bars[i].get('v',0)
            if v<=0:
                zero+=1
                if zero>=3: cut=max(cut,i+1)
            else:
                zero=0
    # 가격 갭: 전일 종가 대비 시가/종가가 40%+ 튀거나 빠짐 → 그 다음부터
    for i in range(1,len(bars)):
        p=bars[i-1]['c']
        if p<=0: continue
        r=bars[i]['c']/p
        if r>=1.4 or r<=0.6:  # 40%+ 급변 = 권리조정 의심
            cut=max(cut,i)
    if cut>0 and len(bars)-cut>=20:  # 자른 후 20봉 이상 남을 때만
        return bars[cut:]
    return bars

def build_drawings(bars):
    """작도 다수: 모든 하락-상승-하락(상승파동1개) 작도. 교차점/녹색선 다."""
    bars=trim_adjust(bars)  # 권리조정 구간 제거
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
        # 녹색선(상승선) 차트 끝 시점 예상 목표가
        last_i=len(c)-1
        green_slope=s2 if (s2 is not None and s2>0) else m_slope
        target=MA2[mt1]+green_slope*(last_i-mt1)
        draws.append({
            'A_t1':A['t1'],'A_y1':round(MA2[A['t1']],1),'A_slope':round(sa,2),
            'B_t1':B['t1'],'B_y1':round(MA2[B['t1']],1),'B_slope':round(sb,2),
            'xc':round(xc,2),'yc':round(yc,1),
            'M_t0':mt0,'M_y0':round(MA2[mt0],1),'M_t1':mt1,'M_y1':round(MA2[mt1],1),
            'M_slope':round(m_slope,2),'M_k':mk,
            'M_s1':round(s1,2) if s1 is not None else None,'M_s2':round(s2,2) if s2 is not None else None,
            'M_ky':round(MA2[mk],1) if mk is not None else None,
            'entry':entry,'ep':round(ep,1),
            'target':round(target,1),  # 녹색선 예상 목표가
            'alive': yc>ep
        })
    # 최근 5개 작도만
    draws=draws[-5:]
    draws_start = min([d['A_t1'] for d in draws]) if draws else 0  # 5개 작도 시작 인덱스

    # 반대 작도(위험): 상승(A)-하락파동(M)-상승(B) → 하방 교차점
    all_risks=[]
    for i in range(len(segs)-2):
        A,M,B=segs[i],segs[i+1],segs[i+2]
        if not A['up'] or M['up'] or not B['up']: continue  # 상승-하락-상승
        sa=last_down_slope(MA2,A['t0'],A['t1'])  # 상승 마지막 기울기
        sb=last_down_slope(MA2,B['t0'],B['t1'])
        if sa<=0 or sb<=0 or sb>=sa: continue  # B가 A보다 완만한 상승
        ya1=MA2[A['t1']]; ta1=A['t1']; yb1=MA2[B['t1']]; tb1=B['t1']
        denom=sa-sb
        if abs(denom)<1e-9: continue
        xc=(yb1-ya1-sb*tb1+sa*ta1)/denom
        yc=ya1+sa*(xc-ta1)
        if xc>=min(ta1,tb1) or xc<0: continue
        cur_p=c[-1]
        if yc>=cur_p: continue  # 하방 교차점이 현재가보다 아래여야 위험
        all_risks.append({
            'A_t1':A['t1'],'A_y1':round(MA2[A['t1']],1),
            'B_t1':B['t1'],'B_y1':round(MA2[B['t1']],1),
            'xc':round(xc,2),'yc':round(yc,1)
        })

    chart=[{'i':i,'d':(bars[i].get('d','')[4:6]+'/'+bars[i].get('d','')[6:8]+(' '+str(bars[i]['t']).zfill(6)[:2]+'시' if 't' in bars[i] else '')),
            'o':int(bars[i]['o']),'h':int(bars[i]['h']),'l':int(bars[i]['l']),'c':int(bars[i]['c']),
            'm2':round(MA2[i],1) if MA2[i] is not None else None} for i in range(len(bars))]
    return {'chart':chart,'draws':draws,'all_risks':all_risks,'draws_start':draws_start,'cur':int(c[-1])}

def build_projection(bars, draws, risk_level, fut=63):
    """미래 예측: 몬테카를로로 양방향 확률 + 각 기법 목표 도달 확률(통일).
    fut = 미래 영업일 수 (약 3개월)"""
    import math, random
    c=[b['c'] for b in bars]
    cur=c[-1]
    if cur<=0: return None
    # 일간 로그수익률 변동성/드리프트
    rets=[math.log(c[i]/c[i-1]) for i in range(1,len(c)) if c[i-1]>0 and c[i]>0]
    if not rets: return None
    mu=sum(rets)/len(rets)
    var=sum((r-mu)**2 for r in rets)/len(rets)
    sd=math.sqrt(var) if var>0 else 0.02
    # 작도 상승목표 기울기 (살아있는 최신 작도의 녹색선)
    up_slope=0
    alive=[d for d in draws if d.get('alive')]
    if alive:
        d=alive[-1]
        gs=d.get('M_s2') if (d.get('M_s2') not in (None,0)) else d.get('M_slope',0)
        up_slope=gs or 0
    if up_slope<=0:  # 없으면 변동성 기반 완만 상승
        up_slope=cur*max(mu,0.001)
    up_target=cur+up_slope*fut*0.6  # 차트에 그릴 풀 목표(녹색선 연장 끝)
    up_reach=cur+up_slope*fut*0.30  # 확률 계산용 현실 목표(녹색선 절반쯤, 검증상 ~49%)
    # 하락목표 = 위험선(60분/작도) 또는 변동성 기반
    dn_target = risk_level if (risk_level and risk_level<cur) else cur*(1-2*sd*math.sqrt(fut))
    dn_reach = cur+(dn_target-cur)*0.6  # 확률 계산용 현실 하락목표
    # 몬테카를로 (약한 상방 드리프트 = 작도 추세 반영)
    N=600
    drift_up=max(mu*0.5, up_slope/cur*0.35) if up_slope>0 else mu*0.5
    def sim_prob(level, up, drift):
        hit=0; random.seed(7 if up else 11)
        for _ in range(N):
            v=cur; mx=cur; mn=cur
            for _ in range(fut):
                v*=math.exp(random.gauss(drift, sd))
                if v>mx:mx=v
                if v<mn:mn=v
            if (up and mx>=level) or ((not up) and mn<=level): hit+=1
        return round(hit/N*100)
    mc_up=sim_prob(up_reach,True,drift_up)
    mc_dn=sim_prob(dn_reach,False,mu*0.5)
    def prob_reach(level, up=True):
        return sim_prob(level, up, drift_up if up else mu*0.5)
    methods={
        'ell':{'up':prob_reach(cur+(up_reach-cur)*1.1,True),'dn':prob_reach(cur+(dn_reach-cur)*1.1,False)},
        'fib':{'up':prob_reach(cur*1.12,True),'dn':prob_reach(cur*0.90,False)},
        'gann':{'up':prob_reach(cur+(up_reach-cur)*0.85,True),'dn':prob_reach(cur+(dn_reach-cur)*0.85,False)},
        'mc':{'up':mc_up,'dn':mc_dn},
    }
    return {
        'fut':fut, 'cur':int(cur),
        'up_slope':round(up_slope,3), 'up_target':int(up_target),
        'dn_target':int(dn_target),
        'volatility':round(sd,4), 'drift':round(mu,5),
        'mc_up':mc_up, 'mc_dn':mc_dn,
        'methods':methods,
        'fib_levels':[round(cur*f) for f in (1.236,1.382,1.618,0.786,0.618)],
    }

def resolve_risk(day, m60):
    """위험 우선순위: ①5개범위안 ②60분에서 끌어옴 ③과거 가장가까운 1개"""
    if not day or 'draws' not in day:
        return
    ds=day.get('draws_start',0)
    ar=day.get('all_risks',[])
    in_range=[r for r in ar if r['xc']>=ds]
    if in_range:
        day['risks']=in_range[-3:]; day['risk_on']=True; day['risk_src']='범위내'; day['view_start']=None
    elif m60 and m60.get('all_risks'):
        # 60분 위험 '가격'만 가로선으로 끌어옴 (위치 안 맞으니 price_only)
        near=m60['all_risks'][-1]
        day['risks']=[{'yc':near['yc'],'price_only':True}]; day['risk_on']=True; day['risk_src']='60분'; day['view_start']=None
    elif ar:
        # 과거 가장 가까운 위험 1개 → 그 지점부터 차트 시작
        near=ar[-1]
        day['risks']=[near]; day['risk_on']=True; day['risk_src']='과거'; day['view_start']=int(min(near['A_t1'], near['xc']))
    else:
        day['risks']=[]; day['risk_on']=False; day['risk_src']=None; day['view_start']=None

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
            dd = build_drawings(day) if day and len(day)>30 else {'error':'데이터 부족'}
            mm = build_drawings(m60) if m60 and len(m60)>30 else {'error':'데이터 부족'}
            # 일봉 위험: ①범위안 ②60분끌어옴 ③과거1개  (60분 all_risks 참조하므로 먼저)
            if 'draws' in dd:
                resolve_risk(dd, mm if 'draws' in mm else None)
            # 60분 자체 위험: 자기 5개작도 범위 안 + 과거1개 (60분끼리)
            if 'draws' in mm:
                resolve_risk(mm, None)
            # all_risks 정리(용량)
            for blk in (dd,mm):
                if isinstance(blk,dict): blk.pop('all_risks',None)
            # 미래 예측 (일봉만): 위험선 가격을 하락 목표로
            if 'draws' in dd and dd.get('chart'):
                risk_level = dd['risks'][0]['yc'] if dd.get('risks') else None
                try:
                    dd['projection'] = build_projection(dd['chart'], dd['draws'], risk_level)
                except Exception as pe:
                    dd['projection'] = None
            out={'종목코드':code,'종목명':nm,'시장':mk,'일봉':dd,'60분':mm}
            self.wfile.write(json.dumps(out,ensure_ascii=False).encode())
        except Exception as ex:
            self.wfile.write(json.dumps({'error':'분석 실패: '+str(ex)}).encode())
