// ===== JOIN-CHART 로그인·이용권한 (index·chart·admin 공유) =====
// data-mode: user(index) · embed(chart, 어드민 iframe) · admin(admin.html)
// 휴대폰 인증(/api/auth_send → /api/auth_verify) → Firebase 커스텀 토큰 로그인 → /api/me 상태로 화면 결정.
(function(){
var MODE=(document.currentScript&&document.currentScript.getAttribute('data-mode'))||'user';
var FB='https://www.gstatic.com/firebasejs/10.12.2/';
var CFG={apiKey:"AIzaSyA1r8bCwuAhIT2TrCYh2mZvXFjORxr_arc",authDomain:"chart-join.firebaseapp.com",projectId:"chart-join",storageBucket:"chart-join.firebasestorage.app",messagingSenderId:"435211355056",appId:"1:435211355056:web:e278693b08778ca23c4c75"};
var PAY='<p>월 이용료 99,000원</p><p>입금계좌 신한은행 140-016-447637 (주)조인홀딩스</p><p>입금 후 070-8985-8221 또는 help@joinpeople.kr 로 입금자명과 휴대폰번호를 보내주세요.</p>';
var MSG={format:'010으로 시작하는 숫자만 입력해 주세요',too_fast:'잠시 후 다시 요청해 주세요',send_fail:'인증번호 발송에 실패했습니다. 잠시 후 다시 시도해 주세요',mismatch:'인증번호가 맞지 않습니다',expired:'인증번호가 만료되었습니다. 다시 받아주세요'};

var css=document.createElement('style');
css.textContent='body.jc-lock .wrap,body.jc-lock .admin-wrap,body.jc-lock .hd-search{display:none!important}'
 +'.jc-gate{max-width:420px;margin:40px auto;padding:0 16px}.jc-gate:empty{display:none}'
 +'.jc-card{background:#fff;border-radius:16px;border:1px solid #edf1f5;box-shadow:0 1px 4px rgba(27,58,92,.05);padding:28px 22px;text-align:center;color:#23344a}'
 +'.jc-t{font-size:20px;font-weight:800;color:#1b3a5c;margin-bottom:6px}'
 +'.jc-s{font-size:14px;font-weight:700;line-height:1.5;margin-bottom:16px}'
 +'.jc-b{font-size:13px;color:#5a6675;line-height:1.7;text-align:left;background:#f7f9fb;border-radius:10px;padding:14px 16px}.jc-b p{margin:0 0 4px}'
 +'.jc-l{font-size:14px;font-weight:700;text-align:left;margin:4px 0 8px}'
 +'.jc-in{width:100%;height:46px;border:2px solid #dde3ea;border-radius:12px;padding:0 14px;font-size:16px;font-weight:600;outline:none}.jc-in:focus{border-color:#1b3a5c}'
 +'.jc-btn{width:100%;height:46px;margin-top:10px;border:none;border-radius:12px;background:#1b3a5c;color:#fff;font-size:15px;font-weight:800;cursor:pointer}.jc-btn:disabled{opacity:.6}'
 +'.jc-err{min-height:18px;font-size:13px;font-weight:600;color:#dd5b54;margin-top:8px;text-align:left}'
 +'.jc-out{margin-top:16px;background:none;border:none;color:#8a97a6;font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline}'
 +'.jc-hout{flex-shrink:0;height:34px;padding:0 12px;border:none;border-radius:9px;background:rgba(255,255,255,.15);color:#fff;font-size:13px;font-weight:700;cursor:pointer;position:relative;z-index:1}'
 +'.jc-foot{max-width:960px;margin:24px auto 0;padding:16px;font-size:11px;color:#a8b3c0;line-height:1.7;text-align:center;word-break:keep-all}';
document.head.appendChild(css);

// 화면 잠금 + 안내 영역 (상단바 바로 아래, 없으면 body 맨 앞)
document.body.classList.add('jc-lock');
var gate=document.createElement('div'); gate.className='jc-gate'; gate.id='jcGate';
var bar=document.querySelector('.appbar');
if(bar) bar.parentNode.insertBefore(gate,bar.nextSibling); else document.body.insertBefore(gate,document.body.firstChild);

var auth=null, fa=null, isNew=false, hout=null;
var ready=(async function(){
  var app=await import(FB+'firebase-app.js'); fa=await import(FB+'firebase-auth.js');
  auth=fa.getAuth(app.initializeApp(CFG));
  await new Promise(function(res){ var off=fa.onAuthStateChanged(auth,function(){ off(); res(); }); });
  fa.onAuthStateChanged(auth,function(){ check(); });
})();

async function idToken(){ await ready; return auth.currentUser?auth.currentUser.getIdToken():''; }
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
window.jcRecheck=function(){ check(); };

function lock(){ document.body.classList.add('jc-lock'); if(hout) hout.style.display='none'; }
function unlock(){
  gate.innerHTML=''; document.body.classList.remove('jc-lock');
  if(MODE==='embed') return;
  if(!hout){
    hout=document.createElement('button'); hout.textContent='로그아웃'; hout.onclick=logout;
    var top=MODE==='admin'?document.querySelector('.topbar'):document.querySelector('.appbar-in');
    if(MODE==='admin'){ hout.className='btn btn-o btn-sm'; } else { hout.className='jc-hout'; }
    if(top) top.appendChild(hout);
  }
  hout.style.display='';
}
function card(title,sub,body){
  gate.innerHTML='<div class="jc-card">'+(title?'<div class="jc-t">'+title+'</div>':'')+(sub?'<div class="jc-s">'+sub+'</div>':'')
    +(body?'<div class="jc-b">'+body+'</div>':'')+'<button class="jc-out" id="jcOut">로그아웃</button></div>';
  document.getElementById('jcOut').onclick=logout;
}

async function check(){
  if(!auth.currentUser){ lock(); showLogin(); return; }
  var me; try{ me=await api('/api/me'); }catch(e){ lock(); gate.innerHTML=''; return; }
  if(me.status==='login'){ fa.signOut(auth); return; }
  if(MODE==='admin'){
    if(me.role==='admin'){ unlock(); if(window.jcAdminReady) window.jcAdminReady(); }
    else { lock(); card('','접근 권한이 없습니다',''); }
    return;
  }
  if(me.status==='active'){ unlock(); return; }
  lock();
  if(me.status==='suspended') card('JOIN CHART','이용이 정지되었습니다','<p>문의: 070-8985-8221 / help@joinpeople.kr</p>');
  else if(me.status==='expired') card('JOIN CHART','이용 기간이 만료되었습니다','<p>재입금 후 다시 이용하실 수 있습니다.</p>'+PAY);
  else card('JOIN CHART',isNew?'가입이 완료되었습니다. 입금 확인 후 이용하실 수 있습니다':'입금 확인 후 이용하실 수 있습니다',PAY);
}

function showLogin(){
  gate.innerHTML='<div class="jc-card">'
    +'<div class="jc-l">휴대폰번호를 입력해 주세요</div>'
    +'<input class="jc-in" id="jcPhone" type="tel" inputmode="numeric" autocomplete="tel">'
    +'<button class="jc-btn" id="jcSend">인증번호 받기</button>'
    +'<div id="jcCodeBox" style="display:none">'
    +'<div class="jc-l" style="margin-top:18px">카카오톡으로 받은 인증번호 6자리를 입력해 주세요</div>'
    +'<input class="jc-in" id="jcCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code">'
    +'<button class="jc-btn" id="jcOk">확인</button></div>'
    +'<div class="jc-err" id="jcErr"></div></div>';
  var ph=document.getElementById('jcPhone'), cd=document.getElementById('jcCode');
  var bSend=document.getElementById('jcSend'), bOk=document.getElementById('jcOk');
  var err=function(m){ document.getElementById('jcErr').textContent=m||''; };
  var sentPhone='';
  bSend.onclick=async function(){
    var v=ph.value.trim();
    if(!/^010\d{8}$/.test(v)){ err(MSG.format); return; }
    bSend.disabled=true; err('');
    try{
      var r=await post('/api/auth_send',{phone:v});
      if(r.ok){ sentPhone=v; document.getElementById('jcCodeBox').style.display='block'; cd.value=''; cd.focus(); }
      else err(MSG[r.error]||'');
    }catch(e){ err(MSG.send_fail); }
    bSend.disabled=false;
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
})();
