# ============================================================
#  JOIN CHART 스캐너 (코스피 + 코스닥)
#  GitHub Actions가 매일 자동 실행 → result.json 생성
#  차트 데이터 + 작도선 + 매수/매도 시점 포함
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
최근신호_봉수   = 3
완만도기준      = 0.7

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

def find_turns(s,w=2):
    t=[];v=s.values;n=len(v)
    for i in range(w,n-w):
        seg=v[i-w:i+w+1];c=v[i]
        if c==np.nanmax(seg) or c==np.nanmin(seg): t.append(i)
    return t

def scan_one(d):
    if d is None or len(d)<80: return None
    d['MA2']=d['종가'].rolling(2).mean()
    d['MA5']=d['종가'].rolling(5).mean()
    d['MA20']=d['종가'].rolling(20).mean()
    e12=d['종가'].ewm(span=12).mean(); e26=d['종가'].ewm(span=26).mean()
    d['MACDh']=(e12-e26)-(e12-e26).ewm(span=9).mean()
    ma2=d['MA2']; turns=find_turns(ma2,2); last=len(d)-1
    segs=[]
    for i in range(len(turns)-1):
        a,b=turns[i],turns[i+1]
        if b==a: continue
        segs.append({'t0':a,'t1':b,'y0':float(ma2.iloc[a]),'y1':float(ma2.iloc[b]),'slope':(ma2.iloc[b]-ma2.iloc[a])/(b-a)})
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
        if entry<last-최근신호_봉수 or entry>last: continue
        e=min(entry,last)
        t20=bool(d['종가'].iloc[e]>d['MA20'].iloc[e])
        macd=bool(d['MACDh'].iloc[e]>0)
        w=sb/sa
        star='★★★' if(t20 and macd and w<완만도기준) else '★★' if(t20 and macd) else '★' if t20 else '-'

        # 상승각도
        up_slope=(d['MA2'].iloc[B['t0']]-d['MA2'].iloc[A['t1']])/(B['t0']-A['t1']) if B['t0']!=A['t1'] else 0

        # 매도 시점: 상승각도선 이탈
        sell_idx=None
        for k in range(entry+1, min(entry+30, last+1)):
            trend_y=d['MA2'].iloc[A['t1']]+up_slope*(k-A['t1'])
            if d['MA2'].iloc[k]<trend_y:
                sell_idx=k; break

        # 차트 데이터 (A 시작점 5봉 전부터)
        start=max(0, A['t0']-5)
        chart=[]
        for k in range(start, last+1):
            chart.append({
                'd': d['날짜'].iloc[k] if hasattr(d['날짜'].iloc[k],'strftime') else str(d['날짜'].iloc[k]),
                'o': int(d['시가'].iloc[k]),'h': int(d['고가'].iloc[k]),
                'l': int(d['저가'].iloc[k]),'c': int(d['종가'].iloc[k]),
                'm2': round(float(d['MA2'].iloc[k]),1) if not pd.isna(d['MA2'].iloc[k]) else None,
                'm5': round(float(d['MA5'].iloc[k]),1) if not pd.isna(d['MA5'].iloc[k]) else None,
            })

        def r(idx): return idx-start

        drawing={
            'A_x0':r(A['t0']),'A_y0':A['y0'],
            'A_x1':r(A['t1']),'A_y1':A['y1'],
            'B_x0':r(B['t0']),'B_y0':B['y0'],
            'B_x1':r(B['t1']),'B_y1':B['y1'],
            'xc':float(xc-start),'yc':float(A['y1']+sa*(xc-A['t1'])),
            'up_x0':r(A['t1']),'up_y0':float(d['MA2'].iloc[A['t1']]),
            'up_slope':float(up_slope),
            'entry_x':r(entry),
            'sell_x':r(sell_idx) if sell_idx else None,
        }

        return {'현재가':int(d['종가'].iloc[last]),'완만도':round(float(w),2),
                '20일선위':t20,'MACD양전':macd,'추천도':star,
                'chart':chart,'drawing':drawing}
    return None

def main():
    print("토큰 발급 중...")
    token=get_token()
    print("종목 리스트 받는 중...")
    kospi=get_stock_list(token,"1")
    kosdaq=get_stock_list(token,"2")
    stocks=pd.concat([kospi,kosdaq],ignore_index=True)
    codes=stocks["shcode"].tolist()
    names=dict(zip(stocks["shcode"],stocks["hname"]))
    markets=dict(zip(stocks["shcode"],stocks["시장"]))
    print(f"전체 {len(codes)}종목 스캔 시작...")

    results=[]
    for idx,code in enumerate(codes):
        d=get_day(token,code)
        if d is not None and len(d)>30:
            amt=(d['종가']*d['거래량']).mean()
            if amt>=거래대금기준_억*1e8:
                r=scan_one(d)
                if r:
                    r['종목코드']=code
                    r['종목명']=names.get(code,'')
                    r['시장']=markets.get(code,'')
                    results.append(r)
        if (idx+1)%200==0: print(f"  {idx+1}/{len(codes)} (발견 {len(results)})")
        time.sleep(1.0)

    order={'★★★':0,'★★':1,'★':2,'-':3}
    results.sort(key=lambda x:order.get(x['추천도'],9))
    out={'업데이트':time.strftime('%Y-%m-%d %H:%M'),'종목수':len(results),'결과':results}
    with open('result.json','w',encoding='utf-8') as f:
        json.dump(out,f,ensure_ascii=False)
    print(f"\n완료! {len(results)}종목 저장")

if __name__=="__main__":
    main()
