import {groundMeters} from './metro-time.js?v=web-20';
import {encodeWalkingShape,walkingPosition,parseWalkingResponse,validateWalkingRoute,walkingRouteID} from './walking-core.js?v=web-20';
const ENDPOINT='https://routing.openstreetmap.de/routed-foot/route/v1/foot/',CACHE='tripflow-walking-roads-v1';
const abort=()=>Error('cancelled');
function pause(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted)return reject(abort());const cancel=()=>{clearTimeout(timer);reject(abort());},timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);signal?.addEventListener('abort',cancel,{once:true});});}
export function createWalkingRouter({fetcher=(...args)=>fetch(...args),storage=()=>localStorage,interval=1100,now=()=>Date.now()}={}){
  const memory=new Map();let queue=Promise.resolve(),lastRequest=0,loaded=false;
  const load=()=>{if(loaded)return;loaded=true;try{for(const r of JSON.parse(storage().getItem(CACHE)||'[]'))if(r?.id)memory.set(r.id,r);}catch{}};
  function retain(route){load();const {path,minutes,...raw}=route;memory.set(raw.id,raw);const sorted=[...memory.values()].sort((a,b)=>b.fetchedAt-a.fetchedAt).slice(0,80);memory.clear();for(const r of sorted)memory.set(r.id,r);try{const json=JSON.stringify(sorted);if(json.length<3500000)storage().setItem(CACHE,json);}catch{}return route;}
  async function checked(raw){const route=validateWalkingRoute(raw);if(route.id!==await walkingRouteID(route))throw Error('walking-cache');return route;}
  async function get(plan){load();const raw=plan.route?.shape?plan.route:memory.get(plan.route?.id);if(!raw)throw Error('walking-cache');const route=await checked(raw);if(JSON.stringify([route.from,route.to,route.meters,route.seconds])!==JSON.stringify([plan.route.from,plan.route.to,plan.route.meters,plan.route.seconds]))throw Error('walking-cache');return route;}
  async function query(fromPlace,toPlace,{signal}={}){
    const from=walkingPosition(fromPlace),to=walkingPosition(toPlace);if(groundMeters(from,to)>50000)throw Error('walking-too-far');if(signal?.aborted)throw abort();load();
    if(groundMeters(from,to)<1){const route=validateWalkingRoute({v:1,provider:'fossgis-osrm-foot',from,to,snapped:[from,to],meters:0,seconds:0,shape:encodeWalkingShape([from,to]),fetchedAt:now()});route.id=await walkingRouteID(route);return retain(route);}
    for(const raw of memory.values())if(JSON.stringify([raw.from,raw.to])===JSON.stringify([from,to])&&now()-raw.fetchedAt<86400000&&now()>=raw.fetchedAt){try{return await checked(raw);}catch{memory.delete(raw.id);}}
    const task=async()=>{
      if(signal?.aborted)throw abort();
      // Share a device-wide request slot across tabs when Web Locks is available.
      const request=async()=>{
        let stamp=lastRequest;try{const saved=Number(storage().getItem(CACHE+'-request')||0);if(Number.isFinite(saved))stamp=Math.max(stamp,Math.min(now(),saved));}catch{}
        await pause(Math.max(0,interval-(now()-stamp)),signal);if(signal?.aborted)throw abort();lastRequest=now();try{storage().setItem(CACHE+'-request',String(lastRequest));}catch{}
        const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(cancel,18000);signal?.addEventListener('abort',cancel,{once:true});
        try{const coords=[from,to].map(p=>p[1]+','+p[0]).join(';'),url=ENDPOINT+coords+'?overview=full&geometries=polyline6&steps=false&alternatives=false&radiuses=80;80&generate_hints=false';
          const response=await fetcher(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'strict-origin-when-cross-origin'});
          if(signal?.aborted)throw abort();if(response.status===429)throw Error('walking-rate-limit');if(!response.ok)throw Error('walking-unavailable');
          const route=parseWalkingResponse(await response.json(),from,to,now());if(signal?.aborted)throw abort();route.id=await walkingRouteID(route);return retain(route);
        }catch(e){if(signal?.aborted)throw abort();if(controller.signal.aborted)throw Error('walking-timeout');if(e.message.startsWith('walking-'))throw e;throw Error('walking-unavailable');}
        finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
      };
      return globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('tripflow-foot-request',{signal},request):request();
    };
    const result=queue.catch(()=>{}).then(task);queue=result.catch(()=>{});return result;
  }
  return {query,get,retain};
}
export const walkingRoutes=createWalkingRouter();
