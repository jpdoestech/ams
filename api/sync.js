const {createSign}=require('node:crypto');
const {supabaseConfig}=require('../lib/supabase-config');
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
async function jsonFetch(url,options={}){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});
  const body=await response.json();if(!response.ok)throw Error('Upstream request failed ('+response.status+')');return body;
}
async function googleToken(){
  const now=Math.floor(Date.now()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();
  const jwt=unsigned+'.'+signer.sign(process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,'\n'),'base64url');
  return(await jsonFetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}).toString()})).access_token;
}
async function listTable(table,token,params=''){
  const all=[],url=supabaseConfig().URL.replace(/\/$/,'');
  const keys=({attendance:'emp_id,date',attendance_pay:'emp_id,date',employee_pay:'emp_id'})[table]||'id';
  for(let offset=0;;offset+=1000){
    const data=await jsonFetch(`${url}/rest/v1/${table}?select=*&order=${keys}&offset=${offset}&limit=1000${params}`,{headers:{apikey:supabaseConfig().KEY,Authorization:'Bearer '+token}});
    all.push(...data);if(data.length<1000)return all;
  }
}
// Sheets values use userEnteredValue.stringValue, preventing formula execution.
function sheetRows(rows){return rows.map(row=>({values:row.map(value=>({userEnteredValue:typeof value==='number'?{numberValue:value}:typeof value==='boolean'?{boolValue:value}:{stringValue:value==null?'':typeof value==='object'?JSON.stringify(value):String(value)}}))}))}
module.exports=async function sync(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||'');if(!match)return res.status(401).json({error:'Sign in required'});
  const {start,end}=typeof req.body==='object'&&req.body?req.body:{};
  if(!validDate(start)||!validDate(end)||start>end||Date.parse(end)-Date.parse(start)>32*86400000)return res.status(400).json({error:'Select a valid attendance period of at most 32 days'});
  if(!supabaseConfig().URL||!supabaseConfig().KEY||!['GOOGLE_SERVICE_ACCOUNT_EMAIL','GOOGLE_PRIVATE_KEY','GOOGLE_SHEET_ID'].every(key=>process.env[key]))return res.status(503).json({error:'Sheets sync is not configured'});
  try{
    const headers={apikey:supabaseConfig().KEY,Authorization:'Bearer '+match[1]},base=supabaseConfig().URL.replace(/\/$/,'');
    // Validate the JWT with Supabase Auth, then enforce the caller's active role.
    const authResponse=await fetch(base+'/auth/v1/user',{headers,signal:AbortSignal.timeout(10000)});
    if(!authResponse.ok)return res.status(401).json({error:'Session expired; sign in again'});
    const user=await authResponse.json();
    const profiles=await jsonFetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,active`,{headers});
    if(!profiles[0]?.active||!['staff','superadmin'].includes(profiles[0].role))return res.status(403).json({error:'Active Staff or Superadmin access required'});
    const [employeeRows,attendance,fields,pays,versions]=await Promise.all([
      listTable('employees',match[1]),listTable('attendance',match[1],`&date=gte.${start}&date=lte.${end}`),listTable('field_defs',match[1]),listTable('attendance_pay',match[1],`&date=gte.${start}&date=lte.${end}`),listTable('employee_assignment_versions',match[1])
    ]);
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const employees=employeeRows.map(e=>{const v=versions.filter(v=>v.emp_id===e.id&&v.effective_from<=today).sort((a,b)=>b.effective_from.localeCompare(a.effective_from)||Number(b.version_no)-Number(a.version_no))[0];return{...e,...(v?.snapshot.employee||{})}});
    const employeeColumns=['emp_no','last_name','first_name','middle_name','birth_date','sex','contact','address','position','department','site','location','status','date_hired','date_end','time_in','time_out','rest_day',...fields.map(f=>f.fkey)];
    const attendanceColumns=['emp_no','date','type','late','ut','time_in','time_out','break_min','duty_code','reg_min','ot_min','nsd_min','verified','reviewed','review_status','submitted_by','submitted_at','decided_by','decided_at','review_note','source','revision','segments'];
    const employeeMap=new Map(employees.map(e=>[e.id,e]));
    const tabs={Employees:[employeeColumns,...employees.map(e=>employeeColumns.map(k=>k.startsWith('cf_')?e.custom?.[k]:e[k]))],
      Attendance:[attendanceColumns,...attendance.map(r=>attendanceColumns.map(k=>k==='emp_no'?employeeMap.get(r.emp_id)?.emp_no:r[k]))],
      'Pay snapshots':[['emp_no','date','gross','components'],...pays.map(p=>[employeeMap.get(p.emp_id)?.emp_no,p.date,p.gross,p.comps])],
      'Sync info':[['period_start','period_end','synced_at','synced_by'],[start,end,new Date().toISOString(),user.email]]};
    const token=await googleToken(),googleHeaders={Authorization:'Bearer '+token,'Content-Type':'application/json'},sheetBase='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(process.env.GOOGLE_SHEET_ID);
    const book=await jsonFetch(sheetBase+'?fields=sheets(properties)',{headers:googleHeaders});
    let nextId=Math.max(0,...book.sheets.map(s=>s.properties.sheetId))+1;
    const requests=[];
    for(const [title,values] of Object.entries(tabs)){
      let properties=book.sheets.find(s=>s.properties.title===title)?.properties;
      if(!properties){properties={sheetId:nextId++,title,gridProperties:{rowCount:Math.max(1000,values.length),columnCount:Math.max(26,values[0].length)}};requests.push({addSheet:{properties}})}
      else if(values.length>properties.gridProperties.rowCount||values[0].length>properties.gridProperties.columnCount)requests.push({updateSheetProperties:{properties:{sheetId:properties.sheetId,gridProperties:{rowCount:Math.max(values.length,properties.gridProperties.rowCount),columnCount:Math.max(values[0].length,properties.gridProperties.columnCount)}},fields:'gridProperties.rowCount,gridProperties.columnCount'}});
      // Clear and replace each managed tab in one atomic batchUpdate request.
      requests.push({updateCells:{range:{sheetId:properties.sheetId},rows:sheetRows(values),fields:'userEnteredValue'}});
    }
    await jsonFetch(sheetBase+':batchUpdate',{method:'POST',headers:googleHeaders,body:JSON.stringify({requests})});
    return res.status(200).json({employees:employees.length,attendance:attendance.length,start,end});
  }catch(error){console.error('AMS Sheets sync:',error.message);return res.status(502).json({error:'Sync failed; check Vercel logs and Google Sheet sharing, then retry'});}
};
module.exports.sheetRows=sheetRows;
