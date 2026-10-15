/* Load runtime configuration before app initialization; file previews use demo mode. */
(function(root){
 const base=document.currentScript?.src||new URL('assets/bootstrap.js',document.baseURI).href;
 function load(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('Could not load '+new URL(src).pathname))};document.head.append(script)})}
 root.AMSBoot=(async()=>{
  if(location.protocol==='file:')root.AMS_CONFIG={};
  else await load(new URL('/api/config',location.href).href);
  if(root.AMS_CONFIG?.URL)await load('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js');
  await load(new URL('app.js',base).href);
 })().catch(error=>{const message=document.createElement('p');message.setAttribute('role','alert');message.className='bootstrap-error';message.textContent=error.message+'. Refresh the page to retry.';document.getElementById('app').replaceChildren(message)});
})(globalThis);
