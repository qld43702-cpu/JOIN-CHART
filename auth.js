// ===== JOIN-CHART 로그인·이용권한 (index·chart·admin 공유) =====
// data-mode: user(index) · embed(chart, 어드민 iframe) · admin(admin.html)
// 홈은 누구나 본다. 이용중이 아니면 차트(preview: 가격 ***·좌표 흔듦)를 흐리게 깔고 상태별 오버레이(jcOverlay).
// 휴대폰 인증(/api/auth_send → /api/auth_verify) → Firebase 커스텀 토큰 로그인 → /api/me 상태.
(function(){
var MODE=(document.currentScript&&document.currentScript.getAttribute('data-mode'))||'user';
var FB='https://www.gstatic.com/firebasejs/10.12.2/';
var CFG={apiKey:"AIzaSyA1r8bCwuAhIT2TrCYh2mZvXFjORxr_arc",authDomain:"chart-join.firebaseapp.com",projectId:"chart-join",storageBucket:"chart-join.firebasestorage.app",messagingSenderId:"435211355056",appId:"1:435211355056:web:e278693b08778ca23c4c75"};
var MSG={format:JT(19),too_fast:JT(20),send_fail:JT(21),mismatch:JT(22),expired:JT(23)};
var ACCOUNT='140-016-447637';

// ----- 카드 문구 (확정 문구 그대로) -----
var T='<div class="jc-t">JOIN CHART</div>';
function sub(s){ return '<div class="jc-s">'+s+'</div>'; }
var PRICE='<p>'+JT(37)+'</p>';
var ACC='<p>'+JT(38)+'</p><p>'+JT(39)+'</p>';
var COPY='<button class="jc-btn jc-copy">'+JT(40)+'</button>';
var FORM='<div class="jc-l">'+JT(24)+'</div>'
  +'<input class="jc-in jc-phone" type="tel" inputmode="numeric" autocomplete="tel">'
  +'<button class="jc-btn jc-send">'+JT(25)+'</button>'
  +'<div class="jc-codebox" style="display:none">'
  +'<div class="jc-l" style="margin-top:14px">'+JT(26)+'</div>'
  +'<input class="jc-in jc-code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code">'
  +'<div class="jc-links"><button class="jc-link jc-resend" disabled>'+JT(27)+'</button><button class="jc-link jc-change">'+JT(28)+'</button></div>'
  +'<button class="jc-btn jc-ok">'+JT('77a')+'</button></div>'
  +'<div class="jc-err"></div>';
var OUT='<button class="jc-out">'+JT(29)+'</button>';

function cardHtml(st){
  if(st==='none') return T+sub(JT(41))+'<div class="jc-price">'+JT(37)+'</div>'+FORM
    +'<div class="jc-note">'+JT(42)+'</div>';
  if(st==='pending') return isNew
    ? T+sub(JT(43))+'<div class="jc-b"><p>'+JT(44)+'</p>'+PRICE+ACC+'</div>'+COPY+OUT
    : T+sub(JT(44))+'<div class="jc-b">'+PRICE+ACC+'</div>'+COPY+OUT;
  if(st==='expired') return T+sub(JT(45))+'<div class="jc-b"><p>'+JT(46)+'</p>'+PRICE+ACC+'</div>'+COPY+OUT;
  if(st==='suspended') return T+sub(JT(47))+'<div class="jc-b"><p>'+JT(48)+'</p></div>'+OUT;
  return '';
}

var css=document.createElement('style');
css.textContent='body.jc-lock .admin-wrap{display:none!important}'
 +'.jc-gate{max-width:420px;margin:40px auto;padding:0 16px}.jc-gate:empty{display:none}'
 +'.jc-pvblur{filter:blur(6px);pointer-events:none;user-select:none}'
 +'.jc-ov{position:absolute;inset:0;display:flex;padding:12px;overflow-y:auto;background:rgba(238,241,245,.35);z-index:20}'
 +'.jc-card{margin:auto;width:100%;max-width:360px;background:rgba(255,255,255,.95);border-radius:16px;border:1px solid #edf1f5;box-shadow:0 6px 24px rgba(27,58,92,.12);padding:20px 18px;text-align:center;color:#23344a}'
 +'.jc-t{font-size:19px;font-weight:800;color:#1b3a5c;margin-bottom:4px}'
 +'.jc-s{font-size:14px;font-weight:700;line-height:1.5;margin-bottom:12px}'
 +'.jc-price{font-size:13px;font-weight:800;color:#ed7d31;margin-bottom:14px}'
 +'.jc-b{font-size:13px;color:#5a6675;line-height:1.65;text-align:left;background:#f7f9fb;border-radius:10px;padding:12px 14px}.jc-b p{margin:0 0 4px}'
 +'.jc-l{font-size:13px;font-weight:700;text-align:left;margin:2px 0 7px}'
 +'.jc-in{width:100%;height:44px;border:2px solid #dde3ea;border-radius:12px;padding:0 14px;font-size:16px;font-weight:600;outline:none}.jc-in:focus{border-color:#1b3a5c}'
 +'.jc-btn{width:100%;height:44px;margin-top:10px;border:none;border-radius:12px;background:#1b3a5c;color:#fff;font-size:15px;font-weight:800;cursor:pointer}.jc-btn:disabled{opacity:.6}'
 +'.jc-err{min-height:16px;font-size:13px;font-weight:600;color:#dd5b54;margin-top:8px;text-align:left}'
 +'.jc-note{font-size:11.5px;color:#8a97a6;margin-top:10px;line-height:1.5}'
 +'.jc-in[readonly]{background:#f3f5f8;color:#6e7c8a}'
 +'.jc-links{display:flex;justify-content:center;gap:14px;margin-top:8px}'
 +'.jc-link{background:none;border:none;color:#1b3a5c;font-size:12px;font-weight:700;cursor:pointer;text-decoration:underline}.jc-link:disabled{color:#b8c2cc;cursor:default}'
 +'.jc-card{position:relative}.jc-x{position:absolute;top:8px;right:10px;width:28px;height:28px;border:none;background:none;color:#8a97a6;font-size:22px;line-height:1;cursor:pointer}'
 +'.jc-out{display:block;margin:12px auto 0;background:none;border:none;color:#8a97a6;font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline}'
 +'.jc-me{flex-shrink:0;position:relative;z-index:40}'
 +'.jc-mebtn{width:34px;height:34px;padding:0;border:none;border-radius:9px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;cursor:pointer}.jc-mebtn svg{width:18px;height:18px}'
 +'.jc-menu{display:none;position:absolute;right:0;top:40px;min-width:170px;background:#1b3a5c;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.25);padding:10px 0;color:#fff;white-space:nowrap}.jc-me.open .jc-menu{display:block}'
 +'.jc-m1{padding:4px 16px;font-size:13px;font-weight:800}'
 +'.jc-m2{padding:2px 16px 8px;font-size:12px;font-weight:600;color:#a8bdd6;border-bottom:1px solid rgba(255,255,255,.1)}'
 +'.jc-hout{display:block;width:100%;padding:9px 16px 4px;border:none;background:none;color:#fff;font-size:13px;font-weight:700;text-align:left;cursor:pointer}'
 +'.jc-foot{max-width:960px;margin:24px auto 0;padding:16px;font-size:11px;color:#a8b3c0;line-height:1.7;text-align:center;word-break:keep-all}';
document.head.appendChild(css);

// 어드민: role=admin 확인 전까지 화면 잠금 + 로그인 카드 영역
var gate=null;
if(MODE==='admin'){
  document.body.classList.add('jc-lock');
  gate=document.createElement('div'); gate.className='jc-gate';
  document.body.insertBefore(gate,document.body.firstChild);
}

var auth=null, fa=null, isNew=false, ME=null, cur=null, hdr=null, aout=null, adminInit=false;
var authRes, readyRes;
var authReady=new Promise(function(r){authRes=r;});   // Firebase 첫 로그인 상태 확정
var ready=new Promise(function(r){readyRes=r;});      // + 첫 /api/me 완료
(async function(){
  var app=await import(FB+'firebase-app.js'); fa=await import(FB+'firebase-auth.js');
  auth=fa.getAuth(app.initializeApp(CFG));
  var first=true;
  fa.onAuthStateChanged(auth,async function(){
    authRes();
    await refresh(!first); first=false; readyRes();
  });
})();

async function idToken(){ await authReady; return auth.currentUser?auth.currentUser.getIdToken():''; }
async function api(path,opt){
  opt=opt||{}; var tk=await idToken();
  opt.headers=Object.assign({'Content-Type':'application/json'},opt.headers||{});
  if(tk) opt.headers['Authorization']='Bearer '+tk;
  return fetch(path,opt).then(function(r){return r.json();});
}
function post(path,body){ return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json();}); }
function logout(){ fa.signOut(auth).then(function(){ location.reload(); }); }
window.jcIdToken=idToken;
window.jcApi=api;
// chart-core: /api/analyze가 미리보기(preview)를 주면 흐린 차트 위 오버레이 칸(el)을 넘겨줌
window.jcOverlay=function(el,code){ cur={el:el,code:code}; ready.then(function(){ paintOverlay(false); }); };

