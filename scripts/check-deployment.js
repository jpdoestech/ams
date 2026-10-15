/* Read-only public deployment check. Never signs in or changes remote data. */
function parsePublicConfig(source){const match=/^\s*window\.AMS_CONFIG\s*=\s*(\{[\s\S]*\})\s*;\s*$/.exec(source);if(!match)throw Error('Unexpected public config format');return JSON.parse(match[1])}
async function checkDeployment(input){
 const base=new URL(input);if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw Error('Use an HTTPS deployment URL');
 const fetchPath=async path=>{const r=await fetch(new URL(path,base),{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(path+' returned HTTP '+r.status);return{body:await r.text(),headers:r.headers}};
 const [page,config]=await Promise.all([fetchPath('/'),fetchPath('/api/config')]);
 const c=parsePublicConfig(config.body);
 const checks={frontend:page.body.includes('id="app"'),securityHeaders:!!page.headers.get('content-security-policy'),supabaseConfigured:!!c.URL&&!!c.KEY,sheetsConfigured:!!c.SHEETS,operationsDeployed:page.body.includes('assets/operations.js')};
 return checks;
}
if(require.main===module){const url=process.argv[2]||process.env.AMS_DEPLOYMENT_URL;if(!url){console.error('Usage: npm run check:deployment -- https://your-app.vercel.app');process.exitCode=1}else checkDeployment(url).then(checks=>{for(const [name,ok] of Object.entries(checks))console.log((ok?'PASS':'MISSING')+' '+name);console.log('Public checks only. Auth, database migrations, permissions and Google writes still require authenticated acceptance testing.');if(Object.values(checks).some(ok=>!ok))process.exitCode=1}).catch(error=>{console.error(error.message);process.exitCode=1})}
module.exports={checkDeployment,parsePublicConfig};
