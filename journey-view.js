import {readTransitNote,transitStatus} from './transit-note.js?v=web-18';
import {mixedData,busRegionID,estimateMixedTime,validateMixedPlan} from './mixed-core.js?v=web-18';
import {quoteAutoRoute,validateAutoPlan} from './auto-core.js?v=web-18';
import {validateBusPlan} from './bus-core.js?v=web-18';
import {validateMetroPlan} from './metro-core.js?v=web-18';
import {createJourneyMap,journeyMapLegend,journeyMapNote} from './journey-map.js?v=web-18';
export function createJourneyViewer(ctx){
  const {t,h,modal,modalTop,openModal}=ctx;let request=0,map;
  const label=s=>t(s.en||s.ko,s.ko);
  async function open(target){
    const token=++request;map?.destroy();map=null;
    const day=ctx.getDay(),stop=day?.stops.find(s=>s.id===target),parsed=readTransitNote(stop?.note),origin=day?.stops.find(s=>s.id===parsed.plan?.from),end=day?.stops.find(s=>s.id===parsed.plan?.to);
    if(parsed.kind==='walking'||parsed.kind==='auto'&&parsed.plan.routeMode==='walking'){ctx.onSavedWalking(target);return;}
    if(!parsed.plan){ctx.toast(t('No saved route for this movement.','저장된 이동경로가 없습니다.'));return;}
    openModal(`${modalTop(t('Saved route map','저장한 경로 지도'))}<p role="status">${t('Opening your selected route…','선택한 경로를 불러오는 중…')}</p>`);modal.classList.add('network-modal','journey-view-modal');
    try{
      const id=busRegionID(parsed.plan.region),files=['metro-data.json','metro-times.json',`bus-${id}.json`],values=await Promise.all(files.map(file=>fetch(new URL('./'+file+'?v=web-18',import.meta.url)).then(r=>{if(!r.ok)throw Error('data');return r.json();})));
      if(token!==request||!modal.open||!modal.classList.contains('journey-view-modal'))return;
      const data=mixedData(...values),plan=parsed.plan,fromPlace=origin?.place,toPlace=end?.place;let quote;
      if(parsed.kind==='auto'){validateAutoPlan(data,plan);if(!fromPlace||!toPlace)throw Error('endpoints');quote=quoteAutoRoute(data,plan.legs,{fromPlace,toPlace,options:plan.timing?.options});}
      else{
        let legs=plan.legs;
        if(parsed.kind==='bus'){validateBusPlan(data.bus,plan);legs=legs.map(l=>['b',...l]);}
        else if(parsed.kind==='subway'){validateMetroPlan(data.network,plan);legs=legs.map(l=>['s',...l]);}
        else validateMixedPlan(data,plan);
        quote=estimateMixedTime(data,legs,{fromPlace,toPlace,options:plan.timing?.options});
      }
      const state=transitStatus(parsed,day.stops[day.stops.indexOf(stop)-1],stop);
      openModal(`${modalTop(t('Saved route map','저장한 경로 지도'))}<div class="saved-map-heading"><strong>${h(fromPlace?ctx.placeName(fromPlace):label(quote.details[0].path[0]))} → ${h(toPlace?ctx.placeName(toPlace):label(quote.details.at(-1).path.at(-1)))}</strong>${Number.isInteger(stop.travelMinutes)?`<span>${stop.travelMinutes}${t(' min in itinerary','분 · 일정에 저장됨')}</span>`:''}</div>${state!=='active'?`<p class="metro-warning">${t('The itinerary or travel mode changed. This map shows the saved route.','일정이나 이동수단이 바뀌었습니다. 지도에는 저장했던 경로가 표시됩니다.')}</p>`:''}${journeyMapLegend(t)}<div class="network-map-frame saved-journey-frame"><div id="savedJourneyMap" class="journey-map"></div><div class="network-map-buttons"><button type="button" data-journey="zoom-in" aria-label="${t('Zoom in','경로 지도 확대')}">＋</button><button type="button" data-journey="zoom-out" aria-label="${t('Zoom out','경로 지도 축소')}">−</button><button type="button" data-journey="fit">${t('Whole route','전체 경로')}</button></div></div><p class="note journey-map-note">${journeyMapNote(t)}</p><div class="saved-map-legs">${quote.details.map((d,i)=>`<button type="button" data-journey="leg" data-index="${i}" style="--leg-color:${d.kind==='bus'?'#2368dc':'#8c39c7'}"><b>${i+1}. ${h(label(d))}</b><span>${h(label(d.path[0]))} → ${h(label(d.path.at(-1)))}</span><small>${t('Show this section','이 구간 지도 보기')} ⌖</small></button>`).join('')}</div>`);
      modal.classList.add('network-modal','journey-view-modal');
      map=createJourneyMap({location:ctx.location,onFromCurrent:fix=>ctx.startFromCurrent(toPlace,fix),element:modal.querySelector('#savedJourneyMap'),region:id,quote,fromPlace,toPlace,t,placeName:ctx.placeName,onStation:p=>ctx.toast(p.name?ctx.placeName(p):label(p))});modal.scrollTop=0;
    }catch{
      if(token!==request||!modal.open||!modal.classList.contains('journey-view-modal'))return;
      openModal(`${modalTop(t('Saved route map','저장한 경로 지도'))}<p role="alert">${t('This saved route could not load. Check your connection or review its sections in Directions.','저장된 경로를 불러오지 못했습니다. 연결을 확인하거나 길찾기에서 경로를 다시 확인해주세요.')}</p>`);modal.classList.add('journey-view-modal');
    }
  }
  modal.addEventListener('click',e=>{if(!modal.classList.contains('journey-view-modal'))return;const el=e.target.closest('[data-journey]');if(!el)return;const action=el.dataset.journey;if(action==='zoom-in')map?.zoom(1.6);if(action==='zoom-out')map?.zoom(1/1.6);if(action==='fit')map?.fit();if(action==='leg'){map?.focusLeg(Number(el.dataset.index));modal.querySelector('#savedJourneyMap')?.scrollIntoView({block:'center',behavior:'smooth'});}});
  modal.addEventListener('tripflow:replace',()=>{map?.destroy();map=null;});
  modal.addEventListener('close',()=>{if(!modal.open){request++;map?.destroy();map=null;}});
  return {open};
}
