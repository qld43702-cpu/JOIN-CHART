// ===== JOIN-CHART 공유 차트 코어 (BUILD:1782268651) =====
// index.html(유저)와 chart.html(어드민 iframe)이 공유.
// 드로잉은 admin이 postMessage('drawOn')을 보낼 때만 활성화됨.

var STOCKS=[];
// window.JC_FO = 선물·옵션 화면(futures.html). 주식 화면에서는 정의되지 않음 → 아래 동작 모두 기존 그대로.
var JC_FO=!!window.JC_FO;
var FO_TABS=[JT(208),JT(209),JT(210)];   // 선물·옵션 화면 탭 이름 (서버 tabs: 선물 5·30·60 / 옵션 3·5·10)
if(!JC_FO) fetch('/stocks.json?t='+Date.now()).then(function(r){return r.json();}).then(function(s){STOCKS=s||[];}).catch(function(){STOCKS=[];});
// URL 파라미터 자동 검색
if(!JC_FO)(function(){var p=new URLSearchParams(window.location.search),c=p.get('code');if(c)setTimeout(function(){go(c.toUpperCase());},300);})();
var inp=document.getElementById('codeInput'), ac=document.getElementById('acList');
if(inp) inp.addEventListener('input',function(){
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
  if(/^\d{4}$/.test(q)){go(q);return;}   // 4자리 숫자 = 일본 (도쿄)
  if(/^[A-Za-z][A-Za-z.\-]{0,6}$/.test(q)){go(q.toUpperCase());return;}
  var hit2=STOCKS.find(function(s){return s.code.includes(q);}); if(hit2){pick(hit2.code,hit2.name);}
}
if(inp) inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();inp.blur();doSearch();}});
// 검색 아이콘: chart.html은 #hdSearchIcon, index.html은 .hs-ic — 둘 다 안전하게 연결
var _searchIcon=document.getElementById('hdSearchIcon')||document.querySelector('.hs-ic');
if(_searchIcon) _searchIcon.addEventListener('click',doSearch);
document.addEventListener('click',function(e){if(!ac)return;if(!e.target.closest('.hd-search')&&!e.target.closest('.hero-search'))ac.classList.remove('show');});
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
  ac.innerHTML='<div class="rc-head"><span>'+JT(17)+'</span><span class="rc-clear" onclick="clearRecent()">'+JT(18)+'</span></div>'+
    '<div class="rc-wrap">'+chips+'</div>';
  ac.classList.add('show');
}
// 검색창 포커스 시 입력이 비어있으면 최근 검색 표시
if(inp) inp.addEventListener('focus',function(){
  inp.value='';      // 클릭 순간 입력값 비움 (바로 새로 칠 수 있게)
  showRecent();      // 최근 검색 표시
});

function mkMethodLabel(val,nm,col,methods){
  return '<label><input type="checkbox" class="mtd" value="'+val+'" checked style="accent-color:'+col+'"> '+nm+'</label>';
}

async function go(code){
  if(window.JC_SCALP) scalpStop();   // 3분 탭 자동 조회 멈춤 (관리자 화면에서만)
  var box=document.getElementById('result');
  var guide=document.getElementById('guide'); if(guide)guide.style.display='none';
  var hero=document.getElementById('heroIntro'); if(hero)hero.style.display='none';
  box.innerHTML='<div class="loading"><div class="rtv-spin"><div class="rtv-core">RTV</div><div class="rtv-ring"></div></div><div class="ltxt">'+JT(51)+'</div><div class="lsub">'+JT(52)+'</div><div class="load-chips"><span class="lchip" style="--c:#7f77dd">'+JT(53)+'</span><span class="lchip" style="--c:#1d9e75">'+JT(54)+'</span><span class="lchip" style="--c:#3f7fd0">'+JT(55)+'</span><span class="lchip" style="--c:#ba7517">'+JT(56)+'</span><span class="lchip" style="--c:#ed7d31">'+JT(57)+'</span></div></div>';
  try{
    var tk=window.jcIdToken?await window.jcIdToken():'';
    var x=await fetch('/api/analyze?code='+code+JC_Q,{headers:tk?{'Authorization':'Bearer '+tk}:{}}).then(function(r){return r.json();});
    if(x.error){box.innerHTML='<div class="empty data-notice">'+String(x.error).replace(/\n/g,'<br>')+'</div>';return;}
    if(x['종목명']) saveRecent(x['종목코드']||code, x['종목명']);
    PREVIEW=!!x.preview;   // 비로그인·대기·만료·정지 → 가격 *** + 흐리게 + 오버레이
    render(x);
    if(PREVIEW) lockPreview(code);
  }catch(e){box.innerHTML='<div class="empty">'+JT(218)+'</div>';}
}
// ===== 미리보기(preview): 렌더된 결과 전체를 흐리게 + 그 위에 auth.js 오버레이 =====
var PREVIEW=false;   // true면 가격 표시를 전부 *** 로
function lockPreview(code){
  var box=document.getElementById('result');
  var inner=document.createElement('div'); inner.className='jc-pvblur';
  while(box.firstChild) inner.appendChild(box.firstChild);
  var ov=document.createElement('div'); ov.className='jc-ov';
  box.style.position='relative';
  box.appendChild(inner); box.appendChild(ov);
  if(window.jcOverlay) window.jcOverlay(ov,code);
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
  var minName=JT(58);
  var h='<div id="host'+sfx+'" class="track">';
  h+='<div class="methods">';
  h+='<label><input type="checkbox" class="mtd" value="ell" style="accent-color:#7f77dd"> '+JT(53)+'</label>';
  h+='<label><input type="checkbox" class="mtd" value="mc" style="accent-color:#378add"> '+JT(55)+'</label>';
  h+='<label><input type="checkbox" class="mtd" value="fib" style="accent-color:#1d9e75"> '+JT(54)+'</label>';
  h+='<label><input type="checkbox" class="mtd" value="gann" style="accent-color:#ba7517"> '+JT(56)+'</label>';
  h+='</div>';
  h+='<div class="zoombar"><button id="zin'+sfx+'">'+JT(59)+'</button><button id="zout'+sfx+'">'+JT(60)+'</button><button id="zall'+sfx+'">'+JT(61)+'</button></div>';
  h+='<div class="chart-host" style="position:relative;"><canvas id="cv'+sfx+'"></canvas><canvas class="draw-canvas" id="dcv'+sfx+'"></canvas><div class="linetip" id="tip'+sfx+'"></div><div class="chart-notice" id="notice'+sfx+'" style="display:none"></div></div>';
  h+='<div class="legend"><span><i style="background:'+(JC_C?JC_C.scenUpHex:'#e24b4a')+'"></i>'+JT(62)+'</span><span><i style="background:'+(JC_C?JC_C.scenDnHex:'#378add')+'"></i>'+JT(63)+'</span><span><i style="background:#1d9e75"></i>'+JT(64)+'</span><span><i style="background:#5a6473"></i>'+JT(65)+'</span><span><i style="background:#d4537e"></i>'+JT(57)+'</span></div>';
  h+='<div class="scen-hint">'+hint+'</div>';
  h+='</div>'; // host
  return h;
}

