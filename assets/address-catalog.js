/* Local reference values preserve saved names; no Supabase seeding or remote API. */
(function(root){
 const {regions,cities}=root.AMS_ADDRESS_DATA;
 const normalize=value=>String(value||'').trim().toLowerCase().replace(/^city of\s+/,'').replace(/\s+city$/,'');
 const regionCode=value=>regions.find(r=>r.name===value||r.name.toLowerCase().includes('('+String(value).toLowerCase()+')'))?.code;
 const cityName=name=>name==='City of Manila'?'Manila':name.replace(/^City of (.+)$/,'$1 City');
 const counts=new Map();for(const [,name] of cities)counts.set(cityName(name),(counts.get(cityName(name))||0)+1);
 function entries(kind,custom){
  if(!['region','city'].includes(kind))return custom.filter(x=>x.kind===kind);
  const saved=custom.filter(x=>x.kind===kind),regionValues=new Map(regions.map(r=>[r.code,custom.find(x=>x.kind==='region'&&regionCode(x.value)===r.code)?.value||r.name]));
  const reference=kind==='region'?regions.map(r=>({id:'address:'+r.code,kind,value:regionValues.get(r.code),reference:true})):cities.map(([code,name,region,province])=>{
   const base=cityName(name),value=counts.get(base)>1?base+' — '+province:base;
   const legacy=counts.get(base)===1?saved.find(x=>normalize(x.value)===normalize(base)&&(!x.parent||regionCode(x.parent)===region)):null;
   return {id:'address:'+code,kind,value:legacy?.value||value,parent:regionValues.get(region),reference:true};
  });
  const merged=new Map(reference.map(x=>[x.value.toLowerCase(),x]));for(const x of saved){const key=x.value.toLowerCase(),base=merged.get(key);merged.set(key,{...base,...x,parent:x.parent||base?.parent})}
  return [...merged.values()].sort((a,b)=>a.value.localeCompare(b.value));
 }
 function citiesFor(region,custom){const code=regionCode(region);return entries('city',custom).filter(x=>!region||x.parent===region||(code&&regionCode(x.parent)===code));}
 function regionFor(city,custom){return entries('city',custom).find(x=>x.value===city)?.parent||'';}
 root.AMSAddresses={entries,citiesFor,regionFor};
})(globalThis);
