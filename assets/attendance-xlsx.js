/* Browser XLSX export. The workbook contains no wages or pay snapshots. */
(function(root){
 const statuses=['PRESENT','ABSENT','LEAVE (WITH PAY)','LEAVE (WITHOUT PAY)','DAY-OFF','AWOL/P','LATE/UT','N/A'];
 const fill=argb=>({type:'pattern',pattern:'solid',fgColor:{argb}});
 const edge={style:'thin',color:{argb:'FF9A9A9A'}};
 const border={top:edge,bottom:edge,left:edge,right:edge};
 function dates(start,end){
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
  if(!valid(start)||!valid(end)||end<start)throw Error('Choose a valid export date range');
  const count=(Date.parse(end)-Date.parse(start))/864e5+1;if(count>366)throw Error('Excel matrix exports support up to 366 days');
  return Array.from({length:count},(_,i)=>new Date(Date.parse(start)+i*864e5).toISOString().slice(0,10));
 }
 function period(start,end){
  const a=new Date(start+'T00:00:00Z'),b=new Date(end+'T00:00:00Z'),long=new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'});
  if(start.slice(0,7)===end.slice(0,7))return `${long.format(a)} ${a.getUTCDate()}${start===end?'':'–'+b.getUTCDate()}, ${b.getUTCFullYear()}`;
  return `${start} – ${end}`;
 }
 function text(row){
  if(!row)return '';
  if(row.type==='LEAVE')return 'LEAVE (WITH PAY)';if(row.type==='LEAVE-U')return 'LEAVE (WITHOUT PAY)';
  if(row.duty_code){const hours=((+row.reg_min||0)+(+row.ot_min||0))/60;return `${row.override_code||row.duty_code} ${Number(hours.toFixed(2))}h${row.ot_min?' OT':''}`}
  if(row.type==='LATE/UT')return ['LATE/UT',row.late?`L${row.late}`:'',row.ut?`UT${row.ut}`:''].filter(Boolean).join(' ');
  if(row.type==='PRESENT'&&!row.verified)return 'PRESENT (unverified)';
  return row.type||'';
 }
 function build(ExcelJS,{employees,rows,start,end,transactions=[],isNA=()=>false,isRD=()=>false}){
  const ds=dates(start,end);if((employees.length+1)*ds.length>500000)throw Error('This export is too large. Choose fewer employees or a shorter range.');
  const workbook=new ExcelJS.Workbook();workbook.creator='AMS';workbook.subject='Attendance matrix';workbook.created=new Date();
  const sheet=workbook.addWorksheet('Attendance',{views:[{state:'frozen',xSplit:3,ySplit:1,topLeftCell:'D2',activeCell:'D2',showGridLines:false}],properties:{defaultRowHeight:18},pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1',printTitlesColumn:'A:C',margins:{left:.25,right:.25,top:.4,bottom:.4,header:.15,footer:.15}}});
  sheet.columns=[{width:6},{width:26},{width:42},...ds.map(()=>({width:16}))];
  const header=sheet.addRow(['No.','Cut-Off','Employee Name',...ds.map(d=>new Date(d+'T00:00:00Z'))]);header.height=44;
  header.eachCell((cell,index)=>{cell.font={name:'Arial',size:10,bold:true,color:{argb:'FF000000'}};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};cell.fill=fill('FFEFEFEF');cell.border={...border,bottom:{style:'medium',color:{argb:'FF333333'}}};if(index>3)cell.numFmt='d-mmm-yyyy'});
  const index=new Map(rows.map(row=>[row.emp_id+'|'+row.date,row])),label=period(start,end);
  employees.forEach((e,i)=>{
   const values=ds.map(d=>{const row=index.get(e.id+'|'+d);return row?text(row):isNA(e,d)?'N/A':isRD(e,d)?'DAY-OFF':''});
   const line=sheet.addRow([i+1,label,`${e.last_name||''}, ${e.first_name||''}${e.middle_name?' '+e.middle_name:''}`,...values.map(value=>value===''?null:value)]);line.height=18;
   for(let c=1;c<=ds.length+3;c++){
    const cell=line.getCell(c);cell.border=border;cell.font={name:'Arial',size:9,color:{argb:'FF000000'}};cell.alignment={horizontal:c===3?'left':'center',vertical:'middle'};
    if(c>3){const value=values[c-4];cell.dataValidation={type:'list',allowBlank:true,formulae:['"'+statuses.join(',')+'"'],showInputMessage:true,promptTitle:'Attendance status',prompt:'Choose a status or enter a duty code and hours.',showErrorMessage:false};
     if(value==='ABSENT'||value==='AWOL/P')cell.fill=fill('FFFBE9E9');else if(value.startsWith('LEAVE'))cell.fill=fill('FFE8F0FC');else if(value==='N/A'||value==='DAY-OFF')cell.fill=fill('FFF2F2F2');
    }
   }
  });
  for(let r=1;r<=employees.length+1;r++)sheet.getCell(r,3).border={...sheet.getCell(r,3).border,right:{style:'medium',color:{argb:'FF333333'}}};
  const last=sheet.getColumn(ds.length+3).letter;
  if(employees.length)sheet.autoFilter={from:'A1',to:`${last}${employees.length+1}`};
  const noteRow=employees.length+3;sheet.mergeCells(`A${noteRow}:${last}${noteRow}`);sheet.getCell(noteRow,1).value='Blank = no recorded entry. DAY-OFF / N/A may be derived from schedule or employment dates. Excel edits stay in this file; they do not update AMS.';sheet.getCell(noteRow,1).font={name:'Arial',size:9,color:{argb:'FF595959'}};sheet.getCell(noteRow,1).alignment={wrapText:true,vertical:'middle'};sheet.getRow(noteRow).height=26;
  sheet.pageSetup.printArea=`A1:${last}${noteRow}`;
  sheet.headerFooter.oddFooter='&LAMS attendance &RPage &P of &N';
  if(transactions.length){
   const detail=workbook.addWorksheet('Transactions',{views:[{state:'frozen',ySplit:1}],properties:{defaultRowHeight:18}});
   transactions.forEach((values,i)=>{const r=detail.addRow(values);r.height=i?18:30;r.eachCell({includeEmpty:true},cell=>{cell.font={name:'Arial',size:9,bold:i===0};cell.alignment={vertical:'middle',wrapText:i===0};if(!i){cell.fill=fill('FFEFEFEF');cell.border=border}})});
   detail.columns.forEach((col,i)=>col.width=i===1?35:i===14?40:18);detail.autoFilter={from:'A1',to:{row:transactions.length,column:transactions[0].length}};
  }
  return workbook;
 }
 // Resolve beside this script, and version the lazy asset to avoid cached failures.
 const libraryURL=typeof document==='undefined'?null:(()=>{const source=document.currentScript,base=source?.src||new URL('assets/attendance-xlsx.js',document.baseURI).href,path=new URL(base).protocol==='file:'?(source?.dataset.fileLibrary||'../node_modules/exceljs/dist/exceljs.min.js'):'exceljs.min.js',url=new URL(path,base);url.searchParams.set('v','4.4.0');return url.href})();
 let libraryPromise=null;
 function library(){
  if(typeof root.ExcelJS?.Workbook==='function')return Promise.resolve(root.ExcelJS);if(libraryPromise)return libraryPromise;
  libraryPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script'),timer=setTimeout(()=>fail('Excel export timed out. Check the connection and retry.'),20000);
   function fail(message){clearTimeout(timer);script.remove();reject(Error(message))}
   script.src=libraryURL;script.onload=()=>{clearTimeout(timer);if(typeof root.ExcelJS?.Workbook==='function')resolve(root.ExcelJS);else fail('Excel export library is unavailable. Refresh this page and retry.')};script.onerror=()=>fail('Excel export could not load. Refresh this page and retry.');document.head.append(script);
  }).catch(error=>{libraryPromise=null;throw error});return libraryPromise;
 }
 async function download(options){
  const ExcelJS=await library(),workbook=build(ExcelJS,options),buffer=await workbook.xlsx.writeBuffer(),blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`attendance_${options.start}_${options.end}.xlsx`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 root.AMSAttendanceXLSX={build,download,text,dates};if(typeof module!=='undefined')module.exports=root.AMSAttendanceXLSX;
})(globalThis);
