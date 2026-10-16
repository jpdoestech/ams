const {test}=require('node:test');
const assert=require('node:assert/strict');
const {browser}=require('./helpers');
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));

test('employee row opens information; Schedule round-trip preserves unsaved employee fields',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval('V="emp";shell()');
  const row=d.querySelector('[data-employee-row]');row.querySelector('td').click();await tick();
  assert.equal(d.querySelector('#ov').classList.contains('on'),true);
  const input=d.querySelector('#f_first_name');input.value='Unsaved name';
  d.querySelector('[data-act=eformschedule]').click();await tick();assert.ok(d.querySelector('#sch'));
  d.querySelector('#ov [data-act=cm]').click();await tick();
  assert.equal(d.querySelector('#f_first_name'),input);assert.equal(input.value,'Unsaved name');
  d.querySelector('#ov [data-act=cm]').click();await tick();
  assert.equal(d.querySelector('#ov').classList.contains('on'),false);
  assert.notEqual(w.eval('E[0].first_name'),'Unsaved name');
 }finally{dom.window.close()}
});

test('three-dot actions are separate from row opening and expose only permitted actions',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval('V="emp";shell()');const trigger=d.querySelector('[data-employee-actions]');trigger.click();await tick();
  assert.equal(d.querySelector('#employee-menu').hidden,false);
  assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.deepEqual([...d.querySelectorAll('#employee-menu button')].map(el=>el.dataset.act),['esch','eedit','edel']);
  assert.equal(d.querySelector('#ov').classList.contains('on'),false);
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(d.querySelector('#employee-menu').hidden,true);assert.equal(d.activeElement,trigger);
  w.eval('ROLE="viewer";shell()');d.querySelector('[data-employee-actions]').click();await tick();
  assert.deepEqual([...d.querySelectorAll('#employee-menu button')].map(el=>el.dataset.act),['esch']);
  d.querySelector('#employee-menu [data-act=esch]').click();await tick();assert.ok(d.querySelector('#sch'));
  assert.equal(d.querySelector('[data-act=ssave]'),null);
 }finally{dom.window.close()}
});

test('viewer can open employee information by keyboard without editing fields or seeing pay',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval('ROLE="viewer";V="emp";shell()');const row=d.querySelector('[data-employee-row]');
  row.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();
  assert.equal(d.querySelector('#dialog-title').textContent,'View employee');
  assert.ok([...d.querySelectorAll('#ov input,#ov select,#ov textarea')].every(el=>el.disabled));
  assert.equal(d.querySelector('[data-act=esave]'),null);assert.equal(d.querySelector('#p_rate'),null);
  assert.ok(d.querySelector('[data-act=eformschedule]'));
 }finally{dom.window.close()}
});

test('employee form rejects stale saves even after the workspace has refreshed',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval(`V='emp';shell();eform(E[0].id);globalThis.staleEmployeeId=E[0].id;globalThis.originalConfirmation=confirmAction;confirmAction=async()=>true`);
  const input=d.querySelector('#f_contact');input.value='Stale draft';
  await w.eval(`saveEmployees([{employee:{id:staleEmployeeId,contact:'0918-123-4567'},expected_revision:0}]);load()`);
  w.eval(`act('esave',staleEmployeeId)`);await tick();await tick();
  assert.equal(w.eval(`S.employees.find(e=>e.id===staleEmployeeId).contact`),'0918-123-4567');assert.equal(d.querySelector('#f_contact'),input);assert.equal(input.value,'Stale draft');assert.match(d.querySelector('#toast').textContent,/Employee changed/);
 }finally{await tick();w.close()}
});
test('invalid employee pay is rejected without creating an employee',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval(`V='emp';shell();eform()`);d.querySelector('#f_emp_no').value='INVALID-PAY';d.querySelector('#f_last_name').value='Invalid';d.querySelector('#p_override').checked=true;d.querySelector('#p_rate').value='-1';
  w.eval(`act('esave')`);await tick();assert.equal(w.eval(`S.employees.some(e=>e.emp_no==='INVALID-PAY')`),false);assert.ok(d.querySelector('#f_last_name'));assert.match(d.querySelector('#toast').textContent,/Invalid pay profile/);
 }finally{await tick();w.close()}
});
