/* Additional workspace screens and compact attendance interactions. */
const leaveLabel=type=>type==='LEAVE'?'Leave · with pay':type==='LEAVE-U'?'Leave · without pay':type;
function dashboardTrend(ds,employees){
 const elapsed=ds.filter(d=>d<=manilaToday()).slice(-7),rows=elapsed.map(date=>{let duty=0,absence=0,leave=0,unverified=0;employees.forEach(e=>{if(isNA(e,date))return;const row=A[e.id+'|'+date];if(row?.verified&&(+row.reg_min||0)+(+row.ot_min||0)>0)duty++;else if(['ABSENT','AWOL/P'].includes(row?.type))absence++;else if(['LEAVE','LEAVE-U'].includes(row?.type))leave++;else if(!isRD(e,date)&&['OD','SWD'].includes(dayCode(e,date)))unverified++});return{date,duty,absence,leave,unverified}});
 return `<section class="dashboard-panel dashboard-activity"><div class="panel-heading"><h3>Recent attendance</h3><button class="btn ghost" data-v="analytics">${svg('chart')}Analytics${svg('arrow')}</button></div><div class="wrap compact-table"><table><thead><tr><th>Date</th><th>Verified duty</th><th>Absent / AWOL</th><th>Leave</th><th>Unverified</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.date}</td><td>${r.duty}</td><td>${r.absence}</td><td>${r.leave}</td><td>${r.unverified}</td></tr>`).join('')||'<tr><td colspan="5">No elapsed dates in this cut-off.</td></tr>'}</tbody></table></div></section>`;
}
const AUDIT_SCOPES=[['employees','Employees'],['attendance','Attendance'],['schedules','Schedules'],['standards','Standards'],['pay','Pay rules & wages'],['users','Users'],['comments','Comments'],['cutoffs','Cut-off locks']];
const auditCategory=table=>({employees:'employees',emp_supervisors:'employees',attendance:'attendance',attendance_pay:'attendance',duty_blocks:'schedules',employee_assignment_versions:'schedules',employee_pay:'pay',wage_history:'pay',duty_pay_rules:'pay',profiles:'users',attendance_comments:'comments',cutoff_locks:'cutoffs'})[table]||'standards';
function auditAllowed(table,state=S){const config=state.audit_settings?.[0];return table==='audit_settings'||((config?.enabled??true)&&(config?.scopes||AUDIT_SCOPES.map(x=>x[0])).includes(auditCategory(table)))}
function demoAudit(table,old,row,state=S){if(table==='audit_log'||!auditAllowed(table,state))return;state.audit_log.push({id:uid(),at:new Date().toISOString(),user_email:P?.email||'demo',action:table+'.'+(!row?'delete':old?'update':'insert'),detail:{category:table==='audit_settings'?'settings':auditCategory(table),old:old||null,new:row||null}})}

async function auditView(){
 if(!SAD())throw Error('Superadmin only');
 const config=(await API.list('audit_settings'))[0],logs=await auditList();
 if(!SAD()||V!=='audit')return;
 if(!config)throw Error('Audit settings unavailable. Apply migration 006_audit_controls.sql.');
 $('mn').innerHTML=`<form id="audit-form" class="compact-settings"><label><input type="checkbox" id="audit-enabled" ${config.enabled?'checked':''}> Capture audit activity</label><div class="audit-scopes">${AUDIT_SCOPES.map(([key,label])=>`<label><input type="checkbox" name="audit-scope" value="${key}" ${config.scopes.includes(key)?'checked':''}> ${label}</label>`).join('')}</div><button class="btn p" type="submit">${svg('save')}Save audit settings</button><span class="mu">Settings changes are always logged. Attendance decisions and correction trails are retained independently.</span></form><div class="table-caption"><span>Latest 100 audit entries</span><label>Filter <input id="audit-search" type="search" placeholder="Action, user, or detail"></label></div><div class="wrap compact-table"><table><thead><tr><th>When (Manila)</th><th>User</th><th>Action</th><th>Detail</th></tr></thead><tbody id="audit-body"></tbody></table></div>`;
 const render=()=>{const q=$('audit-search').value.toLowerCase();$('audit-body').innerHTML=logs.filter(a=>JSON.stringify(a).toLowerCase().includes(q)).map(a=>`<tr><td>${esc(new Date(a.at).toLocaleString('en-PH',{timeZone:'Asia/Manila'}))}</td><td>${esc(a.user_email)}</td><td>${esc(a.action)}</td><td><details><summary>View detail</summary><pre class="audit-detail">${esc(JSON.stringify(a.detail,null,2))}</pre></details></td></tr>`).join('')||'<tr><td colspan="4" class="mu">No audit entries match.</td></tr>'};render();$('audit-search').oninput=render;
 $('audit-form').onsubmit=e=>{e.preventDefault();guard(async()=>{if(!SAD())throw Error('Superadmin only');const row={id:1,enabled:$('audit-enabled').checked,scopes:[...document.querySelectorAll('[name=audit-scope]:checked')].map(c=>c.value)};if(DEMO)await API.up('audit_settings',[row]);else{const{error}=await sb.from('audit_settings').update({enabled:row.enabled,scopes:row.scopes}).eq('id',1);if(error)throw error}toast('Audit settings saved');await auditView();AMSUI.enhance()},e.submitter||e.currentTarget.querySelector('[type="submit"]'))};
}

let analyticsRange=null,analyticsResult=null,analyticsMode='overview',analyticsRequest=0;
async function analyticsView(){
 const range=analyticsRange||rng();
 $('mn').innerHTML=`<form id="analytics-form" class="row analytics-controls"><label>From<input id="analytics-from" type="date" value="${range[0]}" required></label><label>To<input id="analytics-to" type="date" value="${range[1]}" required></label><label>Employee<input id="analytics-search" type="search" placeholder="Name or employee no."></label><label>Assignment<select id="analytics-site"><option value="">All locations</option>${[...new Set([...E.map(e=>e.site),...ASSIGNMENTS.map(v=>v.snapshot.employee.site)].filter(Boolean))].sort().map(s=>`<option>${esc(s)}</option>`).join('')}</select></label><button class="btn p" type="submit">${svg('check')}Apply</button><button class="btn" type="button" id="analytics-export">${svg('download')}Export CSV</button></form><div class="row analytics-tabs">${[['overview','Overview'],['employees','Employee attendance'],['workforce','Manpower / workforce'],['daily','Daily trend']].map(([k,l])=>`<button class="pill" data-analytics-tab="${k}" aria-pressed="${analyticsMode===k}">${svg(k==='workforce'?'users':['daily','overview'].includes(k)?'chart':'calendar')}${l}</button>`).join('')}</div><p class="mu analytics-note">Recorded attendance = verified worked scheduled days ÷ scheduled days. Blanks are unverified. Scheduled days exclude rest days and non-working holidays; headcount uses hire/separation dates. Assignment and department reflect current employee records. Maximum range: 366 days.</p><div id="analytics-totals" class="compact-totals"></div><div id="analytics-status" role="status" class="mu"></div><div id="analytics-overview" class="analytics-overview"></div><div class="wrap compact-table" id="analytics-data"><table id="analytics-table"></table></div>`;
 $('analytics-form').onsubmit=e=>{e.preventDefault();guard(analyticsLoad,e.submitter||e.currentTarget.querySelector('[type="submit"]'))};
 document.querySelectorAll('[data-analytics-tab]').forEach(b=>b.onclick=()=>{analyticsMode=b.dataset.analyticsTab;analyticsRender()});
 $('analytics-export').onclick=()=>{if(analyticsResult)dl('analytics-'+analyticsRange.join('_')+'.csv',analyticsTableData())};
 await analyticsLoad();
}
async function analyticsLoad(){
 const start=$('analytics-from').value,end=$('analytics-to').value;AMSAnalytics.dates(start,end);
 const request=++analyticsRequest,site=$('analytics-site').value,q=$('analytics-search').value.trim().toLowerCase();$('analytics-status').textContent='Loading analytics…';
 const records=await API.list('attendance',[addD(start,-1),end]);if(V!=='analytics'||request!==analyticsRequest)return;
 const employees=E.filter(e=>!q||`${e.emp_no} ${e.last_name} ${e.first_name}`.toLowerCase().includes(q));
 analyticsResult=AMSAnalytics.build({employees,attendance:records,start,end,context:employeeAt,include:e=>!site||e.site===site,isScheduled:(e,d)=>!isRD(e,d)&&['OD','SWD'].includes(dayCode(e,d))});analyticsRange=[start,end];$('analytics-search').dataset.appliedFilter=q;$('analytics-site').dataset.appliedFilter=site;analyticsRender();AMSWorkflows.syncFilters();$('analytics-status').textContent=`${start} — ${end} · ${analyticsResult.rows.length} employees`;
}
function analyticsTableData(){const r=analyticsResult;if(!r)return[];
 if(analyticsMode==='workforce')return[['Assignment','Department','Headcount at start','Headcount at end','Hires','Separations','Recorded hours'],...r.groups.map(g=>[g.site,g.department,g.start,g.end,g.hires,g.separations,g.hours.toFixed(2)])];
 if(['daily','overview'].includes(analyticsMode))return[['Date','Headcount','Scheduled','Worked','Absent / AWOL','Leave','Unverified','Recorded hours'],...r.daily.map(d=>[d.date,d.headcount,d.scheduled,d.worked,d.absent,d.leave,d.unverified,d.hours.toFixed(2)])];
 return[['Employee no.','Employee','Assignment','Scheduled days','Worked days','Recorded attendance %','Absent / AWOL','Leave with pay','Leave without pay','Unverified','Recorded hours','OT hours','Late / UT min'],...r.rows.map(x=>[x.e.emp_no,`${x.e.last_name}, ${x.e.first_name}`,x.e.site||'Unassigned',x.scheduled,x.worked,x.rate==null?'—':x.rate.toFixed(1)+'%',x.absent,x.paidLeave,x.unpaidLeave,x.unverified,x.hours.toFixed(2),x.ot.toFixed(2),x.late])];
}
function analyticsRender(){if(!$('analytics-table')||!analyticsResult)return;const r=analyticsResult,t=r.totals;
 $('analytics-totals').innerHTML=[['Employees',r.rows.length],['Headcount at end',r.endHeadcount],['Recorded hours',t.hours.toFixed(2)],['Recorded attendance',t.rate==null?'—':t.rate.toFixed(1)+'%'],['Unverified days',t.unverified]].map(([l,v])=>`<div><span>${l}</span><strong>${v}</strong></div>`).join('');
 document.querySelectorAll('[data-analytics-tab]').forEach(b=>{b.classList.toggle('on',b.dataset.analyticsTab===analyticsMode);b.setAttribute('aria-pressed',String(b.dataset.analyticsTab===analyticsMode))});
 const overview=analyticsMode==='overview';$('analytics-overview').hidden=!overview;$('analytics-data').hidden=overview;
 if(overview){$('analytics-overview').innerHTML=AMSAnalyticsCharts.render(r);return}
 $('analytics-overview').replaceChildren();
 const [headers,...rows]=analyticsTableData();$('analytics-table').innerHTML=`<thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${headers.length}">No matching records.</td></tr>`}</tbody>`;
}

