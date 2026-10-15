const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {browser}=require('./helpers');
let dom,w;
before(async()=>{dom=await browser();w=dom.window;w.confirm=()=>{throw Error('Native confirmation must not be used')}});
after(()=>dom?.window.close());
async function waitUntil(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5))}assert.fail('UI action did not finish')}
const openDuty=cells=>w.eval(`ROLE='superadmin';V='att';DB=[];H=[];cut={m:'2026-11',h:1};shell();dutyM(${JSON.stringify(cells)})`);

test('override dropdown labels describe work classifications and preserve raw pay codes',()=>{
 openDuty([[0,0]]);
 const select=w.document.getElementById('dov'),option=[...select.options].find(o=>o.value==='RH');
 assert.equal(option.textContent,'RH | Regular Holiday Worked');
 assert.equal(select.options.length,12);
 assert.ok([...select.options].filter(o=>o.value).every(o=>o.textContent.startsWith(o.value+' | ')));
 const fields=w.document.querySelector('.duty-overrides');
 assert.equal(fields.children[0].querySelector('select'),select);
 assert.equal(fields.children[1].querySelector('textarea').id,'dwhy');
 select.value='RH';assert.equal(w.eval('dinp().ov'),'RH');
});
test('single Save duty saves directly and still requires a reason for an override',async()=>{
 openDuty([[0,0]]);w.document.getElementById('dov').value='RH';
 w.document.querySelector('[data-act="dsave"]').click();
 await waitUntil(()=>w.document.getElementById('toast').textContent.includes('override reason is required'));
 assert.match(w.document.getElementById('toast').textContent,/override reason is required/);
 assert.equal(w.document.querySelector('.confirm-layer'),null);
 w.document.getElementById('dwhy').value='Approved calendar correction';
 w.document.querySelector('[data-act="dsave"]').click();
 await waitUntil(()=>!w.document.getElementById('ov').classList.contains('on'));
 assert.equal(w.eval(`S.attendance.find(r=>r.emp_id===E[0].id&&r.date==='2026-11-01').override_code`),'RH');
 assert.equal(w.document.querySelector('.confirm-layer'),null);
});
test('bulk Save duty saves directly while protecting reviewed entries',async()=>{
 openDuty([[0,0],[0,1],[0,2]]);
 w.document.querySelector('[data-act="dsave"]').click();
 await waitUntil(()=>!w.document.getElementById('ov').classList.contains('on'));
 assert.equal(w.document.querySelector('.confirm-layer'),null);
 assert.equal(w.eval(`S.attendance.find(r=>r.emp_id===E[0].id&&r.date==='2026-11-01').override_code`),'RH');
 assert.equal(w.eval(`S.attendance.filter(r=>r.emp_id===E[0].id&&['2026-11-02','2026-11-03'].includes(r.date)&&r.verified).length`),2);
 assert.match(w.document.getElementById('toast').textContent,/1 reviewed skipped/);
});
test('in-app confirmation cancels mutations, preserves editor input, and restores focus',async()=>{
 w.eval('V="emp";shell();colM()');
 const input=w.document.querySelector('[data-w]');input.value='333';input.focus();
 w.eval('act("creset")');
 const dialog=w.document.querySelector('[role="alertdialog"]');assert.ok(dialog);
 assert.equal(w.document.activeElement.textContent,'Cancel');
 assert.ok(w.document.getElementById('ov').classList.contains('on'));
 dialog.querySelector('.confirm-actions button').click();
 await waitUntil(()=>!w.document.querySelector('.confirm-layer'));
 assert.equal(w.document.activeElement,input);assert.equal(input.value,'333');
 assert.ok(w.document.getElementById('ov').classList.contains('on'));
});
test('confirmed action runs only after dedicated modal acceptance',async()=>{
 w.eval('act("creset")');assert.ok(w.document.querySelector('[role="alertdialog"]'));
 w.document.querySelector('.confirm-actions button:last-child').click();
 await waitUntil(()=>!w.document.getElementById('ov').classList.contains('on'));
 assert.equal(w.document.querySelector('.confirm-layer'),null);
});
test('confirmation safely displays text, traps keyboard focus, and supports Escape',async()=>{
 const result=w.confirmAction('Delete <img src=x onerror=alert(1)>?');
 const dialog=w.document.querySelector('[role="alertdialog"]');
 assert.equal(dialog.querySelector('img'),null);assert.match(dialog.textContent,/<img/);
 assert.equal(dialog.querySelector('h3').textContent,'Delete record?');
 w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
 assert.equal(w.document.activeElement.textContent,'Delete');
 w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(await result,false);assert.equal(w.document.querySelector('.confirm-layer'),null);
});
