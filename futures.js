// ===== 선물·위클리옵션 화면 (futures.html) =====
// 첫 화면: 코스피200 선물 최근월물 1개 + 위클리옵션 전광판. 누르면 그 종목 차트(chart-core.js render 재사용).
// 조회 방식 — 수동 새로고침. 이용중이 아니면 서버가 가격을 숨긴 응답(preview)을 주고, 흐리게 + auth.js 카드.
var FO_CUR=null;   // 지금 열린 차트 종목코드

function foTk(){ return window.jcIdToken?window.jcIdToken():Promise.resolve(''); }
function foGet(q){
  return foTk().then(function(tk){
    return fetch('/api/fo?'+q,{headers:tk?{'Authorization':'Bearer '+tk}:{}}).then(function(r){return r.json();});
  });
}
function foNum(v){ return (v==null)?'***':Number(v).toFixed(2); }
function foEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

function foLoadBoard(){
  var el=document.getElementById('foBoard');
  el.style.position=''; el.innerHTML='<div class="loading"><div class="rtv-spin"><div class="rtv-core">RTV</div><div class="rtv-ring"></div></div></div>';
  return foGet('board=1').then(function(b){
    if(b.error){ el.innerHTML='<div class="empty data-notice">'+foEsc(b.error)+'</div>'; return; }
    var pv=!!b.preview;
    var h='<div class="fo-top"><button class="fo-rf" onclick="foRefresh()">새로고침</button></div>';
    var f=b.fut||{};
    var dn=(f.sign==='4'||f.sign==='5');
    h+='<div class="fo-fut" onclick="foOpen(\''+foEsc(f.code)+'\')"><span class="fo-nm">'+foEsc(f.name)+'</span>'+
       '<span class="fo-p" style="color:'+(f.change?(dn?'#378add':'#e24b4a'):'#5a6b7d')+'">'+foNum(f.price)+'</span></div>';
    function list(L){
      return L.map(function(r){
        return '<div class="fo-row" onclick="foOpen(\''+foEsc(r.code)+'\')"><span class="fo-nm">'+foEsc(r.name)+'</span><span class="fo-p">'+foNum(r.price)+'</span></div>';
      }).join('');
    }
    h+='<div class="fo-cols"><div class="fo-col">'+list(b.calls||[])+'</div><div class="fo-col">'+list(b.puts||[])+'</div></div>';
    if(pv){
      el.innerHTML='<div class="jc-pvblur">'+h+'</div><div class="jc-ov"></div>';
      el.style.position='relative';
      if(window.jcOverlay) window.jcOverlay(el.querySelector('.jc-ov'),'__BOARD__');
    } else el.innerHTML=h;
  }).catch(function(){ el.innerHTML='<div class="empty">분석 실패. 잠시 후 다시 시도하세요.</div>'; });
}

function foOpen(code){
  FO_CUR=code;
  var box=document.getElementById('result');
  box.style.position='';
  box.innerHTML='<div class="loading"><div class="rtv-spin"><div class="rtv-core">RTV</div><div class="rtv-ring"></div></div><div class="ltxt">차트를 정밀 분석하고 있어요</div></div>';
  box.scrollIntoView({behavior:'smooth',block:'start'});
  return foGet('code='+encodeURIComponent(code)).then(function(x){
    if(x.error){ box.innerHTML='<div class="empty data-notice">'+foEsc(x.error).replace(/\n/g,'<br>')+'</div>'; return; }
    PREVIEW=!!x.preview;
    render(x);
    if(PREVIEW) lockPreview(code);
  }).catch(function(){ box.innerHTML='<div class="empty">분석 실패. 잠시 후 다시 시도하세요.</div>'; });
}

// 수동 새로고침: 전광판 다시 조회 → 열린 차트가 있으면 그 차트도 다시 조회
function foRefresh(){
  foLoadBoard().then(function(){ if(FO_CUR) foOpen(FO_CUR); });
}

// auth.js: 로그인해서 이용중이 되면 window.go(code)로 다시 불러옴 / 카드 닫기는 window.goHome
window.go=function(c){ if(c==='__BOARD__') foLoadBoard(); else foLoadBoard().then(function(){ foOpen(c); }); };
window.goHome=function(){ FO_CUR=null; document.getElementById('result').innerHTML=''; window.scrollTo(0,0); };

foLoadBoard();
