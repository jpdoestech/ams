const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {JSDOM}=require('jsdom');
const vm=require('node:vm');
const ids={admin:'00000000-0000-4000-8000-000000000001',staff:'00000000-0000-4000-8000-000000000002',viewer:'00000000-0000-4000-8000-000000000003',inactive:'00000000-0000-4000-8000-000000000004',emp:'10000000-0000-4000-8000-000000000001'};
async function database(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text);
 alter default privileges in schema public grant execute on functions to anon,authenticated;
 alter default privileges in schema public grant all on tables to anon,authenticated;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 for(const file of fs.readdirSync('supabase/migrations').sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec(`insert into auth.users values('${ids.admin}','admin@test.local'),('${ids.staff}','staff@test.local'),('${ids.viewer}','viewer@test.local'),('${ids.inactive}','inactive@test.local');
 update profiles set role='superadmin',active=true where id='${ids.admin}';update profiles set role='staff',active=true where id='${ids.staff}';update profiles set active=true where id='${ids.viewer}';
 insert into employees(id,emp_no,last_name,first_name,date_hired,rest_day,location) values('${ids.emp}','E-TEST','Test','Employee','2026-01-01','Sun','Manila');
 insert into wage_history(emp_id,effective_from,daily_rate,hrs_per_day,holiday_covered) values('${ids.emp}','2026-01-01',610,8,true);`);
 return db;
}
async function asUser(db,id,fn){
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
 try{return await fn()}finally{await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false)`)}
}
async function saveEmployee(db,employee,extra={}){
 const row=(await db.query('select revision from employees where id=$1',[employee.id])).rows[0];
 return db.query('select save_employees($1::jsonb)',[JSON.stringify([{employee,expected_revision:row?Number(row.revision):null,...extra}])]);
}
async function browser({supabaseClient}={}){
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://ams.test',runScripts:'outside-only'});
 dom.window.confirm=()=>true;dom.window.alert=()=>{};
 dom.window.structuredClone=structuredClone;
 if(supabaseClient){dom.window.AMS_CONFIG={URL:'https://test.supabase.co',KEY:'public'};dom.window.supabase={createClient:()=>supabaseClient}}
 for(const file of ['theme.js','layout.js','cutoff-schedules.js','duty-engine.js','ui.js','confirm-dialog.js','data-tools.js','attendance-xlsx.js','analytics.js','analytics-charts.js','ui-workflows.js','address-data.js','address-catalog.js','workspace-features.js','operations.js','workspace-data.js','data-indexes.js','supabase-client.js','app.js'])new vm.Script(fs.readFileSync('assets/'+file,'utf8')).runInContext(dom.getInternalVMContext());
 dom.window.eval=code=>new vm.Script(code).runInContext(dom.getInternalVMContext());
 // Global lexical declarations remain visible to later script evaluations.
 await new Promise(resolve=>setTimeout(resolve,50));
 return dom;
}
module.exports={database,asUser,browser,ids,saveEmployee};