function overridePicker(){return `<div class="duty-code-picker"><label id="override-label" for="override-toggle">Override duty code (authorized)</label><select id="dov" hidden aria-hidden="true" tabindex="-1"><option value="">Auto (derived)</option>${RS.map(q=>`<option value="${q[0]}">${q[0]} | ${esc(q[1].replace(/\b\w/g,c=>c.toUpperCase()))}</option>`).join('')}</select><button type="button" class="btn code-trigger" id="override-toggle" aria-haspopup="listbox" aria-expanded="false" aria-controls="override-list" aria-labelledby="override-label override-value"><span id="override-value">Auto (derived)</span>${svg('down')}</button><div class="code-dropdown" id="override-list" role="listbox" aria-label="Override duty code" hidden><div class="code-list-header" aria-hidden="true"><span>Code</span><span>Description</span></div>${[['','Auto (derived from calendar)'],...RS.map(q=>[q[0],q[1]])].map(([code,label])=>`<button type="button" role="option" data-ui-icon="none" aria-selected="false" data-override="${code}"><strong>${code||'AUTO'}</strong><span>${esc(label)}</span></button>`).join('')}</div></div>`}
function syncOverride(){if(!$('dov'))return;const code=$('dov').value;$('override-value').innerHTML=code?`<strong>${esc(code)}</strong><span>${esc(RS.find(q=>q[0]===code)?.[1]||code)}</span>`:'Auto (derived)';document.querySelectorAll('[data-override]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.override===code)))}
function closeOverride(focus=false){if(!$('override-list'))return;$('override-list').hidden=true;$('override-toggle').setAttribute('aria-expanded','false');if(focus)$('override-toggle').focus()}
document.addEventListener('click',e=>{const toggle=e.target.closest?.('#override-toggle'),option=e.target.closest?.('[data-override]');if(toggle){const open=$('override-list').hidden;$('override-list').hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open)document.querySelector('[data-override][aria-selected=true]')?.focus()}else if(option){$('dov').value=option.dataset.override;$('dov').dispatchEvent(new Event('change',{bubbles:true}));closeOverride(true)}else if(!e.target.closest?.('.duty-code-picker'))closeOverride()});
document.addEventListener('change',e=>{if(e.target.id==='dov')syncOverride()});
document.addEventListener('keydown',e=>{if(!$('override-list')||$('override-list').hidden)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeOverride(true)}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=[...document.querySelectorAll('[data-override]')],i=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus()}else if(e.key==='Tab')closeOverride()},true);

