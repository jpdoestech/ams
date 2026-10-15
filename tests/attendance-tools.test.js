const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {browser}=require('./helpers');
let dom,w;
beforeEach(async()=>{dom=await browser();w=dom.window;w.eval(`V='att';DB=[];H=[];cut={m:'2026-10',h:1};shell()`)});
afterEach(()=>dom.window.close());
async function seed(date,override=false){
 await w.eval(`saveAttendance([changeFor(E[0].id,${JSON.stringify(date)},dutyRow(E[0],${JSON.stringify(date)},{tin:'08:00',tout:'17:00',brk:60${override?",ov:'RH',why:'Authorized correction'":''}},'manual').row)])`);
 if(override)await w.eval(`(async()=>{const before=P;let row=S.attendance.find(r=>r.emp_id===E[0].id&&r.date===${JSON.stringify(date)});await reviewEntries([row],'submit');P={id:'independent-reviewer',email:'reviewer@demo'};await reviewEntries([S.attendance.find(r=>r.emp_id===row.emp_id&&r.date===row.date)],'approve');P=before})()`);
 await w.eval('load()');w.eval('grid()');
}
const exists=date=>w.eval(`S.attendance.some(r=>r.emp_id===E[0].id&&r.date===${JSON.stringify(date)})`);
const accept=()=>w.document.querySelector('.confirm-actions button:last-child').click();
const cancel=()=>w.document.querySelector('.confirm-actions button:first-child').click();
test('DUTY is selected by default; PRESENT is absent from entry controls',()=>{
 assert.equal(w.eval('tool'),'DUTY');assert.equal(w.document.querySelector('[data-t="DUTY"]').getAttribute('aria-pressed'),'true');
 assert.equal(w.document.querySelector('[data-t="PRESENT"]'),null);assert.equal(w.document.querySelector('[data-t="CLEAR"]').textContent,'Clear entry');
 const cell=w.document.querySelector('td.c');cell.dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
 const items=[...w.document.querySelectorAll('#menu [role="menuitem"]')].map(el=>el.textContent);assert.ok(items.includes('Clear entry'));assert.ok(!items.includes('PRESENT'));
});
test('default grid click opens duty editor and preserves existing recorded work',async()=>{
 await seed('2026-10-01');
 const cell=w.document.querySelector('td[data-r="0"][data-c="0"]');
 cell.dispatchEvent(new w.MouseEvent('pointerdown',{button:0,bubbles:true}));w.document.dispatchEvent(new w.Event('pointerup'));
 assert.ok(w.document.getElementById('dm'));assert.ok(exists('2026-10-01'));
 assert.equal(w.eval(`S.attendance_pay.find(r=>r.emp_id===E[0].id&&r.date==='2026-10-01').gross`),610);
});
test('cancelling Clear entry preserves attendance, pay and audit history',async()=>{
 await seed('2026-10-01');const before=w.eval('JSON.stringify(S)');
 const pending=w.eval(`apply([[0,0]],'CLEAR')`);
 assert.match(w.document.querySelector('[role="alertdialog"]').textContent,/actual punches.*pay snapshots/);
 cancel();await pending;assert.equal(w.eval('JSON.stringify(S)'),before);
});
test('confirmed Clear entry removes attendance and pay atomically, including rest-day work',async()=>{
 await seed('2026-10-04');assert.equal(w.eval(`isRD(E[0],'2026-10-04')`),true);
 const pending=w.eval(`apply([[0,3]],'CLEAR')`);accept();await pending;
 assert.equal(exists('2026-10-04'),false);
 assert.equal(w.eval(`S.attendance_pay.some(r=>r.emp_id===E[0].id&&r.date==='2026-10-04')`),false);
 assert.equal(w.document.querySelector('td[data-r="0"][data-c="3"]').textContent,'RD');
 assert.ok(w.eval(`S.audit_log.some(a=>a.detail.old?.date==='2026-10-04'&&a.detail.new===null)`));
});
test('clearing skips reviewed, locked and empty cells while clearing eligible entries',async()=>{
 await seed('2026-10-01',true);await seed('2026-10-02');await seed('2026-10-03');
 w.eval(`LOCKS=[{start_date:'2026-10-02',end_date:'2026-10-02'}]`);
 const pending=w.eval(`apply([[0,0],[0,1],[0,2],[0,3]],'CLEAR')`);
 const text=w.document.querySelector('[role="alertdialog"]').textContent;assert.match(text,/1 locked/);assert.match(text,/1 reviewed/);assert.match(text,/1 empty/);
 accept();await pending;assert.ok(exists('2026-10-01'));assert.ok(exists('2026-10-02'));assert.equal(exists('2026-10-03'),false);
});
test('clearing an empty day is a no-op, and legacy PRESENT painting cannot delete duty',async()=>{
 const before=w.eval('JSON.stringify(S)');await w.eval(`apply([[0,0]],'CLEAR')`);
 assert.equal(w.document.querySelector('.confirm-layer'),null);assert.equal(w.eval('JSON.stringify(S)'),before);
 await seed('2026-10-01');await w.eval(`apply([[0,0]],'PRESENT')`);assert.ok(exists('2026-10-01'));
});
test('clear detects changes made while confirmation was open',async()=>{
 await seed('2026-10-01');const pending=w.eval(`apply([[0,0]],'CLEAR')`);
 w.eval(`S.attendance.find(r=>r.emp_id===E[0].id&&r.date==='2026-10-01').revision++`);
 accept();await pending;assert.ok(exists('2026-10-01'));assert.match(w.document.getElementById('toast').textContent,/changed; reload/);
});
test('viewers cannot clear entries and do not see clear controls',async()=>{
 await seed('2026-10-01');w.eval(`ROLE='viewer';shell()`);
 assert.equal(w.document.querySelector('[data-t="CLEAR"]'),null);await w.eval(`apply([[0,0]],'CLEAR')`);
 assert.equal(w.document.querySelector('.confirm-layer'),null);assert.ok(exists('2026-10-01'));
});
