// ===== JOIN-CHART 공유 차트 코어 (BUILD:1782268651) =====
// index.html(유저)와 chart.html(어드민 iframe)이 공유.
// 드로잉은 admin이 postMessage('drawOn')을 보낼 때만 활성화됨.

var STOCKS=[];
fetch('/stocks.json?t='+Date.now()).then(function(r){return r.json();}).then(function(s){STOCKS=s||[];}).catch(function(){STOCKS=[];});
// URL 파라미터 자동 검색
(function(){var p=new URLSearchParams(window.location.search),c=p.get('code');if(c)setTimeout(function(){go(c.toUpperCase());},300);})();
var inp=document.getElementById('codeInput'), ac=document.getElementById('acList');
inp.addEventListener('input',function(){
  var q=inp.value.trim().toLowerCase();
  if(!q){ showRecent(); return; }
  var hit=STOCKS.filter(function(s){return s.code.toLowerCase().includes(q)||(s.name&&s.name.toLowerCase().includes(q));}).slice(0,8);
  if(!hit.length){ac.classList.remove('show');return;}
  ac.innerHTML=hit.map(function(s){return '<div class="ai" onclick="pick(\''+s.code+'\',\''+((s.name||'').replace(/\'/g,''))+'\')"><span class="an">'+s.name+'</span><span class="acode">'+s.code+'</span><span class="amk">'+s.market+'</span></div>';}).join('');
  ac.classList.add('show');
});
function doSearch(){
  var q=inp.value.trim(); if(!q)return;
  ac.classList.remove('show');
  var m=q.match(/(\d{6})/); if(m){go(m[1]);return;}
  var ql=q.toLowerCase();
  var hit=STOCKS.find(function(s){return s.name&&s.name.toLowerCase()===ql;})||STOCKS.find(function(s){return s.name&&s.name.toLowerCase().includes(ql);});
  if(hit){pick(hit.code,hit.name);return;}
  if(/^[A-Za-z][A-Za-z.\-]{0,6}$/.test(q)){go(q.toUpperCase());return;}
  var hit2=STOCKS.find(function(s){return s.code.includes(q);}); if(hit2){pick(hit2.code,hit2.name);}
}
inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();inp.blur();doSearch();}});
// 검색 아이콘: chart.html은 #hdSearchIcon, index.html은 .hs-ic — 둘 다 안전하게 연결
var _searchIcon=document.getElementById('hdSearchIcon')||document.querySelector('.hs-ic');
if(_searchIcon) _searchIcon.addEventListener('click',doSearch);
document.addEventListener('click',function(e){if(!e.target.closest('.hd-search')&&!e.target.closest('.hero-search'))ac.classList.remove('show');});
function pick(code,name){inp.value=name+' ('+code+')';ac.classList.remove('show');inp.blur();saveRecent(code,name);go(code);}

// ===== 최근 검색 (localStorage, 기기별) =====
function getRecent(){
  try{ return JSON.parse(localStorage.getItem('jc_recent')||'[]'); }catch(e){ return []; }
}
function saveRecent(code,name){
  try{
    var list=getRecent().filter(function(x){return x.code!==code;});
    list.unshift({code:code,name:name||code});
    list=list.slice(0,8);  // 최대 8개
    localStorage.setItem('jc_recent',JSON.stringify(list));
  }catch(e){}
}
function removeRecent(code){
  try{
    var list=getRecent().filter(function(x){return x.code!==code;});
    localStorage.setItem('jc_recent',JSON.stringify(list));
  }catch(e){}
  showRecent();
}
function clearRecent(){
  try{ localStorage.removeItem('jc_recent'); }catch(e){}
  ac.classList.remove('show');
}
function showRecent(){
  var list=getRecent();
  if(!list.length){ ac.classList.remove('show'); return; }
  var chips=list.map(function(x){
    var nm=(x.name||x.code).replace(/'/g,'');
    return '<span class="rchip" onclick="pick(\''+x.code+'\',\''+nm+'\')">'+
      '<span class="rc-nm">'+(x.name||x.code)+'</span>'+
      '<span class="rc-x" onclick="event.stopPropagation();removeRecent(\''+x.code+'\')">×</span></span>';
  }).join('');
  ac.innerHTML='<div class="rc-head"><span>최근 검색</span><span class="rc-clear" onclick="clearRecent()">전체삭제</span></div>'+
    '<div class="rc-wrap">'+chips+'</div>';
  ac.classList.add('show');
}
// 검색창 포커스 시 입력이 비어있으면 최근 검색 표시
inp.addEventListener('focus',function(){
  inp.value='';      // 클릭 순간 입력값 비움 (바로 새로 칠 수 있게)
  showRecent();      // 최근 검색 표시
});

function mkMethodLabel(val,nm,col,methods){
  return '<label><input type="checkbox" class="mtd" value="'+val+'" checked style="accent-color:'+col+'"> '+nm+'</label>';
}

async function go(code){
  var box=document.getElementById('result');
  var guide=document.getElementById('guide'); if(guide)guide.style.display='none';
  var hero=document.getElementById('heroIntro'); if(hero)hero.style.display='none';
  box.innerHTML='<div class="loading"><div class="rtv-spin"><div class="rtv-core">RTV</div><div class="rtv-ring"></div></div><div class="ltxt">JOIN 고유 RTV 엔진 가동 중</div><div class="lsub">엘리엇 · 피보나치 · 몬테카를로 · 갠 · 공방선 교차 분석</div><div class="load-chips"><span class="lchip" style="--c:#7f77dd">엘리엇</span><span class="lchip" style="--c:#1d9e75">피보나치</span><span class="lchip" style="--c:#3f7fd0">몬테카를로</span><span class="lchip" style="--c:#ba7517">갠</span><span class="lchip" style="--c:#ed7d31">공방선</span></div></div>';
  try{
    var x=await fetch('/api/analyze?code='+code).then(function(r){return r.json();});
    if(x.error){box.innerHTML='<div class="empty">'+x.error+'</div>';return;}
    if(x['종목명']) saveRecent(x['종목코드']||code, x['종목명']);
    render(x);
  }catch(e){box.innerHTML='<div class="empty">분석 실패. 잠시 후 다시 시도하세요.</div>';}
}
function goHome(){
  document.getElementById('result').innerHTML='';
  var guide=document.getElementById('guide'); if(guide)guide.style.display='block';
  var hero=document.getElementById('heroIntro'); if(hero)hero.style.display='block';
  var inp2=document.getElementById('codeInput'); if(inp2){inp2.value='';inp2.blur();}
  window.scrollTo(0,0);
}

function trackHtml(sfx, label, hint, isUS){
  // 한 트랙(차트+기법+줌+시나리오)의 HTML 생성. sfx로 ID 분리.
  var minName='15분봉';
  var h='<div id="host'+sfx+'" class="track">';
  h+='<div class="methods">';
  h+='<label><input type="checkbox" class="mtd" value="ell" style="accent-color:#7f77dd"> 엘리엇</label>';
  h+='<label><input type="checkbox" class="mtd" value="mc" style="accent-color:#378add"> 몬테카를로</label>';
  h+='<label><input type="checkbox" class="mtd" value="fib" style="accent-color:#1d9e75"> 피보나치</label>';
  h+='<label><input type="checkbox" class="mtd" value="gann" style="accent-color:#ba7517"> 갠</label>';
  h+='</div>';
  h+='<div class="zoombar"><button id="zin'+sfx+'">+ 확대</button><button id="zout'+sfx+'">− 축소</button><button id="zall'+sfx+'">전체</button></div>';
  h+='<div class="chart-host" style="position:relative;"><canvas id="cv'+sfx+'"></canvas><canvas class="draw-canvas" id="dcv'+sfx+'"></canvas><div class="linetip" id="tip'+sfx+'"></div></div>';
  h+='<div class="legend"><span><i style="background:#1d9e75"></i>상승목표</span><span><i style="background:#5a6473"></i>상승잠재</span><span><i style="background:#d4537e"></i>공방선</span></div>';
  h+='<div class="scen-btns">';
  h+='<button class="scen-btn up" data-scen="up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 15l5-6 4 3 7-8"/></svg>상승 시나리오</button>';
  h+='<button class="scen-btn dn" data-scen="dn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9l5 6 4-3 7 8"/></svg>하락 시나리오</button>';
  h+='</div>';
  h+='<div class="scen-hint">'+hint+'</div>';
  h+='</div>'; // host
  return h;
}

function render(x){
  var d=x['일봉'];
  var box=document.getElementById('result');
  if(!d||d.error||!d.chart){box.innerHTML='<div class="empty">'+((d&&d.error)||'데이터 없음')+'</div>';return;}
  var pj=d.projection||{methods:{}};
  var IS_US=(x['시장']==='미국');
  window.__IS_US=IS_US;
  var t60=x['60분']; var has60 = t60 && !t60.error && t60.chart && t60.projection;
  var t10=x['10분']; var has10 = t10 && !t10.error && t10.chart && t10.projection;
  var minName='15분봉';
  var html='';
  var priceStr = IS_US ? ('$'+(d.cur||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})) : ((d.cur||0).toLocaleString()+'원');
  // 등락: 차트 마지막 봉 시가 대비 현재가 (전일종가 기준 근사)
  var _lastBar = (d.chart&&d.chart.length)?d.chart[d.chart.length-1]:null;
  var _prevClose = (d.chart&&d.chart.length>=2)?d.chart[d.chart.length-2].c:(_lastBar?_lastBar.o:d.cur);
  var _chg = (d.cur||0)-_prevClose;
  var _chgPct = _prevClose>0?(_chg/_prevClose*100):0;
  var _upColor = _chg>0?'#e24b4a':(_chg<0?'#378add':'#5a6b7d');
  var _arrow = _chg>0?'▲':(_chg<0?'▼':'-');
  var _chgStr = (IS_US?('$'+Math.abs(_chg).toFixed(2)):(Math.abs(Math.round(_chg)).toLocaleString()))+' '+Math.abs(_chgPct).toFixed(2)+'%';
  html+='<div class="result-head"><span class="rn">'+(x['종목명']||'')+'</span><span class="rc">'+x['종목코드']+' · '+(x['시장']||'')+'</span><span class="rp" style="color:'+_upColor+'">'+priceStr+'<span style="font-size:12px;font-weight:600;margin-left:6px">'+_arrow+' '+_chgStr+'</span></span></div>';

  // ===== 탭 =====
  html+='<div class="trk-tabs">';
  html+='<button class="trk-tab" data-trk="10"'+(has10?'':' style="display:none"')+'>단기<span>'+minName+'</span></button>';
  html+='<button class="trk-tab'+(has60?' on':'')+'" data-trk="60"'+(has60?'':' style="display:none"')+'>중기<span>60분봉</span></button>';
  html+='<button class="trk-tab'+(has60?'':' on')+'" data-trk="" >중장기<span>일봉</span></button>';
  html+='</div>';

  // 패널들 (기본: 월간 보임, 없으면 분기)
  html+='<div class="trk-panel" data-pnl="10" style="display:none">'+trackHtml('10', minName, minName+' — 최근 1주 기준', IS_US)+'</div>';
  html+='<div class="trk-panel" data-pnl="60" style="display:'+(has60?'block':'none')+'">'+trackHtml('60', '60분봉', '60분봉 — 최근 1개월 기준', IS_US)+'</div>';
  html+='<div class="trk-panel" data-pnl="" style="display:'+(has60?'none':'block')+'">'+trackHtml('', '일봉', '일봉 — 분기 기준, 다음 경로 참고용', IS_US)+'</div>';

  // 최종 리포트
  html+='<button id="repBtn" class="report-btn"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>최종 결과 리포트 보기</button>';
  html+='<div id="reportArea"></div>';
  box.innerHTML=html;

  // 탭 전환 — 보일 때 차트 다시 그림 (display:none 상태에선 캔버스 0이라 깨짐)
  var trackData={ '':{d:d,pj:pj}, '60':has60?{d:t60,pj:t60.projection}:null, '10':has10?{d:t10,pj:t10.projection}:null };
  var tabs=box.querySelectorAll('.trk-tab'), pnls=box.querySelectorAll('.trk-panel');
  tabs.forEach(function(tb){
    tb.addEventListener('click',function(){
      var key=tb.getAttribute('data-trk');
      tabs.forEach(function(t){t.classList.toggle('on',t===tb);});
      pnls.forEach(function(p){p.style.display = (p.getAttribute('data-pnl')===key)?'block':'none';});
      // 보이게 된 트랙 차트 다시 그림
      var td=trackData[key];
      if(td){ requestAnimationFrame(function(){
        try{ mkChart(td.d, td.pj, key); }catch(e){console.error('차트 재렌더:',e);}
        // 차트 재렌더 후 드로잉 스트로크 복원
        requestAnimationFrame(function(){ _redraw(key); });
      }); }
      // 부모(어드민)에 현재 활성 sfx 알림
      if(window.parent!==window) window.parent.postMessage({type:'activeSfx',sfx:key},'*');
    });
  });

  var rb=document.getElementById('repBtn');
  if(rb) rb.addEventListener('click',function(){ buildReport(x, d, pj, t10, t60); });

  // 최초: 보이는 디폴트 트랙만 그림 (월간 우선, 없으면 분기)
  requestAnimationFrame(function(){requestAnimationFrame(function(){
    if(has60){ try{ mkChart(t60, t60.projection, '60'); }catch(e){console.error('60분봉:',e); mkChart(d,pj,'');} }
    else { mkChart(d,pj,''); }
    // 나머지 트랙도 드로잉 초기화를 위해 백그라운드 렌더
    if(has10){ try{ mkChart(t10, t10.projection, '10'); }catch(e){} }
    if(has60){ try{ mkChart(d, pj, ''); }catch(e){} }
  });});
}

