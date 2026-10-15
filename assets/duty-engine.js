/* Shared calculation core. Money is rounded half-up per component, per calendar date.
 * Callers supply dated classification/rules; production writes are recomputed in SQL.
 */
(function(root){
  'use strict';
  const minute=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v||'')?Number(v.slice(0,2))*60+Number(v.slice(3)):null;
  const round=v=>Math.round((v+Number.EPSILON)*100)/100;
  function calculate(o){
    const start=minute(o.tin),end=minute(o.tout);
    if(start===null||end===null)return null;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(o.date)||new Date(o.date+'T00:00:00Z').toISOString().slice(0,10)!==o.date)throw Error('Invalid work date');
    const span=(end-start+1440)%1440,hpd=o.hpd??8,daily=o.daily??0,breaks=o.brks||[];
    if(!Number.isFinite(hpd)||hpd<=0||hpd>24||!Number.isFinite(daily)||daily<0)throw Error('Invalid wage or normal hours');
    if(breaks.some(([a,b])=>!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<a))throw Error('Invalid break interval');
    const hourly=daily/hpd,segments={};let worked=0;
    for(let k=0;k<span;k++){
      if(breaks.some(([a,b])=>k>=a&&k<b))continue;
      const absolute=start+k,date=new Date(Date.parse(o.date+'T00:00:00Z')+Math.floor(absolute/1440)*86400000).toISOString().slice(0,10);
      const clock=absolute%1440,night=clock>=1320||clock<360,ot=worked>=Math.round(hpd*60);worked++;
      const s=segments[date]||(segments[date]={date,code:o.force||o.classify(date),reg:0,ot:0,nsd:0,nsdOt:0});
      if(ot){s.ot++;if(night)s.nsdOt++}else{s.reg++;if(night)s.nsd++}
    }
    const segs=Object.values(segments);let gross=0,regMin=0,otMin=0,nsdMin=0;
    for(const s of segs){
      const rule=o.rule(s.code,s.date);if(!rule)throw Error('No effective pay rule for '+s.code+' on '+s.date);
      s.mr=Number(rule.mult_reg);s.mo=Number(rule.mult_ot);s.rule_id=rule.id;s.rule_from=rule.effective_from;s.nsd_pct=Number(rule.nsd_pct??10);
      s.base=round(hourly*s.reg/60);s.prem=round(hourly*s.reg/60*(s.mr-1));s.otAmt=round(hourly*s.ot/60*s.mo);
      s.nsdAmt=round(hourly/60*(s.nsd*s.mr+s.nsdOt*s.mo)*s.nsd_pct/100);s.gross=round(s.base+s.prem+s.otAmt+s.nsdAmt);
      gross+=s.gross;regMin+=s.reg;otMin+=s.ot;nsdMin+=s.nsd+s.nsdOt;
    }
    const top=segs.slice().sort((a,b)=>(b.reg+b.ot)-(a.reg+a.ot))[0];
    return{segs,gross:round(gross),regMin,otMin,nsdMin,workedMin:worked,code:top?.code||'OD',hourly};
  }
  const api={calculate,minute,round};if(typeof module!=='undefined')module.exports=api;else root.DutyEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
