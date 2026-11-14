import {rideShape} from './journey-shapes.js?v=web-17';
export const journeyStyles={
  bus:{color:'#2368dc',weight:6,dashArray:null},
  subway:{color:'#8c39c7',weight:7,dashArray:null},
  walking:{color:'#5b6873',weight:3,dashArray:'3 7'}
};
const position=p=>{
  const lat=p?.lat??p?.latitude,lng=p?.lng??p?.longitude;
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180)throw Error('invalid-map-position');
  return [lat,lng];
};
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
export function journeyGeometry(quote,{fromPlace,toPlace,shapes}={}){
  if(!quote||!Array.isArray(quote.details))throw Error('invalid-map-route');
  const lines=[],markers=[],allPoints=[],coverage=[];
  const addLine=(kind,nodes,extra={})=>{
    const points=nodes.map(position);if(points.length<2)throw Error('invalid-map-route');
    allPoints.push(...points);
    // Same-station internal transfers stay in the marker list without a fake walk.
    if(points.every(p=>same(p,points[0])))return;
    lines.push({id:'path-'+lines.length,kind,points,nodes,...journeyStyles[kind],...extra});
  };
  const marker=(kind,node,extra={})=>{const point=position(node);allPoints.push(point);markers.push({id:'pin-'+markers.length,kind,node,point,...extra});};
  if(!quote.details.length){
    if(quote.routeMode!=='walking'||!fromPlace||!toPlace)throw Error('invalid-map-route');
    addLine('walking',[fromPlace,toPlace],{role:'direct'});marker('origin',fromPlace);marker('destination',toPlace);
  }else{
    const first=quote.details[0].path?.[0],last=quote.details.at(-1).path?.at(-1);
    const access=quote.access||[],start=fromPlace&&access.some(a=>a.side==='from')?fromPlace:first,end=toPlace&&access.some(a=>a.side==='to')?toPlace:last;
    marker('origin',start);
    if(start!==first)addLine('walking',[start,first],{role:'access'});
    quote.details.forEach((d,i)=>{
      if(!['bus','subway'].includes(d.kind)||!Array.isArray(d.path)||d.path.length<2)throw Error('invalid-map-route');
      if(i){
        const c=quote.connections?.[i-1];if(!c?.from||!c?.to)throw Error('invalid-map-route');
        addLine('walking',[c.from,c.to],{role:'transfer',transfer:i,internal:!!c.internal});
        marker('transfer-out',c.from,{transfer:i,next:c.to,service:d});
      }
      const shaped=rideShape(d,shapes);coverage.push({legIndex:i,kind:d.kind,service:d,available:shaped.available,total:shaped.total});
      const chunks=[];for(const path of shaped.segments){const prev=chunks.at(-1);if(prev&&same(prev.at(-1),path[0]))prev.push(...path.slice(1));else chunks.push([...path]);}
      for(const points of chunks)addLine(d.kind,points.map(p=>({lat:p[0],lng:p[1]})),{role:'ride',legIndex:i,service:d,nodes:d.path});
      // Bounds retain all scheduled stops even when source geometry is missing.
      allPoints.push(...d.path.map(position));
      marker('board',d.path[0],{legIndex:i,service:d});
      // Every actual alighting position is retained, including separate platforms.
      marker('alight',d.path.at(-1),{legIndex:i,service:d});
    });
    if(end!==last)addLine('walking',[last,end],{role:'egress'});
    marker('destination',end);
  }
  if(!allPoints.length)throw Error('invalid-map-route');
  return {lines,markers,coverage,bounds:[[Math.min(...allPoints.map(p=>p[0])),Math.min(...allPoints.map(p=>p[1]))],[Math.max(...allPoints.map(p=>p[0])),Math.max(...allPoints.map(p=>p[1]))]],allPoints};
}