// ===== 27개 조합 멘트 (분기_월_주) =====
// 원칙: 주간 상방=이미 올라 매수자리 지남(추격신중) / 분기상방+주눌림=분할매수 / 분기하방+주반등=데드캣
var verdicts3={
'up_up_up':{t:'정배열 · 단기 이미 상승',s:'분기·월·주 상방',b:'분기·월·주 <b>모두 위</b>. 추세에 올라탄 정배열이나 단기 이미 상승했습니다.',hl:'보유 유지 구간 — 신규 매수는 <b>다음 눌림 대기</b>, 추격 매수는 신중.',c:'red'},
'up_up_flat':{t:'정배열 · 단기 숨고르기',s:'분기·월 상방 · 주 횡보',b:'큰추세·중기 <b>위</b>, 단기 <b>횡보</b>. 상승 중 눌림 자리입니다.',hl:'<b>분할매수 유리</b> — 추세 살아있고 단기 쉬어감. 담기 좋은 구간.',c:'red'},
'up_up_dn':{t:'정배열 · 단기 조정',s:'분기·월 상방 · 주 하방',b:'분기·월 <b>위</b>, 주 <b>조정</b>. 큰 흐름 속 단기 눌림목입니다.',hl:'<b>분할매수 유리</b> — 저점 담는 자리, 단 주간 지지 이탈 시 관망.',c:'red'},
'up_flat_up':{t:'큰추세 위 · 단기 이미 반등',s:'분기 상방 · 월 횡보 · 주 상방',b:'분기 <b>위</b>, 월 횡보, 주 <b>이미 상승</b>. 단기 반등이 진행됐습니다.',hl:'<b>추격 신중</b> — 매수 자리는 지났음, 월 박스 상단 저항 확인.',c:'orange'},
'up_flat_flat':{t:'큰추세 위 · 중단기 정체',s:'분기 상방 · 월·주 횡보',b:'분기 <b>위</b>, 월·주 <b>횡보</b>. 큰 그림 살아있고 중단기 숨고르기.',hl:'<b>분할 접근 구간</b> — 추세 신뢰 시 눌림마다 담기, 방향 재개 대기.',c:'orange'},
'up_flat_dn':{t:'큰추세 위 · 단기 눌림',s:'분기 상방 · 월 횡보 · 주 하방',b:'분기 <b>위</b>, 월 횡보, 주 <b>하락</b>. 추세 속 단기 조정입니다.',hl:'<b>분할매수 관심</b> — 추세 신뢰 시 저점 담기, 조정 깊이 관찰.',c:'red'},
'up_dn_up':{t:'큰추세 위 · 단기 반등 진입',s:'분기 상방 · 월 하방 · 주 상방',b:'분기 <b>위</b>, 월 <b>조정</b>, 주 <b>반등</b>. 이미 단기 반등 들어갔습니다.',hl:'<b>매수 자리 지났음</b> — 추격 신중, 중기 조정이라 다음 눌림 대기.',c:'orange'},
'up_dn_flat':{t:'큰추세 위 · 중기 조정',s:'분기 상방 · 월 하방 · 주 횡보',b:'분기 <b>위</b>, 월 <b>하방</b>, 주 횡보. 중기 조정 진행 중 단기 정체.',hl:'<b>관망 우위</b> — 추세 살아있으나 중기 조정 마무리 확인 후 분할.',c:'orange'},
'up_dn_dn':{t:'큰추세 위 · 중단기 조정',s:'분기 상방 · 월·주 하방',b:'분기 <b>위</b>, 월·주 <b>하방</b>. 큰추세 속 깊은 조정 국면입니다.',hl:'<b>조정 깊이 관건</b> — 추세 신뢰 시 저점 분할, 훼손 시 비중 축소.',c:'orange'},
'flat_up_up':{t:'중단기 상승 · 단기 이미 올라',s:'분기 횡보 · 월·주 상방',b:'분기 <b>횡보</b>, 월·주 <b>위</b>. 중단기 상승이나 단기 이미 상승.',hl:'<b>추격 신중</b> — 추세 근거 약함, 단기 트레이딩 관점.',c:'blue'},
'flat_up_flat':{t:'중기 상승 · 단기 정체',s:'분기 횡보 · 월 상방 · 주 횡보',b:'분기 횡보, 월 <b>위</b>, 주 횡보. 중기 상승 속 단기 눌림.',hl:'중기 상승 신뢰 시 <b>분할 관심</b> — 단기 방향 대기.',c:'blue'},
'flat_up_dn':{t:'중기 상승 · 단기 조정',s:'분기 횡보 · 월 상방 · 주 하방',b:'분기 횡보, 월 <b>위</b>, 주 <b>하락</b>. 중기 위인데 단기 눌림.',hl:'<b>단기 조정 저점 관심</b> — 중기 상방 유지 시 반등 가능.',c:'blue'},
'flat_flat_up':{t:'정체 · 단기 이미 반등',s:'분기·월 횡보 · 주 상방',b:'분기·월 <b>횡보</b>, 주 <b>상승</b>. 박스권 속 단기 반등 진입.',hl:'<b>추격 신중</b> — 추세 근거 약함, 박스 상단 저항 주의.',c:'blue'},
'flat_flat_flat':{t:'완전 중립 · 관망',s:'분기·월·주 횡보',b:'분기·월·주 <b>모두 횡보</b>. 방향성 없는 관망 구간입니다.',hl:'<b>관망</b> — 뚜렷한 신호 대기, 박스 상하단 대응 정도.',c:'gray'},
'flat_flat_dn':{t:'정체 · 단기 하락',s:'분기·월 횡보 · 주 하방',b:'분기·월 횡보, 주 <b>하락</b>. 박스권 하단 이탈 시도.',hl:'<b>섣부른 매수 주의</b> — 주간 바닥 확인 후 접근.',c:'blue'},
'flat_dn_up':{t:'중기 약화 · 단기 반등',s:'분기 횡보 · 월 하방 · 주 상방',b:'분기 횡보, 월 <b>하방</b>, 주 <b>반등</b>. 중기 조정 속 단기 튐.',hl:'<b>데드캣 경계</b> — 중기 하방이라 반등 지속성 의심.',c:'blue'},
'flat_dn_flat':{t:'중기 하락 · 단기 정체',s:'분기 횡보 · 월 하방 · 주 횡보',b:'분기 횡보, 월 <b>하방</b>, 주 횡보. 중기 조정 단기 멈춤.',hl:'<b>관망</b> — 중기 하방 진행, 반등 신호 전 진입 자제.',c:'blue'},
'flat_dn_dn':{t:'중단기 하락',s:'분기 횡보 · 월·주 하방',b:'분기 횡보, 월·주 <b>하방</b>. 중단기 하락 가속.',hl:'<b>하락 우위</b> — 매수보다 관망·손절 관점.',c:'blue'},
'dn_up_up':{t:'큰추세 하락 · 중단기 반등',s:'분기 하방 · 월·주 상방',b:'분기 <b>하방</b>, 월·주 <b>위</b>. 하락 추세 속 강한 반등.',hl:'<b>기술적 반등</b> — 큰추세 아래라 비중 정리 기회로 보는 시각.',c:'blue'},
'dn_up_flat':{t:'큰추세 하락 · 중기 반등',s:'분기 하방 · 월 상방 · 주 횡보',b:'분기 <b>하방</b>, 월 <b>위</b>, 주 횡보. 하락 속 중기 반등 시도.',hl:'<b>반등 신뢰 신중</b> — 추세 전환 확인 전 추격 자제.',c:'blue'},
'dn_up_dn':{t:'하락 · 중기 반등 · 단기 재하락',s:'분기 하방 · 월 상방 · 주 하방',b:'분기 <b>하방</b>, 월 <b>위</b>, 주 <b>하락</b>. 반등 후 단기 재하락.',hl:'<b>데드캣 경계</b> — 중기 반등 꺾이는지 관찰, 추격 금지.',c:'blue'},
'dn_flat_up':{t:'큰추세 하락 · 단기 반등',s:'분기 하방 · 월 횡보 · 주 상방',b:'분기 <b>하방</b>, 월 횡보, 주 <b>상승</b>. 하락 속 단기 튐.',hl:'<b>데드캣 경계</b> — 큰추세 하방, 매수보다 짧은 대응만.',c:'blue'},
'dn_flat_flat':{t:'큰추세 하락 · 중단기 정체',s:'분기 하방 · 월·주 횡보',b:'분기 <b>하방</b>, 월·주 횡보. 하락 후 바닥 다지기 국면.',hl:'<b>바닥 확인 전 관망</b> — 추세 전환 신호 대기.',c:'blue'},
'dn_flat_dn':{t:'큰추세 하락 · 단기 재하락',s:'분기 하방 · 월 횡보 · 주 하방',b:'분기 <b>하방</b>, 월 횡보, 주 <b>하락</b>. 하락 추세 재개.',hl:'<b>관망·손절 우위</b> — 반등 없이 하락 지속 가능.',c:'blue'},
'dn_dn_up':{t:'하락 추세 · 단기 반등',s:'분기·월 하방 · 주 상방',b:'분기·월 <b>하방</b>, 주 <b>상승</b>. 하락 속 단기 반등.',hl:'<b>데드캣 가능성 높음</b> — 반등 시 비중 정리 관점.',c:'blue'},
'dn_dn_flat':{t:'하락 추세 · 단기 멈춤',s:'분기·월 하방 · 주 횡보',b:'분기·월 <b>하방</b>, 주 횡보. 하락 후 단기 정체.',hl:'<b>추격 자제</b> — 반등해도 큰추세 거스르기 어려움.',c:'blue'},
'dn_dn_dn':{t:'완전 역배열',s:'분기·월·주 하방',b:'분기·월·주 <b>모두 하방</b>. 하락 추세가 진행 중입니다.',hl:'<b>관망·손절 관점</b> — 바닥 확인 전 진입은 위험.',c:'blue'}
};
// ===== 방향 판정 =====
// 핵심: 시나리오가 "출렁이면서(파동) + 시작가 대비 그 방향으로 제대로 가는가"
//  - 상승 파동 인정 = 상승 시나리오가 출렁임 있고 + 끝점이 시작가보다 위
//  - 하락 파동 인정 = 하락 시나리오가 출렁임 있고 + 끝점이 시작가보다 아래
//  - 둘 다 인정 → 중립 / 한쪽만 → 그 방향 / 둘 다 미인정 → 중립
function buildSeq(pj, d, dir){
  var cur=pj.cur||0;
  var startV=pj.anchor_price||cur;
  var ceil_=pj.up_target||cur*1.1, floor_=pj.dn_target||cur*0.8;
  var allLv=[];
  (pj.sr_levels||[]).forEach(function(v){ if(v>0) allLv.push(v); });
  if(d && d.draws) d.draws.forEach(function(x){ if(x.yc>0) allLv.push(x.yc); });
  allLv.sort(function(a,b){return a-b;});
  var clean=[]; allLv.forEach(function(v){ if(!clean.length||Math.abs(v-clean[clean.length-1])>cur*0.015) clean.push(v); });
  allLv=clean;
  var seq=[startV];
  if(dir==='up'){
    var ups=allLv.filter(function(v){return v>startV*1.005 && v<=ceil_*1.001;});
    if(ups.length===0) ups=[ceil_];
    if(ups[ups.length-1] < ceil_*0.97) ups.push(ceil_);
    var prev=startV;
    for(var i=0;i<ups.length;i++){
      seq.push(ups[i]);
      if(i<ups.length-1) seq.push(prev+(ups[i]-prev)*0.45);  // 되돌림(출렁)
      prev=ups[i];
    }
  } else {
    var dns=allLv.filter(function(v){return v<startV*0.995 && v>=floor_*0.999;}).reverse();
    if(dns.length===0) dns=[floor_];
    if(dns[dns.length-1] > floor_*1.03) dns.push(floor_);
    var prevd=startV;
    for(var j=0;j<dns.length;j++){
      seq.push(dns[j]);
      if(j<dns.length-1) seq.push(prevd+(dns[j]-prevd)*0.45);  // 반등(출렁)
      prevd=dns[j];
    }
  }
  return {seq:seq, startV:startV};
}
function waveShows(pj, d, dir){
  // 그 방향 파동이 "나타나는가" = 시나리오 앞쪽이 밋밋하지 않고(출렁임) + 그 방향으로 타는가
  // 끝점·끝 꺾임은 무시. 앞쪽(앞 절반)이 핵심.
  var r=buildSeq(pj, d, dir);
  var seq=r.seq, startV=r.startV;
  if(seq.length<2) return false;
  // 앞쪽 구간 = 앞 절반(최소 3점)
  var half=Math.max(3, Math.ceil(seq.length*0.6));
  var front=seq.slice(0, Math.min(half, seq.length));
  if(front.length<2) return false;
  // 1) 앞쪽이 그 방향으로 제대로 가는가 (앞쪽 최대 도달이 시작가 대비 의미있게)
  var reach;
  if(dir==='up'){ reach=Math.max.apply(null,front); if(reach <= startV*1.015) return false; }
  else         { reach=Math.min.apply(null,front); if(reach >= startV*0.985) return false; }
  // 2) 앞쪽이 밋밋하지 않은가 (출렁임=변곡 또는 충분한 이동폭)
  var turns=0;
  for(var i=2;i<front.length;i++){
    var d1=front[i-1]-front[i-2], d2=front[i]-front[i-1];
    if(d1*d2<0) turns++;   // 앞쪽에서의 변곡(출렁)
  }
  // 앞쪽에 변곡이 있거나, 앞쪽 레벨이 2개 이상(여러 변곡점 경유) → 파동. 밋밋하면(변곡0+점적음) 불인정
  var movePct=Math.abs(reach-startV)/(startV||1);
  return turns>=1 || (front.length>=4 && movePct>=0.04);
}
function judgeDir(pj, d, isWeek){
  if(!pj) return 'flat';
  var cur=pj.cur||0; if(cur<=0) return 'flat';
  // 갈래 판정: 시작점에서 상방 파동만 나타나면 상방, 하방만이면 하방, 둘 다(찢어짐)면 중립.
  var upWave=waveShows(pj, d, 'up');
  var dnWave=waveShows(pj, d, 'dn');
  if(upWave && !dnWave) return 'up';
  if(dnWave && !upWave) return 'dn';
  return 'flat';
}