async function refresh(changed){
  ME=null;
  if(auth.currentUser){
    try{ ME=await api('/api/me'); }catch(e){ ME={status:'error'}; }
    if(ME.status==='login'){ ME=null; fa.signOut(auth); return; }
  }
  paintHeader();
  if(MODE==='admin') paintAdmin();
  else paintOverlay(changed);
}

function isActive(){ return !!ME&&(ME.role==='admin'||ME.status==='active'); }   // 관리자는 항상 통과

function paintOverlay(changed){
  if(!cur||!document.body.contains(cur.el)){ cur=null; return; }
  var st=isActive()?'active':(ME?ME.status:'none');
  if(st==='active'){
    // 방금 로그인해서 이용중이 됐으면 그 종목을 다시 불러와 실제 차트 표시
    if(changed&&window.go){ var c=cur.code; cur=null; window.go(c); }
    else cur.el.innerHTML='';
    return;
  }
  var h=cardHtml(st);
  cur.el.innerHTML=h?'<div class="jc-card"><button class="jc-x" aria-label="'+JT(49)+'">×</button>'+h+'</div>':'';
  var x=cur.el.querySelector('.jc-x');
  if(x) x.onclick=function(){ cur=null; if(window.goHome) window.goHome(); };   // 오버레이 닫고 홈 첫 화면으로
  bind(cur.el);
}

