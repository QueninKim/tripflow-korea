const requests=new Map();
export function loadJourneyShapes(region){
  if(!['seoul','busan','daegu','daejeon','gwangju'].includes(region))return Promise.reject(Error('invalid-shape-region'));
  if(!requests.has(region))requests.set(region,fetch(new URL(`./journey-shapes-${region}.json?v=web-14`,import.meta.url)).then(r=>{if(!r.ok)throw Error('shape-data');return r.json();}).then(data=>{if(data.v!==1||data.region!==region||!data.bus||!data.subway)throw Error('shape-data');return data;}).catch(e=>{requests.delete(region);throw e;}));
  return requests.get(region);
}
export function decodeShape(value){
  if(Array.isArray(value))return value;
  if(typeof value!=='string'||value.length>200000)return null;
  const points=[],position=[0,0];let i=0;
  while(i<value.length){
    for(let axis=0;axis<2;axis++){
      let bits=0,shift=0,byte;
      do{if(i>=value.length||shift>30)return null;byte=value.charCodeAt(i++)-63;if(byte<0||byte>63)return null;bits+=(byte&31)*2**shift;shift+=5;}while(byte>=32);
      position[axis]+=(bits%2?-(bits+1)/2:bits/2);
    }
    points.push(position.map(n=>n/1e6));
  }
  return points;
}
const validPath=value=>{const path=decodeShape(value);return Array.isArray(path)&&path.length>=2&&path.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=32&&p[0]<=40&&p[1]>=123&&p[1]<=133);};
// Geometry is indexed by the exact stop occurrence, not just its public ID.
// Missing source sections remain gaps; no stop-to-stop or road-router substitute.
export function rideShape(detail,data){
  const count=detail.path.length-1,segments=[];let available=0;
  if(detail.kind==='bus'){
    const shape=data?.bus?.[detail.id],leg=detail.leg;
    if(!shape||!leg||leg[0]!=='b'||!Number.isInteger(leg[2])||leg[3]-leg[2]!==count||detail.path.some((p,i)=>p.sourceID!==shape.stops?.[leg[2]+i]))return {segments,available,total:count};
    for(let i=leg[2];i<leg[3];i++){
      const paths=shape.segments?.[i];if(!Array.isArray(paths)||!paths.length||!paths.every(validPath))continue;
      segments.push(...paths.map(path=>decodeShape(path).map(p=>[...p])));available++;
    }
  }else if(detail.kind==='subway'){
    const line=data?.subway?.[detail.id];
    for(let i=1;i<detail.path.length;i++){
      const a=detail.path[i-1].sourceID,b=detail.path[i].sourceID,path=line?.[a+'>'+b],reverse=line?.[b+'>'+a];
      if(validPath(path)){segments.push(decodeShape(path).map(p=>[...p]));available++;}
      else if(validPath(reverse)){segments.push([...decodeShape(reverse)].reverse().map(p=>[...p]));available++;}
    }
  }
  return {segments,available,total:count};
}
