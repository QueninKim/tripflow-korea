import {metroGraph,metroPaths,metroTimingText} from './metro-core.js?v=web-17';
import {groundMeters,modelRunSeconds} from './metro-time.js?v=web-17';
import {rideSeconds} from './bus-core.js?v=web-17';
import {mixedOptions,describeMixedLeg} from './mixed-core.js?v=web-17';
const position=p=>Array.isArray(p)?p:[p?.latitude,p?.longitude];
const integer=(v,f,min,max)=>{if(v===undefined)return f;if(!['number','string'].includes(typeof v)||(typeof v==='string'&&!v.trim())||!Number.isInteger(Number(v))||Number(v)<min||Number(v)>max)throw Error('invalid-search-options');return Number(v);};
export function autoOptions(raw={}){
  if(raw.includeLimitedServices!==undefined&&typeof raw.includeLimitedServices!=='boolean')throw Error('invalid-search-options');const base=mixedOptions({...raw,includeWalk:true});return {...base,includeLimitedServices:raw.includeLimitedServices??false,accessRadius:integer(raw.accessRadius,800,50,2000),transferRadius:integer(raw.transferRadius,400,50,1000),maxTransfers:integer(raw.maxTransfers,4,0,5),directWalkLimit:integer(raw.directWalkLimit,1500,0,3000)};
}
export const sameAutoPlace=(a,b)=>!!a&&!!b&&(a.id&&a.id===b.id||groundMeters(position(a),position(b))<5);
function railEdge(data,line,a,b){
  const info=data.times.regions[data.region.id].lines[line.id],official=info.standardSeconds[a+'>'+b];
  if(Number.isFinite(official)&&official>0)return {seconds:Math.round(official),modeled:false,dwell:0};
  const profile=data.times.profiles[info.profile],coords=data.times.regions[data.region.id].stations;
  return {seconds:Math.round(modelRunSeconds(groundMeters(coords[a],coords[b]),profile)),modeled:true,dwell:profile.dwellSeconds};
}
export const limitedBusService=no=>/^N\d|심야|새벽|출근|퇴근/i.test(no);
function describe(data,leg){return describeMixedLeg(data,leg);}
const point=s=>[s.lat,s.lng];
function connector(a,b,options,entry,exit){
  const from=a.path.at(-1),to=b.path[0],meters=Math.round(groundMeters(point(from),point(to))),internal=a.kind==='subway'&&b.kind==='subway'&&from.id===to.id;
  if(a.kind==='subway'&&b.kind==='subway'&&a.id===b.id&&from.id===to.id)throw Error('invalid-continuation');
  const limit=a.kind==='bus'&&b.kind==='bus'?Math.min(180,options.transferRadius):options.transferRadius;
  if(!internal&&meters>limit)throw Error('transfer-too-far');
  const walk=internal?options.railTransferWalk*60:meters+(a.kind==='subway'?exit:0)+(b.kind==='subway'?entry:60);
  return {from,to,meters,internal,seconds:walk,waitSeconds:(b.kind==='bus'?options.busWait:internal?options.railTransferWait:options.railWait)*60};
}
function allocate(seconds){const parts=Object.fromEntries(Object.entries(seconds).map(([k,v])=>[k,Math.floor(v/60)])),totalSeconds=Object.values(seconds).reduce((a,b)=>a+b,0),minutes=Math.ceil(totalSeconds/60);let n=minutes-Object.values(parts).reduce((a,b)=>a+b,0);for(const k of Object.keys(parts).sort((a,b)=>seconds[b]%60-seconds[a]%60)){if(!n--)break;parts[k]++;}return {parts,totalSeconds,minutes};}
export function quoteAutoRoute(data,legs,{fromPlace,toPlace,options={}}={}){
  const opts=autoOptions(options),origin=position(fromPlace),destination=position(toPlace);groundMeters(origin,destination);
  if(!Array.isArray(legs)||legs.length>opts.maxTransfers+1)throw Error('invalid-route');
  if(!legs.length){const meters=Math.round(groundMeters(origin,destination));if(meters>opts.directWalkLimit)throw Error('walk-too-far');const seconds={bus:0,rail:0,wait:0,walk:Math.max(1,meters)};return {v:1,mode:'auto',routeMode:'walking',model:'auto-transit-v1',options:opts,seconds,...allocate(seconds),details:[],connections:[],access:[],walkMeters:meters};}
  const details=legs.map(l=>describe(data,l)),seconds={bus:0,rail:0,wait:0,walk:0},connections=[],entry=data.times.walking.entryMinutes*60,exit=data.times.walking.exitMinutes*60;
  for(const [i,d]of details.entries()){
    if(d.kind==='bus'){if(!opts.includeLimitedServices&&limitedBusService(d.no))throw Error('limited-service');let ride=0;for(let j=1;j<d.path.length;j++)ride+=Math.round(rideSeconds(d.path[j-1],d.path[j]));d.rideSeconds=ride;seconds.bus+=ride;}
    else{const line=data.region.lines.find(l=>l.id===d.id);let ride=0,allModeled=true;for(let j=1;j<d.path.length;j++){const e=railEdge(data,line,d.path[j-1].sourceID,d.path[j].sourceID);ride+=e.seconds+(j>1&&(e.modeled||allModeled)?data.times.profiles[data.times.regions[data.region.id].lines[d.id].profile].dwellSeconds:0);allModeled&&=e.modeled;}d.rideSeconds=ride;seconds.rail+=ride;}
    if(i){const c=connector(details[i-1],d,opts,entry,exit);connections.push(c);seconds.walk+=c.seconds;seconds.wait+=c.waitSeconds;}
    else {seconds.wait+=(d.kind==='bus'?opts.busWait:opts.railWait)*60;if(d.kind==='subway')seconds.walk+=entry;}
  }
  if(details.at(-1).kind==='subway')seconds.walk+=exit;
  const access=[];for(const [p,s,side]of [[origin,details[0].path[0],'from'],[destination,details.at(-1).path.at(-1),'to']]){const meters=Math.round(groundMeters(p,point(s)));if(meters>opts.accessRadius)throw Error('access-too-far');seconds.walk+=meters;access.push({side,meters,seconds:meters});}
  return {v:1,mode:'auto',routeMode:'transit',model:'auto-transit-v1',options:opts,seconds,...allocate(seconds),details,connections,access};
}
export function autoTimingSnapshot(q){return {v:1,mode:'auto',minutes:q.minutes,seconds:q.seconds,options:q.options,model:q.model};}
export function validateAutoPlan(data,plan){
  if(plan.v!==1||plan.region!==data.region.id||plan.b!==data.bus.version||plan.m!==data.network.checkedAt||!['transit','walking'].includes(plan.routeMode)||!Array.isArray(plan.legs)||plan.legs.length>6||(plan.routeMode==='walking')!==(plan.legs.length===0))throw Error('invalid-route');
  const opts=autoOptions(plan.timing?.options);if(plan.legs.length>opts.maxTransfers+1)throw Error('invalid-route');const details=plan.legs.map(l=>describe(data,l));for(let i=1;i<details.length;i++)connector(details[i-1],details[i],opts,data.times.walking.entryMinutes*60,data.times.walking.exitMinutes*60);return details;
}
export function autoSummary(data,plan){
  const details=validateAutoPlan(data,plan),label=s=>s.ko+(s.id.startsWith('b:')&&s.code?' #'+s.code:'');
  return [`자동 추천 / Suggested route · ${plan.routeMode==='walking'?'도보 / Walk':data.region.ko}`,...details.flatMap((d,i)=>[...(i?[connector(details[i-1],d,autoOptions(plan.timing?.options),0,0).internal?'역내 환승 / In-station transfer':`도보 환승 / Walk transfer ${Math.round(groundMeters(point(details[i-1].path.at(-1)),point(d.path[0])))}m`]:[]),`${d.kind==='bus'?'Bus '+d.no:d.ko+' / '+d.en}: ${label(d.path[0])} → ${label(d.path.at(-1))} (${label(d.path[1])} 방면 / next; ${d.path.length-1} stops)`]),metroTimingText(plan.timing)].filter(Boolean).join('\n');
}
class Heap{
  a=[];push(s){const a=this.a;a.push(s);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].cost<s.cost||a[p].cost===s.cost&&a[p].rides<=s.rides)break;a[i]=a[p];i=p;}a[i]=s;}
  pop(){const a=this.a,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&(a[c+1].cost<a[c].cost||a[c+1].cost===a[c].cost&&a[c+1].rides<a[c].rides))c++;if(a[c].cost>last.cost||a[c].cost===last.cost&&a[c].rides>=last.rides)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}
