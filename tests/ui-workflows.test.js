const {test}=require('node:test'),assert=require('node:assert/strict');
const {browser}=require('./helpers');
const tick=()=>new Promise(r=>setTimeout(r,15));
test('summary CSV embeds the applied dates for attendance counts and duty/pay views',async()=>{
 const dom=await browser(),w=dom.window;
 try{
  const counts=w.eval('sumCSV(agg(E,[],"2026-09-16","2026-09-30"),"2026-09-16","2026-09-30")');
  assert.deepEqual(Array.from(counts[0].slice(0,2)),['FROM','TO']);assert.ok(counts.slice(1).every(r=>r[0]==='2026-09-16'&&r[1]==='2026-09-30'));
  const duty=w.eval('dutyCSV(dutyAgg(E,[],[],"2026-09-16","2026-09-30",false),"2026-09-16","2026-09-30")');
  assert.deepEqual(Array.from(duty[0].slice(0,2)),['FROM','TO']);assert.ok(duty.slice(1).every(r=>r[0]==='2026-09-16'&&r[1]==='2026-09-30'));
 }finally{await tick();w.close()}
});
test('search indicators appear, escape search text, and clear with their filters',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval('V="emp";shell()');const input=d.querySelector('#q');input.value='<script>';input.dispatchEvent(new w.Event('input',{bubbles:true}));await tick();
  assert.match(d.querySelector('.filter-indicator').textContent,/<script>/);assert.equal(d.querySelector('.filter-indicator script'),null);assert.equal(input.classList.contains('is-filtered'),true);
  input.value='';input.dispatchEvent(new w.Event('input',{bubbles:true}));await tick();assert.equal(d.querySelector('.filter-indicator').hidden,true);
  w.eval('V="att";shell()');d.querySelector('#fd').value='Security';d.querySelector('#fd').dispatchEvent(new w.Event('change',{bubbles:true}));await tick();assert.match(d.querySelector('.filter-indicator').textContent,/Department: Security/);
 }finally{await tick();w.close()}
});
test('employee positions depend on department, and inline lookup additions preserve the draft',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval('V="emp";shell();eform(E[0].id)');d.querySelector('#f_contact').value='Unsaved contact';
  const fields=[...d.querySelectorAll('.modal-body select')].map(el=>el.id);assert.ok(fields.indexOf('f_department')<fields.indexOf('f_position'));
  assert.ok([...d.querySelector('#f_position').options].some(o=>o.value==='Security Guard'));assert.equal([...d.querySelector('#f_position').options].some(o=>o.value==='Utility'),false);
  d.querySelector('#f_department').value='Operations';d.querySelector('#f_department').dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(d.querySelector('#f_position').value,'');assert.ok([...d.querySelector('#f_position').options].some(o=>o.value==='Utility'));
  w.eval('quickLookup("department")');d.querySelector('#quick-lookup-value').value='Warehouse';await w.eval('saveQuickLookup()');
  assert.equal(d.querySelector('#f_department').value,'Warehouse');assert.equal(d.querySelector('#f_position').options.length,1);
  w.eval('quickLookup("position")');d.querySelector('#quick-lookup-value').value='Inventory clerk';await w.eval('saveQuickLookup()');
  assert.equal(d.querySelector('#f_position').value,'Inventory clerk');assert.equal(d.querySelector('#f_contact').value,'Unsaved contact');
  assert.ok(w.eval('DPM.some(m=>LK.find(x=>x.id===m.position_id)?.value==="Inventory clerk")'));
 }finally{await tick();w.close()}
});
test('editors retain fixed modal chrome and attendance retains just two totals',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval('V="emp";shell();eform(E[0].id)');assert.ok(d.querySelector('.modal-header #dialog-title'));assert.ok(d.querySelector('.modal-footer [data-act=esave]'));assert.ok(d.querySelector('.modal-body #f_last_name'));
  d.querySelector('[data-act=eformschedule]').click();await tick();assert.ok(d.querySelector('.modal-footer [data-act=ssave]'));assert.ok(d.querySelector('.modal-body #sch'));
  w.eval('closeM();closeM();V="att";shell()');assert.deepEqual([...d.querySelectorAll('#gt thead th.s')].map(c=>c.textContent),['LATE/UT min','PRESENT']);
 }finally{await tick();w.close()}
});
