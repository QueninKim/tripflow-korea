import {walkingRoutes} from './walking-routes.js?v=web-19';
import {validateWalkingRoute,walkingRouteID} from './walking-core.js?v=web-19';
import {groundMeters} from './metro-time.js?v=web-19';
import {quoteAutoRoute,autoTimingSnapshot,autoSummary} from './auto-core.js?v=web-19';
import {estimateMixedTime,mixedTimingSnapshot,mixedSummary,mixedData,busRegionID} from './mixed-core.js?v=web-19';
import {busSummary} from './bus-core.js?v=web-19';
import {metroSummary} from './metro-core.js?v=web-19';
import {readTransitNote,mergeTransitNote} from './transit-note.js?v=web-19';
const CACHE='tripflow-transit-pedestrian-v1',point=p=>[p.latitude??p.lat,p.longitude??p.lng],place=p=>({latitude:point(p)[0],longitude:point(p)[1]});
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');
export function allocateTransitSeconds(seconds){
  const parts=Object.fromEntries(Object.entries(seconds).map(([k,v])=>[k,Math.floor(v/60)])),totalSeconds=Object.values(seconds).reduce((a,b)=>a+b,0),minutes=Math.ceil(totalSeconds/60);let remaining=minutes-Object.values(parts).reduce((a,b)=>a+b,0);
  for(const k of Object.keys(parts).sort((a,b)=>seconds[b]%60-seconds[a]%60)){if(remaining--<=0)break;parts[k]++;}return {parts,totalSeconds,minutes};
}
export function quoteTransitPlan(data,kind,plan,fromPlace,toPlace){
  if(kind==='auto')return quoteAutoRoute(data,plan.legs,{fromPlace,toPlace,options:plan.timing?.options});
  if(kind==='mixed')return {...estimateMixedTime(data,plan.legs,{fromPlace,toPlace,options:plan.timing?.options}),routeMode:'transit'};
  const raw=plan.timing?.options||{},isBus=kind==='bus',legs=plan.legs.map(l=>[isBus?'b':'s',...l]),options=isBus?{busWait:Number(raw.waitMinutes??7),includeWalk:raw.includeWalk??true}:{railWait:Number(raw.waitMinutes??data.times.defaults.waitMinutes),railTransferWait:Number(raw.transferWaitMinutes??data.times.defaults.transferWaitMinutes),railTransferWalk:Number(raw.transferWalkMinutes??data.times.defaults.transferWalkMinutes),includeWalk:raw.includeWalk??true};
  const q=estimateMixedTime(data,legs,{fromPlace,toPlace,options});
  if(isBus)q.seconds.wait=(Number(raw.waitMinutes??7)+(legs.length-1)*Number(raw.transferWaitMinutes??7))*60;
  return {...q,...allocateTransitSeconds(q.seconds),routeMode:'transit',options:{...(isBus?{waitMinutes:7,transferWaitMinutes:7,includeWalk:true}:data.times.defaults),...raw},model:isBus?'bus-distance-v1':'metro-distance-v1'};
}
export function transitWalkingTasks(quote,fromPlace,toPlace){
  const details=quote.details,tasks=[];if(!details?.length)return tasks;
  for(const a of quote.access||[]){const from=a.side==='from'?fromPlace:details.at(-1).path.at(-1),to=a.side==='from'?details[0].path[0]:toPlace;if(!from||!to)throw Error('walking-endpoints');tasks.push({key:a.side==='from'?'access':'egress',role:a.side==='from'?'access':'egress',from:point(from),to:point(to),replacedSeconds:a.seconds,allowanceSeconds:0});}
  for(const [index,c]of (quote.connections||[]).entries())if(!c.internal){const surface=c.meters;tasks.push({key:'transfer-'+index,role:'transfer',index,from:point(c.from),to:point(c.to),replacedSeconds:c.seconds,allowanceSeconds:Math.max(0,c.seconds-surface)});}
  return tasks.sort((a,b)=>(a.role==='access'?-1:a.role==='egress'?100:a.index)-(b.role==='access'?-1:b.role==='egress'?100:b.index));
}
export const transitWalkingSignature=(quote,fromPlace,toPlace)=>JSON.stringify({legs:quote.details.map(d=>d.leg),seconds:quote.seconds,options:quote.options,tasks:transitWalkingTasks(quote,fromPlace,toPlace)});
function applyPaths(base,snapshot){
  const q=structuredClone(base),old=transitWalkingTasks(base,snapshot.fromPlace,snapshot.toPlace);if(snapshot.paths.length!==old.length)throw Error('pedestrian-cache');let walk=base.seconds.walk;
  for(const task of old){const item=snapshot.paths.find(p=>p.key===task.key);if(!item||groundMeters(item.route.from,task.from)>1||groundMeters(item.route.to,task.to)>1)throw Error('pedestrian-cache');const route=validateWalkingRoute(item.route),seconds=route.seconds+task.allowanceSeconds;walk+=seconds-task.replacedSeconds;
    if(task.role==='transfer')Object.assign(q.connections[task.index],{meters:route.meters,seconds,pedestrianKey:task.key,walkingSeconds:route.seconds});else Object.assign(q.access.find(a=>a.side===(task.role==='access'?'from':'to')),{meters:route.meters,seconds:route.seconds,pedestrianKey:task.key});
  }
  q.seconds.walk=Math.max(0,Math.round(walk*10)/10);Object.assign(q,allocateTransitSeconds(q.seconds));if(q.minutes<1||q.minutes>2880)throw Error('invalid-time');q.routeMode='transit';q.pedestrian={...snapshot,modeledSeconds:Math.max(0,q.seconds.walk-snapshot.paths.reduce((sum,p)=>sum+p.route.seconds,0))};return q;
}
export function createTransitWalking({router=walkingRoutes,storage=()=>localStorage,now=()=>Date.now()}={}){
  const memory=new Map();let loaded=false;
  function load(){if(loaded)return;loaded=true;try{for(const s of JSON.parse(storage().getItem(CACHE)||'[]'))if(s?.id)memory.set(s.id,s);}catch{}}
  function retain(snapshot){load();memory.set(snapshot.id,snapshot);let list=[...memory.values()].sort((a,b)=>b.createdAt-a.createdAt).slice(0,50);while(list.length>1&&JSON.stringify(list).length>1500000)list.pop();if(JSON.stringify(list).length>1500000)throw Error('pedestrian-storage');let saved=false;while(list.length){try{storage().setItem(CACHE,JSON.stringify(list));saved=true;break;}catch{if(list.length===1)break;list.pop();}}if(!saved)throw Error('pedestrian-storage');memory.clear();for(const s of list)memory.set(s.id,s);}
  async function verify(snapshot,signature){
    if(snapshot?.v!==1||snapshot.signature!==signature||!Array.isArray(snapshot.paths)||snapshot.paths.length>10||snapshot.id!==await digest([signature,snapshot.paths.map(p=>[p.key,p.route.id])]))throw Error('pedestrian-cache');
    for(const p of snapshot.paths){validateWalkingRoute(p.route);if(p.route.id!==await walkingRouteID(p.route))throw Error('pedestrian-cache');}return snapshot;
  }
  async function enrich(quote,{fromPlace,toPlace,signal,onProgress=()=>{}}={}){
    const signature=transitWalkingSignature(quote,fromPlace,toPlace),tasks=transitWalkingTasks(quote,fromPlace,toPlace),paths=[];
    for(const [i,task]of tasks.entries()){if(signal?.aborted)throw Error('cancelled');onProgress(i,tasks.length);const route=await router.query(place({lat:task.from[0],lng:task.from[1]}),place({lat:task.to[0],lng:task.to[1]}),{signal});if(signal?.aborted)throw Error('cancelled');const {path,minutes,...raw}=route;paths.push({key:task.key,role:task.role,...(Number.isInteger(task.index)?{index:task.index}:{}),route:raw});}
    const snapshot={v:1,signature,fromPlace:fromPlace?place(fromPlace):null,toPlace:toPlace?place(toPlace):null,paths,indoorTransfers:quote.connections.filter(c=>c.internal).map((c,index)=>({index,seconds:c.seconds,name:c.from.ko||c.from.en||'',from:point(c.from)})),createdAt:now()};snapshot.id=await digest([signature,paths.map(p=>[p.key,p.route.id])]);
    if(signal?.aborted)throw Error('cancelled');retain(snapshot);onProgress(tasks.length,tasks.length);return applyPaths(quote,snapshot);
  }
  async function restore(quote,ref,{fromPlace,toPlace}={}){load();const snapshot=memory.get(ref?.id),signature=transitWalkingSignature(quote,fromPlace,toPlace);await verify(snapshot,signature);const q=applyPaths(quote,snapshot);if(ref.seconds!==q.seconds.walk)throw Error('pedestrian-cache');return q;}
  return {enrich,restore};
}
export const transitWalking=createTransitWalking();
export const pedestrianReference=q=>q.pedestrian?{v:1,id:q.pedestrian.id,seconds:q.seconds.walk}:undefined;
export function actualTransitTiming(q,kind){
  const pedestrian=pedestrianReference(q);if(!pedestrian)throw Error('pedestrian-required');
  if(kind==='auto')return {...autoTimingSnapshot(q),pedestrian};if(kind==='mixed')return {...mixedTimingSnapshot(q),pedestrian};
  const parts={ride:q.parts.bus+q.parts.rail,wait:q.parts.wait,walk:q.parts.walk,...(kind==='subway'?{transfer:0}:{})};return {v:1,mode:'auto',minutes:q.minutes,seconds:q.seconds,parts,options:q.options,model:q.model,pedestrian};
}
export function transitPlanSummary(data,kind,plan,quote){
  let summary=kind==='auto'?autoSummary(data,plan):kind==='mixed'?mixedSummary(data,plan):kind==='bus'?busSummary(data.bus,plan):metroSummary(data.network,plan);
  if(quote?.pedestrian){let transfer=0;const transfers=quote.pedestrian.paths.filter(p=>p.role==='transfer');summary=summary.replace(/도보 환승 \/ Walk transfer [0-9]+m/g,()=>{const p=transfers[transfer++];return p?`도보 환승 / Walk transfer ${Math.round(p.route.meters)}m · 보행길`:'도보 환승 / Walk transfer';});
    const roles={access:'접근/Access',transfer:'환승/Transfer',egress:'도착/End'};summary+='\n보행길 / Footpaths · '+quote.pedestrian.paths.map(p=>roles[p.role]+' '+Math.round(p.route.meters)+'m').join(' → ');if(quote.pedestrian.modeledSeconds>0)summary+='\n역내·승차 여유 예상 / Indoor & boarding allowance '+Math.ceil(quote.pedestrian.modeledSeconds/60)+' min';}
  return summary;
}