function render(x){
  var d=x['일봉'];
  var box=document.getElementById('result');
  var _t60=x['60분'], _t10=x['10분'];
  if(JC_FO) FO_TABS=(x.tabs&&x.tabs.length===3)?x.tabs.map(function(n){return JTF(211,[n]);}):[JT(208),JT(209),JT(210)];
  // 셋 중 하나라도 부족하면 → 친절한 안내만, 차트 영역으로 안 넘김
  var dOK=(d&&!d.error&&d.chart), t60OK=(_t60&&!_t60.error&&_t60.chart), t10OK=(_t10&&!_t10.error&&_t10.chart);
  if(!dOK||!t60OK||!t10OK){
    var miss=[];
    if(!t10OK) miss.push(JC_FO?FO_TABS[0]:JT(219));
    if(!t60OK) miss.push(JC_FO?FO_TABS[1]:JT(220));
    if(!dOK) miss.push(JC_FO?FO_TABS[2]:JT(221));
    var emsg=(d&&d.error&&d.error.length>20)?d.error
      :(_t60&&_t60.error&&_t60.error.length>20)?_t60.error
      :(_t10&&_t10.error&&_t10.error.length>20)?_t10.error
      :JTF(222,[miss.join(' · ')]);
    box.innerHTML='<div class="empty data-notice">'+String(emsg).replace(/\n/g,'<br>')+'</div>';return;
  }
  var pj=d.projection||{methods:{}};
  var IS_US=(x['시장']==='미국');
  var IS_JP=(x['시장']==='일본');
  window.__IS_US=IS_US; window.__IS_JP=IS_JP;
  // 통화 포맷: 미국 $, 일본 ¥, 그 외 원
  function fmtCur(v){
    if(PREVIEW) return '***';
    v=v||0;
    if(JC_FO) return Number(v).toFixed(2);
    if(IS_US) return '$'+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
    if(IS_JP) return '¥'+Math.round(v).toLocaleString();
    return JTF(66,[v.toLocaleString()]);
  }
  window.__fmtCur=fmtCur;
  var t60=x['60분']; var has60 = t60 && !t60.error && t60.chart && t60.projection;
  var t10=x['10분']; var has10 = t10 && !t10.error && t10.chart && t10.projection;
  var minName=JT(58);
  var html='';
  var priceStr = fmtCur(d.cur);
  // 등락: 차트 마지막 봉 시가 대비 현재가 (전일종가 기준 근사)
  var _lastBar = (d.chart&&d.chart.length)?d.chart[d.chart.length-1]:null;
  var _prevClose = (d.chart&&d.chart.length>=2)?d.chart[d.chart.length-2].c:(_lastBar?_lastBar.o:d.cur);
  var _chg = (d.cur||0)-_prevClose;
  var _chgPct = _prevClose>0?(_chg/_prevClose*100):0;
  var _upColor = _chg>0?(JC_C?JC_C.up:'#e24b4a'):(_chg<0?(JC_C?JC_C.dn:'#378add'):'#5a6b7d');
  var _arrow = _chg>0?'▲':(_chg<0?'▼':'-');
  if(JC_FO && x['등락'] && x['등락'].change!=null){
    // 선물·옵션: LS 현재가 조회(t2111)의 전일 대비 등락을 그대로 사용 (sign 4·5 = 하락)
    var _s=String(x['등락'].sign||''); _chg=Math.abs(x['등락'].change)*((_s==='4'||_s==='5')?-1:1);
    _chgPct=Math.abs(x['등락'].diff||0)*(_chg<0?-1:1);
    _upColor = _chg>0?(JC_C?JC_C.up:'#e24b4a'):(_chg<0?(JC_C?JC_C.dn:'#378add'):'#5a6b7d');
    _arrow = _chg>0?'▲':(_chg<0?'▼':'-');
  }
  var _chgStr = (JC_FO?Math.abs(_chg).toFixed(2):IS_US?('$'+Math.abs(_chg).toFixed(2)):IS_JP?('¥'+Math.abs(Math.round(_chg)).toLocaleString()):(Math.abs(Math.round(_chg)).toLocaleString()))+' '+Math.abs(_chgPct).toFixed(2)+'%';
  if(PREVIEW) _chgStr='***';
  html+='<div class="result-head"><span class="rn">'+(x['종목명']||'')+'</span><span class="rc">'+x['종목코드']+(JC_FO&&!x['시장']?'':' · '+JC_MK(x['시장']||''))+'</span><span class="rp" style="color:'+_upColor+'">'+priceStr+'<span style="font-size:12px;font-weight:600;margin-left:6px">'+_arrow+' '+_chgStr+'</span></span></div>';

  // ===== 탭 =====
  html+='<div class="trk-tabs">';
  html+='<button class="trk-tab" data-trk="10"'+(has10?'':' style="display:none"')+'>'+(JC_FO?FO_TABS[0]:JT(67)+'<span>'+minName+'</span>')+'</button>';
  html+='<button class="trk-tab" data-trk="60"'+(has60?'':' style="display:none"')+'>'+(JC_FO?FO_TABS[1]:JT(68)+'<span>'+JT(69)+'</span>')+'</button>';
  html+='<button class="trk-tab on" data-trk="" >'+(JC_FO?FO_TABS[2]:JT(70)+'<span>'+JT(71)+'</span>')+'</button>';
  // 3분 탭: 관리자 화면(chart.html 의 window.JC_SCALP)에서, 한국 종목(숫자 6자리)일 때만
  var scalpOn=!!window.JC_SCALP&&!JC_FO&&/^\d{6}$/.test(String(x['종목코드']||''));
  if(scalpOn) html+='<button class="trk-tab" data-trk="s3">3분</button>';
  html+='</div>';

  // 패널들 (기본: 셋째 탭(장기 / 선물 60분) 보임)
  html+='<div class="trk-panel" data-pnl="10" style="display:none">'+trackHtml('10', minName, JT(72), IS_US)+'</div>';
  html+='<div class="trk-panel" data-pnl="60" style="display:none">'+trackHtml('60', JT(69), JT(73), IS_US)+'</div>';
  html+='<div class="trk-panel" data-pnl="" style="display:block">'+trackHtml('', JT(71), JT(74), IS_US)+'</div>';
  if(scalpOn) html+='<div class="trk-panel" data-pnl="s3" style="display:none">'+scalpHtml()+'</div>';

  // 최종 리포트 (선물·옵션 화면은 리포트 없이 판정 표시만)
  if(JC_FO) html+=foJudgeRow(d, pj, t10, t60);
  else html+='<button id="repBtn" class="report-btn"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>'+JT(87)+'</button>';
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

  if(scalpOn){
    // 3분 탭을 누르면 조회 시작(보이는 동안 자동 조회), 다른 탭으로 가면 멈춤
    window.__scalpGet=null;
    tabs.forEach(function(tb){ tb.addEventListener('click',function(){
      if(tb.getAttribute('data-trk')==='s3') scalpStart(String(x['종목코드'])); else scalpStop();
    }); });
  }
  var rb=document.getElementById('repBtn');
  if(rb) rb.addEventListener('click',function(){ buildReport(x, d, pj, t10, t60); });

  // 최초: 보이는 디폴트 트랙(셋째 탭 = 장기 / 선물 60분)을 그림
  requestAnimationFrame(function(){requestAnimationFrame(function(){
    mkChart(d,pj,'');
    // 나머지 트랙도 드로잉 초기화를 위해 백그라운드 렌더
    if(has10){ try{ mkChart(t10, t10.projection, '10'); }catch(e){} }
    if(has60){ try{ mkChart(t60, t60.projection, '60'); }catch(e){} }
  });});
}

