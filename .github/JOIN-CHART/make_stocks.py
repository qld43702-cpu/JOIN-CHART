# ============================================================
#  자동완성용 종목 리스트(stocks.json) 1회 생성 스크립트
#  본인 PC에서 한 번만 실행하면 됨 (매일 돌릴 필요 X)
#  실행: LS_APP_KEY, LS_APP_SECRET 환경변수 설정 후
#        python make_stocks.py
#  → stocks.json 생성 → GitHub에 올리면 자동완성 작동
# ============================================================
import os, json, requests
import pandas as pd

APP_KEY=os.environ.get("LS_APP_KEY","").strip()
APP_SECRET=os.environ.get("LS_APP_SECRET","").strip()
BASE="https://openapi.ls-sec.co.kr:8080"

def get_token():
    r=requests.post(f"{BASE}/oauth2/token",verify=False,
        headers={"Content-Type":"application/x-www-form-urlencoded"},
        params={"grant_type":"client_credentials","appkey":APP_KEY,"appsecretkey":APP_SECRET,"scope":"oob"})
    return r.json()["access_token"]

def get_list(tk,gubun):
    r=requests.post(f"{BASE}/stock/etc",verify=False,
        headers={"Content-Type":"application/json; charset=UTF-8","authorization":f"Bearer {tk}","tr_cd":"t8436","tr_cont":"N"},
        json={"t8436InBlock":{"gubun":gubun}})
    d=pd.DataFrame(r.json()["t8436OutBlock"])
    d=d[(d["etfgubun"]=="0")&(d["spac_gubun"]=="N")]
    return [{'code':row['shcode'],'name':row['hname'],'market':'코스피' if gubun=='1' else '코스닥'} for _,row in d.iterrows()]

if __name__=="__main__":
    if not APP_KEY or not APP_SECRET:
        raise SystemExit("환경변수 LS_APP_KEY / LS_APP_SECRET 설정 필요")
    tk=get_token()
    stocks=get_list(tk,"1")+get_list(tk,"2")
    with open("stocks.json","w",encoding="utf-8") as f:
        json.dump(stocks,f,ensure_ascii=False)
    print(f"stocks.json 생성 완료: {len(stocks)}종목 (코스피+코스닥)")
