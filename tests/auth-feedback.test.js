const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {browser}=require('./helpers');
let dom;
afterEach(()=>dom?.window.close());
async function loginClient(overrides={}){
 const calls={signin:0,signup:0,signout:[]};
 const client={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({}),signOut:async options=>{calls.signout.push(options);return{}},signInWithPassword:async()=>{calls.signin++;return{error:{message:'Invalid login credentials',code:'invalid_credentials',status:400}}},signUp:async()=>{calls.signup++;return{}},...overrides},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'viewer',active:false}})})})})};
 dom=await browser({supabaseClient:client});
 return{w:dom.window,client,calls};
}
test('invalid email and blank password show popup errors without sending requests',async()=>{
 const {w,calls}=await loginClient();
 w.document.getElementById('le').value='not-an-email';w.document.getElementById('lp').value='secret';
 await w.eval('act("in")');assert.match(w.document.getElementById('toast').textContent,/valid email/);
 w.document.getElementById('le').value='person@example.com';w.document.getElementById('lp').value='';
 await w.eval('act("in")');assert.match(w.document.getElementById('toast').textContent,/Enter your password/);assert.equal(calls.signin,0);
});
test('incorrect credentials preserve the real error and code and restore controls',async()=>{
 const {w,calls}=await loginClient();w.document.getElementById('le').value='person@example.com';w.document.getElementById('lp').value='incorrect';
 await w.eval('act("in",null,document.querySelector(\'[data-act="in"]\'))');
 const feedback=w.document.getElementById('toast');assert.match(feedback.textContent,/Invalid login credentials \[invalid_credentials\]/);assert.equal(feedback.getAttribute('role'),'alert');
 assert.equal(calls.signin,1);assert.ok([...w.document.querySelectorAll('.login input,.login button')].every(b=>!b.disabled));assert.equal(w.document.getElementById('async-status').hidden,true);
});
test('login shows loading, trims email, preserves password, and blocks double click and Enter',async()=>{
 let complete,submitted;
 const {w}=await loginClient({signInWithPassword:credentials=>{submitted=credentials;return new Promise(resolve=>{complete=resolve})}});
 w.document.getElementById('le').value='  person@example.com  ';w.document.getElementById('lp').value=' password ';
 const button=w.document.querySelector('[data-act="in"]');button.click();button.click();w.document.getElementById('lp').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 assert.equal(submitted.email,'person@example.com');assert.equal(submitted.password,' password ');assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-busy'),'true');assert.equal(w.document.getElementById('async-status').hidden,false);
 complete({error:{message:'Invalid login credentials',code:'invalid_credentials'}});await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(button.disabled,false);assert.equal(w.document.getElementById('async-status').hidden,true);
});
test('signup validates new passwords and displays the actual 422 error safely',async()=>{
 const {w,calls}=await loginClient({signUp:async()=>{calls.signup++;return{error:{message:'Password requires a symbol <script>alert(1)</script>',code:'weak_password',status:422}}}});
 w.document.getElementById('le').value='person@example.com';w.document.getElementById('lp').value='123';await w.eval('act("up")');assert.equal(calls.signup,0);
 w.document.getElementById('lp').value='sixletters';await w.eval('act("up")');assert.equal(calls.signup,1);assert.match(w.document.getElementById('toast').textContent,/Password requires a symbol.*weak_password/);assert.equal(w.document.querySelector('#toast script'),null);
});
test('signup success remains visible and explains confirmation and approval',async()=>{
 const {w}=await loginClient();w.document.getElementById('le').value='person@example.com';w.document.getElementById('lp').value='password';await w.eval('act("up")');
 assert.match(w.document.getElementById('toast').textContent,/Check your email.*administrator approval/);assert.equal(w.document.getElementById('toast').getAttribute('role'),'status');
});
test('expired refresh session clears only local auth and retains the exact startup error',async()=>{
 const {w,calls}=await loginClient({getSession:async()=>({data:{session:null},error:{message:'Invalid Refresh Token: Refresh Token Not Found',code:'refresh_token_not_found'}})});
 assert.equal(calls.signout.length,1);assert.equal(calls.signout[0].scope,'local');assert.match(w.document.getElementById('toast').textContent,/Refresh Token Not Found \[refresh_token_not_found\]/);assert.equal(w.document.getElementById('async-status').hidden,true);
});
test('overlapping loading states remain visible until both settle and errors can be dismissed',async()=>{
 const {w}=await loginClient();
 const done1=w.AMSUI.beginBusy(),done2=w.AMSUI.beginBusy();done1();done1();assert.equal(w.document.getElementById('async-status').hidden,false);done2();assert.equal(w.document.getElementById('async-status').hidden,true);
 await w.eval('guard(()=>{throw {message:"Schedule changed; reload before saving",code:"P0001"}})');
 assert.match(w.document.getElementById('toast').textContent,/Schedule changed; reload before saving \[P0001\]/);w.document.querySelector('#toast button').click();assert.equal(w.document.getElementById('toast').style.display,'none');
});
test('missing API key error keeps the real message and supplies configuration guidance',async()=>{
 const {w}=await loginClient();const message=w.AMSAuth.errorMessage({message:'No API key found in request'});assert.match(message,/^No API key found in request/);assert.match(message,/request headers/);
});
test('popup errors mark fields, preserve existing descriptions, and clear on editing',async()=>{
 const {w}=await loginClient(),email=w.document.getElementById('le'),password=w.document.getElementById('lp');
 email.setAttribute('aria-describedby','existing-help');email.value='person@example.com';password.value='incorrect';await w.eval('act("in")');
 const popup=w.document.getElementById('toast');assert.equal(popup.parentElement,w.document.body);assert.equal(w.document.querySelector('.login #toast'),null);assert.equal(w.document.getElementById('auth-feedback'),null);
 for(const field of [email,password]){assert.equal(field.getAttribute('aria-invalid'),'true');assert.equal(field.classList.contains('field-error'),true)}
 assert.equal(email.getAttribute('aria-describedby'),'existing-help notification-message');popup.querySelector('button').click();assert.equal(popup.style.display,'none');assert.equal(email.getAttribute('aria-invalid'),'true');
 email.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(email.getAttribute('aria-invalid'),null);assert.equal(email.getAttribute('aria-describedby'),'existing-help');assert.equal(email.classList.contains('field-error'),false);
 w.AMSUI.notify('Saved');assert.equal(password.getAttribute('aria-invalid'),null);assert.equal(popup.classList.contains('error'),false);assert.equal(popup.getAttribute('role'),'status');
});
test('known employee and schedule errors identify fields; unknown errors do not blame inputs',async()=>{
 const {w}=await loginClient();assert.equal(w.AMSAuth.errorFields({message:'Contact number must contain 11 digits and start with 09'}).join(','),'f_contact,sc');
 assert.equal(w.AMSAuth.errorFields({message:'Enter a schedule or assignment reason with at least 3 characters'}).join(','),'schedule-reason,assignment-reason');
 assert.equal(w.AMSAuth.errorFields({code:'weak_password'}).join(','),'lp');assert.equal(w.AMSAuth.errorFields({code:'unexpected_failure',message:'Database unavailable'}).length,0);
});
test('invalid assignment reason and contact are rejected before production RPC calls',async()=>{
 const {w,client}=await loginClient();let requests=0;client.rpc=async()=>{requests++;return{}};
 await assert.rejects(w.eval('saveAssignment("employee","2026-10-16",{},[],"")'),/reason/);
 await assert.rejects(w.eval('saveEmployees([{employee:{id:"employee",contact:"123"},expected_revision:null}])'),/11 digits/);assert.equal(requests,0);
});
