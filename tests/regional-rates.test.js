const {test}=require('node:test'),assert=require('node:assert/strict');
const {database,asUser,ids}=require('./helpers');
test('regional defaults preserve existing wages and reject invalid rates in storage',async()=>{
 const db=await database();try{
  const employee=(await db.query('select region,rate_override from employees where id=$1',[ids.emp])).rows[0];assert.equal(employee.region,null);assert.equal(employee.rate_override,true);
  await asUser(db,ids.staff,()=>db.query("insert into lookups(kind,value,daily_rate) values('region','Test Region',525)"));
  for(const rate of [-1,'NaN','Infinity'])await assert.rejects(db.query("insert into lookups(kind,value,daily_rate) values('region','Invalid',$1)",[rate]),/lookup_daily_rate_valid/);
  await assert.rejects(db.query("insert into lookups(kind,value,daily_rate) values('city','Invalid',525)"),/lookup_daily_rate_valid/);
  assert.equal(Number((await db.query('select daily_rate from wage_history where emp_id=$1',[ids.emp])).rows[0].daily_rate),610);
 }finally{await db.close()}
});
