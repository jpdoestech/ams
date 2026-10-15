const fs=require('node:fs');
fs.mkdirSync('public/assets',{recursive:true});
fs.copyFileSync('index.html','public/index.html');
for(const file of fs.readdirSync('assets'))fs.copyFileSync('assets/'+file,'public/assets/'+file);
fs.copyFileSync(require.resolve('exceljs/dist/exceljs.min.js'),'public/assets/exceljs.min.js');
fs.copyFileSync(require.resolve('exceljs/LICENSE'),'public/assets/exceljs.LICENSE.txt');
console.log('Static frontend prepared in public/');
