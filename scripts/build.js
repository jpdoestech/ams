const fs=require('node:fs');
fs.mkdirSync('public/assets',{recursive:true});
fs.writeFileSync('public/index.html',fs.readFileSync('index.html','utf8').replace('data-file-library="../node_modules/exceljs/dist/exceljs.min.js"','data-file-library="exceljs.min.js"'));
for(const file of fs.readdirSync('assets'))fs.copyFileSync('assets/'+file,'public/assets/'+file);
fs.copyFileSync(require.resolve('exceljs/dist/exceljs.min.js'),'public/assets/exceljs.min.js');
fs.copyFileSync(require.resolve('exceljs/LICENSE'),'public/assets/exceljs.LICENSE.txt');
fs.copyFileSync(require('node:path').join(require('node:path').dirname(require.resolve('@supabase/supabase-js')),'umd','supabase.js'),'public/assets/supabase-js.js');
console.log('Static frontend prepared in public/');
