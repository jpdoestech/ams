/* Shared SVG language and progressive enhancement for the existing vanilla app. */
(function(root){
  const paths={
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-13 5h2m4 0h2"/>',
    chart:'<path d="M3 3v18h18M7 16v-5m5 5V7m5 9v-8"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    shield:'<path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z"/><path d="m8 12 3 3 5-6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
    upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
    edit:'<path d="m16 3 5 5-12 12H4v-5L16 3Zm-2 2 5 5"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8"/>',
    columns:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-18v18"/>',
    reset:'<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7"/>',
    lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    refresh:'<path d="M20 7a8 8 0 0 0-14-2L3 8m0-5v5h5m-4 9a8 8 0 0 0 14 2l3-3m0 5v-5h-5"/>',
    logout:'<path d="M9 21H4V3h5m5 14 5-5-5-5m-6 5h13"/>',
    login:'<path d="M15 3h5v18h-5M10 7l5 5-5 5M3 12h12"/>',
    coffee:'<path d="M3 8h14v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8Zm14 0h2a3 3 0 1 1 0 6h-2M6 2v3m4-3v3m4-3v3"/>',
    absent:'<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a6 6 0 0 1 11-3m3-2 6 6m0-6-6 6"/>',
    alert:'<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3h.01"/>',
    minus:'<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    eraser:'<path d="m16 3 5 5-12 12H5l-4-4L16 3Zm-9 7 7 7m0 3h8"/>',
    message:'<path d="M21 15a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9Z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon:'<path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/>',
    monitor:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    left:'<path d="m15 6-6 6 6 6"/>',right:'<path d="m9 6 6 6-6 6"/>',up:'<path d="m6 15 6-6 6 6"/>',down:'<path d="m6 9 6 6 6-6"/>',
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    store:'<path d="m3 3-1 7a4 4 0 0 0 4 2 4 4 0 0 0 6 0 4 4 0 0 0 6 0 4 4 0 0 0 4-2l-1-7H3Zm1 10v8h16v-8M9 21v-6h6v6"/>',
    search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>'
  };
  const icon=(name)=>`<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||paths.grid}</svg>`;
  const actionIcons={eadd:'plus',eedit:'edit',edel:'trash',esave:'save',eimp:'upload',eexp:'download',esch:'calendar',col:'columns',fld:'settings',creset:'reset',csave:'check',fadd:'plus',frn:'edit',frsave:'save',ftog:'settings',lkadd:'plus',lkdel:'trash',stnew:'plus',stedit:'edit',stsave:'save',stdel:'trash',stimp:'upload',stexp:'download',supnew:'plus',supedit:'edit',supsave:'save',supdel:'trash',sadd:'plus',sdel:'trash',ssave:'save',lock:'lock',rulenew:'plus',rulesave:'save',dsave:'save',aimp:'upload',aexp:'download',sexp:'download',xsum:'download',xdet:'download',xdtr:'download',sgo:'check',cm:'close',cl:'close',in:'login',out:'logout',up:'shield',cadd:'message',fclr:'reset',hol:'calendar',hadd:'plus',hdel:'trash',lsave:'save',sync:'refresh'};
  const toolIcons={DUTY:'clock',ABSENT:'absent',LEAVE:'calendar','LEAVE-U':'calendar','DAY-OFF':'coffee','AWOL/P':'alert','LATE/UT':'clock','N/A':'minus',CLEAR:'eraser'};
  function syncNavigation(){
    const mobile=root.innerWidth<=760,open=mobile&&document.documentElement.classList.contains('nav-open');
    const sidebar=document.querySelector('.sidebar'),workspace=document.querySelector('.workspace'),toggle=document.querySelector('[data-nav-toggle]');
    if(sidebar)sidebar.inert=mobile&&!open;
    if(workspace)workspace.inert=open;
    toggle?.setAttribute('aria-expanded',String(open));
  }
  function setNavigation(open,focus=true){
    const wasOpen=document.documentElement.classList.contains('nav-open');
    document.documentElement.classList.toggle('nav-open',Boolean(open)&&root.innerWidth<=760);syncNavigation();
    if(focus&&open)document.querySelector('.sidebar [data-v]')?.focus();
    else if(focus&&wasOpen)document.querySelector('[data-nav-toggle]')?.focus();
  }
  function enhance(container=document){
    container.querySelectorAll('button').forEach(button=>{
      if(button.querySelector('.icon')||button.dataset.uiIcon==='none')return;
      let name=actionIcons[button.dataset.act]||toolIcons[button.dataset.t];
      if(button.dataset.mv)name=+button.dataset.mv<0?'up':'down';
      if(button.dataset.pg)name=+button.dataset.d<0?'left':'right';
      if(button.hasAttribute('data-import-apply'))name='upload';
      if(button.dataset.stab)name={val:'settings',sto:'store',sup:'users',hol:'calendar',pay:'chart'}[button.dataset.stab];
      if(button.dataset.smode)name=button.dataset.smode==='cnt'?'calendar':'chart';
      const text=button.textContent.trim();
      if(!name)name=/^Cancel|^Close/.test(text)?'close':/^Delete/.test(text)?'trash':/^Clear/.test(text)?'eraser':/^Import/.test(text)?'upload':'check';
      if(/^[✕×‹›▲▼]$/.test(text)){
        const label=button.dataset.pg?(+button.dataset.d<0?'Previous page':'Next page'):button.dataset.mv?(+button.dataset.mv<0?'Move column up':'Move column down'):'Delete '+({edel:'employee',stdel:'store',supdel:'supervisor',hdel:'holiday',lkdel:'standard value',sdel:'schedule block'}[button.dataset.act]||'record');
        button.textContent='';button.setAttribute('aria-label',label);button.title=label;button.classList.add('icon-button');
      }else if(text.startsWith('+ '))button.textContent=text.slice(2);
      button.insertAdjacentHTML('afterbegin',icon(name));
      if(name==='trash')button.classList.add('danger-ghost');
      if(!button.hasAttribute('type'))button.type='button';
    });
    const fields={q:'Search employees',fq:'Search attendance employees',fs:'Assignment location',fd:'Department',fp:'Position',cm:'Month',ch:'Cut-off',le:'Email address',lp:'Password',cb:'Comment',lkv:'New standard value'};
    Object.entries(fields).forEach(([id,label])=>{const el=container.querySelector('#'+id);if(el&&!el.labels?.length)el.setAttribute('aria-label',label)});
    container.querySelectorAll('.wrap').forEach(el=>{if(!el.hasAttribute('tabindex'))el.tabIndex=0;if(!el.hasAttribute('aria-label'))el.setAttribute('aria-label','Scrollable data table')});
    container.querySelectorAll('[data-ps]').forEach(el=>el.setAttribute('aria-label','Rows per page'));
    syncNavigation();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    enhance();
    root.matchMedia?.('(max-width:760px)').addEventListener?.('change',event=>{const filters=document.querySelector('.filter-disclosure');if(filters)filters.open=!event.matches;setNavigation(false,false)});
    let queued=false;
    const observer=new MutationObserver(records=>{
      if(queued||!records.some(record=>Array.from(record.addedNodes).some(node=>node.nodeType===1&&!node.matches?.('svg,.icon *'))))return;
      queued=true;queueMicrotask(()=>{queued=false;enhance()});
    });
    observer.observe(document.body,{childList:true,subtree:true});
  });
  root.addEventListener('ams:theme',()=>{document.querySelectorAll('.theme-control>.icon').forEach(el=>{el.outerHTML=icon({light:'sun',dark:'moon',system:'monitor'}[root.AMSTheme.get()])})});
  document.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||!document.documentElement.classList.contains('nav-open'))return;
    const items=[...document.querySelectorAll('.sidebar a,.sidebar button,.sidebar select')].filter(el=>!el.disabled),first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
  });
  root.AMSUI={icon,enhance,toolIcons,setNavigation};
})(globalThis);
