const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {database,asUser,ids}=require('./helpers');
let db;
before(async()=>{db=await database()});after(async()=>{await db?.close()});
const save=(changes,overwrite=false)=>db.query('select save_attendance_batch($1::jsonb,$2) as result',[JSON.stringify(changes),overwrite]);
const change=(date,row,expected_revision=null)=>({emp_id:ids.emp,date,expected_revision,row});
const duty=(tin='08:00',tout='17:00',brk=60)=>({type:'PRESENT',time_in:tin,time_out:tout,break_min:brk});
test('fresh schema and all migrations are rerunnable',async()=>{
 for(const file of fs.readdirSync('supabase/migrations').sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 assert.equal((await db.query('select count(*)::int as n from duty_pay_rules')).rows[0].n,11);
});
test('signups are inactive viewers, including first public signup',async()=>{
 const p=(await db.query('select role,active from profiles where id=$1',[ids.inactive])).rows[0];assert.deepEqual(p,{role:'viewer',active:false});
});
test('server computes numeric pay and ignores tampered client amounts/hours',async()=>{
 await asUser(db,ids.staff,()=>save([change('2026-10-14',{...duty(),gross:999999,reg_min:1})]));
 const row=(await db.query('select * from attendance where date=$1',['2026-10-14'])).rows[0];assert.equal(row.reg_min,480);assert.equal(row.verified,true);
 const pay=(await db.query('select * from attendance_pay where date=$1',['2026-10-14'])).rows[0];assert.equal(+pay.gross,610);assert.equal(pay.comps.segs[0].rule_from,'2000-01-01');
 assert.ok((await db.query("select 1 from audit_log where action='attendance.insert' and user_email='staff@test.local'")).rows.length);
});
test('atomic failure rolls back earlier rows and audit records',async()=>{
 const before=(await db.query('select count(*)::int as n from audit_log')).rows[0].n;
 await assert.rejects(asUser(db,ids.staff,()=>save([change('2026-10-12',duty()),change('2026-10-13',duty('25:00'))])),/Invalid punches/);
 assert.equal((await db.query("select count(*)::int as n from attendance where date in ('2026-10-12','2026-10-13')")).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int as n from audit_log')).rows[0].n,before);
});
test('stale revision, missing revision and duplicate changes are rejected',async()=>{
 await assert.rejects(asUser(db,ids.staff,()=>save([change('2026-10-14',duty())])),/Attendance changed/);
 await assert.rejects(asUser(db,ids.staff,()=>save([{emp_id:ids.emp,date:'2026-10-12',row:duty()}])),/Expected revision/);
 await assert.rejects(asUser(db,ids.staff,()=>save([change('2026-10-12',duty()),change('2026-10-12',duty())])),/Duplicate/);
});
test('viewer/inactive users cannot write or read wages; direct attendance writes fail',async()=>{
 for(const user of [ids.viewer,ids.inactive])await asUser(db,user,async()=>{
  await assert.rejects(save([change('2026-10-12',duty())]),/Staff access/);
  assert.equal((await db.query('select * from attendance_pay')).rows.length,0);
  assert.equal((await db.query('select * from wage_history')).rows.length,0);
 });
 await asUser(db,ids.staff,async()=>{
  await assert.rejects(db.query("insert into attendance(emp_id,date,type) values($1,'2026-10-12','PRESENT')",[ids.emp]),/permission denied/);
  await assert.rejects(db.query("insert into audit_log(action,user_email) values('fake','admin@test.local')"),/permission denied/);
  await assert.rejects(db.query("select calculate_duty($1,'2026-10-12','08:00','17:00',60,null)",[ids.emp]),/permission denied/);
 });
});
test('database minimum rules and immutable versions',async()=>{
 await asUser(db,ids.admin,async()=>{
  await assert.rejects(db.query("insert into duty_pay_rules(code,mult_reg,mult_ot,effective_from) values('OD',0.5,1.25,'2026-10-01')"),/Invalid pay rule/);
  await assert.rejects(db.query("update duty_pay_rules set mult_reg=9 where code='OD'"),/immutable/);
  await assert.rejects(db.query("update profiles set role='viewer' where id=$1",[ids.admin]),/own access/);
 });
});
test('rest-day, holiday, NSD and OT SQL calculations match JS engine',async()=>{
 const engine=require('../assets/duty-engine');
 const rules=(await db.query('select * from duty_pay_rules')).rows;
 await db.exec("insert into holidays(location,date,kind,name) values('ALL','2026-12-25','LEGAL','Christmas')");
 for(const [date,tin,tout,brk,code] of [['2026-10-12','08:00','19:00',60,'OD'],['2026-10-11','08:00','17:00',60,'RD'],['2026-12-25','08:00','19:00',60,'RH'],['2026-10-12','22:00','06:00',0,'OD'],['2026-10-12','18:00','06:00',60,'OD']]){
  const span=(engine.minute(tout)-engine.minute(tin)+1440)%1440,st=Math.floor((span-brk)/2),r=engine.calculate({date,tin,tout,brks:[[st,st+brk]],hpd:8,daily:610,classify:()=>code,rule:c=>rules.find(q=>q.code==c)});
  const sql=(await db.query('select calculate_duty($1,$2,$3,$4,$5,null) as r',[ids.emp,date,tin,tout,brk])).rows[0].r;
  assert.equal(+sql.gross,r.gross,JSON.stringify({date,tin,tout}));assert.equal(sql.regMin,r.regMin);assert.equal(sql.nsdMin,r.nsdMin);
 }
});
test('effective wages and midnight rule dates are snapshotted',async()=>{
 await db.exec(`insert into wage_history(emp_id,effective_from,daily_rate) values('${ids.emp}','2026-11-01',800)`);
 const old=(await db.query("select calculate_duty($1,'2026-10-01','08:00','17:00',60,null) as r",[ids.emp])).rows[0].r;
 const next=(await db.query("select calculate_duty($1,'2026-11-02','08:00','17:00',60,null) as r",[ids.emp])).rows[0].r;
 assert.equal(+old.gross,610);assert.equal(+next.gross,800);
});
test('qualifying holiday overlaps require explicit shared group and source',async()=>{
 await db.exec("insert into holidays(location,date,kind,name) values('ALL','2026-12-25','LEGAL','Another declaration')");
 assert.equal((await db.query("select day_code($1,'2026-12-25') as c",[ids.emp])).rows[0].c,'RH');
 await db.exec("update holidays set overlap_group='confirmed',source='Test declaration' where date='2026-12-25'");
 assert.equal((await db.query("select day_code($1,'2026-12-25') as c",[ids.emp])).rows[0].c,'DRH');
});
test('locks include overnight segments and prevent partial batch replacement',async()=>{
 await db.exec("insert into cutoff_locks(start_date,end_date) values('2026-10-16','2026-10-31')");
 await assert.rejects(asUser(db,ids.staff,()=>save([change('2026-10-15',duty('20:00','04:00',0))])),/locked/);
 assert.equal((await db.query("select 1 from attendance where date='2026-10-15'")).rows.length,0);
});
test('status updates clear pay atomically and tolerate legacy null segments',async()=>{
 await asUser(db,ids.staff,()=>save([change('2026-10-05',{type:'ABSENT'})]));
 let row=(await db.query("select * from attendance where date='2026-10-05'")).rows[0];
 await asUser(db,ids.staff,()=>save([change('2026-10-05',duty(),row.revision)]));
 row=(await db.query("select * from attendance where date='2026-10-05'")).rows[0];
 await asUser(db,ids.staff,()=>save([change('2026-10-05',{type:'LEAVE-U'},row.revision)]));
 assert.equal((await db.query("select * from attendance_pay where date='2026-10-05'")).rows.length,0);
});
test('finalization blocks incomplete duty, freezes entitlement and cannot be reopened',async()=>{
 await assert.rejects(asUser(db,ids.admin,()=>db.exec("select finalize_cutoff('2026-10-06','2026-10-06')")),/incomplete/);
 assert.equal((await db.query("select * from cutoff_locks where start_date='2026-10-06'")).rows.length,0);
 await asUser(db,ids.staff,()=>save([change('2026-10-07',duty())]));
 await db.exec("insert into holidays(location,date,kind,name) values('ALL','2026-10-08','LEGAL','Test holiday')");
 await asUser(db,ids.admin,()=>db.exec("select finalize_cutoff('2026-10-08','2026-10-08')"));
 const snap=(await db.query("select * from cutoff_snapshots where date='2026-10-08'")).rows[0];
 assert.equal(+snap.holiday_amount,610);assert.equal(snap.holiday_eligible,true);
 await asUser(db,ids.viewer,async()=>{
  assert.equal((await db.query("select * from cutoff_snapshot_view where date='2026-10-08'")).rows[0].holiday_amount,null);
  await assert.rejects(db.query('select * from cutoff_snapshots'),/permission denied/);
 });
 await asUser(db,ids.admin,async()=>{
  await assert.rejects(db.exec("delete from cutoff_locks where start_date='2026-10-08'"),/permission denied/);
  await assert.rejects(db.exec("insert into cutoff_locks(start_date,end_date) values('2026-10-09','2026-10-09')"),/permission denied/);
 });
 await db.exec("update holidays set kind='SPECIAL' where date='2026-10-08'");
 assert.equal(+(await db.query("select holiday_amount from cutoff_snapshots where date='2026-10-08'")).rows[0].holiday_amount,610);
});
test('employee deletion preserves attendance history',async()=>{
 await assert.rejects(asUser(db,ids.staff,()=>db.query('delete from employees where id=$1',[ids.emp])),/attendance history/);
});
test('dated wage inserts through upsert work for Staff and reject invalid values',async()=>{
 await asUser(db,ids.staff,async()=>{
  await db.query("insert into wage_history(id,emp_id,effective_from,daily_rate) values('20000000-0000-4000-8000-000000000001',$1,'2027-01-01',900) on conflict(id) do update set daily_rate=excluded.daily_rate",[ids.emp]);
  await assert.rejects(db.query("insert into wage_history(emp_id,effective_from,daily_rate) values($1,'2027-02-01','NaN')",[ids.emp]),/wage_finite/);
 });
});
test('SQL snapshots preserve saved pay after later wage/rule versions',async()=>{
 const before=(await db.query("select gross,comps from attendance_pay where date='2026-10-14'")).rows[0];
 await asUser(db,ids.admin,()=>db.exec("insert into duty_pay_rules(code,mult_reg,mult_ot,nsd_pct,effective_from) values('OD',1.5,1.5,10,'2026-10-01')"));
 const after=(await db.query("select gross,comps from attendance_pay where date='2026-10-14'")).rows[0];assert.deepEqual(after,before);
});
test('SQL holiday entitlement requires evidence and respects paid/unpaid leave and coverage',async()=>{
 await db.exec("insert into holidays(location,date,kind,name) values('ALL','2026-09-10','LEGAL','Test'),('ALL','2026-09-17','LEGAL','Test')");
 assert.equal((await db.query("select holiday_entitlement($1,'2026-09-10') as e",[ids.emp])).rows[0].e.known,false);
 await asUser(db,ids.staff,()=>save([change('2026-09-09',{type:'LEAVE-U'}),change('2026-09-16',{type:'LEAVE'})]));
 assert.equal((await db.query("select holiday_entitlement($1,'2026-09-10') as e",[ids.emp])).rows[0].e.eligible,false);
 assert.equal((await db.query("select holiday_entitlement($1,'2026-09-17') as e",[ids.emp])).rows[0].e.eligible,true);
});
test('anonymous role cannot call privileged calculation helpers under Supabase default grants',async()=>{
 await db.exec('set role anon');
 try{
  await assert.rejects(db.query("select calculate_duty($1,'2026-10-01','08:00','17:00',60,null)",[ids.emp]),/permission denied/);
  await assert.rejects(db.query("select holiday_entitlement($1,'2026-10-08')",[ids.emp]),/permission denied/);
  await assert.rejects(db.query('select * from cutoff_snapshots'),/permission denied/);
 }finally{await db.exec('reset role')}
});
