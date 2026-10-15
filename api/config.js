// Only public Supabase credentials are returned. Never expose Google/service-role keys.
module.exports=function config(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/javascript; charset=utf-8');
  const values={URL:process.env.SUPABASE_URL||'',KEY:process.env.SUPABASE_ANON_KEY||'',SHEETS:process.env.GOOGLE_SHEET_ID?'/api/sync':''};
  res.status(200).send('window.AMS_CONFIG='+JSON.stringify(values).replace(/</g,'\\u003c')+';');
};