// ===== 최종 리포트 생성 =====
function buildReport(x, d, pj, t10, t60){
  var area=document.getElementById('reportArea');
  if(!area) return;
  if(area.innerHTML){ area.innerHTML=''; return; }  // 토글
  var IS_US=(x['시장']==='미국');
  function pf(v){ return IS_US?('$'+Number(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})):(Math.round(v).toLocaleString()+'원'); }
  var qDir=judgeDir(pj, d, false);                                   // 분기(일봉)
  var mDir=(t60&&t60.projection)?judgeDir(t60.projection, t60, false):'flat';  // 월(60분봉)
  var wDir=(t10&&t10.projection)?judgeDir(t10.projection, t10, true):'flat';   // 주(10분봉) — 표시용
  // 종합 판정은 월간+분기만 사용 (주간 제외). 멘트 조합에서 주간 자리는 중립 고정.
  var dirName={up:'상방',dn:'하방',flat:'횡보'};
  var dirCls={up:'d-up',dn:'d-dn',flat:'d-fl'};
  // 종합 멘트 (분기 × 월 — 주간 제외)
  var combo=qDir+'_'+mDir+'_flat';
  var V=verdicts3[combo]||verdicts3['flat_flat_flat'];
  var v={t:V.t, s:V.s, b:V.b, hl:V.hl, c:V.c};
  var hlCls={orange:'hl-orange',blue:'hl-blue',gray:'hl-blue',red:'hl-orange'}[v.c];
  // 미니 차트 path 생성
  function miniSvg(dir){
    var pts = dir==='up'?'6,56 40,50 74,52 108,42 142,30 154,18'
            : dir==='dn'?'6,16 40,24 74,22 108,34 142,52 154,60'
            : '6,38 40,44 74,34 108,40 142,36 154,38';
    var col = dir==='up'?'#dd5b54':dir==='dn'?'#3f7fd0':'#6e7c8a';
    return '<svg viewBox="0 0 160 70" width="100%" height="60" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  var h='<div class="report">';
  h+='<div class="rep-title">최종 결과 리포트</div>';
  // 3축: 주 → 월 → 분기 순
  h+='<div class="axis-row">';
  if(t10&&t10.projection){
    h+='<div class="axis"><div class="axis-top"><span class="axis-nm">주</span><span class="axis-dir '+dirCls[wDir]+'">'+dirName[wDir]+'</span></div><div class="mini-chart">'+miniSvg(wDir)+'</div></div>';
  }
  if(t60&&t60.projection){
    h+='<div class="axis"><div class="axis-top"><span class="axis-nm">월</span><span class="axis-dir '+dirCls[mDir]+'">'+dirName[mDir]+'</span></div><div class="mini-chart">'+miniSvg(mDir)+'</div></div>';
  }
  h+='<div class="axis"><div class="axis-top"><span class="axis-nm">분기</span><span class="axis-dir '+dirCls[qDir]+'">'+dirName[qDir]+'</span></div><div class="mini-chart">'+miniSvg(qDir)+'</div></div>';
  h+='</div>';
  // 종합 해석
  h+='<div class="verdict-card"><div class="vc-hd"><div class="vc-badge"><svg viewBox="0 0 24 24" fill="none" stroke="#ed7d31" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div><div><div class="vc-t">'+v.t+'</div><div class="vc-s">'+v.s+'</div></div></div>';
  h+='<div class="vc-body">'+v.b+'<div class="hl-box '+hlCls+'">'+v.hl+'</div></div></div>';

  // ===== 공방선 (각 기간별) =====
  function gongLines(p, dch){
    // 현재가 기준 아래 공방선 추출 — 그 기간의 작도 교차점(yc) 우선
    var c=p.cur||0; if(c<=0) return [];
    var lv=[];
    if(dch && dch.draws) dch.draws.forEach(function(x){ if(x.yc>0) lv.push(x.yc); });
    // 중복 제거 (1% 간격)
    lv.sort(function(a,b){return a-b;});
    var clean=[]; lv.forEach(function(v){ if(!clean.length||Math.abs(v-clean[clean.length-1])>c*0.01) clean.push(v); });
    // 아래쪽만, 현재가에서 가까운 순
    var dns=clean.filter(function(v){return v<c*0.997;}).reverse().slice(0,3);
    // 아래 공방선이 없으면(상승 종목 등) 위험선(dn_target)으로 채움
    if(!dns.length && p.dn_target>0 && p.dn_target<c*0.997) dns=[p.dn_target];
    var out=[];
    dns.forEach(function(v){ out.push({v:v,above:false}); });
    return out;
  }
  function gongSec(label, p, dch){
    if(!p) return '';
    var lines=gongLines(p, dch);
    if(!lines.length) return '';
    var cur=p.cur||0;
    var s='<div class="gong-sec"><div class="gs-label"><span class="dot"></span>'+label+' 공방선</div><div class="gs-lines">';
    lines.forEach(function(L,i){
      var gap=cur>0?((L.v-cur)/cur*100):0;
      s+='<div class="gl"><span class="gl-tag num">'+(i+1)+'</span><span class="gl-price">'+pf(L.v)+'</span><span class="gl-gap">'+(gap>=0?'+':'')+gap.toFixed(1)+'%</span></div>';
    });
    s+='</div></div>';
    return s;
  }
  h+='<div class="gong-card">';
  h+='<div class="gong-hd"><svg viewBox="0 0 24 24" fill="none" stroke="#b3502c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M5 7l7-5 7 5M5 17l7 5 7-5"/></svg>공방선 (매수·매도가 부딪히는 자리)</div>';
  h+='<div class="gong-desc">가격이 다가가면 <b>매수와 매도가 맞붙는 자리</b>입니다. 위쪽은 뚫으면 상승 탄력, 아래쪽은 지켜내면 반등·이탈하면 추가 하락. <b>같은 선을 누구는 매수로, 누구는 손절로</b> 봅니다.</div>';
  h+='<div class="gong-body">';
  h+=gongSec('주 (단기)', t10&&t10.projection, t10);
  h+=gongSec('월 (중기)', t60&&t60.projection, t60);
  h+=gongSec('분기 (큰추세)', pj, d);
  h+='</div></div>';
  h+='<div class="rep-foot">본 리포트는 작도·통계 기반 참고 자료이며 매수·매도 추천이 아닙니다. 공방선은 절대적 기준이 아니며, 모든 판단과 책임은 본인에게 있습니다.</div>';
  h+='</div>';
  area.innerHTML=h;
  area.scrollIntoView({behavior:'smooth',block:'start'});
}

