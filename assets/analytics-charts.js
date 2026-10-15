/* Responsive SVG charts from the same applied Analytics result as the tables. */
(function(root){
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=value=>Number.isFinite(+value)?Math.max(0,+value):0;
 const fmt=value=>number(value).toLocaleString('en-PH',{maximumFractionDigits:2});
 const legend=items=>`<div class="chart-legend">${items.map(([label,color])=>`<span><i style="--series:var(--chart-${color})"></i>${escape(label)}</span>`).join('')}</div>`;
 function line(title,subtitle,daily,series){
  const left=37,top=12,width=550,height=142,max=Math.max(1,...daily.flatMap(d=>series.map(s=>number(d[s.key])))),ticks=Math.min(4,Math.ceil(max)),upper=Math.ceil(max/ticks)*ticks;
  const x=i=>left+(daily.length===1?width/2:i*width/(daily.length-1)),y=value=>top+height-number(value)/upper*height;
  const grid=Array.from({length:ticks+1},(_,i)=>{const value=upper*i/ticks;return `<g class="chart-axis"><line x1="${left}" x2="${left+width}" y1="${y(value)}" y2="${y(value)}"/><text x="${left-8}" y="${y(value)+4}" text-anchor="end">${fmt(value)}</text></g>`}).join('');
  const paths=series.map(s=>`<path class="chart-series" style="--series:var(--chart-${s.color})" d="${daily.map((d,i)=>`${i?'L':'M'}${x(i).toFixed(2)},${y(d[s.key]).toFixed(2)}`).join(' ')}"/>${daily.length===1?`<circle cx="${x(0)}" cy="${y(daily[0][s.key])}" r="3" fill="var(--chart-${s.color})"/>`:''}`).join('');
  const zone=width/Math.max(1,daily.length-1);
  const hits=daily.map((d,i)=>{const tip=`${d.date} · ${series.map(s=>`${s.label}: ${fmt(d[s.key])}`).join(' · ')}`;return `<rect class="chart-hit" role="img" tabindex="${i===0?'0':'-1'}" aria-label="${escape(tip)}" data-chart-tip="${escape(tip)}" x="${Math.max(left,x(i)-zone/2)}" y="${top}" width="${Math.min(left+width,x(i)+zone/2)-Math.max(left,x(i)-zone/2)}" height="${height}"><title>${escape(tip)}</title></rect>`}).join('');
  return `<article class="analytics-chart"><h3>${escape(title)}</h3><p class="chart-subtitle">${escape(subtitle)}</p>${legend(series.map(s=>[s.label,s.color]))}<svg class="trend-svg" viewBox="0 0 610 190" role="group" aria-label="${escape(title)}. Use left and right arrows to explore daily values.">${grid}${paths}${hits}<g class="chart-axis"><text x="${left}" y="181">${escape(daily[0]?.date.slice(5)||'')}</text><text x="${left+width}" y="181" text-anchor="end">${escape(daily.at(-1)?.date.slice(5)||'')}</text></g></svg><p class="chart-readout" aria-live="polite">Hover a date or use arrow keys to inspect values.</p></article>`;
 }
 function workforce(groups){
  const sites=new Map();groups.forEach(g=>sites.set(g.site,(sites.get(g.site)||0)+number(g.end)));
  const ordered=[...sites].filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]),shown=ordered.slice(0,7);
  if(ordered.length>7)shown.push(['Other assignments',ordered.slice(7).reduce((n,[,v])=>n+v,0)]);
  const max=Math.max(1,...shown.map(([,n])=>n));
  return `<article class="analytics-chart"><h3>Workforce by assignment</h3><p class="chart-subtitle">Headcount on the last selected date</p><div class="workforce-bars">${shown.map(([site,count])=>`<div class="workforce-bar" tabindex="0" role="img" aria-label="${escape(site)}: ${count} employees"><div><span title="${escape(site)}">${escape(site)}</span><strong>${count}</strong></div><div class="chart-bar-track"><span style="width:${count/max*100}%"></span></div></div>`).join('')||'<p class="chart-empty">No employees in the end-date headcount.</p>'}</div></article>`;
 }
 function hours(totals){
  const total=number(totals.hours),ot=Math.min(total,number(totals.ot)),regular=total-ot,circ=2*Math.PI*64;
  const sectors=[[regular,'blue','Regular'],[ot,'violet','Overtime']];let offset=0;
  const arcs=sectors.map(([value,color,label])=>{const length=total?value/total*circ:0,arc=`<circle class="hours-sector" cx="100" cy="100" r="64" fill="none" stroke="var(--chart-${color})" stroke-width="28" stroke-dasharray="${length} ${circ-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 100 100)"><title>${label}: ${fmt(value)} hours</title></circle>`;offset+=length;return value?arc:''}).join('');
  return `<article class="analytics-chart"><h3>Recorded work hours</h3><p class="chart-subtitle">Regular and overtime hours · verified work only</p><div class="hours-chart"><svg viewBox="0 0 200 200" role="img" aria-label="${escape(`Recorded hours ${fmt(total)}. Regular ${fmt(regular)}, overtime ${fmt(ot)}.`)}"><circle class="hours-track" cx="100" cy="100" r="64" fill="none" stroke-width="28"/>${arcs}<text x="100" y="98" text-anchor="middle" class="hours-total">${fmt(total)}</text><text x="100" y="119" text-anchor="middle" class="hours-unit">hours</text></svg><div>${legend([['Regular','blue'],['Overtime','violet']])}${sectors.map(([value,,label])=>`<p class="hours-detail"><span>${label}</span><strong>${fmt(value)} h <small>${total?(value/total*100).toFixed(1):'0'}%</small></strong></p>`).join('')}${!total?'<p class="chart-empty">No verified work hours in this range.</p>':''}</div></div></article>`;
 }
 function render(result){
  if(!result.rows.length)return '<div class="chart-empty overview-empty">No employees match this range and filters.</div>';
  return line('Attendance trend','Employees per day · categories are independent',result.daily,[{key:'worked',label:'Verified work',color:'blue'},{key:'absent',label:'Absent / AWOL',color:'red'},{key:'leave',label:'Leave',color:'violet'},{key:'unverified',label:'Unverified',color:'slate'}])+
   line('Workforce trend','Headcount and scheduled employees per day',result.daily,[{key:'headcount',label:'Headcount',color:'blue'},{key:'scheduled',label:'Scheduled',color:'green'}])+workforce(result.groups)+hours(result.totals);
 }
 root.AMSAnalyticsCharts={render};if(typeof module!=='undefined')module.exports=root.AMSAnalyticsCharts;
 if(typeof document==='undefined')return;
 function read(target){const hit=target.closest?.('[data-chart-tip]');if(hit)hit.closest('.analytics-chart').querySelector('.chart-readout').textContent=hit.dataset.chartTip}
 document.addEventListener('pointerover',event=>read(event.target));
 document.addEventListener('focusin',event=>read(event.target));
 document.addEventListener('keydown',event=>{
  const svg=event.target.closest?.('.trend-svg');if(!svg||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const points=[...svg.querySelectorAll('[data-chart-tip]')],i=points.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?points.length-1:Math.max(0,Math.min(points.length-1,i+(event.key==='ArrowLeft'?-1:1)));
  points.forEach((p,n)=>p.setAttribute('tabindex',n===next?'0':'-1'));points[next]?.focus();
 });
})(globalThis);
