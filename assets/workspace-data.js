/* Bounded parallel loading with atomic publication and brief navigation reuse. */
let workspaceLoadGeneration=0,workspaceLoadedAt=0,workspaceLoadedKey='',workspaceInFlight=null,workspaceNavigation=0;
let workspaceSnapshotCache=null,workspaceRpcUnavailable=false;
const workspaceDataKey=()=>JSON.stringify([ROLE,P?.id||'',...rng()]);
const workspaceCatalogKey=()=>JSON.stringify([ROLE,P?.id||'']);
function resetWorkspaceCache(){workspaceLoadGeneration++;workspaceLoadedAt=0;workspaceLoadedKey='';workspaceInFlight=null;workspaceSnapshotCache=null;workspaceNavigation++}
const catalogTables=['employee_assignment_versions','employees','holidays','field_defs','lookups','department_positions','stores','supervisors','supervisor_stores','emp_supervisors','duty_blocks','duty_pay_rules','cutoff_locks','wage_history','employee_pay','cutoff_schedules'];
const periodTables=['attendance','attendance_comments','attendance_pay','cutoff_snapshot_view'];
async function workspaceTransport(range,full){
 if(DEMO||workspaceRpcUnavailable)return null;
 const base=workspaceSnapshotCache,catalogKnown=base?.catalogKey===workspaceCatalogKey(),periodKnown=base?.periodKey===workspaceDataKey();
 const {data,error}=await sb.rpc('workspace_snapshot',{p_start:range[0],p_end:range[1],p_catalog_token:catalogKnown?base.catalogToken:null,p_period_tokens:periodKnown?base.periodTokens:null,p_force:full});
 if(error){
  if(['PGRST202','42883'].includes(error.code)){workspaceRpcUnavailable=true;return null}
  if(error.code==='42501'){resetWorkspaceCache();PH=[];EP={};AP={};SAP=[];SD=[];CLOSED=[];ASSIGNMENTS=[];E=[];A={};CM=[];employeeDraft=null;closeM();$('ov').replaceChildren();await loadP();shell()}
  throw error;
 }
 return{payload:data,base,catalogKnown,periodKnown};
}
function unpackWorkspaceSnapshot({payload,base,catalogKnown,periodKnown}){
 if(!payload||!['viewer','staff','superadmin'].includes(payload.role))throw Error('Invalid workspace response');
 const catalog=payload.catalog||(catalogKnown?base.catalog:null);if(!catalog)throw Error('Workspace catalog unavailable');
 const period=Object.fromEntries(periodTables.map(table=>[table,periodKnown?base.period[table]:[]]));
 let tokens=periodKnown?{...base.periodTokens}:{};
 if(payload.period){const changed=new Set(payload.period.employees);if(payload.period.replace)tokens={};for(const id of changed)delete tokens[id];Object.assign(tokens,payload.period_tokens||{});for(const table of periodTables){if(!Array.isArray(payload.period[table]))throw Error('Invalid workspace dataset');period[table]=[...(payload.period.replace?[]:period[table].filter(r=>!changed.has(r.emp_id))),...payload.period[table]]}}
 else if(!periodKnown)throw Error('Workspace period unavailable');
 for(const table of catalogTables)if(!Array.isArray(catalog[table]))throw Error('Invalid workspace catalog');
 return{data:{...catalog,...period},catalog,period,tokens,payload,changed:!!payload.catalog||!!payload.period,catalogChanged:!!payload.catalog};
}
async function load({reuse=false,full=false,background=false,pending=null}={}){
 const sourceKey=workspaceDataKey(),selection=pending?.selection||cut,range=pending?AMSCutoffs.ranges(selection.m,pending.rows)[Number(selection.h)-1]:rng();
 const key=JSON.stringify([ROLE,P?.id||'',...range]);
 if(reuse&&workspaceLoadedKey===key&&Date.now()-workspaceLoadedAt>=0&&Date.now()-workspaceLoadedAt<15000)return{changed:false};
 if(reuse&&workspaceInFlight?.key===key)return workspaceInFlight.promise;
 const generation=++workspaceLoadGeneration,writer=W(),started=pending?.started??performance.now(),done=background?()=>{}:AMSUI.beginBusy();
 const tables=['cutoff_schedules','employee_assignment_versions','employees','holidays','field_defs','attendance_comments','lookups','department_positions','stores','supervisors','supervisor_stores','emp_supervisors','duty_blocks','duty_pay_rules','cutoff_locks','cutoff_snapshot_view',...(writer?['wage_history','employee_pay','attendance_pay']:[]),'attendance'];
 const ranged=new Set(periodTables);
 const promise=(async()=>{
  const remote=await workspaceTransport(range,full);let snapshot=null,data={};
  if(remote){snapshot=unpackWorkspaceSnapshot(remote);data=snapshot.data}
  else{let next=0;
  // Each worker drains independently; a slow table does not block the next round.
  const worker=async()=>{while(next<tables.length){const table=tables[next++];data[table]=await API.list(table,ranged.has(table)?range:undefined)}};
  const results=await Promise.allSettled(Array.from({length:Math.min(6,tables.length)},worker));
  const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
  }
  if(generation!==workspaceLoadGeneration||sourceKey!==workspaceDataKey())return;
  if(background&&!workspaceCanRefresh())return{changed:false,deferred:true};
  const resolved=cutoffSelection(data.cutoff_schedules),resolvedRange=AMSCutoffs.ranges(resolved.m,data.cutoff_schedules)[Number(resolved.h)-1];
  if(range.join('|')!==resolvedRange.join('|'))return load({full:true,background,pending:{rows:data.cutoff_schedules,selection:resolved,started,requests:(pending?.requests??0)+(remote?1:tables.length)}});
  CUTOFFS=data.cutoff_schedules;applyCurrentCutoff(resolved);
  if(snapshot){
   ROLE=snapshot.payload.role;if(P)P={...P,role:ROLE};
   workspaceSnapshotCache={catalogKey:workspaceCatalogKey(),periodKey:workspaceDataKey(),catalogToken:snapshot.payload.catalog_token,periodTokens:snapshot.tokens,catalog:snapshot.catalog,period:snapshot.period};
  }
  // Do not partially replace a usable workspace if any dataset failed.
  ASSIGNMENTS=data.employee_assignment_versions;E=data.employees.slice().sort((a,b)=>(a.last_name||'').localeCompare(b.last_name||''));
  H=data.holidays;FD=data.field_defs.slice().sort((a,b)=>(a.sort||0)-(b.sort||0));CM=data.attendance_comments;
  LK=data.lookups;DPM=data.department_positions;ST=data.stores;SV=data.supervisors;SS=data.supervisor_stores;ES=data.emp_supervisors;DB=data.duty_blocks;RL=data.duty_pay_rules;LOCKS=data.cutoff_locks;CLOSED=data.cutoff_snapshot_view;
  PH=W()?data.wage_history:[];EP=Object.fromEntries((W()?data.employee_pay||[]:[]).map(r=>[r.emp_id,r]));AP=Object.fromEntries((W()?data.attendance_pay||[]:[]).map(r=>[r.emp_id+'|'+r.date,r]));A=Object.fromEntries(data.attendance.map(r=>[r.emp_id+'|'+r.date,r]));
  const today=manilaToday();E=E.map(e=>employeeAt(e,today));workspaceLoadedKey=workspaceDataKey();workspaceLoadedAt=Date.now();
  globalThis.AMSLoadTiming={durationMs:Math.round(performance.now()-started),datasets:tables.length,requests:(pending?.requests??0)+(remote?1:tables.length),changedEmployees:snapshot?.payload.period?.employees.length||0};
  return snapshot?{changed:snapshot.changed,catalogChanged:snapshot.catalogChanged}:{changed:true,catalogChanged:true};
 })();
 workspaceInFlight={key,promise};
 try{await promise}finally{done();if(workspaceInFlight?.promise===promise)workspaceInFlight=null}
}
async function navigateWorkspace(view){
 const refresh=view===V,request=++workspaceNavigation;V=view;sel=null;AMSUI.setNavigation(false,false);
 document.querySelector('.workspace')?.setAttribute('aria-busy','true');
 try{
  await load({reuse:!refresh,full:refresh});if(request!==workspaceNavigation)return;
  shell();$('mn')?.focus();
 }finally{if(request===workspaceNavigation)document.querySelector('.workspace')?.removeAttribute('aria-busy')}
}
function workspaceCanRefresh(){
 return !DEMO&&!workspaceRpcUnavailable&&!!P?.active&&['dash','emp','att'].includes(V)&&!document.hidden&&!$('ov').classList.contains('on')&&!document.querySelector('.confirm-layer')&&!drag&&!attendanceSaving&&!document.activeElement?.closest('input,select,textarea,button,a,td[tabindex]');
}
async function refreshSharedWorkspace(){
 if(!workspaceCanRefresh()||workspaceInFlight)return;
 const view=V,scroll=document.querySelector('#mn .wrap'),position=scroll?{left:scroll.scrollLeft,top:scroll.scrollTop}:null;
 try{const result=await load({reuse:true,background:true});if(V!==view||!result?.changed||!workspaceCanRefresh())return;shell();if(position){const next=document.querySelector('#mn .wrap');if(next){next.scrollLeft=position.left;next.scrollTop=position.top}}}
 catch(error){const badge=document.querySelector('.connection-badge');if(badge)badge.title='Refresh failed. Select the current page to retry. Saves still check for conflicts.'}
}
function scheduleWorkspaceRefresh(){setTimeout(()=>{void refreshSharedWorkspace();scheduleWorkspaceRefresh()},45000+Math.random()*8000)}
scheduleWorkspaceRefresh();
addEventListener('focus',()=>{void refreshSharedWorkspace()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshSharedWorkspace()});