function paintHeader(){
  if(MODE!=='user') return;
  var bar=document.querySelector('.appbar-in'); if(!bar) return;
  if(!hdr){
    hdr=document.createElement('div'); hdr.className='jc-me'; bar.appendChild(hdr);
    document.addEventListener('click',function(e){ if(!hdr.contains(e.target)) hdr.classList.remove('open'); });   // 바깥 클릭 → 닫힘
  }
  // 로그인 상태면 사람 아이콘 + 드롭다운(번호 / 상태 / 로그아웃). 비로그인이면 없음.
  if(!ME||ME.status==='error'){ hdr.style.display='none'; return; }
  var p=String(ME.phone||''), line2;
  if(ME.role==='admin') line2=JT(30);
  else if(ME.status==='active') line2=JTF(31,[(ME.until||'')]);
  else line2={pending:JT(32),expired:JT(33),suspended:JT(34)}[ME.status]||'';
  hdr.innerHTML='<button class="jc-mebtn" aria-label="'+JT(35)+'"><svg viewBox="0 0 24 24" fill="none" stroke="#f4a06a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg></button>'
    +'<div class="jc-menu"><div class="jc-m1">010-****-'+p.slice(-4)+'</div><div class="jc-m2">'+line2+'</div><button class="jc-hout">'+JT(29)+'</button></div>';
  hdr.querySelector('.jc-mebtn').onclick=function(){ hdr.classList.toggle('open'); };
  hdr.querySelector('.jc-hout').onclick=logout;
  hdr.classList.remove('open');
  hdr.style.display='';
}

