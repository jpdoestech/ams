const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {database,asUser,ids}=require('./helpers');let db;
before(async()=>{db=await database()});after(async()=>{await db?.close()});
test('only active superadmins can read or update audit settings and read audit history',async()=>{
 for(const id of [ids.staff,ids.viewer,ids.inactive])await asUser(db,id,async()=>{
  assert.equal((await db.query('select * from audit_settings')).rows.length,0);
  assert.equal((await db.query('select * from audit_log')).rows.length,0);
  assert.equal((await db.query('update audit_settings set enabled=false returning id')).rows.length,0);
 });
 assert.equal((await db.query('select enabled from audit_settings')).rows[0].enabled,true);
 await asUser(db,ids.admin,async()=>assert.equal((await db.query('select * from audit_settings')).rows.length,1));
});
test('disabled and selective auditing is enforced by database triggers; settings changes retain a trace',async()=>{
 const count=async action=>(await db.query('select count(*)::int n from audit_log where action=$1',[action])).rows[0].n;
 const before=await count('employees.update');
 await asUser(db,ids.admin,()=>db.exec('update audit_settings set enabled=false where id=1'));
 await asUser(db,ids.staff,()=>db.exec(`update employees set contact='disabled audit' where id='${ids.emp}'`));
 assert.equal(await count('employees.update'),before);assert.equal(await count('audit_settings.update'),1);
 await asUser(db,ids.admin,()=>db.exec("update audit_settings set enabled=true,scopes=array['employees'] where id=1"));
 await asUser(db,ids.staff,()=>db.exec(`update employees set contact='enabled audit' where id='${ids.emp}'`));
 assert.equal(await count('employees.update'),before+1);
 const comments=await count('attendance_comments.insert');
 await asUser(db,ids.viewer,()=>db.exec(`insert into attendance_comments(emp_id,date,body,author_email) values('${ids.emp}','2026-10-01','Saved by viewer','viewer@test.local')`));
 assert.equal(await count('attendance_comments.insert'),comments);
 await asUser(db,ids.admin,()=>db.exec("update audit_settings set scopes=array['comments'] where id=1"));
 await asUser(db,ids.viewer,()=>db.exec(`insert into attendance_comments(emp_id,date,body,author_email) values('${ids.emp}','2026-10-02','Audited viewer comment','viewer@test.local')`));
 assert.equal(await count('attendance_comments.insert'),comments+1);
 assert.equal((await db.query("select user_email from audit_log where action='attendance_comments.insert' order by at desc limit 1")).rows[0].user_email,'viewer@test.local');
 await asUser(db,ids.admin,async()=>{await assert.rejects(db.exec("update audit_settings set scopes=array['invalid'] where id=1"),/check constraint/)});
});
test('viewer comments persist with author protection and cannot alter attendance',async()=>{
 await asUser(db,ids.viewer,async()=>{
  const comments=(await db.query('select body from attendance_comments order by date')).rows;assert.equal(comments.length,2);
  await assert.rejects(db.exec(`insert into attendance_comments(emp_id,date,body,author_email) values('${ids.emp}','2026-10-03','Forged','admin@test.local')`),/row-level security/);
  await assert.rejects(db.exec(`insert into attendance(emp_id,date,type) values('${ids.emp}','2026-10-03','ABSENT')`),/permission denied/);
 });
});
