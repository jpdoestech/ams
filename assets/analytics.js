/* Date-bounded attendance and workforce measures; blanks never count as work. */
(function(root){
 function dates(start,end){
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
  if(!valid(start)||!valid(end)||end<start)throw Error('Choose a valid start and end date');
  const length=(Date.parse(end)-Date.parse(start))/864e5+1;
  if(length>366)throw Error('Choose a range of up to 366 days');
  return Array.from({length},(_,i)=>new Date(Date.parse(start)+i*864e5).toISOString().slice(0,10));
 }
 function build({employees,attendance,start,end,isScheduled=()=>true,context=e=>e,include=()=>true}){
  const ds=dates(start,end),within=d=>d>=start&&d<=end;
  const employed=(e,d)=>(!e.date_hired||e.date_hired<=d)&&(!e.date_end||e.date_end>=d)&&((e.status||'Active')==='Active'||!!e.date_end);
  const index=new Map(),worked=new Map();
  attendance.forEach(r=>{
   index.set(r.emp_id+'|'+r.date,r);
   if(!r.verified)return;
   const segments=r.segments?.length?r.segments:[{date:r.date,reg:r.reg_min||0,ot:r.ot_min||0}];
   segments.forEach(s=>{if(!within(s.date))return;const minutes=(+s.reg||0)+(+s.ot||0);if(minutes<=0)return;const e=employees.find(e=>e.id===r.emp_id);if(!e)return;const assignment={...context(e,s.date),...(r.schedule_snapshot||{})};if(!include(assignment,s.date))return;const k=r.emp_id+'|'+s.date,v=worked.get(k)||{minutes:0,ot:0,allocations:[]};v.minutes+=minutes;v.ot+=(+s.ot||0);v.allocations.push({assignment,hours:minutes/60});worked.set(k,v)});
  });
  const people=employees.filter(e=>ds.some(d=>include(context(e,d),d)&&(employed(e,d)||index.has(e.id+'|'+d)))||ds.some(d=>worked.has(e.id+'|'+d)));
  const daily=ds.map(date=>({date,headcount:people.filter(e=>employed(e,date)&&include(context(e,date),date)).length,scheduled:0,worked:0,absent:0,leave:0,unverified:0,hours:0}));
  const rows=people.map(e=>{
   const row={e:context(e,end),scheduled:0,worked:0,scheduledWorked:0,absent:0,paidLeave:0,unpaidLeave:0,unverified:0,hours:0,ot:0,late:0};
   ds.forEach((d,i)=>{
    if(e.date_hired&&d<e.date_hired||e.date_end&&d>e.date_end)return;
    const current=context(e,d),r=index.get(e.id+'|'+d),w=worked.get(e.id+'|'+d),included=include(current,d),scheduled=included&&employed(e,d)&&isScheduled(current,d)&&!['N/A','DAY-OFF'].includes(r?.type),day=daily[i];
    if(scheduled){row.scheduled++;day.scheduled++}
    if(w){row.worked++;row.hours+=w.minutes/60;row.ot+=w.ot/60;day.worked++;day.hours+=w.minutes/60;if(scheduled)row.scheduledWorked++}
    if(!included)return;
    if(!r){if(scheduled&&!w){row.unverified++;day.unverified++}return}
    if(r.type==='ABSENT'||r.type==='AWOL/P'){row.absent++;day.absent++}
    if(r.type==='LEAVE'){row.paidLeave++;day.leave++}
    if(r.type==='LEAVE-U'){row.unpaidLeave++;day.leave++}
    if(scheduled&&!w&&['PRESENT','LATE/UT'].includes(r.type)){row.unverified++;day.unverified++}
    row.late+=(+r.late||0)+(+r.ut||0);
   });
   row.rate=row.scheduled?row.scheduledWorked/row.scheduled*100:null;return row;
  });
  const groups=new Map(),group=e=>{const site=e.site||'Unassigned',department=e.department||'Unassigned',key=JSON.stringify([site,department]);if(!groups.has(key))groups.set(key,{site,department,start:0,end:0,hires:0,separations:0,hours:0});return groups.get(key)};
  people.forEach(e=>{
   for(const [date,key] of [[start,'start'],[end,'end']]){const x=context(e,date);if(employed(e,date)&&include(x,date))group(x)[key]++}
   for(const [date,key] of [[e.date_hired,'hires'],[e.date_end,'separations']])if(date&&within(date)){const x=context(e,date);if(include(x,date))group(x)[key]++}
   ds.forEach(d=>(worked.get(e.id+'|'+d)?.allocations||[]).forEach(a=>group(a.assignment).hours+=a.hours));
  });
  const totals=rows.reduce((t,r)=>{for(const k of ['scheduled','worked','scheduledWorked','absent','paidLeave','unpaidLeave','unverified','hours','ot','late'])t[k]+=r[k];return t},Object.fromEntries(['scheduled','worked','scheduledWorked','absent','paidLeave','unpaidLeave','unverified','hours','ot','late'].map(k=>[k,0])));
  totals.rate=totals.scheduled?totals.scheduledWorked/totals.scheduled*100:null;
  return{rows,daily,groups:[...groups.values()],totals,startHeadcount:daily[0].headcount,endHeadcount:daily.at(-1).headcount};
 }
 root.AMSAnalytics={dates,build};if(typeof module!=='undefined')module.exports=root.AMSAnalytics;
})(globalThis);
