/* Repeating payroll boundaries; dates are calendar dates in the selected payroll month. */
(function(root){
 const validMonth=month=>/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
 function shiftMonth(month,offset){if(!validMonth(month))throw Error('Pick a valid payroll month');const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+offset);return date.toISOString().slice(0,7)}
 const addDay=date=>new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 function monthDay(month,day){const next=shiftMonth(month,1),last=new Date(Date.parse(next+'-01T00:00:00Z')-86400000).getUTCDate();return month+'-'+String(Math.min(day??last,last)).padStart(2,'0')}
 function ruleAt(month,rows){return rows.filter(r=>r.effective_month.slice(0,7)<=month).sort((a,b)=>b.effective_month.localeCompare(a.effective_month)||Number(b.version_no)-Number(a.version_no))[0]||{first_end:15,second_end:null}}
 function ranges(month,rows=[]){
  if(!validMonth(month))throw Error('Pick a valid payroll month');const rule=ruleAt(month,rows),next=ruleAt(shiftMonth(month,1),rows);
  const first=[addDay(monthDay(shiftMonth(month,-1),rule.second_end)),monthDay(month,rule.first_end)],second=[addDay(first[1]),monthDay(month,next.second_end)];
  if(second[1]<second[0])throw Error('Schedule leaves no second cut-off in '+month);
  return [first,second];
 }
 function validate(row,rows=[]){
  const month=row.effective_month?.slice(0,7);
  if(!validMonth(month)||row.effective_month!==month+'-01'||!Number.isInteger(row.first_end)||row.first_end<1||row.first_end>27||row.second_end!==null&&(!Number.isInteger(row.second_end)||row.second_end<=row.first_end||row.second_end>31))throw Error('First cut-off end must be 1–27; second end must be later or month end');
  const updated=[...rows,row],months=new Set([month,...rows.filter(r=>r.effective_month>=row.effective_month).map(r=>r.effective_month.slice(0,7))]);for(const date of months){ranges(shiftMonth(date,-1),updated);ranges(date,updated)}
  return updated;
 }
 const api={ranges,ruleAt,validate,shiftMonth};if(typeof module!=='undefined')module.exports=api;else root.AMSCutoffs=api;
})(globalThis);

function cutoffOptions(month,half){const format=date=>new Date(date+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});return AMSCutoffs.ranges(month,CUTOFFS).map(([a,b],i)=>`<option value="${i+1}" ${Number(half)===i+1?'selected':''}>${i+1===1?'1st':'2nd'} · ${format(a)} – ${format(b)}</option>`).join('')}
function syncCutoffPickers(){for(const p of ['s','x'])if($(p+'mo')?.value)$(p+'h').innerHTML=cutoffOptions($(p+'mo').value,$(p+'h').value)}
function cutoffSettings(){
 const month=cutoffSettingsMonth||cut.m,rule=AMSCutoffs.ruleAt(month,CUTOFFS);cutoffSettingsMonth=month;
 return `<div class="card"><h3>Repeating monthly cut-offs</h3><p class="mu">The payroll month names both periods. A second boundary on the 25th gives Dec 26–Jan 10 and Jan 11–25 when the first end is 10. Month end and first end 5 give Jan 1–5 and Jan 6–31. Days 29–31 use the last day in shorter months.</p><div class="fg"><label>Effective payroll month<input id="cutoff-effective" type="month" value="${month}" ${SAD()?'':'disabled'}></label><label>First cut-off ends on day<input id="cutoff-first" type="number" min="1" max="27" value="${rule.first_end}" ${SAD()?'':'disabled'}></label><label>Second monthly boundary<select id="cutoff-second" ${SAD()?'':'disabled'}><option value="" ${rule.second_end===null?'selected':''}>End of month</option>${Array.from({length:31},(_,i)=>`<option value="${i+1}" ${rule.second_end===i+1?'selected':''}>Day ${i+1}</option>`).join('')}</select></label></div><p id="cutoff-preview" role="status"></p><p class="mu">The schedule repeats until another effective version. A change can adjust the preceding month's second cut-off. Finalized dates cannot be affected. Only Superadmins can save.</p>${SAD()?'<button class="btn p" data-cutoff-save>Save schedule</button>':''}</div><div class="wrap compact-table"><table><thead><tr><th>Effective payroll month</th><th>First end</th><th>Second boundary</th><th>Version</th></tr></thead><tbody>${[...CUTOFFS].sort((a,b)=>b.effective_month.localeCompare(a.effective_month)||b.version_no-a.version_no).map(r=>`<tr><td>${r.effective_month.slice(0,7)}</td><td>${r.first_end}</td><td>${r.second_end??'Month end'}</td><td>${r.version_no}</td></tr>`).join('')||'<tr><td colspan="4">Default: 1–15 and 16–end.</td></tr>'}</tbody></table></div>`;
}
let cutoffSettingsMonth='';
function cutoffDraft(){return{effective_month:$('cutoff-effective').value+'-01',first_end:Number($('cutoff-first').value),second_end:$('cutoff-second').value===''?null:Number($('cutoff-second').value),version_no:Math.max(0,...CUTOFFS.map(r=>Number(r.version_no)))+1}}
function cutoffPreview(){if(!$('cutoff-preview'))return;try{const row=cutoffDraft(),rows=AMSCutoffs.validate(row,CUTOFFS);$('cutoff-preview').textContent=AMSCutoffs.ranges(row.effective_month.slice(0,7),rows).map(([a,b],i)=>`${i+1===1?'1st':'2nd'}: ${a} to ${b}`).join(' · ')}catch(error){$('cutoff-preview').textContent=error.message}}
async function saveCutoffSchedule(){
 if(!SAD())throw Error('Superadmin access required');const row=cutoffDraft(),expected=Math.max(0,...CUTOFFS.map(r=>Number(r.version_no)))||null;AMSCutoffs.validate(row,CUTOFFS);
 await persistOperation('save_cutoff_schedule',{p_month:row.effective_month,p_first:row.first_end,p_second:row.second_end,p_expected:expected},draft=>{
  const latest=Math.max(0,...draft.cutoff_schedules.map(r=>Number(r.version_no)))||null;if(latest!==expected)throw Error('Cut-off schedule changed; reload before saving');
  const updated=AMSCutoffs.validate(row,draft.cutoff_schedules),previous=AMSCutoffs.shiftMonth(row.effective_month.slice(0,7),-1),from=AMSCutoffs.ranges(previous,draft.cutoff_schedules)[1][0];
  if(draft.cutoff_locks.some(l=>l.end_date>=from))throw Error('Schedule affects finalized dates; choose a later effective month');
  const saved={...row,id:uid()};draft.cutoff_schedules=updated.map(r=>r===row?saved:r);demoAudit('cutoff_schedules',null,saved,draft);return saved.id;
 });
 await load({full:true});stdv();toast('Repeating cut-off schedule saved');
}
if(typeof document!=='undefined'){
 document.addEventListener('click',event=>{if(event.target.closest?.('[data-cutoff-save]'))guard(saveCutoffSchedule)});
 document.addEventListener('input',event=>{if(['cutoff-first','cutoff-second'].includes(event.target.id))cutoffPreview()});
 document.addEventListener('change',event=>{if(event.target.id==='cutoff-effective'){cutoffSettingsMonth=event.target.value||cut.m;stdv()}else if(event.target.id==='cutoff-second')cutoffPreview();else if(['smo','xmo'].includes(event.target.id))syncCutoffPickers()});
}
