/* Attendance decisions, dated assignments, and additive finalized-period corrections. */
let ASSIGNMENTS=[];
const assignmentKeys=['department','position','site','location','time_in','time_out','rest_day'];
const assignmentFields=e=>Object.fromEntries(assignmentKeys.map(k=>[k,e[k]??null]));
const actorId=()=>P?.id||'demo';
let assignmentIndexSource=null,assignmentIndexLength=-1,assignmentIndex=new Map();
function assignmentVersion(id,date){
 // Versions are append-only. Rebuild once per new snapshot, not once per cell.
 if(assignmentIndexSource!==ASSIGNMENTS||assignmentIndexLength!==ASSIGNMENTS.length){
  assignmentIndexSource=ASSIGNMENTS;assignmentIndexLength=ASSIGNMENTS.length;assignmentIndex=new Map();
  for(const v of ASSIGNMENTS){if(!assignmentIndex.has(v.emp_id))assignmentIndex.set(v.emp_id,[]);assignmentIndex.get(v.emp_id).push(v)}
  for(const list of assignmentIndex.values())list.sort((a,b)=>a.effective_from.localeCompare(b.effective_from)||Number(a.version_no)-Number(b.version_no));
 }
 const list=assignmentIndex.get(id)||[];let low=0,high=list.length;
 while(low<high){const mid=(low+high)>>>1;if(list[mid].effective_from<=date)low=mid+1;else high=mid}
 return list[low-1];
}
function employeeAt(e,date){const version=assignmentVersion(e.id,date);return{...e,...(version?.snapshot.employee||{}),_workDate:date}}
function assignmentBlocks(id,date=manilaToday()){return assignmentVersion(id,date)?.snapshot.blocks??DB.filter(b=>b.emp_id===id)}
function demoCaptureAssignment(table,old,row,state=S){
 if(table!=='employees'||!row)return;
 const list=state.employee_assignment_versions;
 if(!list)return;
 const snapshot=e=>({employee:assignmentFields(e),blocks:structuredClone(assignmentBlocks(e.id))});
 if(old&&JSON.stringify(assignmentFields(old))===JSON.stringify(assignmentFields(row)))return;
 if(old&&!list.some(v=>v.emp_id===row.id))list.push({id:uid(),version_no:list.length+1,emp_id:row.id,effective_from:'0001-01-01',snapshot:snapshot(old),reason:'Legacy baseline',created_at:new Date().toISOString()});
 list.push({id:uid(),version_no:list.length+1,emp_id:row.id,effective_from:old?manilaToday():'0001-01-01',snapshot:snapshot(row),reason:old?'Employee form update effective today':'Initial assignment',created_by:actorId(),created_at:new Date().toISOString()});
}
async function persistOperation(rpc,args,demo){
 if(!W())throw Error('Staff access required');
 if(!DEMO){const {data,error}=await sb.rpc(rpc,args);if(error)throw error;return data}
 const draft=structuredClone(S),result=demo(draft);localStorage.setItem('ams',JSON.stringify(draft));S=draft;return result;
}
const reviewStatus=r=>r.review_status||'draft';
async function reviewEntries(rows,action,note=''){
 return persistOperation('review_attendance',{p_rows:rows,p_action:action,p_note:note},draft=>{
  if(!['submit','approve','return'].includes(action))throw Error('Invalid review action');
  if(action!=='submit'&&!SAD())throw Error('Superadmin approval required');
  if(action==='return'&&note.trim().length<3)throw Error('Return reason required');
  if(!rows.length||rows.length>1000||new Set(rows.map(r=>r.emp_id+'|'+r.date)).size!==rows.length)throw Error('Select 1 to 1000 distinct entries');
  for(const selected of rows){
   const r=draft.attendance.find(r=>r.emp_id===selected.emp_id&&r.date===selected.date);
   if(!r||r.revision!==selected.revision)throw Error('Attendance changed; reload before review');
   if([r.date,...(r.segments||[]).map(s=>s.date)].some(isLocked))throw Error('Cut-off is locked');
   if(action==='submit'){
    if(!['draft','returned'].includes(reviewStatus(r)))throw Error('Only draft or returned entries can be submitted');
    if(['PRESENT','LATE/UT'].includes(r.type)&&!r.verified)throw Error('Record actual duty before submitting');
   }else{
    if(reviewStatus(r)!=='submitted')throw Error('Only submitted entries can be decided');
    if(action==='approve'&&[r.submitted_by,r.edited_by].includes(actorId()))throw Error('A different superadmin must approve this attendance');
   }
   draft.attendance_review_events.push({id:uid(),emp_id:r.emp_id,date:r.date,action,actor_id:actorId(),actor_email:P?.email||'Demo user',at:new Date().toISOString(),revision:r.revision,note,snapshot:structuredClone(r)});
   Object.assign(r,{review_status:action==='submit'?'submitted':action==='approve'?'approved':'returned',reviewed:action==='approve',review_note:note,revision:(r.revision||0)+1});
   if(action==='submit'){r.submitted_by=actorId();r.submitted_at=new Date().toISOString();r.decided_by=null;r.decided_at=null}
   else{r.decided_by=actorId();r.decided_at=new Date().toISOString()}
  }
  return rows.length;
 });
}
let reviewRows=[];
async function reviewHistory(index){
 if(!W())throw Error('Staff access required');const row=reviewRows[index];if(!row)throw Error('Reload attendance review');
 const events=(await API.list('attendance_review_events',[row.date,row.date])).filter(e=>e.emp_id===row.emp_id).sort((a,b)=>(a.at||'').localeCompare(b.at||''));
 modal(`<h3>Attendance decision history</h3><p class="mu">${row.date} · Decisions retain their attendance snapshot, including when optional audit capture is disabled.</p><div class="wrap compact-table"><table><thead><tr><th>When (Manila)</th><th>Action</th><th>Actor</th><th>Reason</th><th>Entry snapshot</th></tr></thead><tbody>${events.map(e=>`<tr><td>${esc(new Date(e.at).toLocaleString('en-PH',{timeZone:'Asia/Manila'}))}</td><td>${esc(e.action)}</td><td>${esc(e.actor_email)}</td><td>${esc(e.note)}</td><td><details><summary>View recorded values</summary><pre class="audit-detail">${esc(JSON.stringify(e.snapshot,null,2))}</pre></details></td></tr>`).join('')||'<tr><td colspan="5">No decisions recorded yet.</td></tr>'}</tbody></table></div><div class="row"><button class="btn" data-review-open>Back to review</button></div>`);
}
document.addEventListener('click',event=>{const b=event.target.closest?.('[data-review-history]');if(b)guard(()=>reviewHistory(Number(b.dataset.reviewHistory)))});
async function reviewModal(){
 if(!W())throw Error('Staff access required');
 const [from,to]=rng(),people=new Map(fe().map(e=>[e.id,e]));
 reviewRows=(await API.list('attendance',[from,to])).filter(r=>people.has(r.emp_id));
 modal(`<h3>Attendance review</h3><p class="mu">${from} — ${to} · Current employee filters apply. Select entries to submit. A different superadmin approves submitted entries; return them with a reason to allow corrections.</p><div class="row"><label>Status <select id="review-filter"><option value="">All statuses</option>${['draft','submitted','approved','returned'].map(s=>`<option>${s}</option>`).join('')}</select></label><label><input type="checkbox" id="review-all"> Select visible entries</label><span id="review-count" role="status"></span></div><div class="wrap compact-table"><table><thead><tr><th>Select</th><th>Employee</th><th>Date</th><th>Entry</th><th>Punches / break</th><th>Status</th><th>Note / history</th></tr></thead><tbody id="review-body"></tbody></table></div><label class="operation-note">Decision / return reason<textarea id="review-note" rows="2" maxlength="2000"></textarea></label><div class="row"><button class="btn" data-act="cm">Close</button><button class="btn p" data-review-action="submit">${svg('upload')}Submit selected</button>${SAD()?`<button class="btn p" data-review-action="approve">${svg('shield')}Approve selected</button><button class="btn" data-review-action="return">${svg('reset')}Return selected</button>`:''}</div>`);
 const render=()=>{
  const status=$('review-filter').value;const visible=reviewRows.map((r,i)=>({r,i})).filter(({r})=>!status||reviewStatus(r)===status);
  $('review-all').checked=false;$('review-filter').classList.toggle('is-filtered',!!status);
  $('review-count').textContent=(status?'Filtered: '+status+' · ':'')+visible.length+' entries';
  $('review-body').innerHTML=visible.map(({r,i})=>`<tr><td><input type="checkbox" data-review-row="${i}" aria-label="Select ${esc(people.get(r.emp_id).emp_no+' '+r.date)}" ${isLocked(r.date)?'disabled':''}></td><td>${esc(people.get(r.emp_id).emp_no)} · ${esc(people.get(r.emp_id).last_name)}</td><td>${r.date}</td><td>${esc(r.duty_code?dutyTxt(r):leaveLabel(r.type))}</td><td>${esc(r.time_in||"—")}–${esc(r.time_out||"—")} · ${r.break_min??0} min break</td><td><span class="review-status" data-status="${reviewStatus(r)}">${reviewStatus(r)}</span></td><td>${esc(r.review_note||'')} <button class="btn icon-button" data-review-history="${i}" aria-label="Review history">${svg('clock')}</button></td></tr>`).join('')||'<tr><td colspan="7">No entries match.</td></tr>';
 };
 $('review-filter').onchange=render;$('review-all').onchange=e=>document.querySelectorAll('[data-review-row]:not(:disabled)').forEach(c=>c.checked=e.target.checked);render();
}
async function saveAssignment(id,from,assignment,blocks,reason){
 const expected=Math.max(0,...ASSIGNMENTS.filter(v=>v.emp_id===id).map(v=>Number(v.version_no)));
 return persistOperation('save_assignment_version',{p_emp:id,p_from:from,p_assignment:assignment,p_blocks:blocks,p_reason:reason,p_expected:expected||null},draft=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||new Date(from+'T00:00:00Z').toISOString().slice(0,10)!==from||reason.trim().length<3)throw Error('Effective date and reason required');
  const e=E.find(e=>e.id===id);if(!e||e.date_hired&&from<e.date_hired)throw Error('Date outside employment');
  const latest=Math.max(0,...draft.employee_assignment_versions.filter(v=>v.emp_id===id).map(v=>Number(v.version_no)));
  if(latest!==expected)throw Error('Schedule changed; reload before saving');
  if(LOCKS.some(l=>l.end_date>=from))throw Error('Effective date affects finalized attendance; choose a later date');
  if(draft.attendance.some(r=>r.emp_id===id&&r.date>=from&&['submitted','approved'].includes(reviewStatus(r))))throw Error('Return affected attendance before changing its schedule');
  if(assignment.position&&!positionsFor(assignment.department).includes(assignment.position))throw Error('Position must belong to the selected department');
  if(!draft.employee_assignment_versions.some(v=>v.emp_id===id))draft.employee_assignment_versions.push({id:uid(),emp_id:id,version_no:draft.employee_assignment_versions.length+1,effective_from:'0001-01-01',snapshot:{employee:assignmentFields(e),blocks:structuredClone(blocksOf(id))},reason:'Legacy baseline'});
  const row={id:uid(),version_no:draft.employee_assignment_versions.length+1,emp_id:id,effective_from:from,snapshot:{employee:assignment,blocks},reason:reason.trim(),created_by:actorId(),created_at:new Date().toISOString()};draft.employee_assignment_versions.push(row);demoAudit('employee_assignment_versions',null,row,draft);return row.id;
 });
}
function scheduleControls(id){
 const e=employeeAt(E.find(e=>e.id===id),manilaToday());
 return `<div class="schedule-version-fields fg"><label>Effective from<input type="date" id="schedule-from" value="${manilaToday()}" ${W()?'':'disabled'}></label><label>Default time in<input type="time" id="schedule-in" value="${e.time_in||'08:00'}" ${W()?'':'disabled'}></label><label>Default time out<input type="time" id="schedule-out" value="${e.time_out||'17:00'}" ${W()?'':'disabled'}></label><label>Rest day<select id="schedule-rest" ${W()?'':'disabled'}>${[...DAYS7,'None'].map(d=>`<option ${d===e.rest_day?'selected':''}>${d}</option>`).join('')}</select></label><label>Reason<input id="schedule-reason" maxlength="2000" placeholder="Required for a new version" ${W()?'':'disabled'}></label><button class="btn" type="button" data-assignment-history="${id}">${svg('clock')}Assignment history</button></div>`;
}
function initScheduleVersion(id){
 const input=$('schedule-from');if(!input)return;
 input.onchange=()=>{
  const date=input.value;if(!date)return;const e=employeeAt(E.find(e=>e.id===id),date);
  $('schedule-in').value=e.time_in||'08:00';$('schedule-out').value=e.time_out||'17:00';$('schedule-rest').value=e.rest_day||'Sun';
  $('schb').innerHTML=blocksOf(id,date).map(schRow).join('');schCalc();
  const context=document.querySelector('.modal-schedule .modal-body>.mu');if(context)context.textContent=`${e.last_name}, ${e.first_name} · version active on ${date} · ${e.time_in||'08:00'}–${e.time_out||'17:00'} · rest day ${e.rest_day||'Sun'}`;
 };
}
function assignmentHistory(id){
 const e=E.find(e=>e.id===id),versions=ASSIGNMENTS.filter(v=>v.emp_id===id).sort((a,b)=>b.effective_from.localeCompare(a.effective_from)||Number(b.version_no)-Number(a.version_no));
 modal(`<h3>Assignment &amp; schedule history</h3><p>${esc(e.emp_no+' · '+e.last_name)}</p><p class="mu">Migration baselines preserve the previous setup; they do not establish what an employee's assignment was before history tracking began.</p><div class="wrap compact-table"><table><thead><tr><th>Effective from</th><th>Department / Position</th><th>Assignment / City</th><th>Schedule</th><th>Reason</th></tr></thead><tbody>${versions.map(v=>{const x=v.snapshot.employee;return `<tr><td>${v.effective_from==='0001-01-01'?'Baseline':v.effective_from}</td><td>${esc(x.department)} / ${esc(x.position)}</td><td>${esc(x.site)} / ${esc(x.location)}</td><td>${esc(x.time_in)}–${esc(x.time_out)} · ${esc(x.rest_day)} · ${v.snapshot.blocks.length} blocks</td><td>${esc(v.reason)}</td></tr>`}).join('')||'<tr><td colspan="5">Current legacy setup; no dated changes yet.</td></tr>'}</tbody></table></div><div class="row"><button class="btn" data-schedule-back="${id}">Back to schedule</button>${W()?`<button class="btn p" data-assignment-new="${id}">${svg('plus')}New assignment version</button>`:''}</div>`);
}
function assignmentForm(id){
 const e=employeeAt(E.find(e=>e.id===id),manilaToday());
 const opts=(kind,value)=>'<option value=""></option>'+[...new Set([...lk(kind),...(value?[value]:[])])].map(v=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(v)}</option>`).join('');
 modal(`<h3>New assignment version</h3><p class="mu">${esc(e.emp_no+' · '+e.last_name)} · Earlier dates and saved duty retain their original context. Blocks are copied from the version active on the effective date; use Schedule to change them.</p><div class="fg"><label>Effective from<input id="assignment-from" type="date" value="${manilaToday()}"></label><label>Department<select id="assignment-department">${opts('department',e.department)}</select></label><label>Position<select id="assignment-position">${positionOptions(e.department,e.position,true)}</select></label><label>Assignment location<select id="assignment-site">${opts('assignment_location',e.site)}</select></label><label>City<select id="assignment-location">${opts('city',e.location)}</select></label><label>Reason<input id="assignment-reason" maxlength="2000"></label></div><div class="row"><button class="btn" data-assignment-history="${id}">Cancel</button><button class="btn p" data-assignment-save="${id}">${svg('save')}Save version</button></div>`);
 $('assignment-department').onchange=()=>{$('assignment-position').innerHTML=positionOptions($('assignment-department').value);$('assignment-position').disabled=!$('assignment-department').value};
}
let adjustmentRows=[],adjustmentRange=[];
async function adjustmentsView(){
 if(!W()){V='dash';shell();return}
 const [from,to]=adjustmentRange.length?adjustmentRange:rng();
 $('mn').innerHTML=`<form id="adjustments-filter" class="row analytics-controls"><label>From<input type="date" id="adjustments-from" value="${from}" required></label><label>To<input type="date" id="adjustments-to" value="${to}" required></label><button class="btn p" type="submit">Apply</button><button class="btn" type="button" data-adjustment-new>${svg('plus')}New correction</button><button class="btn" type="button" data-adjustment-export>${svg('download')}Export ledger</button></form><p id="adjustments-status" class="analytics-note" role="status"></p><div class="compact-totals" id="adjustments-totals"></div><p class="analytics-note">Signed corrections are separate from original duty/pay. Approved amounts are shown in this ledger only; they do not automatically run payroll or change Attendance/Analytics totals.</p><div class="wrap compact-table"><table><thead><tr><th>Employee</th><th>Date</th><th>Minutes ±</th><th>Amount ±</th><th>Reason / reference</th><th>Status</th><th>Decision</th></tr></thead><tbody id="adjustments-body"></tbody></table></div>`;
 const apply=async()=>{const a=$('adjustments-from').value,b=$('adjustments-to').value;AMSAnalytics.dates(a,b);const rows=await API.list('cutoff_adjustments',[a,b]);if(V!=='adjustments')return;adjustmentRows=rows;adjustmentRange=[a,b];$('adjustments-status').textContent='Applied range: '+a+' — '+b;const approved=rows.filter(r=>r.status==='approved');$('adjustments-totals').innerHTML=`<div>Pending <strong>${rows.filter(r=>r.status==='pending').length}</strong></div><div>Approved minutes <strong>${approved.reduce((s,r)=>s+r.minutes_delta,0)}</strong></div><div>Approved amount <strong>${approved.reduce((s,r)=>s+Number(r.amount_delta),0).toFixed(2)}</strong></div>`;$('adjustments-body').innerHTML=rows.map(r=>{const e=E.find(e=>e.id===r.emp_id);return `<tr><td>${esc(e?.emp_no)} · ${esc(e?.last_name)}</td><td>${r.date}</td><td>${r.minutes_delta}</td><td>${Number(r.amount_delta).toFixed(2)}</td><td>${esc(r.reason)}<small class="employee-ref">${esc(r.reference)}</small></td><td>${esc(r.status)}</td><td>${SAD()&&r.status==='pending'?`<button class="btn" data-adjustment-decide="${r.id}">${svg('shield')}Review</button>`:esc(r.decision_note||'—')}</td></tr>`}).join('')||'<tr><td colspan="7">No corrections in this range.</td></tr>'};
 $('adjustments-filter').onsubmit=e=>{e.preventDefault();guard(apply)};await apply();
}
let adjustmentId=null;
function adjustmentForm(){
 adjustmentId=uid();modal(`<h3>Finalized-period correction</h3><p class="mu">The original cut-off stays locked. Enter signed differences, a reason, and an optional supporting reference. A different superadmin must approve.</p><div class="fg"><label>Employee<select id="adjustment-emp">${E.map(e=>`<option value="${e.id}">${esc(e.emp_no+' · '+e.last_name+', '+e.first_name)}</option>`).join('')}</select></label><label>Finalized date<input type="date" id="adjustment-date" value="${rng()[0]}"></label><label>Minutes difference<input type="number" id="adjustment-minutes" value="0" min="-1440" max="1440" step="1"></label><label>Amount difference<input type="number" id="adjustment-amount" value="0" step="0.01"></label><label>Reason<input id="adjustment-reason" maxlength="2000"></label><label>Supporting reference<input id="adjustment-reference" maxlength="2000"></label></div><div class="row"><button class="btn" data-act="cm">Cancel</button><button class="btn p" data-adjustment-save>${svg('upload')}Submit correction</button></div>`);
}
async function submitAdjustment(args){
 return persistOperation('create_cutoff_adjustment',args,draft=>{
  const {p_id:id,p_emp:emp_id,p_date:date,p_minutes:minutes_delta,p_amount:amount_delta,p_reason:reason,p_reference:reference}=args,lock=LOCKS.find(l=>date>=l.start_date&&date<=l.end_date);
  if(!lock)throw Error('Adjustments require a finalized date');
  if(!Number.isInteger(minutes_delta)||Math.abs(minutes_delta)>1440||!Number.isFinite(amount_delta)||Math.abs(amount_delta*100-Math.round(amount_delta*100))>1e-6||(!minutes_delta&&!amount_delta)||reason.trim().length<3)throw Error('Enter a nonzero correction and a reason; amounts use at most two decimals');
  const e=E.find(e=>e.id===emp_id);if(!e||isNA(e,date))throw Error('Date outside employment');
  const before=draft.cutoff_adjustments.find(r=>r.id===id);if(before){if(before.submitted_by===actorId()&&JSON.stringify([before.emp_id,before.date,before.minutes_delta,before.amount_delta,before.reason,before.reference])===JSON.stringify([emp_id,date,minutes_delta,amount_delta,reason.trim(),reference]))return id;throw Error('Adjustment identity already used')}
  draft.cutoff_adjustments.push({id,emp_id,date,lock_id:lock.id,minutes_delta,amount_delta,reason:reason.trim(),reference,original:{attendance:draft.attendance.find(r=>r.emp_id===emp_id&&r.date===date)||null,pay:draft.attendance_pay.find(r=>r.emp_id===emp_id&&r.date===date)||null},status:'pending',submitted_by:actorId(),submitted_at:new Date().toISOString()});draft.cutoff_adjustment_events.push({id:uid(),adjustment_id:id,action:'submitted',actor_id:actorId(),note:reason.trim()});return id;
 });
}
function adjustmentDecision(id){const r=adjustmentRows.find(r=>r.id===id);if(!r)throw Error('Reload corrections');modal(`<h3>Review correction</h3><p>${r.date} · ${r.minutes_delta} minutes · ${Number(r.amount_delta).toFixed(2)} amount</p><p>${esc(r.reason)}</p><p class="mu">${esc(r.reference||'No reference')}</p><label class="operation-note">Decision reason<textarea id="adjustment-decision-note" rows="3" maxlength="2000"></textarea></label><div class="row"><button class="btn" data-act="cm">Cancel</button><button class="btn" data-adjustment-action="reject" data-id="${id}">Reject</button><button class="btn p" data-adjustment-action="approve" data-id="${id}">${svg('shield')}Approve</button></div>`)}
async function decideAdjustment(id,action,note){return persistOperation('decide_cutoff_adjustment',{p_id:id,p_action:action,p_note:note},draft=>{if(!SAD())throw Error('Superadmin approval required');if(!['approve','reject'].includes(action)||note.trim().length<3)throw Error('Decision and reason required');const r=draft.cutoff_adjustments.find(r=>r.id===id);if(!r||r.status!=='pending')throw Error('Adjustment already decided; reload');if(r.submitted_by===actorId())throw Error('A different superadmin must decide this adjustment');Object.assign(r,{status:action==='approve'?'approved':'rejected',decided_by:actorId(),decided_at:new Date().toISOString(),decision_note:note.trim()});draft.cutoff_adjustment_events.push({id:uid(),adjustment_id:id,action,actor_id:actorId(),note:note.trim()})})}
document.addEventListener('click',event=>{
 const b=event.target.closest?.('[data-review-open],[data-review-action],[data-assignment-history],[data-schedule-back],[data-assignment-new],[data-assignment-save],[data-adjustment-new],[data-adjustment-save],[data-adjustment-decide],[data-adjustment-action],[data-adjustment-export]');if(!b)return;
 guard(async()=>{b.disabled=true;try{
  if(b.hasAttribute('data-review-open'))await reviewModal();
  else if(b.dataset.reviewAction){const selected=[...document.querySelectorAll('[data-review-row]:checked')].map(c=>reviewRows[Number(c.dataset.reviewRow)]).map(r=>({emp_id:r.emp_id,date:r.date,revision:r.revision}));const n=await reviewEntries(selected,b.dataset.reviewAction,$('review-note').value);await load();await reviewModal();toast(n+' entries updated')}
  else if(b.dataset.assignmentHistory)assignmentHistory(b.dataset.assignmentHistory);
  else if(b.dataset.scheduleBack)schM(b.dataset.scheduleBack);
  else if(b.dataset.assignmentNew)assignmentForm(b.dataset.assignmentNew);
  else if(b.dataset.assignmentSave){const id=b.dataset.assignmentSave,date=$('assignment-from').value,e=employeeAt(E.find(e=>e.id===id),date);const assignment={...assignmentFields(e),department:$('assignment-department').value,position:$('assignment-position').value,site:$('assignment-site').value,location:$('assignment-location').value};await saveAssignment(id,date,assignment,blocksOf(id,date),$('assignment-reason').value);await load();assignmentHistory(id);toast('Assignment version saved')}
  else if(b.hasAttribute('data-adjustment-new'))adjustmentForm();
  else if(b.hasAttribute('data-adjustment-save')){await submitAdjustment({p_id:adjustmentId,p_emp:$('adjustment-emp').value,p_date:$('adjustment-date').value,p_minutes:Number($('adjustment-minutes').value),p_amount:Number($('adjustment-amount').value),p_reason:$('adjustment-reason').value,p_reference:$('adjustment-reference').value});closeM();await adjustmentsView();toast('Correction submitted')}
  else if(b.dataset.adjustmentDecide)adjustmentDecision(b.dataset.adjustmentDecide);
  else if(b.dataset.adjustmentAction){await decideAdjustment(b.dataset.id,b.dataset.adjustmentAction,$('adjustment-decision-note').value);closeM();await adjustmentsView();toast('Decision saved')}
  else if(b.hasAttribute('data-adjustment-export'))dl('adjustments_'+adjustmentRange.join('_')+'.csv',[['FROM','TO','id','emp_no','date','minutes_delta','amount_delta','reason','reference','status','submitted_by','submitted_at','decided_by','decided_at','decision_note'],...adjustmentRows.map(r=>[...adjustmentRange,r.id,E.find(e=>e.id===r.emp_id)?.emp_no,r.date,r.minutes_delta,r.amount_delta,r.reason,r.reference,r.status,r.submitted_by,r.submitted_at,r.decided_by,r.decided_at,r.decision_note])]);
 }finally{if(b.isConnected)b.disabled=false}});
});
