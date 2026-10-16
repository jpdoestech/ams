const {test}=require('node:test'),assert=require('node:assert/strict');
const {browser,database,asUser,ids,saveEmployee}=require('./helpers');
test('contact inputs format 11 digits, reject invalid numbers, and retain optional blanks',async()=>{
 const dom=await browser(),w=dom.window,d=w.document;try{
  w.eval('eform()');const input=d.querySelector('#f_contact');input.value='0917123456789';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(input.value,'0917-123-4567');assert.equal(input.maxLength,13);assert.equal(input.type,'tel');
  assert.equal(w.eval(`contactValue('09171234567')`),'0917-123-4567');assert.equal(w.eval(`contactValue('')`),null);
  for(const value of ['08171234567','0917123456','091712345678','09ab1234567'])assert.throws(()=>w.eval(`contactValue(${JSON.stringify(value)})`),/11 digits/);
  w.eval('supM()');assert.ok(d.querySelector('#sc[data-contact]'));
 }finally{await new Promise(r=>setTimeout(r,10));w.close()}
});
test('employee and supervisor contacts are validated and formatted at the database boundary',async()=>{
 const db=await database();try{
  await asUser(db,ids.staff,()=>saveEmployee(db,{id:ids.emp,contact:'09171234567'}));assert.equal((await db.query('select contact from employees where id=$1',[ids.emp])).rows[0].contact,'0917-123-4567');
  for(const value of ['08171234567','0917123456','091712345678','0917---1234567'])await asUser(db,ids.staff,()=>assert.rejects(saveEmployee(db,{id:ids.emp,contact:value}),/11 digits/));
  await asUser(db,ids.staff,()=>db.query("insert into supervisors(name,contact) values('Test','09281234567')"));assert.equal((await db.query("select contact from supervisors where name='Test'")).rows[0].contact,'0928-123-4567');
  await asUser(db,ids.staff,()=>assert.rejects(db.query("insert into supervisors(name,contact) values('Invalid','123')"),/11 digits/));
  await asUser(db,ids.staff,()=>saveEmployee(db,{id:ids.emp,contact:''}));assert.equal((await db.query('select contact from employees where id=$1',[ids.emp])).rows[0].contact,null);
  await db.exec("alter table employees disable trigger normalize_contact");await db.query("update employees set contact='Legacy extension 4' where id=$1",[ids.emp]);await db.exec("alter table employees enable trigger normalize_contact");
  await asUser(db,ids.staff,()=>saveEmployee(db,{id:ids.emp,last_name:'Legacy preserved'}));assert.equal((await db.query('select contact from employees where id=$1',[ids.emp])).rows[0].contact,'Legacy extension 4');

 }finally{await db.close()}
});
