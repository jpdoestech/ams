const {test,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict');
const {browser}=require('./helpers');let dom,w,requests,responses,client;
beforeEach(async()=>{
 requests=[];responses=[];
 client={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({})},rpc:async(name,args)=>{requests.push({name,args});return responses.shift()||{error:{code:'TEST',message:'No test response'}}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'reader',role:'viewer',active:false}})})})})};
 dom=await browser({supabaseClient:client});w=dom.window;w.eval(`ROLE='staff';P={id:'reader',email:'reader@demo',active:true};user={id:'reader'};`);
});afterEach(()=>dom.window.close());
function full(){const catalog=w.eval('Object.fromEntries(catalogTables.map(t=>[t,S[t]]))'),employees=catalog.employees.slice(0,2).map(e=>e.id);return{role:'staff',catalog_token:'staff:1',catalog,period_tokens:Object.fromEntries(employees.map(id=>[id,'initial'])),period:{replace:true,employees,attendance:employees.map(emp_id=>({emp_id,date:'2027-04-01',type:'ABSENT',revision:1})),attendance_comments:[],attendance_pay:[],cutoff_snapshot_view:[]}}}
test('hosted loading uses one RPC, omits unchanged data, and merges only the changed employee',async()=>{
 const first=full();w.eval(`cut={m:'2027-04',h:1}`);responses.push({data:first});await w.eval('load()');assert.equal(requests.length,1);assert.equal(requests[0].name,'workspace_snapshot');assert.equal(w.eval('AMSLoadTiming.requests'),1);
 responses.push({data:{...first,catalog:null,period:null}});await w.eval('load()');assert.equal(requests.length,2);assert.equal(requests[1].args.p_catalog_token,'staff:1');assert.equal(w.eval('Object.keys(A).length'),2);
 const id=first.period.employees[0];responses.push({data:{...first,catalog:null,period_tokens:{...first.period_tokens,[id]:'new'},period:{replace:false,employees:[id],attendance:[{emp_id:id,date:'2027-04-02',type:'LEAVE',revision:2}],attendance_comments:[],attendance_pay:[],cutoff_snapshot_view:[]}}});await w.eval('load()');assert.equal(w.eval('Object.keys(A).length'),2);assert.equal(w.eval(`A['${id}|2027-04-01']`),undefined);assert.equal(w.eval(`A['${id}|2027-04-02'].type`),'LEAVE');
});
test('deleted employee rows are removed and a role downgrade clears cached wage data',async()=>{
 const first=full(),id=first.period.employees[0];first.catalog.wage_history=[{id:'wage',emp_id:id,effective_from:'2020-01-01',daily_rate:999}];responses.push({data:first});await w.eval('load()');assert.equal(w.eval('PH.length'),1);
 responses.push({data:{...first,catalog:null,period_tokens:{[first.period.employees[1]]:'initial'},period:{replace:false,employees:[id],attendance:[],attendance_comments:[],attendance_pay:[],cutoff_snapshot_view:[]}}});await w.eval('load()');assert.equal(w.eval('Object.keys(A).length'),1);
 const viewer={...full(),role:'viewer',catalog_token:'viewer:1'};viewer.catalog.wage_history=[];viewer.catalog.employee_pay=[];responses.push({data:viewer});await w.eval('load()');assert.equal(w.eval('ROLE'),'viewer');assert.equal(w.eval('PH.length'),0);assert.equal(w.eval('Object.keys(EP).length'),0);
});
test('missing migration falls back once; authorization failures never fall back',async()=>{
 responses.push({error:{code:'PGRST202',message:'Function missing'}});w.eval('API.list=async(t,r)=>S[t].filter(x=>!r||(x.date>=r[0]&&x.date<=r[1]))');await w.eval('load()');await w.eval('load()');assert.equal(requests.length,1);assert.ok(w.eval('E.length>0'));
 w.eval('workspaceRpcUnavailable=false');responses.push({error:{code:'42501',message:'Active workspace access required'}});await assert.rejects(w.eval('load()'),error=>/Active workspace/.test(error.message));assert.equal(w.eval('E.length'),0);assert.equal(w.eval('workspaceSnapshotCache'),null);assert.match(w.document.getElementById('app').textContent,/Awaiting access/);
});
test('failed or deferred refresh cannot advance delta tokens or overwrite an open editor',async()=>{
 const first=full();responses.push({data:first});await w.eval('load()');const before=w.eval('JSON.stringify([E,A,workspaceSnapshotCache.periodTokens])');
 responses.push({error:{code:'NETWORK',message:'Network failure'}});await assert.rejects(w.eval('load()'),error=>/Network failure/.test(error.message));assert.equal(w.eval('JSON.stringify([E,A,workspaceSnapshotCache.periodTokens])'),before);
 w.eval(`workspaceCanRefresh=()=>false`);responses.push({data:{...first,catalog:null,period_tokens:{changed:'new'},period:{replace:true,employees:[],attendance:[],attendance_comments:[],attendance_pay:[],cutoff_snapshot_view:[]}}});await w.eval('load({background:true})');assert.equal(w.eval('JSON.stringify([E,A,workspaceSnapshotCache.periodTokens])'),before);
});
test('a different period never sends the previous period tokens',async()=>{
 const first=full();responses.push({data:first});await w.eval('load()');w.eval('cut.h=cut.h===1?2:1');responses.push({data:{...first,catalog:null,period_tokens:{},period:{replace:true,employees:[],attendance:[],attendance_comments:[],attendance_pay:[],cutoff_snapshot_view:[]}}});await w.eval('load()');assert.equal(requests[1].args.p_period_tokens,null);assert.equal(requests[1].args.p_catalog_token,'staff:1');assert.equal(w.eval('Object.keys(A).length'),0);
});
test('shared refresh pauses for hidden tabs, dialogs, controls, saves, and missing migrations',async()=>{
 responses.push({data:full()});await w.eval('load()');w.eval(`V='att';shell();document.getElementById('mn').focus();Object.defineProperty(document,'hidden',{configurable:true,value:false})`);assert.equal(w.eval('workspaceCanRefresh()'),true);
 w.eval(`modal('<h3>Editor</h3><input>')`);assert.equal(w.eval('workspaceCanRefresh()'),false);w.eval(`closeM();document.getElementById('mn').focus();attendanceSaving=true`);assert.equal(w.eval('workspaceCanRefresh()'),false);
 w.eval(`attendanceSaving=false;document.getElementById('fq').focus()`);assert.equal(w.eval('workspaceCanRefresh()'),false);w.eval(`document.getElementById('mn').focus();workspaceRpcUnavailable=true`);assert.equal(w.eval('workspaceCanRefresh()'),false);
 w.eval(`workspaceRpcUnavailable=false;Object.defineProperty(document,'hidden',{configurable:true,value:true})`);assert.equal(w.eval('workspaceCanRefresh()'),false);
});
