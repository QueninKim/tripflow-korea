import {indoorData} from './indoor-data.js?v=web-21';
export {indoorData};
const key=(station,from,to,target)=>[station,from,to,target].join('|'),index=new Map();
for(const e of indoorData.entries)index.set(key(e.fromStation,e.from,e.to,e.toStation),e);
export function indoorTransfer(region,station,from,to,target=station){
  if(region!=='capital'||from===to)return null;
  const direct=index.get(key(station,from,to,target)),reverse=!direct&&index.get(key(target,to,from,station)),e=direct||reverse;if(!e)return null;
  return {v:1,id:indoorData.id+':'+e.row,station:e.station,row:e.row,meters:e.meters,seconds:e.seconds,fromLine:from,toLine:to,fromStation:station,toStation:target,reversed:!!reverse,date:indoorData.date};
}
export function indoorNeighbours(region,station){
  if(region!=='capital')return [];const result=new Set();
  for(const e of indoorData.entries){if(e.fromStation===station)result.add(e.toStation);if(e.toStation===station)result.add(e.fromStation);}return [...result];
}
export function indoorGuides(transfer){
  if(!transfer)return [];return [...(indoorData.guides[transfer.station]||[])].sort((a,b)=>(a.line===transfer.fromLine?0:a.line===transfer.toLine?1:2)-(b.line===transfer.fromLine?0:b.line===transfer.toLine?1:2));
}
export const indoorTime=(seconds,t)=>{const s=Math.round(seconds);return t(`${Math.floor(s/60)} min ${s%60} sec`,`${Math.floor(s/60)}분 ${s%60}초`);};
