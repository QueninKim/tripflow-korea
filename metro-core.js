// TripFlow's own station-order diagrams, based on factual operator station lists.
const START='[TripFlow Subway v1]',END='[/TripFlow Subway]';
export function readMetroNote(note=''){
  const pos=note.lastIndexOf(START);if(pos<0||!note.endsWith(END))return {note};
  try{
    const lines=note.slice(pos+START.length,-END.length).trim().split('\n'),plan=JSON.parse(lines.shift());
    if(plan.v!==1||typeof plan.region!=='string'||typeof plan.from!=='string'||typeof plan.to!=='string'||!Array.isArray(plan.legs)||!plan.legs.length||plan.legs.length>8||!plan.legs.every(l=>Array.isArray(l)&&l.length===4&&l.every(v=>typeof v==='string')))return {note};
    return {note:note.slice(0,pos).trimEnd(),plan,summary:lines.join('\n')};
  }catch{return {note};}
}
export function mergeMetroNote(note,plan,summary=''){
  const plain=readMetroNote(note).note;
  const result=plan?`${plain}${plain?'\n\n':''}${START}\n${JSON.stringify(plan)}\n${summary}\n${END}`:plain;
  // Swift's String.count can only be smaller than JS's UTF-16 count.
  if(result.length>2000)throw Error('note-too-long');return result;
}
export function metroStatus(parsed,previous,stop){
  if(!parsed.plan)return 'none';
  if(!previous||parsed.plan.from!==previous.id||parsed.plan.to!==stop.id)return 'stale';
  return stop.mode==='transit'?'active':'inactive';
}
export function metroPaths(line,from,to){
  if(!line||from===to)return [];
  const edges=new Map();
  const edge=(a,b)=>{if(!edges.has(a))edges.set(a,new Set());edges.get(a).add(b);};
  line.tracks.forEach((track,i)=>{for(let j=1;j<track.length;j++){edge(track[j-1],track[j]);if(!line.directedTracks.includes(i))edge(track[j],track[j-1]);}});
  if(!edges.has(from)||!edges.has(to))return [];
  const found=[];
  function visit(path,seen){if(found.length>=8)return;const last=path.at(-1);if(last===to){found.push(path);return;}for(const n of edges.get(last)||[])if(!seen.has(n)){const next=new Set(seen);next.add(n);visit([...path,n],next);}}
  visit([from],new Set([from]));return found.sort((a,b)=>a.length-b.length||a.join().localeCompare(b.join()));
}
export function validateMetroPlan(network,plan){
  const r=network.regions.find(r=>r.id===plan.region);
  if(!r||!plan.legs.length||plan.legs.length>8)throw Error('invalid-route');
  let end;const paths=[];
  for(const [id,a,b,next]of plan.legs){const line=r.lines.find(l=>l.id===id);const path=metroPaths(line,a,b).find(p=>p[1]===next);if(!path||(end&&end!==a))throw Error('invalid-route');paths.push(path);end=b;}
  if(plan.vias!==undefined&&(!Array.isArray(plan.vias)||plan.vias.length>7||new Set(plan.vias).size!==plan.vias.length||plan.vias.some(v=>typeof v!=='string'||(metroGraph(r).membership.get(v)?.size||0)<2)||!routeContainsTransfers(plan.legs,plan.vias)))throw Error('invalid-route');
  return {region:r,paths};
}
const stationLabel=(r,id)=>{const s=r.stations[id];return s?`${s.ko}${s.en?' · '+s.en:''}`:id;};
export function metroSummary(network,plan){
  const {region:r,paths}=validateMetroPlan(network,plan);
  return [r.ko+' / '+r.en,...plan.legs.map(([id,a,b],i)=>{const l=r.lines.find(l=>l.id===id);const next=paths[i][1];return `${l.ko} / ${l.en}: ${stationLabel(r,a)} → ${stationLabel(r,b)} (${stationLabel(r,next)} 방면 / towards; ${paths[i].length-1} ${paths[i].length===2?'stop':'stops'})`;})].join('\n');
}

