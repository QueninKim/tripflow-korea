import {groundMeters} from './metro-time.js?v=web-19';
import {metroTimingText} from './metro-core.js?v=web-19';
const START='[TripFlow Bus v1]',END='[/TripFlow Bus]';
export function readBusNote(note=''){
  const pos=note.lastIndexOf(START);if(pos<0||!note.endsWith(END))return {note};
  try{const lines=note.slice(pos+START.length,-END.length).trim().split('\n'),plan=JSON.parse(lines.shift());
    if(plan.v!==1||typeof plan.region!=='string'||typeof plan.data!=='string'||typeof plan.from!=='string'||typeof plan.to!=='string'||!Array.isArray(plan.legs)||!plan.legs.length||plan.legs.length>5||!plan.legs.every(l=>Array.isArray(l)&&l.length===3&&typeof l[0]==='string'&&Number.isInteger(l[1])&&Number.isInteger(l[2])))return {note};
    return {note:note.slice(0,pos).trimEnd(),plan,summary:lines.join('\n')};
  }catch{return {note};}
}
export function mergeBusNote(note,plan,summary=''){
  const plain=readBusNote(note).note,result=plan?`${plain}${plain?'\n\n':''}${START}\n${JSON.stringify(plan)}\n${summary}\n${END}`:plain;
  if(result.length>2000)throw Error('note-too-long');return result;
}
export const stopPosition=s=>[s.lat,s.lng];
export const busStopName=(s,lang='ko')=>lang==='en'?(s.en||s.ko):s.ko;
export const rideSeconds=(a,b)=>Math.max(20,groundMeters(stopPosition(a),stopPosition(b))*1.25/5+20);
const cache=new WeakMap();
export function busGraph(region){
  if(cache.has(region))return cache.get(region);
  const membership=new Map(),routes=new Map(region.routes.map((r,i)=>[r.id,{...r,index:i}])),nearby=new Map(),grid=new Map();
  // Fixed local projection for the nearby-stop index, including opposite-direction platforms as distinct IDs.
  const lat0=Object.values(region.stops)[0]?.lat||37,cos=Math.cos(lat0*Math.PI/180);
  const xy=s=>[Math.floor(s.lng*111200*cos/200),Math.floor(s.lat*111200/200)];
  for(const r of routes.values())r.stops.forEach((id,index)=>{if(!membership.has(id))membership.set(id,[]);membership.get(id).push([r.id,index]);});
  for(const id of membership.keys()){const [x,y]=xy(region.stops[id]),key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(id);}
  for(const id of membership.keys()){
    const s=region.stops[id],[x,y]=xy(s),ns=[];
    for(let a=x-1;a<=x+1;a++)for(let b=y-1;b<=y+1;b++)for(const other of grid.get(a+','+b)||[]){if(other===id)continue;const meters=groundMeters(stopPosition(s),stopPosition(region.stops[other]));if(meters<=180)ns.push({id:other,meters:Math.ceil(meters)});}
    nearby.set(id,ns.sort((a,b)=>a.meters-b.meters));
  }
  const graph={membership,routes,nearby};cache.set(region,graph);return graph;
}
export function busTransferCandidates(region,id){
  const g=busGraph(region),own=new Set((g.membership.get(id)||[]).map(x=>x[0]));
  return [...new Set([id,...(g.nearby.get(id)||[]).map(n=>n.id)].flatMap(s=>(g.membership.get(s)||[]).map(x=>x[0])))].some(r=>!own.has(r))||own.size>1;
}
export function validateBusPlan(region,plan){
  if(!region||plan.region!==region.id||plan.data!==region.version||!Array.isArray(plan.legs)||!plan.legs.length||plan.legs.length>5)throw Error('invalid-route');
  const g=busGraph(region),paths=[];let end;
  for(const [id,a,b]of plan.legs){const r=g.routes.get(id);if(!r||!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<=a||b>=r.stops.length)throw Error('invalid-route');
    const path=r.stops.slice(a,b+1);if(end&&end!==path[0]&&!g.nearby.get(end)?.some(s=>s.id===path[0]))throw Error('invalid-transfer');
    if(paths.length&&plan.legs[paths.length-1][0]===id)throw Error('invalid-transfer');paths.push(path);end=path.at(-1);
  }
  const vias=plan.vias||[];if(!Array.isArray(vias)||vias.length>4||new Set(vias).size!==vias.length)throw Error('invalid-route');
  let stage=0;for(let i=1;i<paths.length;i++)if(paths[i-1].at(-1)===vias[stage])stage++;
  if(stage!==vias.length)throw Error('invalid-transfer');return paths;
}
class Heap{
  a=[];push(s){const a=this.a;a.push(s);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].cost<=s.cost)break;a[i]=a[p];i=p;}a[i]=s;}
  pop(){const a=this.a,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].cost<a[c].cost)c++;if(a[c].cost>=last.cost)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}
