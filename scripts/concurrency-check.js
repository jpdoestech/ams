/* Real PostgreSQL multi-connection checks. Requires a fresh, disposable LOCAL test database. */
const {Client,types}=require('pg'),fs=require('node:fs'),assert=require('node:assert/strict');
types.setTypeParser(1082,value=>value);
const url=process.env.AMS_TEST_DATABASE_URL;
const ids={admin:'00000000-0000-4000-8000-000000000001',a:'00000000-0000-4000-8000-000000000002',b:'00000000-0000-4000-8000-000000000003',e1:'10000000-0000-4000-8000-000000000001',e2:'10000000-0000-4000-8000-000000000002'};
async function run(){
 if(!url)throw Error('Set AMS_TEST_DATABASE_URL to a fresh local ams_concurrency_test database');
 const target=new URL(url);if(!['localhost','127.0.0.1'].includes(target.hostname)||target.pathname!=='/ams_concurrency_test')throw Error('Concurrency tests require the dedicated local ams_concurrency_test database');
 const connections=[],connect=async id=>{const c=new Client({connectionString:url});await c.connect();connections.push(c);if(id){await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[id])}return c};
 try{
  const owner=await connect();if((await owner.query("select 1 from pg_tables where schemaname in ('public','auth') limit 1")).rowCount)throw Error('Test database must be empty; no existing tables will be removed');
  await owner.query(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);
   alter default privileges in schema public grant execute on functions to anon,authenticated;alter default privileges in schema public grant all on tables to anon,authenticated;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of fs.readdirSync('supabase/migrations').sort())await owner.query(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await owner.query(`insert into auth.users values('${ids.admin}','admin@test'),('${ids.a}','a@test'),('${ids.b}','b@test');update profiles set active=true,role=case when id='${ids.admin}' then 'superadmin' else 'staff' end;
   insert into employees(id,emp_no,last_name,date_hired) values('${ids.e1}','E1','One','2026-01-01'),('${ids.e2}','E2','Two','2026-01-01');
   insert into wage_history(emp_id,effective_from,daily_rate) values('${ids.e1}','2026-01-01',610),('${ids.e2}','2026-01-01',610);`);
  const a=await connect(ids.a),b=await connect(ids.b),admin=await connect(ids.admin);await b.query("set statement_timeout='4s'");await admin.query("set statement_timeout='4s'");
  const change=(emp,date,revision=null,row={type:'ABSENT'})=>({emp_id:emp,date,expected_revision:revision,row});
  const save=(c,rows,overwrite=false)=>c.query('select save_attendance_batch($1,$2)',[JSON.stringify(rows),overwrite]);
  await a.query('begin');await save(a,[change(ids.e1,'2027-07-01')]);await save(b,[change(ids.e2,'2027-07-01')]);await a.query('commit');
  console.log('PASS different employees save concurrently while another transaction remains open');
  const expectWaiting=async c=>{for(let n=0;n<100;n++){const r=await owner.query('select wait_event from pg_stat_activity where pid=$1',[c.processID]);if(r.rows[0]?.wait_event==='advisory')return;await new Promise(r=>setTimeout(r,10))}throw Error('Expected advisory lock wait')};
  await a.query('begin');await save(a,[change(ids.e1,'2027-07-02')]);const same=save(b,[change(ids.e1,'2027-07-02')]).then(()=>null,e=>e);await expectWaiting(b);await a.query('commit');assert.match((await same)?.message||'',/Attendance changed/);
  console.log('PASS same-entry concurrent insert waits and rejects the stale revision');
  await a.query('begin');await save(a,[change(ids.e1,'2027-07-03')]);const closing=admin.query("select finalize_cutoff('2027-07-03','2027-07-03')").then(()=>null,e=>e);await expectWaiting(admin);await a.query('commit');assert.match((await closing)?.message||'',/Unapproved/);
  console.log('PASS finalization waits for active writes and checks the committed approval state');
  await save(a,[change(ids.e1,'2027-07-04'),change(ids.e2,'2027-07-04')]);let rows=(await owner.query("select * from attendance where date='2027-07-04'")).rows;
  await a.query("select review_attendance($1,'submit','')",[JSON.stringify(rows)]);rows=(await owner.query("select * from attendance where date='2027-07-04'")).rows;
  await admin.query("select review_attendance($1,'approve','Verified')",[JSON.stringify(rows)]);await admin.query("select finalize_cutoff('2027-07-04','2027-07-04')");
  const old=(await owner.query("select * from attendance where emp_id=$1 and date='2027-07-03'",[ids.e1])).rows[0];await assert.rejects(save(b,[change(ids.e1,'2027-07-03',old.revision,{type:'PRESENT',time_in:'20:00',time_out:'04:00',break_min:0})]),/locked/);
  assert.equal((await owner.query("select type from attendance where emp_id=$1 and date='2027-07-03'",[ids.e1])).rows[0].type,'ABSENT');
  console.log('PASS finalized overnight dates remain protected and failed saves roll back');
  const batch=[change(ids.e2,'2027-07-06'),change(ids.e1,'2027-07-07')];await a.query('begin');await save(a,batch);const reverse=save(b,[...batch].reverse()).then(()=>null,e=>e);await expectWaiting(b);await a.query('commit');assert.match((await reverse)?.message||'',/Attendance changed/);
  console.log('PASS overlapping reverse-order batches serialize without deadlocks');
  const {randomUUID}=require('node:crypto'),actors=Array.from({length:12},(_,i)=>({user:randomUUID(),emp:randomUUID(),number:i}));
  for(const actor of actors){await owner.query('insert into auth.users(id,email) values($1,$2)',[actor.user,'parallel-'+actor.number+'@test']);await owner.query("update profiles set role='staff',active=true where id=$1",[actor.user]);await owner.query("insert into employees(id,emp_no,last_name,date_hired) values($1,$2,'Concurrent','2027-07-08')",[actor.emp,'PARALLEL-'+actor.number])}
  const clients=await Promise.all(actors.map(actor=>connect(actor.user)));
  await Promise.all(clients.map((c,i)=>save(c,[change(actors[i].emp,'2027-07-08')])));
  assert.equal((await owner.query("select count(*)::int as n from attendance where date='2027-07-08'")).rows[0].n,12);
  const snapshots=await Promise.all(clients.map(c=>c.query("select workspace_snapshot('2027-07-08','2027-07-15') as data")));
  const checks=await Promise.all(clients.map((c,i)=>c.query("select workspace_snapshot('2027-07-08','2027-07-15',$1,$2) as data",[snapshots[i].rows[0].data.catalog_token,snapshots[i].rows[0].data.period_tokens])));
  for(const check of checks){assert.equal(check.rows[0].data.catalog,null);assert.equal(check.rows[0].data.period,null);assert.ok(JSON.stringify(check.rows[0].data).length<200)}
  console.log('PASS 12 independent authenticated users save and refresh concurrently in the local integration fixture');
 }finally{for(const c of connections)await c.query('rollback').catch(()=>{});await Promise.all(connections.map(c=>c.end()))}
}
run().catch(error=>{console.error(error.message);process.exitCode=1});
