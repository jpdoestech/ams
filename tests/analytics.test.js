const {test}=require('node:test'),assert=require('node:assert/strict');
const {dates,build}=require('../assets/analytics');
const employee={id:'a',emp_no:'1',status:'Active',date_hired:'2026-10-01',site:'Alpha',department:'Security'};

test('workforce groups and assignment filters follow dated transfers and saved duty snapshots',()=>{
 const context=(e,d)=>({...e,site:d<'2026-10-03'?'Alpha':'Beta'}),attendance=[{emp_id:'a',date:'2026-10-01',type:'PRESENT',verified:true,reg_min:480,schedule_snapshot:{site:'Alpha',department:'Security'}},{emp_id:'a',date:'2026-10-04',type:'PRESENT',verified:true,reg_min:480,schedule_snapshot:{site:'Beta',department:'Security'}}];
 const all=build({employees:[employee],attendance,start:'2026-10-01',end:'2026-10-04',context});
 assert.deepEqual(all.groups.map(g=>[g.site,g.start,g.end,g.hours]),[['Alpha',1,0,8],['Beta',0,1,8]]);
 const beta=build({employees:[employee],attendance,start:'2026-10-01',end:'2026-10-04',context,include:e=>e.site==='Beta'});
 assert.equal(beta.startHeadcount,0);assert.equal(beta.endHeadcount,1);assert.equal(beta.totals.hours,8);assert.equal(beta.totals.scheduled,2);
});
test('analytics validates real, ordered date ranges with a bounded inclusive length',()=>{
 assert.equal(dates('2026-10-01','2026-10-03').length,3);
 for(const [a,b] of [['2026-02-30','2026-03-01'],['2026-10-03','2026-10-01'],['2025-01-01','2026-10-01']])assert.throws(()=>dates(a,b));
});
test('analytics separates actual work, paid/unpaid leave, absence and unverified blanks',()=>{
 const r=build({employees:[employee],start:'2026-10-01',end:'2026-10-06',attendance:[
  {emp_id:'a',date:'2026-10-01',type:'PRESENT',verified:true,reg_min:480,ot_min:60},
  {emp_id:'a',date:'2026-10-02',type:'LEAVE'},
  {emp_id:'a',date:'2026-10-03',type:'LEAVE-U'},
  {emp_id:'a',date:'2026-10-04',type:'ABSENT'},
  {emp_id:'a',date:'2026-10-05',type:'LATE/UT',verified:false,late:15}
 ]});
 assert.equal(r.totals.worked,1);assert.equal(r.totals.hours,9);assert.equal(r.totals.ot,1);
 assert.equal(r.totals.paidLeave,1);assert.equal(r.totals.unpaidLeave,1);assert.equal(r.totals.absent,1);assert.equal(r.totals.unverified,2);
 assert.equal(r.totals.scheduled,6);assert.ok(Math.abs(r.totals.rate-100/6)<1e-10);assert.equal(r.totals.late,15);
});
test('overnight work is allocated to actual dates and deduplicated per employee/day',()=>{
 const r=build({employees:[employee],start:'2026-10-02',end:'2026-10-02',attendance:[
  {emp_id:'a',date:'2026-10-01',type:'PRESENT',verified:true,segments:[{date:'2026-10-01',reg:120,ot:0},{date:'2026-10-02',reg:360,ot:0}]},
  {emp_id:'a',date:'2026-10-02',type:'PRESENT',verified:true,segments:[{date:'2026-10-02',reg:60,ot:60}]}
 ]});
 assert.equal(r.totals.worked,1);assert.equal(r.totals.hours,8);assert.equal(r.totals.ot,1);assert.equal(r.totals.unverified,0);
});
test('workforce honors employment boundaries; rest-day work does not inflate scheduled attendance',()=>{
 const r=build({employees:[{...employee,status:'Resigned',date_end:'2026-10-02'},{...employee,id:'b',date_hired:'2026-10-03'}],start:'2026-10-01',end:'2026-10-04',isScheduled:(_e,d)=>d!=='2026-10-04',attendance:[{emp_id:'b',date:'2026-10-04',verified:true,reg_min:480}]});
 assert.deepEqual(r.daily.map(d=>d.headcount),[1,1,1,1]);assert.equal(r.groups[0].hires,2);assert.equal(r.groups[0].separations,1);
 const b=r.rows.find(r=>r.e.id==='b');assert.equal(b.worked,1);assert.equal(b.scheduled,1);assert.equal(b.rate,0);assert.equal(b.unverified,1);
});
test('explicit N/A and day-off records do not become scheduled days; pre-hire records are excluded',()=>{
 const r=build({employees:[{...employee,date_hired:'2026-10-02'}],start:'2026-10-01',end:'2026-10-04',attendance:[
  {emp_id:'a',date:'2026-10-01',type:'ABSENT'},
  {emp_id:'a',date:'2026-10-02',type:'N/A'},
  {emp_id:'a',date:'2026-10-03',type:'DAY-OFF'}
 ]});assert.equal(r.totals.scheduled,1);assert.equal(r.totals.unverified,1);assert.equal(r.totals.absent,0);
});
