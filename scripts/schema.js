const fs=require('node:fs');
const sql='-- Generated from ordered migrations; run as database owner in Supabase SQL Editor.\n\n'+fs.readdirSync('supabase/migrations').sort().map(name=>fs.readFileSync('supabase/migrations/'+name,'utf8')).join('\n\n');
if(process.argv.includes('--check')){
 if(fs.readFileSync('supabase/schema.sql','utf8')!==sql)throw Error('Fresh schema is stale; run npm run schema');
 console.log('Fresh schema matches migrations');
}else{fs.writeFileSync('supabase/schema.sql',sql);console.log('Fresh Supabase schema regenerated')}
