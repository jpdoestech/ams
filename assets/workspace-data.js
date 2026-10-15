/* Bounded parallel loading with atomic publication and brief navigation reuse. */
let workspaceLoadGeneration=0,workspaceLoadedAt=0,workspaceLoadedKey='',workspaceInFlight=null,workspaceNavigation=0;
const workspaceDataKey=()=>JSON.stringify([ROLE,P?.id||'',...rng()]);
function resetWorkspaceCache(){workspaceLoadGeneration++;workspaceLoadedAt=0;workspaceLoadedKey='';workspaceInFlight=null;workspaceNavigation++}
async function load({reuse=false}={}){
 const key=workspaceDataKey();
 if(reuse&&workspaceLoadedKey===key&&Date.now()-workspaceLoadedAt<15000)return;
 if(reuse&&workspaceInFlight?.key===key)return workspaceInFlight.promise;
 const generation=++workspaceLoadGeneration,range=rng(),writer=W(),started=performance.now();
 const tables=['employee_assignment_versions','employees','holidays','field_defs','attendance_comments','lookups','department_positions','stores','supervisors','supervisor_stores','emp_supervisors','duty_blocks','duty_pay_rules','cutoff_locks','cutoff_snapshot_view',...(writer?['wage_history','employee_pay','attendance_pay']:[]),'attendance'];
 const ranged=new Set(['attendance_comments','attendance_pay','attendance']);
 const promise=(async()=>{
  const data={};let next=0;
  // Each worker drains independently; a slow table does not block the next round.
  const worker=async()=>{while(next<tables.length){const table=tables[next++];data[table]=await API.list(table,ranged.has(table)?range:undefined)}};
  const results=await Promise.allSettled(Array.from({length:Math.min(6,tables.length)},worker));
  const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
  if(generation!==workspaceLoadGeneration||key!==workspaceDataKey())return;
  // Do not partially replace a usable workspace if any dataset failed.
  ASSIGNMENTS=data.employee_assignment_versions;E=data.employees.slice().sort((a,b)=>(a.last_name||'').localeCompare(b.last_name||''));
  H=data.holidays;FD=data.field_defs.slice().sort((a,b)=>(a.sort||0)-(b.sort||0));CM=data.attendance_comments;
  LK=data.lookups;DPM=data.department_positions;ST=data.stores;SV=data.supervisors;SS=data.supervisor_stores;ES=data.emp_supervisors;DB=data.duty_blocks;RL=data.duty_pay_rules;LOCKS=data.cutoff_locks;CLOSED=data.cutoff_snapshot_view;
  PH=writer?data.wage_history:[];EP=Object.fromEntries((data.employee_pay||[]).map(r=>[r.emp_id,r]));AP=Object.fromEntries((data.attendance_pay||[]).map(r=>[r.emp_id+'|'+r.date,r]));A=Object.fromEntries(data.attendance.map(r=>[r.emp_id+'|'+r.date,r]));
  const today=manilaToday();E=E.map(e=>employeeAt(e,today));workspaceLoadedKey=key;workspaceLoadedAt=Date.now();
  globalThis.AMSLoadTiming={durationMs:Math.round(performance.now()-started),datasets:tables.length};
 })();
 workspaceInFlight={key,promise};
 try{await promise}finally{if(workspaceInFlight?.promise===promise)workspaceInFlight=null}
}
async function navigateWorkspace(view){
 const refresh=view===V,request=++workspaceNavigation;V=view;sel=null;AMSUI.setNavigation(false,false);
 document.querySelector('.workspace')?.setAttribute('aria-busy','true');
 try{
  await load({reuse:!refresh});if(request!==workspaceNavigation)return;
  shell();$('mn')?.focus();
 }finally{if(request===workspaceNavigation)document.querySelector('.workspace')?.removeAttribute('aria-busy')}
}