function mkChart(data,pj,sfx){
  sfx=sfx||'';
  var IS_US=!!window.__IS_US;
  function fmtP(v){ return IS_US ? ('$'+Number(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})) : Math.round(v).toLocaleString(); }
  // ===== v3 모든 데이터 변수 최상단 선언 (TDZ 방지) =====
  var cv=document.getElementById('cv'+sfx), tip=document.getElementById('tip'+sfx);
  var scope=document.getElementById('host'+sfx)||document;
  var ch=data.chart, n=ch.length, draws=data.draws||[], risks=data.risks||[];
  var FUT=(pj&&pj.fut)||63, TOTAL=n+FUT, cur=data.cur;
  var c=[], ma2=[];
  for(var ci=0;ci<ch.length;ci++){c.push(ch[ci].c);ma2.push(ch[ci].m2);}
  var GREEN_START=0;
  if(pj&&pj.green_start!=null){GREEN_START=pj.green_start;}
  else if(draws.length){GREEN_START=draws[draws.length-1].M_t1||0;}
  else{GREEN_START=n-1;}
  if(GREEN_START<0)GREEN_START=0; if(GREEN_START>=n)GREEN_START=n-1;
  var green_base=(c[GREEN_START]!=null)?c[GREEN_START]:cur;
  var green_span=Math.max(1,TOTAL-1-GREEN_START);
  var DPR=window.devicePixelRatio||1;
  var W,H,plot,viewS=0,viewE=TOTAL-1;
  var isMob=false,padR=64,padL=8,padT=14,padB=38,FONT_SM=11,FONT_MD=12;
  var SCEN=null;
  var scenFade=0;
  var srLevels=(pj&&pj.sr_levels)||[];
  // 초기 뷰: 현재 봉 기준 과거 25개 + 미래 15개 (증권사처럼 캔들 굵게)
  (function(){
    var PAST=25, FUTV=15;
    var curI=n-1;                      // 현재(마지막 실제) 봉
    viewS=Math.max(0, curI-PAST);
    viewE=Math.min(TOTAL-1, curI+FUTV);
  })();
  function futDates(){
    var last=ch[n-1].d; // "MM/DD" 또는 "MM/DD HH시"
    var isMin = last.indexOf('시')>=0;  // '시' 있으면 분봉
    var out=[]; var k=0;
    if(isMin){
      // 분봉: 봉 간격을 최근 두 봉 시간차로 추정, 장중(9:00~15:30) 안에서 더하고 넘으면 다음날 9:00
      var stepMin=10;
      // 최근 같은 날 두 봉의 시 차이로 간격 추정
      try{
        var pa=ch[n-1].d.split(' '); var pb=ch[n-2]?ch[n-2].d.split(' '):null;
        if(pb && pa[0]===pb[0]){
          var ha=parseInt(pa[1])||0, hb=parseInt(pb[1])||0;
          var diff=(ha-hb)*60;
          if(diff>0 && diff<=240) stepMin=diff;
        }
      }catch(e){}
      // 시작 시각: 마지막 봉의 시(분은 0으로 단순화)
      var pp=last.split(' ');
      var md=pp[0].split('/'); var mo=parseInt(md[0])||1, dy=parseInt(md[1])||1;
      var hh=parseInt(pp[1])||9; var mm=0;
      var dt=new Date(2026,mo-1,dy,hh,mm);
      while(k<FUT){
        dt=new Date(dt.getTime()+stepMin*60000);
        var hr=dt.getHours()+dt.getMinutes()/60;
        // 장 마감(15:30) 넘으면 다음 거래일 9:00로
        if(hr>15.5){
          dt=new Date(dt.getFullYear(),dt.getMonth(),dt.getDate()+1,9,0);
          var w0=dt.getDay();
          while(w0===0||w0===6){ dt=new Date(dt.getFullYear(),dt.getMonth(),dt.getDate()+1,9,0); w0=dt.getDay(); }
        }
        out.push((dt.getMonth()+1)+'/'+dt.getDate()+' '+dt.getHours()+'시');
        k++;
      }
    } else {
      // 일봉: 하루씩(주말 제외)
      var parts=last.split('/');
      var mo2=parseInt(parts[0])||1, dy2=parseInt(parts[1])||1;
      var dt2=new Date(2026,mo2-1,dy2);
      while(k<FUT){
        dt2=new Date(dt2.getTime()+86400000);
        var w=dt2.getDay();
        if(w===0||w===6)continue;
        out.push((dt2.getMonth()+1)+'/'+(dt2.getDate()));
        k++;
      }
    }
    return out;
  }
  var fdates=futDates();
  function lbl(i){return i<n?ch[i].d:(fdates[i-n]||'');}
  function lay(keepY){
    W=cv.clientWidth; H=cv.clientHeight;
    if(!W||!H){W=cv.clientWidth||cv.parentElement.clientWidth-20||900;H=cv.clientHeight||440;}
    isMob=W<480;
    padR=isMob?52:64; padL=isMob?8:8; padT=isMob?10:14; padB=isMob?28:38;
    FONT_SM=isMob?9:11; FONT_MD=isMob?10:12;
    cv.width=W*DPR; cv.height=H*DPR;
    cv.getContext('2d').setTransform(DPR,0,0,DPR,0,0);
    // keepY=true면 기존 세로 범위 유지 (좌우 스크롤 시 출렁임 방지)
    if(keepY && plot){
      plot={lo:plot.lo,hi:plot.hi,x0:padL,x1:W-padR,y0:padT,y1:H-padB};
      return;
    }
    var vs=Math.max(0,viewS), ve=Math.min(TOTAL-1,viewE);
    var lo=1e18, hi=-1e18;
    for(var i=vs;i<=Math.min(ve,n-1);i++){lo=Math.min(lo,ch[i].l);hi=Math.max(hi,ch[i].h);}
    // 캔들이 하나도 안 보이면 종가 기준
    if(lo>hi){lo=Math.min.apply(null,c);hi=Math.max.apply(null,c);}
    // 증권사 방식: 가격 범위는 오직 보이는 캔들에만 맞춤.
    lo*=0.99; hi*=1.01;
    plot={lo:lo,hi:hi,x0:padL,x1:W-padR,y0:padT,y1:H-padB};
  }
  function getSpan(){return viewE-viewS+1;}
  function xOf(i){return plot.x0+(i-viewS+0.5)/getSpan()*(plot.x1-plot.x0);}
  function yOf(v){return plot.y1-(v-plot.lo)/(plot.hi-plot.lo)*(plot.y1-plot.y0);}
  function vOf(y){return plot.lo+(plot.y1-y)/(plot.y1-plot.y0)*(plot.hi-plot.lo);}
  function iOfX(x){return Math.round(viewS+(x-plot.x0)/(plot.x1-plot.x0)*getSpan()-0.5);}
  function FF(){return getComputedStyle(document.body).fontFamily;}
  function getChecked(){return Array.from(scope.querySelectorAll('.mtd:checked')).map(function(el){return el.value;});}
  function seg(ctx,i0,y0,i1,y1,color,w,dash){
    if(i1<viewS||i0>viewE)return;
    ctx.strokeStyle=color;ctx.lineWidth=w;ctx.setLineDash(dash||[]);
    ctx.beginPath();ctx.moveTo(xOf(i0),yOf(y0));ctx.lineTo(xOf(i1),yOf(y1));ctx.stroke();ctx.setLineDash([]);
  }
  // fwave: 기법선·목표선을 교차점 기준점(anchor)부터 미래끝까지 그림
  // fn(t, basePrice) → y값. t=0(시작점) ~ t=1(미래끝)
  var ANCHOR_I=(pj.anchor_idx!=null)?pj.anchor_idx:(n-1);
  var ANCHOR_P=(pj.anchor_price!=null)?pj.anchor_price:cur;
  var ANCHOR_SPAN=Math.max(1,(TOTAL-1)-ANCHOR_I);
  function fwave(ctx,fn,color,wid,dash,fromGreen){
    var startI=ANCHOR_I;
    var baseP=ANCHOR_P;
    var totalSpan=ANCHOR_SPAN;
    var endI=TOTAL-1;  // 끝점을 미래 마지막 봉에 고정 (줌해도 안 흔들림)
    if(startI>endI)return;
    ctx.strokeStyle=color;ctx.lineWidth=wid;ctx.setLineDash(dash||[]);
    ctx.beginPath();
    ctx.moveTo(xOf(startI),yOf(baseP));
    for(var i=startI;i<=endI;i++){
      var t=(totalSpan>0)?(i-startI)/totalSpan:0;
      ctx.lineTo(xOf(i),yOf(fn(t,baseP)));
    }
    ctx.stroke();ctx.setLineDash([]);
  }
  function draw(mx,my){
    var ctx=cv.getContext('2d');
    ctx.clearRect(0,0,W,H);
    ctx.font=FONT_MD+'px '+FF();
    // 격자
    ctx.strokeStyle='#eef1f5';ctx.lineWidth=1;ctx.fillStyle='#9aa6b2';ctx.textAlign='left';
    var gridCnt=isMob?3:4;
    for(var g=0;g<=gridCnt;g++){
      var v=plot.lo+(plot.hi-plot.lo)*g/gridCnt, y=yOf(v);
      ctx.beginPath();ctx.moveTo(plot.x0,y);ctx.lineTo(plot.x1,y);ctx.stroke();
      ctx.font=FONT_SM+'px '+FF();
      // 모바일: 숫자 축약 (75,000 → 75K 또는 그대로 짧게)
      var lv=isMob?fmtP(v).replace(',000','K'):fmtP(v);
      ctx.fillText(lv,plot.x1+4,y+4);
    }
    // X축 날짜 — 모바일은 3개, PC는 6개, 겹침 방지
    ctx.fillStyle='#5a6b7d';ctx.textAlign='center';ctx.font=FONT_SM+'px '+FF();
    var xCnt=isMob?3:6;
    var lastXEnd=-999;
    for(var t=0;t<xCnt;t++){
      var idx=viewS+Math.round((getSpan()-1)*t/(xCnt-1));
      var L=lbl(idx);
      if(!L)continue;
      // 모바일: 날짜만 (HH시 제거), 일봉은 MM/DD만
      if(isMob) L=L.replace(/ \d+시/,'');
      var lx=xOf(idx);
      var tw=ctx.measureText(L).width;
      if(lx-tw/2>lastXEnd+4){
        ctx.fillText(L,lx,plot.y1+(isMob?14:16));
        lastXEnd=lx+tw/2;
      }
    }
    // 현재선
    var nowX=xOf(n-1);
    if(viewE>=n){
      ctx.fillStyle='rgba(120,140,160,.05)';ctx.fillRect(nowX,plot.y0,plot.x1-nowX,plot.y1-plot.y0);
      ctx.strokeStyle='rgba(26,58,92,.3)';ctx.setLineDash([5,4]);ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(nowX,plot.y0);ctx.lineTo(nowX,plot.y1);ctx.stroke();ctx.setLineDash([]);
      if(!isMob){ctx.fillStyle='#8a98a8';ctx.font=FONT_SM+'px '+FF();ctx.fillText('현재',nowX,plot.y0+10);}
    }
    // ===== 매물대/매물집중 제거됨 =====

    // 캔들 (증권사처럼 진하게)
    var cw=Math.max(1.5,(plot.x1-plot.x0)/getSpan()*0.62);
    for(var i=Math.max(0,viewS);i<=Math.min(viewE,n-1);i++){
      var r=ch[i],x=xOf(i),u=r.c>=r.o;
      ctx.strokeStyle=u?'#e02f2f':'#1f6fd0';ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(x,yOf(r.h));ctx.lineTo(x,yOf(r.l));ctx.stroke();
      ctx.fillStyle=u?'#e02f2f':'#1f6fd0';
      var yo=yOf(r.o),yc2=yOf(r.c);
      ctx.fillRect(x-cw/2,Math.min(yo,yc2),cw,Math.max(1.5,Math.abs(yc2-yo)));
    }
    // 2일선 — 얇고 연하게 (갭 등락 시 흐름 이어주기)
    ctx.strokeStyle='rgba(90,100,115,.35)';ctx.lineWidth=0.8;ctx.beginPath();var st=false;
    for(var i=Math.max(0,viewS);i<=Math.min(viewE,n-1);i++){
      if(ma2[i]==null)continue;
      var x=xOf(i),y=yOf(ma2[i]);
      if(!st){ctx.moveTo(x,y);st=true;}else{ctx.lineTo(x,y);}
    }
    ctx.stroke();
    // 위험선
    risks.forEach(function(d){
      if(!d.price_only){
        seg(ctx,d.A_t1-1,ma2[d.A_t1-1]||d.A_y1,d.A_t1,d.A_y1,'#d4537e',2.4);
        // 교차점까지 역방향 점선 — 제거됨(오해 방지)
      }
      ctx.strokeStyle='rgba(212,83,126,.85)';ctx.lineWidth=1.4;ctx.setLineDash(d.price_only?[6,4]:[]);
      ctx.beginPath();ctx.moveTo(plot.x0,yOf(d.yc));ctx.lineTo(plot.x1,yOf(d.yc));ctx.stroke();ctx.setLineDash([]);
      var glbl='공방선 '+fmtP(d.yc); ctx.font='11px '+FF();
      var glw=ctx.measureText(glbl).width+10;
      ctx.fillStyle='#d4537e';ctx.fillRect(plot.x0+4,yOf(d.yc)-9,glw,18);
      ctx.font=FONT_SM+'px '+FF();ctx.fillStyle='#fff';ctx.fillText(glbl,plot.x0+6,yOf(d.yc)+3);
    });
    // 작도선
    draws.forEach(function(d){
      var al=d.alive?1:.32;
      seg(ctx,d.A_t1-1,ma2[d.A_t1-1]||d.A_y1,d.A_t1,d.A_y1,'rgba(226,75,74,'+al+')',2.4);
      seg(ctx,d.B_t1-1,ma2[d.B_t1-1]||d.B_y1,d.B_t1,d.B_y1,'rgba(55,138,221,'+al+')',2.4);
      // 교차점까지 역방향 점선 연장 — 화면 제거됨(오해 방지), 계산은 유지
      if(false&&d.entry>=viewS&&d.entry<=viewE&&d.entry<n){
        ctx.fillStyle=d.alive?'#e8743b':'rgba(232,116,59,.4)';
        var ex=xOf(d.entry),ey=yOf(c[d.entry]);
        ctx.beginPath();ctx.moveTo(ex,ey-6);ctx.lineTo(ex-5,ey+5);ctx.lineTo(ex+5,ey+5);ctx.closePath();ctx.fill();
      }
    });
    // 미래 예측 (전부 직선) — 교차점 기준점부터 그림
    if(viewE>=ANCHOR_I&&pj){
      var us=pj.up_slope||0, upT=pj.up_target, dnT=pj.dn_target, vol=pj.volatility||0.02;
      // 오리지날 상승 잠재선 (캡 없는 작도 최대치) — 진한 회색. 녹색보다 먼저(아래에) 그려 가림 방지
      // green_max 없으면 35%선 역산(up_target=35%니까 ÷0.35)
      var gmax=pj.green_max || (cur+(upT-cur)/0.35);
      if(gmax>upT*1.001){
        fwave(ctx,function(t,b){return b+(gmax-b)*t;},'rgba(70,80,95,.9)',2.4,[3,3],false);
      }
      // 기본 틀: 교차점 기준부터 — 직선
      fwave(ctx,function(t,b){return b+(upT-b)*t;},'rgba(29,158,117,.95)',2.4,[6,4],false);       // 상승목표(녹색 35%)
      fwave(ctx,function(t,b){return b+(dnT-b)*t;},'rgba(212,83,126,.9)',2.4,[6,4],false);         // 위험(분홍)
      // 삼각수렴 제거됨
      // 체크박스 기법: 전부 교차점 기준부터 직선
      var checked=getChecked();
      var TT=pj.tech_targets||{};
      if(checked.indexOf('ell')>=0){
        var ellTarget=(TT.ell&&isFinite(TT.ell))?TT.ell:cur*1.15;
        fwave(ctx,function(t,b){return b+(ellTarget-b)*t;},'rgba(127,119,221,.85)',2,[],false);
      }
      if(checked.indexOf('mc')>=0){
        var mcTarget=(TT.mc&&isFinite(TT.mc))?TT.mc:(pj.mc_target||cur*1.1);
        fwave(ctx,function(t,b){return b+(mcTarget-b)*t;},'rgba(55,138,221,.85)',2,[],false);
      }
      if(checked.indexOf('gann')>=0){
        var gannTarget=(TT.gann&&isFinite(TT.gann))?TT.gann:cur*1.08;
        fwave(ctx,function(t,b){return b+(gannTarget-b)*t;},'rgba(186,117,23,.85)',2,[],false);
      }
      if(checked.indexOf('fib')>=0){
        // 피보나치: 수평 레벨선 — 교차점 기준부터 미래끝까지
        var fibUp=(TT.fib_up&&isFinite(TT.fib_up))?TT.fib_up:cur*1.3;
        var fibDn=(TT.fib_dn&&isFinite(TT.fib_dn))?TT.fib_dn:cur*0.8;
        var fibLevels=[
          {r:0.382, p:cur+(fibUp-cur)*0.382},
          {r:0.618, p:cur+(fibUp-cur)*0.618},
          {r:1.0,   p:fibUp},
          {r:-0.382,p:cur+(fibDn-cur)*0.382},
          {r:-0.618,p:cur+(fibDn-cur)*0.618}
        ];
        var fibLabelYs=[];
        for(var fi=0;fi<fibLevels.length;fi++){
          var lv=fibLevels[fi].p, up=lv>cur;
          ctx.strokeStyle=up?'rgba(29,158,117,.55)':'rgba(212,83,126,.55)';
          ctx.setLineDash([3,3]);ctx.lineWidth=1.2;
          ctx.beginPath();ctx.moveTo(xOf(ANCHOR_I),yOf(lv));ctx.lineTo(xOf(TOTAL-1),yOf(lv));ctx.stroke();ctx.setLineDash([]);
          // 라벨 겹침 방지: 이전 라벨과 14px 이내면 건너뜀
          var ly=yOf(lv);
          var tooClose=fibLabelYs.some(function(y){return Math.abs(y-ly)<14;});
          if(!tooClose){
            fibLabelYs.push(ly);
            ctx.fillStyle=up?'rgba(29,158,117,.85)':'rgba(212,83,126,.85)';
            ctx.font='10px '+FF();ctx.textAlign='left';
            ctx.fillText(fmtP(lv),xOf(ANCHOR_I)+2,ly-2);
          }
        }
      }
    }
    // ===== 시나리오 웨이브 (교차점 기준점부터 — 실제 봉과 비교 가능) =====
    if(SCEN && scenFade>0){
      // 기준점: 최근 교차점 직후. 없으면 현재
      var anchorI=(pj.anchor_idx!=null)?pj.anchor_idx:(n-1);
      var anchorP=(pj.anchor_price!=null)?pj.anchor_price:cur;
      var startI=anchorI, endI=TOTAL-1;
      var startV=anchorP;
      var TT2=pj.tech_targets||{};
      // 천장/바닥 = 현실적 목표 (up_target은 이미 녹색의 35% 현실선)
      var ceil_ = pj.up_target||cur*1.1;   // 상승 천장 = 현실 목표선
      var floor_ = pj.dn_target||cur*0.8;  // 하락 바닥
      // 시나리오 변곡점 = 내 작도(공방선 교차점)만. 보조지표 레벨 제외.
      var allLv=[];
      draws.forEach(function(d){if(d.yc>0)allLv.push(d.yc);});
      // 중복 근접 제거
      allLv=allLv.filter(function(v){return v>plot.lo&&v<plot.hi;}).sort(function(a,b){return a-b;});
      var clean=[]; allLv.forEach(function(v){if(!clean.length||Math.abs(v-clean[clean.length-1])>cur*0.015)clean.push(v);});
      allLv=clean;
      var color = SCEN==='up'?'rgba(226,75,74,':SCEN==='dn'?'rgba(55,138,221,':'rgba(138,152,168,';
      ctx.save();
      ctx.globalAlpha=scenFade;
      // 기준점(교차점) 세로선
      if(startI>=viewS&&startI<=viewE){
        ctx.strokeStyle='rgba(232,116,59,'+(0.6*scenFade)+')';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);
        ctx.beginPath();ctx.moveTo(xOf(startI),plot.y0);ctx.lineTo(xOf(startI),plot.y1);ctx.stroke();ctx.setLineDash([]);
        if(!isMob){ctx.fillStyle='#e8743b';ctx.font='bold '+FONT_SM+'px '+FF();ctx.textAlign='left';
        ctx.fillText('기준 '+(ch[startI]?ch[startI].d:''),xOf(startI)+3,plot.y0+18);}
      }
      // 지지/저항 수평선 표시
      allLv.forEach(function(lv){
        ctx.strokeStyle='rgba(127,119,221,'+(0.22*scenFade)+')';ctx.lineWidth=1;ctx.setLineDash([2,4]);
        ctx.beginPath();ctx.moveTo(xOf(startI),yOf(lv));ctx.lineTo(xOf(endI),yOf(lv));ctx.stroke();ctx.setLineDash([]);
      });

      // ── 시나리오별 "목표 레벨 시퀀스" 만들기 (이 레벨들을 변곡점으로 왕복) ──
      // 각 변곡점 = {price, label}. 파동이 이 가격들을 순서대로 찍으며 진행.
      var seq=[{price:startV}];
      var wave=pj.wave||{phase:'?'}; var phase=wave.phase;
      if(SCEN==='up'){
        // 현재가 위 레벨들 (천장 이하)
        var ups=allLv.filter(function(v){return v>startV*1.005 && v<=ceil_*1.001;});
        if(ups.length===0) ups=[ceil_];
        if(ups[ups.length-1] < ceil_*0.97) ups.push(ceil_);  // 천장 포함
        // 엘리엇: 레벨 돌파(상승) → 직전 레벨로 눌림(되돌림) → 다음 돌파...
        var prev=startV;
        for(var i=0;i<ups.length;i++){
          seq.push({price:ups[i]});                       // 저항 돌파(상승파)
          if(i<ups.length-1){
            // 되돌림: 상승은 "다시 떨어질라" 두려움이 커서 깊게 눌림(더디게 감)
            var pull=prev+(ups[i]-prev)*0.55;
            seq.push({price:pull});                        // 조정파(깊은 되돌림)
          }
          prev=ups[i];
        }
        // 5파 막바지면 천장 찍고 살짝 꺾임 추가
        if(phase==='5') seq.push({price:ceil_-(ceil_-startV)*0.15});
      } else if(SCEN==='dn'){
        var dns=allLv.filter(function(v){return v<startV*0.995 && v>=floor_*0.999;}).reverse();
        if(dns.length===0) dns=[floor_];
        if(dns[dns.length-1] > floor_*1.03) dns.push(floor_);
        var prevd=startV;
        for(var i2=0;i2<dns.length;i2++){
          seq.push({price:dns[i2]});                       // 지지 이탈(하락파)
          if(i2<dns.length-1){
            // 반등: 하락은 공포라 반등 약함(얕게 튀고 급락) — 가파르게
            var bounce=prevd+(dns[i2]-prevd)*0.30;          // 약한 반등(데드캣)
            seq.push({price:bounce});
          }
          prevd=dns[i2];
        }
      } else {
        // 횡보: 삼각수렴 없이 시작가 수평 유지
        seq.push({price:startV});
      }

      // ── 시퀀스를 시간축에 배치 (비대칭: 상승 더디게/하락 가파르게) ──
      var steps=endI-startI;
      var nSeg=seq.length-1;
      // 각 구간의 "시간 가중치": 올라가는 구간은 길게(더디), 내려가는 구간은 짧게(가파)
      // 두려움 원칙 — 상승은 자꾸 눌리며 더디게, 하락은 공포로 한번에.
      var segW=[];
      for(var q=1;q<seq.length;q++){
        var up = seq[q].price >= seq[q-1].price;
        segW.push(up ? 1.6 : 0.7);   // 상승 구간 시간 1.6배(더디), 하락 0.7배(가파)
      }
      var wsum=0; for(var wi=0;wi<segW.length;wi++) wsum+=segW[wi];
      // 누적 t 위치 (가중치 비례)
      seq[0].t=0; var acc=0;
      for(var q2=1;q2<seq.length;q2++){
        acc+=segW[q2-1];
        seq[q2].t=acc/wsum;
      }
      ctx.strokeStyle=color+'0.95)';ctx.lineWidth=2.6;ctx.setLineDash([]);
      ctx.beginPath();
      for(var s=0;s<=steps;s++){
        var t=s/steps;
        var k=0; while(k<seq.length-2 && t>seq[k+1].t) k++;
        var a0=seq[k], a1=seq[k+1];
        var segT=(t-a0.t)/((a1.t-a0.t)||1);
        var ease=(1-Math.cos(segT*Math.PI))/2;
        var base=a0.price+(a1.price-a0.price)*ease;
        // 레벨 근처 통과 시 자석처럼 끌림(지지/저항 반응 강조)
        for(var li=0;li<allLv.length;li++){
          if(Math.abs(base-allLv[li])<cur*0.012){ base=base*0.7+allLv[li]*0.3; break; }
        }
        var xx=xOf(startI+s), yy=yOf(base);
        if(s===0)ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
      }
      ctx.stroke();
      // 파동 번호 (변곡점마다 1,2,3.. 또는 A,B,C..)
      var labels = SCEN==='flat'?['A','B','C','D','E','']:['1','2','3','4','5','6','7','8'];
      ctx.fillStyle=color+'0.9)';ctx.font='bold 12px '+FF();ctx.textAlign='center';
      for(var ai=1;ai<seq.length;ai++){
        var px=startI+seq[ai].t*steps;
        if(px<=endI&&labels[ai-1]) ctx.fillText(labels[ai-1], xOf(px), yOf(seq[ai].price)-6);
      }
      ctx.restore();
    }
    // 크로스헤어
    if(mx!=null&&mx>=plot.x0&&mx<=plot.x1&&my!=null){
      ctx.strokeStyle='rgba(26,58,92,.5)';ctx.lineWidth=1;ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(mx,plot.y0);ctx.lineTo(mx,plot.y1);ctx.stroke();
      ctx.beginPath();ctx.moveTo(plot.x0,my);ctx.lineTo(plot.x1,my);ctx.stroke();ctx.setLineDash([]);
      var crossV=vOf(my);
      var boxCol=(crossV>=cur)?'#e24b4a':'#378add';
      ctx.fillStyle=boxCol;ctx.fillRect(plot.x1,my-11,padR-2,22);
      ctx.fillStyle='#fff';ctx.font=FONT_SM+'px '+FF();ctx.textAlign='left';ctx.fillText(fmtP(crossV),plot.x1+3,my+4);
      var idx=iOfX(mx), L=lbl(idx);
      if(L){var xl=isMob?L.replace(/ \d+시/,''):L;var tw=ctx.measureText(xl).width+10;ctx.fillStyle='#1a3a5c';ctx.fillRect(mx-tw/2,plot.y1+2,tw,16);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font=FONT_SM+'px '+FF();ctx.fillText(xl,mx,plot.y1+13);}
    }
  }
  var lastMx=null, lastMy=null;
  function hover(e){
    var r=cv.getBoundingClientRect();lastMx=e.clientX-r.left;lastMy=e.clientY-r.top;
    draw(lastMx,lastMy);tip.style.display='none';
    draws.forEach(function(d){if(Math.abs(lastMy-yOf(d.yc))<6){tip.style.display='block';tip.style.background='#7f77dd';tip.textContent='교차점 '+fmtP(d.yc);tip.style.left=Math.min(lastMx+12,W-90)+'px';tip.style.top=(yOf(d.yc)-28)+'px';}});
    risks.forEach(function(d){if(Math.abs(lastMy-yOf(d.yc))<6){tip.style.display='block';tip.style.background='#d4537e';tip.textContent='공방선 '+fmtP(d.yc);tip.style.left=Math.min(lastMx+12,W-110)+'px';tip.style.top=(yOf(d.yc)-28)+'px';}});
  }
  cv.addEventListener('mousemove',hover);
  cv.addEventListener('mouseleave',function(){lastMx=lastMy=null;draw(null,null);tip.style.display='none';});
  cv.addEventListener('wheel',function(e){
    e.preventDefault();
    var r=cv.getBoundingClientRect(), mx=e.clientX-r.left;
    var center=iOfX(mx), sp=getSpan();
    var ns=Math.max(15,Math.min(TOTAL,Math.round(sp*(e.deltaY>0?1.15:0.87))));
    var ratio=(center-viewS)/sp;
    var s=Math.round(center-ns*ratio), en=s+ns-1;
    if(s<0){s=0;en=ns-1;}if(en>TOTAL-1){en=TOTAL-1;s=Math.max(0,en-ns+1);}
    viewS=s;viewE=en;lay();draw(lastMx,lastMy);
  },{passive:false});
  var drag=false, dx0=0, dvs=0;
  cv.addEventListener('mousedown',function(e){drag=true;dx0=e.clientX;dvs=viewS;});
  window.addEventListener('mouseup',function(){drag=false;});
  cv.addEventListener('mousemove',function(e){
    if(!drag)return;
    var dx=e.clientX-dx0, per=(plot.x1-plot.x0)/getSpan();
    var sh=Math.round(-dx/per), sp=getSpan(), s=dvs+sh;
    if(s<0)s=0;if(s+sp>TOTAL)s=TOTAL-sp;
    viewS=s;viewE=s+sp-1;lay(true);draw(lastMx,lastMy);
  });
  // ===== 모바일 터치 =====
  // 한 손가락: 가격선(크로스헤어) 표시 + 좌우 스크롤 / 두 손가락: 핀치 확대축소
  var tStartX=0, tStartY=0, tDvs=0, tMoved=false, tVScroll=false, tHoriz=false;
  var pinchD0=0, pinchSp0=0, pinchCenter=0, pinching=false;
  function touchDist(t0,t1){var dx=t0.clientX-t1.clientX,dy=t0.clientY-t1.clientY;return Math.sqrt(dx*dx+dy*dy);}
  cv.addEventListener('touchstart',function(e){
    if(e.touches.length===2){
      // 두 손가락 = 핀치 시작
      pinching=true;
      pinchD0=touchDist(e.touches[0],e.touches[1]);
      pinchSp0=getSpan();
      var r=cv.getBoundingClientRect();
      var midX=((e.touches[0].clientX+e.touches[1].clientX)/2)-r.left;
      pinchCenter=iOfX(midX);
      return;
    }
    if(e.touches.length!==1)return;
    var t=e.touches[0], r=cv.getBoundingClientRect();
    tStartX=t.clientX; tStartY=t.clientY; tDvs=viewS; tMoved=false; tVScroll=false; tHoriz=false;
    lastMx=t.clientX-r.left; lastMy=(t.clientY-r.top)-44;
    draw(lastMx,lastMy);
  },{passive:true});
  cv.addEventListener('touchmove',function(e){
    if(e.touches.length===2&&pinching){
      // 핀치 확대/축소
      e.preventDefault();
      var d=touchDist(e.touches[0],e.touches[1]);
      if(pinchD0>0){
        var scale=pinchD0/d;  // 벌리면 d증가→scale<1→축소span(확대), 오므리면 반대
        var ns=Math.max(15,Math.min(TOTAL,Math.round(pinchSp0*scale)));
        var ratio=(pinchCenter-viewS)/Math.max(1,getSpan());
        var s=Math.round(pinchCenter-ns*ratio), en=s+ns-1;
        if(s<0){s=0;en=ns-1;}if(en>TOTAL-1){en=TOTAL-1;s=Math.max(0,en-ns+1);}
        viewS=s;viewE=en;lay();draw(lastMx,lastMy);
      }
      return;
    }
    if(e.touches.length!==1)return;
    var t=e.touches[0], r=cv.getBoundingClientRect();
    var dx=t.clientX-tStartX;
    var dy=t.clientY-tStartY;
    // 방향 미확정이면 판단: 세로가 크면 페이지스크롤(차트 안건드림), 가로가 크면 차트이동
    if(!tMoved && !tHoriz){
      if(Math.abs(dy)>Math.abs(dx) && Math.abs(dy)>6){ tVScroll=true; }
      else if(Math.abs(dx)>6){ tHoriz=true; }
    }
    if(tVScroll) return;        // 세로 = 페이지 스크롤 (차트 손 뗌)
    if(!tHoriz){ return; }      // 아직 방향 미확정이면 아무것도 안 함
    // 여기부터 가로 드래그 = 차트 기간 이동
    e.preventDefault();
    lastMx=t.clientX-r.left; lastMy=(t.clientY-r.top)-44;
    tMoved=true;
    var per=(plot.x1-plot.x0)/getSpan();
    var sh=Math.round(-dx/per), sp=getSpan(), s=tDvs+sh;
    if(s<0)s=0;if(s+sp>TOTAL)s=TOTAL-sp;
    viewS=s;viewE=s+sp-1;lay(true);
    draw(lastMx,lastMy);
    // 교차점/위험 툴팁
    tip.style.display='none';
    draws.forEach(function(d){if(Math.abs(lastMy-yOf(d.yc))<8){tip.style.display='block';tip.style.background='#7f77dd';tip.textContent='교차점 '+fmtP(d.yc);tip.style.left=Math.min(lastMx+12,W-90)+'px';tip.style.top=(yOf(d.yc)-28)+'px';}});
    risks.forEach(function(d){if(Math.abs(lastMy-yOf(d.yc))<8){tip.style.display='block';tip.style.background='#d4537e';tip.textContent='공방선 '+fmtP(d.yc);tip.style.left=Math.min(lastMx+12,W-110)+'px';tip.style.top=(yOf(d.yc)-28)+'px';}});
  },{passive:false});
  cv.addEventListener('touchend',function(e){
    if(e.touches.length<2){
      pinching=false;
      // 핀치 끝나고 한 손가락 남아도 드래그로 튀지 않게: 남은 터치를 새 기준점으로
      if(e.touches.length===1){
        tStartX=e.touches[0].clientX; tStartY=e.touches[0].clientY; tDvs=viewS; tMoved=false; tVScroll=true; tHoriz=false;
      }
    }
    if(e.touches.length===0){ tVScroll=false; }
    // 손 떼면 잠시 후 가격선·툴팁 정리
    setTimeout(function(){ lastMx=lastMy=null; draw(null,null); tip.style.display='none'; }, 1500);
  },{passive:true});
  document.getElementById('zin'+sfx).onclick=function(){var sp=getSpan(),ns=Math.max(15,Math.round(sp*0.7)),md=Math.round((viewS+viewE)/2);viewS=Math.max(0,md-Math.round(ns/2));viewE=Math.min(TOTAL-1,viewS+ns-1);lay();draw();};
  document.getElementById('zout'+sfx).onclick=function(){var sp=getSpan(),ns=Math.min(TOTAL,Math.round(sp*1.4)),md=Math.round((viewS+viewE)/2);viewS=Math.max(0,md-Math.round(ns/2));viewE=Math.min(TOTAL-1,viewS+ns-1);lay();draw();};
  document.getElementById('zall'+sfx).onclick=function(){viewS=0;viewE=TOTAL-1;lay();draw();};
  initDrawCanvas(sfx);
  scope.querySelectorAll('.mtd').forEach(function(el){el.addEventListener('change',function(){draw(lastMx,lastMy);});});
  // 시나리오 버튼 이벤트 + 페이드 애니메이션
  var fadeTimer=null;
  function playScenario(scen){
    if(fadeTimer){clearInterval(fadeTimer);fadeTimer=null;}
    // 토글: 같은 버튼 다시 누르면 끔
    if(SCEN===scen){SCEN=null;scenFade=0;
      scope.querySelectorAll('.scen-btn').forEach(function(b){b.classList.remove('active');});
      draw(lastMx,lastMy);return;}
    SCEN=scen;scenFade=0;
    scope.querySelectorAll('.scen-btn').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-scen')===scen);});
    // 교차점 기준부터 미래 끝까지 다 보이게 뷰 조정
    var aI=(pj.anchor_idx!=null)?pj.anchor_idx:(n-1);
    viewS=Math.max(0, aI-3);
    viewE=TOTAL-1;
    lay();
    // 페이드인
    fadeTimer=setInterval(function(){
      scenFade+=0.08;
      if(scenFade>=1){scenFade=1;clearInterval(fadeTimer);fadeTimer=null;}
      draw(lastMx,lastMy);
    },30);
  }
  scope.querySelectorAll('.scen-btn').forEach(function(b){
    b.addEventListener('click',function(){playScenario(b.getAttribute('data-scen'));});
  });
  try{lay();draw(null,null);}catch(err){console.error('draw error:',err);}
  window.addEventListener('resize',function(){lay();draw(null,null);});
}


