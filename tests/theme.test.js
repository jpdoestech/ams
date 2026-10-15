const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),vm=require('node:vm');
function fixture({saved,systemDark=false,blocked=false}={}){
 const dom=new JSDOM('<meta name="theme-color"><select data-theme-preference><option>system</option><option>light</option><option>dark</option></select>',{url:'https://ams.test',runScripts:'outside-only'}),w=dom.window,listeners=new Set();
 const media={matches:systemDark,addEventListener:(_type,fn)=>listeners.add(fn)};w.matchMedia=()=>media;
 if(saved)w.localStorage.setItem('ams_theme',saved);
 if(blocked)Object.defineProperty(w,'localStorage',{get(){throw Error('Storage denied')}});
 new vm.Script(fs.readFileSync('assets/theme.js','utf8')).runInContext(dom.getInternalVMContext());
 return{dom,w,changeSystem(dark){media.matches=dark;listeners.forEach(fn=>fn({matches:dark}))}};
}
test('initial theme follows system and applies before UI rendering',()=>{
 const {dom,w}=fixture({systemDark:true});try{assert.equal(w.AMSTheme.get(),'system');assert.equal(w.document.documentElement.dataset.theme,'dark');assert.equal(w.document.documentElement.style.colorScheme,'dark');assert.equal(w.document.querySelector('select').value,'system')}finally{dom.window.close()}
});
test('explicit preference overrides system and is persisted for reload',()=>{
 const f=fixture({systemDark:true,saved:'light'});try{
  assert.equal(f.w.AMSTheme.resolved(),'light');f.changeSystem(false);f.changeSystem(true);assert.equal(f.w.AMSTheme.resolved(),'light');
  f.w.document.querySelector('select').value='dark';f.w.document.querySelector('select').dispatchEvent(new f.w.Event('change',{bubbles:true}));
  assert.equal(f.w.AMSTheme.resolved(),'dark');assert.equal(f.w.localStorage.getItem('ams_theme'),'dark');
  const reloaded=fixture({saved:f.w.localStorage.getItem('ams_theme')});try{assert.equal(reloaded.w.AMSTheme.resolved(),'dark')}finally{reloaded.dom.window.close()}
 }finally{f.dom.window.close()}
});
test('system changes update only the system preference',()=>{
 const f=fixture();try{assert.equal(f.w.AMSTheme.resolved(),'light');f.changeSystem(true);assert.equal(f.w.AMSTheme.resolved(),'dark');f.w.AMSTheme.set('light');f.changeSystem(false);f.changeSystem(true);assert.equal(f.w.AMSTheme.resolved(),'light');f.w.AMSTheme.set('system');assert.equal(f.w.AMSTheme.resolved(),'dark')}finally{f.dom.window.close()}
});
test('invalid preferences and unavailable storage do not prevent theme changes',()=>{
 for(const options of [{saved:'invalid'},{blocked:true}]){const f=fixture(options);try{assert.equal(f.w.AMSTheme.get(),'system');f.w.AMSTheme.set('dark');assert.equal(f.w.AMSTheme.resolved(),'dark');f.w.AMSTheme.set('invalid');assert.equal(f.w.AMSTheme.get(),'dark')}finally{f.dom.window.close()}}
});
test('cross-tab preference changes and storage clearing update current controls',()=>{
 const f=fixture();try{f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'ams_theme',newValue:'dark'}));assert.equal(f.w.AMSTheme.resolved(),'dark');assert.equal(f.w.document.querySelector('select').value,'dark');f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:null,newValue:null}));assert.equal(f.w.AMSTheme.get(),'system');assert.equal(f.w.AMSTheme.resolved(),'light')}finally{f.dom.window.close()}
});
test('both palettes maintain readable semantic text and input boundaries',()=>{
 const css=fs.readFileSync('assets/styles.css','utf8');
 const luminance=hex=>{const c=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};
 const contrast=(a,b)=>{const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(values[0]+.05)/(values[1]+.05)};
 for(const theme of ['light','dark']){
  const block=css.split(`[data-theme="${theme}"]`)[1].split('}')[0],tokens=Object.fromEntries([...block.matchAll(/--([\w-]+):#([\da-f]{6})\b/gi)].map(m=>[m[1],m[2]]));
  const pairs=[['tx','sf'],['mu','sf'],['mu','bg'],['prt','pr'],['pr-text','pr-soft'],['tABSENT','ABSENT'],['tLEAVE','LEAVE'],['tDAYOFF','DAYOFF'],['tAWOL','AWOL'],['tLATE','LATE'],['danger-on','danger']];
  for(const [fg,bg] of pairs)assert.ok(contrast(tokens[fg],tokens[bg])>=4.5,`${theme}: ${fg}/${bg}`);
  assert.ok(contrast(tokens['input-border'],tokens.sf)>=3,theme+' input boundaries');
 }
});
