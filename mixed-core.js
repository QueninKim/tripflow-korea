import {indoorTransfer} from './indoor-core.js?v=web-21';
import {validateMetroPlan,metroPaths,metroTimingText} from './metro-core.js?v=web-21';
import {validateBusPlan,busGraph,rideSeconds} from './bus-core.js?v=web-21';
import {groundMeters,estimateMetroTime} from './metro-time.js?v=web-21';
const START='[TripFlow Mixed v1]',END='[/TripFlow Mixed]';
export const metroRegionID=id=>id==='seoul'?'capital':id;
export const busRegionID=id=>id==='capital'?'seoul':id;
export function mixedData(network,times,bus){const region=network.regions.find(r=>r.id===metroRegionID(bus.id));if(!region||!times.regions[region.id])throw Error('invalid-region');return {network,times,bus,region};}
const validLeg=l=>Array.isArray(l)&&(l[0]==='b'?l.length===4&&typeof l[1]==='string'&&l.slice(2).every(Number.isInteger):l[0]==='s'&&l.length===5&&l.slice(1).every(v=>typeof v==='string'));
export function readMixedNote(note=''){
  const pos=note.lastIndexOf(START);if(pos<0||!note.endsWith(END))return {note};
  try{const lines=note.slice(pos+START.length,-END.length).trim().split('\n'),plan=JSON.parse(lines.shift());if(plan.v!==1||!['region','b','m','from','to'].every(k=>typeof plan[k]==='string')||!Array.isArray(plan.legs)||!plan.legs.length||plan.legs.length>8||!plan.legs.every(validLeg)||!plan.legs.some(l=>l[0]==='b')||!plan.legs.some(l=>l[0]==='s'))return {note};return {note:note.slice(0,pos).trimEnd(),plan,summary:lines.join('\n')};}catch{return {note};}
}
export function mergeMixedNote(note,plan,summary=''){
  const plain=readMixedNote(note).note,result=plan?`${plain}${plain?'\n\n':''}${START}\n${JSON.stringify(plan)}\n${summary}\n${END}`:plain;if(result.length>2000)throw Error('note-too-long');return result;
}
export function mixedNodes(data,kind){
  if(kind==='bus')return Object.entries(data.bus.stops).map(([id,s])=>({id:'b:'+id,sourceID:id,kind:'bus',...s}));
  return Object.entries(data.region.stations).map(([id,s])=>{const p=data.times.regions[data.region.id].stations[id];return {id:'s:'+id,sourceID:id,kind:'subway',...s,lat:p[0],lng:p[1],code:id};});
}
export function nearestMixedNodes(data,kind,position,limit=3,maxMeters=1000){
  if(!position||!position.every(Number.isFinite))return [];
  return mixedNodes(data,kind).map(s=>({...s,meters:Math.round(groundMeters(position,[s.lat,s.lng]))})).filter(s=>s.meters<=maxMeters).sort((a,b)=>a.meters-b.meters).slice(0,limit);
}
export function describeMixedLeg(data,leg){
  if(!validLeg(leg))throw Error('invalid-route');
  if(leg[0]==='b'){
    const [,id,a,b]=leg,path=validateBusPlan(data.bus,{region:data.bus.id,data:data.bus.version,legs:[[id,a,b]]})[0],line=busGraph(data.bus).routes.get(id);
    return {leg,kind:'bus',id,no:line.no,ko:line.no+'번 버스',en:'Bus '+line.no,color:line.color,path:path.map(id=>({id:'b:'+id,sourceID:id,...data.bus.stops[id]}))};
  }
  const [,id,a,b,next]=leg,path=validateMetroPlan(data.network,{region:data.region.id,legs:[[id,a,b,next]]}).paths[0],line=data.region.lines.find(l=>l.id===id),positions=data.times.regions[data.region.id].stations;
  return {leg,kind:'subway',id,no:line.ko,ko:line.ko,en:line.en,color:line.color,path:path.map(id=>({id:'s:'+id,sourceID:id,...data.region.stations[id],lat:positions[id][0],lng:positions[id][1]}))};
}
export function mixedLegsFromSteps(steps){return steps.flatMap(s=>s.plan.legs.map(l=>[s.kind==='bus'?'b':'s',...l]));}
export function mixedStepsFromLegs(data,legs){
  const steps=[];for(const leg of legs){const kind=leg[0]==='b'?'bus':'subway';let last=steps.at(-1);if(last?.kind!==kind||(kind==='bus'&&last.plan.legs.at(-1)[0]===leg[1])){last={kind,plan:kind==='bus'?{v:1,region:data.bus.id,data:data.bus.version,from:'',to:'',legs:[]}:{v:1,region:data.region.id,from:'',to:'',legs:[]}};steps.push(last);}last.plan.legs.push(leg.slice(1));}return steps;
}
// Merge explicitly continuous rides so a bus/train split in the composer does not add a false wait or station exit.
export function normalizeMixedLegs(data,legs){
  if(!Array.isArray(legs)||!legs.length||legs.length>16)throw Error('invalid-route');const out=[];
  for(const raw of legs){const leg=[...raw];describeMixedLeg(data,leg);const prev=out.at(-1);
    if(prev?.[0]===leg[0]&&prev[1]===leg[1]){
      if(leg[0]==='b'&&prev[3]===leg[2]){prev[3]=leg[3];describeMixedLeg(data,prev);continue;}
      if(leg[0]==='s'&&prev[3]===leg[2]){const a=describeMixedLeg(data,prev).path,b=describeMixedLeg(data,leg).path,combined=[...a,...b.slice(1)].map(s=>s.sourceID),line=data.region.lines.find(l=>l.id===leg[1]),p=metroPaths(line,prev[2],leg[3]).find(p=>p[1]===prev[4]);if(p&&JSON.stringify(p)===JSON.stringify(combined)){prev[3]=leg[3];continue;}throw Error('invalid-continuation');}
    }
    out.push(leg);
  }
  if(out.length>8)throw Error('too-many-legs');return out;
}
const bounded=(v,fallback,max)=>{if(v===undefined)return fallback;if(!['number','string'].includes(typeof v)||(typeof v==='string'&&!v.trim())||!Number.isInteger(Number(v))||Number(v)<0||Number(v)>max)throw Error('invalid-time-options');return Number(v);};
export function mixedOptions(options={}){
  if(options.includeWalk!==undefined&&typeof options.includeWalk!=='boolean')throw Error('invalid-time-options');
  return {busWait:bounded(options.busWait,7,60),railWait:bounded(options.railWait,4,60),railTransferWait:bounded(options.railTransferWait,3,60),railTransferWalk:bounded(options.railTransferWalk,5,30),maxTransferMeters:bounded(options.maxTransferMeters,1000,3000),includeWalk:options.includeWalk??true};
}
export function validateMixedPlan(data,plan,{requireBoth=true}={}){
  if(!data||plan.region!==data.region.id||plan.b!==data.bus.version||plan.m!==data.network.checkedAt||!Array.isArray(plan.legs)||!plan.legs.length||plan.legs.length>8||!plan.legs.every(validLeg))throw Error('invalid-route');
  if(requireBoth&&(!plan.legs.some(l=>l[0]==='b')||!plan.legs.some(l=>l[0]==='s')))throw Error('both-modes-required');
  const details=plan.legs.map(l=>describeMixedLeg(data,l)),options=mixedOptions(plan.timing?.options),connections=[];
  for(let i=1;i<details.length;i++){
    const a=details[i-1],b=details[i],from=a.path.at(-1),to=b.path[0],meters=groundMeters([from.lat,from.lng],[to.lat,to.lng]);
    const indoor=a.kind==='subway'&&b.kind==='subway'?indoorTransfer(data.region.id,from.sourceID,a.id,b.id,to.sourceID):null,internal=a.kind==='subway'&&b.kind==='subway'&&(from.id===to.id||!!indoor);
    if(a.kind==='subway'&&b.kind==='subway'&&a.id===b.id&&from.id===to.id)throw Error('invalid-continuation');
    if(!internal&&meters>options.maxTransferMeters){const e=Error('transfer-too-far');e.gap={index:i,meters:Math.round(meters),from,to};throw e;}
    connections.push({index:i,from,to,meters:indoor?.meters??Math.round(meters),internal,...(indoor?{indoor}:{})});
  }
  return {details,connections,options};
}
const allocate=seconds=>{const names=Object.keys(seconds),parts=Object.fromEntries(names.map(k=>[k,Math.floor(seconds[k]/60)])),total=Math.ceil(Object.values(seconds).reduce((a,b)=>a+b,0)/60);let remaining=total-Object.values(parts).reduce((a,b)=>a+b,0);for(const k of [...names].sort((a,b)=>seconds[b]%60-seconds[a]%60)){if(!remaining--)break;parts[k]++;}return {parts,minutes:total};};
export function estimateMixedTime(data,legs,{options={},fromPlace,toPlace}={}){
  const opts=mixedOptions(options),plan={region:data.region.id,b:data.bus.version,m:data.network.checkedAt,legs,timing:{options:opts}},validated=validateMixedPlan(data,plan,{requireBoth:false}),{details,connections}=validated,seconds={bus:0,rail:0,wait:0,walk:0},access=[];
  details.forEach((d,i)=>{
    const prev=details[i-1],next=details[i+1],insideBefore=!!connections[i-1]?.internal,insideAfter=!!connections[i]?.internal;
    if(d.kind==='bus'){let ride=0;for(let j=1;j<d.path.length;j++)ride+=rideSeconds(d.path[j-1],d.path[j]);d.rideSeconds=ride;seconds.bus+=ride;seconds.wait+=opts.busWait*60;}
    else {const q=estimateMetroTime(data.network,data.times,data.region.id,[d.leg.slice(1)],{options:{waitMinutes:0,transferWalkMinutes:0,transferWaitMinutes:0,includeWalk:false}});d.rideSeconds=q.seconds.ride;seconds.rail+=q.seconds.ride;seconds.wait+=(insideBefore?opts.railTransferWait:opts.railWait)*60;if(!insideBefore)seconds.walk+=data.times.walking.entryMinutes*60;if(!insideAfter)seconds.walk+=data.times.walking.exitMinutes*60;}
    if(i){const c=connections[i-1];c.seconds=c.internal?(c.indoor?.seconds??opts.railTransferWalk*60):c.meters*1.25/75*60+(d.kind==='bus'?60:0);seconds.walk+=c.seconds;}
  });
  if(opts.includeWalk)for(const [place,node,side]of [[fromPlace,details[0].path[0],'from'],[toPlace,details.at(-1).path.at(-1),'to']]){
    if(!place)continue;const meters=groundMeters([place.latitude,place.longitude],[node.lat,node.lng]);if(meters>15000)throw Error('access-too-far');const walk=meters*1.25/75*60;seconds.walk+=walk;access.push({side,meters:Math.round(meters),seconds:walk});
  }
  for(const k of Object.keys(seconds))seconds[k]=Math.round(seconds[k]);const total=allocate(seconds);if(total.minutes<1||total.minutes>2880)throw Error('time-limit');
  return {v:1,mode:'auto',...total,seconds,options:opts,model:'mixed-v1',details,connections,access};
}
export function mixedTimingSnapshot(q){return {v:1,mode:'auto',minutes:q.minutes,seconds:q.seconds,options:q.options,model:q.model};}
export function mixedSummary(data,plan){
  const {details,connections}=validateMixedPlan(data,plan),label=s=>s.ko+(s.id.startsWith('b:')&&s.code?' #'+s.code:'');
  return [`버스+지하철 / Bus + Subway · ${data.region.ko}`,...details.flatMap((d,i)=>[...(i?[connections[i-1].internal?'역내 환승 / In-station transfer':`도보 환승 / Walk transfer ${connections[i-1].meters}m`]:[]),`${d.kind==='bus'?'Bus '+d.no:d.ko+' / '+d.en}: ${label(d.path[0])} → ${label(d.path.at(-1))} (${d.path.length-1} stops)`]),metroTimingText(plan.timing)].filter(Boolean).join('\n');
}
export function mixedMapData(quote){
  const stops={},routes=quote.details.map((d,i)=>{for(const s of d.path)stops[s.id]=s;return {id:'leg-'+i,no:d.ko,stops:d.path.map(s=>s.id),color:d.color};});
  // Explicit walking links preserve distinct identities between bus platforms and station centres.
  for(const c of quote.connections)if(c.from.id!==c.to.id)routes.push({id:'walk-'+c.index,no:'도보 / Walk',stops:[c.from.id,c.to.id],color:'#7f9187'});
  return {id:'mixed',routes,stops};
}
