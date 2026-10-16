const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const cutoffs=require('../assets/cutoff-schedules');
const {database,asUser,ids,browser}=require('./helpers');
let db;before(async()=>db=await database());after(()=>db?.close());
const row={effective_month:'2027-01-01',first_end:10,second_end:25,version_no:1};
test('repeating ranges cover year boundaries, short months, and standard 1–5 periods without gaps',()=>{
 assert.deepEqual(cutoffs.ranges('2027-01'),[['2027-01-01','2027-01-15'],['2027-01-16','2027-01-31']]);
 assert.deepEqual(cutoffs.ranges('2027-01',[row]),[['2026-12-26','2027-01-10'],['2027-01-11','2027-01-25']]);
 assert.deepEqual(cutoffs.ranges('2026-12',[row]),[['2026-12-01','2026-12-15'],['2026-12-16','2026-12-25']]);
 assert.deepEqual(cutoffs.ranges('2027-02',[row]),[['2027-01-26','2027-02-10'],['2027-02-11','2027-02-25']]);
 const short={...row,first_end:5,second_end:null};assert.deepEqual(cutoffs.ranges('2028-02',[short]),[['2028-02-01','2028-02-05'],['2028-02-06','2028-02-29']]);
 assert.throws(()=>cutoffs.validate({...row,effective_month:'2027-03-01',first_end:20,second_end:25,version_no:2},[{...row,effective_month:'2027-06-01',first_end:5,second_end:10}]),/no second cut-off/);
 assert.throws(()=>cutoffs.validate({...row,first_end:28}),/1–27/);assert.throws(()=>cutoffs.validate({...row,second_end:5}),/1–27/);
 assert.throws(()=>cutoffs.validate({...row,effective_month:'2027-02-01',first_end:5,second_end:10,version_no:2},[{...row,first_end:15,second_end:null}]),/no second cut-off/);
});
test('server schedules match browser ranges and enforce admin, revision, and immutable history rules',async()=>{
 for(const actor of [ids.staff,ids.viewer,ids.inactive])await asUser(db,actor,()=>assert.rejects(db.query("select save_cutoff_schedule('2027-01-01',10,25,null)"),/Superadmin/));
 await asUser(db,ids.admin,()=>db.query("select save_cutoff_schedule('2027-01-01',10,25,null)"));
 for(const month of ['2026-12','2027-01','2027-02','2028-02']){
  const actual=(await db.query('select cutoff_ranges($1) result',[month+'-01'])).rows[0].result;assert.deepEqual(actual,cutoffs.ranges(month,[row]));
 }
 const version=(await db.query('select max(version_no) n from cutoff_schedules')).rows[0].n;
 await asUser(db,ids.admin,()=>assert.rejects(db.query("select save_cutoff_schedule('2027-02-01',5,null,null)"),/schedule changed/));
 await asUser(db,ids.admin,()=>assert.rejects(db.query("select save_cutoff_schedule('2027-02-01',28,null,$1)",[version]),/1–27/));
 await asUser(db,ids.staff,()=>assert.rejects(db.query("insert into cutoff_schedules(effective_month,first_end) values('2027-02-01',5)"),/permission denied/));
 await assert.rejects(db.query('update cutoff_schedules set first_end=9'),/immutable/);
 const payload=await asUser(db,ids.staff,()=>db.query("select workspace_snapshot('2027-01-01','2027-01-15') result"));assert.equal(payload.rows[0].result.catalog.cutoff_schedules.length,1);
});
test('an earlier schedule cannot break a transition into an already configured future schedule',async()=>{
 const version=(await db.query('select max(version_no) n from cutoff_schedules')).rows[0].n;
 await asUser(db,ids.admin,()=>db.query("select save_cutoff_schedule('2027-06-01',5,20,$1)",[version]));
 const latest=(await db.query('select max(version_no) n from cutoff_schedules')).rows[0].n;
 await asUser(db,ids.admin,()=>assert.rejects(db.query("select save_cutoff_schedule('2027-03-01',22,25,$1)",[latest]),/no second cut-off in 2027-05/));
});
test('finalized periods block schedule changes and failed writes leave catalog/history intact',async()=>{
 await db.exec("insert into cutoff_locks(start_date,end_date) values('2027-01-11','2027-01-25')");
 const version=(await db.query('select max(version_no) n from cutoff_schedules')).rows[0].n;
 await asUser(db,ids.admin,()=>assert.rejects(db.query("select save_cutoff_schedule('2027-02-01',5,null,$1)",[version]),/finalized dates/));
 assert.equal((await db.query('select count(*)::int n from cutoff_schedules')).rows[0].n,2);
 await asUser(db,ids.admin,()=>db.query("select save_cutoff_schedule('2027-03-01',5,null,$1)",[version]));
 assert.deepEqual((await db.query("select cutoff_ranges('2027-03-01') result")).rows[0].result,[['2027-03-01','2027-03-05'],['2027-03-06','2027-03-31']]);
});
test('Standards settings drive attendance, summaries and exports through the same cross-year range',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;try{
  w.eval(`V='std';STAB='cut';cut={m:'2027-01',h:1};shell()`);assert.ok(d.querySelector('#cutoff-effective'));
  d.querySelector('#cutoff-first').value='10';d.querySelector('#cutoff-second').value='25';await w.eval('saveCutoffSchedule()');
  assert.deepEqual(Array.from(w.eval('rng()')),['2026-12-26','2027-01-10']);assert.equal(w.eval('days().length'),16);
  w.eval(`V='att';shell()`);assert.match(d.querySelector('#ch').textContent,/Dec 26/);assert.match(d.querySelector('#gt thead').textContent,/Dec 26/);
  w.eval(`exportM()`);assert.deepEqual(Array.from(w.eval(`pread('x')`)),['2026-12-26','2027-01-10']);
  d.querySelector('#xmo').value='2027-02';d.querySelector('#xmo').dispatchEvent(new w.Event('change',{bubbles:true}));assert.match(d.querySelector('#xh').textContent,/Jan 26/);assert.deepEqual(Array.from(w.eval(`pread('x')`)),['2027-01-26','2027-02-10']);
  w.eval(`closeM();V='sum';shell()`);assert.deepEqual(Array.from(w.eval(`pread('s')`)),['2026-12-26','2027-01-10']);
  await new Promise(r=>setTimeout(r,25));
 }finally{w.close()}
});

test('initial current-period selection follows the repeating boundary into the next payroll month',async()=>{
 const dom=await browser(),w=dom.window;try{
  const today=w.eval('manilaToday()'),month=today.slice(0,7),day=Number(today.slice(8)),next=cutoffs.shiftMonth(month,1),previous=cutoffs.shiftMonth(month,-1);
  w.eval(`S.cutoff_schedules=[{id:'auto',effective_month:'${month}-01',first_end:5,second_end:10,version_no:1}]`);await w.eval('load()');
  const expected=day<=5?[previous+'-11',month+'-05']:day<=10?[month+'-06',month+'-10']:[month+'-11',next+'-05'];assert.deepEqual(Array.from(w.eval('rng()')),expected);
 }finally{w.close()}
});
