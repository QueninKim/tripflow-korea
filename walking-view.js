import {walkingRoutes} from './walking-routes.js?v=web-19';
import {walkingQuote} from './walking-core.js?v=web-19';
import {readTransitNote,transitStatus} from './transit-note.js?v=web-19';
import {groundMeters} from './metro-time.js?v=web-19';
import {createJourneyMap} from './journey-map.js?v=web-19';
export function createWalkingViewer(ctx){
  const {modal,t,h,openModal,modalTop}=ctx;let token=0,map;
  function render(from,to,route,saved){
    const quote=walkingQuote(route);openModal(`${modalTop(t('Walking route map','도보 경로 지도'))}<div class="saved-map-heading"><strong>${h(ctx.placeName(from.place))} → ${h(ctx.placeName(to.place))}</strong><span>${quote.minutes}${t(' min','분')} · ${Math.round(route.meters)}m${saved?t(' · saved route',' · 저장한 경로'):''}</span></div>${saved&&to.travelMinutes!==quote.minutes?`<p class="note">${t('Entered itinerary time','일정에 입력한 시간')}: ${to.travelMinutes}${t(' min','분')}</p>`:''}<p class="note">${t('Green line follows the queried pedestrian network. Pins show your places; the path starts/ends at nearby mapped access points.','초록색 선은 조회된 실제 보행길입니다. 핀은 장소 위치이며 보행길은 가까운 연결 지점에서 시작·종료합니다.')}</p><div class="network-map-frame saved-journey-frame"><div id="walkingRouteMap" class="journey-map"></div><div class="network-map-buttons"><button type="button" data-walk-map="zoom-in" aria-label="${t('Zoom walking map in','도보 지도 확대')}">＋</button><button type="button" data-walk-map="zoom-out" aria-label="${t('Zoom walking map out','도보 지도 축소')}">−</button><button type="button" data-walk-map="fit">${t('Whole route','전체 경로')}</button></div></div><p class="note">${t('Estimated pedestrian route; check entrances, signals and temporary closures on site.','보행 경로와 시간은 예상치입니다. 실제 출입구·신호·임시통제를 확인해주세요.')} <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener">FOSSGIS · OSRM ↗</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">${t('Fix the map','지도 수정')} ↗</a></p>`);
    modal.classList.add('network-modal','walking-view-modal');map=createJourneyMap({element:modal.querySelector('#walkingRouteMap'),quote,fromPlace:from.place,toPlace:to.place,t,placeName:ctx.placeName,location:ctx.location,onFromCurrent:fix=>ctx.startFromCurrent(to.place,fix)});modal.scrollTop=0;
  }
  function preview(m,route){token++;map?.destroy();render(m.from,m.to,route,false);}
  async function openSaved(target){
    const request=++token,d=ctx.getDay(),to=d?.stops.find(s=>s.id===target),i=d?.stops.indexOf(to),from=d?.stops[i-1],parsed=readTransitNote(to?.note);
    openModal(`${modalTop(t('Walking route map','도보 경로 지도'))}<p role="status">${t('Opening saved pedestrian path…','저장한 보행 경로를 불러오는 중…')}</p>`);modal.classList.add('walking-view-modal');
    try{if(parsed.kind!=='walking'||!from||transitStatus(parsed,from,to)!=='active')throw Error('stale');const route=await walkingRoutes.get(parsed.plan);if(request!==token||!modal.open||!modal.classList.contains('walking-view-modal'))return;
      if(groundMeters(route.from,[from.place.latitude,from.place.longitude])>1||groundMeters(route.to,[to.place.latitude,to.place.longitude])>1)throw Error('stale');render(from,to,route,true);
    }catch{if(request!==token||!modal.open||!modal.classList.contains('walking-view-modal'))return;openModal(`${modalTop(t('Walking route map','도보 경로 지도'))}<p role="alert">${t('The exact saved pedestrian path is unavailable on this device or its endpoints changed. Look up this movement again. No straight line has been substituted.','저장한 보행 경로가 이 기기에 없거나 출발·도착지가 바뀌었습니다. 이 구간을 다시 조회해주세요.')}</p><button type="button" data-walk-map="retry" data-id="${h(target)}" class="primary">${t('Look up this section','이 구간 다시 조회')}</button>`);modal.classList.add('walking-view-modal');}
  }
  modal.addEventListener('click',e=>{if(!modal.classList.contains('walking-view-modal'))return;const el=e.target.closest('[data-walk-map]');if(!el)return;const a=el.dataset.walkMap;if(a==='zoom-in')map?.zoom(1.6);if(a==='zoom-out')map?.zoom(1/1.6);if(a==='fit')map?.fit();if(a==='retry')ctx.onLookup(el.dataset.id);});
  modal.addEventListener('tripflow:replace',()=>{map?.destroy();map=null;});modal.addEventListener('close',()=>{if(!modal.open){token++;map?.destroy();map=null;}});return {preview,openSaved};
}
