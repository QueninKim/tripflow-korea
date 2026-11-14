import {groundMeters} from './metro-time.js?v=web-20';
import {decodeShape} from './journey-shapes.js?v=web-20';
export const WALK_PROVIDER='fossgis-osrm-foot';
export const walkingPosition=p=>{const a=Array.isArray(p)?p:[p?.latitude,p?.longitude];groundMeters(a,a);if(a.length!==2||a[0]<32||a[0]>40||a[1]<123||a[1]>133)throw Error('walking-outside');return a.map(n=>Math.round(n*1e6)/1e6);};
export function validateWalkingRoute(route){
  if(route?.v!==1||route.provider!==WALK_PROVIDER||!Number.isFinite(route.meters)||route.meters<0||route.meters>200000||!Number.isFinite(route.seconds)||route.seconds<0||Math.ceil(route.seconds/60)>2880||!Number.isFinite(route.fetchedAt))throw Error('walking-response');
  const from=walkingPosition(route.from),to=walkingPosition(route.to),snapped=route.snapped?.map(walkingPosition),path=decodeShape(route.shape);
  if(!snapped||snapped.length!==2||typeof route.shape!=='string'||!Array.isArray(path)||path.length<2||path.length>30000||path.some(p=>{try{walkingPosition(p);return false;}catch{return true;}}))throw Error('walking-response');
  if(groundMeters(from,snapped[0])>81||groundMeters(to,snapped[1])>81||groundMeters(path[0],snapped[0])>3||groundMeters(path.at(-1),snapped[1])>3||route.meters+5<groundMeters(path[0],path.at(-1))*.95)throw Error('walking-snap');
  if(route.seconds===0&&(route.meters>1||groundMeters(from,to)>1))throw Error('walking-response');
  return {...route,from,to,snapped,path,minutes:Math.ceil(route.seconds/60)};
}
export function parseWalkingResponse(body,from,to,now=Date.now()){
  if(body?.code==='NoRoute'||body?.code==='NoSegment')throw Error('walking-no-route');
  const r=body?.routes?.[0];if(body?.code!=='Ok'||!r||body.waypoints?.length!==2)throw Error('walking-response');
  return validateWalkingRoute({v:1,provider:WALK_PROVIDER,from:walkingPosition(from),to:walkingPosition(to),meters:r.distance,seconds:r.duration,shape:r.geometry,snapped:body.waypoints.map(p=>[p.location?.[1],p.location?.[0]]),fetchedAt:now});
}
export async function walkingRouteID(route){
  const bytes=new TextEncoder().encode(JSON.stringify([route.provider,route.from,route.to,route.snapped,route.meters,route.seconds,route.shape]));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function walkingQuote(route){const r=validateWalkingRoute(route);return {routeMode:'walking',walking:r,details:[],connections:[],access:[],seconds:{bus:0,rail:0,wait:0,walk:r.seconds},parts:{bus:0,rail:0,wait:0,walk:r.minutes},totalSeconds:r.seconds,minutes:r.minutes,walkMeters:r.meters};}

export function encodeWalkingShape(path){let previous=[0,0],out='';for(const p of path)for(let i=0;i<2;i++){const value=Math.round(p[i]*1e6),delta=value-previous[i];previous[i]=value;let n=delta<0?-delta*2-1:delta*2;while(n>=32){out+=String.fromCharCode((n%32|32)+63);n=Math.floor(n/32);}out+=String.fromCharCode(n+63);}return out;}
