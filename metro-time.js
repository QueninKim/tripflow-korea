import {metroPaths,validateMetroPlan} from './metro-core.js?v=web-9';
import {arrivals} from './core.js?v=web-9';
export function groundMeters(a,b){
  if(!a||!b||![...a,...b].every(Number.isFinite)||Math.abs(a[0])>90||Math.abs(b[0])>90||Math.abs(a[1])>180||Math.abs(b[1])>180)throw Error('invalid-position');
  const rad=Math.PI/180,p=(b[0]-a[0])*rad,q=(b[1]-a[1])*rad;
  const h=Math.sin(p/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(q/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
const bounded=(value,fallback,max)=>{const v=value===undefined?fallback:value;if(!['number','string'].includes(typeof v)||(typeof v==='string'&&!v.trim())||v===''||v===null||typeof v==='boolean'||!Number.isInteger(Number(v))||Number(v)<0||Number(v)>max)throw Error('invalid-time-options');return Number(v);};
export function timeOptions(settings,options={}){
  if(options.includeWalk!==undefined&&typeof options.includeWalk!=='boolean')throw Error('invalid-time-options');
  return {waitMinutes:bounded(options.waitMinutes,settings.defaults.waitMinutes,60),transferWalkMinutes:bounded(options.transferWalkMinutes,settings.defaults.transferWalkMinutes,30),transferWaitMinutes:bounded(options.transferWaitMinutes,settings.defaults.transferWaitMinutes,60),includeWalk:options.includeWalk===undefined?settings.defaults.includeWalk:options.includeWalk===true};
}
export function modelRunSeconds(meters,profile){
  if(!Number.isFinite(meters)||meters<0||!profile||![profile.cruiseKmh,profile.accelerationMss,profile.distanceFactor].every(v=>Number.isFinite(v)&&v>0))throw Error('invalid-time-data');
  const d=meters*profile.distanceFactor,v=profile.cruiseKmh/3.6,a=profile.accelerationMss;
  return Math.max(30,d<v*v/a?2*Math.sqrt(d/a):d/v+v/a);
}
function allocateMinutes(parts){
  const names=Object.keys(parts),rounded=Object.fromEntries(names.map(k=>[k,Math.floor(parts[k]/60)]));
  let extra=Math.ceil(names.reduce((s,k)=>s+parts[k],0)/60)-Object.values(rounded).reduce((a,b)=>a+b,0);
  const priority=[...names].sort((a,b)=>(parts[b]%60)-(parts[a]%60));
  for(let i=0;i<extra;i++)rounded[priority[i%priority.length]]++;
  return rounded;
}
export function estimateMetroTime(network,settings,regionID,legs,{fromPlace,toPlace,options={}}={}){
  const {region,paths}=validateMetroPlan(network,{region:regionID,legs}),r=settings?.regions?.[regionID];
  if(settings?.version!==1||!r)throw Error('time-data-unavailable');
  const opts=timeOptions(settings,options);let rideS=0,operatorEdges=0,modelEdges=0,walkS=(settings.walking.entryMinutes+settings.walking.exitMinutes)*60,accessMeters=0;
  const perLeg=[];
  for(const [index,[id]]of legs.entries()){
    const line=r.lines[id];if(!line)throw Error('time-data-unavailable');
    let seconds=0,modeled=0;const path=paths[index],profile=settings.profiles[line.profile];
    for(let i=1;i<path.length;i++){
      const official=line.standardSeconds[path[i-1]+'>'+path[i]];
      if(Number.isFinite(official)&&official>0){seconds+=official;operatorEdges++;}
      else {
        const distance=groundMeters(r.stations[path[i-1]],r.stations[path[i]]);
        seconds+=modelRunSeconds(distance,profile);modelEdges++;modeled++;
      }
    }
    // Operator interval times are used verbatim. Dwell belongs only to the modelled runs.
    if(modeled)seconds+=Math.min(modeled,Math.max(0,path.length-2))*profile.dwellSeconds;
    perLeg.push(seconds);rideS+=seconds;
  }
  if(opts.includeWalk){
    for(const [place,station]of [[fromPlace,legs[0][1]],[toPlace,legs.at(-1)[2]]]){
      if(!place)continue;
      const meters=groundMeters([place.latitude,place.longitude],r.stations[station]);
      if(meters>settings.walking.maxAccessMeters)throw Error('station-too-far');
      accessMeters+=meters;walkS+=meters*settings.walking.distanceFactor/settings.walking.metersPerMinute*60;
    }
  }
  const waitS=opts.waitMinutes*60,transferS=(legs.length-1)*(opts.transferWalkMinutes+opts.transferWaitMinutes)*60;
  const seconds={ride:Math.round(rideS),wait:waitS,transfer:transferS,walk:Math.round(walkS)};
  const parts=allocateMinutes(seconds),minutes=Object.values(parts).reduce((a,b)=>a+b,0);
  if(!Number.isSafeInteger(minutes)||minutes<1||minutes>2880)throw Error('time-limit');
  return {v:1,mode:'auto',minutes,seconds,parts,operatorEdges,modelEdges,perLeg,options:opts,modelVersion:settings.modelVersion,accessIncluded:opts.includeWalk&&!!fromPlace&&!!toPlace,accessMeters:Math.round(accessMeters)};
}
export function timingSnapshot(quote){
  return {v:1,mode:'auto',minutes:quote.minutes,seconds:quote.seconds,operatorEdges:quote.operatorEdges,modelEdges:quote.modelEdges,options:quote.options,modelVersion:quote.modelVersion,accessIncluded:quote.accessIncluded};
}
export function projectedArrivals(day,stopID,minutes){
  if(!day||!Number.isInteger(minutes)||minutes<0||minutes>2880)throw Error('invalid-time');
  const i=day.stops.findIndex(s=>s.id===stopID);if(i<1)throw Error('invalid-movement');
  return arrivals({...day,stops:day.stops.map((s,j)=>j===i?{...s,travelMinutes:minutes}:s)});
}