let commentAnchor=null,commentPinned=false;
let commentSaving=false;
async function postComment(){
 if(commentSaving)return;
 const body=$('cb').value.trim();if(!body)throw Error('Write a comment first');if(body.length>4000)throw Error('Comments must be 4000 characters or less');
 const button=document.querySelector('[data-act=cadd]'),c={id:uid(),emp_id:CT.emp,date:CT.date,body,author_email:(DEMO?P?.email:user?.email)||P?.email||'demo',created_at:new Date().toISOString()};
 commentSaving=true;button.disabled=true;
 try{
  if(DEMO){const draft=structuredClone(S);draft.attendance_comments.push(c);demoAudit('attendance_comments',null,c,draft);localStorage.setItem('ams',JSON.stringify(draft));S=draft}
  else{const{error}=await sb.from('attendance_comments').insert(c);if(error)throw error}
  CM.push(c);closeM();grid();toast('Comment saved');
 }finally{commentSaving=false;if(button.isConnected)button.disabled=false}
}
function hideComment(){document.getElementById('comment-popover')?.remove();if(commentAnchor)commentAnchor.setAttribute('aria-expanded','false');commentAnchor=null;commentPinned=false}
function showComment(cell,pinned=false){
 const r=+cell.dataset.r,c=+cell.dataset.c,e=slice('att',fe())[r],date=days()[c],comments=CM.filter(x=>x.emp_id===e?.id&&x.date===date);if(!comments.length)return;
 if(commentAnchor!==cell)hideComment();commentAnchor=cell;commentPinned=pinned||commentPinned;cell.setAttribute('aria-expanded','true');
 let panel=$('comment-popover');if(!panel){panel=document.createElement('div');panel.id='comment-popover';panel.className='comment-popover';panel.setAttribute('role','note');document.body.append(panel);panel.onpointerleave=()=>{if(!commentPinned&&!cell.contains(document.activeElement))hideComment()}}
 panel.innerHTML=comments.map(x=>`<article><strong>${esc(x.author_email)}</strong><small>${esc(new Date(x.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'}))}</small><p>${esc(x.body)}</p></article>`).join('')+`<button type="button" class="btn" data-comment-edit="${r},${c}">${svg('message')}Open comments</button>`;
 const rect=cell.getBoundingClientRect();panel.style.left=Math.max(8,Math.min(rect.left,innerWidth-panel.offsetWidth-8))+'px';panel.style.top=Math.max(8,Math.min(rect.bottom+5,innerHeight-panel.offsetHeight-8))+'px';
}
document.addEventListener('pointerover',e=>{const cell=e.target.closest?.('td.c.cm');if(cell&&cell!==commentAnchor)showComment(cell)});
document.addEventListener('pointerout',e=>{if(!commentPinned&&commentAnchor&&commentAnchor.contains(e.target)&&!commentAnchor.contains(e.relatedTarget)&&!e.relatedTarget?.closest?.('#comment-popover'))hideComment()});
document.addEventListener('focusin',e=>{const cell=e.target.closest?.('td.c.cm');if(cell)showComment(cell);else if(!e.target.closest?.('#comment-popover')&&!commentPinned)hideComment()});
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-comment-toggle]'),edit=e.target.closest?.('[data-comment-edit]'),cell=e.target.closest?.('td.c');if(button){if(commentAnchor===cell&&commentPinned)hideComment();else showComment(cell,true)}else if(edit){const cl=edit.dataset.commentEdit.split(',').map(Number);hideComment();cmtM(cl)}else if(cell&&!W()){if(cell.classList.contains('cm'))showComment(cell,true);else cmtM([+cell.dataset.r,+cell.dataset.c])}else if(!e.target.closest?.('#comment-popover'))hideComment()});
document.addEventListener('keydown',e=>{const cell=e.target.closest?.('td.c');if(cell&&e.target===cell&&!W()&&['Enter',' '].includes(e.key)){e.preventDefault();if(cell.classList.contains('cm'))showComment(cell,true);else cmtM([+cell.dataset.r,+cell.dataset.c])}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideComment()});
window.addEventListener('resize',hideComment);
document.addEventListener('wheel',hideComment,{passive:true});
