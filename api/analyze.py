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
            'xc':round(xc,2),'yc':round(yc,1)
        })

    chart=[{'i':i,'d':(bars[i].get('d','')[4:6]+'/'+bars[i].get('d','')[6:8]+(' '+str(bars[i]['t']).zfill(6)[:2]+'시' if 't' in bars[i] else '')),
            'o':int(bars[i]['o']),'h':int(bars[i]['h']),'l':int(bars[i]['l']),'c':int(bars[i]['c']),
            'v':int(bars[i].get('v',0) or 0),
            'm2':round(MA2[i],1) if MA2[i] is not None else None} for i in range(len(bars))]
    return {'chart':chart,'draws':draws,'all_risks':all_risks,'draws_start':draws_start,'cur':int(c[-1])}

def build_projection(bars, draws, risk_level, fut=63, market=''):
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
    up_target=cur+up_slope*fut*0.6  # 차트에 그릴 풀 목표(녹색선 연장 끝) — 작도 그대로, 희망 상한
    up_reach=cur+up_slope*fut*0.30  # 확률 계산용 현실 목표(녹색선 절반쯤, 검증상 ~49%)
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
    mc_target=int(sim_median_end())
    def prob_reach(level, up=True):
        return sim_prob(level, up, drift_up if up else mu*0.5)
    methods={
        'ell':{'up':prob_reach(cur+(up_reach-cur)*1.1,True),'dn':prob_reach(cur+(dn_reach-cur)*1.1,False)},
        'fib':{'up':prob_reach(cur*1.12,True),'dn':prob_reach(cur*0.90,False)},
        'gann':{'up':prob_reach(cur+(up_reach-cur)*0.85,True),'dn':prob_reach(cur+(dn_reach-cur)*0.85,False)},
        'mc':{'up':mc_up,'dn':mc_dn},
    }
    # ===== 변동성 과열 신호 (백테스트 검증됨) =====
    # 2σ목표 > 작도녹색목표 → 변동성이 작도추세보다 과함 = 과열
    # 백테스트(2669종목 12528건): 상승27% / 하락28.5% / 횡보44.5% — 상승신호 아님, 코스닥은 하락우위
    overheat = tgt_2sig > up_target
    # 시장별 검증 확률 (market: 코스피/코스닥)
    if market == '코스닥':
        oh_prob = {'up':27, 'dn':32, 'flat':41}  # 코스닥: 하락 우위
    else:
        oh_prob = {'up':28, 'dn':22, 'flat':51}  # 코스피: 약한 상승 우위
    # 기법 목표를 작도 녹색 상한으로 캡 (녹색 넘지 않게)
    cap_price = int(up_target)
    ell_capped  = min(int(tgt_15sig), cap_price)
    gann_capped = min(int(tgt_1sig),  cap_price)
    fib_up_cap  = min(int(tgt_2sig),  cap_price)
    mc_capped   = min(mc_target, cap_price) if mc_target>cur else mc_target
    # 최근 살아있는 작도의 녹색 시작 인덱스
    green_start = alive[-1].get('M_t1') if alive else (draws[-1].get('M_t1') if draws else None)
    return {
        'fut':fut, 'cur':int(cur),
        'up_slope':round(up_slope,3), 'up_target':int(up_target),
        'dn_target':int(dn_target),
        'volatility':round(sd,4), 'drift':round(mu,5),
        'mc_up':mc_up, 'mc_dn':mc_dn, 'mc_target':mc_target,
        'methods':methods,
        'tech_targets':{
            'ell':ell_capped,
            'mc':mc_capped,
            'gann':gann_capped,
            'fib_up':fib_up_cap,
            'fib_dn':int(dn_1sig),
            'cap':cap_price,
        },
        'overheat':overheat, 'overheat_prob':oh_prob,
        'fib_levels':[round(cur*f) for f in (1.236,1.382,1.618,0.786,0.618)],
        'green_start': green_start,
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
            # 패턴 분석 (일봉 과거 작도 기반)
            if 'draws' in dd and dd['draws'] and dd.get('chart'):
                dd['pattern'] = analyze_pattern(
                    [{**r,'c':float(r['c']),'o':float(r.get('o',r['c'])),'h':float(r.get('h',r['c'])),'l':float(r.get('l',r['c']))} for r in dd['chart']],
                    dd['draws']
                )
            # all_risks 정리(용량)
            for blk in (dd,mm):
                if isinstance(blk,dict): blk.pop('all_risks',None)
            # 미래 예측 (일봉만): 위험선 가격을 하락 목표로
            if 'draws' in dd and dd.get('chart'):
                risk_level = dd['risks'][0]['yc'] if dd.get('risks') else None
                try:
                    dd['projection'] = build_projection(dd['chart'], dd['draws'], risk_level, market=mk)
                except Exception as pe:
                    dd['projection'] = None
            out={'종목코드':code,'종목명':nm,'시장':mk,'일봉':dd,'60분':mm}
            self.wfile.write(json.dumps(out,ensure_ascii=False).encode())
        except Exception as ex:
            self.wfile.write(json.dumps({'error':'분석 실패: '+str(ex)}).encode())