function paintAdmin(){
  if(ME&&ME.role==='admin'){
    gate.innerHTML=''; document.body.classList.remove('jc-lock');
    if(!aout){
      aout=document.createElement('button'); aout.className='btn btn-o btn-sm'; aout.textContent=JT(29); aout.onclick=logout;
      var top=document.querySelector('.topbar'); if(top) top.appendChild(aout);
    }
    if(!adminInit){ adminInit=true; if(window.jcAdminReady) window.jcAdminReady(); }
    return;
  }
  document.body.classList.add('jc-lock');
  gate.innerHTML='<div class="jc-card">'+(ME?T+sub(JT(36))+OUT:T+FORM)+'</div>';
  bind(gate);
}

// 카드 안 버튼 연결: 로그아웃 · 계좌번호 복사 · 휴대폰 인증
function bind(box){
  var o=box.querySelector('.jc-out'); if(o) o.onclick=logout;
  var cp=box.querySelector('.jc-copy');
  if(cp) cp.onclick=function(){
    copyText(ACCOUNT);
    cp.textContent=JT(50);
    setTimeout(function(){ cp.textContent=JT(40); },1500);
  };
  var bSend=box.querySelector('.jc-send'); if(!bSend) return;
  var ph=box.querySelector('.jc-phone'), cd=box.querySelector('.jc-code'), bOk=box.querySelector('.jc-ok');
  var cbox=box.querySelector('.jc-codebox'), bRe=box.querySelector('.jc-resend'), bChg=box.querySelector('.jc-change');
  var err=function(m){ box.querySelector('.jc-err').textContent=m||''; };
  var sentPhone='', cool=null;
  function cooldown(){ bRe.disabled=true; clearTimeout(cool); cool=setTimeout(function(){ bRe.disabled=false; },60000); }   // 다시 받기: 60초 뒤 활성
  async function send(v){
    try{
      var r=await post('/api/auth_send',{phone:v});
      if(r.ok) return true;
      err(MSG[r.error]||'');
    }catch(e){ err(MSG.send_fail); }
    return false;
  }
  bSend.onclick=async function(){
    var v=ph.value.trim();
    if(!/^010\d{8}$/.test(v)){ err(MSG.format); return; }
    bSend.disabled=true; err('');
    if(await send(v)){
      // 인증번호 단계: 받기 버튼 숨김, 번호 수정 불가
      sentPhone=v; ph.readOnly=true; bSend.style.display='none';
      cbox.style.display='block'; cd.value=''; cd.focus(); cooldown();
    }
    bSend.disabled=false;
  };
  bRe.onclick=async function(){
    bRe.disabled=true; err('');
    if(await send(sentPhone)) cooldown(); else bRe.disabled=false;
  };
  bChg.onclick=function(){
    // 번호 입력 단계로 복귀
    clearTimeout(cool); sentPhone=''; ph.readOnly=false; bSend.style.display='';
    cbox.style.display='none'; cd.value=''; err(''); ph.focus();
  };
  bOk.onclick=async function(){
    bOk.disabled=true; err('');
    try{
      var r=await post('/api/auth_verify',{phone:sentPhone,code:cd.value.trim()});
      if(r.token){ isNew=!!r.isNew; await fa.signInWithCustomToken(auth,r.token); return; }
      err(MSG[r.error]||'');
    }catch(e){}
    bOk.disabled=false;
  };
  ph.addEventListener('keydown',function(e){ if(e.key==='Enter') bSend.click(); });
  cd.addEventListener('keydown',function(e){ if(e.key==='Enter') bOk.click(); });
}
function copyText(s){
  if(navigator.clipboard&&window.isSecureContext){ navigator.clipboard.writeText(s).catch(function(){}); return; }
  var t=document.createElement('textarea'); t.value=s; t.style.position='fixed'; t.style.opacity='0';
  document.body.appendChild(t); t.select(); try{ document.execCommand('copy'); }catch(e){} t.remove();
}
})();