// URL 파라미터로 자동 로드
(function(){
  var p=new URLSearchParams(window.location.search);
  var c=p.get('code');
  if(c) setTimeout(function(){go(c.toUpperCase());},200);
})();

// 부모창에서 postMessage로 탭 전환
window.addEventListener('message',function(e){
  if(e.data&&e.data.type==='switchTab'){
    var tab=document.querySelector('.trk-tab[data-trk="'+e.data.trk+'"]');
    if(tab) tab.click();
  }
  if(e.data&&e.data.type==='getActiveSfx'){
    // 현재 활성 탭의 sfx를 부모에게 알려줌
    var activeTab=document.querySelector('.trk-tab.on');
    var sfxNow=activeTab?activeTab.getAttribute('data-trk'):'';
    if(e.source) e.source.postMessage({type:'activeSfx',sfx:sfxNow},'*');
    else if(window.parent!==window) window.parent.postMessage({type:'activeSfx',sfx:sfxNow},'*');
  }
  if(e.data&&e.data.type==='loadCode'){
    go(e.data.code);
  }
});

// ===== 드로잉 레이어 =====
var _DS={};
function _ds(sfx){if(!_DS[sfx])_DS[sfx]={tool:'line',active:false,color:'#e24b4a',strokes:[],drawing:false,startX:0,startY:0,lastX:0,lastY:0,pts:[]};return _DS[sfx];}

