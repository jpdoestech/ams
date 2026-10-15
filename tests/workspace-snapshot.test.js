const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {database,asUser,ids}=require('./helpers');let db;
before(async()=>db=await database());after(async()=>db?.close());
const snapshot=(who=ids.staff,known=null,force=false)=>asUser(db,who,async()=>{
 const result=(await db.query('select workspace_snapshot($1,$2,$3,$4,$5) as data',['2027-04-01','2027-04-15',known?.catalog_token??null,known?.known_tokens??null,force])).rows[0].data;
 const tokens=result.period?.replace?{}:{...(known?.known_tokens||{})};for(const id of result.period?.employees||[])delete tokens[id];Object.assign(tokens,result.period_tokens||{});return{...result,known_tokens:tokens};
});
const save=(date,type='ABSENT',emp=ids.emp)=>asUser(db,ids.staff,async()=>{const old=(await db.query('select revision from attendance where emp_id=$1 and date=$2',[emp,date])).rows[0];return db.query('select save_attendance_batch($1)',[JSON.stringify([{emp_id:emp,date,expected_revision:old?.revision??null,row:type?{type}:null}])])});
test('one snapshot returns authorized catalog and period data; unchanged refresh omits both',async()=>{
 await save('2027-04-01');const first=await snapshot();assert.equal(first.role,'staff');assert.equal(first.catalog.employees.length,1);assert.equal(first.catalog.wage_history.length,1);assert.equal(first.period.attendance.length,1);assert.equal(first.period.replace,true);
 const next=await snapshot(ids.staff,first);assert.equal(next.catalog,null);assert.equal(next.period,null);assert.equal(next.period_tokens,null);assert.deepEqual(next.known_tokens,first.known_tokens);
 const full=await snapshot(ids.staff,next,true);assert.ok(full.catalog);assert.equal(full.period.attendance.length,1);
 assert.ok(JSON.stringify(next).length<JSON.stringify(first).length/5);
});
test('period deltas replace only changed employees and detect deletion without audit capture',async()=>{
 await db.exec(`insert into employees(id,emp_no,last_name,date_hired) values('10000000-0000-4000-8000-000000000002','E-SECOND','Second','2026-01-01')`);
 const other='10000000-0000-4000-8000-000000000002';await save('2027-04-01','ABSENT',other);const first=await snapshot();
 await asUser(db,ids.admin,()=>db.exec('update audit_settings set enabled=false where id=1'));
 await save('2027-04-02');const changed=await snapshot(ids.staff,first);assert.equal(changed.catalog,null);assert.deepEqual(changed.period.employees,[ids.emp]);assert.equal(changed.period.attendance.length,2);assert.equal(changed.period.replace,false);
 await save('2027-04-01',null,other);const removed=await snapshot(ids.staff,changed);assert.deepEqual(removed.period.employees,[other]);assert.equal(removed.period.attendance.length,0);assert.equal(removed.period_tokens[other],undefined);
 await asUser(db,ids.viewer,()=>db.query('insert into attendance_comments(emp_id,date,body,author_email) values($1,$2,$3,$4)',[ids.emp,'2027-04-02','Shared comment','viewer@test.local']));
 const comment=await snapshot(ids.staff,removed);assert.deepEqual(comment.period.employees,[ids.emp]);assert.equal(comment.period.attendance_comments[0].body,'Shared comment');
});
test('catalog token changes with setup edits; permissions mask wages and reject inactive/anonymous callers',async()=>{
 const first=await snapshot();await asUser(db,ids.staff,()=>db.exec("insert into lookups(kind,value) values('department','Performance test')"));const changed=await snapshot(ids.staff,first);assert.ok(changed.catalog);assert.notEqual(changed.catalog_token,first.catalog_token);assert.equal(changed.period,null);
 const viewer=await snapshot(ids.viewer,changed);assert.equal(viewer.role,'viewer');assert.deepEqual(viewer.catalog.wage_history,[]);assert.deepEqual(viewer.catalog.employee_pay,[]);assert.deepEqual(viewer.period.attendance_pay,[]);
 await assert.rejects(snapshot(ids.inactive),/Active workspace/);
 await db.exec('set role anon');try{await assert.rejects(db.query("select workspace_snapshot('2027-04-01','2027-04-15')"),/permission denied/)}finally{await db.exec('reset role')}
 await assert.rejects(asUser(db,ids.staff,()=>db.exec('update workspace_catalog_revision set revision=1')),/permission denied/);
});
test('snapshot filters finalized history by period and still returns catalogs beyond 1000 rows',async()=>{
 await db.exec(`insert into cutoff_locks(id,start_date,end_date) values('40000000-0000-4000-8000-000000000001','2025-01-01','2025-01-15');insert into cutoff_snapshots(lock_id,emp_id,date,code,holiday_eligible,holiday_amount) values('40000000-0000-4000-8000-000000000001','${ids.emp}','2025-01-01','RH',true,610)`);
 await db.exec("insert into lookups(kind,value) select 'department','Bulk department '||i from generate_series(1,1001) i");const result=await snapshot();assert.equal(result.period.cutoff_snapshot_view.length,0);assert.ok(result.catalog.lookups.length>1000);
});
test('approval revisions invalidate period data and RLS identity checks use statement initplans',async()=>{
 const first=await snapshot();const r=(await db.query("select * from attendance where emp_id=$1 and date='2027-04-02'",[ids.emp])).rows[0];await asUser(db,ids.staff,()=>db.query("select review_attendance($1,'submit','')",[JSON.stringify([r])]));
 const submitted=await snapshot(ids.staff,first);assert.equal(submitted.period.attendance.find(r=>r.date==='2027-04-02').review_status,'submitted');
 const policy=(await db.query("select qual from pg_policies where tablename='employees' and policyname='rd'")).rows[0].qual;assert.match(policy,/SELECT.*my_role/);
 const plan=(await asUser(db,ids.staff,()=>db.query('explain (format json) select * from employees'))).rows[0]['QUERY PLAN'];assert.match(JSON.stringify(plan),/InitPlan/);
});
