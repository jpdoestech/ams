const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {supabaseConfig}=require('../lib/supabase-config');
const {parsePublicConfig}=require('../scripts/check-deployment');
test('deployment check parses public JSON without executing remote scripts',()=>{
 assert.deepEqual(parsePublicConfig('window.AMS_CONFIG={"URL":"https://example.supabase.co","KEY":"public"};'),{URL:'https://example.supabase.co',KEY:'public'});
 assert.throws(()=>parsePublicConfig('window.AMS_CONFIG={};process.exit()'),/Unexpected/);
});
test('Supabase wizard aliases and deployment names resolve consistently without exposing private keys',()=>{
 assert.deepEqual(supabaseConfig({NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',GOOGLE_PRIVATE_KEY:'private'}),{URL:'https://example.supabase.co',KEY:'sb_publishable_test'});
 assert.deepEqual(supabaseConfig({SUPABASE_URL:'https://server.supabase.co',SUPABASE_ANON_KEY:'old-anon',NEXT_PUBLIC_SUPABASE_URL:'https://alias.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'alias'}),{URL:'https://server.supabase.co',KEY:'old-anon'});
});
test('static browser client enables SDK session persistence and refresh without Next middleware',()=>{
 let options;const box={supabase:{createClient:(url,key,opts)=>{options={url,key,...opts};return 'client'}}};vm.runInNewContext(fs.readFileSync('assets/supabase-client.js','utf8'),box);
 assert.equal(box.AMSAuth.createClient({URL:'https://example.supabase.co',KEY:'public'}),'client');assert.equal(options.auth.autoRefreshToken,true);assert.equal(options.auth.persistSession,true);assert.equal(options.auth.detectSessionInUrl,true);
 assert.throws(()=>box.AMSAuth.createClient({URL:'https://example.supabase.co'}),/publishable key/);
});
test('installed Supabase SDK sends the public API key for login, signup and save RPCs',async()=>{
 const {createClient}=require('@supabase/supabase-js'),requests=[];
 const client=createClient('https://test.supabase.co','public-test-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{
  requests.push({url:String(url),headers:new Headers(options.headers)});
  return new Response(JSON.stringify({message:'Rejected for test',code:'invalid_credentials'}),{status:400,headers:{'Content-Type':'application/json'}});
 }}});
 await client.auth.signInWithPassword({email:'person@example.com',password:'incorrect'});
 await client.auth.signUp({email:'person@example.com',password:'password'});
 await client.rpc('save_assignment_version',{});
 await client.rpc('save_employees',{});
 assert.equal(requests.length,4);
 for(const request of requests)assert.equal(request.headers.get('apikey'),'public-test-key',request.url);
});
