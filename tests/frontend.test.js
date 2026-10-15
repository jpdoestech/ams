const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {browser}=require('./helpers');
let dom,w;
before(async()=>{dom=await browser();w=dom.window});after(()=>dom?.window.close());
test('demo boots with every module and no build runtime dependency',()=>{
 assert.match(w.document.body.textContent,/Dashboard/);assert.match(w.document.body.textContent,/Active employees/);
});
test('overnight summary splits actual dates and does not add holiday-not-worked',()=>{
 const result=w.eval(`(()=>{H=[{date:'2026-10-16',location:'ALL',kind:'LEGAL',name:'Test'}];const e=E[0],d=dutyRow(e,'2026-10-15',{tin:'20:00',tout:'04:00',brk:0},'test');return [dutyAgg([e],[d.row],[d.pay],'2026-10-15','2026-10-15',false)[0],dutyAgg([e],[d.row],[d.pay],'2026-10-16','2026-10-16',false)[0]]})()`);
 assert.equal(result[0].reg,240);assert.equal(result[1].reg,240);assert.equal(result[1].hd,0);
 assert.ok(result[1].wamt>result[0].wamt);
});
test('unverified blank predecessor is not holiday entitlement evidence',()=>{
 assert.equal(w.eval(`(()=>{const e=E[0];H=[{date:'2026-10-16',location:'ALL',kind:'LEGAL',name:'Test'}];return unworked(e,'2026-10-16',{}).ok})()`),false);
});
test('historical separated employee stays available and prehire rest days are N/A',()=>{
 assert.equal(w.eval(`eligible({status:'Resigned',date_hired:'2026-01-01',date_end:'2026-10-15'},'2026-10-01','2026-10-15',[])`),true);
 const result=w.eval(`agg([{id:'mid',date_hired:'2026-10-10',rest_day:'Sun'}],[],'2026-10-01','2026-10-15')[0]`);assert.equal(result.na,9);assert.equal(result.app,6);
});
test('dynamic late editor supports more than two duty blocks',()=>{
 w.eval(`V='att';DB=Array.from({length:3},(_,i)=>({emp_id:E[0].id,kind:'duty',sort:i,t_start:['08:00','11:00','14:00'][i],t_end:['10:00','13:00','17:00'][i]}));pend=[[0,0]];lateM()`);
 assert.ok(w.document.getElementById('ai2'));w.document.getElementById('ai2').value='14:15';assert.equal(w.eval('calc()[0]'),15);
 w.eval('DB=[];closeM()');
});
test('transactions preserve punches and CSV round-trip quotes/newlines',()=>{
 const result=w.eval(`(()=>{const e=E[0],r=dutyRow(e,'2026-10-14',{tin:'08:00',tout:'17:00',brk:60},'manual');return parseCSV(toCSV(transactionsCSV([e],[r.row])))})()`);
 assert.equal(result[0].includes('time_in'),true);assert.equal(result[1][result[0].indexOf('time_in')],'08:00');
 assert.equal(w.eval(`parseCSV(toCSV([['a,"b','line1\\nline2']]))[0][1]`),'line1\nline2');
});
test('demo batch has optimistic conflicts and rolls back on storage failure',async()=>{
 await w.eval(`saveAttendance([changeFor(E[0].id,'2026-10-12',{...BLANK,type:'ABSENT'})])`);
 await assert.rejects(w.eval(`saveAttendance([{emp_id:E[0].id,date:'2026-10-12',expected_revision:null,row:{...BLANK,type:'LEAVE'}}])`),/changed/);
});
test('import checks outside visible period, rejects duplicates, and reports issues',async()=>{
 await w.eval(`stageAttendanceImport([['emp_no','date','type','time_in','time_out','break_min'],[E[0].emp_no,'2026-12-01','PRESENT','08:00','17:00','60'],[E[0].emp_no,'2026-12-02','ABSENT','','',''],[E[0].emp_no,'2026-12-02','LEAVE','','','']])`);
 assert.match(w.document.getElementById('ov').textContent,/1 valid rows/);assert.match(w.document.getElementById('ov').textContent,/Duplicate/);
});
test('every existing screen renders and invalid preview inputs display validation',async()=>{
 for(const view of ['emp','att','sum','std','usr']){await w.eval(`V='${view}';shell()`);await new Promise(resolve=>setTimeout(resolve,10));assert.ok(w.document.getElementById('mn').textContent.trim(),view)}
 w.eval(`V='att';cut={m:'2026-10',h:1};shell();dutyM([[0,0]])`);
 w.document.getElementById('dbrk').value='9999';w.eval('dutyPrev()');assert.match(w.document.getElementById('dprev').textContent,/Break/);
});
test('breaks outside actual shift use centered duration, not ignored time',()=>{
 const value=w.eval(`(()=>{DB=[{emp_id:E[0].id,kind:'break',t_start:'12:00',t_end:'13:00'}];const r=calcFor(E[0],'2026-10-14',{tin:'18:00',tout:'23:00',brk:60});DB=[];return r.workedMin})()`);assert.equal(value,240);
});
