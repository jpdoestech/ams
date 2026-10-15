/* Exercise actual file:// startup and XLSX download, without a local server. */
const {chromium}=require('playwright-core'),ExcelJS=require('exceljs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'chrome'})});
 try{
  fs.mkdirSync('test-results/file',{recursive:true});
  for(const [name,file] of [['source','index.html'],['built','public/index.html']]){
   const context=await browser.newContext({acceptDownloads:true,viewport:{width:1366,height:768}});await context.setOffline(true);
   const page=await context.newPage(),errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));page.on('request',r=>requests.push(r.url()));
   await page.goto(pathToFileURL(path.resolve(file)).href);await page.waitForSelector('.metric-grid');
   assert.equal(requests.some(url=>url.includes('/api/config')||url.startsWith('https://')),false,'File mode must not call server or CDN endpoints');
   await page.getByRole('button',{name:'Open attendance',exact:true}).click();await page.getByRole('button',{name:'Export',exact:true}).click();
   const pending=page.waitForEvent('download');await page.locator('[data-act=xlsx]').click();const download=await pending;assert.match(download.suggestedFilename(),/\.xlsx$/);await download.saveAs('test-results/file/'+name+'.xlsx');
   const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile('test-results/file/'+name+'.xlsx');assert.equal(workbook.getWorksheet('Attendance').getCell('C1').value,'Employee Name');assert.equal(workbook.getWorksheet('Attendance').views[0].xSplit,3);
   assert.ok(requests.some(url=>url.includes(name==='source'?'/node_modules/exceljs/dist/exceljs.min.js':'/public/assets/exceljs.min.js')));
   assert.deepEqual(errors,[]);await page.screenshot({path:'test-results/file/'+name+'.png'});await context.close();
  }
  console.log('Offline file checks passed: source and built index open without API/CDN requests and download valid XLSX files.');
 }finally{await browser.close()}
}
run().catch(error=>{console.error(error);process.exitCode=1});
