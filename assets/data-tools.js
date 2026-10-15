/* Data operations shared by the existing matrix, duty editor and imports. */
function changeFor(emp_id,date,row,current=A[emp_id+'|'+date]){
  return{emp_id,date,row,expected_revision:current?.revision??(current?0:null)};
}
let attendanceSaving=false;
async function saveAttendance(changes,overwriteReviewed=false){
  if(!W())throw Error('Staff access required');
  if(attendanceSaving)throw Error('A save is already in progress');
  attendanceSaving=true;
  try{
    if(!DEMO){const{error}=await sb.rpc('save_attendance_batch',{p_changes:changes,p_overwrite_reviewed:overwriteReviewed});if(error)throw error;return}
    const draft=structuredClone(S),seen=new Set();
    for(const c of changes){
      const key=c.emp_id+'|'+c.date;if(seen.has(key))throw Error('Duplicate employee/date');seen.add(key);
      const old=draft.attendance.find(r=>r.emp_id==c.emp_id&&r.date==c.date),e=E.find(e=>e.id==c.emp_id);
      if((old?.revision??(old?0:null))!==c.expected_revision)throw Error('Attendance changed; reload before saving');
      if(old?.reviewed&&!overwriteReviewed)throw Error('Reviewed entry requires explicit overwrite');
      const touched=[c.date,...(old?.segments||[]).map(s=>s.date),...(c.row?.segments||[]).map(s=>s.date)];
      if(touched.some(isLocked))throw Error('Cut-off is locked');
      if(!e||isNA(e,c.date))throw Error('Date outside employment');
      draft.attendance=draft.attendance.filter(r=>r.emp_id!=c.emp_id||r.date!=c.date);
      draft.attendance_pay=draft.attendance_pay.filter(r=>r.emp_id!=c.emp_id||r.date!=c.date);
      if(c.row){
        let row={...BLANK,...c.row,emp_id:c.emp_id,date:c.date};
        if(row.time_in||row.time_out){
          const calculated=dutyRow(e,c.date,{tin:row.time_in,tout:row.time_out,brk:row.break_min,ov:row.override_code,why:row.override_reason},row.source||'manual');
          if(!calculated||row.override_code&&!row.override_reason)throw Error('Invalid duty or missing override reason');
          row=calculated.row;if(calculated.pay)draft.attendance_pay.push(calculated.pay);
        }
        if((row.segments||[]).some(s=>isLocked(s.date)))throw Error('Cut-off is locked');
        row.revision=Date.now()*1000+Math.floor(Math.random()*1000);draft.attendance.push(row);
      }
      draft.audit_log.push({id:uid(),at:new Date().toISOString(),user_email:P?.email||'demo',action:'attendance.save',detail:{old:old||null,new:draft.attendance.find(r=>r.emp_id==c.emp_id&&r.date==c.date)||null}});
    }
    // Persist once before replacing live memory. Quota failure leaves the old state intact.
    localStorage.setItem('ams',JSON.stringify(draft));S=draft;
  }finally{attendanceSaving=false}
}

