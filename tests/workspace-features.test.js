const {test}=require('node:test'),assert=require('node:assert/strict');
const {browser}=require('./helpers');
test('viewer comment saves durably and is rendered safely in a hover popover',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval('ROLE="viewer";V="att";shell();cmtM([0,0])');d.querySelector('#cb').value='A viewer note <script>bad()</script>';
  await w.eval('postComment()');assert.equal(d.querySelector('#ov').classList.contains('on'),false);
  const saved=JSON.parse(w.localStorage.getItem('ams'));assert.equal(saved.attendance_comments.length,1);
  await w.eval('load()');w.eval('att()');d.querySelector('td.cm').dispatchEvent(new w.Event('pointerover',{bubbles:true}));
  assert.match(d.querySelector('#comment-popover').textContent,/<script>bad\(\)<\/script>/);
  assert.equal(d.querySelector('#comment-popover script'),null);
 }finally{await new Promise(resolve=>setTimeout(resolve,20));w.close()}
});
test('failed comment persistence keeps the draft and does not report success or update live comments',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval('ROLE="viewer";V="att";shell();cmtM([0,0])');d.querySelector('#cb').value='Keep my draft';
  w.Storage.prototype.setItem=()=>{throw Error('Storage full')};
  await assert.rejects(w.eval('postComment()'),/Storage full/);
  assert.equal(w.eval('CM.length'),0);assert.equal(w.eval('S.attendance_comments.length'),0);
  assert.equal(d.querySelector('#cb').value,'Keep my draft');assert.equal(d.querySelector('[data-act=cadd]').disabled,false);
 }finally{await new Promise(resolve=>setTimeout(resolve,20));w.close()}
});
test('paid and unpaid leave keep distinct saved statuses and visible labels',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval('V="att";shell()');assert.match(d.querySelector('[data-t=LEAVE]').textContent,/with pay/);assert.match(d.querySelector('[data-t="LEAVE-U"]').textContent,/without pay/);
  await w.eval('apply([[0,0]],"LEAVE")');assert.equal(w.eval('A[E[0].id+"|"+days()[0]].type'),'LEAVE');
  await w.eval('apply([[0,1]],"LEAVE-U")');assert.equal(w.eval('A[E[0].id+"|"+days()[1]].type'),'LEAVE-U');
  assert.match(d.querySelector('td[data-r="0"][data-c="0"]').getAttribute('aria-label'),/with pay/);
 }finally{await new Promise(resolve=>setTimeout(resolve,20));w.close()}
});
test('demo audit scopes include selected categories only and retain settings changes',async()=>{
 const dom=await browser(),w=dom.window;
 try{
  await w.eval('API.up("audit_settings",[{id:1,enabled:true,scopes:["employees"]}])');
  const before=w.eval('S.audit_log.length');
  await w.eval('saveAttendance([changeFor(E[0].id,days()[0],{type:"ABSENT"})])');assert.equal(w.eval('S.audit_log.length'),before);
  await w.eval('API.up("employees",[{...E[0],contact:"Changed"}])');assert.equal(w.eval('S.audit_log.at(-1).action'),'employees.update');
  await w.eval('API.up("audit_settings",[{id:1,enabled:false,scopes:[]}])');assert.equal(w.eval('S.audit_log.at(-1).action'),'audit_settings.update');
  const disabled=w.eval('S.audit_log.length');await w.eval('load()');await w.eval('API.up("employees",[{...E[0],contact:"Again"}])');assert.equal(w.eval('S.audit_log.length'),disabled);
  w.eval('ROLE="staff"');await assert.rejects(w.eval('auditList()'),/Superadmin only/);
 }finally{await new Promise(resolve=>setTimeout(resolve,20));w.close()}
});
