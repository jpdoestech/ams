/* Shared modal structure, filter feedback, and dependent employee lookups. */
(function(root){
 function layoutModal(dialog){
  const close=dialog.querySelector('.dialog-close'),content=dialog.querySelector(':scope > #dm')||dialog;
  const title=content.querySelector(':scope > .employee-form-header,:scope > h3'),last=content.lastElementChild;
  const actions=last&&last!==title&&last!==close&&last.querySelector(':scope > button')&&!last.querySelector('input,select,textarea')?last:null;
  const header=document.createElement('header');header.className='modal-header';if(title)header.append(title);if(close)header.append(close);
  const footer=document.createElement('footer');footer.className='modal-footer';if(actions)footer.append(actions);
  let body;
  if(content!==dialog){body=content;body.classList.add('modal-body')}
  else{body=document.createElement('div');body.className='modal-body';while(dialog.firstChild)body.append(dialog.firstChild)}
  dialog.replaceChildren(header,body,footer);
 }
 function syncFilters(){
  const main=document.getElementById('mn');if(!main)return;
  const candidates=[...main.querySelectorAll('#q,#fq,#fs,#fd,#fp,#analytics-search,#analytics-site,#audit-search')];
  const labels={q:'Search',fq:'Search',fs:'Assignment',fd:'Department',fp:'Position','analytics-search':'Employee','analytics-site':'Assignment','audit-search':'Search'};
  const applied=candidates.map(el=>({el,value:el.id.startsWith('analytics-')?(el.dataset.appliedFilter||''):el.value.trim()}));
  for(const {el,value} of applied)el.classList.toggle('is-filtered',!!value);
  const entries=applied.filter(x=>x.value).map(({el,value})=>[labels[el.id],value]);
  let indicator=main.querySelector(':scope > .filter-indicator');
  if(entries.length&&!indicator){indicator=document.createElement('div');indicator.className='filter-indicator';indicator.setAttribute('role','status');const anchor=main.querySelector('.filter-disclosure')||candidates[0]?.closest('.row,.table-caption');if(anchor)anchor.after(indicator);else main.prepend(indicator)}
  if(indicator){const signature=JSON.stringify(entries);indicator.hidden=!entries.length;if(indicator.dataset.filters!==signature){indicator.dataset.filters=signature;indicator.innerHTML='<strong>Filtered</strong>'+entries.map(([label,value])=>`<span>${esc(label)}: ${esc(value)}</span>`).join('')}}
  document.querySelectorAll('[data-flt]').forEach(input=>{
   const value=input.value.trim();input.classList.toggle('is-filtered',!!value);let status=input.nextElementSibling;if(!status?.matches('.list-filter-status')){status=document.createElement('small');status.className='list-filter-status';status.setAttribute('role','status');input.after(status)}
   status.hidden=!value;const text=value?'Filtered: '+value:'';if(status.textContent!==text)status.textContent=text;
  });
 }
 let filterQueued=false;
 function queueFilters(){if(filterQueued)return;filterQueued=true;queueMicrotask(()=>{filterQueued=false;syncFilters()})}
 root.AMSWorkflows={layoutModal,syncFilters};document.addEventListener('input',queueFilters);document.addEventListener('change',queueFilters);
})(globalThis);

function positionsFor(department){
 const id=LK.find(x=>x.kind==='department'&&x.value===department)?.id;
 return LK.filter(x=>x.kind==='position'&&DPM.some(m=>m.department_id===id&&m.position_id===x.id)).map(x=>x.value).sort();
}
function positionOptions(department,value='',preserve=false){const options=positionsFor(department);if(preserve&&value&&!options.includes(value))options.push(value);return `<option value="">${department?'Select position':'Select department first'}</option>`+options.map(v=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(v)}</option>`).join('')}
function syncEmployeePosition(value='',preserve=false){const department=$('f_department')?.value,position=$('f_position');if(!position)return;position.innerHTML=positionOptions(department,value,preserve);position.disabled=!W()||!department;const add=document.querySelector('[data-quick-add=position]');if(add)add.disabled=!department}
function lookupControl(f,e){const kind=f[0],value=e[kind]||'',position=kind==='position';return `<div class="lookup-control"><select id="f_${kind}" ${position&&!e.department?'disabled':''}>${position?positionOptions(e.department,value,true):`<option value=""></option>${[...new Set([...lk('department'),...(value?[value]:[])])].map(v=>`<option ${v===value?'selected':''}>${esc(v)}</option>`).join('')}`}</select>${W()?`<button type="button" class="btn icon-button" data-quick-add="${kind}" aria-label="Add ${kind}" title="Add ${kind}" ${position&&!e.department?'disabled':''}>${svg('plus')}</button>`:''}</div>`}
function quickLookup(kind){
 if(!W())return;const department=$('f_department').value;if(kind==='position'&&!department)return toast('Select a department first');const panel=$('employee-lookup-editor');panel.hidden=false;panel.dataset.kind=kind;
 panel.innerHTML=`<div class="quick-lookup-title">${svg('plus')}Add ${kind}${kind==='position'?' to '+esc(department):''}</div><div class="row"><label>${kind==='position'?'Position (new or existing)':'Department'}<input id="quick-lookup-value" maxlength="120" list="quick-lookup-values"></label><datalist id="quick-lookup-values">${lk(kind).map(v=>`<option value="${esc(v)}"></option>`).join('')}</datalist><button type="button" class="btn p" data-quick-save>${svg('save')}Add</button><button type="button" class="btn" data-quick-cancel>${svg('close')}Cancel</button></div>`;$('quick-lookup-value').focus();panel.scrollIntoView?.({block:'nearest'});
}
async function saveQuickLookup(){
 if(!W())throw Error('Staff access required');const panel=$('employee-lookup-editor'),kind=panel.dataset.kind,name=$('quick-lookup-value').value.trim(),department=$('f_department').value,button=panel.querySelector('[data-quick-save]');if(!name)throw Error('Enter a '+kind);if(kind==='position'&&!department)throw Error('Select a department first');button.disabled=true;
 try{
  let entry=LK.find(x=>x.kind===kind&&x.value.toLowerCase()===name.toLowerCase());if(!entry){entry={id:uid(),kind,value:name,sort:0};await API.up('lookups',[entry]);LK.push(entry)}
  if(kind==='department'){$('f_department').innerHTML='<option value=""></option>'+lk('department').map(v=>`<option value="${esc(v)}" ${v===entry.value?'selected':''}>${esc(v)}</option>`).join('');syncEmployeePosition()}
  else{const parent=LK.find(x=>x.kind==='department'&&x.value===department);const mapping={department_id:parent.id,position_id:entry.id};await API.up('department_positions',[mapping]);if(!DPM.some(m=>m.department_id===mapping.department_id&&m.position_id===mapping.position_id))DPM.push(mapping);syncEmployeePosition(entry.value)}
  panel.hidden=true;toast(kind==='department'?'Department added':'Position linked to department');
 }finally{if(button.isConnected)button.disabled=false}
}
document.addEventListener('change',e=>{if(e.target.id==='f_department')syncEmployeePosition()});
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-quick-add],[data-quick-save],[data-quick-cancel]');if(!button)return;if(button.hasAttribute('data-quick-add'))quickLookup(button.dataset.quickAdd);else if(button.hasAttribute('data-quick-save'))guard(saveQuickLookup);else $('employee-lookup-editor').hidden=true});

document.addEventListener('change',e=>{if(e.target.id==='f_location_region')$('f_location').innerHTML=cityOpts(e.target.value,'')});
