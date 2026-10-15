const {test}=require('node:test'),assert=require('node:assert/strict');
const {build}=require('../assets/analytics'),{render}=require('../assets/analytics-charts');
const employee={id:'a',emp_no:'1',site:'Alpha <script>',status:'Active'};
test('overview graphs use verified hours and keep regular and overtime slices disjoint',()=>{
 const result=build({employees:[employee],start:'2026-10-01',end:'2026-10-02',attendance:[{emp_id:'a',date:'2026-10-01',verified:true,reg_min:480,ot_min:120,type:'PRESENT'}]});
 const html=render(result);assert.match(html,/Regular 8, overtime 2/);assert.match(html,/80\.0%/);assert.match(html,/20\.0%/);
 assert.match(html,/Verified work: 1/);assert.match(html,/Unverified: 1/);assert.match(html,/Alpha &lt;script&gt;/);assert.doesNotMatch(html,/<script>|NaN|Infinity/);
});
test('single-day zero-work and empty ranges produce honest, finite chart states',()=>{
 const result=build({employees:[employee],start:'2026-10-01',end:'2026-10-01',attendance:[]});
 const html=render(result);assert.match(html,/No verified work hours/);assert.doesNotMatch(html,/NaN|Infinity/);assert.match(html,/Workforce by assignment/);
 assert.match(render(build({employees:[],start:'2026-10-01',end:'2026-10-01',attendance:[]})),/No employees match/);
});
