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
function employeeField(id){return employeeDraft?.querySelector('#'+id)||$(id)}
function syncEmployeePosition(value='',preserve=false){const department=employeeField('f_department')?.value,position=employeeField('f_position');if(!position)return;position.innerHTML=positionOptions(department,value,preserve);position.disabled=!W()||!department;const add=(employeeDraft||document).querySelector('[data-quick-add=position]');if(add)add.disabled=!department}
function lookupControl(f,e){const kind=f[0],value=e[kind]||'',position=kind==='position';return `<div class="lookup-control"><select id="f_${kind}" ${position&&!e.department?'disabled':''}>${position?positionOptions(e.department,value,true):`<option value=""></option>${[...new Set([...lk('department'),...(value?[value]:[])])].map(v=>`<option ${v===value?'selected':''}>${esc(v)}</option>`).join('')}`}</select>${W()?`<button type="button" class="btn icon-button" data-quick-add="${kind}" aria-label="Add ${kind}" title="Add ${kind}" ${position&&!e.department?'disabled':''}>${svg('plus')}</button>`:''}</div>`}
function quickLookup(kind){
 if(!W()||!['department','position'].includes(kind))return;const department=$('f_department').value;if(kind==='position'&&!department)return toast('Select a department first');
 employeeDraft=$('ov').firstElementChild;employeeDraftFocus=`[data-quick-add="${kind}"]`;
 modal(`<h3>Add ${kind}</h3><div id="employee-lookup-editor" data-kind="${kind}"><p>${kind==='position'?'Department: '+esc(department):'Create a department for this employee.'}</p><label>${kind==='position'?'Position (new or existing)':'Department'}<input id="quick-lookup-value" maxlength="120" list="quick-lookup-values"></label><datalist id="quick-lookup-values">${lk(kind).map(v=>`<option value="${esc(v)}"></option>`).join('')}</datalist></div><div class="row"><button type="button" class="btn" data-act="cm">Cancel</button><button type="button" class="btn p" data-quick-save>${svg('save')}Add</button></div>`);$('quick-lookup-value').focus();
}
async function saveQuickLookup(){
 if(!W())throw Error('Staff access required');const draft=employeeDraft,panel=$('employee-lookup-editor'),kind=panel.dataset.kind,name=$('quick-lookup-value').value.trim(),department=employeeField('f_department').value,button=document.querySelector('[data-quick-save]');if(!name)throw Error('Enter a '+kind);if(kind==='position'&&!department)throw Error('Select a department first');button.disabled=true;
 try{
  let entry=LK.find(x=>x.kind===kind&&x.value.toLowerCase()===name.toLowerCase());if(!entry){entry={id:uid(),kind,value:name,sort:0};await API.up('lookups',[entry]);LK.push(entry)}
  if(employeeDraft!==draft)return;
  if(kind==='department'){employeeField('f_department').innerHTML='<option value=""></option>'+lk('department').map(v=>`<option value="${esc(v)}" ${v===entry.value?'selected':''}>${esc(v)}</option>`).join('');syncEmployeePosition()}
  else{const parent=LK.find(x=>x.kind==='department'&&x.value===department);const mapping={department_id:parent.id,position_id:entry.id};await API.up('department_positions',[mapping]);if(employeeDraft!==draft)return;if(!DPM.some(m=>m.department_id===mapping.department_id&&m.position_id===mapping.position_id))DPM.push(mapping);syncEmployeePosition(entry.value)}
  closeM();toast(kind==='department'?'Department added':'Position linked to department');
 }finally{if(button.isConnected)button.disabled=false}
}
document.addEventListener('change',e=>{if(e.target.id==='f_department')syncEmployeePosition()});
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-quick-add],[data-quick-save],[data-quick-cancel]');if(!button)return;if(button.hasAttribute('data-quick-add'))quickLookup(button.dataset.quickAdd);else if(button.hasAttribute('data-quick-save'))guard(saveQuickLookup,button);else closeM()});

