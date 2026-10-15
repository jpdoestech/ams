const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {browser}=require('./helpers');
let dom,w;
beforeEach(async()=>{dom=await browser();w=dom.window;w.eval(`ROLE='staff';P={id:'staff-author',email:'staff@demo'};V='att';cut={m:'2027-02',h:1};shell()`)});
afterEach(()=>dom.window.close());
async function seed(){await w.eval(`saveAttendance([changeFor(E[0].id,'2027-02-01',dutyRow(E[0],'2027-02-01',{tin:'08:00',tout:'17:00',brk:60,ov:'RH',why:'Authorized holiday'},'manual').row)]);`);await w.eval('load()')}
test('demo approval separates overrides, blocks edits while submitted, and resets on approved overwrite',async()=>{
 await seed();assert.equal(w.eval('S.attendance[0].reviewed'),false);
 await w.eval(`reviewEntries([S.attendance[0]],'submit')`);
 await w.eval('load()');
 await assert.rejects(w.eval(`saveAttendance([changeFor(E[0].id,'2027-02-01',{type:'ABSENT'})],true)`),/returned/);
 w.eval(`ROLE='superadmin';P={id:'reviewer',email:'reviewer@demo'}`);
 await w.eval(`reviewEntries([S.attendance[0]],'approve')`);assert.equal(w.eval('S.attendance[0].reviewed'),true);
 await w.eval('load()');await w.eval(`saveAttendance([changeFor(E[0].id,'2027-02-01',{type:'ABSENT'})],true)`);assert.equal(w.eval('S.attendance[0].review_status'),'draft');assert.equal(w.eval('S.attendance_review_events.length'),2);
});
test('review UI uses filtered rows, labelled selection and fixed modal actions',async()=>{
 await seed();await w.eval('reviewModal()');assert.ok(w.document.querySelector('.modal-header h3'));assert.ok(w.document.querySelector('.modal-footer [data-review-action=submit]'));assert.equal(w.document.querySelectorAll('[data-review-row]').length,1);assert.equal(w.document.querySelector('[data-review-action=approve]'),null);
 const filter=w.document.getElementById('review-filter');filter.value='submitted';filter.dispatchEvent(new w.Event('change'));assert.match(w.document.getElementById('review-count').textContent,/Filtered: submitted/);assert.equal(w.document.querySelectorAll('[data-review-row]').length,0);
});
test('dated demo versions preserve earlier schedules, historical analytics and saved context',async()=>{
 const oldSite=w.eval('E[0].site');await w.eval(`saveAssignment(E[0].id,'2027-05-01',{...assignmentFields(E[0]),site:'Future site',time_in:'09:00',time_out:'18:00',rest_day:'Tue'},[],'Transfer next month')`);await w.eval('load()');
 assert.equal(w.eval(`employeeAt(E[0],'2027-04-30').site`),oldSite);assert.equal(w.eval(`employeeAt(E[0],'2027-05-01').site`),'Future site');assert.equal(w.eval(`isRD(E[0],'2027-05-04')`),true);
 assert.equal(w.eval(`dutyRow(E[0],'2027-05-03',{tin:'09:00',tout:'18:00',brk:60},'manual').row.late`),0);
 w.eval('schM(E[0].id)');assert.ok(w.document.getElementById('schedule-from'));assert.ok(w.document.querySelector('[data-assignment-history]'));
});
test('demo corrections require finalized dates and independent decisions without rewriting duty',async()=>{
 await seed();const before=w.eval('JSON.stringify(S.attendance)');
 const params=`{p_id:'correction-1',p_emp:E[0].id,p_date:'2027-02-01',p_minutes:15,p_amount:20.25,p_reason:'Verified missing minutes',p_reference:'Ref 1'}`;
 await assert.rejects(w.eval(`submitAdjustment(${params})`),/finalized/);
 w.eval(`LOCKS=[{id:'locked-1',start_date:'2027-02-01',end_date:'2027-02-01'}];S.cutoff_locks=LOCKS`);
 await w.eval(`submitAdjustment(${params})`);await w.eval(`submitAdjustment(${params})`);assert.equal(w.eval('S.cutoff_adjustments.length'),1);
 w.eval(`ROLE='superadmin'`);await assert.rejects(w.eval(`decideAdjustment('correction-1','approve','Approved evidence')`),/different superadmin/);
 w.eval(`P={id:'reviewer',email:'reviewer@demo'}`);await w.eval(`decideAdjustment('correction-1','approve','Approved evidence')`);assert.equal(w.eval('S.cutoff_adjustments[0].status'),'approved');assert.equal(w.eval('JSON.stringify(S.attendance)'),before);
 w.eval(`V='adjustments';shell()`);await new Promise(r=>setTimeout(r,50));assert.match(w.document.getElementById('adjustments-totals').textContent,/20.25/);
});
test('operation persistence failure retains the old memory and pending form',async()=>{
 await seed();const before=w.eval('JSON.stringify(S)');w.eval(`Object.getPrototypeOf(localStorage).setItem=()=>{throw Error('Storage full')}`);
 await assert.rejects(w.eval(`reviewEntries([S.attendance[0]],'submit')`),/Storage full/);assert.equal(w.eval('JSON.stringify(S)'),before);
});
