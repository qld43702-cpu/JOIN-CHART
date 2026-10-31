// ===== JOIN-CHART 로그인·이용권한 (index·chart·admin 공유) =====
// data-mode: user(index) · embed(chart, 어드민 iframe) · admin(admin.html)
// 홈은 누구나 본다. 이용중이 아니면 차트(preview: 가격 ***·좌표 흔듦)를 흐리게 깔고 상태별 오버레이(jcOverlay).
// 휴대폰 인증(/api/auth_send → /api/auth_verify) → Firebase 커스텀 토큰 로그인 → /api/me 상태.
(function(){
var MODE=(document.currentScript&&document.currentScript.getAttribute('data-mode'))||'user';
var FB='https://www.gstatic.com/firebasejs/10.12.2/';
var CFG={apiKey:"AIzaSyA1r8bCwuAhIT2TrCYh2mZvXFjORxr_arc",authDomain:"chart-join.firebaseapp.com",projectId:"chart-join",storageBucket:"chart-join.firebasestorage.app",messagingSenderId:"435211355056",appId:"1:435211355056:web:e278693b08778ca23c4c75"};
var MSG={format:'010으로 시작하는 숫자만 입력해 주세요',too_fast:'잠시 후 다시 요청해 주세요',send_fail:'인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요',mismatch:'인증번호가 맞지 않습니다',expired:'인증번호가 만료되었습니다. 다시 받아주세요'};
var ACCOUNT='140-016-447637';

// ----- 카드 문구 (확정 문구 그대로) -----
var T='<div class="jc-t">JOIN CHART</div>';
function sub(s){ return '<div class="jc-s">'+s+'</div>'; }
var PRICE='<p>월 이용료 99,000원</p>';
var ACC='<p>입금계좌 신한은행 140-016-447637 (주)조인홀딩스</p><p>입금 후 070-8985-8221 또는 help@joinpeople.kr 로 입금자명과 휴대폰번호를 보내주세요.</p>';
var COPY='<button class="jc-btn jc-copy">계좌번호 복사</button>';
var FORM='<div class="jc-l">휴대폰번호를 입력해 주세요</div>'
  +'<input class="jc-in jc-phone" type="tel" inputmode="numeric" autocomplete="tel">'
  +'<button class="jc-btn jc-send">인증번호 받기</button>'
  +'<div class="jc-codebox" style="display:none">'
  +'<div class="jc-l" style="margin-top:14px">카카오톡으로 받은 인증번호 6자리를 입력해 주세요</div>'
  +'<input class="jc-in jc-code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code">'
  +'<div class="jc-links"><button class="jc-link jc-resend" disabled>다시 받기</button><button class="jc-link jc-change">번호 변경</button></div>'
  +'<button class="jc-btn jc-ok">확인</button></div>'
  +'<div class="jc-err"></div>';
var OUT='<button class="jc-out">로그아웃</button>';

function cardHtml(st){
  if(st==='none') return T+sub('회원 전용 서비스입니다')+'<div class="jc-price">월 이용료 99,000원</div>'+FORM
    +'<div class="jc-note">이미 회원이신가요? 같은 번호로 인증하면 바로 이용됩니다</div>';
  if(st==='pending') return isNew
    ? T+sub('가입이 완료되었습니다')+'<div class="jc-b"><p>입금 확인 후 이용하실 수 있습니다</p>'+PRICE+ACC+'</div>'+COPY+OUT
    : T+sub('입금 확인 후 이용하실 수 있습니다')+'<div class="jc-b">'+PRICE+ACC+'</div>'+COPY+OUT;
  if(st==='expired') return T+sub('이용 기간이 만료되었습니다')+'<div class="jc-b"><p>재입금 후 다시 이용하실 수 있습니다.</p>'+PRICE+ACC+'</div>'+COPY+OUT;
  if(st==='suspended') return T+sub('이용이 정지되었습니다')+'<div class="jc-b"><p>문의: 070-8985-8221 / help@joinpeople.kr</p></div>'+OUT;
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
 +'.jc-me{flex-shrink:0;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#cdddee;position:relative;z-index:1;white-space:nowrap}'
 +'.jc-hout{flex-shrink:0;height:30px;padding:0 10px;border:none;border-radius:8px;background:rgba(255,255,255,.15);color:#fff;font-size:12px;font-weight:700;cursor:pointer}'
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
  cur.el.innerHTML=h?'<div class="jc-card"><button class="jc-x" aria-label="닫기">×</button>'+h+'</div>':'';
  var x=cur.el.querySelector('.jc-x');
  if(x) x.onclick=function(){ cur=null; if(window.goHome) window.goHome(); };   // 오버레이 닫고 홈 첫 화면으로
  bind(cur.el);
}

function paintHeader(){
  if(MODE!=='user') return;
  var bar=document.querySelector('.appbar-in'); if(!bar) return;
  if(!hdr){ hdr=document.createElement('div'); hdr.className='jc-me'; bar.appendChild(hdr); }
  if(isActive()){
    var p=String(ME.phone||'');
    var mk='010-****-'+p.slice(-4);
    hdr.innerHTML='<span>'+(ME.role==='admin'?mk:mk+' · '+(ME.until||'')+'까지')+'</span><button class="jc-hout">로그아웃</button>';
    hdr.querySelector('.jc-hout').onclick=logout;
    hdr.style.display='';
  } else hdr.style.display='none';
}

function paintAdmin(){
  if(ME&&ME.role==='admin'){
    gate.innerHTML=''; document.body.classList.remove('jc-lock');
    if(!aout){
      aout=document.createElement('button'); aout.className='btn btn-o btn-sm'; aout.textContent='로그아웃'; aout.onclick=logout;
      var top=document.querySelector('.topbar'); if(top) top.appendChild(aout);
    }
    if(!adminInit){ adminInit=true; if(window.jcAdminReady) window.jcAdminReady(); }
    return;
  }
  document.body.classList.add('jc-lock');
  gate.innerHTML='<div class="jc-card">'+(ME?T+sub('접근 권한이 없습니다')+OUT:T+FORM)+'</div>';
  bind(gate);
}

// 카드 안 버튼 연결: 로그아웃 · 계좌번호 복사 · 휴대폰 인증
function bind(box){
  var o=box.querySelector('.jc-out'); if(o) o.onclick=logout;
  var cp=box.querySelector('.jc-copy');
  if(cp) cp.onclick=function(){
    copyText(ACCOUNT);
    cp.textContent='복사되었습니다';
    setTimeout(function(){ cp.textContent='계좌번호 복사'; },1500);
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