function addressInput(id,kind,value='',region=''){
 const values=kind==='city'?AMSAddresses.citiesFor(region,LK).map(x=>x.value):lk('region');
 return `<input id="${id}" list="${id}-values" value="${esc(value)}" placeholder="Search or type ${kind}" autocomplete="off"><datalist id="${id}-values">${values.map(v=>`<option value="${esc(v)}"></option>`).join('')}</datalist>`;
}
function syncEmployeeRate(){
 const rate=$('p_rate');if(!rate)return;const override=$('p_override').checked;
 rate.readOnly=!override;
 if(!override)rate.value=AMSAddresses.entries('region',LK).find(x=>x.value===$('f_region').value.trim())?.daily_rate??'';
 $('p_rate_help').textContent=override?'Employee override; changing region keeps this rate.':rate.value===''?'No regional daily rate configured. Set it in Standards → Regions, or enable an override.':'Regional default; saved with the rate effective date.';
}
document.addEventListener('input',e=>{if(e.target.id==='f_region')syncEmployeeRate()});
document.addEventListener('change',e=>{
 const kind={f_region:'region',f_location:'city',str:'region',stc:'city'}[e.target.id];
 if(kind){const value=e.target.value.trim();e.target.value=AMSAddresses.entries(kind,LK).find(x=>x.value.toLowerCase()===value.toLowerCase())?.value||value}
 if(e.target.id==='p_override')syncEmployeeRate();
 if(e.target.id==='f_region'){
  const region=e.target.value.trim(),city=$('f_location'),value=city.value;
  $('f_location-values').innerHTML=AMSAddresses.citiesFor(region,LK).map(x=>`<option value="${esc(x.value)}"></option>`).join('');
  if(value&&!AMSAddresses.citiesFor(region,LK).some(x=>x.value===value))city.value='';
  syncEmployeeRate();
 }
});

function regionRateModal(region){
 if(!W())return;const entry=AMSAddresses.entries('region',LK).find(x=>x.value===region);if(!entry)return;
 modal(`<h3>Regional daily rate</h3><p>${esc(region)}</p><label>Daily rate (₱)<input id="region-rate" type="number" min="0" step="0.01" value="${entry.daily_rate??''}"></label><p class="mu">Default for employee pay profiles when saved. Existing dated wages and finalized pay remain unchanged.</p><div class="row"><button class="btn" data-act="cm">Cancel</button><button class="btn p" data-region-rate-save="${esc(region)}">Save rate</button></div>`);
}
async function saveRegionRate(region){
 if(!W())throw Error('Staff access required');const input=$('region-rate'),rate=Number(input.value);if(input.value===''||!Number.isFinite(rate)||rate<0)throw Error('Enter a valid daily rate');
 const existing=LK.find(x=>x.kind==='region'&&x.value===region),entry={...(existing||{id:uid(),kind:'region',value:region,sort:0}),daily_rate:rate};
 await API.up('lookups',[entry]);if(existing)Object.assign(existing,entry);else LK.push(entry);closeM();stdv();
}
document.addEventListener('click',e=>{
 const button=e.target.closest?.('[data-region-rate],[data-region-rate-save]');if(!button)return;
 if(button.hasAttribute('data-region-rate'))regionRateModal(button.dataset.regionRate);else guard(()=>saveRegionRate(button.dataset.regionRateSave),button);
});

function formatContact(value){const digits=String(value||'').replace(/\D/g,'').slice(0,11);return [digits.slice(0,4),digits.slice(4,7),digits.slice(7,11)].filter(Boolean).join('-')}
function contactValue(value,previous){
 const text=String(value||'').trim();if(!text)return null;
 if(text===previous&&!/^09\d{9}$|^09\d{2}-\d{3}-\d{4}$/.test(text))return previous;
 if(!/^09\d{9}$|^09\d{2}-\d{3}-\d{4}$/.test(text))throw Error('Contact number must contain 11 digits and start with 09');
 return formatContact(text);
}
function contactInput(id,value){const text=/^09\d{9}$|^09\d{2}-\d{3}-\d{4}$/.test(value||'')?formatContact(value):value||'';return `<input id="${id}" type="tel" data-contact inputmode="numeric" autocomplete="tel-national" maxlength="13" pattern="09[0-9]{2}-[0-9]{3}-[0-9]{4}" placeholder="0917-123-4567" value="${esc(text)}"><small class="mu">11 digits, starting with 09</small>`}
document.addEventListener('input',event=>{
 if(!event.target.matches('[data-contact]'))return;
 const input=event.target,position=input.selectionStart,digitsBefore=input.value.slice(0,position).replace(/\D/g,'').length;
 input.value=formatContact(input.value);const next=digitsBefore+(digitsBefore>4?1:0)+(digitsBefore>7?1:0);input.setSelectionRange(next,next);
});
