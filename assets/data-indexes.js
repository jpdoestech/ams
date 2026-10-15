/* Immutable-version indexes shared by previews, Summary, and Analytics. */
const temporalIndexes=new Map();
function versionAt(name,rows,keyField,key,date,activeOnly=false){
 let index=temporalIndexes.get(name);
 if(!index||index.source!==rows||index.length!==rows.length||index.activeOnly!==activeOnly){
  const groups=new Map();for(const row of rows){if(typeof row.effective_from!=='string'||activeOnly&&row.active===false)continue;if(!groups.has(row[keyField]))groups.set(row[keyField],[]);groups.get(row[keyField]).push(row)}
  for(const group of groups.values())group.sort((a,b)=>a.effective_from.localeCompare(b.effective_from));
  index={source:rows,length:rows.length,groups,activeOnly};temporalIndexes.set(name,index);
 }
 const group=index.groups.get(key)||[];let low=0,high=group.length;while(low<high){const mid=(low+high)>>>1;if(group[mid].effective_from<=date)low=mid+1;else high=mid}return group[low-1];
}
let holidayIndexSource=null,holidayIndexLength=-1,holidayIndex=new Map();
function holidaysForDate(date){
 if(holidayIndexSource!==H||holidayIndexLength!==H.length){holidayIndexSource=H;holidayIndexLength=H.length;holidayIndex=new Map();for(const row of H){if(!holidayIndex.has(row.date))holidayIndex.set(row.date,[]);holidayIndex.get(row.date).push(row)}}
 return holidayIndex.get(date)||[];
}