// ===== 27개 조합 멘트 (장기_중기_단기) =====
// 원칙: 단기 상방=이미 올라 매수자리 지남(추격신중) / 장기상방+단기눌림=분할매수 / 장기하방+단기반등=데드캣
var verdicts3={
'up_up_up':{t:JT(88),s:JT(89),b:JT(90),hl:JT(91),c:'red'},
'up_up_flat':{t:JT(92),s:JT(93),b:JT(94),hl:JT(95),c:'red'},
'up_up_dn':{t:JT(96),s:JT(97),b:JT(98),hl:JT(99),c:'red'},
'up_flat_up':{t:JT(100),s:JT(101),b:JT(102),hl:JT(103),c:'orange'},
'up_flat_flat':{t:JT(104),s:JT(105),b:JT(106),hl:JT(107),c:'orange'},
'up_flat_dn':{t:JT(108),s:JT(109),b:JT(110),hl:JT(111),c:'red'},
'up_dn_up':{t:JT(112),s:JT(113),b:JT(114),hl:JT(115),c:'orange'},
'up_dn_flat':{t:JT(116),s:JT(117),b:JT(118),hl:JT(119),c:'orange'},
'up_dn_dn':{t:JT(120),s:JT(121),b:JT(122),hl:JT(123),c:'orange'},
'flat_up_up':{t:JT(124),s:JT(125),b:JT(126),hl:JT(127),c:'blue'},
'flat_up_flat':{t:JT(128),s:JT(129),b:JT(130),hl:JT(131),c:'blue'},
'flat_up_dn':{t:JT(132),s:JT(133),b:JT(134),hl:JT(135),c:'blue'},
'flat_flat_up':{t:JT(136),s:JT(137),b:JT(138),hl:JT(139),c:'blue'},
'flat_flat_flat':{t:JT(140),s:JT(141),b:JT(142),hl:JT(143),c:'gray'},
'flat_flat_dn':{t:JT(144),s:JT(145),b:JT(146),hl:JT(147),c:'blue'},
'flat_dn_up':{t:JT(148),s:JT(149),b:JT(150),hl:JT(151),c:'blue'},
'flat_dn_flat':{t:JT(152),s:JT(153),b:JT(154),hl:JT(155),c:'blue'},
'flat_dn_dn':{t:JT(156),s:JT(157),b:JT(158),hl:JT(159),c:'blue'},
'dn_up_up':{t:JT(160),s:JT(161),b:JT(162),hl:JT(163),c:'blue'},
'dn_up_flat':{t:JT(164),s:JT(165),b:JT(166),hl:JT(167),c:'blue'},
'dn_up_dn':{t:JT(168),s:JT(169),b:JT(170),hl:JT(171),c:'blue'},
'dn_flat_up':{t:JT(172),s:JT(173),b:JT(174),hl:JT(175),c:'blue'},
'dn_flat_flat':{t:JT(176),s:JT(177),b:JT(178),hl:JT(179),c:'blue'},
'dn_flat_dn':{t:JT(180),s:JT(181),b:JT(182),hl:JT(183),c:'blue'},
'dn_dn_up':{t:JT(184),s:JT(185),b:JT(186),hl:JT(187),c:'blue'},
'dn_dn_flat':{t:JT(188),s:JT(189),b:JT(190),hl:JT(191),c:'blue'},
'dn_dn_dn':{t:JT(192),s:JT(193),b:JT(194),hl:JT(195),c:'blue'}
};
// ===== 방향 판정 =====
// 핵심: 시나리오가 "출렁이면서(파동) + 시작가 대비 그 방향으로 제대로 가는가"
//  - 상승 파동 인정 = 상승 시나리오가 출렁임 있고 + 끝점이 시작가보다 위
//  - 하락 파동 인정 = 하락 시나리오가 출렁임 있고 + 끝점이 시작가보다 아래
//  - 둘 다 인정 → 중립 / 한쪽만 → 그 방향 / 둘 다 미인정 → 중립
function buildSeq(pj, d, dir){
  var cur=pj.cur||0;
  var startV=pj.recent_pivot_price||pj.anchor_price||cur;  // 시나리오와 같은 시작점(최근 변곡점)
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
  if(pj.judge_pct!=null){   // 선물·옵션: 판정 폭을 서버가 종목별로 계산해 보냄
    if(dir==='up'){ reach=Math.max.apply(null,front); if(reach <= startV*(1+pj.judge_pct)) return false; }
    else         { reach=Math.min.apply(null,front); if(reach >= startV*(1-pj.judge_pct)) return false; }
  } else {
  if(dir==='up'){ reach=Math.max.apply(null,front); if(reach <= startV*1.015) return false; }
  else         { reach=Math.min.apply(null,front); if(reach >= startV*0.985) return false; }
  }
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
// 선물·옵션 화면 판정 표시 (리포트의 축별 판정 칸과 같은 모양, 탭 이름은 FO_TABS)
function foJudgeRow(d, pj, t10, t60){
  var dirName={up:JT(212),dn:JT(213),flat:JT(214)};
  var dirCls={up:'d-up',dn:'d-dn',flat:'d-fl'};
  function miniSvg(dir){
    var pts = dir==='up'?'6,56 40,50 74,52 108,42 142,30 154,18'
            : dir==='dn'?'6,16 40,24 74,22 108,34 142,52 154,60'
            : '6,38 40,44 74,34 108,40 142,36 154,38';
    var col = dir==='up'?(JC_C?JC_C.up:'#dd5b54'):dir==='dn'?(JC_C?JC_C.dn:'#3f7fd0'):'#6e7c8a';
    return '<svg viewBox="0 0 160 70" width="100%" height="60" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function ax(nm, p, dd){
    if(!p) return '';
    var r=judgeDir(p, dd, false);
    return '<div class="axis"><div class="axis-top"><span class="axis-nm">'+nm+'</span><span class="axis-dir '+dirCls[r]+'">'+dirName[r]+'</span></div><div class="mini-chart">'+miniSvg(r)+'</div></div>';
  }
  return '<div class="report"><div class="axis-row">'+
    ax(FO_TABS[0], t10&&t10.projection, t10)+ax(FO_TABS[1], t60&&t60.projection, t60)+ax(FO_TABS[2], pj&&pj.cur?pj:null, d)+
    '</div></div>';
}

// ===== 최종 리포트 생성 =====
function buildReport(x, d, pj, t10, t60){
  var area=document.getElementById('reportArea');
  if(!area) return;
  if(area.innerHTML){ area.innerHTML=''; return; }  // 토글
  var IS_US=(x['시장']==='미국');
  // 종합 판정 = 중기(60분) + 중장기(일봉). 둘 중 하나라도 분석 불가면 판정 불가.
  var midOK = t60 && t60.projection && t60.draws && t60.draws.length>0;
  var longOK = d && pj && d.draws && d.draws.length>0;
  if(!midOK || !longOK){
    var miss=[];
    if(!longOK) miss.push(JT(221));
    if(!midOK) miss.push(JT(220));
    area.innerHTML='<div class="report"><div class="rep-title">'+JT(196)+'</div>'+
      '<div class="rep-na"><div class="na-ic">⚠️</div>'+
      '<div class="na-tt">'+JT(197)+'</div>'+
      '<div class="na-ds">'+JTF(198,[miss.join('· ')])+'</div>'+
      '</div>'+
      '<div class="rep-foot">'+JT(199)+'</div></div>';
    return;
  }
  var IS_JP=(x['시장']==='일본');
  function pf(v){ if(PREVIEW) return '***'; return IS_US?('$'+Number(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})):IS_JP?('¥'+Math.round(v).toLocaleString()):JTF(200,[Math.round(v).toLocaleString()]); }
  var qDir=judgeDir(pj, d, false);                                   // 장기(일봉)
  var mDir=(t60&&t60.projection)?judgeDir(t60.projection, t60, false):'flat';  // 월(60분봉)
  var wDir=(t10&&t10.projection)?judgeDir(t10.projection, t10, true):'flat';   // 주(10분봉) — 표시용
  // 종합 판정은 중기+장기만 사용 (단기 제외). 멘트 조합에서 주간 자리는 중립 고정.
  var dirName={up:JT(212),dn:JT(213),flat:JT(214)};
  var dirCls={up:'d-up',dn:'d-dn',flat:'d-fl'};
  // 종합 멘트 (장기 × 월 — 주간 제외)
  var combo=qDir+'_'+mDir+'_flat';
  var V=verdicts3[combo]||verdicts3['flat_flat_flat'];
  var v={t:V.t, s:V.s, b:V.b, hl:V.hl, c:V.c};
  var hlCls={orange:'hl-orange',blue:'hl-blue',gray:'hl-blue',red:'hl-orange'}[v.c];
  // 미니 차트 path 생성
  function miniSvg(dir){
    var pts = dir==='up'?'6,56 40,50 74,52 108,42 142,30 154,18'
            : dir==='dn'?'6,16 40,24 74,22 108,34 142,52 154,60'
            : '6,38 40,44 74,34 108,40 142,36 154,38';
    var col = dir==='up'?(JC_C?JC_C.up:'#dd5b54'):dir==='dn'?(JC_C?JC_C.dn:'#3f7fd0'):'#6e7c8a';
    return '<svg viewBox="0 0 160 70" width="100%" height="60" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  var h='<div class="report">';
  h+='<div class="rep-title">'+JT(196)+'</div>';
  // 3축: 단기 → 중기 → 장기 순
  h+='<div class="axis-row">';
  if(t10&&t10.projection){
    h+='<div class="axis"><div class="axis-top"><span class="axis-nm">'+JT(67)+'</span><span class="axis-dir '+dirCls[wDir]+'">'+dirName[wDir]+'</span></div><div class="mini-chart">'+miniSvg(wDir)+'</div></div>';
  }
  if(t60&&t60.projection){
    h+='<div class="axis"><div class="axis-top"><span class="axis-nm">'+JT(68)+'</span><span class="axis-dir '+dirCls[mDir]+'">'+dirName[mDir]+'</span></div><div class="mini-chart">'+miniSvg(mDir)+'</div></div>';
  }
  h+='<div class="axis"><div class="axis-top"><span class="axis-nm">'+JT(201)+'</span><span class="axis-dir '+dirCls[qDir]+'">'+dirName[qDir]+'</span></div><div class="mini-chart">'+miniSvg(qDir)+'</div></div>';
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
    var s='<div class="gong-sec"><div class="gs-label"><span class="dot"></span>'+JTF(202,[label])+'</div><div class="gs-lines">';
    lines.forEach(function(L,i){
      var gap=cur>0?((L.v-cur)/cur*100):0;
      s+='<div class="gl"><span class="gl-tag num">'+(i+1)+'</span><span class="gl-price">'+pf(L.v)+'</span><span class="gl-gap">'+(gap>=0?'+':'')+gap.toFixed(1)+'%</span></div>';
    });
    s+='</div></div>';
    return s;
  }
  h+='<div class="gong-card">';
  h+='<div class="gong-hd"><svg viewBox="0 0 24 24" fill="none" stroke="#b3502c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M5 7l7-5 7 5M5 17l7 5 7-5"/></svg>'+JT(203)+'</div>';
  h+='<div class="gong-desc">'+JT(204)+'</div>';
  h+='<div class="gong-body">';
  h+=gongSec(JT(205), t10&&t10.projection, t10);
  h+=gongSec(JT(206), t60&&t60.projection, t60);
  h+=gongSec(JT(74), pj, d);
  h+='</div></div>';
  h+='<div class="rep-foot">'+JT(207)+'</div>';
  h+='</div>';
  area.innerHTML=h;
  area.scrollIntoView({behavior:'smooth',block:'start'});
}

