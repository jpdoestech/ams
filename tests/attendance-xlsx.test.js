const {test}=require('node:test'),assert=require('node:assert/strict');
const ExcelJS=require('exceljs'),{build,dates}=require('../assets/attendance-xlsx');
const employees=[{id:'a',last_name:'DELA CRUZ',first_name:'JUAN',middle_name:'TAMAD'},{id:'b',last_name:'=SUM(1,2)',first_name:'Safe text'}];
test('a failed library load can be retried with a versioned URL and produces a download',async()=>{
 const {JSDOM}=require('jsdom'),vm=require('node:vm'),fs=require('node:fs');
 const dom=new JSDOM('<head></head>',{url:'https://ams.test/app/',runScripts:'outside-only'}),w=dom.window;
 try{
  new vm.Script(fs.readFileSync('assets/attendance-xlsx.js','utf8')).runInContext(dom.getInternalVMContext());
  const urls=[];let attempts=0,downloads=0;
  w.document.head.append=script=>{urls.push(script.src);queueMicrotask(()=>{if(++attempts===1)script.onerror();else{w.ExcelJS=ExcelJS;script.onload()}})};
  w.URL.createObjectURL=()=> 'blob:export-test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{downloads++};
  const options={employees:[],rows:[],start:'2026-10-01',end:'2026-10-01'};
  await assert.rejects(w.AMSAttendanceXLSX.download(options),/Refresh this page/);
  await w.AMSAttendanceXLSX.download(options);
  assert.equal(downloads,1);assert.equal(attempts,2);assert.ok(urls.every(url=>url==='https://ams.test/app/assets/exceljs.min.js?v=4.4.0'));
 }finally{w.close()}
});
async function reopen(options){const book=build(ExcelJS,options),bytes=await book.xlsx.writeBuffer(),restored=new ExcelJS.Workbook();await restored.xlsx.load(bytes);return restored}
test('XLSX matrix preserves reference columns, real dates, compact rows, panes and status dropdowns after reopen',async()=>{
 const book=await reopen({employees,start:'2026-09-01',end:'2026-09-15',rows:[{emp_id:'a',date:'2026-09-03',type:'ABSENT'}],transactions:[['emp_no','time_in'],['001','08:00']],isNA:(e,d)=>e.id==='b'&&d<'2026-09-03',isRD:(_e,d)=>d==='2026-09-06'}),s=book.getWorksheet('Attendance');
 assert.deepEqual(s.getRow(1).values.slice(1,4),['No.','Cut-Off','Employee Name']);assert.equal(s.getCell('D1').value.toISOString().slice(0,10),'2026-09-01');assert.equal(s.getCell('R1').value.toISOString().slice(0,10),'2026-09-15');assert.equal(s.getCell('D1').numFmt,'d-mmm-yyyy');
 assert.equal(s.getCell('B2').value,'September 1–15, 2026');assert.equal(s.getCell('C2').value,'DELA CRUZ, JUAN TAMAD');assert.equal(s.getCell('F2').value,'ABSENT');assert.equal(s.getCell('D2').value,null);assert.equal(s.getCell('D3').value,'N/A');assert.equal(s.getCell('I2').value,'DAY-OFF');
 assert.equal(s.views[0].xSplit,3);assert.equal(s.views[0].ySplit,1);assert.equal(s.getRow(2).height,18);assert.equal(s.getRow(1).height,44);
 assert.equal(s.getCell('D2').dataValidation.type,'list');assert.match(s.getCell('D2').dataValidation.formulae[0],/LEAVE \(WITH PAY\)/);assert.equal(s.getCell('C2').border.right.style,'medium');assert.equal(s.getCell('A1').fill.fgColor.argb,'FFEFEFEF');
 assert.equal(s.getCell('C3').type,ExcelJS.ValueType.String);assert.equal(s.getCell('C3').formula,undefined);assert.equal(book.getWorksheet('Transactions').getCell('B2').value,'08:00');
});
test('paid/unpaid leave and recorded work remain distinct without exposing wages',async()=>{
 const book=await reopen({employees:employees.slice(0,1),start:'2026-10-01',end:'2026-10-04',rows:[
  {emp_id:'a',date:'2026-10-01',type:'LEAVE'},
  {emp_id:'a',date:'2026-10-02',type:'LEAVE-U'},
  {emp_id:'a',date:'2026-10-03',type:'PRESENT',verified:true,duty_code:'OD',override_code:'RH',reg_min:480,ot_min:120,daily_rate:999999},
  {emp_id:'a',date:'2026-10-04',type:'PRESENT',verified:false}
 ]}),s=book.getWorksheet('Attendance');
 assert.equal(s.getCell('D2').value,'LEAVE (WITH PAY)');assert.equal(s.getCell('E2').value,'LEAVE (WITHOUT PAY)');assert.equal(s.getCell('F2').value,'RH 10h OT');assert.equal(s.getCell('G2').value,'PRESENT (unverified)');
 assert.equal(JSON.stringify(s.getRow(2).values).includes('999999'),false);
});
test('XLSX export handles cross-month, empty and invalid ranges without inventing attendance',async()=>{
 const book=await reopen({employees:[],rows:[],start:'2026-09-30',end:'2026-10-01'});assert.equal(book.getWorksheet('Attendance').getCell('E1').value.toISOString().slice(0,10),'2026-10-01');
 assert.equal(dates('2026-02-28','2026-03-01').length,2);
 for(const [a,b] of [['2026-02-30','2026-03-01'],['2026-10-02','2026-10-01'],['2025-01-01','2026-10-01']])assert.throws(()=>dates(a,b));
});
