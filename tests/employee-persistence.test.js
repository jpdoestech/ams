const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {database,asUser,ids,saveEmployee,browser}=require('./helpers');
let db;before(async()=>{db=await database()});after(()=>db?.close());
const fresh='21000000-0000-4000-8000-000000000001',sup='22000000-0000-4000-8000-000000000001';
const rpc=changes=>db.query('select save_employees($1::jsonb)',[JSON.stringify(changes)]);
const wage={effective_from:'2027-01-01',daily_rate:700,hrs_per_day:8,holiday_covered:true};

test('employee save permissions require active staff and prevent direct write bypasses',async()=>{
 for(const actor of [ids.viewer,ids.inactive])await asUser(db,actor,()=>assert.rejects(saveEmployee(db,{id:ids.emp,contact:'denied'}),/Staff access required/));
 await asUser(db,ids.staff,async()=>{
  await assert.rejects(db.query("update employees set contact='bypass' where id=$1",[ids.emp]),/permission denied/);
  await assert.rejects(db.query("insert into employees(emp_no,last_name) values('BYPASS','Bypass')"),/permission denied/);
 });
});
test('invalid wage rolls back employee, supervisors and audit; invalid relationship rolls back wage too',async()=>{
 await db.query("insert into supervisors(id,name) values($1,'Test supervisor')",[sup]);
 await db.query('insert into emp_supervisors values($1,$2)',[ids.emp,sup]);
 const original=(await db.query('select * from employees where id=$1',[ids.emp])).rows[0],audit=(await db.query('select count(*)::int n from audit_log')).rows[0].n;
 await asUser(db,ids.staff,()=>assert.rejects(saveEmployee(db,{id:ids.emp,contact:'0917-333-3333'},{pay:{...wage,daily_rate:-1},supervisor_ids:[]}),/check constraint/));
 assert.equal((await db.query('select contact from employees where id=$1',[ids.emp])).rows[0].contact,original.contact);
 assert.equal((await db.query('select count(*)::int n from audit_log')).rows[0].n,audit);
 assert.equal((await db.query('select * from emp_supervisors where emp_id=$1',[ids.emp])).rows.length,1);
 await asUser(db,ids.staff,()=>assert.rejects(saveEmployee(db,{id:ids.emp,contact:'0917-444-4444'},{pay:wage,supervisor_ids:[fresh]}),/foreign key/));
 assert.equal((await db.query("select * from wage_history where effective_from='2027-01-01'")).rows.length,0);
 assert.equal((await db.query('select * from emp_supervisors where emp_id=$1',[ids.emp])).rows.length,1);
});
test('successful save commits wages and supervisors; stale or missing revisions cannot overwrite it',async()=>{
 const revision=Number((await db.query('select revision from employees where id=$1',[ids.emp])).rows[0].revision);
 await asUser(db,ids.staff,()=>rpc([{employee:{id:ids.emp,contact:'0917-123-4567'},expected_revision:revision,pay:wage,supervisor_ids:[]}]));
 await asUser(db,ids.admin,()=>assert.rejects(rpc([{employee:{id:ids.emp,address:'Stale editor'},expected_revision:revision}]),/Employee changed/));
 await asUser(db,ids.staff,()=>assert.rejects(rpc([{employee:{id:ids.emp,address:'Missing revision'}}]),/expected revision required/));
 const employee=(await db.query('select * from employees where id=$1',[ids.emp])).rows[0];assert.equal(employee.contact,'0917-123-4567');assert.equal(employee.address,null);assert.ok(Number(employee.revision)>revision);
 assert.equal((await db.query('select * from emp_supervisors where emp_id=$1',[ids.emp])).rows.length,0);
 assert.equal(Number((await db.query("select daily_rate from wage_history where emp_id=$1 and effective_from='2027-01-01'",[ids.emp])).rows[0].daily_rate),700);
});
test('employee import batches roll back earlier rows when a later row fails',async()=>{
 await asUser(db,ids.staff,()=>assert.rejects(rpc([{employee:{id:fresh,emp_no:'ATOMIC-IMPORT',last_name:'Import'},expected_revision:null},{employee:{id:'21000000-0000-4000-8000-000000000002',emp_no:'INVALID'},expected_revision:null}]),/Last Name/));
 assert.equal((await db.query('select * from employees where id=$1',[fresh])).rows.length,0);
});
test('replacement schedule, wage, supervisors and source status commit together',async()=>{
 await db.query("insert into duty_blocks(emp_id,kind,t_start,t_end,sort) values($1,'break','12:00','13:00',0)",[ids.emp]);
 // Legacy baseline has no blocks; use the dated assignment API for the active setup.
 let source=(await db.query('select * from employees where id=$1',[ids.emp])).rows[0];
 const latest=(await db.query('select max(version_no) n from employee_assignment_versions where emp_id=$1',[ids.emp])).rows[0].n;
 const date=(await db.query("select (now() at time zone 'Asia/Manila')::date::text d")).rows[0].d;
 await asUser(db,ids.staff,()=>db.query("select save_assignment_version($1,$2,$3::jsonb,(select jsonb_agg(to_jsonb(b)) from duty_blocks b where emp_id=$1),'Replacement fixture',$4)",[ids.emp,date,JSON.stringify({time_in:source.time_in,time_out:source.time_out,rest_day:source.rest_day}),latest]));
 await asUser(db,ids.staff,()=>assert.rejects(rpc([{employee:{id:ids.emp,contact:'0917-999-9999'},expected_revision:Number(source.revision)}]),/Employee changed/));
 source=(await db.query('select * from employees where id=$1',[ids.emp])).rows[0];
 const employee={id:fresh,emp_no:'ATOMIC-REPLACEMENT',last_name:'Replacement',hire_type:'replacement',replaces_emp_id:ids.emp,date_hired:date};
 await asUser(db,ids.staff,()=>assert.rejects(rpc([{employee,expected_revision:null,source_revision:Number(source.revision)-1,replacement_status:'Inactive',pay:{...wage,effective_from:date},supervisor_ids:[sup]}]),/Replaced employee changed/));
 assert.equal((await db.query('select * from employees where id=$1',[fresh])).rows.length,0);
 await asUser(db,ids.staff,()=>rpc([{employee,expected_revision:null,source_revision:Number(source.revision),replacement_status:'Inactive',pay:{...wage,effective_from:date},supervisor_ids:[sup]}]));
 assert.equal((await db.query('select status from employees where id=$1',[ids.emp])).rows[0].status,'Inactive');
 assert.equal((await db.query('select * from emp_supervisors where emp_id=$1',[fresh])).rows.length,1);
 assert.equal((await db.query('select * from wage_history where emp_id=$1',[fresh])).rows.length,1);
 assert.equal((await db.query("select jsonb_array_length(snapshot->'blocks') n from employee_assignment_versions where emp_id=$1 order by effective_from desc,version_no desc limit 1",[fresh])).rows[0].n,1);
});
test('demo employee saves roll back validation and storage failures and reject stale drafts',async()=>{
 const dom=await browser(),w=dom.window;try{
  const original=w.eval('JSON.stringify(S)');
  await assert.rejects(w.eval(`saveEmployees([{employee:{id:E[0].id,contact:'0917-555-5555'},expected_revision:0,pay:{effective_from:'2027-01-01',daily_rate:-1,hrs_per_day:8,holiday_covered:true}}])`),/Invalid pay profile/);assert.equal(w.eval('JSON.stringify(S)'),original);
  w.eval(`globalThis.oldStorage=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('Quota')}`);
  await assert.rejects(w.eval(`saveEmployees([{employee:{id:E[0].id,contact:'0917-666-6666'},expected_revision:0}])`),/Quota/);assert.equal(w.eval('JSON.stringify(S)'),original);w.eval('Storage.prototype.setItem=oldStorage');
  await w.eval(`saveEmployees([{employee:{id:E[0].id,contact:'0917-123-4567'},expected_revision:0}])`);
  await assert.rejects(w.eval(`saveEmployees([{employee:{id:E[0].id,address:'Stale'},expected_revision:0}])`),/Employee changed/);assert.equal(w.eval('S.employees.find(e=>e.id===E[0].id).contact'),'0917-123-4567');
 }finally{w.close()}
});
