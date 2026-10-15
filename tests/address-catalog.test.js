const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {browser}=require('./helpers');
let dom,w;
before(async()=>{dom=await browser();w=dom.window});after(()=>dom?.window.close());
test('address references include every region and distinguish duplicate municipality names',()=>{
 const rows=w.AMSAddresses.entries('city',[]),regions=w.AMSAddresses.entries('region',[]);
 assert.equal(regions.length,18);assert.equal(rows.length,1642);
 assert.equal(new Set(rows.map(x=>x.value)).size,1642);
 assert.ok(rows.filter(x=>x.value.startsWith('San Jose — ')).length>1);
 assert.ok(rows.every(x=>regions.some(r=>r.value===x.parent)));
});
test('saved holiday city and region aliases remain usable without database writes',()=>{
 const saved=[{id:'r',kind:'region',value:'Davao Region'},{id:'c',kind:'city',value:'Davao City',parent:'Davao Region'}];
 const rows=w.AMSAddresses.citiesFor('Davao Region',saved);
 assert.ok(rows.some(x=>x.value==='Davao City'));assert.ok(rows.some(x=>x.value==='Digos City'));
 assert.ok(!rows.some(x=>x.value==='Manila'));assert.equal(w.AMSAddresses.regionFor('Davao City',saved),'Davao Region');
 assert.equal(saved.length,2);
});
test('employee and store region changes clear incompatible city selections; references show in Standards',()=>{
 w.eval(`V='emp';shell();eform(E[0].id)`);
 const reg=w.document.getElementById('f_location_region');assert.ok(reg);
 reg.value='Davao Region';reg.dispatchEvent(new w.Event('change',{bubbles:true}));
 const city=w.document.getElementById('f_location');assert.equal(city.value,'');
 assert.ok([...city.options].some(x=>x.value==='Davao City'));assert.ok(![...city.options].some(x=>x.value==='Manila'));
 w.eval(`storeM(ST[0].id)`);const storeReg=w.document.getElementById('str');
 storeReg.value='NCR';storeReg.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(w.document.getElementById('stc').value,'');assert.ok(![...w.document.getElementById('stc').options].some(x=>x.value==='Davao City'));
 w.eval(`closeM();V='std';LKK='region';shell()`);assert.match(w.document.getElementById('mn').textContent,/Reference/);
 assert.equal(w.document.querySelectorAll('[data-act=lkdel][data-id^="address:"]').length,0);
});
