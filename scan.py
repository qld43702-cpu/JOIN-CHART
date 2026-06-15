# ============================================================
#  JOIN CHART 스캐너 — 일봉(스윙) + 60분봉(데이트레이딩) 두 트랙
#  GitHub Actions 매일 자동 실행
#   - result_day.json   : 일봉 스윙 스캔 결과
#   - result_60m.json   : 60분봉 데이트레이딩 스캔 결과
#   - stocks.json       : 자동완성용 전체 종목 리스트(코드+이름+시장)
# ============================================================
import os, json, time, requests
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')

APP_KEY    = os.environ["LS_APP_KEY"]
APP_SECRET = os.environ["LS_APP_SECRET"]
BASE = "https://openapi.ls-sec.co.kr:8080"

거래대금기준_억 = 100

def get_token():
    url=f"{BASE}/oauth2/token"
    h={"Content-Type":"application/x-www-form-urlencoded"}
    p={"grant_type":"client_credentials","appkey":APP_KEY,"appsecretkey":APP_SECRET,"scope":"oob"}
    return requests.post(url,verify=False,headers=h,params=p).json()["access_token"]

def get_stock_list(token, gubun):
    h={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {token}","tr_cd":"t8436","tr_cont":"N"}
    res=requests.post(f"{BASE}/stock/etc",verify=False,headers=h,json={"t8436InBlock":{"gubun":gubun}})
    d=pd.DataFrame(res.json()["t8436OutBlock"])
    d=d[(d["etfgubun"]=="0")&(d["spac_gubun"]=="N")]
    d["시장"]="코스피" if gubun=="1" else "코스닥"
    return d

def get_day(token, code):
    h={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {token}","tr_cd":"t8410","tr_cont":"N"}
    body={"t8410InBlock":{"shcode":code,"gubun":"2","qrycnt":300,"sdate":"20240101","edate":"20991231","cts_date":"","comp_yn":"N","sujung":"Y"}}
    res=requests.post(f"{BASE}/stock/chart",verify=False,headers=h,json=body)
    try:
        d=pd.DataFrame(res.json()["t8410OutBlock1"])
        d=d[["date","open","high","low","close","jdiff_vol"]]
        d.columns=["날짜","시가","고가","저가","종가","거래량"]
        for c in d.columns: d[c]=pd.to_numeric(d[c],errors='coerce')
        return d.sort_values("날짜").reset_index(drop=True)
    except: return None

def get_min(token, code, ncnt=60, pages=4):
    rows=[]; cd=""; ct=""
    for _ in range(pages):
        h={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {token}","tr_cd":"t8412","tr_cont":"N" if cd=="" else "Y"}
        body={"t8412InBlock":{"shcode":code,"ncnt":ncnt,"qrycnt":500,"nday":"0","sdate":"20250101","edate":"20991231","cts_date":cd,"cts_time":ct,"comp_yn":"N"}}
        res=requests.post(f"{BASE}/stock/chart",verify=False,headers=h,json=body)
        j=res.json(); r=j.get("t8412OutBlock1",[])
        if not r: break
        rows.extend(r)
        ob=j.get("t8412OutBlock",{}); nd=ob.get("cts_date","").strip(); nt=ob.get("cts_time","").strip()
        if (nd==cd and nt==ct) or nd=="": break
        cd,ct=nd,nt; time.sleep(0.5)
    if not rows: return None
    d=pd.DataFrame(rows)[["date","time","open","high","low","close","jdiff_vol"]]
    d.columns=["날짜","시간","시가","고가","저가","종가","거래량"]
    for c in ["시가","고가","저가","종가","거래량"]: d[c]=pd.to_numeric(d[c],errors='coerce')
    return d.drop_duplicates(subset=["날짜","시간"]).reset_index(drop=True)

def find_turns(s,w=2):
    t=[];v=s.values;n=len(v)
    for i in range(w,n-w):
        seg=v[i-w:i+w+1];c=v[i]
        if c==np.nanmax(seg) or c==np.nanmin(seg): t.append(i)
    return t

def build_segs(ma2):
    turns=find_turns(ma2,2); segs=[]
    for i in range(len(turns)-1):
        a,b=turns[i],turns[i+1]
        if b==a: continue
        segs.append({'t0':a,'t1':b,'y0':float(ma2.iloc[a]),'y1':float(ma2.iloc[b]),'slope':(ma2.iloc[b]-ma2.iloc[a])/(b-a)})
    return segs

def chart_and_draw(d, A, B, sa, entry, last, fields):
    start=max(0, A['t0']-5); chart=[]
    for k in range(start, last+1):
        row={'d': fields(d,k),'o':int(d['시가'].iloc[k]),'h':int(d['고가'].iloc[k]),
             'l':int(d['저가'].iloc[k]),'c':int(d['종가'].iloc[k]),
             'm2':round(float(d['MA2'].iloc[k]),1) if not pd.isna(d['MA2'].iloc[k]) else None,
             'm5':round(float(d['MA5'].iloc[k]),1) if not pd.isna(d['MA5'].iloc[k]) else None}
        chart.append(row)
    def r(idx): return idx-start
    xc=A['xc']; yc=A['yc']; up_slope=A['up_slope']
    drawing={'A_x0':r(A['t0']),'A_y0':A['y0'],'A_x1':r(A['t1']),'A_y1':A['y1'],
             'B_x0':r(B['t0']),'B_y0':B['y0'],'B_x1':r(B['t1']),'B_y1':B['y1'],
             'xc':float(xc-start),'yc':yc,'up_x0':r(A['t1']),'up_y0':float(d['MA2'].iloc[A['t1']]),
             'up_slope':up_slope,'entry_x':r(entry)}
    return chart, drawing

# ---- 일봉 분석 (스윙: 완만도+추세+MACD, -4/+12) ----
def analyze_day(d):
    if d is None or len(d)<80: return None
    d=d.copy()
    d['MA2']=d['종가'].rolling(2).mean(); d['MA5']=d['종가'].rolling(5).mean(); d['MA20']=d['종가'].rolling(20).mean()
    e12=d['종가'].ewm(span=12).mean(); e26=d['종가'].ewm(span=26).mean()
    d['MACDh']=(e12-e26)-(e12-e26).ewm(span=9).mean()
    d['VMA20']=d['거래량'].rolling(20).mean()
    segs=build_segs(d['MA2']); last=len(d)-1
    for i in range(len(segs)-2):
        A,M,B=segs[i],segs[i+1],segs[i+2]
        if A['slope']>=0 or M['slope']<=0 or B['slope']>=0: continue
        if B['slope']<=A['slope']: continue
        price=d['종가'].iloc[B['t1']]; a_pct=A['slope']/price*100
        if a_pct>=-0.3: continue
        sa,sb=A['slope'],B['slope']; denom=sa-sb
        if abs(denom)<1e-9: continue
        xc=(B['y1']-A['y1']-sb*B['t1']+sa*A['t1'])/denom
        if xc>=min(A['t0'],B['t0']) or xc<0: continue
        entry=B['t1']+1
        if entry<last-3 or entry>last: continue
        e=min(entry,last)
        t20=bool(d['종가'].iloc[e]>d['MA20'].iloc[e]) if not pd.isna(d['MA20'].iloc[e]) else False
        macd=bool(d['MACDh'].iloc[e]>0) if not pd.isna(d['MACDh'].iloc[e]) else False
        w=sb/sa
        if not t20: return None
        star='★★★' if (t20 and macd and w<0.7) else '★★' if (t20 and macd) else '★'
        ep=float(d['시가'].iloc[entry]) if entry<len(d) else float(d['종가'].iloc[last])
        yc=float(A['y1']+sa*(xc-A['t1']))
        up_slope=(d['MA2'].iloc[B['t0']]-d['MA2'].iloc[A['t1']])/(B['t0']-A['t1']) if B['t0']!=A['t1'] else 0
        A.update({'xc':xc,'yc':yc,'up_slope':up_slope})
        chart,drawing=chart_and_draw(d,A,B,sa,entry,last,
            lambda d,k: d['날짜'].iloc[k].strftime('%m/%d') if hasattr(d['날짜'].iloc[k],'strftime') else str(int(d['날짜'].iloc[k])))
        cur=float(d['종가'].iloc[last])
        target2=ep*1.12; stop=ep*0.96
        passed = cur>target2  # 2차 익절 위 = 시점 지남
        return {'track':'day','추천도':star,'완만도':round(float(w),2),'20일선위':t20,'MACD양전':macd,
                '현재가':int(cur),'매수가':int(ep),'1차익절':int(yc),'2차익절':int(target2),'손절가':int(stop),
                '시점지남':bool(passed),'잔여여력_pct':round((target2/cur-1)*100,1) if cur<target2 else 0.0,
                'chart':chart,'drawing':drawing}
    return None

# ---- 60분 분석 (데이트레이딩: 최신교차점+거래량2배+추세, -2/+4) ----
def analyze_60m(d):
    if d is None or len(d)<120: return None
    d=d.copy()
    d['MA2']=d['종가'].rolling(2).mean(); d['MA5']=d['종가'].rolling(5).mean(); d['MA20']=d['종가'].rolling(20).mean()
    d['VMA20']=d['거래량'].rolling(20).mean()
    segs=build_segs(d['MA2']); last=len(d)-1
    cross=[]
    for i in range(len(segs)-2):
        A,M,B=segs[i],segs[i+1],segs[i+2]
        if A['slope']>=0 or M['slope']<=0 or B['slope']>=0: continue
        if B['slope']<=A['slope']: continue
        price=d['종가'].iloc[B['t1']]; a_pct=A['slope']/price*100
        if a_pct>=-0.1: continue
        sa,sb=A['slope'],B['slope']; denom=sa-sb
        if abs(denom)<1e-9: continue
        xc=(B['y1']-A['y1']-sb*B['t1']+sa*A['t1'])/denom
        if xc>=min(A['t0'],B['t0']) or xc<0: continue
        cross.append((A,B,sa,sb,xc))
    if not cross: return None
    A,B,sa,sb,xc=cross[-1]  # 최신 교차점
    entry=B['t1']+1
    if entry>last: return None
    e=min(entry,last)
    vol2 = (not pd.isna(d['VMA20'].iloc[e])) and d['VMA20'].iloc[e]>0 and d['거래량'].iloc[e]>=d['VMA20'].iloc[e]*2
    t20 = bool(d['종가'].iloc[e]>d['MA20'].iloc[e]) if not pd.isna(d['MA20'].iloc[e]) else False
    star='★★' if (vol2 and t20) else '★' if t20 else '-'
    if star=='-': return None
    ep=float(d['시가'].iloc[entry]) if entry<len(d) else float(d['종가'].iloc[last])
    yc=float(A['y1']+sa*(xc-A['t1']))
    up_slope=(d['MA2'].iloc[B['t0']]-d['MA2'].iloc[A['t1']])/(B['t0']-A['t1']) if B['t0']!=A['t1'] else 0
    A2=dict(A); A2.update({'xc':xc,'yc':yc,'up_slope':up_slope})
    chart,drawing=chart_and_draw(d,A2,B,sa,entry,last,
        lambda d,k: (str(int(d['날짜'].iloc[k]))[4:6]+'/'+str(int(d['날짜'].iloc[k]))[6:8]+' '+str(int(d['시간'].iloc[k])).zfill(6)[:2]+'시'))
    cur=float(d['종가'].iloc[last]); target=ep*1.04; stop=ep*0.98
    passed = cur>target
    bars_since = last-entry
    return {'track':'60m','추천도':star,'거래량2배':bool(vol2),'20일선위':t20,
            '현재가':int(cur),'매수가':int(ep),'익절가':int(target),'손절가':int(stop),
            '시점지남':bool(passed or bars_since>10),'경과봉':int(bars_since),
            'chart':chart,'drawing':drawing}

def main():
    print("토큰..."); token=get_token()
    print("종목 리스트..."); 
    kospi=get_stock_list(token,"1"); kosdaq=get_stock_list(token,"2")
    stocks=pd.concat([kospi,kosdaq],ignore_index=True)
    codes=stocks["shcode"].tolist()
    names=dict(zip(stocks["shcode"],stocks["hname"])); markets=dict(zip(stocks["shcode"],stocks["시장"]))

    # 자동완성용 전체 리스트 저장
    slist=[{'code':c,'name':names.get(c,''),'market':markets.get(c,'')} for c in codes]
    with open('stocks.json','w',encoding='utf-8') as f: json.dump(slist,f,ensure_ascii=False)

    day_res=[]; m60_res=[]
    print(f"{len(codes)}종목 스캔...")
    for idx,code in enumerate(codes):
        d=get_day(token,code)
        if d is not None and len(d)>30:
            amt=(d['종가']*d['거래량']).mean()
            if amt>=거래대금기준_억*1e8:
                r=analyze_day(d)
                if r and not r['시점지남']:
                    r.update({'종목코드':code,'종목명':names.get(code,''),'시장':markets.get(code,'')})
                    day_res.append(r)
                # 60분 (코스닥 위주, 일봉 거래대금 통과 종목만)
                m=get_min(token,code,60,3)
                rm=analyze_60m(m)
                if rm and not rm['시점지남']:
                    rm.update({'종목코드':code,'종목명':names.get(code,''),'시장':markets.get(code,'')})
                    m60_res.append(rm)
        if (idx+1)%200==0: print(f"  {idx+1}/{len(codes)} (일봉{len(day_res)} 60분{len(m60_res)})")
        time.sleep(1.0)

    order={'★★★':0,'★★':1,'★':2}
    day_res.sort(key=lambda x:(order.get(x['추천도'],9), 0 if x['시장']=='코스닥' else 1))
    m60_res.sort(key=lambda x:(order.get(x['추천도'],9), 0 if x['시장']=='코스닥' else 1))
    now=time.strftime('%Y-%m-%d %H:%M')
    with open('result_day.json','w',encoding='utf-8') as f: json.dump({'업데이트':now,'종목수':len(day_res),'결과':day_res},f,ensure_ascii=False)
    with open('result_60m.json','w',encoding='utf-8') as f: json.dump({'업데이트':now,'종목수':len(m60_res),'결과':m60_res},f,ensure_ascii=False)
    print(f"완료! 일봉 {len(day_res)} / 60분 {len(m60_res)}")

if __name__=="__main__":
    main()