const graphCache=new WeakMap();
export function prepareAutoGraph(data){
  if(graphCache.has(data))return graphCache.get(data);
  const nodes=[],byID=new Map(),services=[],members=[],cos=Math.cos((Object.values(data.bus.stops)[0]?.lat??Object.values(data.times.regions[data.region.id].stations)[0][0])*Math.PI/180),grid=new Map(),cell=200;
  const add=(id,s)=>{const index=nodes.length;nodes.push({id,...s,index});byID.set(id,index);members.push([]);return index;};
  for(const [id,s]of Object.entries(data.bus.stops))add('b:'+id,{...s,kind:'bus',sourceID:id});
  for(const [id,s]of Object.entries(data.region.stations)){const p=data.times.regions[data.region.id].stations[id];add('s:'+id,{...s,lat:p[0],lng:p[1],kind:'subway',sourceID:id});}
  for(const route of data.bus.routes){const positions=route.stops.map(id=>byID.get('b:'+id)),index=services.length,edges=positions.map((n,i)=>i+1<positions.length?[{to:i+1,seconds:Math.round(rideSeconds(nodes[n],nodes[positions[i+1]])),modeled:false}]:[]);services.push({id:route.id,kind:'bus',limited:limitedBusService(route.no),positions,edges,dwell:0,index});positions.forEach((n,p)=>members[n].push([index,p]));}
  const rail=metroGraph(data.region);for(const line of data.region.lines){const ids=[...new Set(line.tracks.flat())],map=new Map(ids.map((id,i)=>[id,i])),positions=ids.map(id=>byID.get('s:'+id)),index=services.length,edges=ids.map(id=>[...rail.neighbors.get(line.id).get(id)||[]].map(next=>({to:map.get(next),...railEdge(data,line,id,next)}))),info=data.times.regions[data.region.id].lines[line.id];services.push({id:line.id,kind:'subway',positions,edges,dwell:data.times.profiles[info.profile].dwellSeconds,index});positions.forEach((n,p)=>members[n].push([index,p]));}
  const xy=s=>[Math.floor(s.lng*111200*cos/cell),Math.floor(s.lat*111200/cell)];for(const s of nodes){const key=xy(s).join(',');if(!grid.has(key))grid.set(key,[]);grid.get(key).push(s.index);}
  const nearby=(id,radius)=>{const s=nodes[id],[x,y]=xy(s),steps=Math.ceil(radius/cell),out=[];for(let a=x-steps;a<=x+steps;a++)for(let b=y-steps;b<=y+steps;b++)for(const n of grid.get(a+','+b)||[]){const meters=Math.round(groundMeters(point(s),point(nodes[n])));if(meters<=radius)out.push({node:n,meters});}return out;};
  const graph={nodes,byID,services,members,nearby};graphCache.set(data,graph);return graph;
}
// Dijkstra over real bus occurrences and directed rail edges. Alighting requires at least one ride edge.
export function searchAutoTransit(data,{fromPlace,toPlace,options={},firstKind=null,banFirst=[]},limits={}){
  const opts=autoOptions(options),g=prepareAutoGraph(data),origin=position(fromPlace),destination=position(toPlace);if(groundMeters(origin,destination)<5)throw Error('same-place');
  const starts=[],ends=new Map();for(const n of g.nodes){const a=Math.round(groundMeters(origin,point(n))),b=Math.round(groundMeters(destination,point(n)));if(a<=opts.accessRadius)starts.push({node:n.index,meters:a});if(b<=opts.accessRadius)ends.set(n.index,b);}
  if(!starts.length||!ends.size)return {route:null,visited:0,reason:'no-access'};
  const heap=new Heap(),best=new Map(),entry=data.times.walking.entryMinutes*60,exit=data.times.walking.exitMinutes*60,maxRides=opts.maxTransfers+1,banned=new Set(banFirst),nearCache=new Map();let visited=0,winner;
  const key=s=>s.type==='ready'?`r:${s.node}:${s.last}:${s.rides}`:`o:${s.service}:${s.pos}:${s.rides}:${s.started?1:0}:${s.allModeled?1:0}`;
  function put(s){s.key=key(s);if((best.get(s.key)??Infinity)<=s.cost)return;best.set(s.key,s.cost);heap.push(s);}
  for(const s of starts)put({type:'ready',node:s.node,last:-1,rides:0,cost:s.meters,parent:null,action:'access'});
  while(heap.a.length){
    const cur=heap.pop();if(best.get(cur.key)!==cur.cost)continue;if(winner&&cur.cost>winner.cost)break;if(++visited>(limits.maxVisited??600000))throw Error('search-limit');
    if(cur.type==='ready'){
      const previous=cur.last<0?null:g.services[cur.last],at=g.nodes[cur.node];
      if(cur.rides&&ends.has(cur.node)){const cost=cur.cost+ends.get(cur.node)+(previous.kind==='subway'?exit:0);if(!winner||cost<winner.cost||cost===winner.cost&&cur.rides<winner.state.rides)winner={state:cur,cost};}
      if(cur.rides>=maxRides)continue;
      const nk=cur.node+':'+opts.transferRadius;if(!nearCache.has(nk))nearCache.set(nk,g.nearby(cur.node,opts.transferRadius));const choices=previous?nearCache.get(nk):[{node:cur.node,meters:0}];
      for(const c of choices){const nextNode=g.nodes[c.node];if(previous?.kind==='bus'&&nextNode.kind==='bus'&&c.meters>Math.min(180,opts.transferRadius))continue;
        for(const [service,pos]of g.members[c.node]){const next=g.services[service];if(next.limited&&!opts.includeLimitedServices||!next.edges[pos].length)continue;if(!previous&&((firstKind&&next.kind!==firstKind)||banned.has(next.kind+':'+next.id)))continue;
          const internal=previous?.kind==='subway'&&next.kind==='subway'&&cur.node===c.node;
          if(internal&&cur.last===service)continue;
          let cost=cur.cost+(next.kind==='bus'?opts.busWait:internal?opts.railTransferWait:opts.railWait)*60;
          if(!previous){if(next.kind==='subway')cost+=entry;}
          else if(internal)cost+=opts.railTransferWalk*60;
          else cost+=c.meters+(previous.kind==='subway'?exit:0)+(next.kind==='subway'?entry:60);
          put({type:'on',service,pos,node:c.node,rides:cur.rides+1,started:false,allModeled:true,cost,parent:cur,action:'board'});
        }
      }
    }else{
      const service=g.services[cur.service];
      if(cur.started)put({type:'ready',node:cur.node,last:cur.service,rides:cur.rides,cost:cur.cost,parent:cur,action:'alight'});
      for(const e of service.edges[cur.pos])put({...cur,pos:e.to,node:service.positions[e.to],started:true,allModeled:cur.allModeled&&e.modeled,cost:cur.cost+e.seconds+(service.kind==='subway'&&cur.started&&(e.modeled||cur.allModeled)?service.dwell:0),parent:cur,action:'ride'});
    }
  }
  if(!winner)return {route:null,visited,reason:'no-route'};
  const chain=[];for(let s=winner.state;s;s=s.parent)chain.unshift(s);const legs=[],paths=[];let leg=null,path=null,firstService;
  for(let i=0;i<chain.length;i++){const s=chain[i];if(s.action==='board'){leg=null;path=null;if(!firstService){const svc=g.services[s.service];firstService=svc.kind+':'+svc.id;}}if(s.action!=='ride')continue;const svc=g.services[s.service],prev=chain[i-1],a=g.nodes[prev.node],b=g.nodes[s.node];if(!leg){leg=svc.kind==='bus'?['b',svc.id,prev.pos,s.pos]:['s',svc.id,a.sourceID,b.sourceID,b.sourceID];legs.push(leg);path=[a.sourceID,b.sourceID];paths.push(path);}else{leg[3]=svc.kind==='bus'?s.pos:b.sourceID;path.push(b.sourceID);}}
  for(let i=0;i<legs.length;i++)if(legs[i][0]==='s'){const d=describe(data,legs[i]);if(JSON.stringify(d.path.map(s=>s.sourceID))!==JSON.stringify(paths[i]))throw Error('unrepresentable-route');}
  const quote=quoteAutoRoute(data,legs,{fromPlace,toPlace,options:opts});if(quote.totalSeconds!==winner.cost)throw Error('time-model-mismatch');
  return {route:{legs,quote,firstService,certified:true},visited};
}
export function recommendAutoRoutes(data,query,limits={}){
  const options=autoOptions(query.options),routes=[];let totalVisited=0,limitedAlternatives=false;
  const first=searchAutoTransit(data,{...query,options},limits);totalVisited+=first.visited;if(first.route)routes.push(first.route);
  if(first.route&&limits.alternatives!==false){const kind=first.route.firstService.startsWith('bus:')?'subway':'bus';for(const variant of [{firstKind:kind},{banFirst:[first.route.firstService]}]){try{const r=searchAutoTransit(data,{...query,...variant,options},limits);totalVisited+=r.visited;if(r.route&&!routes.some(x=>JSON.stringify(x.legs)===JSON.stringify(r.route.legs)))routes.push(r.route);}catch(e){if(e.message==='search-limit'){limitedAlternatives=true;continue;}throw e;}}}
  try{const quote=quoteAutoRoute(data,[],{...query,options});routes.push({legs:[],quote,firstService:null,certified:true});}catch(e){if(e.message!=='walk-too-far')throw e;}
  routes.sort((a,b)=>a.quote.totalSeconds-b.quote.totalSeconds||a.legs.length-b.legs.length);if(!routes.length)throw Error(first.reason||'no-route');
  return {routes:routes.slice(0,3),visited:totalVisited,limitedAlternatives,scope:{accessRadius:options.accessRadius,transferRadius:options.transferRadius,maxTransfers:options.maxTransfers,live:false}};
}
export function inferAutoRegion(network,times,fromPlace,toPlace){
  const a=position(fromPlace),b=position(toPlace);return network.regions.map(r=>{const nodes=Object.values(times.regions[r.id].stations),from=Math.min(...nodes.map(p=>groundMeters(a,p))),to=Math.min(...nodes.map(p=>groundMeters(b,p)));return {region:r.id,score:from+to,maxDistance:Math.max(from,to)};}).sort((a,b)=>a.score-b.score)[0];
}
