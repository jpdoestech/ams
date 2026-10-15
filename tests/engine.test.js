const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calculate}=require('../assets/duty-engine');
const rates={OD:[1,1.25],RD:[1.3,1.69],SNWD:[1.3,1.69],'SNWD-RD':[1.5,1.95],DSNWD:[1.5,1.95],'DSNWD-RD':[1.95,2.535],RH:[2,2.6],'RH-RD':[2.6,3.38],DRH:[3,3.9],'DRH-RD':[3.9,5.07],SWD:[1,1.25]};
const rule=code=>({id:code,mult_reg:rates[code][0],mult_ot:rates[code][1],nsd_pct:10,effective_from:'2000-01-01'});
const base={date:'2026-10-14',tin:'08:00',tout:'17:00',hpd:8,daily:610,brks:[[240,300]],classify:()=> 'OD',rule};
test('all eleven seeded classifications: regular and OT relative to ordinary wage',()=>{
 for(const [code,[mr,mo]] of Object.entries(rates)){
  const r=calculate({...base,tout:'19:00',classify:()=>code});
  assert.equal(r.regMin,480);assert.equal(r.otMin,120);assert.equal(r.gross,Math.round((610*mr+Math.round(76.25*2*mo*100)/100)*100)/100,code);
 }
});
test('partial shift, zero shift, incomplete punches and invalid wage',()=>{
 assert.equal(calculate({...base,tout:'12:00',brks:[]}).gross,305);
 assert.equal(calculate({...base,tout:'08:00',brks:[]}).workedMin,0);
 assert.equal(calculate({...base,tout:''}),null);
 assert.equal(calculate({...base,tin:'25:00'}),null);
 assert.throws(()=>calculate({...base,hpd:-8}),/Invalid wage/);
 assert.throws(()=>calculate({...base,daily:Infinity}),/Invalid wage/);
});
test('night OT compounded and overnight holiday split',()=>{
 const r=calculate({...base,tin:'18:00',tout:'06:00',brks:[[240,300]]});assert.equal(r.gross,955.04);assert.equal(r.nsdMin,420);
 const crossing=calculate({...base,tin:'20:00',tout:'04:00',brks:[],classify:d=>d==='2026-10-15'?'RH':'OD'});
 assert.equal(crossing.segs.length,2);assert.equal(crossing.gross,991.25);
});
test('more favorable rule and dated resolver are preserved in snapshot',()=>{
 const r=calculate({...base,rule:(c,d)=>({...rule(c),id:'company-v2',effective_from:d,mult_reg:1.5})});
 assert.equal(r.gross,915);assert.equal(r.segs[0].rule_id,'company-v2');assert.equal(r.segs[0].rule_from,'2026-10-14');
});
