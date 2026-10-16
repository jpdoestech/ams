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
test('employee positions depend on department, and popup lookup additions preserve the draft',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval('V="emp";shell();eform(E[0].id)');d.querySelector('#f_contact').value='Unsaved contact';
  const fields=[...d.querySelectorAll('.modal-body select')].map(el=>el.id);assert.ok(fields.indexOf('f_department')<fields.indexOf('f_position'));
  assert.ok([...d.querySelector('#f_position').options].some(o=>o.value==='Security Guard'));assert.equal([...d.querySelector('#f_position').options].some(o=>o.value==='Utility'),false);
  d.querySelector('#f_department').value='Operations';d.querySelector('#f_department').dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(d.querySelector('#f_position').value,'');assert.ok([...d.querySelector('#f_position').options].some(o=>o.value==='Utility'));
  w.eval('quickLookup("department")');assert.equal(d.querySelector('#dialog-title').textContent,'Add department');assert.equal(d.querySelector('#f_contact'),null);d.querySelector('#quick-lookup-value').value='Warehouse';await w.eval('saveQuickLookup()');
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

test('lookup cancellation and Escape restore the employee draft and trigger focus',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval('eform()');const input=d.querySelector('#f_last_name');input.value='Draft';const trigger=d.querySelector('[data-quick-add=department]');trigger.click();
  d.querySelector('#ov').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(d.querySelector('#f_last_name'),input);assert.equal(input.value,'Draft');assert.equal(d.activeElement,trigger);
  trigger.click();d.querySelector('.modal-footer [data-act=cm]').click();await tick();assert.equal(d.querySelector('#f_last_name'),input);
 }finally{await tick();w.close()}
});
test('regional daily rates populate pay profiles, preserve overrides, and persist with city holiday location',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval(`LK.find(x=>x.kind==='region'&&x.value==='NCR').daily_rate=700;LK.find(x=>x.kind==='region'&&x.value==='Davao Region').daily_rate=525;eform()`);
  const region=d.querySelector('#f_region'),city=d.querySelector('#f_location'),rate=d.querySelector('#p_rate'),override=d.querySelector('#p_override');
  assert.equal(region.tagName,'INPUT');assert.equal(city.tagName,'INPUT');assert.ok(region.list.options.length);assert.equal(override.checked,false);
  region.value=' ncr ';region.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(region.value,'NCR');assert.equal(rate.value,'700');assert.equal(rate.readOnly,true);
  override.checked=true;override.dispatchEvent(new w.Event('change',{bubbles:true}));rate.value='900';region.value='Davao Region';region.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(rate.value,'900');
  override.checked=false;override.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(rate.value,'525');city.value='Davao City';
  d.querySelector('#f_emp_no').value='REGION-TEST';d.querySelector('#f_last_name').value='Regional';w.eval(`act('esave')`);await tick();await tick();
  assert.equal(w.eval(`S.employees.find(x=>x.emp_no==='REGION-TEST').region`),'Davao Region');assert.equal(w.eval(`S.employees.find(x=>x.emp_no==='REGION-TEST').location`),'Davao City');
  assert.equal(w.eval(`S.employees.find(x=>x.emp_no==='REGION-TEST').rate_override`),false);
  assert.equal(w.eval(`S.wage_history.find(x=>x.emp_id===S.employees.find(x=>x.emp_no==='REGION-TEST').id).daily_rate`),525);
  w.eval(`closeM();eform(E[0].id)`);assert.equal(d.querySelector('#p_override').checked,true);assert.equal(d.querySelector('#p_rate').value,'610');
 }finally{await tick();w.close()}
});
test('missing regional rates block saving and configured regional defaults survive reload',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval('eform()');d.querySelector('#f_emp_no').value='MISSING';d.querySelector('#f_last_name').value='Missing';w.eval(`act('esave')`);await tick();assert.equal(w.eval(`S.employees.some(x=>x.emp_no==='MISSING')`),false);
  w.eval(`closeM();V='std';STAB='val';LKK='region';shell();regionRateModal('NCR')`);d.querySelector('#region-rate').value='750';await w.eval(`saveRegionRate('NCR');load()`);
  assert.equal(w.eval(`LK.find(x=>x.kind==='region'&&x.value==='NCR').daily_rate`),750);
 }finally{await tick();w.close()}
});

test('canceling a pending lookup save does not close the employee draft on completion',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;
 try{
  w.eval(`eform();$('f_last_name').value='Pending draft';quickLookup('department');$('quick-lookup-value').value='Pending department';globalThis.releaseLookup=null;globalThis.originalLookupUp=API.up;API.up=()=>new Promise(resolve=>releaseLookup=resolve);globalThis.pendingLookup=saveQuickLookup();closeM();releaseLookup()`);
  await w.eval('pendingLookup');assert.equal(d.querySelector('#ov').classList.contains('on'),true);assert.equal(d.querySelector('#f_last_name').value,'Pending draft');
  w.eval('API.up=originalLookupUp');
 }finally{await tick();w.close()}
});
