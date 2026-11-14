import {arrivals} from './core.js?v=web-21';
import {readTransitNote,mergeTransitNote} from './transit-note.js?v=web-21';
import {intercityTiming,intercitySummary} from './intercity-core.js?v=web-21';
export function scheduledMovement(day,index,date){
 const to=day.stops[index],from=day.stops[index-1],parsed=readTransitNote(to?.note);if(!from||parsed.kind!=='intercity'||parsed.plan.from!==from.id||parsed.plan.to!==to.id)throw Error('changed');
 const at=arrivals(day)[index-1],ready=at==null?null:at+from.stayMinutes,service=parsed.plan.service,timing=intercityTiming(service,{...parsed.plan.timing.options,readyMinutes:ready,date}),plan={...parsed.plan,timing};delete plan.review;
 return {id:to.id,from:from.id,method:'selected',kind:'intercity',minutes:timing.minutes,services:[{ko:service.kind+' '+service.no,en:service.kind+' '+service.no}],patch:{mode:'transit',travelMinutes:timing.minutes,durationSource:'manual',note:mergeTransitNote(parsed.note,plan,intercitySummary(service,timing),'intercity')}};
}
export function reconcileScheduledDay(day,date){
 const next=structuredClone(day);
 for(let i=1;i<next.stops.length;i++){
  const s=next.stops[i],parsed=readTransitNote(s.note);if(s.mode!=='transit'||parsed.kind!=='intercity'||parsed.plan.timing.mode!=='auto')continue;
  try{Object.assign(s,scheduledMovement(next,i,date).patch);}catch(error){delete s.travelMinutes;const plan={...parsed.plan,review:error.message,timing:{v:1,mode:'auto',minutes:null,options:parsed.plan.timing.options}};s.note=mergeTransitNote(parsed.note,plan,'시간표 재확인 필요 / Scheduled service needs review','intercity');}
 }
 return next;
}
