const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
async function run(url,{configured=false,fail=false}={}){
 const dom=new JSDOM('<div id="app"></div>',{url,runScripts:'outside-only'}),w=dom.window,requests=[];
 w.document.head.append=script=>{requests.push(script.src);queueMicrotask(()=>{if(script.src.endsWith('/api/config')){if(fail){script.onerror();return}w.AMS_CONFIG=configured?{URL:'https://example.supabase.co'}:{}}script.onload()})};
 new vm.Script(fs.readFileSync('assets/bootstrap.js','utf8')).runInContext(dom.getInternalVMContext());await w.AMSBoot;return{dom,w,requests};
}
test('direct-file startup skips server configuration and SDK requests',async()=>{
 const f=await run('file:///C:/project/index.html');try{assert.deepEqual(f.requests,['file:///C:/project/assets/app.js']);assert.equal(f.w.AMS_CONFIG.URL,undefined)}finally{f.w.close()}
});
test('hosted startup loads configuration and configured Supabase SDK before the app',async()=>{
 const f=await run('https://ams.test/',{configured:true});try{assert.equal(f.requests[0],'https://ams.test/api/config');assert.match(f.requests[1],/supabase-js/);assert.equal(f.requests[2],'https://ams.test/assets/app.js')}finally{f.w.close()}
});
test('failed hosted configuration does not silently start an unconfigured app',async()=>{
 const f=await run('https://ams.test/',{fail:true});try{assert.deepEqual(f.requests,['https://ams.test/api/config']);assert.match(f.w.document.querySelector('[role=alert]').textContent,/Could not load \/api\/config/)}finally{f.w.close()}
});