// ===== 3분 탭 (관리자 전용) — chart.html 이 window.JC_SCALP=true 로 켠다. 플래그가 없으면 아래 함수는 불리지 않는다 =====
var SCALP_MS=15000;   // 자동 조회 간격
var _scalp={code:null,timer:null,seq:0,busy:-1,ctrl:null};
function scalpHtml(){
  var h=trackHtml('s3','','',false);
  h=h.replace('<div class="chart-host"','<div id="scalpSt" style="white-space:pre-wrap;font-size:14px;font-weight:700;color:#1b3a5c;margin:0 0 8px"></div><div class="chart-host"');
  h=h.replace('</div><div class="scen-hint">','<span><i style="background:#f28c38"></i>돌파 신호</span><span><i style="background:#7f77dd"></i>VWAP</span></div><div class="scen-hint">');
  return h;
}
function scalpLine(w){
  if(!w) return '';
  return '돌파 신호 '+(w.signal?'○':'×')+'  ·  거래량 '+(w.relvol!=null?Number(w.relvol).toFixed(1):'-')+'배  ·  VWAP '+(w.vwap_ok?'위':'아래')+'  ·  20봉 고점 돌파 '+(w.high_ok?'○':'×')+(w.forming?' (진행 중)':'');
}
function scalpVisible(){ var p=document.querySelector('.trk-panel[data-pnl="s3"]'); return !!p&&p.style.display!=='none'; }
function scalpStop(){ if(_scalp.timer){clearInterval(_scalp.timer);_scalp.timer=null;} _scalp.seq++; }
function scalpStart(code){
  scalpStop(); _scalp.code=code; scalpLoad();
  _scalp.timer=setInterval(function(){ if(!scalpVisible()){scalpStop();return;} scalpLoad(); },SCALP_MS);
}
async function scalpLoad(){
  var seq=_scalp.seq, code=_scalp.code;
  if(_scalp.busy===seq) return;   // 앞 조회가 아직 안 끝남
  _scalp.busy=seq;
  try{
    var tk=window.jcIdToken?await window.jcIdToken():'';
    var x=await fetch('/api/scalp?code='+code,{headers:tk?{'Authorization':'Bearer '+tk}:{}}).then(function(r){return r.json();});
    if(seq!==_scalp.seq||!scalpVisible()) return;   // 그 사이 다른 탭·다른 종목으로 감
    scalpPaint(x);
  }catch(e){ console.error('scalp:',e); }
  finally{ if(_scalp.busy===seq) _scalp.busy=-1; }
}
function scalpPaint(x){
  var pnl=document.querySelector('.trk-panel[data-pnl="s3"]'); if(!pnl) return;
  if(!x||x.error||!x.chart){ var st=document.getElementById('scalpSt'); if(st) st.textContent=(x&&x.error)?String(x.error):''; return; }
  // 다시 그리기 전: 화면 범위·기법 체크 상태를 기억해 두고, 패널을 새로 만들어 앞 차트의 이벤트를 모두 떼어 낸다
  if(_ds('s3').drawing) return;   // 작도 도구로 긋는 중이면 이번 차례는 건너뜀
  var keep=window.__scalpGet?window.__scalpGet():null, chk=[];
  pnl.querySelectorAll('.mtd').forEach(function(el){chk.push(el.checked);});
  if(_scalp.ctrl) _scalp.ctrl.abort();
  _scalp.ctrl=window.AbortController?new AbortController():null;
  var oldD=document.getElementById('dcvs3');
  pnl.innerHTML=scalpHtml();
  var newD=document.getElementById('dcvs3');
  if(oldD&&newD) newD.parentNode.replaceChild(oldD,newD);   // 작도 도구 캔버스는 그대로 둔다(켜짐 상태·이벤트 유지)
  pnl.querySelectorAll('.mtd').forEach(function(el,i){ if(chk[i]!=null) el.checked=chk[i]; });
  document.getElementById('scalpSt').textContent=scalpLine(x.now);
  window.__scalpKeep=keep;
  try{ mkChart(x, x.projection||{methods:{}}, 's3'); }catch(e){ console.error('scalp chart:',e); }
  window.__scalpKeep=null;
  requestAnimationFrame(function(){ try{ _redraw('s3'); }catch(e){} });
}

