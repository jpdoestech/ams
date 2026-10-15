const fs=require('node:fs');
fs.mkdirSync('public/assets',{recursive:true});
fs.copyFileSync('index.html','public/index.html');
for(const file of fs.readdirSync('assets'))fs.copyFileSync('assets/'+file,'public/assets/'+file);
console.log('Static frontend prepared in public/');
