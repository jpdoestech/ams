const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const sync=require('../api/sync');
const config=require('../api/config');
const originalFetch=global.fetch,originalEnv={...process.env};
afterEach(()=>{global.fetch=originalFetch;process.env={...originalEnv}});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(body){this.body=body;return this},send(body){this.body=body;return this}});
const setup=()=>Object.assign(process.env,{SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public-anon',GOOGLE_SERVICE_ACCOUNT_EMAIL:'sync@test.iam.gserviceaccount.com',GOOGLE_PRIVATE_KEY:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}),GOOGLE_SHEET_ID:'test-sheet'});
test('public runtime config excludes Google secrets',()=>{setup();const res=response();config({},res);assert.match(res.body,/public-anon/);assert.doesNotMatch(res.body,/PRIVATE KEY|sync@test/)});
test('sync rejects missing JWT and invalid period before external requests',async()=>{
 global.fetch=()=>{throw Error('Should not fetch')};let res=response();await sync({method:'POST',headers:{},body:{}},res);assert.equal(res.statusCode,401);
 res=response();await sync({method:'POST',headers:{authorization:'Bearer test'},body:{start:'2026-02-30',end:'2026-03-01'}},res);assert.equal(res.statusCode,400);
});
test('viewer cannot sync data',async()=>{
 setup();global.fetch=async url=>({ok:true,json:async()=>String(url).includes('/auth/')?{id:'viewer'}:[{active:true,role:'viewer'}]});
 const res=response();await sync({method:'POST',headers:{authorization:'Bearer test'},body:{start:'2026-10-01',end:'2026-10-15'}},res);assert.equal(res.statusCode,403);
});
test('confirmed sync reads Supabase with caller JWT and writes atomic Google batch',async()=>{
 setup();const calls=[];
 global.fetch=async(url,options={})=>{
  url=String(url);calls.push({url,options});let body;
  if(url.includes('/auth/v1/user'))body={id:'staff',email:'staff@test.local'};
  else if(url.includes('/profiles?'))body=[{active:true,role:'staff'}];
  else if(url.includes('/employees?'))body=[{id:'e1',emp_no:'E1',last_name:'=IMPORTXML("bad")'}];
  else if(url.includes('/field_defs?'))body=[];
  else if(url.includes('/attendance_pay?'))body=[];
  else if(url.includes('/attendance?'))body=[{emp_id:'e1',date:'2026-10-01',type:'ABSENT'}];
  else if(url.includes('oauth2.googleapis.com'))body={access_token:'google-token'};
  else if(url.includes(':batchUpdate'))body={replies:[]};
  else if(url.includes('sheets.googleapis.com'))body={sheets:[]};else throw Error('Unexpected request '+url);
  return{ok:true,status:200,json:async()=>body};
 };
 const res=response();await sync({method:'POST',headers:{authorization:'Bearer user-jwt'},body:{start:'2026-10-01',end:'2026-10-15'}},res);
 assert.equal(res.statusCode,200);assert.equal(res.body.attendance,1);
 assert.ok(calls.filter(c=>c.url.includes('supabase.co')).every(c=>c.options.headers.Authorization==='Bearer user-jwt'));
 const batches=calls.filter(c=>c.url.includes(':batchUpdate'));assert.equal(batches.length,1);
 const body=JSON.parse(batches[0].options.body);assert.equal(body.requests.filter(r=>r.updateCells).length,4);
 assert.match(batches[0].options.body,/stringValue/);assert.doesNotMatch(batches[0].options.body,/formulaValue/);
});
test('expired authentication never reports sync success',async()=>{
 setup();global.fetch=async url=>String(url).includes('/auth/')?{ok:false}:null;
 const res=response();await sync({method:'POST',headers:{authorization:'Bearer expired'},body:{start:'2026-10-01',end:'2026-10-15'}},res);assert.equal(res.statusCode,401);
});
test('Google token failure returns an error, not sync success',async()=>{
 setup();global.fetch=async url=>{
  url=String(url);if(url.includes('oauth2.googleapis.com'))return{ok:false,status:403,json:async()=>({error:'denied'})};
  return{ok:true,status:200,json:async()=>url.includes('/auth/')?{id:'staff'}:url.includes('/profiles?')?[{active:true,role:'staff'}]:[]};
 };
 const res=response();await sync({method:'POST',headers:{authorization:'Bearer test'},body:{start:'2026-10-01',end:'2026-10-15'}},res);assert.equal(res.statusCode,502);assert.ok(res.body.error);assert.equal(res.body.attendance,undefined);
});
