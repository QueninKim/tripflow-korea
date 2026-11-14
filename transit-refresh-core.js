import {validateWalkingRoute} from './walking-core.js?v=web-21';
import {readTransitNote,mergeTransitNote} from './transit-note.js?v=web-21';
import {recommendAutoRoutes,autoOptions,autoTimingSnapshot,autoSummary,validateAutoPlan,quoteAutoRoute} from './auto-core.js?v=web-21';
import {estimateMixedTime,mixedTimingSnapshot,mixedSummary,validateMixedPlan} from './mixed-core.js?v=web-21';
import {validateBusPlan,estimateBusTime,busSummary} from './bus-core.js?v=web-21';
import {validateMetroPlan,metroSummary} from './metro-core.js?v=web-21';
import {estimateMetroTime,timingSnapshot,groundMeters} from './metro-time.js?v=web-21';
export const hasSelectedTransit=(parsed,from,to)=>!!parsed.plan&&parsed.kind!=='walking'&&parsed.plan.from===from.id&&parsed.plan.to===to.id&&!(parsed.kind==='auto'&&parsed.plan.routeMode==='walking');
export function calculateWalkingMovement(from,to,value){
  const route=validateWalkingRoute(value);if(groundMeters(route.from,[from.place.latitude,from.place.longitude])>1||groundMeters(route.to,[to.place.latitude,to.place.longitude])>1||!route.id)throw Error('walking-endpoints');
  const {path,minutes,...snapshot}=route,plan={v:1,from:from.id,to:to.id,route:snapshot,timing:{v:1,mode:'auto',minutes}},summary=`실제 보행 경로 / Walking route · ${Math.round(route.meters)}m\n⏱ 자동 예상 ${minutes}분 / Auto estimate ${minutes} min`;
  let note;try{note=mergeTransitNote(to.note,plan,summary,'walking');}catch(e){if(e.message!=='note-too-long')throw e;delete plan.route.shape;note=mergeTransitNote(to.note,plan,summary,'walking');}
  return {id:to.id,from:from.id,method:'walking',kind:'walking',minutes,meters:route.meters,seconds:route.seconds,route,services:[],patch:{mode:'walking',travelMinutes:minutes,durationSource:'gateway',note}};
}
export function compareMovementTimes(transit,walking){
  if(!transit||transit.error||!walking||walking.error)return null;
  const difference=transit.minutes-walking.minutes;
  return {faster:difference===0?'equal':difference>0?'walking':'transit',minutes:Math.abs(difference)};
}
export function calculateTransitMovement(data,from,to){
  const fromPlace=from.place,toPlace=to.place,parsed=readTransitNote(to.note),same=groundMeters([fromPlace.latitude,fromPlace.longitude],[toPlace.latitude,toPlace.longitude])<5;
  if(same)return {id:to.id,from:from.id,method:'same-place',minutes:0,services:[],patch:{mode:'walking',travelMinutes:0,durationSource:'gateway',note:mergeTransitNote(to.note,null)}};
  let kind,plan,summary,minutes,candidates,method='selected',services=[];
  if(hasSelectedTransit(parsed,from,to)){
    kind=parsed.kind;plan=structuredClone(parsed.plan);
    try{
      if(kind==='auto'){
        validateAutoPlan(data,plan);const q=quoteAutoRoute(data,plan.legs,{fromPlace,toPlace,options:plan.timing?.options});plan.timing=autoTimingSnapshot(q);summary=autoSummary(data,plan);services=q.details.map(d=>({ko:d.ko,en:d.en}));
      }else if(kind==='mixed'){
        validateMixedPlan(data,plan);const q=estimateMixedTime(data,plan.legs,{fromPlace,toPlace,options:plan.timing?.options});plan.timing=mixedTimingSnapshot(q);summary=mixedSummary(data,plan);services=q.details.map(d=>({ko:d.ko,en:d.en}));
      }else if(kind==='bus'){
        validateBusPlan(data.bus,plan);const q=estimateBusTime(data.bus,plan.legs,{includeWalk:true,...plan.timing?.options,fromPlace,toPlace});plan.timing=q;summary=busSummary(data.bus,plan);services=plan.legs.map(([id])=>{const r=data.bus.routes.find(r=>r.id===id);return {ko:r.no+'번 버스',en:'Bus '+r.no};});
      }else{
        validateMetroPlan(data.network,plan);const q=estimateMetroTime(data.network,data.times,plan.region,plan.legs,{fromPlace,toPlace,options:plan.timing?.options});plan.timing=timingSnapshot(q);summary=metroSummary(data.network,plan);services=plan.legs.map(([id])=>{const l=data.region.lines.find(l=>l.id===id);return {ko:l.ko,en:l.en};});
      }
    }catch{throw Error('saved-route-invalid');}
    minutes=plan.timing.minutes;
  }else{
    method=parsed.plan?'replanned':'suggested';kind='auto';
    // This button explicitly requests transit, so a shorter walking-only option
    // must not replace the requested bus/subway estimate.
    const options=autoOptions({directWalkLimit:0});candidates=recommendAutoRoutes(data,{fromPlace,toPlace,options},{maxVisited:600000}).routes.filter(r=>r.quote.routeMode==='transit');const q=candidates[0];
    if(!q)throw Error('no-route');
    plan={v:1,region:data.region.id,b:data.bus.version,m:data.network.checkedAt,from:from.id,to:to.id,routeMode:'transit',legs:q.legs,timing:autoTimingSnapshot(q.quote)};
    summary=autoSummary(data,plan);minutes=q.quote.minutes;services=q.quote.details.map(d=>({ko:d.ko,en:d.en}));
  }
  if(!Number.isInteger(minutes)||minutes<1||minutes>2880)throw Error('invalid-time');
  return {id:to.id,from:from.id,method,kind,minutes,services,...(candidates?{candidates}:{}),patch:{mode:'transit',travelMinutes:minutes,durationSource:'manual',note:mergeTransitNote(to.note,plan,summary,kind)}};
}
export function applyTransitResults(day,results){
  const next=structuredClone(day),seen=new Set();
  for(const r of results){
    if(r.error)continue;const i=next.stops.findIndex(s=>s.id===r.id);
    if(i<1||next.stops[i-1].id!==r.from||seen.has(r.id)||!r.patch||!Number.isInteger(r.minutes)||r.minutes<0||r.minutes>2880||r.patch.travelMinutes!==r.minutes||!['transit','walking'].includes(r.patch.mode)||!['manual','gateway'].includes(r.patch.durationSource)||typeof r.patch.note!=='string'||r.patch.note.length>2000)throw Error('changed');
    seen.add(r.id);Object.assign(next.stops[i],{mode:r.patch.mode,travelMinutes:r.minutes,durationSource:r.patch.durationSource,note:r.patch.note});
  }
  return next;
}