let stagedImport=[];
async function stageAttendanceImport(csv){
  if(csv.length<2)throw Error('CSV contains no data rows');
  const headers=csv[0].map(v=>v.replace(/^\uFEFF/,'').trim().toLowerCase()),ix=k=>headers.indexOf(k);
  if(['emp_no','date','type'].some(k=>ix(k)<0))throw Error('Required headers: emp_no,date,type');
  const get=(line,k)=>String(line[ix(k)]??'').trim(),seen=new Set(),duplicates=new Set(),issues=[];
  const dates=csv.slice(1).map(l=>get(l,'date')).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if(!dates.length)throw Error('No valid dates');
  // Import conflicts must be checked for the complete imported range, not only the visible cut-off.
  const current=await API.list('attendance',[dates[0],dates.at(-1)]),currentMap=new Map(current.map(r=>[r.emp_id+'|'+r.date,r]));
  csv.slice(1).forEach(l=>{const key=get(l,'emp_no')+'|'+get(l,'date');if(seen.has(key))duplicates.add(key);seen.add(key)});
  stagedImport=[];
  csv.slice(1).forEach((line,i)=>{
    try{
      const empNo=get(line,'emp_no'),date=get(line,'date'),e=E.find(e=>e.emp_no==empNo),key=empNo+'|'+date;
      if(!e)throw Error('Unknown employee '+empNo);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Invalid date');
      if(duplicates.has(key))throw Error('Duplicate employee/date; resolve all duplicate rows');
      if(isNA(e,date)||isLocked(date))throw Error('Outside employment or locked');
      const old=currentMap.get(e.id+'|'+date);if(old?.reviewed)throw Error('Reviewed entry protected');
      const type=get(line,'type').toUpperCase(),tin=get(line,'time_in'),tout=get(line,'time_out');
      if(!TY.includes(type))throw Error('Unknown status '+type);
      if(!!tin!==!!tout)throw Error('Both punches required');
      const integer=(...keys)=>{const v=keys.map(k=>get(line,k)).find(Boolean)||'0';if(!/^\d+$/.test(v))throw Error('Minutes must be nonnegative whole numbers');return Number(v)};
      let row={...BLANK,emp_id:e.id,date,type,late:integer('late_min','late'),ut:integer('ut_min','ut'),source:'import'};
      if(tin){
        if(!['PRESENT','LATE/UT'].includes(type))throw Error('Worked punches require PRESENT or LATE/UT');
        const brk=get(line,'break_min')||get(line,'break'),ov=get(line,'override_code'),why=get(line,'override_reason');
        if(ov&&!why)throw Error('Override reason required');
        if(ov&&!RS.some(r=>r[0]==ov))throw Error('Unknown override code');
        const calculated=dutyRow(e,date,{tin,tout,brk:brk===''?schedBrk(e):integer('break_min','break'),ov,why},'import');
        if(!calculated)throw Error('Invalid or zero worked hours');row=calculated.row;
        if(row.segments.some(s=>isLocked(s.date)))throw Error('Shift crosses locked cut-off');
      }
      stagedImport.push(changeFor(e.id,date,row,old));
    }catch(error){issues.push({row:i+2,message:error.message})}
  });
  modal(`<h3>Review attendance import</h3><p>${stagedImport.length} valid rows · ${issues.length} rejected rows. Reviewed and locked entries are protected.</p><div class="wrap" style="max-height:280px"><table><thead><tr><th>CSV row</th><th>Issue</th></tr></thead><tbody>${issues.map(x=>`<tr><td>${x.row}</td><td>${esc(x.message)}</td></tr>`).join('')||'<tr><td colspan="2">No validation issues.</td></tr>'}</tbody></table></div><div class="row" style="margin-top:12px"><button class="btn" data-act="cm">Cancel</button><button class="btn p" data-import-apply ${stagedImport.length?'':'disabled'}>Import ${stagedImport.length} valid rows</button></div>`);
}
document.addEventListener('click',event=>{if(!event.target.hasAttribute('data-import-apply'))return;guard(async()=>{
  const changes=stagedImport;if(!changes.length)return;
  event.target.disabled=true;
  try{await saveAttendance(changes);stagedImport=[];await load();closeM();att();toast(changes.length+' rows imported')}
  catch(error){event.target.disabled=false;throw error}
})});

function transactionsCSV(employees,rows){
  const map=new Map(employees.map(e=>[e.id,e]));
  const header=['emp_no','name','assignment_location','department','position','date','type','late_min','ut_min','time_in','time_out','break_min','duty_code','override_code','override_reason','source','verified','reviewed'];
  return[header,...rows.filter(r=>map.has(r.emp_id)).sort((a,b)=>a.date.localeCompare(b.date)||a.emp_id.localeCompare(b.emp_id)).map(r=>{
    const e=map.get(r.emp_id);return[e.emp_no,`${e.last_name}, ${e.first_name}`,r.schedule_snapshot?.site??e.site,e.department,e.position,r.date,r.type,r.late||0,r.ut||0,r.time_in,r.time_out,r.break_min,r.duty_code,r.override_code,r.override_reason,r.source,!!r.verified,!!r.reviewed];
  })];
}
function dtrCSV(employees,rows,pays,start,end){
  const employeeMap=new Map(employees.map(e=>[e.id,e])),payMap=new Map(pays.map(p=>[p.emp_id+'|'+p.date,p]));
  const header=['emp_no','name','shift_date','calendar_date','status','scheduled_in','scheduled_out','actual_in','actual_out','break_min','duty_code','rule_id','rule_effective_from','regular_hours','ot_hours','nsd_hours','source','verified','reviewed','locked'];
  if(W())header.push('wage_effective_from','daily_rate','normal_hours','base','premium','ot_amount','nsd_amount','gross');
  const result=[header];
  for(const r of rows){
    const e=employeeMap.get(r.emp_id);if(!e)continue;
    const pay=payMap.get(r.emp_id+'|'+r.date),segments=r.segments?.length?r.segments:[{date:r.date,code:r.duty_code,reg:0,ot:0,nsd:0,nsdOt:0}];
    for(const s of segments.filter(s=>s.date>=start&&s.date<=end)){
      const comp=pay?.comps?.segs?.find(p=>p.date==s.date),snapshot=r.schedule_snapshot||{},line=[e.emp_no,`${e.last_name}, ${e.first_name}`,r.date,s.date,r.type,snapshot.time_in,snapshot.time_out,r.time_in,r.time_out,r.break_min,s.code,s.rule_id||comp?.rule_id,s.rule_from||comp?.rule_from,s.reg/60,s.ot/60,(s.nsd+s.nsdOt)/60,r.source,!!r.verified,!!r.reviewed,isLocked(s.date)];
      if(W())line.push(pay?.comps?.wage_from,pay?.comps?.daily,pay?.comps?.hpd,comp?.base,comp?.prem,comp?.otAmt,comp?.nsdAmt,comp?.gross);
      result.push(line);
    }
  }
  return result;
}
