import {readTransitNote} from './transit-note.js?v=web-16';
import {hasSelectedTransit,calculateTransitMovement} from './transit-refresh-core.js?v=web-16';
import {inferAutoRegion} from './auto-core.js?v=web-16';
import {mixedData,busRegionID} from './mixed-core.js?v=web-16';
import {groundMeters} from './metro-time.js?v=web-16';
export function createTransitRefresher(ctx){
  const {t,h,modal,modalTop,openModal,toast}=ctx,buses=new Map();let commonRequest,job,sequence=0,worker,stopGroup,internal=false;
  const busy=()=>job&&['loading','calculating','saving'].includes(job.stage),current=active=>job===active&&active.token===sequence&&modal.open&&modal.classList.contains('transit-refresh-modal');
  const unchanged=active=>ctx.getTripID()===active.tripID&&ctx.getDay()?.id===active.dayID&&JSON.stringify(ctx.getDay())===active.before;
  const reason=code=>({'outside-region':t('Outside the supported regional transit networks','지원하는 지역 교통망 밖의 구간입니다'),'saved-route-invalid':t('Review the saved route against current data','저장한 경로를 현재 자료로 다시 확인해주세요'),'no-access':t('No usable stop or station near an endpoint','출발·도착지 근처에 역·정류장이 없습니다'),'no-route':t('No connected transit route within the search limits','검색 범위 안에 연결된 대중교통 경로가 없습니다'),'search-limit':t('Search too broad; narrow it in Directions','검색 범위가 큽니다. 길찾기에서 범위를 조정해주세요'),timeout:t('Search timed out; retry this section','조회 시간이 초과됐습니다. 이 구간을 다시 조회해주세요'),data:t('Could not load regional transit data','지역 교통 자료를 불러오지 못했습니다'),'note-too-long':t('Route and note exceed the saved note limit','경로와 메모가 저장 한도를 넘습니다'),changed:t('Itinerary changed. Run the lookup again.','일정이 바뀌었습니다. 다시 조회해주세요.')})[code]||t('Could not calculate this section','이 구간을 계산하지 못했습니다');
  function draw(){
    const active=job;if(!active)return;const done=active.results.filter(Boolean).length,failed=active.results.filter(r=>r?.error).length,success=done-failed,saving=active.stage==='saving',running=['loading','calculating'].includes(active.stage),scroll=modal.classList.contains('transit-refresh-modal')?modal.scrollTop:0;
    let heading=running?t('Calculating transit times','대중교통 이동시간 계산 중'):saving?t('Saving transit times','대중교통 이동시간 저장 중'):t('Transit time results','대중교통 이동시간 조회 결과');
    const status=running?t(`${done} of ${active.movements.length} sections calculated`,`${active.movements.length}개 구간 중 ${done}개 계산됨`):saving?t('Applying times to your itinerary…','일정에 이동시간을 반영하고 있어요…'):active.stage==='save-error'?t('Calculated results have not been saved. Your previous times are kept.','계산 결과가 저장되지 않았습니다. 기존 시간은 유지됩니다.'):active.stage==='changed'?reason('changed'):t(`Updated ${success} · unavailable ${failed}`,`${success}개 구간 반영 · ${failed}개 구간 조회 불가`);
    internal=true;try{
      openModal(`${modalTop(heading,saving)}<p id="transitRefreshStatus" class="transit-refresh-status" role="status" aria-live="polite">${h(status)}</p>${running||saving?`<progress class="transit-refresh-progress" max="${active.movements.length}" value="${done}" aria-label="${t('Transit time lookup progress','대중교통 시간 조회 진행')}" ></progress>`:''}<ol class="transit-refresh-results">${active.movements.map(m=>{const r=active.results[m.index],state=!r?'pending':r.error?'failed':'success';return `<li class="${state}"><strong>${h(ctx.placeName(m.from.place))} → ${h(ctx.placeName(m.to.place))}</strong>${r? r.error?`<p>${h(reason(r.error))}</p><small>${t('Previous time kept','기존 시간 유지')}</small>`:`<b>${r.minutes}${t(' min','분')}</b><small>${r.method==='same-place'?t('Same place · no travel needed','같은 장소 · 이동 불필요'):r.method==='selected'?t('Recalculated the selected route','선택한 경로의 시간 재계산'):r.method==='replanned'?t('New transit route for the changed movement','변경된 구간의 대중교통 경로를 새로 찾음'):t('Fastest transit estimate','대중교통 예상 최단 경로')}</small><p>${h(r.services.map(s=>t(s.en||s.ko,s.ko)).join(' → '))}</p>`:`<p>${t('Waiting to calculate…','계산 대기 중…')}</p>`}${r&&['done','save-error'].includes(active.stage)?`<div class="row wrap">${!r.error&&r.kind?`<button type="button" data-refresh="map" data-id="${h(m.to.id)}" class="text-btn" ${active.stage==='save-error'?'disabled':''}>${t('Route map','경로 지도')}</button>`:''}<button type="button" data-refresh="directions" data-id="${h(m.to.id)}" class="text-btn">${t('Review in Directions','길찾기에서 확인')}</button></div>`:''}</li>`;}).join('')}</ol><p class="note">${t('Uses the chosen walking/wait settings. Traffic, live arrivals and current service hours are not connected. Saved route choices stay selected.','선택한 도보·대기 설정으로 계산한 예상치입니다. 정체·실시간 도착·운행시간은 반영하지 않습니다. 저장한 경로 선택은 유지합니다.')}</p><div class="row wrap transit-refresh-actions">${running?`<button type="button" data-refresh="cancel" class="secondary">${t('Cancel lookup','조회 취소')}</button>`:saving?'':active.stage==='save-error'?`<button type="button" data-refresh="retry-save" class="primary">${t('Retry saving','저장 다시 시도')}</button>`:`<button type="button" data-refresh="close" class="primary">${t('View itinerary','일정 보기')}</button>${failed||active.stage==='changed'?`<button type="button" data-refresh="retry" class="secondary">${t('Retry lookup','다시 조회')}</button>`:''}`}</div>`,{locked:saving});
      modal.classList.add('transit-refresh-modal');modal.scrollTop=scroll;
    }finally{internal=false;}
  }
  function cancel(){sequence++;stopGroup?.(Error('cancelled'));worker?.terminate();worker=null;if(job&&busy())job.stage='cancelled';}
  async function loadCommon(){if(!commonRequest)commonRequest=Promise.all(['metro-data.json','metro-times.json'].map(file=>fetch('./'+file+'?v=web-16').then(r=>{if(!r.ok)throw Error('data');return r.json();}))).catch(e=>{commonRequest=null;throw e;});return commonRequest;}
  async function loadBus(id){if(!buses.has(id)){const r=await fetch('./bus-'+id+'.json?v=web-16');if(!r.ok)throw Error('data');buses.set(id,await r.json());}return buses.get(id);}
  function receive(active,result){if(!current(active))return;active.results[result.index]=result;draw();}
  async function fallback(active,data,movements){
    for(const m of movements){await new Promise(r=>setTimeout(r,0));if(!current(active))return;let result;try{result={...calculateTransitMovement(data,m.from,m.to),index:m.index};}catch(e){result={id:m.to.id,from:m.from.id,index:m.index,error:e.message};}receive(active,result);}
  }
  function inWorker(active,network,times,bus,movements){
    return new Promise((resolve,reject)=>{let timer,settled=false,local;try{local=new Worker(new URL('./transit-refresh-worker.js?v=web-16',import.meta.url),{type:'module'});}catch{reject(Error('worker-error'));return;}worker=local;
      const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);local.terminate();if(worker===local)worker=null;stopGroup=null;error?reject(error):resolve();};stopGroup=finish;
      const deadline=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(Error('timeout')),30000);};deadline();
      local.onmessage=e=>{const message=e.data;if(!current(active)||message.requestId!==active.token)return;if(message.type==='result'){deadline();receive(active,message.result);}else if(message.type==='done')finish();else if(message.type==='error')finish(Error(message.error));};local.onerror=()=>finish(Error('worker-error'));
      try{local.postMessage({requestId:active.token,network,times,bus,movements});}catch{finish(Error('worker-error'));}
    });
  }
  async function commit(active){
    if(!current(active))return;if(!unchanged(active)){active.stage='changed';draw();return;}
    const results=active.results.filter(r=>r&&!r.error);if(!results.length){active.stage='done';draw();return;}
    active.stage='saving';draw();try{const saved=await ctx.onApply({...active,results});if(!current(active))return;active.stage=saved?'done':'save-error';draw();}catch(error){if(!current(active))return;active.stage=error.message==='changed'?'changed':'save-error';draw();}
  }
  async function start(target=''){
    if(busy())return;const day=ctx.getDay();if(!day||day.stops.length<2){toast(t('Add at least two places to calculate a journey.','장소를 두 곳 이상 추가하면 이동시간을 계산할 수 있어요.'));return;}
    const snapshot=structuredClone(day),movements=snapshot.stops.slice(1).map((to,i)=>({index:i,from:snapshot.stops[i],to})).filter(m=>!target||m.to.id===target);movements.forEach((m,i)=>m.index=i);
    if(!movements.length)return;const active={token:++sequence,tripID:ctx.getTripID(),dayID:day.id,target,before:JSON.stringify(day),movements,results:Array(movements.length),stage:'loading'};job=active;draw();
    try{
      const [network,times]=await loadCommon();if(!current(active))return;const groups=new Map();active.stage='calculating';
      for(const m of movements){
        try{
          if(groundMeters([m.from.place.latitude,m.from.place.longitude],[m.to.place.latitude,m.to.place.longitude])<5){receive(active,{...calculateTransitMovement(null,m.from,m.to),index:m.index});continue;}
          const parsed=readTransitNote(m.to.note),selected=hasSelectedTransit(parsed,m.from,m.to);let id;
          if(selected)id=busRegionID(parsed.plan.region);else{const inferred=inferAutoRegion(network,times,m.from.place,m.to.place);if(inferred.maxDistance>60000)throw Error('outside-region');id=busRegionID(inferred.region);}
          if(!['seoul','busan','daegu','daejeon','gwangju'].includes(id))throw Error('saved-route-invalid');if(!groups.has(id))groups.set(id,[]);groups.get(id).push(m);
        }catch(e){receive(active,{id:m.to.id,from:m.from.id,index:m.index,error:e.message});}
      }
      for(const [id,list]of groups){
        if(!current(active))return;
        try{
          const bus=await loadBus(id);if(!current(active))return;const data=mixedData(network,times,bus);
          if(typeof Worker==='function'){try{await inWorker(active,network,times,bus,list);}catch(e){if(!current(active))return;if(e.message==='worker-error')await fallback(active,data,list.filter(m=>!active.results[m.index]));else throw e;}}
          else await fallback(active,data,list);
        }catch(e){if(!current(active))return;for(const m of list)if(!active.results[m.index])receive(active,{id:m.to.id,from:m.from.id,index:m.index,error:e.message==='timeout'?'timeout':'data'});}
      }
      await new Promise(r=>setTimeout(r,0));await commit(active);
    }catch{if(!current(active))return;for(const m of movements)if(!active.results[m.index])active.results[m.index]={id:m.to.id,from:m.from.id,index:m.index,error:'data'};await commit(active);}
  }
  modal.addEventListener('click',e=>{if(!modal.classList.contains('transit-refresh-modal'))return;const el=e.target.closest('[data-refresh]');if(!el)return;const a=el.dataset.refresh;if(a==='cancel'){cancel();modal.close();}if(a==='close')modal.close();if(a==='retry')start(job.target);if(a==='retry-save')commit(job);if(a==='directions'){cancel();ctx.onDirections(el.dataset.id);}if(a==='map'){cancel();ctx.onMap(el.dataset.id);}});
  modal.addEventListener('close',()=>{if(!modal.open&&busy())cancel();});modal.addEventListener('tripflow:replace',()=>{if(!internal&&busy())cancel();});return {start};
}