const graphCache=new WeakMap();
export function metroGraph(region){
  if(graphCache.has(region))return graphCache.get(region);
  const membership=new Map(),neighbors=new Map();
  for(const line of region.lines){
    const edges=new Map();
    const link=(a,b)=>{if(!edges.has(a))edges.set(a,new Set());edges.get(a).add(b);};
    for(const [i,track]of line.tracks.entries()){
      for(const id of track){if(!membership.has(id))membership.set(id,new Set());membership.get(id).add(line.id);}
      for(let j=1;j<track.length;j++){link(track[j-1],track[j]);if(!line.directedTracks.includes(i))link(track[j],track[j-1]);}
    }
    neighbors.set(line.id,edges);
  }
  const graph={membership,neighbors};graphCache.set(region,graph);return graph;
}
class MinHeap{
  items=[];
  push(value){const a=this.items;a.push(value);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p].cost<=value.cost)break;a[i]=a[p];i=p;}a[i]=value;}
  pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(true){let c=i*2+1;if(c>=a.length)break;if(c+1<a.length&&a[c+1].cost<a[c].cost)c++;if(a[c].cost>=last.cost)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
  get length(){return this.items.length;}
}
// Static connectivity only: costs prioritize fewer transfers, then fewer station hops.
// A chosen transfer waypoint is satisfied only by actually changing lines there.
export function findMetroRoutes(region,{from,to,vias=[]},limit=3){
  const graph=metroGraph(region);
  if(!graph.membership.has(from)||!graph.membership.has(to)||from===to||vias.length>7||new Set(vias).size!==vias.length||vias.some(v=>v===from||v===to||(graph.membership.get(v)?.size||0)<2))return [];
  function run({first=null,ban=null}={}){
    const heap=new MinHeap(),best=new Map();
    const key=s=>[s.station,s.line,s.stage,s.started?1:0,s.canSwitch?1:0,s.legStart,s.previousStation||''].join('\x1f');
    function put(s){s.key=key(s);if((best.get(s.key)??Infinity)<=s.cost)return;best.set(s.key,s.cost);heap.push(s);}
    for(const line of graph.membership.get(from))if(line!==ban&&(!first||first[0]===line))put({station:from,line,stage:0,cost:0,changes:0,started:false,canSwitch:false,legStart:from,previousStation:null,parent:null});
    while(heap.length){
      const cur=heap.pop();if(best.get(cur.key)!==cur.cost)continue;
      if(cur.station===to&&cur.stage===vias.length){
        const nodes=[];for(let n=cur;n;n=n.parent)nodes.unshift(n);
        const legs=[];let current=null;
        for(let i=1;i<nodes.length;i++){
          const prev=nodes[i-1],n=nodes[i];
          if(prev.station===n.station)continue;
          if(!current||current[0]!==n.line){current=[n.line,prev.station,n.station,n.station];legs.push(current);}else current[2]=n.station;
        }
        if(!legs.length||legs.length>8||!routeContainsTransfers(legs,vias))continue;
        if(!legs.every(([id,a,b,next])=>metroPaths(region.lines.find(l=>l.id===id),a,b).some(p=>p[1]===next)))continue;
        return {legs,changes:legs.length-1,stops:cur.cost%1000000,cost:cur.cost};
      }
      for(const station of graph.neighbors.get(cur.line).get(cur.station)||[]){
        if((!cur.started&&first&&station!==first[1])||station===cur.previousStation||station===cur.legStart)continue;
        put({...cur,station,previousStation:cur.station,started:true,canSwitch:true,cost:cur.cost+1,parent:cur});
      }
      if(cur.canSwitch&&cur.changes<7)for(const next of graph.membership.get(cur.station))if(next!==cur.line&&next!==ban){
        put({...cur,line:next,canSwitch:false,legStart:cur.station,previousStation:null,stage:cur.station===vias[cur.stage]?cur.stage+1:cur.stage,changes:cur.changes+1,cost:cur.cost+1000000,parent:cur});
      }
    }
    return null;
  }
  const results=[],seen=new Set();
  const add=r=>{if(!r)return;const sig=JSON.stringify(r.legs);if(!seen.has(sig)){seen.add(sig);results.push(r);}};
  const first=run();add(first);if(!first)return [];
  for(const l of graph.membership.get(from))for(const n of graph.neighbors.get(l).get(from)||[])add(run({first:[l,n]}));
  for(const l of new Set(first.legs.map(leg=>leg[0])))add(run({ban:l}));
  return results.sort((a,b)=>a.cost-b.cost).slice(0,limit);
}
export function routeContainsTransfers(legs,vias=[]){
  let index=0;
  for(let i=1;i<legs.length;i++)if(legs[i-1][2]===legs[i][1]&&legs[i-1][0]!==legs[i][0]&&legs[i][1]===vias[index])index++;
  return index===vias.length;
}
