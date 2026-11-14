export function locationFix(raw,now=Date.now()){
  const c=raw?.coords||raw,lat=c?.latitude??c?.lat,lng=c?.longitude??c?.lng,accuracy=c?.accuracy,timestamp=raw?.timestamp;
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Number.isFinite(accuracy)||accuracy<0||!Number.isFinite(timestamp)||timestamp>now+10000||now-timestamp>60000)throw Error('unavailable');
  return {latitude:lat,longitude:lng,accuracy,timestamp};
}
export function locationMessage(error,t){return ({denied:t('Location access is off. Allow it in your browser or iPhone Settings, then retry.','위치 접근이 꺼져 있어요. 브라우저 또는 아이폰 설정에서 위치를 허용한 뒤 다시 눌러주세요.'),timeout:t('Finding your location took too long. Move to an open area and retry.','현재 위치를 찾는 데 시간이 걸려요. 신호가 잘 잡히는 곳에서 다시 눌러주세요.'),unsupported:t('Location is unavailable here. You can choose a place on the map.','현재 환경에서 위치를 사용할 수 없어요. 지도에서 장소를 선택할 수 있습니다.'),'app-update':t('Update TripFlow Korea in TestFlight once to enable iPhone location access.','아이폰 위치 기능을 사용하려면 TestFlight에서 TripFlow Korea를 한 번 업데이트해주세요.'),unavailable:t('Could not find your location. Check Location Services and retry.','현재 위치를 찾지 못했어요. 위치 서비스 설정을 확인하고 다시 눌러주세요.')})[error]||t('Could not find your location. Retry.','현재 위치를 찾지 못했어요. 다시 눌러주세요.');}
// Coordinates live in memory. Starting, saving a route, and sharing are separate actions.
export function createLocationService({geolocation=globalThis.navigator?.geolocation,native=false,nativeSupported=()=>false,nativeRequest,nativeStop=()=>{},doc=globalThis.document,now=Date.now,pollMs=10000}={}){
  const listeners=new Set();let enabled=false,watch=null,poll,token=0,state={status:'idle',fix:null,error:null};
  const snapshot=()=>({...state,fix:state.fix&&now()-state.fix.timestamp<=60000?{...state.fix}:null,enabled}),emit=()=>{for(const fn of [...listeners])fn(snapshot());};
  const errorCode=e=>typeof e==='string'?e:({1:'denied',2:'unavailable',3:'timeout'})[e?.code]||'unavailable';
  function stop(){token++;clearTimeout(poll);poll=null;const active=watch!==null;if(active&&!native)geolocation?.clearWatch(watch);watch=null;if(native&&active)Promise.resolve(nativeStop()).catch(()=>{});}
  function start(){
    if(!enabled||!listeners.size||doc?.visibilityState==='hidden'||watch!==null||poll)return;
    const generation=++token;state={...state,status:'loading',error:null};emit();
    const accept=raw=>{if(generation!==token||!enabled)return;try{state={status:'ready',fix:locationFix(raw,now()),error:null};emit();}catch{fail('unavailable');}};
    const fail=e=>{if(generation!==token)return;const code=errorCode(e);state={...state,status:'error',error:code};if(['denied','unsupported','app-update'].includes(code))stop();emit();};
    if(native){
      if(!nativeSupported()){fail('app-update');return;}
      const request=async()=>{try{const result=await nativeRequest();if(result?.ok===false)fail(result.error);else accept(result);}catch(e){fail(e);}finally{if(generation===token&&listeners.size&&enabled)poll=setTimeout(()=>{poll=null;request();},pollMs);}};
      // Non-null watch marks an active native polling session as well.
      watch='native';request();
    }else if(!geolocation?.watchPosition)fail('unsupported');
    else try{watch=geolocation.watchPosition(accept,fail,{enableHighAccuracy:true,timeout:20000,maximumAge:15000});}catch(e){fail(e);}
  }
  function subscribe(fn){listeners.add(fn);fn(snapshot());start();return ()=>{listeners.delete(fn);if(!listeners.size)stop();};}
  function enable(){enabled=true;if(state.status==='error'){stop();state={...state,status:'idle',error:null};}start();emit();}
  function disable(){enabled=false;stop();state={status:'idle',fix:null,error:null};emit();}
  function request({signal}={}){
    if(signal?.aborted)return Promise.reject(Error('aborted')); 
    if(state.status==='ready'&&state.fix&&now()-state.fix.timestamp<=15000){enable();return Promise.resolve({...state.fix});}
    return new Promise((resolve,reject)=>{let unsubscribe=()=>{},finished=false,timer;const finish=(error,fix)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);queueMicrotask(()=>unsubscribe());error?reject(Error(error)):resolve({...fix});};
      const abort=()=>finish('aborted');signal?.addEventListener('abort',abort,{once:true});
      enabled=true;if(state.status==='error'){stop();state={...state,status:'idle',error:null};}
      timer=setTimeout(()=>finish('timeout'),25000);unsubscribe=subscribe(s=>{if(s.status==='ready'&&s.fix&&now()-s.fix.timestamp<=15000)finish(null,s.fix);else if(s.status==='error')finish(s.error);});
    });
  }
  const visibility=()=>{if(doc.visibilityState==='hidden'){stop();state={...state,status:'paused'};emit();}else start();};doc?.addEventListener('visibilitychange',visibility);
  return {get enabled(){return enabled;},snapshot,subscribe,enable,disable,request,destroy(){disable();listeners.clear();doc?.removeEventListener('visibilitychange',visibility);}};
}