function mkChart(data,pj,sfx){
  sfx=sfx||'';
  var IS_SCALP=!!window.JC_SCALP&&sfx==='s3';   // 관리자 3분 탭 (그 밖에는 항상 false → 아래 추가 동작 없음)
  var _wopt=(IS_SCALP&&_scalp.ctrl)?{signal:_scalp.ctrl.signal}:undefined;   // 3분 탭: 다시 그릴 때 window 이벤트를 떼어 내기 위함
  var IS_US=!!window.__IS_US;
  var IS_JP=!!window.__IS_JP;
  function fmtP(v){ if(PREVIEW) return '***'; if(JC_FO) return Number(v).toFixed(2); return IS_US ? ('$'+Number(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})) : IS_JP ? ('¥'+Math.round(v).toLocaleString()) : Math.round(v).toLocaleString(); }
  // ===== v3 모든 데이터 변수 최상단 선언 (TDZ 방지) =====
  var cv=document.getElementById('cv'+sfx), tip=document.getElementById('tip'+sfx);
  var scope=document.getElementById('host'+sfx)||document;
  var ch=data.chart, n=ch.length, draws=data.draws||[], risks=data.risks||[];
  // 교차점(작도) 없음 = 충분한 차트 분석 불가 → 안내 + 확인 버튼
  var _notice=document.getElementById('notice'+sfx);
  if(_notice){
    if(!draws.length&&!PREVIEW){   // 미리보기는 교차점을 아예 받지 않으므로 안내 상자를 띄우지 않는다
      _notice.innerHTML='<div class="cn-box">'+
        '<div class="cn-ic">📊</div>'+
        '<div class="cn-tt">'+JT(75)+'</div>'+
        '<div class="cn-ds">'+JT(76)+'</div>'+
        '<button class="cn-ok" onclick="this.closest(\'.chart-notice\').style.display=\'none\'">'+JT('77b')+'</button>'+
        '</div>';
      _notice.style.display='flex';
    } else {
      _notice.style.display='none';
    }
  }
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
  var userView=false;   // 사용자가 직접 확대·축소했는가 (했으면 세로 범위는 캔들에만 맞춤)
  var srLevels=(pj&&pj.sr_levels)||[];
  // 초기 뷰: 현재 봉 기준 과거 25개 + 미래 15개 (증권사처럼 캔들 굵게)
  (function(){
    var PAST=50, FUTV=30;
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
        out.push(JTF(78,[(dt.getMonth()+1),dt.getDate(),dt.getHours()]));
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
  function lbl(i){return i<n?ch[i].d:'';}   // 미래 구간(현재 이후)은 x축·십자선 날짜 라벨 없음
  function lay(keepY){
    W=cv.clientWidth; H=cv.clientHeight;
    if(!W||!H){W=cv.clientWidth||cv.parentElement.clientWidth-20||900;H=cv.clientHeight||440;}
    isMob=W<480;
    padR=isMob?60:76; padL=isMob?8:8; padT=isMob?10:14; padB=isMob?30:40;   // 글씨를 키우면서 오른쪽·아래 여백을 늘림
    FONT_SM=isMob?12:13; FONT_MD=isMob?10:12;
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
    var cSpan=hi-lo;   // 보이는 캔들의 가격 폭
    lo*=0.99; hi*=1.01;
    // 처음 뜰 때(사용자가 확대·축소하기 전)만: 세로 범위를 넓혀 ① 현재가에서 가장 가까운 공방선 ② 목표선·위험선 끝 가격표가 화면 안에 들어오게.
    // 넓힌 쪽에 6% 여백. 넣었을 때 캔들 영역이 차트 높이의 절반 아래로 줄면 넣지 않는다(①을 먼저, 그다음 ②).
    if(!userView&&pj&&cSpan>0){
      var fitV=function(vals){
        var nlo=lo,nhi=hi;
        for(var k=0;k<vals.length;k++){ var v=vals[k]; if(v==null||!isFinite(v)||v<=0) continue; if(v<nlo)nlo=v; if(v>nhi)nhi=v; }
        if(nlo===lo&&nhi===hi) return;
        var pad=(nhi-nlo)*0.06;
        if(nlo<lo)nlo-=pad; if(nhi>hi)nhi+=pad;
        if(cSpan/(nhi-nlo)>=0.5){ lo=nlo; hi=nhi; }
      };
      var gNear=null;
      for(var ri=0;ri<risks.length;ri++){ var gy=risks[ri].yc; if(gy>0&&(gNear==null||Math.abs(gy-cur)<Math.abs(gNear-cur))) gNear=gy; }
      if(gNear!=null) fitV([gNear]);
      if(pj.up_target!=null&&pj.dn_target!=null&&ve>=MAIN_I){
        var fr=Math.max(0,Math.min(1,(ve-MAIN_I)/Math.max(1,(TOTAL-1)-MAIN_I)));
        fitV([MAIN_P+(pj.up_target-MAIN_P)*fr, MAIN_P+(pj.dn_target-MAIN_P)*fr]);
      }
    }
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
  var RECENT_I=(pj.recent_pivot!=null)?pj.recent_pivot:null;
  // 메인 기준 = 최근 변곡점(있으면). 없으면 기존 시작점. 과거 시작점(PAST_I)은 희미한 선용.
  var MAIN_I=(RECENT_I!=null && RECENT_I<n)?RECENT_I:ANCHOR_I;
  var PAST_I=(RECENT_I!=null && RECENT_I<n && ANCHOR_I!==RECENT_I)?ANCHOR_I:null;
  var MAIN_P=(ma2[MAIN_I]!=null)?ma2[MAIN_I]:((pj.anchor_price!=null&&MAIN_I===ANCHOR_I)?pj.anchor_price:(c[MAIN_I]!=null?c[MAIN_I]:cur));
  var PAST_P=(PAST_I!=null)?((pj.anchor_price!=null)?pj.anchor_price:(c[PAST_I]!=null?c[PAST_I]:cur)):null;
  var ANCHOR_P=MAIN_P;
  var ANCHOR_SPAN=Math.max(1,(TOTAL-1)-MAIN_I);
  function fwave(ctx,fn,color,wid,dash,fromGreen,ovStartI,ovStartP){
    var startI=(ovStartI!=null)?ovStartI:MAIN_I;
    var baseP=(ovStartP!=null)?ovStartP:ANCHOR_P;
    var totalSpan=Math.max(1,(TOTAL-1)-startI);
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
    ctx.strokeStyle='#eef1f5';ctx.lineWidth=1;ctx.fillStyle='#56687c';ctx.textAlign='left';
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
    ctx.fillStyle='#56687c';ctx.textAlign='center';ctx.font=FONT_SM+'px '+FF();
    var xCnt=isMob?3:6;
    var lastXEnd=-999;
    for(var t=0;t<xCnt;t++){
      var idx=viewS+Math.round((getSpan()-1)*t/(xCnt-1));
      var L=lbl(idx);
      if(!L)continue;
      // 모바일: 날짜만 (HH시 제거), 일봉은 MM/DD만
      if(isMob) L=L.replace(/ \d+시/,'');
      L=JC_TL(L);
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
      ctx.fillStyle='#8a98a8';ctx.font='bold '+(isMob?12:14)+'px '+FF();ctx.textAlign='center';ctx.fillText(JT(79),nowX,plot.y0+12);
    }
    // ===== 매물대/매물집중 제거됨 =====

    // 캔들 (증권사처럼 진하게)
    var cw=Math.max(1.5,(plot.x1-plot.x0)/getSpan()*0.62);
    for(var i=Math.max(0,viewS);i<=Math.min(viewE,n-1);i++){
      var r=ch[i],x=xOf(i),u=r.c>=r.o;
      ctx.strokeStyle=u?(JC_C?JC_C.up:'#e02f2f'):(JC_C?JC_C.dn:'#1f6fd0');ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(x,yOf(r.h));ctx.lineTo(x,yOf(r.l));ctx.stroke();
      ctx.fillStyle=u?(JC_C?JC_C.up:'#e02f2f'):(JC_C?JC_C.dn:'#1f6fd0');
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
    if(IS_SCALP){
      // 3분 탭 첨가 표시: VWAP(가는 선, 날짜가 바뀌면 끊음) + 돌파 신호(봉 아래 작은 위쪽 삼각형)
      var vw=data.vwap||[], sg=data.signals||[];
      ctx.save();ctx.beginPath();ctx.rect(plot.x0,plot.y0,plot.x1-plot.x0,plot.y1-plot.y0);ctx.clip();
      ctx.strokeStyle='#7f77dd';ctx.lineWidth=1;ctx.beginPath();var vst=false;
      for(var vi=Math.max(0,viewS);vi<=Math.min(viewE,n-1);vi++){
        if(vw[vi]==null){vst=false;continue;}
        if(vi>0&&ch[vi].rawd!==ch[vi-1].rawd) vst=false;
        if(!vst){ctx.moveTo(xOf(vi),yOf(vw[vi]));vst=true;}else{ctx.lineTo(xOf(vi),yOf(vw[vi]));}
      }
      ctx.stroke();
      ctx.fillStyle='#f28c38';
      for(var si=0;si<sg.length;si++){
        var gi=sg[si]; if(gi<viewS||gi>viewE||gi>=n) continue;
        var sx=xOf(gi), sy=yOf(ch[gi].l)+5;
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx-4,sy+7);ctx.lineTo(sx+4,sy+7);ctx.closePath();ctx.fill();
      }
      ctx.restore();
    }
    // 위험선
    risks.forEach(function(d){
      if(!d.price_only){
        seg(ctx,d.A_t1-1,ma2[d.A_t1-1]||d.A_y1,d.A_t1,d.A_y1,'#d4537e',2.4);
        // 교차점까지 역방향 점선 — 제거됨(오해 방지)
      }
      ctx.strokeStyle='rgba(212,83,126,.85)';ctx.lineWidth=1.4;ctx.setLineDash(d.price_only?[6,4]:[]);
      ctx.beginPath();ctx.moveTo(plot.x0,yOf(d.yc));ctx.lineTo(plot.x1,yOf(d.yc));ctx.stroke();ctx.setLineDash([]);
      // 공방선 가격표: 굵게 PC 15px / 모바일 13px, 상자 높이 24 / 21
      var gh=isMob?21:24;
      var glbl=JTF(80,[fmtP(d.yc)]); ctx.font='bold '+(isMob?13:15)+'px '+FF();
      var glw=ctx.measureText(glbl).width+14;
      ctx.fillStyle='#d4537e';ctx.fillRect(plot.x0+4,yOf(d.yc)-gh/2,glw,gh);
      ctx.fillStyle='#fff';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(glbl,plot.x0+11,yOf(d.yc)+1);ctx.textBaseline='alphabetic';
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
    // 미래 선·시나리오는 차트 칸 안에서만 그린다 (가격 눈금 칸·날짜 줄로 삐져나오지 않게 자름)
    ctx.save();ctx.beginPath();ctx.rect(plot.x0,plot.y0,plot.x1-plot.x0,plot.y1-plot.y0);ctx.clip();
    // 미래 예측 (전부 직선) — 메인 기준점(최근 변곡)부터 그림
    if(viewE>=MAIN_I&&pj){
      var us=pj.up_slope||0, upT=pj.up_target, dnT=pj.dn_target, vol=pj.volatility||0.02;
      // 오리지날 상승 잠재선 (캡 없는 작도 최대치) — 진한 회색. 녹색보다 먼저(아래에) 그려 가림 방지
      // green_max 없으면 35%선 역산(up_target=35%니까 ÷0.35)
      var gmax=pj.green_max || (cur+(upT-cur)/0.35);
      if(gmax>upT*1.001){
        fwave(ctx,function(t,b){return b+(gmax-b)*t;},'rgba(70,80,95,.9)',2.4,[3,3],false);
      }
      // 기본 틀: 메인 기준부터 — 직선
      fwave(ctx,function(t,b){return b+(upT-b)*t;},'rgba(29,158,117,.95)',2.4,[6,4],false);       // 상승목표(녹색 35%)
      fwave(ctx,function(t,b){return b+(dnT-b)*t;},'rgba(212,83,126,.9)',2.4,[6,4],false);         // 위험(분홍)
      // 과거 시작점(PAST_I)에서는 희미한 공방선·위험선만 (이미 지나간 기준)
      if(PAST_I!=null){
        fwave(ctx,function(t,b){return b+(upT-b)*t;},'rgba(29,158,117,.28)',1.6,[5,4],false,PAST_I,PAST_P);   // 희미 공방
        fwave(ctx,function(t,b){return b+(dnT-b)*t;},'rgba(212,83,126,.28)',1.6,[5,4],false,PAST_I,PAST_P);   // 희미 위험
      }
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
          ctx.beginPath();ctx.moveTo(xOf(MAIN_I),yOf(lv));ctx.lineTo(xOf(TOTAL-1),yOf(lv));ctx.stroke();ctx.setLineDash([]);
          // 라벨 겹침 방지: 이전 라벨과 14px 이내면 건너뜀
          var ly=yOf(lv);
          var tooClose=fibLabelYs.some(function(y){return Math.abs(y-ly)<14;});
          if(!tooClose){
            fibLabelYs.push(ly);
            ctx.fillStyle=up?'rgba(29,158,117,.85)':'rgba(212,83,126,.85)';
            ctx.font='10px '+FF();ctx.textAlign='left';
            ctx.fillText(fmtP(lv),xOf(MAIN_I)+2,ly-2);
          }
        }
      }
    }
    // ===== 시나리오 웨이브 (교차점 기준점부터 — 실제 봉과 비교 가능) =====
    if(SCEN && scenFade>0){
      // 상승·하락 시나리오를 함께 표시 (SCEN==='both'). 탭 전환만으로 양쪽 다 보임.
      var startI=MAIN_I, endI=TOTAL-1;
      var ceil_ = pj.up_target||cur*1.1;
      var floor_ = pj.dn_target||cur*0.8;
      var span0=Math.max(1,(TOTAL-1)-MAIN_I);
      function tgtAt(i){ var t=(i-MAIN_I)/span0; return MAIN_P+(ceil_-MAIN_P)*t; }
      function rskAt(i){ var t=(i-MAIN_I)/span0; return MAIN_P+(floor_-MAIN_P)*t; }
      var lv=[];
      if(pj.xpoints&&pj.xpoints.length){ pj.xpoints.forEach(function(v){if(v>0)lv.push(v);}); }
      else { draws.forEach(function(d){if(d.yc>0)lv.push(d.yc);}); risks.forEach(function(d){if(d.yc>0)lv.push(d.yc);}); }
      var loB=Math.min(MAIN_P,floor_)*0.98, hiB=Math.max(MAIN_P,ceil_)*1.02;
      lv=lv.filter(function(v){return v>loB&&v<hiB;}).sort(function(a,b){return a-b;});
      ctx.save();
      ctx.globalAlpha=scenFade;
      if(startI>=viewS&&startI<=viewE){
        ctx.strokeStyle='rgba(232,116,59,'+(0.5*scenFade)+')';ctx.lineWidth=1.4;ctx.setLineDash([4,3]);
        ctx.beginPath();ctx.moveTo(xOf(startI),plot.y0);ctx.lineTo(xOf(startI),plot.y1);ctx.stroke();ctx.setLineDash([]);
      }
      // 한 방향 시나리오 그리기 (시작점 = 최근 변곡점 MAIN_I)
      function drawScen(dirUp){
        var color = JC_C?(dirUp?JC_C.scenUp:JC_C.scenDn):(dirUp?'rgba(226,75,74,':'rgba(55,138,221,');
        var startV=MAIN_P;
        var aimP=dirUp? ceil_ : floor_;
        var midLv;
        if(dirUp) midLv=lv.filter(function(v){return v>startV*1.005 && v<ceil_*0.999;}).sort(function(a,b){return a-b;});
        else      midLv=lv.filter(function(v){return v<startV*0.995 && v>floor_*1.001;}).sort(function(a,b){return b-a;});
        var seq=[startV]; var prev=startV;
        for(var mi=0;mi<midLv.length;mi++){
          seq.push(midLv[mi]);
          if(mi<midLv.length-1) seq.push(prev+(midLv[mi]-prev)*(dirUp?0.55:0.30));
          prev=midLv[mi];
        }
        seq.push(aimP);
        var steps=endI-MAIN_I; if(steps<1)steps=1;
        var segW=[]; for(var q=1;q<seq.length;q++){ segW.push(seq[q]>=seq[q-1]?1.6:0.7); }
        var wsum=0; for(var wi=0;wi<segW.length;wi++)wsum+=segW[wi]; if(wsum<=0)wsum=1;
        var tpos=[0],acc=0; for(var q2=1;q2<seq.length;q2++){ acc+=segW[q2-1]; tpos.push(acc/wsum); }
        ctx.strokeStyle=color+'0.95)';ctx.lineWidth=2.6;ctx.setLineDash((JC_C&&!dirUp)?[7,5]:[]);
        ctx.beginPath();
        for(var s=0;s<=steps;s++){
          var t=s/steps;
          var k=0; while(k<seq.length-2 && t>tpos[k+1]) k++;
          var segT=(t-tpos[k])/((tpos[k+1]-tpos[k])||1);
          var ease=(1-Math.cos(segT*Math.PI))/2;
          var base=seq[k]+(seq[k+1]-seq[k])*ease;
          var xx=xOf(MAIN_I+s), yy=yOf(base);
          if(s===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
        }
        ctx.stroke();
        var labels=['1','2','3','4','5','6','7','8'];
        ctx.fillStyle=color+'0.9)';ctx.font='bold '+(isMob?12:14)+'px '+FF();ctx.textAlign='center';
        for(var ai=1;ai<seq.length;ai++){
          var px=MAIN_I+tpos[ai]*steps;
          if(px<=endI&&labels[ai-1]) ctx.fillText(labels[ai-1], xOf(px), yOf(seq[ai])-(dirUp?6:-14));
        }
      }
      if(SCEN==='both'){ drawScen(true); drawScen(false); }
      else drawScen(SCEN!=='dn');
      ctx.restore();
    }
    ctx.restore();   // 자르기 끝
    // 목표선(녹색 점선)·위험선(분홍 점선)의 오른쪽 끝 가격표 — 선과 같은 색 바탕에 흰 글씨, 공방선 가격표와 같은 크기.
    // 숫자 = 선이 끝나는 지점의 가격. 선 끝이 보이는 가격 범위 밖이면 위·아래 가장자리에 붙이고, 둘이 겹치면 위아래로 비켜 놓는다.
    if(viewE>=MAIN_I&&pj&&pj.up_target!=null&&pj.dn_target!=null){
      var th=isMob?21:24, tEnd=Math.min(viewE,TOTAL-1);
      var tRatio=Math.max(0,Math.min(1,(tEnd-MAIN_I)/Math.max(1,(TOTAL-1)-MAIN_I)));
      var tags=[{v:pj.up_target,col:'#1d9e75'},{v:pj.dn_target,col:'#d4537e'}];
      var tyMin=plot.y0+th/2, tyMax=plot.y1-th/2;
      ctx.font='bold '+(isMob?13:15)+'px '+FF();
      tags.forEach(function(g){
        g.y=Math.max(tyMin,Math.min(tyMax,yOf(MAIN_P+(g.v-MAIN_P)*tRatio)));
        g.txt=fmtP(g.v); g.w=ctx.measureText(g.txt).width+14;
      });
      var tTop=(tags[0].y<=tags[1].y)?tags[0]:tags[1], tBot=(tTop===tags[0])?tags[1]:tags[0];
      var tNeed=(th+2)-(tBot.y-tTop.y);
      if(tNeed>0){
        tTop.y-=tNeed/2; tBot.y+=tNeed/2;
        if(tTop.y<tyMin){ tBot.y+=(tyMin-tTop.y); tTop.y=tyMin; }
        if(tBot.y>tyMax){ tTop.y-=(tBot.y-tyMax); tBot.y=tyMax; }
      }
      ctx.textAlign='left';ctx.textBaseline='middle';
      tags.forEach(function(g){
        ctx.fillStyle=g.col;ctx.fillRect(plot.x1-g.w,g.y-th/2,g.w,th);
        ctx.fillStyle='#fff';ctx.fillText(g.txt,plot.x1-g.w+7,g.y+1);
      });
      ctx.textBaseline='alphabetic';
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
      if(L){var xl=JC_TL(isMob?L.replace(/ \d+시/,''):L);var tw=ctx.measureText(xl).width+10;ctx.fillStyle='#1a3a5c';ctx.fillRect(mx-tw/2,plot.y1+2,tw,16);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font=FONT_SM+'px '+FF();ctx.fillText(xl,mx,plot.y1+13);}
    }
  }
  var lastMx=null, lastMy=null;
  function hover(e){
    var r=cv.getBoundingClientRect();lastMx=e.clientX-r.left;lastMy=e.clientY-r.top;
    draw(lastMx,lastMy);tip.style.display='none';
    draws.forEach(function(d){if(Math.abs(lastMy-yOf(d.yc))<6){tip.style.display='block';tip.style.background='#7f77dd';tip.textContent=JTF(81,[fmtP(d.yc)]);tip.style.left=Math.min(lastMx+12,W-90)+'px';tip.style.top=(yOf(d.yc)-28)+'px';}});
    risks.forEach(function(d){if(Math.abs(lastMy-yOf(d.yc))<6){tip.style.display='block';tip.style.background='#d4537e';tip.textContent=JTF(80,[fmtP(d.yc)]);tip.style.left=Math.min(lastMx+12,W-110)+'px';tip.style.top=(yOf(d.yc)-28)+'px';}});
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
    userView=true;viewS=s;viewE=en;lay();draw(lastMx,lastMy);
  },{passive:false});
  var drag=false, dx0=0, dvs=0;
  cv.addEventListener('mousedown',function(e){drag=true;dx0=e.clientX;dvs=viewS;});
  window.addEventListener('mouseup',function(){drag=false;},_wopt);
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
        userView=true;viewS=s;viewE=en;lay();draw(lastMx,lastMy);
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
    draws.forEach(function(d){if(Math.abs(lastMy-yOf(d.yc))<8){tip.style.display='block';tip.style.background='#7f77dd';tip.textContent=JTF(81,[fmtP(d.yc)]);tip.style.left=Math.min(lastMx+12,W-90)+'px';tip.style.top=(yOf(d.yc)-28)+'px';}});
    risks.forEach(function(d){if(Math.abs(lastMy-yOf(d.yc))<8){tip.style.display='block';tip.style.background='#d4537e';tip.textContent=JTF(80,[fmtP(d.yc)]);tip.style.left=Math.min(lastMx+12,W-110)+'px';tip.style.top=(yOf(d.yc)-28)+'px';}});
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
  document.getElementById('zin'+sfx).onclick=function(){userView=true;var sp=getSpan(),ns=Math.max(15,Math.round(sp*0.7)),md=Math.round((viewS+viewE)/2);viewS=Math.max(0,md-Math.round(ns/2));viewE=Math.min(TOTAL-1,viewS+ns-1);lay();draw();};
  document.getElementById('zout'+sfx).onclick=function(){userView=true;var sp=getSpan(),ns=Math.min(TOTAL,Math.round(sp*1.4)),md=Math.round((viewS+viewE)/2);viewS=Math.max(0,md-Math.round(ns/2));viewE=Math.min(TOTAL-1,viewS+ns-1);lay();draw();};
  document.getElementById('zall'+sfx).onclick=function(){userView=true;viewS=0;viewE=TOTAL-1;lay();draw();};
  initDrawCanvas(sfx);
  scope.querySelectorAll('.mtd').forEach(function(el){el.addEventListener('change',function(){draw(lastMx,lastMy);});});
  // 시나리오 버튼 이벤트 + 페이드 애니메이션
  var fadeTimer=null;
  function playScenario(scen){
    if(fadeTimer){clearInterval(fadeTimer);fadeTimer=null;}
    // 토글: 같은 버튼 다시 누르면 끔
    if(SCEN===scen){SCEN=null;scenFade=0;
      draw(lastMx,lastMy);return;}
    SCEN=scen;scenFade=0;
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
  // 시나리오는 버튼 없이 항상 표시(상승·하락 동시).
  // 뷰 조정은 기존 시나리오 버튼과 동일: 시작점 ~ 미래 끝까지 다 보이게.
  playScenario('both');
  if(IS_SCALP){
    // 3분 탭 자동 조회: 다시 그릴 때는 페이드 없이 바로, 사용자가 확대·이동한 화면 범위는 현재 봉 기준으로 유지
    var _iS=viewS,_iE=viewE,_kp=window.__scalpKeep;
    if(_kp){
      if(fadeTimer){clearInterval(fadeTimer);fadeTimer=null;} scenFade=1;
      if(_kp.changed){
        var _sp=Math.min(TOTAL,_kp.e-_kp.s+1), _s=_kp.s+(n-_kp.n);
        if(_s+_sp>TOTAL)_s=TOTAL-_sp; if(_s<0)_s=0;
        viewS=_s;viewE=_s+_sp-1;userView=!!_kp.user;
      }
    }
    window.__scalpGet=function(){ return {s:viewS,e:viewE,n:n,user:userView,changed:!!(_kp&&_kp.changed)||viewS!==_iS||viewE!==_iE}; };
  }
  try{lay();draw(null,null);}catch(err){console.error('draw error:',err);}
  window.addEventListener('resize',function(){lay();draw(null,null);},_wopt);
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
    if(ds.tool==='text'){var t=prompt(JT(242));if(t)ds.strokes.push({tool:'text',color:ds.color,x0:p.x,y0:p.y,text:t});ds.drawing=false;_redraw(sfx);}
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

