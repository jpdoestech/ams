const {test,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict');
const {browser}=require('./helpers');
let dom,w;
beforeEach(async()=>{dom=await browser();w=dom.window});afterEach(()=>dom.window.close());
function spy(){w.eval(`globalThis.originalList=API.list.bind(API);globalThis.loadCalls=[];globalThis.activeLoads=0;globalThis.peakLoads=0;API.list=async(t,r)=>{loadCalls.push(t);activeLoads++;peakLoads=Math.max(peakLoads,activeLoads);try{await new Promise(resolve=>setTimeout(resolve,5));return await originalList(t,r)}finally{activeLoads--}}`)}
test('workspace loads all datasets in parallel with a bounded request count',async()=>{
 spy();await w.eval('load()');assert.equal(w.eval('loadCalls.length'),19);assert.equal(w.eval('new Set(loadCalls).size'),19);assert.equal(w.eval('peakLoads'),6);assert.equal(w.eval('activeLoads'),0);
 assert.equal(w.eval('AMSLoadTiming.datasets'),19);assert.ok(w.eval('E.length>0'));
});
test('navigation reuses fresh data while refresh, expiry, role and range changes reload',async()=>{
 spy();await w.eval(`navigateWorkspace('emp');navigateWorkspace('std')`);assert.equal(w.eval('loadCalls.length'),0);
 await w.eval(`navigateWorkspace('std')`);assert.equal(w.eval('loadCalls.length'),19);
 w.eval('loadCalls=[];workspaceLoadedAt=Date.now()-16000');await w.eval('load({reuse:true})');assert.equal(w.eval('loadCalls.length'),19);
 w.eval(`loadCalls=[];ROLE='viewer'`);await w.eval('load({reuse:true})');assert.equal(w.eval('loadCalls.includes("wage_history")'),false);assert.equal(w.eval('Object.keys(EP).length'),0);
 w.eval(`loadCalls=[];cut.h=cut.h===1?2:1`);await w.eval('load({reuse:true})');assert.ok(w.eval('loadCalls.length>0'));
});
test('overlapping navigation loads share one request batch',async()=>{
 spy();await w.eval('Promise.all([load(),load({reuse:true}),load({reuse:true})])');assert.equal(w.eval('loadCalls.length'),19);
});
test('failed dataset loading leaves the previous workspace intact and can retry',async()=>{
 const before=w.eval('JSON.stringify([E,H,LK,A,PH])');w.eval(`globalThis.originalList=API.list.bind(API);S.employees.push({id:'not-yet-published',last_name:'New',first_name:'Employee'});API.list=async(t,r)=>{if(t==='lookups')throw Error('Network unavailable');return originalList(t,r)}`);
 await assert.rejects(w.eval('load()'),/Network unavailable/);assert.equal(w.eval('JSON.stringify([E,H,LK,A,PH])'),before);
 w.eval('API.list=originalList');await w.eval('load()');assert.ok(w.eval(`E.some(e=>e.id==='not-yet-published')`));
});
test('a stale response or sign-out cannot overwrite a newer workspace snapshot',async()=>{
 w.eval(`globalThis.originalList=API.list.bind(API);globalThis.employeeRequest=0;API.list=async(t,r)=>{const rows=await originalList(t,r);if(t==='employees'){employeeRequest++;if(employeeRequest===1)return new Promise(resolve=>{globalThis.releaseOldEmployees=()=>resolve(rows)});return [...rows,{id:'latest',last_name:'Latest',first_name:'Snapshot'}]}return rows}`);
 const early=w.eval('load()');await new Promise(r=>setTimeout(r,10));await w.eval('load()');w.eval('releaseOldEmployees()');await early;assert.ok(w.eval(`E.some(e=>e.id==='latest')`));
 w.eval(`employeeRequest=0`);const signedOutLoad=w.eval('load()');await new Promise(r=>setTimeout(r,10));w.eval('resetWorkspaceCache();E=[];releaseOldEmployees()');await signedOutLoad;assert.equal(w.eval('E.length'),0);
});
test('indexed history lookup preserves effective-date/version ordering and append invalidation',()=>{
 w.eval(`ASSIGNMENTS=Array.from({length:5000},(_,i)=>({emp_id:'employee-'+(i%250),effective_from:'2026-'+String(1+Math.floor(i/500)).padStart(2,'0')+'-01',version_no:i,snapshot:{employee:{}}}));ASSIGNMENTS.push({emp_id:'employee-1',effective_from:'2026-10-01',version_no:9000,snapshot:{employee:{site:'Latest'}}})`);
 for(const date of ['2025-12-31','2026-01-01','2026-05-15','2026-10-01','2027-01-01'])assert.equal(w.eval(`assignmentVersion('employee-1',${JSON.stringify(date)})?.version_no`),w.eval(`ASSIGNMENTS.filter(v=>v.emp_id==='employee-1'&&v.effective_from<=${JSON.stringify(date)}).sort((a,b)=>b.effective_from.localeCompare(a.effective_from)||b.version_no-a.version_no)[0]?.version_no`));
 w.eval(`ASSIGNMENTS.push({emp_id:'employee-1',effective_from:'2026-10-01',version_no:9001,snapshot:{employee:{site:'New'}}})`);assert.equal(w.eval(`assignmentVersion('employee-1','2026-10-02').version_no`),9001);
});
test('a Summary response cannot publish into a different page after rapid navigation',async()=>{
 w.eval(`globalThis.originalList=API.list.bind(API);globalThis.summaryReleases=[];API.list=(t,r)=>{if(['attendance','attendance_pay'].includes(t))return new Promise(resolve=>summaryReleases.push(async()=>resolve(await originalList(t,r))));return originalList(t,r)};V='sum';shell()`);
 await new Promise(r=>setTimeout(r,10));const before=w.eval('JSON.stringify([SD,SAP,SP])');w.eval(`V='emp';shell();summaryReleases.forEach(release=>release())`);await new Promise(r=>setTimeout(r,10));assert.ok(w.document.getElementById('emt'));assert.equal(w.eval('JSON.stringify([SD,SAP,SP])'),before);
});