function toggleDraw(sfx){
  var ds=_ds(sfx),dcv=document.getElementById('dcv'+sfx);
  ds.active=!ds.active;
  if(dcv){dcv.classList.toggle('active',ds.active);dcv.style.cursor=ds.active?'crosshair':'';}
  _redraw(sfx);
}
function setDTool(tool,sfx){
  var ds=_ds(sfx);ds.tool=tool;
  var dcv=document.getElementById('dcv'+sfx);
  if(dcv)dcv.style.cursor=tool==='eraser'?'cell':tool==='text'?'text':'crosshair';
}
function drawUndo(sfx){var ds=_ds(sfx);if(ds.strokes.length){ds.strokes.pop();_redraw(sfx);}}
function drawClear(sfx){var ds=_ds(sfx);ds.strokes=[];_redraw(sfx);}

function _redraw(sfx){
  var dcv=document.getElementById('dcv'+sfx),cv=document.getElementById('cv'+sfx);
  if(!dcv||!cv)return;
  dcv.width=cv.clientWidth;dcv.height=cv.clientHeight;
  var ctx=dcv.getContext('2d');ctx.clearRect(0,0,dcv.width,dcv.height);
  var ds=_ds(sfx);
  // 스트로크는 active 여부 관계없이 항상 복원 (탭 전환 후에도 유지)
  ds.strokes.forEach(function(s){_renderStroke(ctx,s);});
}
function _renderStroke(ctx,s){
  ctx.save();ctx.strokeStyle=s.color;ctx.lineWidth=s.tool==='eraser'?18:2;ctx.lineCap='round';ctx.lineJoin='round';
  if(s.tool==='eraser')ctx.globalCompositeOperation='destination-out';
  if(s.tool==='line'){ctx.beginPath();ctx.moveTo(s.x0,s.y0);ctx.lineTo(s.x1,s.y1);ctx.stroke();}
  else if(s.tool==='pen'||s.tool==='eraser'){if(s.pts&&s.pts.length>1){ctx.beginPath();ctx.moveTo(s.pts[0].x,s.pts[0].y);s.pts.forEach(function(p){ctx.lineTo(p.x,p.y);});ctx.stroke();}}
  else if(s.tool==='text'){ctx.fillStyle=s.color;ctx.font='14px sans-serif';ctx.fillText(s.text,s.x0,s.y0);}
  ctx.restore();
}
function initDrawCanvas(sfx){
  var dcv=document.getElementById('dcv'+sfx),cv=document.getElementById('cv'+sfx);
  if(!dcv||!cv)return;
  if(dcv._drawInit)return;  // 이미 초기화된 경우 중복 등록 방지
  dcv._drawInit=true;
  dcv.width=cv.clientWidth;dcv.height=cv.clientHeight;
  function pos(e){var r=dcv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  dcv.addEventListener('mousedown',function(e){
    var ds=_ds(sfx);if(!ds.active)return;
    var p=pos(e);ds.drawing=true;ds.startX=ds.lastX=p.x;ds.startY=ds.lastY=p.y;ds.pts=[{x:p.x,y:p.y}];
    ds.color=(document.getElementById('dtColor'+sfx)||{value:'#e24b4a'}).value;
    if(ds.tool==='text'){var t=prompt('텍스트:');if(t)ds.strokes.push({tool:'text',color:ds.color,x0:p.x,y0:p.y,text:t});ds.drawing=false;_redraw(sfx);}
  });
  dcv.addEventListener('mousemove',function(e){
    var ds=_ds(sfx);if(!ds.active||!ds.drawing)return;
    var p=pos(e);ds.pts.push(p);
    _redraw(sfx);
    var ctx=dcv.getContext('2d');
    ctx.save();ctx.strokeStyle=ds.color;ctx.lineWidth=ds.tool==='eraser'?18:2;ctx.lineCap='round';ctx.lineJoin='round';
    if(ds.tool==='eraser')ctx.globalCompositeOperation='destination-out';
    if(ds.tool==='line'){ctx.beginPath();ctx.moveTo(ds.startX,ds.startY);ctx.lineTo(p.x,p.y);ctx.stroke();}
    else{ctx.beginPath();ctx.moveTo(ds.pts[0].x,ds.pts[0].y);ds.pts.forEach(function(q){ctx.lineTo(q.x,q.y);});ctx.stroke();}
    ctx.restore();
    ds.lastX=p.x;ds.lastY=p.y;
  });
  function endDraw(e){
    var ds=_ds(sfx);if(!ds.active||!ds.drawing)return;
    ds.drawing=false;
    var p=e.type.startsWith('touch')?{x:ds.lastX,y:ds.lastY}:pos(e);
    if(ds.tool==='line')ds.strokes.push({tool:'line',color:ds.color,x0:ds.startX,y0:ds.startY,x1:p.x,y1:p.y});
    else ds.strokes.push({tool:ds.tool,color:ds.color,pts:ds.pts.slice()});
    _redraw(sfx);
  }
  dcv.addEventListener('mouseup',endDraw);
  dcv.addEventListener('mouseleave',endDraw);
  dcv.addEventListener('touchstart',function(e){e.preventDefault();var t=e.touches[0],r=dcv.getBoundingClientRect(),ds=_ds(sfx);if(!ds.active)return;ds.drawing=true;ds.startX=ds.lastX=t.clientX-r.left;ds.startY=ds.lastY=t.clientY-r.top;ds.pts=[{x:ds.startX,y:ds.startY}];ds.color=(document.getElementById('dtColor'+sfx)||{value:'#e24b4a'}).value;},{passive:false});
  dcv.addEventListener('touchmove',function(e){e.preventDefault();var ds=_ds(sfx);if(!ds.active||!ds.drawing)return;var t=e.touches[0],r=dcv.getBoundingClientRect(),mx=t.clientX-r.left,my=t.clientY-r.top;ds.pts.push({x:mx,y:my});_redraw(sfx);var ctx=dcv.getContext('2d');ctx.save();ctx.strokeStyle=ds.color;ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';if(ds.tool==='line'){ctx.beginPath();ctx.moveTo(ds.startX,ds.startY);ctx.lineTo(mx,my);ctx.stroke();}else{ctx.beginPath();ctx.moveTo(ds.pts[0].x,ds.pts[0].y);ds.pts.forEach(function(p){ctx.lineTo(p.x,p.y);});ctx.stroke();}ctx.restore();ds.lastX=mx;ds.lastY=my;},{passive:false});
  dcv.addEventListener('touchend',function(e){endDraw(e);},{passive:false});
  window.addEventListener('resize',function(){_redraw(sfx);});
}

// postMessage로 드로잉 제어 (어드민에서)
window.addEventListener('message',function(e){
  if(!e.data) return;
  if(e.data.type==='drawOn'){
    var ds=_ds(e.data.sfx||'');
    if(!ds.active){toggleDraw(e.data.sfx||'');}
    setDTool(e.data.tool||'line', e.data.sfx||'');
  }
  if(e.data.type==='drawOff'){
    var ds2=_ds(e.data.sfx||'');
    if(ds2.active){toggleDraw(e.data.sfx||'');}
  }
  if(e.data.type==='drawToggle') toggleDraw(e.data.sfx||'');
  if(e.data.type==='drawTool')   setDTool(e.data.tool, e.data.sfx||'');
  if(e.data.type==='drawUndo')   drawUndo(e.data.sfx||'');
  if(e.data.type==='drawClear')  drawClear(e.data.sfx||'');
  if(e.data.type==='drawColor'){var ds=_ds(e.data.sfx||'');ds.color=e.data.color;}
  if(e.data.type==='switchTab'){var tab=document.querySelector('.trk-tab[data-trk="'+(e.data.trk||'')+'"]');if(tab)tab.click();}
  if(e.data.type==='loadCode') go(e.data.code);
});
// ===== 드로잉 레이어 끝 =====

