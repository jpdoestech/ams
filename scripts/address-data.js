const fs=require('node:fs');
const regions=require('../address/regions.json'),cities=require('../address/cities.json'),provinces=require('../address/provinces.json');
const names=new Map(provinces.map(p=>[p.code,p.name]));
const data={regions,cities:cities.map(c=>[c.code,c.name,c.regionCode,names.get(c.provinceCode)||''])};
fs.writeFileSync('assets/address-data.js','/* Generated from address/*.json by scripts/address-data.js. */\nglobalThis.AMS_ADDRESS_DATA='+JSON.stringify(data)+';\n');
