/* Real-browser checks and screenshots. Requires Google Chrome or BROWSER_EXECUTABLE. */
const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs');
const {spawn}=require('node:child_process');
const ExcelJS=require('exceljs');
async function run(){
 const port=process.env.UI_TEST_PORT||'4175',server=spawn(process.execPath,['scripts/dev.js'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>{if(code)reject(Error('Preview server exited: '+code))})});
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'chrome'})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/config',r=>r.fulfill({contentType:'application/javascript',body:'window.AMS_CONFIG={};'}));
  await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
  await page.route('http://127.0.0.1:'+port+'/',async route=>{const response=await route.fetch(),policy=JSON.parse(fs.readFileSync('vercel.json','utf8')).headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;await route.fulfill({response,headers:{...response.headers(),'content-security-policy':policy}})});
  await page.goto('http://127.0.0.1:'+port);await page.waitForSelector('.metric-grid');
  fs.mkdirSync('test-results/ui',{recursive:true});
  const screenshot=async name=>page.screenshot({path:'test-results/ui/'+name+'.png',animations:'disabled'});
  await page.selectOption('select[data-theme-preference]','light');await screenshot('dashboard-light');
  assert.equal(await page.locator('[data-nav-toggle]').isVisible(),true);
  await page.selectOption('select[data-theme-preference]','dark');await page.reload();await page.waitForSelector('.metric-grid');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await screenshot('dashboard-dark');
  await page.evaluate(()=>{globalThis.browserOriginalList=API.list.bind(API);globalThis.navigationReads=0;API.list=async(...args)=>{navigationReads++;return browserOriginalList(...args)}});
  await page.locator('.side-nav [data-v="emp"]').click();await page.waitForSelector('#emt');assert.equal(await page.evaluate(()=>navigationReads),0,'Fresh navigation reuses the workspace snapshot');
  await page.locator('.breadcrumb [data-v="emp"]').click();await page.waitForFunction(()=>navigationReads===19&&document.querySelector('.workspace')?.getAttribute('aria-busy')!=='true');
  await page.evaluate(()=>{API.list=browserOriginalList});
  for(const view of ['emp','att','sum','std','usr','analytics','audit']){
    await page.locator('.side-nav [data-v="'+view+'"]').click();await page.waitForSelector('#mn[data-view="'+view+'"]');
    await page.locator(view==='analytics'?'#analytics-overview .analytics-chart':'#mn .wrap').first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Desktop overflow: '+view);
    await screenshot(view+'-dark');
  }
  await page.locator('.side-nav [data-v="att"]').click();await page.waitForSelector('#gt');
  await page.setViewportSize({width:1366,height:768});
  const help=page.locator('[data-help-toggle]'),panel=page.locator('#attendance-help');
  assert.equal(await panel.isVisible(),false);
  await help.hover();assert.equal(await panel.isVisible(),true);
  await page.locator('.breadcrumb').hover();assert.equal(await panel.isVisible(),false);
  await help.click();assert.equal(await panel.isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await panel.isVisible(),false);
  await help.click();await page.locator('.breadcrumb').click();assert.equal(await panel.isVisible(),false);
  await help.focus();assert.equal(await panel.isVisible(),true);await page.keyboard.press('Escape');
  assert.equal(await page.locator('#mn h1,#mn h2').count(),0);
  await page.locator('[data-nav-toggle]').click();
  assert.equal(await page.locator('html').getAttribute('data-sidebar'),'collapsed');
  await page.reload();await page.waitForSelector('.metric-grid');
  assert.equal(await page.locator('html').getAttribute('data-sidebar'),'collapsed');
  assert.ok((await page.locator('.sidebar').boundingBox()).width<=64);
  await page.locator('.side-nav [data-v="emp"]').click();await page.waitForSelector('#emt');
  assert.ok(await page.locator('#emt tbody tr').first().evaluate(el=>el.getBoundingClientRect().height<=36),'Compact employee row height');
  await screenshot('employees-laptop-compact');
  const employeeRow=page.locator('#eb [data-employee-row]').first(),employeeActions=employeeRow.locator('[data-employee-actions]');
  await employeeActions.click();assert.equal(await page.locator('#employee-menu').isVisible(),true);
  assert.deepEqual(await page.locator('#employee-menu button').allTextContents(),['Schedule','Edit','Delete']);
  await screenshot('employee-actions-menu');
  await page.keyboard.press('End');assert.equal(await page.locator('#employee-menu [data-act="edel"]').evaluate(el=>document.activeElement===el),true);
  await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#employee-menu [data-act="esch"]').evaluate(el=>document.activeElement===el),true);
  assert.equal(await page.locator('#ov').isVisible(),false);
  await page.keyboard.press('Escape');assert.equal(await employeeActions.getAttribute('aria-expanded'),'false');
  assert.equal(await employeeActions.evaluate(el=>document.activeElement===el),true);
  await employeeRow.locator('td').nth(1).click();await page.waitForSelector('.employee-form-header');
  await page.locator('#f_first_name').fill('Unsaved employee draft');
  const chromeBefore=await page.locator('.modal-header').boundingBox(),footerBefore=await page.locator('.modal-footer').boundingBox();
  await page.locator('.modal-body').evaluate(el=>el.scrollTop=el.scrollHeight);
  assert.equal((await page.locator('.modal-header').boundingBox()).y,chromeBefore.y);assert.equal((await page.locator('.modal-footer').boundingBox()).y,footerBefore.y);
  await page.locator('#f_department').selectOption('Operations');assert.equal(await page.locator('#f_position').inputValue(),'');assert.equal(await page.locator('#f_position option[value="Security Guard"]').count(),0);
  await page.locator('[data-quick-add=department]').click();await page.locator('#quick-lookup-value').fill('Warehouse');await page.locator('[data-quick-save]').click();await page.waitForFunction(()=>document.querySelector('#f_department').value==='Warehouse');
  await page.locator('[data-quick-add=position]').click();await page.locator('#quick-lookup-value').fill('Inventory clerk');await page.locator('[data-quick-save]').click();await page.waitForFunction(()=>document.querySelector('#f_position').value==='Inventory clerk');
  assert.equal(await page.locator('#f_first_name').inputValue(),'Unsaved employee draft');
  await screenshot('employee-form-schedule-header');
  await page.locator('[data-act="eformschedule"]').click();await page.waitForSelector('#sch');
  const scheduleSize=await page.locator('.md').boundingBox();
  for(let i=0;i<12;i++)await page.locator('[data-act=sadd][data-id=duty]').click();
  assert.equal((await page.locator('.md').boundingBox()).height,scheduleSize.height);
  await page.locator('#schb').locator('tr').last().scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.modal-footer [data-act=ssave]').isVisible(),true);await screenshot('schedule-fixed-chrome');
  await page.getByRole('button',{name:'Back to employee',exact:true}).click();
  assert.equal(await page.locator('#f_first_name').inputValue(),'Unsaved employee draft');
  await page.keyboard.press('Escape');
  await employeeActions.click();await page.locator('#employee-menu [data-act="eedit"]').click();
  await page.waitForSelector('#f_last_name');await page.keyboard.press('Escape');
  assert.equal(await employeeActions.evaluate(el=>document.activeElement===el),true);
  await employeeActions.click();await page.locator('#employee-menu [data-act="edel"]').click();
  await page.waitForSelector('.confirm-layer');await page.keyboard.press('Escape');
  assert.equal(await page.locator('#eb [data-employee-row]').count(),5);
  await employeeRow.focus();await page.keyboard.press('Enter');await page.waitForSelector('.employee-form-header');await page.keyboard.press('Escape');
  await page.locator('.breadcrumb [data-v="dash"]').click();await page.waitForSelector('.metric-grid');
  await page.locator('.side-nav [data-v="att"]').click();await page.waitForSelector('#gt');
  await screenshot('attendance-laptop-collapsed');await page.locator('[data-nav-toggle]').click();
  await screenshot('attendance-laptop-expanded');
  await page.locator('td[data-r="0"][data-c="0"]').click();await page.waitForSelector('#dm');await screenshot('duty-dark');
  assert.equal(await page.locator('[role="dialog"]').getAttribute('aria-labelledby'),'dialog-title');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#ov').getAttribute('class'),'ov');
  assert.equal(await page.locator('#app').evaluate(el=>el.inert),false);
  await page.selectOption('select[data-theme-preference]','light');await screenshot('attendance-light');
  for(const width of [375,768,1024,1440]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Page overflows at '+width);
  }
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.querySelector('.sidebar').inert===true);
  assert.equal(await page.locator('.sidebar').evaluate(el=>el.inert),true);
  await page.locator('[data-nav-toggle]').click();assert.equal(await page.locator('.workspace').evaluate(el=>el.inert),true);
  await page.locator('.side-nav [data-v="dash"]').click();await page.waitForSelector('.metric-grid');await screenshot('dashboard-mobile-light');
  await page.selectOption('select[data-theme-preference]','dark');
  await page.locator('[data-nav-toggle]').click();await page.locator('.side-nav [data-v="emp"]').click();await page.waitForSelector('#emt');
  await page.locator('#eb [data-employee-row]').first().locator('td').nth(1).click();await page.waitForSelector('.employee-form-header');
  assert.equal(await page.locator('[data-act="eformschedule"]').isVisible(),true);
  assert.equal(await page.locator('.md').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  await screenshot('employee-mobile-dark');await page.keyboard.press('Escape');
  await page.locator('[data-nav-toggle]').click();await page.locator('.side-nav [data-v="att"]').click();await page.waitForSelector('#gt');
  assert.equal(await page.locator('.filter-disclosure').getAttribute('open'),null);
  await screenshot('attendance-mobile-dark');
  await page.locator('.filter-disclosure>summary').click();assert.equal(await page.locator('#fq').isVisible(),true);
  await page.locator('.filter-disclosure>summary').click();
  await page.locator('td[data-r="0"][data-c="0"]').click();await screenshot('duty-mobile-dark');await page.keyboard.press('Escape');
  await page.locator('[data-nav-toggle]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('[data-nav-toggle]').getAttribute('aria-expanded'),'false');
  // Clicks on nested icons must invoke the same actions as button labels.
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('.side-nav [data-v="std"]').click();await page.locator('#mn .wrap table tbody tr').first().waitFor();
  assert.ok(await page.locator('#mn .wrap table tbody tr').first().evaluate(el=>el.getBoundingClientRect().height<=36),'Compact standards row height');
  await page.locator('[data-stab="sto"]').click();
  assert.match(await page.locator('#mn .wrap tbody').innerText(),/JDC/);
  assert.equal((await page.locator('#mn .wrap tbody').innerText()).includes('DELA CRUZ'),false);
  await page.locator('.side-nav [data-v="sum"]').click();await page.locator('#stot .card').first().waitFor();
  await page.locator('#fd').selectOption('Security');await page.locator('.filter-indicator').waitFor();assert.match(await page.locator('.filter-indicator').innerText(),/Department: Security/);
  let summaryDownload=page.waitForEvent('download');await page.locator('[data-act=sexp]').click();let summaryFile=await summaryDownload;await summaryFile.saveAs('test-results/ui/summary-counts.csv');assert.match(fs.readFileSync('test-results/ui/summary-counts.csv','utf8'),/^"FROM","TO"/);
  await page.locator('[data-smode=duty]').click();summaryDownload=page.waitForEvent('download');await page.locator('[data-act=sexp]').click();summaryFile=await summaryDownload;await summaryFile.saveAs('test-results/ui/summary-duty.csv');assert.match(fs.readFileSync('test-results/ui/summary-duty.csv','utf8'),/^"FROM","TO"/);
  await page.locator('[data-smode=cnt]').click();await page.locator('[data-act=fclr]').click();await page.locator('#stot .card').first().waitFor();
  assert.ok(await page.locator('#stot .card').first().evaluate(el=>el.getBoundingClientRect().height<=34),'Compact summary totals');await screenshot('summary-compact');
  await page.locator('.side-nav [data-v="analytics"]').click();await page.locator('#analytics-overview .analytics-chart').first().waitFor();
  await page.locator('#analytics-from').fill('2026-09-01');await page.locator('#analytics-to').fill('2026-10-15');
  await page.locator('#analytics-form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#analytics-status').textContent.startsWith('2026-09-01'));
  await screenshot('analytics-overview-dark');
  assert.equal(await page.locator('#analytics-data').isVisible(),false);
  await page.locator('.chart-hit').first().focus();await page.keyboard.press('ArrowRight');assert.match(await page.locator('.chart-readout').first().innerText(),/2026-09-02/);
  await page.locator('[data-analytics-tab=employees]').click();await screenshot('analytics-employees');
  await page.locator('[data-analytics-tab="workforce"]').click();assert.match(await page.locator('#analytics-table').innerText(),/Headcount at end/);await screenshot('analytics-workforce');
  await page.locator('[data-analytics-tab="daily"]').click();assert.equal(await page.locator('#analytics-table tbody tr').count(),45);
  await page.locator('.side-nav [data-v="audit"]').click();await page.locator('#audit-enabled').waitFor();
  await page.locator('#audit-enabled').uncheck();await page.locator('#audit-form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#audit-body').textContent.includes('audit_settings.update'));
  assert.equal(await page.locator('#audit-enabled').isChecked(),false);await screenshot('audit-controls');
  await page.locator('#audit-enabled').check();await page.locator('#audit-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#audit-enabled').checked);
  await page.evaluate(()=>{ROLE='viewer';V='att';shell()});await page.waitForSelector('#gt');
  assert.equal(await page.locator('.side-nav [data-v="audit"]').count(),0);
  await page.locator('td[data-r="0"][data-c="0"]').click();await page.locator('#cb').fill('Viewer note <safe>');
  await page.locator('[data-act="cadd"]').click();await page.waitForFunction(()=>!document.querySelector('#ov').classList.contains('on'));
  await page.locator('td.c.cm').first().hover();await page.locator('#comment-popover').waitFor();assert.match(await page.locator('#comment-popover').innerText(),/Viewer note <safe>/);
  await screenshot('viewer-comment-popover');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#comment-popover').count(),0);
  await page.reload();await page.waitForSelector('.metric-grid');await page.evaluate(()=>{ROLE='viewer';V='att';shell()});
  await page.locator('td.c.cm').first().hover();await page.locator('#comment-popover').waitFor();assert.match(await page.locator('#comment-popover').innerText(),/Viewer note <safe>/);
  await page.evaluate(()=>{ROLE='superadmin';shell()});await page.waitForSelector('#gt');
  await page.locator('td[data-r="0"][data-c="0"]').click();await page.locator('#override-toggle').click();
  assert.deepEqual(await page.locator('#gt thead th.s').allTextContents(),['LATE/UT min','PRESENT']);
  await page.locator('[data-override="RH"]').click();assert.equal(await page.locator('#dov').inputValue(),'RH');await screenshot('duty-code-columns');
  await page.locator('#override-toggle').click();await screenshot('duty-code-list-open');await page.keyboard.press('Escape');assert.equal(await page.locator('#override-list').isVisible(),false);assert.equal(await page.locator('#ov').isVisible(),true);await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  for(const view of ['analytics','audit']){
   await page.locator('[data-nav-toggle]').click();await page.locator('.side-nav [data-v="'+view+'"]').click();
   await page.locator(view==='analytics'?'#analytics-status':'#audit-enabled').waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile overflow: '+view);await screenshot(view+'-mobile');
  }
  await page.setViewportSize({width:1440,height:1000});await page.locator('.side-nav [data-v="att"]').click();await page.waitForSelector('#gt');
  await page.locator('[data-act="aexp"] svg').dispatchEvent('click');await page.waitForSelector('[role="dialog"]');
  const excelDownload=page.waitForEvent('download');await page.locator('[data-act="xlsx"]').click();const downloaded=await excelDownload;assert.match(downloaded.suggestedFilename(),/attendance_.*\.xlsx$/);await downloaded.saveAs('test-results/ui/attendance-export.xlsx');
  const exportedBook=new ExcelJS.Workbook();await exportedBook.xlsx.readFile('test-results/ui/attendance-export.xlsx');assert.equal(exportedBook.getWorksheet('Attendance').getCell('C1').value,'Employee Name');assert.equal(exportedBook.getWorksheet('Attendance').views[0].xSplit,3);assert.ok(exportedBook.getWorksheet('Transactions'));
  await page.waitForFunction(()=>!document.querySelector('#ov').classList.contains('on'));
  // Real click paths for independent review and additive corrections.
  await page.evaluate(async()=>{ROLE='staff';P={id:'browser-author',email:'author@demo'};const date=rng()[0];await saveAttendance([changeFor(E[0].id,date,dutyRow(E[0],date,{tin:'08:00',tout:'17:00',brk:60},'manual').row)]);await load();V='att';shell()});
  await page.locator('[data-review-open]').click();await page.locator('[data-review-row]').first().check();
  await page.locator('[data-review-action=submit]').click();await page.waitForFunction(()=>document.querySelector('#review-body')?.textContent.includes('submitted'));
  await page.keyboard.press('Escape');await page.evaluate(()=>{ROLE='superadmin';P={id:'browser-reviewer',email:'reviewer@demo'};shell()});
  await page.locator('[data-review-open]').click();await page.locator('[data-review-row]').first().check();await page.locator('[data-review-action=approve]').click();
  await page.waitForFunction(()=>document.querySelector('#review-body')?.textContent.includes('approved'));await screenshot('attendance-review-approved');await page.keyboard.press('Escape');
  await page.evaluate(()=>{ROLE='staff';P={id:'browser-author',email:'author@demo'};S.cutoff_locks.push({id:'browser-lock',start_date:'2026-09-01',end_date:'2026-09-01'});LOCKS=S.cutoff_locks;V='adjustments';shell()});
  await page.locator('[data-adjustment-new]').click();await page.locator('#adjustment-date').fill('2026-09-01');await page.locator('#adjustment-minutes').fill('30');await page.locator('#adjustment-amount').fill('40.25');await page.locator('#adjustment-reason').fill('Approved supporting correction');await page.locator('[data-adjustment-save]').click();
  await page.waitForFunction(()=>!document.querySelector('#ov').classList.contains('on'));
  await page.locator('#adjustments-from').fill('2026-09-01');await page.locator('#adjustments-to').fill('2026-09-01');await page.locator('#adjustments-filter button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#adjustments-body').textContent.includes('pending'));
  await page.evaluate(()=>{ROLE='superadmin';P={id:'browser-reviewer',email:'reviewer@demo'};shell()});
  await page.locator('[data-adjustment-decide]').click();await page.locator('#adjustment-decision-note').fill('Verified supporting document');await page.locator('[data-adjustment-action=approve]').click();
  await page.waitForFunction(()=>document.querySelector('#adjustments-body')?.textContent.includes('approved'));assert.match(await page.locator('#adjustments-totals').innerText(),/40.25/);await screenshot('adjustments-approved');
  await page.evaluate(()=>{P={id:'demo',email:'demo@local'};V='emp';shell()});await page.locator('#eb [data-employee-row]').first().click();await page.locator('[data-act=eformschedule]').click();
  await page.locator('#schedule-from').fill('2027-05-01');await page.locator('#schedule-reason').fill('Future schedule version');await page.locator('#schedule-in').fill('09:00');await page.locator('#schedule-out').fill('18:00');await page.locator('[data-act=ssave]').click();
  await page.waitForFunction(()=>document.querySelector('#ov [data-act=eformschedule]'));await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>ASSIGNMENTS.some(v=>v.effective_from==='2027-05-01')),true);
  // Every workspace screen must fit the viewport; wide tables scroll within their containers.
  for(const [width,height] of [[320,740],[375,812],[768,1024],[844,390],[1024,768],[1366,768],[1920,1080],[2560,1440],[3440,1440]]){
   await page.setViewportSize({width,height});
   for(const view of ['dash','emp','att','sum','std','usr','analytics','audit','adjustments']){
    await page.evaluate(view=>{V=view;if(view==='analytics')analyticsMode='overview';shell()},view);
    const ready={dash:'.metric-grid',emp:'#emt',att:'#gt',sum:'#sbd',std:'[data-stab]',usr:'[data-u]',analytics:'.analytics-chart',audit:'#audit-enabled',adjustments:'#adjustments-body'}[view];await page.locator(ready).first().waitFor();
    const overflow=await page.evaluate(()=>{const main=document.querySelector('#mn'),right=main.getBoundingClientRect().right;return{page:document.documentElement.scrollWidth>innerWidth,main:main.scrollWidth>main.clientWidth+1,controls:[...main.children].filter(el=>!el.hidden&&el.getBoundingClientRect().right>right+2).map(el=>el.id||el.className)}});
    assert.deepEqual(overflow,{page:false,main:false,controls:[]},`Responsive screen: ${view} at ${width}x${height}`);
    const contentWidth=await page.locator('#mn').evaluate(el=>el.getBoundingClientRect().width);
    const contentLimit=view==='dash'?1600:view==='analytics'?1800:2200;
    assert.ok(contentWidth<=contentLimit+1,'Large-screen content width: '+view);
    assert.ok(contentWidth>=Math.min(width-238,contentLimit)-20,'Content uses available width: '+view);
    if(width===3440&&['dash','att','analytics'].includes(view))await screenshot(view+'-ultrawide');
    if(view==='emp'&&[320,768,844,1366,3440].includes(width)){
     await page.evaluate(()=>schM(E[1].id));await page.locator('.modal-footer [data-act=ssave]').waitFor();const emptyHeight=(await page.locator('.md').boundingBox()).height;
     await page.evaluate(()=>schM(E[0].id));assert.equal((await page.locator('.md').boundingBox()).height,emptyHeight,'Schedule size must not depend on row count');
     const footer=await page.locator('.modal-footer').boundingBox();assert.ok(footer.y+footer.height<=height,'Modal footer fits viewport');
     assert.equal(await page.locator('.modal-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'Modal body confines table overflow');
     await screenshot('schedule-responsive-'+width);await page.keyboard.press('Escape');
    }
    if(view==='analytics'&&[375,1366].includes(width))await screenshot('overview-responsive-'+width);
    if(view==='att'&&[320,844,3440].includes(width)){
     await page.locator('[data-review-open]').click();const box=await page.locator('.md').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,'Review dialog fits viewport');await screenshot('review-responsive-'+width);await page.keyboard.press('Escape');
    }
    if(view==='std')for(const tab of ['sto','sup','hol','pay']){await page.locator('[data-stab="'+tab+'"]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Standards '+tab+' at '+width)}
   }
  }
  await page.setViewportSize({width:1366,height:768});await page.evaluate(()=>{V='analytics';analyticsMode='overview';shell()});await page.locator('.analytics-chart').first().waitFor();
  await page.selectOption('select[data-theme-preference]','light');await screenshot('analytics-overview-light');
  await page.locator('#analytics-search').fill('does-not-exist');await page.locator('#analytics-form button[type=submit]').click();await page.locator('.overview-empty').waitFor();assert.equal(await page.locator('#analytics-data').isVisible(),false);
  const scale=await page.evaluate(async()=>{
   const sample=E[0];S.employees=Array.from({length:500},(_,i)=>({...sample,id:crypto.randomUUID(),emp_no:'SCALE-'+String(i).padStart(3,'0'),last_name:'Synthetic '+i,first_name:'Employee'}));
   S.employee_assignment_versions=[];S.attendance_comments=[];S.cutoff_locks=[];S.cutoff_snapshot_view=[];S.attendance_pay=[];S.employee_pay=[];S.wage_history=[];
   S.attendance=S.employees.flatMap(e=>Array.from({length:15},(_,i)=>({emp_id:e.id,date:'2027-08-'+String(i+1).padStart(2,'0'),type:'ABSENT',revision:i+1})));
   cut={m:'2027-08',h:1};flt={q:'',site:'',department:'',position:''};await load();V='att';const start=performance.now();shell();return{fixtureEmployees:E.length,fixtureAttendance:S.attendance.length,renderMs:Math.round(performance.now()-start),renderedRows:document.querySelectorAll('#gt tbody tr').length};
  });
  assert.equal(scale.fixtureEmployees,500);assert.equal(scale.fixtureAttendance,7500);assert.equal(scale.renderedRows,50);await page.locator('#fq').fill('SCALE-499');await page.waitForFunction(()=>document.querySelectorAll('#gt tbody tr').length===1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);console.log('Synthetic browser fixture: '+JSON.stringify(scale));
  await page.evaluate(()=>login());await page.waitForSelector('#le');await screenshot('login-dark');
  assert.equal(await page.locator('select[data-theme-preference]').isVisible(),true);
  assert.deepEqual(errors,[]);console.log('Browser checks passed: all screens, themes, employee actions, compact rows, summary, analytics, audit settings, saved viewer comments, duty-code list, mobile navigation, and nine responsive viewport sizes.');
 }finally{await browser?.close();server.kill()}
}
run().catch(error=>{console.error(error);process.exitCode=1});
