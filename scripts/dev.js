// Local preview serves only frontend assets and public runtime configuration.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.PORT||4173);
if(fs.existsSync(path.join(root,'.env.local')))process.loadEnvFile(path.join(root,'.env.local'));
http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/config'){
    res.status=code=>{res.statusCode=code;return res};res.send=value=>res.end(value);
    return require('../api/config')(req,res);
  }
  const relative=pathname==='/'?'index.html':pathname.slice(1);
  if(relative!=='index.html'&&!/^assets\/[a-zA-Z0-9_.-]+$/.test(relative)){res.writeHead(404);return res.end('Not found')}
  const file=relative==='assets/exceljs.min.js'?require.resolve('exceljs/dist/exceljs.min.js'):relative==='assets/supabase-js.js'?path.join(path.dirname(require.resolve('@supabase/supabase-js')),'umd','supabase.js'):path.join(root,relative);
  if(!fs.existsSync(file)){res.writeHead(404);return res.end('Not found')}
  const type={'.html':'text/html','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log('AMS preview: http://127.0.0.1:'+port));
