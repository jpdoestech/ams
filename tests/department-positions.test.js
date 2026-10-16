const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {database,asUser,ids,saveEmployee}=require('./helpers');let db;
before(async()=>{db=await database();await db.exec("insert into lookups(id,kind,value) values ('80000000-0000-4000-8000-000000000001','department','Operations'),('80000000-0000-4000-8000-000000000002','position','Coordinator'),('80000000-0000-4000-8000-000000000003','department','Finance')")});after(async()=>{await db?.close()});
const department='80000000-0000-4000-8000-000000000001',position='80000000-0000-4000-8000-000000000002';
test('staff can map positions, viewers cannot change mappings, and lookup kinds are checked',async()=>{
 await asUser(db,ids.viewer,()=>assert.rejects(db.query('insert into department_positions values($1,$2)',[department,position]),/row-level security/));
 await asUser(db,ids.staff,()=>db.query('insert into department_positions values($1,$2)',[department,position]));
 await asUser(db,ids.staff,()=>assert.rejects(db.query('insert into department_positions values($1,$2)',[position,department]),/Choose a department and a position/));
 await asUser(db,ids.viewer,async()=>assert.equal((await db.query('select * from department_positions')).rows.length,1));
});
test('employee mutations enforce department membership without losing existing data',async()=>{
 await asUser(db,ids.staff,()=>saveEmployee(db,{id:ids.emp,department:'Operations',position:'Coordinator'}));
 await asUser(db,ids.staff,()=>assert.rejects(saveEmployee(db,{id:ids.emp,department:'Finance'}),/Position must belong/));
 assert.equal((await db.query('select department from employees where id=$1',[ids.emp])).rows[0].department,'Operations');
 await asUser(db,ids.staff,()=>saveEmployee(db,{id:ids.emp,contact:'unchanged assignment'}));
});
test('migration backfills legacy assignments without rewriting employee values',async()=>{
 const fs=require('node:fs');
 await db.exec("alter table employees disable trigger check_employee_department_position;insert into employees(id,emp_no,last_name,department,position) values('90000000-0000-4000-8000-000000000001','LEGACY','Legacy','Legacy department','Legacy position');alter table employees enable trigger check_employee_department_position");
 await db.exec(fs.readFileSync('supabase/migrations/007_department_positions.sql','utf8'));
 const rows=(await db.query("select d.value department,p.value position from department_positions m join lookups d on d.id=m.department_id join lookups p on p.id=m.position_id where d.value='Legacy department'")).rows;
 assert.deepEqual(rows,[{department:'Legacy department',position:'Legacy position'}]);
 assert.equal((await db.query("select position from employees where emp_no='LEGACY'")).rows[0].position,'Legacy position');
});
