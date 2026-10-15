/* Reproducible synthetic read benchmark; never connects to the production database. */
const {database,asUser,ids}=require('../tests/helpers');
async function run(){
 const employees=Number(process.argv[2]||500);if(!Number.isInteger(employees)||employees<2||employees>2000)throw Error('Choose 2–2000 synthetic employees');
 const db=await database();
 try{
  await db.exec(`update audit_settings set enabled=false where id=1;insert into employees(emp_no,last_name,date_hired) select 'BENCH-'||i,'Synthetic '||i,'2026-01-01' from generate_series(2,${employees}) i;
   insert into attendance(emp_id,date,type,revision) select e.id,d::date,'ABSENT',nextval('attendance_revision_seq') from employees e cross join generate_series('2027-08-01'::date,'2027-08-15'::date,'1 day') d;`);
  const fetch=async known=>asUser(db,ids.staff,async()=>{const start=performance.now();const result=(await db.query("select workspace_snapshot('2027-08-01','2027-08-15',$1,$2) as data",[known?.catalog_token||null,known?.period_tokens||null])).rows[0].data;return{data:result,ms:Math.round(performance.now()-start),bytes:Buffer.byteLength(JSON.stringify(result))}});
  const first=await fetch(),unchanged=await fetch(first.data);
  const row=(await db.query("select * from attendance where emp_id=$1 and date='2027-08-01'",[ids.emp])).rows[0];await asUser(db,ids.staff,()=>db.query('select save_attendance_batch($1)',[JSON.stringify([{emp_id:ids.emp,date:row.date,expected_revision:row.revision,row:{type:'LEAVE'}}])]));
  const delta=await fetch(first.data);
  console.log(JSON.stringify({model:'Synthetic fixture in local PostgreSQL-WASM; no production/network load claim',employees,days:15,attendanceRows:employees*15,first:{bytes:first.bytes,localQueryMs:first.ms},unchanged:{bytes:unchanged.bytes,localQueryMs:unchanged.ms},oneEmployeeChanged:{bytes:delta.bytes,localQueryMs:delta.ms,returnedAttendanceRows:delta.data.period.attendance.length},unchangedPayloadReductionPercent:Number((100*(1-unchanged.bytes/first.bytes)).toFixed(4))},null,2));
 }finally{await db.close()}
}
run().catch(error=>{console.error(error.message);process.exitCode=1});
