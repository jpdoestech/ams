/* Real-browser checks and screenshots. Requires Google Chrome or BROWSER_EXECUTABLE. */
const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs');
const {spawn}=require('node:child_process');
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
  await page.goto('http://127.0.0.1:'+port);await page.waitForSelector('.metric-grid');
  fs.mkdirSync('test-results/ui',{recursive:true});
  const screenshot=async name=>page.screenshot({path:'test-results/ui/'+name+'.png',animations:'disabled'});
  await page.selectOption('select[data-theme-preference]','light');await screenshot('dashboard-light');
  assert.equal(await page.locator('[data-nav-toggle]').isVisible(),true);
  await page.selectOption('select[data-theme-preference]','dark');await page.reload();await page.waitForSelector('.metric-grid');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await screenshot('dashboard-dark');
  for(const view of ['emp','att','sum','std','usr']){
    await page.locator('.side-nav [data-v="'+view+'"]').click();await page.waitForSelector('#mn[data-view="'+view+'"]');
    await page.locator('#mn .wrap').first().waitFor();
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
  await screenshot('employee-form-schedule-header');
  await page.locator('[data-act="eformschedule"]').click();await page.waitForSelector('#sch');
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
  await page.locator('[data-act="aexp"] svg').dispatchEvent('click');await page.waitForSelector('[role="dialog"]');await page.keyboard.press('Escape');
  await page.evaluate(()=>login());await page.waitForSelector('#le');await screenshot('login-dark');
  assert.equal(await page.locator('select[data-theme-preference]').isVisible(),true);
  assert.deepEqual(errors,[]);console.log('Browser checks passed: all screens, both themes, saved preference, dialogs, mobile navigation, filters, SVG actions, and four viewport sizes.');
 }finally{await browser?.close();server.kill()}
}
run().catch(error=>{console.error(error);process.exitCode=1});
