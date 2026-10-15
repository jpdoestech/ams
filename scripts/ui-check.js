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
  assert.equal(await page.locator('.mobile-menu').isVisible(),false);
  await page.selectOption('select[data-theme-preference]','dark');await page.reload();await page.waitForSelector('.metric-grid');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await screenshot('dashboard-dark');
  for(const view of ['emp','att','sum','std','usr']){
    await page.locator('.side-nav [data-v="'+view+'"]').click();await page.waitForSelector('#mn[data-view="'+view+'"]');
    await page.locator('#mn h2').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Desktop overflow: '+view);
    await screenshot(view+'-dark');
  }
  await page.locator('.side-nav [data-v="att"]').click();await page.waitForSelector('#gt');
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