export async function enrichTransitResult(data,from,to,result,{signal,onProgress}={}){
  if(result.error||result.patch?.mode!=='transit')return result;const parsed=readTransitNote(result.patch.note),choices=result.candidates?.length?result.candidates:[null],prepared=[];let failure;
  for(const candidate of choices){if(signal?.aborted)throw Error('cancelled');try{const plan=structuredClone(parsed.plan);if(candidate){plan.legs=structuredClone(candidate.legs);plan.timing=autoTimingSnapshot(candidate.quote);}const base=quoteTransitPlan(data,parsed.kind,plan,from.place,to.place),quote=await transitWalking.enrich(base,{fromPlace:from.place,toPlace:to.place,signal,onProgress});prepared.push({plan,quote});}catch(error){if(signal?.aborted)throw Error('cancelled');failure=error;}}
  if(!prepared.length)throw failure||Error('walking-unavailable');prepared.sort((a,b)=>a.quote.totalSeconds-b.quote.totalSeconds);const {plan,quote}=prepared[0];plan.timing=actualTransitTiming(quote,parsed.kind);
  const {candidates,...baseResult}=result;return {...baseResult,minutes:quote.minutes,quote,services:quote.details.map(d=>({ko:d.ko,en:d.en})),patch:{...result.patch,travelMinutes:quote.minutes,note:mergeTransitNote(result.patch.note,plan,transitPlanSummary(data,parsed.kind,plan,quote),parsed.kind)}};

}
const requests=new Map();export async function loadTransitWalkingData(region){const id=busRegionID(region);if(!requests.has(id))requests.set(id,Promise.all(['metro-data.json','metro-times.json',`bus-${id}.json`].map(file=>fetch('./'+file+'?v=web-19').then(r=>{if(!r.ok)throw Error('data');return r.json();}))).then(values=>mixedData(...values)).catch(e=>{requests.delete(id);throw e;}));return requests.get(id);}
export function pedestrianSectionsHTML(quote,t,h){
  if(!quote.pedestrian)return '';const p=quote.pedestrian,labels={access:t('Walk to board','정류장·역까지 도보'),egress:t('Walk to destination','도착지까지 도보'),transfer:t('Walk transfer','역외·정류장 환승 도보')};
  return `<ol class="pedestrian-sections">${p.paths.map(item=>`<li>${labels[item.role]} · ${Math.round(item.route.meters)}m · ${Math.ceil(item.route.seconds/60)}${t(' min · queried path','분 · 실제 보행길')}</li>`).join('')}${p.modeledSeconds>0?`<li class="indoor-estimate">${t('Station entry/exit, internal transfers and boarding allowances','역 진입·출구·역내 환승·승차 여유')} · ${Math.ceil(p.modeledSeconds/60)}${t(' min · estimated separately; interior paths unavailable','분 · 별도 예상·역내 통로 자료 없음')}</li>`:''}</ol>`;
}