// Each state is a real occurrence in an ordered, one-direction route. Repeated stop IDs never create ride shortcuts.
export function findBusRoutes(region,{from,to,vias=[]},limit=3){
  const g=busGraph(region);if(!g.membership.has(from)||!g.membership.has(to)||from===to||vias.length>4||new Set(vias).size!==vias.length||vias.some(v=>v===from||v===to||!busTransferCandidates(region,v)))return [];
  function run(banned=new Set()){
    const heap=new Heap(),best=new Map();
    function put(s){const key=[s.r,s.i,s.stage,s.started?1:0].join('|');if((best.get(key)??Infinity)<=s.cost)return;best.set(key,s.cost);s.key=key;heap.push(s);}
    for(const [r,i]of g.membership.get(from))if(!banned.has(r)&&i<g.routes.get(r).stops.length-1)put({r,i,stage:0,started:false,changes:0,cost:0,parent:null});
    while(heap.a.length){const c=heap.pop();if(best.get(c.key)!==c.cost)continue;const r=g.routes.get(c.r),id=r.stops[c.i];
      if(id===to&&c.stage===vias.length&&c.started){
        const states=[];for(let n=c;n;n=n.parent)states.unshift(n);const legs=[];
        for(const n of states){if(!legs.length||legs.at(-1)[0]!==n.r)legs.push([n.r,n.i,n.i]);else legs.at(-1)[2]=n.i;}
        if(legs.some(l=>l[1]===l[2]))continue;
        return {legs,changes:legs.length-1,hops:legs.reduce((s,l)=>s+l[2]-l[1],0),cost:c.cost};
      }
      if(c.i<r.stops.length-1)put({...c,i:c.i+1,started:true,cost:c.cost+rideSeconds(region.stops[id],region.stops[r.stops[c.i+1]]),parent:c});
      if(c.started&&c.changes<4)for(const n of [{id,meters:0},...(g.nearby.get(id)||[])])for(const [next,i]of g.membership.get(n.id)||[])if(next!==c.r&&i<g.routes.get(next).stops.length-1){
        put({r:next,i,stage:id===vias[c.stage]?c.stage+1:c.stage,started:false,changes:c.changes+1,cost:c.cost+10000000+420+n.meters*1.25/1.25,parent:c});
      }
    }
    return null;
  }
  const first=run(),out=[];if(!first)return out;out.push(first);
  // Different first buses provide useful alternatives without pretending to optimize live traffic.
  const banned=new Set([first.legs[0][0]]);while(out.length<limit){const r=run(banned);if(!r)break;out.push(r);banned.add(r.legs[0][0]);}
  return out.sort((a,b)=>a.cost-b.cost).slice(0,limit);
}
export function estimateBusTime(region,legs,{waitMinutes=7,transferWaitMinutes=7,includeWalk=false,fromPlace,toPlace}={}){
  for(const v of [waitMinutes,transferWaitMinutes])if(!Number.isInteger(Number(v))||v===''||v===null||typeof v==='boolean'||Number(v)<0||Number(v)>60)throw Error('invalid-time-options');
  if(typeof includeWalk!=='boolean')throw Error('invalid-time-options');
  const paths=validateBusPlan(region,{region:region.id,data:region.version,legs}),parts={ride:0,wait:(Number(waitMinutes)+(legs.length-1)*Number(transferWaitMinutes))*60,walk:0};
  for(const p of paths)for(let i=1;i<p.length;i++)parts.ride+=rideSeconds(region.stops[p[i-1]],region.stops[p[i]]);
  for(let i=1;i<paths.length;i++)parts.walk+=groundMeters(stopPosition(region.stops[paths[i-1].at(-1)]),stopPosition(region.stops[paths[i][0]]))*1.25/1.25+60;
  if(includeWalk){
    for(const [p,id]of [[fromPlace,paths[0][0]],[toPlace,paths.at(-1).at(-1)]]){if(!p||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude))throw Error('missing-place');const m=groundMeters([p.latitude,p.longitude],stopPosition(region.stops[id]));if(m>15000)throw Error('station-too-far');parts.walk+=m*1.25/1.25;}
  }
  const minutes=Math.ceil(Object.values(parts).reduce((a,b)=>a+b,0)/60);if(minutes<1||minutes>2880)throw Error('invalid-time');
  const rounded=Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,Math.floor(v/60)]));let remaining=minutes-Object.values(rounded).reduce((a,b)=>a+b,0);for(const [k]of Object.entries(parts).sort((a,b)=>b[1]%60-a[1]%60)){if(!remaining--)break;rounded[k]++;}
  return {v:1,mode:'auto',minutes,parts:rounded,options:{waitMinutes:Number(waitMinutes),transferWaitMinutes:Number(transferWaitMinutes),includeWalk},model:'bus-distance-v1'};
}
export function busSummary(region,plan){
  const paths=validateBusPlan(region,plan),g=busGraph(region),label=id=>{const s=region.stops[id];return s.ko+(s.code?' #'+s.code:'');};
  return [`버스 / Bus · ${region.ko} / ${region.en}`,...plan.legs.map(([id,a,b],i)=>`${g.routes.get(id).no}: ${label(paths[i][0])} → ${label(paths[i].at(-1))} (${label(paths[i][1])} 방면 / next; ${b-a} stops)${i<paths.length-1&&paths[i].at(-1)!==paths[i+1][0]?`\n도보 환승 / Walk transfer → ${label(paths[i+1][0])}`:''}`),metroTimingText(plan.timing)].filter(Boolean).join('\n');
}
