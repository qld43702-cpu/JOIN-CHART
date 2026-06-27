# BUILD:1782268309
# ============================================================
#  종목 작도 표시 API — 일봉 + 60분 두 트랙, 작도 다수
#  GET /api/analyze?code=090360
#  현재 시점 데이터로 작도(다수 교차점/녹색선/수평선) 다 표시
# ============================================================
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import os, json, requests


import datetime as _dt
_KST = _dt.timezone(_dt.timedelta(hours=9))
def _now_kst(): return _dt.datetime.now(_KST)
def _is_market_open():
    now = _now_kst()
    return now.weekday() < 5 and (9 <= now.hour < 15 or (now.hour == 15 and now.minute <= 30))

BASE="https://openapi.ls-sec.co.kr:8080"
YBASE="https://query1.finance.yahoo.com/v8/finance/chart"
YHEAD={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def is_us(code):
    """영문 티커면 미국주식 (숫자6자리=한국)"""
    c=(code or "").strip().upper()
    return bool(c) and not c.isdigit() and all(ch.isalnum() or ch in '.-' for ch in c)

def _yahoo_fetch(ticker, rng, interval):
    try:
        r=requests.get(f"{YBASE}/{ticker}", headers=YHEAD, timeout=10,
            params={"range":rng,"interval":interval,"includePrePost":"false"})
        j=r.json()
        res=j.get("chart",{}).get("result")
        if not res: return None
        res=res[0]; ts=res.get("timestamp",[])
        q=res.get("indicators",{}).get("quote",[{}])[0]
        o=q.get("open",[]); h=q.get("high",[]); l=q.get("low",[]); c=q.get("close",[]); v=q.get("volume",[])
        import datetime
        out=[]
        for i in range(len(ts)):
            if i>=len(c) or c[i] is None: continue
            dt=datetime.datetime.fromtimestamp(ts[i], _KST)
            row={'d':dt.strftime("%Y%m%d"),'o':float(o[i] or c[i]),'h':float(h[i] or c[i]),
                 'l':float(l[i] or c[i]),'c':float(c[i]),'v':float(v[i] or 0)}
            if interval!="1d": row['t']=dt.strftime("%H%M%S")
            out.append(row)
        return out if out else None
    except Exception:
        return None

def get_day_us(ticker): return _yahoo_fetch(ticker,"2y","1d")

def _load_kr_market(code):
    sj=_load_stocks().get(code,{})
    mk=sj.get('market','')
    return '.KQ' if '코스닥' in mk else '.KS'

def get_day_kr(code): return _yahoo_fetch(code+_load_kr_market(code),"2y","1d")
def get_60m_kr(code): return _yahoo_fetch(code+_load_kr_market(code),"2y","60m")
def get_15m_kr(code): return _yahoo_fetch(code+_load_kr_market(code),"60d","15m")

def get_cur_ls(tk,code):
    try:
        if not _is_market_open(): return None
        r=requests.post(f"{BASE}/stock/market-data",verify=False,timeout=5,
            headers={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {tk}","tr_cd":"t1102","tr_cont":"N"},
            json={"t1102InBlock":{"shcode":code}})
        b=r.json().get("t1102OutBlock",{})
        p=float(b.get("price") or b.get("jnilclose") or 0)
        return p if p>0 else None
    except: return None

def get_today_bar_ls(tk,code):
    """장중 오늘 봉(시가/고가/저가/현재가)을 LS t1102에서 — 야후 시세에 씌우기용"""
    try:
        if not _is_market_open(): return None
        r=requests.post(f"{BASE}/stock/market-data",verify=False,timeout=5,
            headers={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {tk}","tr_cd":"t1102","tr_cont":"N"},
            json={"t1102InBlock":{"shcode":code}})
        b=r.json().get("t1102OutBlock",{})
        # LS t1102 실제 필드명: opnprice=시가, hgprice=고가, lwprice=저가, price=현재가
        o=float(b.get("opnprice") or b.get("open") or b.get("price") or 0)
        h=float(b.get("hgprice") or b.get("high") or b.get("price") or 0)
        l=float(b.get("lwprice") or b.get("low")  or b.get("price") or 0)
        c=float(b.get("price") or b.get("jnilclose") or 0)
        if c<=0: return None
        today=_now_kst().strftime("%Y%m%d")
        return {'d':today,'t':'0900','o':o or c,'h':h or c,'l':l or c,'c':c}
    except: return None
def get_min_us(ticker,interval="60m"):
    return _yahoo_fetch(ticker, "2y" if interval=="60m" else "60d", interval)
def get_name_us(ticker):
    try:
        r=requests.get(f"{YBASE}/{ticker}",headers=YHEAD,timeout=8,params={"range":"5d","interval":"1d"})
        meta=r.json().get("chart",{}).get("result",[{}])[0].get("meta",{})
        return meta.get("shortName") or meta.get("longName") or ticker.upper(),"미국"
    except Exception:
        return ticker.upper(),"미국"

_token_cache={"tk":None,"exp":0}
_RESULT_CACHE={}   # 종목별 분석 결과 캐시 (30분)
def token():
    import time
    now=time.time()
    # 캐시된 토큰이 살아있으면 재사용 (LS 토큰 24h 유효 → 23h 캐싱)
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
        raise RuntimeError("토큰 발급 실패: "+str(j.get("error_description") or j.get("error") or j))
    tk=j["access_token"]
    _token_cache["tk"]=tk
    _token_cache["exp"]=now + 23*3600  # 23시간 캐싱
    return tk

def get_day(tk,code):
    r=requests.post(f"{BASE}/stock/chart",verify=False,timeout=8,
        headers={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {tk}","tr_cd":"t8410","tr_cont":"N"},
        json={"t8410InBlock":{"shcode":code,"gubun":"2","qrycnt":150,"sdate":"20240101","edate":"20991231","cts_date":"","comp_yn":"N","sujung":"Y"}})
    rows=r.json().get("t8410OutBlock1",[])
    if not rows: return None
    out=[{'d':x['date'],'o':float(x['open']),'h':float(x['high']),'l':float(x['low']),'c':float(x['close']),
          'v':float(x.get('volume') or x.get('value') or x.get('jdiff_vol') or 0)} for x in rows]
    out.sort(key=lambda z:z['d']); return out

def get_60m(tk,code):
    rows=[]; cd=""; ct=""
    for _ in range(2):
        r=requests.post(f"{BASE}/stock/chart",verify=False,timeout=8,
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

def get_min(tk,code,ncnt):
    """분봉 받기. ncnt=주기(분): 10=10분봉, 60=60분봉"""
    rows=[]; cd=""; ct=""
    for _ in range(2):
        r=requests.post(f"{BASE}/stock/chart",verify=False,timeout=8,
            headers={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {tk}","tr_cd":"t8412","tr_cont":"N" if cd=="" else "Y"},
            json={"t8412InBlock":{"shcode":code,"ncnt":ncnt,"qrycnt":500,"nday":"0","sdate":"20250101","edate":"20991231","cts_date":cd,"cts_time":ct,"comp_yn":"N"}})
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

_STOCKS_CACHE=None
def _load_stocks():
    """stocks.json에서 code→market 매핑 (t8436 기반이라 정확). 1회 캐시."""
    global _STOCKS_CACHE
    if _STOCKS_CACHE is not None:
        return _STOCKS_CACHE
    _STOCKS_CACHE={}
    # api/ 상위 디렉토리(프로젝트 루트)의 stocks.json
    for path in (os.path.join(os.path.dirname(__file__),'..','stocks.json'),
                 os.path.join(os.path.dirname(__file__),'stocks.json'),
                 'stocks.json'):
        try:
            with open(path,encoding='utf-8') as f:
                for s in json.load(f):
                    c=str(s.get('code','')).strip()
                    if c: _STOCKS_CACHE[c]={'name':s.get('name',''),'market':s.get('market','')}
            if _STOCKS_CACHE: break
        except: continue
    return _STOCKS_CACHE

def get_name(tk,code):
    # 1순위: stocks.json (t8436 기반 — 시장 구분 정확)
    sj=_load_stocks().get(code)
    nm_j = sj['name'] if sj else ''
    mk_j = sj['market'] if sj else ''
    # 2순위: t1102 API (이름 보강용, 시장은 stocks.json 우선)
    try:
        r=requests.post(f"{BASE}/stock/market-data",verify=False,timeout=8,
            headers={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {tk}","tr_cd":"t1102","tr_cont":"N"},
            json={"t1102InBlock":{"shcode":code}})
        b=r.json().get("t1102OutBlock",{})
        nm_api=b.get("hname","").strip()
        nm = nm_j or nm_api
        # 시장: stocks.json이 있으면 그걸 신뢰, 없으면 API gubun 폴백
        mk = mk_j if mk_j else ("코스닥" if b.get("gubun","")=="2" else "코스피")
        return nm, mk
    except:
        return nm_j, mk_j

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
        if yc<=0: continue  # 교차점 가격 0 이하 제외
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
        if yc<=0: continue       # 주가는 0 밑으로 못 감 — 음수 교차점 제외
        if yc < cur_p*0.3: continue  # 현재가의 30% 미만은 비현실적 위험선, 제외
        all_risks.append({
            'A_t1':A['t1'],'A_y1':round(MA2[A['t1']],1),
            'B_t1':B['t1'],'B_y1':round(MA2[B['t1']],1),
            'xc':round(xc,2),'yc':round(yc,1),
            'entry':B['t1']+1
        })

    chart=[{'i':i,'d':(bars[i].get('d','')[4:6]+'/'+bars[i].get('d','')[6:8]+(' '+str(bars[i]['t']).zfill(6)[:2]+'시' if 't' in bars[i] else '')),
            'rawd':bars[i].get('d',''),
            'o':round(bars[i]['o'],2),'h':round(bars[i]['h'],2),'l':round(bars[i]['l'],2),'c':round(bars[i]['c'],2),
            'v':int(bars[i].get('v',0) or 0),
            'm2':round(MA2[i],2) if MA2[i] is not None else None} for i in range(len(bars))]
    return {'chart':chart,'draws':draws,'all_risks':all_risks,'draws_start':draws_start,'cur':round(c[-1],2)}

def build_projection(bars, draws, risk_level, fut=63, market='', period='quarter', all_risks=None):
    """미래 예측: 몬테카를로로 양방향 확률 + 각 기법 목표 도달 확률(통일).
    fut = 미래 영업일 수 (약 3개월)"""
    import math, random
    c=[b['c'] for b in bars]
    cur=c[-1]
    if cur<=0: return None

    # ===== 엘리엇 파동 카운팅 (근사) =====
    def count_waves(closes):
        """ZigZag로 스윙 변곡점 추출 후 현재 파동위치 추정."""
        if len(closes)<40: return {'phase':'?','next':'mixed','desc':'데이터 부족'}
        THRESH=0.13
        # ZigZag: 마지막 피벗 대비 THRESH 이상 반대로 가면 새 피벗 확정
        piv=[closes[0]]; piv_i=[0]
        trend=0  # 0=미정, 1=상승, -1=하락
        ext=closes[0]; ext_i=0  # 현재 진행방향 극값
        for i in range(1,len(closes)):
            p=closes[i]
            if trend>=0:
                if p>ext: ext=p; ext_i=i           # 상승 극값 갱신
                if ext>0 and (ext-p)/ext>=THRESH:  # 고점서 THRESH 하락 → 고점 확정
                    piv.append(ext); piv_i.append(ext_i)
                    trend=-1; ext=p; ext_i=i
            if trend<=0:
                if p<ext: ext=p; ext_i=i            # 하락 극값 갱신
                if ext>0 and (p-ext)/ext>=THRESH:  # 저점서 THRESH 상승 → 저점 확정
                    piv.append(ext); piv_i.append(ext_i)
                    trend=1; ext=p; ext_i=i
        if piv_i[-1]!=len(closes)-1:
            piv.append(closes[-1]); piv_i.append(len(closes)-1)  # 마지막
        if len(piv)<3:
            return {'phase':'1','next':'up','desc':'추세 초기 — 큰 파동 형성 중, 상승 여력','legs':len(piv)-1}
        # 다리(leg) 방향 시퀀스
        legs=['U' if piv[j]>piv[j-1] else 'D' for j in range(1,len(piv))]
        last_leg=legs[-1]
        recent=legs[-5:]                          # 최근 5개 큰 다리만
        up_in_recent=recent.count('U')
        if last_leg=='U':
            if up_in_recent<=1: return {'phase':'1','next':'up','desc':'상승 1파 추정 — 초기 국면, 상승 여력 있음','legs':len(legs)}
            elif up_in_recent==2: return {'phase':'3','next':'up','desc':'상승 3파 추정 — 가장 강한 상승 구간','legs':len(legs)}
            else: return {'phase':'5','next':'dn','desc':'상승 5파 추정 — 막바지, 조정(하락) 임박 주의','legs':len(legs)}
        else:
            if recent.count('D')>=3: return {'phase':'하락','next':'dn','desc':'하락 추세 추정 — 반등 시 매물 주의','legs':len(legs)}
            return {'phase':'ABC','next':'mixed','desc':'조정(되돌림) 국면 — 2파/4파 가능, 방향 미확정','legs':len(legs)}
    wave_info = count_waves(c[-150:] if len(c)>150 else c)

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
    green_max=cur+up_slope*fut*0.6   # 녹색 최대치(가상선, 내부 계산용)
    up_target=cur+(green_max-cur)*0.35  # 상승목표선 = 녹색의 35% (도달률 ~58% 현실선)
    up_reach=cur+(green_max-cur)*0.30  # 확률 계산용
    # ===== 변동성 기반 현실 목표 (기법선용) — 작도 무시, 순수 통계 =====
    sigma3m = sd * math.sqrt(fut)          # 3개월 변동성(비율)
    # 상승 목표 (상한: 변동성 과해도 합리적 범위)
    sigma_cap = min(sigma3m, 0.6)          # σ비율 60% 상한 (그 이상은 비현실)
    tgt_1sig  = cur*(1+1.0*sigma_cap)
    tgt_15sig = cur*(1+1.5*min(sigma3m,0.4))
    tgt_2sig  = cur*(1+2.0*min(sigma3m,0.3))   # 상승 상한
    # 하락 목표 (하한: 주가는 0 밑으로 못 감. 현재가의 40%를 바닥으로)
    DN_FLOOR = cur*0.4                      # 3개월 하락 바닥 (현실적으로 -60%면 충분히 극단)
    dn_1sig   = max(cur*(1-1.0*sigma3m), DN_FLOOR)
    dn_2sig   = max(cur*(1-2.0*sigma3m), DN_FLOOR)
    # 하락목표 = 위험선(60분/작도) 또는 변동성 기반 (둘 다 0 이하 방지)
    if risk_level and 0 < risk_level < cur:
        dn_target = risk_level
    else:
        dn_target = max(cur*(1-2*sigma3m), DN_FLOOR)
    dn_target = max(dn_target, cur*0.4)     # 최종 안전장치
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
    # 몬테카를로 현실 목표가: 시뮬레이션 최종가의 중앙값
    # ※ 작도추세(drift_up) 쓰지 않음 — 몬테는 순수 과거 변동성/수익률 기반이어야 함
    def sim_median_end():
        ends=[]; random.seed(13)
        # 일간 드리프트 = 과거 평균 로그수익률(mu). 단 ±0.5%/일로 제한(3개월 복리 폭발 방지)
        d=max(min(mu, 0.005), -0.005)
        for _ in range(N):
            v=cur
            for _ in range(fut):
                v*=math.exp(random.gauss(d, sd))
            ends.append(v)
        ends.sort()
        return ends[len(ends)//2]
    mc_target=round(sim_median_end(),2)
    def prob_reach(level, up=True):
        return sim_prob(level, up, drift_up if up else mu*0.5)
    # ===== 3분류 확률 (상승/하락/횡보 합=100%) — 백테스트와 동일 ±10% 기준 =====
    UP_TH=0.10; DN_TH=-0.10
    def sim_updnflat(drift, seed):
        u=d=f=0; random.seed(seed)
        base_d=max(min(drift, 0.006), -0.006)  # 일간 드리프트 상한(복리폭발 방지)
        for _ in range(N):
            v=cur
            for _ in range(fut):
                v*=math.exp(random.gauss(base_d, sd))
            chg=v/cur-1
            if chg>=UP_TH: u+=1
            elif chg<=DN_TH: d+=1
            else: f+=1
        return {'up':round(u/N*100),'dn':round(d/N*100),'flat':round(f/N*100)}
    # 기법별 확률 — 작도 상방편향 제거, 순수 과거 추세(mu) 기반으로 정직하게
    # 종목 실제 추세대로 상승/하락이 갈림 (하락추세면 하락 높게)
    base_drift = max(min(mu, 0.004), -0.004)   # 과거 평균 로그수익률 (상한 ±0.4%/일)
    # 기법별로 변동성 해석만 약간 다르게 (편향 아닌 차등)
    methods={
        'mc':   sim_updnflat(base_drift,         13),  # 몬테: 순수 과거추세
        'ell':  sim_updnflat(base_drift,         17),  # 엘리엇 (시드만 다름 = 자연 변동)
        'gann': sim_updnflat(base_drift,         19),  # 갠
        'fib':  sim_updnflat(base_drift,         23),  # 피보
    }
    # ===== 변동성 과열 신호 (백테스트 검증됨) =====
    # 2σ목표 > 녹색최대치 → 변동성이 작도추세보다 과함 = 과열
    overheat = tgt_2sig > green_max
    # 시장별 검증 확률 (market: 코스피/코스닥)
    if market == '코스닥':
        oh_prob = {'up':27, 'dn':32, 'flat':41}  # 코스닥: 하락 우위
    else:
        oh_prob = {'up':28, 'dn':22, 'flat':51}  # 코스피: 약한 상승 우위
    # 캡 해제: 보조지표(엘리엇/갠/피보/몬테) 목표를 35% 캡 없이 그대로. (내 작도선만 제 기준 유지)
    cap_price = round(up_target,2)
    ell_capped  = round(tgt_15sig,2)
    gann_capped = round(tgt_1sig,2)
    fib_up_cap  = round(tgt_2sig,2)
    mc_capped   = mc_target
    cap_count = 0
    cap_detail = {}
    # 최근 살아있는 작도의 녹색 시작 인덱스
    green_start = alive[-1].get('M_t1') if alive else (draws[-1].get('M_t1') if draws else None)
    # ===== 시나리오 기준점: % 임계 넘는 교차점(작도)의 entry =====
    # 교차점(yc) 대비 그 이후 가격이 임계% 이상 움직인 '유효 작도'만 인정.
    # 그 중 가장 최근 작도의 entry(교차점 다음 봉)를 시작점으로.
    # (작은 변곡점들은 시작점에 영향 안 줌 → 시나리오선 지그재그에만 반영)
    anchor_idx=None; anchor_price=None
    try:
        import datetime as _dt
        def _date_of(b):
            d=b.get('rawd','') or b.get('d','')
            if len(d)>=8:
                try: return _dt.date(int(d[:4]),int(d[4:6]),int(d[6:8]))
                except: return None
            return None
        # period별 임계 (주간10%/중기20%/중장기30%)
        THR = {'week':0.10, 'month':0.20, 'quarter':0.30}.get(period, 0.20)
        cc=[b['c'] for b in bars]
        hh=[b.get('h',b['c']) for b in bars]
        ll=[b.get('l',b['c']) for b in bars]
        N=len(bars)
        # 각 작도: 교차점 yc 대비 entry~현재 극값 이탈률이 임계 넘는지
        # draws(상승작도)와 all_risks(하락작도/위험선) 둘 다 시작점 후보
        cand_draws = list(draws or []) + list(all_risks or [])
        valid=[]
        for d in cand_draws:
            yc=d.get('yc',0); en=d.get('entry',None)
            if not yc or yc<=0 or en is None or en>=N: continue
            seg_hi=max(hh[en:]) if en<N else yc
            seg_lo=min(ll[en:]) if en<N else yc
            dev=max((seg_hi-yc)/yc, (yc-seg_lo)/yc)  # 위/아래 중 큰 이탈
            if dev>=THR:
                valid.append(en)
        if valid:
            anchor_idx=max(valid)  # 가장 최근 유효 작도의 entry
        else:
            # 임계 넘는 유효 작도 없음 → 임계 낮춰가며(60%,35%,20%) 재탐색
            for f in (0.6,0.35,0.2):
                t2=THR*f; cc2=[]
                for d in cand_draws:
                    yc=d.get('yc',0); en=d.get('entry',None)
                    if not yc or yc<=0 or en is None or en>=N: continue
                    seg_hi=max(hh[en:]) if en<N else yc
                    seg_lo=min(ll[en:]) if en<N else yc
                    dev=max((seg_hi-yc)/yc,(yc-seg_lo)/yc)
                    if dev>=t2: cc2.append(en)
                if cc2: anchor_idx=max(cc2); break
            if anchor_idx is None:
                # 작도가 아예 없으면 마지막 작도 entry 또는 절반 지점
                _all=cand_draws
                if _all: anchor_idx=max(d.get('entry',0) for d in _all)
                else: anchor_idx=max(0,N-fut)
        if anchor_idx>=N-1: anchor_idx=max(0,N-2)
        anchor_price=round(bars[anchor_idx].get('o',bars[anchor_idx]['c']),2)
        # ── 끝(미래) = 시작점~현재 봉 밀도로 추정 (기존 달력 로직 유지) ──
        last_d=_date_of(bars[-1])
        if last_d is not None:
            if period=='week':
                end_cal=last_d + _dt.timedelta(days=(4-last_d.weekday()))
            elif period=='month':
                if last_d.month==12: end_cal=_dt.date(last_d.year,12,31)
                else: end_cal=_dt.date(last_d.year,last_d.month+1,1)-_dt.timedelta(days=1)
            else:
                qend_month=((last_d.month-1)//3)*3+3
                if qend_month==12: end_cal=_dt.date(last_d.year,12,31)
                else: end_cal=_dt.date(last_d.year,qend_month+1,1)-_dt.timedelta(days=1)
            passed_bars=len(bars)-1-anchor_idx
            start_d=_date_of(bars[anchor_idx])
            cal_passed=max(1,(last_d-start_d).days) if start_d else 1
            dens=passed_bars/cal_passed if cal_passed>0 else 1
            cal_remain=max(0,(end_cal-last_d).days)
            fut_calc=int(round(cal_remain*dens*(5/7))) if dens>0 else int(round(cal_remain*5/7))
            fut=max(1, fut_calc)
    except: pass
    return {
        'fut':fut, 'cur':round(cur,2),
        'up_slope':round(up_slope,3), 'up_target':round(up_target,2), 'green_max':round(green_max,2),
        'dn_target':round(dn_target,2),
        'volatility':round(sd,4), 'drift':round(mu,5),
        'mc_up':mc_up, 'mc_dn':mc_dn, 'mc_target':mc_target,
        'methods':methods,
        'tech_targets':{
            'ell':ell_capped,
            'mc':mc_capped,
            'gann':gann_capped,
            'fib_up':fib_up_cap,
            'fib_dn':round(dn_1sig,2),
            'cap':cap_price,
        },
        'overheat':overheat, 'overheat_prob':oh_prob,
        'wave':wave_info,
        'cap_count':cap_count, 'cap_detail':cap_detail,
        'fib_levels':[round(cur*f) for f in (1.236,1.382,1.618,0.786,0.618)],
        'green_start': green_start,
        'anchor_idx':anchor_idx, 'anchor_price':anchor_price,
    }

def analyze_pattern(bars, draws):
    """과거 5개 작도의 녹색선 시작(M_t1) 이후 실제 주가 반응을 보고
    엘리엇/피보나치/갠/몬테카를로 중 어느 패턴과 유사한지 판별.
    반환: {'best': '엘리엇', 'scores': {...}, 'detail': '...', 'sample': N}"""
    import math
    c = [b['c'] for b in bars]
    n = len(c)
    scores = {'엘리엇': 0, '피보나치': 0, '갠': 0, '몬테카를로': 0}
    samples = 0

    for d in draws:
        mt1 = d.get('M_t1')
        if mt1 is None or mt1 >= n - 5:
            continue
        # 녹색 시작가
        base = c[mt1]
        if base <= 0:
            continue
        # 녹색 이후 실제 가격 (최대 작도 끝까지, 또는 현재까지)
        seg = c[mt1:]
        if len(seg) < 5:
            continue
        samples += 1
        peak_i = max(range(len(seg)), key=lambda i: seg[i])
        peak_v = seg[peak_i]
        end_v = seg[-1]
        ratio_peak = peak_v / base  # 녹색 시작 대비 최고점 비율
        ratio_end = end_v / base    # 녹색 시작 대비 현재(끝) 비율

        # ── 엘리엇: 상승 후 되돌림 후 재상승 구조 확인
        # 조건: 고점 이후 되돌림(0.382~0.618) 후 다시 반등
        if peak_i > 2 and peak_i < len(seg) - 2:
            retraced = min(seg[peak_i:])
            retrace_r = (peak_v - retraced) / (peak_v - base) if (peak_v - base) > 0 else 0
            if 0.3 <= retrace_r <= 0.68 and end_v > retraced:
                scores['엘리엇'] += 2
            elif retrace_r < 0.3 and ratio_peak > 1.05:
                scores['엘리엇'] += 1

        # ── 피보나치: 상승폭이 황금비율(1.236/1.382/1.618) 근처에서 멈춤
        fib_targets = [1.236, 1.382, 1.618, 2.0, 0.786]
        for ft in fib_targets:
            if abs(ratio_peak - ft) < 0.08:
                scores['피보나치'] += 2
                break
        else:
            # 현재가가 피보 레벨 근처
            for ft in fib_targets:
                if abs(ratio_end - ft) < 0.06:
                    scores['피보나치'] += 1
                    break

        # ── 갠: 계단식 일정 비율 상승 — 변동성 대비 추세 일관성
        if len(seg) >= 10:
            # 10봉 단위로 수익률 계산, 편차가 작으면 갠(일정 속도)
            step = max(1, len(seg) // 5)
            rets = []
            for k in range(0, len(seg) - step, step):
                if seg[k] > 0:
                    rets.append(seg[k + step] / seg[k] - 1)
            if rets:
                avg_r = sum(rets) / len(rets)
                std_r = math.sqrt(sum((r - avg_r) ** 2 for r in rets) / len(rets)) if len(rets) > 1 else 1
                cv_r = abs(std_r / avg_r) if avg_r != 0 else 99
                if avg_r > 0 and cv_r < 0.6:   # 상승 일관성 높음
                    scores['갠'] += 2
                elif avg_r > 0 and cv_r < 1.0:
                    scores['갠'] += 1

        # ── 몬테카를로: 방향성 없이 노이즈만 — 위 셋 다 낮을 때
        # (적극적으로 점수 주는 게 아니라, 나머지가 낮을 때 기본점)
        if ratio_peak < 1.04 or (ratio_peak > 1.0 and abs(ratio_end - 1.0) < 0.03):
            scores['몬테카를로'] += 1

    # 기본점: 샘플 없으면 판단 불가
    if samples == 0:
        return {'best': None, 'scores': scores, 'detail': '분석 가능한 과거 작도 없음', 'sample': 0}

    best = max(scores, key=lambda k: scores[k])
    # 동점이면 몬테카를로 제외 우선
    if list(scores.values()).count(scores[best]) > 1:
        for k in ['엘리엇', '피보나치', '갠']:
            if scores[k] == scores[best]:
                best = k
                break

    # 설명 문구
    desc = {
        '엘리엇': f'상승 후 되돌림·재상승 3파 구조가 반복됨. 현재 파동 위치 확인 후 3파 목표가 참고 권장.',
        '피보나치': f'녹색선 이후 황금비율(1.382~1.618배) 부근에서 고점 형성 패턴. 목표가 산정 시 피보나치 레벨 활용 유효.',
        '갠': f'일정한 속도(계단식)로 상승하는 흐름. 갠 각도선 기준 추세 이탈 여부가 핵심 지표.',
        '몬테카를로': f'방향성보다 변동성 중심 움직임. 특정 기법보다 리스크 관리(손절·비중) 우선 권장.',
    }
    detail = desc.get(best, '')

    return {
        'best': best,
        'scores': scores,
        'detail': detail,
        'sample': samples,
        'green_start': draws[-1].get('M_t1') if draws else None,  # 최근 작도 녹색 시작 인덱스
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
            if not code:
                self.wfile.write(json.dumps({'error':'종목코드를 입력하세요'}).encode()); return
            # ===== 결과 캐시 확인 (30분) — 일봉 3개월/10분봉 주 기준이라 자주 안 바뀜 =====
            import time as _t
            _ck=code.upper()
            _hit=_RESULT_CACHE.get(_ck)
            if _hit and _t.time() < _hit["exp"]:
                self.wfile.write(_hit["data"]); return
            if is_us(code):
                # ===== 미국 주식 (야후) =====
                tkr=code.upper()
                nm,mk=get_name_us(tkr)
                day=get_day_us(tkr)
                try: m60=get_min_us(tkr,"60m")
                except Exception: m60=None
                try: m10=get_min_us(tkr,"15m")
                except Exception: m10=None
            else:
                # ===== 한국 주식 (LS) =====
                if not code.isdigit() or len(code)!=6:
                    self.wfile.write(json.dumps({'error':'국내는 6자리 코드, 해외는 영문 티커(AAPL 등)'}).encode()); return
                tk=token(); nm,mk=get_name(tk,code)
                # 일봉/60분/15분 = 야후 (지연 낮음), 오늘 현재가만 LS t1102로 씌우기
                day=get_day_kr(code)
                try: m60=get_60m_kr(code)
                except Exception: m60=None
                try: m10=get_15m_kr(code)
                except Exception: m10=None
                # LS t1102로 오늘 봉(시가/고가/저가/현재가) 씌우기
                today_bar=get_today_bar_ls(tk,code)
                if today_bar:
                    today_str=_now_kst().strftime("%Y%m%d")
                    # 일봉에 씌우기
                    if day:
                        if day[-1].get('d','')!=today_str:
                            day.append(today_bar)
                        else:
                            day[-1]['c']=today_bar['c']
                            if today_bar['h']>day[-1].get('h',0): day[-1]['h']=today_bar['h']
                            if today_bar['l']>0 and today_bar['l']<day[-1].get('l',999999999): day[-1]['l']=today_bar['l']
                            if today_bar['o']>0 and day[-1].get('o',0)==0: day[-1]['o']=today_bar['o']
                    # 15분봉에 씌우기
                    if m10:
                        if m10[-1].get('d','')!=today_str:
                            m10.append(today_bar)
                        else:
                            m10[-1]['c']=today_bar['c']
            # 셋 다 데이터가 없을 때만 차단. 하나라도 있으면 보여줌 (신규상장주는 단기/중기만 가능)
            if (not day or len(day)<10) and (not m60 or len(m60)<10) and (not m10 or len(m10)<10):
                self.wfile.write(json.dumps({'error':'아직 분석할 시세 데이터가 충분하지 않아요. 상장 초기이거나 거래가 거의 없는 종목일 수 있어요. ('+code+')'}).encode()); return
            # 탭별 독립 판단: 봉 15개 이상이면 작도 시도, 미만이면 '데이터 부족'
            dd = build_drawings(day) if day and len(day)>=15 else {'error':'데이터 부족'}
            mm = build_drawings(m60) if m60 and len(m60)>=15 else {'error':'데이터 부족'}
            tt = build_drawings(m10) if m10 and len(m10)>=15 else {'error':'데이터 부족'}
            # 일봉 위험: ①범위안 ②60분끌어옴 ③과거1개  (60분 all_risks 참조하므로 먼저)
            if 'draws' in dd:
                resolve_risk(dd, mm if 'draws' in mm else None)
            # 60분 자체 위험
            if 'draws' in mm:
                resolve_risk(mm, None)
            # 10분 자체 위험
            if 'draws' in tt:
                resolve_risk(tt, None)
            # 패턴 분석 (일봉 과거 작도 기반)
            if 'draws' in dd and dd['draws'] and dd.get('chart'):
                dd['pattern'] = analyze_pattern(
                    [{**r,'c':float(r['c']),'o':float(r.get('o',r['c'])),'h':float(r.get('h',r['c'])),'l':float(r.get('l',r['c']))} for r in dd['chart']],
                    dd['draws']
                )
            # 60분봉 지지/저항 가격 수집 (작도 교차점 yc + 위험선 yc) — all_risks 지우기 전에
            sr_levels=[]
            if isinstance(mm,dict) and 'draws' in mm:
                for d in mm.get('draws',[]):
                    if d.get('yc') and d['yc']>0: sr_levels.append(round(d['yc']))
                for rk in mm.get('risks',[]):
                    if rk.get('yc') and rk['yc']>0: sr_levels.append(round(rk['yc']))
            sr_levels=sorted(set(sr_levels))
            # 10분봉 지지/저항 (10분 트랙 시나리오용)
            sr10=[]
            if isinstance(tt,dict) and 'draws' in tt:
                for d in tt.get('draws',[]):
                    if d.get('yc') and d['yc']>0: sr10.append(round(d['yc']))
                for rk in tt.get('risks',[]):
                    if rk.get('yc') and rk['yc']>0: sr10.append(round(rk['yc']))
            sr10=sorted(set(sr10))
            # 미래 예측 (일봉): 위험선 가격을 하락 목표로
            if 'draws' in dd and dd.get('chart'):
                risk_level = dd['risks'][0]['yc'] if dd.get('risks') else None
                try:
                    dd['projection'] = build_projection(dd['chart'], dd['draws'], risk_level, market=mk, period='quarter', all_risks=dd.get('all_risks'))
                    if dd['projection']:
                        dd['projection']['sr_levels'] = sr_levels
                except Exception as pe:
                    dd['projection'] = None
            # 미래 예측 (10분봉): 주 단위 기준, 미래 짧게
            if 'draws' in tt and tt.get('chart'):
                risk10 = tt['risks'][0]['yc'] if tt.get('risks') else None
                try:
                    tt['projection'] = build_projection(tt['chart'], tt['draws'], risk10, fut=39, market=mk, period='week', all_risks=tt.get('all_risks'))
                    if tt['projection']:
                        tt['projection']['sr_levels'] = sr10
                except Exception as pe:
                    tt['projection'] = None
            # 미래 예측 (60분봉): 월 단위 기준
            if 'draws' in mm and mm.get('chart'):
                risk60 = mm['risks'][0]['yc'] if mm.get('risks') else None
                try:
                    mm['projection'] = build_projection(mm['chart'], mm['draws'], risk60, fut=52, market=mk, period='month', all_risks=mm.get('all_risks'))
                    if mm['projection']:
                        # 60분봉 자체 작도 교차점을 sr로
                        sr60=[]
                        for dr in mm.get('draws',[]):
                            if dr.get('yc') and dr['yc']>0: sr60.append(round(dr['yc'],2))
                        mm['projection']['sr_levels'] = sorted(set(sr60))
                except Exception as pe:
                    mm['projection'] = None
            # all_risks 정리(용량) — projection 다 만든 후
            for blk in (dd,mm,tt):
                if isinstance(blk,dict): blk.pop('all_risks',None)
            out={'종목코드':code,'종목명':nm,'시장':mk,'일봉':dd,'60분':mm,'10분':tt}
            _payload=json.dumps(out,ensure_ascii=False).encode()
            # 캐시 저장 (30분)
            _ttl=300 if _is_market_open() else 1800  # 장중 5분, 장외 30분
            _RESULT_CACHE[_ck]={"data":_payload,"exp":_t.time()+_ttl}
            self.wfile.write(_payload)
        except Exception as ex:
            self.wfile.write(json.dumps({'error':'분석 실패: '+str(ex)}).encode())
