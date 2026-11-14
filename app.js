import {createTransitRefresher} from './transit-refresh.js?v=web-16';
import {applyTransitResults} from './transit-refresh-core.js?v=web-16';
import {createLocationService} from './current-location.js?v=web-16';
import {createPlaceMapViewer} from './place-map.js?v=web-16';
import {uuid,now,toDate,escapeHTML as h,arrivals,clock,validState,invalidate,sampleState,budgetCurrencies,budgetAmount,convertedBudget,budgetTotal,convertedExpense,expenseRateKey,expenseRateEntries} from './core.js?v=web-16';

import {createMetroPlanner} from './metro.js?v=web-16';
import {createJourneyViewer} from './journey-view.js?v=web-16';
import {createAutoPlanner} from './auto.js?v=web-16';
import {autoSummary,sameAutoPlace} from './auto-core.js?v=web-16';
import {createMixedPlanner} from './mixed.js?v=web-16';
import {createBusPlanner} from './bus.js?v=web-16';
import {readTransitNote,mergeTransitNote,transitStatus,isAutoTransitTime,setTransitManualTime} from './transit-note.js?v=web-16';

const VERSION='web-16';
const native=!!window.webkit?.messageHandlers?.tripflow;
const bridge=(command,payload={})=>window.webkit.messageHandlers.tripflow.postMessage({command,...payload});
let nativeFeatures={};
const currentLocation=createLocationService({native,nativeSupported:()=>nativeFeatures.location===true,nativeRequest:()=>bridge('currentLocation'),nativeStop:()=>bridge('stopLocation')});
const $=s=>document.querySelector(s);
const root=$('#app'),modal=$('#modal');
let data,catalog=[],tab='plan',dayIndex=0,query='',area='대한민국',results=[],searching=false,searchError='',searched=false;
let generation=0,debounce,toastTimer,saveQueue=Promise.resolve(),saveFailed=false,revision=0;
let lastSearchAt=0,abortSearch,activeSearchKey;
const cache=new Map();
let budgetDraft=null,budgetTimer;
let expenseDraft=null,expenseTimer;
const rateRequests=new Map();
const areas=[['대한민국','All Korea'],['서울','Seoul'],['부산','Busan'],['제주','Jeju'],['강원','Gangwon'],['경기','Gyeonggi'],['인천','Incheon'],['대구','Daegu'],['대전','Daejeon'],['광주','Gwangju'],['울산','Ulsan'],['세종','Sejong'],['충북','Chungbuk'],['충남','Chungnam'],['전북','Jeonbuk'],['전남','Jeonnam'],['경북','Gyeongbuk'],['경남','Gyeongnam']];
const categories=[['관광명소','Attractions','⌂'],['음식점','Restaurants','♧'],['카페','Cafés','☕'],['숙소','Hotels','⌑'],['박물관','Museums','▥'],['공원','Parks','♧'],['전통시장','Markets','▤'],['해변','Beaches','≈']];
const t=(en,ko)=>data?.language==='ko'?ko:en;
const trip=()=>data.trips.find(x=>x.id===data.selectedTripID)||data.trips[0];
const day=()=>trip()?.days[dayIndex]||trip()?.days[0];
const krw=n=>'₩'+new Intl.NumberFormat('en-US').format(n);
const title=tr=>tr.isSample&&tr.title==='A little Seoul escape'?t(tr.title,'가볍게 떠나는 서울 여행'):tr.title;
const placeName=p=>data.language==='ko'&&p.koreanName?p.koreanName:p.name;
const cityName=c=>data.language==='ko'?({'Seoul':'서울','Busan':'부산','Jeju':'제주','Gyeongju':'경주','Jeonju':'전주','Gangneung':'강릉'}[c]||c):c;
const catName=c=>data.language==='ko'?({'Culture':'문화','Nature':'자연','Food':'음식','View':'전망','Place':'장소','Food & drink':'식비·음료','Transport':'교통','Stay':'숙박','Shopping':'쇼핑','Activities':'체험·관광','Other':'기타'}[c]||c):c;
const modeName=m=>({'transit':t('Transit','대중교통'),'walking':t('Walk','도보'),'driving':t('Drive','자동차')}[m]);
const sourceName=s=>({'sample':t('Sample','예시'),'manual':t('Entered','직접 입력'),'apple':t('Apple Maps','Apple 지도'),'gateway':t('Route service','경로 조회')}[s]||'');
const durationLabel=s=>isAutoTransitTime(s)?t('Auto estimate','자동 예상'):sourceName(s.durationSource);
const icon=c=>({'Culture':'▥','Nature':'♧','Food':'☕','View':'⌁'}[c]||'⌖');
const pill=text=>`<span class="pill">${h(text)}</span>`;
const btn=(action,text,cls='secondary',extra='')=>`<button type="button" class="${cls}" data-action="${action}" ${extra}>${text}</button>`;
function homeMoney(n){const rate=data.rates[data.homeCurrency];return rate?new Intl.NumberFormat(data.language==='ko'?'ko-KR':'en-US',{style:'currency',currency:data.homeCurrency}).format(n/rate.krwPerUnit):t('Load a reference exchange rate','기준환율을 조회해주세요');}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function savedLabel(text){const el=$('#save-status');if(el)el.textContent=text;}
async function save(){
  revision++;
  const snapshot=JSON.stringify(data);
  savedLabel(t('Saving…','저장 중…'));
  const task=saveQueue.catch(()=>{}).then(async()=>{if(native)await bridge('save',{data:JSON.parse(snapshot)});else localStorage.setItem('tripflow-v1',snapshot);});
  saveQueue=task;
  try{await task;saveFailed=false;savedLabel(t('Saved on this device','이 기기에 저장됨'));return true;}
  catch{saveFailed=true;savedLabel(t('Not saved · retry in Essentials','저장 안 됨 · 여행 도구에서 재시도'));toast(t('Could not save. Keep this screen open and retry.','저장하지 못했습니다. 화면을 닫지 말고 다시 저장해주세요.'));return false;}
}
function render(){
  document.documentElement.lang=data.language;
  const tabs=[['plan','⌁','My trip','내 여행'],['explore','⌕','Explore','장소 찾기'],['budget','▱','Budget','여행 경비'],['tools','⌑','Essentials','여행 도구']];
  root.innerHTML=`${navigator.onLine?'':`<div class="offline-banner">${t('Offline · your saved trip is still here','오프라인 · 저장된 여행은 볼 수 있어요')}</div>`}
  <header class="app-header"><div class="row"><span class="brandmark" aria-hidden="true">↗</span><div class="wordmark">${t('TripFlow Korea','트립플로우 코리아')}<small>YOUR KOREA, AT YOUR PACE</small></div></div><div class="header-actions">${btn('language','◎','icon-btn',`aria-label="Language / 언어" id="languageButton"`)}${btn('trips','⇄','icon-btn',`aria-label="${t('Switch trips','여행 선택')}"`)}</div></header>
  <main>${({plan:planPage,explore:explorePage,budget:budgetPage,tools:toolsPage}[tab])()}<div class="save-status" id="save-status">${saveFailed?t('Not saved · retry in Essentials','저장 안 됨 · 여행 도구에서 재시도'):t('Saved on this device','이 기기에 저장됨')}</div></main>
  <nav class="tabs" aria-label="${t('Main navigation','주 메뉴')}">${tabs.map(([id,i,en,ko])=>`<button class="${tab===id?'active':''}" data-action="tab" data-id="${id}" ${tab===id?'aria-current="page"':''}><span class="tab-icon" aria-hidden="true">${i}</span>${t(en,ko)}</button>`).join('')}</nav>`;
  root.removeAttribute('aria-busy');
}
function subwayCard(s,previous){
  const parsed=readTransitNote(s.note);if(!parsed.plan)return '';
  const state=transitStatus(parsed,previous,s);
  return `<div class="saved-metro ${state}" role="note"><strong>↔ ${parsed.kind==='auto'?t('Automatically suggested route','자동 추천 경로'):parsed.kind==='mixed'?t('My bus + subway journey','내 버스+지하철 경로'):parsed.kind==='bus'?t('My bus route','내 버스 경로'):t('My subway route','내 지하철 경로')}</strong>${state==='stale'?`<p class="metro-warning">${t('Itinerary order changed · review this route','일정 순서 변경 · 경로를 다시 확인해주세요')}</p>`:state==='inactive'?`<p class="metro-warning">${t('Another travel mode is selected','다른 이동수단이 선택되어 있어요')}</p>`:''}<p>${h(parsed.summary)}</p>${btn('routeMap',t('⌖ View route map','⌖ 경로 지도 보기'),'saved-route-map-btn',`data-id="${s.id}"`)}</div>`;
}
async function saveTransitRoute(kind,draft){
  const d=day(),i=d?.stops.findIndex(s=>s.id===draft.target);
  if(d?.id!==draft.dayID||trip()?.id!==draft.tripID||i<0||(!draft.remove&&i<1))throw Error('changed');
  const s=d.stops[i],parsed=readTransitNote(s.note),previous=structuredClone(s),clearAuto=draft.remove&&isAutoTransitTime(s);
  if(draft.remove&&parsed.kind!==kind)throw Error('changed');
  s.note=mergeTransitNote(s.note,draft.remove?null:draft.plan,draft.summary,kind);
  if(!draft.remove){s.mode='transit';s.durationSource='manual';if(draft.minutes===null)delete s.travelMinutes;else s.travelMinutes=draft.minutes;}else if(clearAuto){delete s.travelMinutes;s.durationSource='manual';}
  if(await save()){modal.close();render();toast(t(draft.remove?'Transit route removed':'Transit route saved',draft.remove?'대중교통 경로를 삭제했어요':'대중교통 경로를 저장했어요'));if(!draft.remove)setTimeout(()=>journeyViewer.open(s.id),0);return true;}
  Object.assign(s,previous);if(previous.travelMinutes==null)delete s.travelMinutes;return false;
}
const transitContext={location:currentLocation,startFromCurrent:(to,fix)=>autoPlanner.open('',{to,fromFix:fix,useCurrent:!fix}),t,h,btn,modalTop,openModal,modal,toast,getDay:day,getCity:()=>trip()?.city||'',getTripID:()=>trip()?.id,placeName,getRouteKind:id=>readTransitNote(day()?.stops.find(s=>s.id===id)?.note).kind};
const journeyViewer=createJourneyViewer(transitContext);
const metroPlanner=createMetroPlanner({...transitContext,onSave:draft=>saveTransitRoute('subway',draft)});
const busPlanner=createBusPlanner({...transitContext,onSave:draft=>saveTransitRoute('bus',draft)});
const mixedPlanner=createMixedPlanner({...transitContext,metroPlanner,busPlanner,onSave:draft=>saveTransitRoute('mixed',draft)});
async function saveAutomaticJourney(draft){
  const d=day();if(d?.id!==draft.dayID||trip()?.id!==draft.tripID)throw Error('changed');
  if(!draft.from||!draft.to||!Number.isInteger(draft.route.quote.minutes)||draft.route.quote.minutes<1||draft.route.quote.minutes>2880)throw Error('invalid-time');
  const before=structuredClone(d.stops);let origin,destination,added=[];
  const cleanPlace=p=>({id:p.id||uuid(),name:String(p.name),koreanName:p.koreanName||'',address:p.address||'',latitude:p.latitude,longitude:p.longitude,category:p.category||'Place'});
  if(draft.append){origin=d.stops.at(-1);if(!origin||!sameAutoPlace(origin.place,draft.from)){origin={id:uuid(),place:cleanPlace(draft.from),stayMinutes:0,mode:'transit',durationSource:'manual',note:''};added.push(origin);}destination={id:uuid(),place:cleanPlace(draft.to),stayMinutes:60,mode:'transit',durationSource:'manual',note:''};added.push(destination);}
  else {const i=d.stops.findIndex(s=>s.id===draft.target);if(i<1||!sameAutoPlace(d.stops[i-1].place,draft.from)||!sameAutoPlace(d.stops[i].place,draft.to))throw Error('changed');origin=d.stops[i-1];destination=d.stops[i];}
  const plan={...draft.base,from:origin.id,to:destination.id},summary=autoSummary(draft.routeData,plan),note=mergeTransitNote(destination.note,plan,summary,'auto');
  destination.note=note;destination.mode=plan.routeMode;destination.travelMinutes=draft.route.quote.minutes;destination.durationSource='manual';d.stops.push(...added);
  if(await save()){modal.close();render();toast(t('Suggested route saved to your itinerary','자동 추천 경로를 일정에 저장했어요'));setTimeout(()=>journeyViewer.open(destination.id),0);return true;}
  d.stops=before;return false;
}
async function searchRoutePlaces(term){
  const key='auto-place:'+data.language+':'+term;if(cache.has(key))return cache.get(key);
  let places;if(native){let deadline;try{places=await Promise.race([bridge('search',{query:term,area:'대한민국'}),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('timeout')),14000);})]);}catch{await bridge('cancelSearch').catch(()=>{});}finally{clearTimeout(deadline);}}
  if(!places){const u=new URL('https://photon.komoot.io/api/');u.search=new URLSearchParams({q:term,countrycode:'KR',bbox:'124,33,132,39',limit:'20',lang:data.language==='ko'?'default':'en'});const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),14000);let body;try{const r=await fetch(u,{signal:controller.signal});if(!r.ok)throw Error('search');body=await r.json();}finally{clearTimeout(deadline);}places=body.features.filter(f=>f.properties.name&&f.geometry.type==='Point'&&f.geometry.coordinates[0]>=124&&f.geometry.coordinates[0]<=132&&f.geometry.coordinates[1]>=33&&f.geometry.coordinates[1]<=39).map(f=>({id:uuid(),name:f.properties.name,koreanName:/[가-힣]/.test(f.properties.name)?f.properties.name:'',address:[f.properties.state,f.properties.city,f.properties.street,f.properties.housenumber].filter(Boolean).join(' '),longitude:f.geometry.coordinates[0],latitude:f.geometry.coordinates[1],category:'Place'}));}
  cache.set(key,places);if(cache.size>20)cache.delete(cache.keys().next().value);return places;
}
const autoPlanner=createAutoPlanner({...transitContext,getPlaces:()=>[...(trip()?.days.flatMap(d=>d.stops.map(s=>s.place))||[]),...catalog],searchPlaces:searchRoutePlaces,onSave:draft=>saveAutomaticJourney(draft),onRemove:draft=>saveTransitRoute('auto',draft)});
const placeMapViewer=createPlaceMapViewer({...transitContext,onDirections:(to,fix)=>autoPlanner.open('',{to,fromFix:fix,useCurrent:!fix})});
async function applyRefreshedTransit(active){
  const d=day();if(trip()?.id!==active.tripID||d?.id!==active.dayID||JSON.stringify(d)!==active.before)throw Error('changed');
  const before=d.stops;d.stops=applyTransitResults(d,active.results).stops;
  if(await save()){render();return true;}d.stops=before;render();return false;
}
const transitRefresher=createTransitRefresher({...transitContext,onApply:applyRefreshedTransit,onDirections:id=>autoPlanner.open(id),onMap:id=>journeyViewer.open(id)});
function invalidateTransitDay(d){invalidate(d);for(const s of d.stops)s.note=setTransitManualTime(s.note,null);}
function planPage(){
  const tr=trip();
  if(!tr)return `<div class="intro"><div class="eyebrow">YOUR NEXT CHAPTER</div><h1>${t('Make room for Korea.','한국 여행을 시작해볼까요?')}</h1></div><div class="empty"><h2>${t('A trip of your own','나만의 여행')}</h2><p>${t('Give your trip a name, then collect the places you want to go.','여행 이름을 정하고 가고 싶은 장소를 모아보세요.')}</p>${btn('newTrip',t('Create a trip','여행 만들기'),'primary')}</div>`;
  if(dayIndex>=tr.days.length)dayIndex=0;
  const d=day(),times=arrivals(d),spent=tr.expenses.reduce((s,e)=>s+e.amountKRW,0);
  return `<div class="trip-heading"><div><h1 style="margin-top:11px">${h(title(tr))}</h1><div class="row wrap trip-meta">${pill(cityName(tr.city))}${pill(toDate(tr.startDate).toLocaleDateString(data.language==='ko'?'ko-KR':'en-US',{month:'short',day:'numeric'}))}${pill(tr.days.length+t(' days','일'))}</div></div></div>
  <div class="day-tabs" aria-label="${t('Travel days','여행 날짜')}">${tr.days.map((d,i)=>btn('day',t('Day ','')+(i+1)+t('','일차'),i===dayIndex?'active':'',`data-index="${i}"`)).join('')}</div>
  <div class="plan-layout"><section><div class="row between"><h2>${t('Today, at your pace.','오늘, 나의 속도로.')}</h2>${btn('dayStart',clock(d.startMinutes),'text-btn',`aria-label="${t('Change start time','시작 시간 변경')}"`)}</div><div class="itinerary">${d.stops.length?d.stops.map((s,i)=>`<article class="stop"><div class="time">${clock(times[i])}</div><div class="panel">${i?`<div class="route-label">${h(modeName(s.mode))} · ${s.travelMinutes==null?t('Time not set','이동시간 미정'):s.travelMinutes+t(' min','분')+' · '+h(durationLabel(s))}</div>`:''}<div class="stop-title"><button data-action="editStop" data-id="${s.id}">${h(placeName(s.place))}</button><span class="muted">${i+1}</span></div><p class="address muted">${h(s.place.address)}</p><div class="row wrap">${pill(t('Stay ','체류 ')+s.stayMinutes+t(' min','분'))}${readTransitNote(s.note).note?`<small>${h(readTransitNote(s.note).note)}</small>`:''}</div>${subwayCard(s,d.stops[i-1])}<div class="stop-tools">${btn('editStop',t('Edit','수정'),'text-btn',`data-id="${s.id}"`)}${btn('stopMap',t('Map','지도 보기'),'text-btn',`data-id="${s.id}"`)}${i||readTransitNote(s.note).kind==='auto'?btn('route',t('Directions','길찾기'),'route-search-btn',`data-id="${s.id}"`):''}${i?btn('refreshRoutes',t('Time for this leg','이 구간 시간'),'text-btn',`data-id="${s.id}" aria-label="${t('Calculate transit time','대중교통 시간 조회')} · ${h(placeName(d.stops[i-1].place))} → ${h(placeName(s.place))}"`):''}${i||readTransitNote(s.note).kind==='mixed'?btn('mixed',t('Edit sections','직접 조합'),'text-btn',`data-id="${s.id}"`):''}${i||readTransitNote(s.note).kind==='bus'?btn('bus',t('Bus map','버스 노선도'),'text-btn',`data-id="${s.id}"`):''}${i||readTransitNote(s.note).plan?btn('subway',t('Subway map','지하철 노선도'),'text-btn',`data-id="${s.id}"`):''}${i?btn('moveUp','↑','text-btn',`data-id="${s.id}" aria-label="${t('Move earlier','앞으로 이동')}"`):''}</div></div></article>`).join(''):`<div class="empty"><h3>${t('The day is yours.','아직 비어 있는 하루예요.')}</h3><p>${t('Start with a place that catches your eye.','마음이 가는 장소부터 추가해보세요.')}</p></div>`}</div><div class="row wrap" style="margin-top:20px">${btn('explore',t('＋ Add a place','＋ 장소 추가'),'primary')}${btn('tripMap',t('⌖ See map','⌖ 지도 보기'))}${btn('route',t('Search directions','이동경로 검색'),'primary')}${btn('mixed',t('Build sections','구간 직접 조합'))}${btn('subway',t('Subway maps','지하철 노선도'))}${btn('bus',t('Bus maps','버스 노선도'))}${btn('refreshRoutes',t('Update travel times','이동시간 조회'),'text-btn')}</div><p class="note" style="margin-top:13px">${t('A dash means travel time is unknown. Sample times are labelled. Update travel times calculates transit for this day. Saved route choices are kept, and estimated times update the itinerary.','— 표시는 이동시간 미정입니다. 예시 시간은 별도 표시됩니다. 이동시간 조회를 누르면 이날 각 구간의 대중교통 예상시간을 계산합니다. 저장한 경로는 유지하고 이후 일정 시각도 반영합니다.')}</p></section>
  <aside class="plan-aside"><div class="panel summary-card"><div class="eyebrow">${t('ROOM TO EXPLORE','더 누릴 수 있는 여행')}</div><h2>${krw(tr.budgetKRW-spent)}</h2><small>${t('left in your trip budget','남은 여행 예산')} · ${h(homeMoney(tr.budgetKRW-spent))}</small><div style="margin-top:17px">${btn('budget',t('View budget →','경비 보기 →'),'text-btn',`style="color:white"`)}</div></div><div class="panel tip-card"><div class="eyebrow">A GOOD DAY IN KOREA</div><h3 style="margin-top:12px">${t('Leave a little unplanned.','계획 사이에 여유를 두세요.')}</h3><p>${t('A side street, a market stall, one more coffee. The best part might be between your stops.','골목길, 시장 구경, 커피 한 잔. 여행의 즐거움은 일정 사이에 숨어 있을지도 몰라요.')}</p></div></aside></div><div class="row wrap" style="margin-top:28px">${btn('share',t('Share itinerary','일정 공유'),'text-btn')}${btn('editTrip',t('Trip settings','여행 설정'),'text-btn')}</div>`;
}
function placeCard(p,live=false){return `<button class="place-card" data-action="place" data-id="${h(p.id)}" ${live?'data-live="true"':''}><span class="place-icon" aria-hidden="true">${icon(p.category)}</span><span><strong>${h(placeName(p))}</strong>${p.koreanName&&p.koreanName!==p.name?`<small>${h(data.language==='ko'?p.name:p.koreanName)}</small>`:''}<small>${h(p.address)}</small></span><span class="add" aria-hidden="true">⊕</span></button>`;}
function explorePage(){
  return `<div class="intro"><div class="eyebrow">FOLLOW YOUR CURIOSITY</div><h1>${t('Where to next?','다음은 어디로 갈까요?')}</h1><p>${t('Palaces, cafés, quiet corners. Search a place, an address or a little inspiration.','여행지부터 카페, 동네 골목까지. 장소명이나 주소를 크게, 편하게 검색하세요.')}</p></div><form id="search-form" class="search-box"><span aria-hidden="true" style="font-size:24px;color:var(--teal)">⌕</span><input id="placeSearchField" name="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="${t('Place, address, café…','장소명, 주소, 카페…')}" aria-label="${t('Search places','장소 검색')}" value="${h(query)}"><button type="submit" aria-label="${t('Search','검색')}">→</button></form><div class="search-options row between"><label><span class="sr-only">${t('Area','지역')}</span><select id="searchAreaPicker" aria-label="${t('Search area','검색 지역')}">${areas.map(([ko,en])=>`<option value="${ko}" ${ko===area?'selected':''}>${t(en,ko)}</option>`).join('')}</select></label><small>${native?t('Searches as you type','입력하면 자동 검색'):t('Press Search to explore','검색 버튼을 눌러 찾아보세요')}</small></div><div class="chips">${categories.map(([ko,en])=>btn('category',t(en,ko),query===t(en,ko)?'active':'',`data-query="${t(en,ko)}"`)).join('')}</div><div id="search-results">${searchResults()}</div><p class="note" style="margin-top:20px">${native?t('Live Apple Maps results, with Photon / OpenStreetMap as a fallback. Search goes beyond the ten offline starter places.','기본 장소 10곳 외에도 Apple 지도에서 검색하며, 조회가 어려우면 Photon / © OpenStreetMap 기여자 검색으로 연결합니다.'):t('Web search: Photon / © OpenStreetMap contributors. iPhone app search: Apple Maps.','웹 검색: Photon / © OpenStreetMap 기여자. 아이폰 앱 검색: Apple 지도.')}</p>`;
}
function searchResults(){
  const starter=catalog.filter(p=>!query||`${p.name} ${p.koreanName} ${p.address}`.toLowerCase().includes(query.toLowerCase()));
  return `${searching?`<p class="status" role="status">${t('Searching the map…','지도에서 찾는 중…')}</p>`:''}${searchError?`<p class="status error" role="status">${h(searchError)}</p>`:''}${results.length?`<div class="section-heading"><span class="eyebrow">${t('MAP SEARCH RESULTS','지도 검색 결과')}</span><small id="liveResultCount">${results.length}${t(' places','곳')}</small></div><div class="place-grid">${results.map(p=>placeCard(p,true)).join('')}</div>`:searched&&!searching&&!searchError?`<p class="status">${t('No results. Try a specific name, address or another area.','결과가 없습니다. 장소명·주소를 구체적으로 입력하거나 지역을 바꿔보세요.')}</p>`:''}${starter.length?`<div class="section-heading"><span class="eyebrow">${t('OFFLINE STARTER PLACES','오프라인 기본 장소')}</span><small>${starter.length}${t(' places','곳')}</small></div><div class="place-grid">${starter.map(p=>placeCard(p)).join('')}</div>`:''}`;
}
function updateSearch(){const el=$('#search-results');if(el)el.innerHTML=searchResults();}
async function search(){
  clearTimeout(debounce);const term=query.trim();const key=area+'|'+term+'|'+data.language;
  if(searching&&activeSearchKey===key)return;
  const token=++generation;
  abortSearch?.abort();
  if(!term){results=[];searching=false;searched=false;searchError='';updateSearch();return;}
  if(cache.has(key)){results=cache.get(key);searched=true;searching=false;updateSearch();return;}
  if(!native&&Date.now()-lastSearchAt<1500){searchError=t('Please wait a moment before searching again.','잠시 후 다시 검색해주세요.');updateSearch();return;}
  lastSearchAt=Date.now();activeSearchKey=key;searching=true;searchError='';results=[];updateSearch();
  try{
    let places;
    if(native){
      let deadline;
      try{places=await Promise.race([bridge('search',{query:term,area}),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('timeout')),14000);})]);}
      catch{if(token!==generation)return;await bridge('cancelSearch').catch(()=>{});places=await photonSearch(term);}
      finally{clearTimeout(deadline);}
    }
    else places=await photonSearch(term);
    if(token!==generation)return;
    results=places;cache.set(key,places);if(cache.size>20)cache.delete(cache.keys().next().value);
  }catch(e){if(token!==generation||e.name==='AbortError')return;searchError=t('Map search is unavailable. Try again, or choose an offline place.','지도 검색을 사용할 수 없습니다. 다시 시도하거나 기본 장소를 선택해주세요.');}
  finally{if(token===generation){activeSearchKey=null;searching=false;searched=true;updateSearch();}}
}
async function photonSearch(term){
  abortSearch=new AbortController();
  const u=new URL('https://photon.komoot.io/api/');
  u.search=new URLSearchParams({q:(area==='대한민국'?'':area+' ')+term,countrycode:'KR',bbox:'124,33,132,39',limit:'20',lang:data.language==='ko'?'default':'en'});
  const response=await fetch(u,{signal:abortSearch.signal});if(!response.ok)throw Error('search');
  const body=await response.json();
  return body.features.filter(f=>f.properties.name&&f.geometry.type==='Point'&&f.geometry.coordinates[0]>=124&&f.geometry.coordinates[0]<=132&&f.geometry.coordinates[1]>=33&&f.geometry.coordinates[1]<=39).map(f=>({id:uuid(),name:f.properties.name,koreanName:/[가-힣]/.test(f.properties.name)?f.properties.name:'',address:[f.properties.state,f.properties.city,f.properties.street,f.properties.housenumber].filter(Boolean).join(' '),longitude:f.geometry.coordinates[0],latitude:f.geometry.coordinates[1],category:'Place'}));
}
function budgetPage(){
  const tr=trip();if(!tr)return `<div class="empty">${t('Create a trip to track expenses.','여행을 만든 뒤 경비를 기록하세요.')}${btn('newTrip',t('Create a trip','여행 만들기'),'primary')}</div>`;
  const spent=tr.expenses.reduce((sum,e)=>sum+e.amountKRW,0),percent=tr.budgetKRW?Math.min(100,spent/tr.budgetKRW*100):0,expenseRates=expenseRateEntries(data.rates);
  return `<div class="intro"><div class="eyebrow">MORE MEMORIES, LESS MATH</div><h1>${t('A little peace of mind.','여행 경비, 한눈에.')}</h1><p>${h(title(tr))} · ${t('All expenses stay on your device.','경비는 이 기기에 저장됩니다.')}</p></div><div class="budget-grid"><div class="panel summary-card"><div class="eyebrow">${t('REMAINING','남은 예산')}</div><div class="money">${krw(tr.budgetKRW-spent)}</div><small>${h(homeMoney(tr.budgetKRW-spent))}</small><div class="budget-bar"><span style="width:${percent}%"></span></div><small>${t('Budget','전체 예산')} ${krw(tr.budgetKRW)}</small><div style="margin-top:17px">${btn('addBudget',t('＋ Add budget','＋ 예산 추가'),'primary')}</div></div><div class="panel"><div class="eyebrow">${t('SPENT SO FAR','지금까지 지출')}</div><div class="money">${krw(spent)}</div><p class="muted" style="margin-top:8px">${tr.expenses.length}${t(' expenses recorded','건 기록')}</p><div class="row wrap" style="margin-top:16px">${btn('newExpense',t('＋ Record expense','＋ 경비 기록'),'primary')}${btn('importExpense',t('Paste payment message','결제 메시지 붙여넣기'),'text-btn')}</div></div></div>${budgetEntryLabel(tr)}<div class="section-heading"><h2>${t('The little things add up.','차곡차곡 모인 기록')}</h2>${btn('editTrip',t('Edit budget','예산 수정'),'text-btn')}</div><div class="panel">${tr.expenses.length?[...tr.expenses].reverse().map(e=>`<article class="expense"><span class="place-icon" aria-hidden="true" style="height:44px;width:44px;font-size:20px">${e.category==='Food & drink'?'☕':'▱'}</span><div><strong>${h(e.merchant)}</strong><small>${h(catName(e.category))} · ${t('Day ','')+(e.dayIndex+1)+t('','일차')}</small></div><div class="amount">${krw(e.amountKRW)}${savedExpenseFX(e,expenseRates)}</div><button class="delete" data-action="deleteExpense" data-id="${e.id}" aria-label="${t('Delete expense','경비 삭제')}">×</button></article>`).join(''):`<div class="empty"><p>${t('Your first coffee, train ride or market lunch. Record it here.','첫 커피, 기차표, 시장 점심부터 기록해보세요.')}</p></div>`}</div>`;
}
function toolsPage(){
  const rate=data.rates[data.homeCurrency];
  const link=(url,name,desc)=>`<a href="${url}" target="_blank" rel="noopener noreferrer" class="tool-link"><div><strong>${name}</strong><br><span>${desc}</span></div>↗</a>`;
  return `<div class="intro"><div class="eyebrow">A FEW THINGS, SORTED</div><h1>${t('Travel a little lighter.','조금 더 가볍게 떠나요.')}</h1><p>${t('The useful bits, all in one place.','여행에 필요한 것들을 한곳에 모았어요.')}</p></div><div class="tools-grid"><section class="panel stack"><div class="eyebrow">${t('YOUR PREFERENCES','나의 여행 설정')}</div><div class="row between"><strong>${t('Language','언어')}</strong>${btn('language',data.language==='ko'?'한국어':'English')}</div><label class="row between"><strong>${t('Home currency','기준 통화')}</strong><select id="homeCurrency" aria-label="${t('Home currency','기준 통화')}" style="padding:12px;border:1px solid var(--line);border-radius:12px;background:white">${['USD','EUR','JPY','GBP','CNY','AUD','CAD','SGD'].map(c=>`<option ${data.homeCurrency===c?'selected':''}>${c}</option>`).join('')}</select></label><p class="note">${rate?`1 ${h(rate.currency)} = ${krw(rate.krwPerUnit)} · ${h(rate.referenceDate)}`:t('No reference rate loaded.','저장된 기준환율이 없습니다.')}<br>${t('Reference rates from Frankfurter. Card charges and fees may differ.','Frankfurter 기준환율입니다. 카드 적용 환율·수수료와 다를 수 있습니다.')}</p>${btn('fx',t('Refresh exchange rate','환율 새로고침'))}</section><section class="panel"><div class="eyebrow">${t('GETTING AROUND','한국에서 이동하기')}</div>${btn('route',t('Bus & subway directions','버스·지하철 길찾기'),'primary full',`style="margin-bottom:10px"`)}${btn('mixed',t('Build bus + subway sections','버스+지하철 직접 조합'),'secondary full',`style="margin-bottom:10px"`)}${btn('subway',t('Subway maps & my route','지하철 노선도·내 경로'),'secondary full')}${btn('bus',t('Bus maps & my route','버스 노선도·내 경로'),'secondary full',`style="margin-top:10px"`)}<p class="note">${t('Bus maps: Seoul, Busan, Daegu, Daejeon and Gwangju.','버스 지도: 서울·부산·대구·대전·광주권을 지원합니다.')}</p>${btn('tripMap',t('Open trip map','여행 지도 열기'),'secondary full')}${link('https://www.letskorail.com/ebizbf/EbizBfTicketSearch.do',t('KORAIL','코레일'),t('Intercity train tickets','도시 간 철도 승차권'))}${link('https://www.lotterentacar.net/hp/eng/main/index.do',t('LOTTE Rent-a-Car','롯데렌터카'),t('Check licence and age requirements','운전면허·연령 조건 확인'))}${link('https://www.socar.kr',t('SOCAR','쏘카'),t('Check eligibility before booking','이용 자격 확인 후 예약'))}</section><section class="panel stack"><div class="eyebrow">${t('YOUR TRIP, YOUR DEVICE','나의 여행, 나의 기기')}</div><p class="note">${t('Trips and expenses are saved on this device, not published on this website. Safari and the iPhone app keep separate storage. Export a backup before removing the app or clearing browser data.','일정과 경비는 이 기기에 저장되며 홈페이지에 공개되지 않습니다. Safari와 아이폰 앱은 저장 공간이 다릅니다. 앱 삭제나 브라우저 데이터 정리 전 백업을 내보내세요.')}</p><div class="row wrap">${btn('backup',t('Export backup','백업 내보내기'))}${btn('restore',t('Restore backup','백업 불러오기'))}</div>${btn('retrySave',t('Save again','다시 저장'),'text-btn')}${btn('refreshWeb',t('Check for a website update','웹 화면 새로고침'),'text-btn')}${native?btn('offline',t('Open offline native view','오프라인 화면 열기'),'text-btn'):''}<input id="restore-file" type="file" accept="application/json,.json" hidden></section><section class="panel stack"><div class="eyebrow">${t('GOOD TO KNOW','알아두세요')}</div><p class="note">${t('Bus and subway routes calculate estimated travel times. Verify current service through official transit information. Walking and driving times can be requested in the iPhone app. No SMS access or automatic payment collection is used.','버스·지하철 경로는 예상 이동시간을 자동 계산합니다. 현재 운행 정보는 공식 대중교통 안내에서 확인해주세요. 아이폰 앱에서 도보·자동차 이동시간을 조회할 수 있습니다. 문자 자동 열람·결제 자동 수집은 사용하지 않습니다.')}</p>${btn('share',t('Share itinerary','여행 일정 공유'),'text-btn')}<p class="footer-version">TripFlow Korea · ${VERSION}${native?' · iPhone':''}</p></section></div>`;
}
function openModal(content,{locked=false}={}){
  modal.dispatchEvent(new Event('tripflow:replace'));
  modal.classList.remove('metro-modal','network-modal','bus-modal','mixed-modal','auto-modal','journey-view-modal','place-map-modal','transit-refresh-modal');modal.innerHTML=content;modal.dataset.locked=locked?'true':'false';modal.showModal();
}
function modalTop(title,locked=false){return `<div class="modal-top"><h2 id="modal-title">${title}</h2>${locked?'':btn('close','×','icon-btn',`aria-label="${t('Close','닫기')}"`)}</div>`;}
function languageModal(){
  const locked=data.hasSelectedLanguage!==true;
  openModal(`${modalTop('언어 / Language',locked)}<p class="muted">언어를 선택하세요.<br>Choose your language.</p>${[['ko','한국어','Korean'],['en','English','영어']].map(([code,name,hint])=>btn('selectLanguage',`${name}<span>${hint} ${data.language===code?'✓':''}</span>`,'language-choice'+(data.language===code?' selected':''),`data-language="${code}" id="languageChoice-${code}"`)).join('')}<p class="note" style="margin-top:19px">언제든 변경할 수 있어요.<br>You can change this anytime.</p>${btn('confirmLanguage','선택 완료 / Continue','primary full',`style="margin-top:18px" id="confirmLanguage"`)}`,{locked});
}
function tripModal(){openModal(`${modalTop(t('Your trips','나의 여행'))}${data.trips.map(tr=>btn('selectTrip',`${h(title(tr))}<small>${h(cityName(tr.city))} · ${tr.days.length}${t(' days','일')}</small>`,'trip-option',`data-id="${tr.id}"`)).join('')}${btn('newTrip',t('＋ New trip','＋ 새 여행'),'primary full')}`);}
function newTripModal(edit=false){
  const tr=edit?trip():null;
  openModal(`${modalTop(edit?t('Trip settings','여행 설정'):t('A new adventure','새로운 여행'))}<form id="trip-form" class="form-grid" data-edit="${edit}" data-trip-id="${tr?.id||''}"><label>${t('Trip name','여행 이름')}<input name="title" maxlength="100" required placeholder="${t('My Korea trip','나의 한국 여행')}" value="${h(tr?.title||'')}"></label><label>${t('City or region','도시·지역')}<input name="city" maxlength="80" required value="${h(tr?.city||t('Seoul','서울'))}"></label><div class="field-pair"><label>${t('Start date','출발일')}<input type="date" name="date" required value="${dateInput(tr?toDate(tr.startDate):new Date())}"></label><label>${t('Days','여행일수')}<input type="number" name="days" min="1" max="30" required value="${tr?.days.length||3}" ${edit?'readonly':''}></label></div>${budgetFields(String(tr?.budgetKRW??450000))}<button class="primary" type="submit">${t(edit?'Save':'Create',edit?'저장':'만들기')}</button></form>${edit?btn('deleteTrip',t('Delete this trip','이 여행 삭제'),'text-btn',`style="color:#a73a2a;margin-top:15px"`):''}`);
  beginBudgetForm($('#trip-form'));
}
function dateInput(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function budgetFields(amount,currency='KRW'){
  return `<fieldset class="budget-inputs"><legend>${t('Budget amount','예산 금액')}</legend><div class="field-pair"><label>${t('Currency','입력 통화')}<select name="budgetCurrency" id="budgetCurrency">${budgetCurrencies.map(c=>`<option value="${c}" ${currency===c?'selected':''}>${c}</option>`).join('')}</select></label><label>${t('Amount','입력 금액')}<input name="budget" id="budgetAmount" inputmode="decimal" autocomplete="off" maxlength="32" required value="${h(amount)}" data-default="${amount!==''}" placeholder="${t('Enter amount','금액 입력')}"></label></div><div id="foreign-budget-options" class="stack" ${currency==='KRW'?'hidden':''}><label>${t('Exchange rate to apply','적용할 환율')}<select name="budgetRateMode" id="budgetRateMode"><option value="latest">${t('Fetch latest reference rate','최신 환율 조회')}</option><option value="manual">${t('My purchased exchange rate','내가 구매한 환율')}</option></select></label><div id="purchased-rate-fields" class="stack" hidden><div class="field-pair"><label>${t('Currency units','환율 기준 단위')}<select name="budgetRateUnit" id="budgetRateUnit"><option value="1">1 ${h(currency)}</option><option value="100">100 ${h(currency)}</option></select></label><label>${t('Price in KRW','위 금액의 원화 가격')}<input name="budgetPurchasedRate" id="budgetPurchasedRate" inputmode="decimal" autocomplete="off" maxlength="24" placeholder="${t('e.g. 1,450','예: 1,450')}"></label></div><p class="note">${t('Example: for 100 JPY purchased at ₩950, select 100 JPY and enter 950.','예: 100엔을 950원에 샀다면, 100 JPY를 선택하고 950을 입력하세요.')}</p></div>${btn('refreshBudgetRate',t('Refresh latest rate','최신 환율 다시 조회'),'text-btn',`id="refreshBudgetRate"`)}</div><div id="budgetQuote" class="budget-quote" role="status" aria-live="polite" aria-atomic="true"></div><p class="note">${t('The KRW budget is fixed when you save. Latest rates are published reference rates, not second-by-second quotes or card charges.','저장한 원화 예산은 자동으로 바뀌지 않습니다. 조회 환율은 최신 공시 기준환율이며 초단위 시세·카드 적용 환율과 다를 수 있습니다.')}</p></fieldset>`;
}
function beginBudgetForm(form,adding=false){
  budgetDraft={form,adding,tripID:form.dataset.tripId||null,baseKRW:adding?trip().budgetKRW:0,sequence:0,quote:null,rate:null};
  updateBudgetControls();void updateBudgetPreview();
}
function updateBudgetControls(){
  const f=budgetDraft?.form;if(!f?.isConnected)return;
  const currency=f.elements.budgetCurrency.value,foreign=currency!=='KRW',manual=f.elements.budgetRateMode.value==='manual';
  f.querySelector('#foreign-budget-options').hidden=!foreign;
  f.querySelector('#purchased-rate-fields').hidden=!foreign||!manual;
  f.querySelector('#refreshBudgetRate').hidden=!foreign||manual;
  for(const option of f.elements.budgetRateUnit.options)option.textContent=option.value+' '+currency;
  f.elements.budgetPurchasedRate.required=foreign&&manual;
}
function budgetFingerprint(f){return ['budget','budgetCurrency','budgetRateMode','budgetRateUnit','budgetPurchasedRate'].map(n=>f.elements[n].value).join('|');}
function budgetError(error){
  return ({'invalid-amount':t('Enter a valid, non-negative amount.','0 이상의 올바른 금액을 입력해주세요.'),'whole-units':t('KRW and JPY amounts use whole units.','원화와 엔화 금액은 정수로 입력해주세요.'),'invalid-rate':t('Enter a purchased exchange rate greater than zero.','0보다 큰 구매 환율을 입력해주세요.'),'budget-limit':t('The total budget cannot exceed ₩1,000,000,000.','전체 예산은 10억 원까지 입력할 수 있습니다.')})[error.message]||t('Could not fetch a fresh rate. Retry or enter your purchased rate. Your budget has not changed.','최신 환율을 조회하지 못했습니다. 다시 조회하거나 구매 환율을 입력하세요. 예산은 변경되지 않았습니다.');
}
async function requestRate(currency){
  if(rateRequests.has(currency))return rateRequests.get(currency);
  const task=(async()=>{
    let rate,timer;
    try{
      if(native)rate=await Promise.race([bridge('fx',{currency}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('rate-timeout')),15000);})]);
      else{
        const controller=new AbortController();timer=setTimeout(()=>controller.abort(),15000);
        const response=await fetch(`https://api.frankfurter.dev/v2/rate/${currency.toLowerCase()}/krw`,{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw Error('rate-unavailable');const body=await response.json();
        if(body.base.toUpperCase()!==currency||body.quote.toUpperCase()!=='KRW')throw Error('rate-unavailable');
        rate={currency,krwPerUnit:body.rate,referenceDate:body.date,fetchedAt:now()};
      }
      if(rate.currency!==currency||!Number.isFinite(rate.krwPerUnit)||rate.krwPerUnit<=0||!/^\d{4}-\d{2}-\d{2}$/.test(rate.referenceDate))throw Error('rate-unavailable');
      return rate;
    }finally{clearTimeout(timer);}
  })();
  rateRequests.set(currency,task);try{return await task;}finally{if(rateRequests.get(currency)===task)rateRequests.delete(currency);}
}
async function updateBudgetPreview({refresh=false}={}){
  clearTimeout(budgetTimer);
  const draft=budgetDraft,f=draft?.form;if(!f?.isConnected||!modal.open)return null;
  const seq=++draft.sequence,fingerprint=budgetFingerprint(f),currency=f.elements.budgetCurrency.value;
  const display=f.querySelector('#budgetQuote'),submit=f.querySelector('[type="submit"]');
  draft.quote=null;submit.disabled=true;display.classList.remove('error');
  if(!f.elements.budget.value.trim()){display.textContent=t('Choose a currency and enter an amount.','통화를 선택하고 금액을 입력하세요.');return null;}
  try{
    const amount=budgetAmount(f.elements.budget.value,currency);
    let rate,unit=1,rawRate=1,source='krw';
    if(currency==='KRW')rate={currency,krwPerUnit:1,referenceDate:'',fetchedAt:now()};
    else if(f.elements.budgetRateMode.value==='manual'){
      source='manual';unit=Number(f.elements.budgetRateUnit.value);rawRate=f.elements.budgetPurchasedRate.value.trim();
      if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,8})?$/.test(rawRate))throw Error('invalid-rate');
      rate={currency,krwPerUnit:Number(rawRate.replaceAll(',',''))/unit,referenceDate:'',fetchedAt:now()};
    }else{
      source='latest';display.textContent=t('Fetching the latest reference rate…','최신 기준환율을 조회하는 중…');
      if(refresh)draft.rate=null;
      rate=!refresh&&draft.rate?.currency===currency?draft.rate:await requestRate(currency);
      if(budgetDraft!==draft||seq!==draft.sequence||!f.isConnected||!modal.open)return null;
      draft.rate=rate;rawRate=rate.krwPerUnit;
    }
    const amountKRW=convertedBudget(amount,currency,rawRate,unit),totalKRW=budgetTotal(draft.baseKRW,amountKRW,draft.adding);
    const quote={amountKRW,totalKRW,currency,source,rate,unit,rawRate,fingerprint};
    if(budgetDraft!==draft||seq!==draft.sequence||fingerprint!==budgetFingerprint(f))return null;
    const rateNumber=Number(String(rawRate).replaceAll(',',''));
    display.innerHTML=`<small>${t('KRW amount to apply','반영할 원화 금액')}</small><strong>${krw(amountKRW)}</strong>${currency==='KRW'?'':`<p>${unit} ${h(currency)} = ${h(new Intl.NumberFormat(data.language==='ko'?'ko-KR':'en-US',{style:'currency',currency:'KRW',maximumFractionDigits:8}).format(rateNumber))}</p><small>${source==='manual'?t('Your purchased rate · entered manually','구매 환율 · 직접 입력'):t('Latest reference rate · Frankfurter','최신 기준환율 · Frankfurter')}${source==='latest'&&rate.referenceDate?' · '+h(rate.referenceDate):''}</small>`}${draft.adding?`<p class="budget-total">${t('Budget after adding','추가 후 전체 예산')} <b>${krw(totalKRW)}</b></p>`:''}`;
    draft.quote=quote;submit.disabled=false;return quote;
  }catch(error){
    if(budgetDraft!==draft||seq!==draft.sequence||!f.isConnected)return null;
    display.textContent=budgetError(error);display.classList.add('error');return null;
  }
}
async function budgetQuoteForSubmit(f){
  if(budgetDraft?.form!==f)return null;
  const q=budgetDraft.quote;
  const fresh=await updateBudgetPreview({refresh:q?.source==='latest'&&now()-q.rate.fetchedAt>60});
  return fresh?.fingerprint===budgetFingerprint(f)?fresh:null;
}
function rememberBudgetQuote(tr,quote,changed=true){
  if(!changed&&quote.currency==='KRW')return;
  delete data.rates['budget-manual:'+tr.id];delete data.rates['budget-latest:'+tr.id];
  if(quote.source!=='krw')data.rates['budget-'+quote.source+':'+tr.id]=quote.rate;
  if(quote.source==='latest')data.rates[quote.currency]=quote.rate;
}
function budgetEntryLabel(tr){
  const manual=data.rates['budget-manual:'+tr.id],latest=data.rates['budget-latest:'+tr.id],rate=manual||latest;
  if(!rate)return '';
  return `<p class="note budget-basis">${t('Last budget entry used','마지막 예산 입력에 적용한 환율')}: 1 ${h(rate.currency)} = ${h(new Intl.NumberFormat('ko-KR',{maximumFractionDigits:8}).format(rate.krwPerUnit))}${t(' KRW','원')} · ${manual?t('Purchased rate','구매 환율'):t('Published reference rate','공시 기준환율')}${!manual&&rate.referenceDate?' · '+h(rate.referenceDate):''}</p>`;
}
function addBudgetModal(){
  const tr=trip();if(!tr)return;
  openModal(`${modalTop(t('Add to your budget','예산 추가'))}<p class="note" style="margin-bottom:16px">${t('Current budget','현재 전체 예산')}: ${krw(tr.budgetKRW)}</p><form id="budget-form" data-trip-id="${tr.id}" class="form-grid">${budgetFields('',data.homeCurrency)}<button type="submit" class="primary">${t('Add to budget','예산에 추가')}</button></form>`);
  beginBudgetForm($('#budget-form'),true);
}
function placeModal(p){
  openModal(`${modalTop(t('A closer look','장소 자세히'))}<div class="eyebrow">${h(catName(p.category))}</div><h2 style="margin:12px 0">${h(placeName(p))}</h2><p class="muted">${h(p.address)}</p><div class="row wrap" style="margin:18px 0">${btn('copyAddress',t('Copy address','주소 복사'),'text-btn',`data-place="${h(p.id)}"`)}${btn('placeMap',t('View map','지도 보기'),'secondary',`data-place="${h(p.id)}"`)}</div>${trip()?`<form id="add-place-form" class="form-grid" data-id="${h(p.id)}"><label>${t('Add to day','추가할 날짜')}<select name="day">${trip().days.map((_,i)=>`<option value="${i}" ${i===dayIndex?'selected':''}>${t('Day ','')+(i+1)+t('','일차')}</option>`).join('')}</select></label><button class="primary" type="submit">${t('Add to my itinerary','내 일정에 추가')}</button></form>`:`${btn('newTrip',t('Create a trip first','먼저 여행 만들기'),'primary full')}`}`);
}
function editStopModal(id){
  const s=day().stops.find(s=>s.id===id);if(!s)return;
  openModal(`${modalTop(h(placeName(s.place)))}<form id="stop-form" data-id="${id}" class="form-grid"><label>${t('Stay (minutes)','머무는 시간 (분)')}<input type="number" name="stay" min="0" max="1440" step="1" value="${s.stayMinutes}" required></label><label>${t('Travel from previous stop','이전 장소에서 이동')}<select name="mode">${['transit','walking','driving'].map(m=>`<option value="${m}" ${m===s.mode?'selected':''}>${modeName(m)}</option>`).join('')}</select></label><label>${t('Travel time (minutes, leave blank if unknown)','이동시간 (분, 미정이면 비우세요)')}<input type="number" name="travel" min="0" max="2880" step="1" value="${s.travelMinutes??''}"></label><label>${t('Notes','메모')}<textarea name="note" maxlength="${2000-(s.note.length-readTransitNote(s.note).note.length)}">${h(readTransitNote(s.note).note)}</textarea></label><button type="submit" class="primary">${t('Save','저장')}</button></form>${btn('removeStop',t('Remove from itinerary','일정에서 삭제'),'text-btn',`data-id="${id}" style="color:#a73a2a;margin-top:15px"`)}`);
}
function expenseModal(proposal=null){
  const tr=trip();if(!tr)return;
  const purchased=data.rates['budget-manual:'+tr.id];
  const rateCurrency=purchased?.currency||data.homeCurrency;
  openModal(`${modalTop(t('Record an expense','경비 기록'))}${proposal?`<p class="note" style="margin-bottom:18px">${t('Review the proposed amount before saving.','금액을 확인한 뒤 저장해주세요.')}</p>`:''}<form id="expense-form" class="form-grid" data-trip-id="${tr.id}"><label>${t('Merchant / description','사용처·내용')}<input name="merchant" id="merchantField" maxlength="120" required placeholder="${t('Lunch in Seoul','서울에서 점심')}"></label><fieldset class="budget-inputs"><legend>${t('Expense amount','지출 금액')}</legend><div class="field-pair"><label>${t('Currency paid','결제 금액의 통화')}<select name="expenseCurrency" id="expenseCurrency">${budgetCurrencies.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></label><label>${t('Amount paid','결제 금액')}<input name="amount" id="amountField" inputmode="decimal" autocomplete="off" maxlength="32" required value="${proposal?.amountKRW||''}" placeholder="${t('Enter amount','금액 입력')}"></label></div><label>${t('Exchange rate to apply','적용할 환율')}<select name="expenseRateMode" id="expenseRateMode"><option value="none">${t('Record KRW only','환산 없이 원화만 저장')}</option><option value="manual" ${purchased?'selected':''}>${t('My purchased exchange rate','내가 구매한 환율')}</option><option value="latest">${t('Fetch latest reference rate','최신 환율 조회')}</option></select></label><label id="expense-rate-currency-field">${t('Currency to show alongside KRW','함께 환산할 통화')}<select name="expenseRateCurrency" id="expenseRateCurrency">${budgetCurrencies.filter(c=>c!=='KRW').map(c=>`<option ${c===rateCurrency?'selected':''}>${c}</option>`).join('')}</select></label><div id="expense-manual-fields" class="stack" hidden><div class="field-pair"><label>${t('Currency units','환율 기준 단위')}<select name="expenseRateUnit" id="expenseRateUnit"><option value="1">1 ${h(rateCurrency)}</option><option value="100">100 ${h(rateCurrency)}</option></select></label><label>${t('Price in KRW','위 금액의 원화 가격')}<input name="expensePurchasedRate" id="expensePurchasedRate" inputmode="decimal" autocomplete="off" maxlength="24" placeholder="${t('e.g. 1,350','예: 1,350')}"></label></div><p class="note">${t('A saved purchased rate is filled in when available. You can change it for this expense.','저장된 구매 환율이 있으면 불러옵니다. 이번 지출에 맞게 수정할 수 있어요.')}</p></div>${btn('refreshExpenseRate',t('Refresh latest rate','최신 환율 다시 조회'),'text-btn',`id="refreshExpenseRate" hidden`)}<div id="expenseQuote" class="budget-quote" role="status" aria-live="polite" aria-atomic="true"></div><p class="note">${t('The KRW expense and its applied rate are fixed when saved. Purchased rates do not require a date.','원화 지출액과 적용 환율은 저장 시 고정됩니다. 구매 환율에는 날짜가 필요하지 않습니다.')}</p></fieldset><div class="field-pair"><label>${t('Category','분류')}<select name="category">${['Food & drink','Transport','Stay','Shopping','Activities','Other'].map(c=>`<option value="${c}">${h(catName(c))}</option>`).join('')}</select></label><label>${t('Day','여행일')}<select name="day">${tr.days.map((_,i)=>`<option value="${i}" ${i===dayIndex?'selected':''}>${t('Day ','')+(i+1)+t('','일차')}</option>`).join('')}</select></label></div>${proposal?`<input type="hidden" name="fingerprint" value="${h(proposal.fingerprint)}">`:''}<button class="primary" type="submit">${t('Save','저장')}</button></form>`);
  expenseDraft={form:$('#expense-form'),tripID:tr.id,sequence:0,rate:null,quote:null,unit:1};
  updateExpenseControls({prefill:true});void updateExpensePreview();
}
function expenseCurrency(f){return f.elements.expenseCurrency.value==='KRW'?f.elements.expenseRateCurrency.value:f.elements.expenseCurrency.value;}
function purchasedExpenseRate(currency){
  const tr=trip();if(!tr)return null;
  const budget=data.rates['budget-manual:'+tr.id];
  if(budget?.currency===currency)return {rate:budget,unit:currency==='JPY'?100:1};
  const entries=expenseRateEntries(data.rates);
  for(const expense of [...tr.expenses].reverse()){
    const entry=entries.get(expense.id.toUpperCase());if(entry?.source==='manual'&&entry.rate.currency===currency)return entry;
  }
  return null;
}
function editableRate(value){return value.toFixed(8).replace(/0+$/,'').replace(/\.$/,'');}
function updateExpenseControls({prefill=false}={}){
  const f=expenseDraft?.form;if(!f?.isConnected)return;
  const paid=f.elements.expenseCurrency.value,mode=f.elements.expenseRateMode;
  mode.querySelector('option[value="none"]').hidden=paid!=='KRW';
  mode.querySelector('option[value="none"]').disabled=paid!=='KRW';
  if(paid!=='KRW'&&mode.value==='none')mode.value='latest';
  const currency=expenseCurrency(f),manual=mode.value==='manual';
  f.querySelector('#expense-rate-currency-field').hidden=paid!=='KRW'||mode.value==='none';
  f.querySelector('#expense-manual-fields').hidden=!manual;
  f.querySelector('#refreshExpenseRate').hidden=mode.value!=='latest';
  f.elements.expensePurchasedRate.required=manual;
  for(const option of f.elements.expenseRateUnit.options)option.textContent=option.value+' '+currency;
  if(prefill){
    const saved=purchasedExpenseRate(currency);
    f.elements.expenseRateUnit.value=String(saved?.unit||(currency==='JPY'?100:1));
    f.elements.expensePurchasedRate.value=saved?editableRate(saved.rate.krwPerUnit*Number(f.elements.expenseRateUnit.value)):'';
  }
  expenseDraft.unit=Number(f.elements.expenseRateUnit.value);
}
function expenseFingerprint(f){return ['amount','expenseCurrency','expenseRateMode','expenseRateCurrency','expenseRateUnit','expensePurchasedRate'].map(n=>f.elements[n].value).join('|');}
function expenseError(error){
  if(error.message==='expense-minimum')return t('The recorded expense must be at least ₩1.','저장할 지출은 원화로 1원 이상이어야 합니다.');
  if(error.message==='budget-limit')return t('One expense cannot exceed ₩1,000,000,000.','한 건의 경비는 10억 원까지 입력할 수 있습니다.');
  return budgetError(error).replace('예산은 변경되지 않았습니다.','경비는 저장되지 않았습니다.').replace('Your budget has not changed.','The expense has not been saved.');
}
function currencyMoney(amount,currency){return new Intl.NumberFormat(data.language==='ko'?'ko-KR':'en-US',{style:'currency',currency,currencyDisplay:'code'}).format(amount);}
async function updateExpensePreview({refresh=false}={}){
  clearTimeout(expenseTimer);
  const draft=expenseDraft,f=draft?.form;if(!f?.isConnected||!modal.open)return null;
  const seq=++draft.sequence,fingerprint=expenseFingerprint(f),paid=f.elements.expenseCurrency.value,source=f.elements.expenseRateMode.value;
  const display=f.querySelector('#expenseQuote'),submit=f.querySelector('[type="submit"]');
  draft.quote=null;submit.disabled=true;display.classList.remove('error');
  if(!f.elements.amount.value.trim()){display.textContent=t('Enter the amount you paid.','결제한 금액을 입력하세요.');return null;}
  try{
    let rate,rawRate=1,unit=1,currency=source==='none'?'KRW':expenseCurrency(f);
    if(source==='none')rate={currency:'KRW',krwPerUnit:1,referenceDate:'',fetchedAt:now()};
    else if(source==='manual'){
      rawRate=f.elements.expensePurchasedRate.value.trim();unit=Number(f.elements.expenseRateUnit.value);
      if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,8})?$/.test(rawRate))throw Error('invalid-rate');
      rate={currency,krwPerUnit:Number(rawRate.replaceAll(',',''))/unit,referenceDate:'',fetchedAt:now()};
    }else{
      if(refresh)draft.rate=null;
      display.textContent=t('Fetching the latest reference rate…','최신 기준환율을 조회하는 중…');
      rate=!refresh&&draft.rate?.currency===currency?draft.rate:await requestRate(currency);
      if(expenseDraft!==draft||seq!==draft.sequence||!f.isConnected||!modal.open)return null;
      draft.rate=rate;rawRate=rate.krwPerUnit;
    }
    const converted=convertedExpense(f.elements.amount.value,paid,currency,rawRate,unit);
    if(expenseDraft!==draft||seq!==draft.sequence||fingerprint!==expenseFingerprint(f))return null;
    const quote={...converted,rate,source,unit,fingerprint};
    display.innerHTML=`<small>${t('KRW expense to save','저장할 원화 지출')}</small><strong>${krw(quote.amountKRW)}</strong>${source==='none'?'':`<p>${h(currencyMoney(quote.foreignAmount,currency))}</p><small>${unit} ${h(currency)} = ${h(new Intl.NumberFormat('ko-KR',{maximumFractionDigits:8}).format(rate.krwPerUnit*unit))}${t(' KRW','원')} · ${source==='manual'?t('Purchased rate','구매 환율'):t('Latest reference rate','최신 기준환율')}${source==='latest'?' · '+h(rate.referenceDate):''}</small>`}`;
    draft.quote=quote;submit.disabled=false;return quote;
  }catch(error){
    if(expenseDraft!==draft||seq!==draft.sequence||!f.isConnected)return null;
    display.textContent=expenseError(error);display.classList.add('error');return null;
  }
}
function savedExpenseFX(expense,entries){
  try{
    const entry=entries.get(expense.id.toUpperCase());if(!entry)return `<small>${h(homeMoney(expense.amountKRW))}</small>`;
    const shown=entry.originalCurrency==='KRW'?convertedExpense(expense.amountKRW,'KRW',entry.rate.currency,entry.rate.krwPerUnit,1).foreignAmount:Number(entry.originalAmount);
    return `<small>${h(currencyMoney(shown,entry.rate.currency))} · ${entry.source==='manual'?t('Purchased rate','구매 환율'):t('Reference rate','기준환율')}</small><small>${entry.unit} ${h(entry.rate.currency)} = ${h(new Intl.NumberFormat('ko-KR',{maximumFractionDigits:8}).format(entry.rate.krwPerUnit*entry.unit))}${t(' KRW','원')}</small>`;
  }catch{return `<small>${h(homeMoney(expense.amountKRW))}</small>`;}
}
function removeExpenseFX(ids){
  const wanted=new Set(ids.map(id=>id.toUpperCase()));
  for(const key of Object.keys(data.rates))if(key.startsWith('expense-fx-v1:')&&wanted.has(key.split(':')[1].toUpperCase()))delete data.rates[key];
}

function findPlace(id){return results.find(p=>p.id===id)||catalog.find(p=>p.id===id)||trip()?.days.flatMap(d=>d.stops).find(s=>s.place.id===id)?.place;}
function external(url){if(native)return bridge('open',{url});window.open(url,'_blank','noopener');}
function exportText(){const tr=trip();if(!tr)return '';return `${title(tr)}\n${cityName(tr.city)} · ${tr.days.length}${t(' days','일')}\n\n`+tr.days.map((d,i)=>{const a=arrivals(d);return t('DAY ','여행일 ')+(i+1)+'\n'+d.stops.map((s,j)=>`${clock(a[j])}  ${placeName(s.place)}\n${s.place.address}\n${t('Stay','체류')} ${s.stayMinutes}${t(' min','분')}${j?' · '+modeName(s.mode)+' '+(s.travelMinutes??t('unknown','미정'))+' '+durationLabel(s):''}${readTransitNote(s.note).note?'\n'+readTransitNote(s.note).note:''}${readTransitNote(s.note).plan?'\n'+(transitStatus(readTransitNote(s.note),d.stops[j-1],s)==='active'?'':t('[Review transit route] ','[대중교통 경로 재확인] '))+readTransitNote(s.note).summary:''}`).join('\n\n');}).join('\n\n');}
async function shareText(text,name='TripFlow-itinerary.txt'){
  if(native)return bridge('share',{text,name});
  if(navigator.share)return navigator.share({title:'TripFlow Korea',text});
  download(text,name,'text/plain');
}
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
async function refreshRoutes(target=''){await transitRefresher.start(target);}
root.addEventListener('input',e=>{
  if(e.target.id!=='placeSearchField')return;
  query=e.target.value;generation++;results=[];searchError='';searched=false;searching=false;clearTimeout(debounce);updateSearch();
  if(native&&query.trim().length>=2)debounce=setTimeout(search,650);
});
document.addEventListener('input',e=>{
  const f=e.target.closest('#trip-form,#budget-form');
  if(!f||budgetDraft?.form!==f||!['budget','budgetPurchasedRate'].includes(e.target.name))return;
  if(e.target.name==='budget')e.target.dataset.default='false';
  budgetDraft.quote=null;f.querySelector('[type="submit"]').disabled=true;
  clearTimeout(budgetTimer);budgetTimer=setTimeout(()=>updateBudgetPreview(),300);
});
document.addEventListener('input',e=>{
  const f=e.target.closest('#expense-form');
  if(!f||expenseDraft?.form!==f||!['amount','expensePurchasedRate'].includes(e.target.name))return;
  expenseDraft.quote=null;f.querySelector('[type="submit"]').disabled=true;
  clearTimeout(expenseTimer);expenseTimer=setTimeout(()=>updateExpensePreview(),250);
});
document.addEventListener('change',async e=>{
  const expenseForm=e.target.closest('#expense-form');
  if(expenseForm&&expenseDraft?.form===expenseForm&&['expenseCurrency','expenseRateMode','expenseRateCurrency','expenseRateUnit'].includes(e.target.name)){
    if(e.target.name==='expenseRateUnit'){
      const raw=expenseForm.elements.expensePurchasedRate.value.replaceAll(',',''),oldUnit=expenseDraft.unit,newUnit=Number(e.target.value);
      if(raw&&Number.isFinite(Number(raw))&&Number(raw)>0)expenseForm.elements.expensePurchasedRate.value=editableRate(Number(raw)*newUnit/oldUnit);
    }
    updateExpenseControls({prefill:e.target.name!=='expenseRateUnit'});await updateExpensePreview();
  }
  const f=e.target.closest('#trip-form,#budget-form');
  if(f&&budgetDraft?.form===f&&['budgetCurrency','budgetRateMode','budgetRateUnit'].includes(e.target.name)){
    if(e.target.name==='budgetCurrency'&&f.elements.budget.dataset.default==='true'){f.elements.budget.value='';f.elements.budget.dataset.default='false';}
    updateBudgetControls();await updateBudgetPreview();
  }
  if(e.target.id==='searchAreaPicker'){area=e.target.value;if(query)await search();}
  if(e.target.id==='homeCurrency'){data.homeCurrency=e.target.value;await save();render();}
  if(e.target.id==='restore-file'){
    const file=e.target.files[0];if(!file)return;
    try{if(file.size>2000000)throw Error();const restored=JSON.parse(await file.text());if(!validState(restored))throw Error();openModal(`${modalTop(t('Restore backup?','백업을 불러올까요?'))}<p>${t('This replaces trips on this device. Export your current backup first if you need it.', '이 기기의 여행 목록을 백업 내용으로 바꿉니다. 현재 여행이 필요하면 먼저 백업을 내보내세요.')}</p><div class="dialog-actions">${btn('close',t('Cancel','취소'))}${btn('confirmRestore',t('Restore','불러오기'),'primary')}</div>`);window.__pendingRestore=restored;}
    catch{toast(t('This backup could not be opened.','백업 파일을 열 수 없습니다.'));}
  }
});
document.addEventListener('submit',async e=>{
  const f=e.target;if(!['search-form','trip-form','budget-form','add-place-form','stop-form','expense-form','start-form','import-form'].includes(f.id))return;e.preventDefault();const v=new FormData(f);
  try{
    if(f.id==='search-form'){query=String(v.get('q'));f.querySelector('input').blur();await search();return;}
    if(f.id==='trip-form'){
      if(f.dataset.submitting==='true')return;f.dataset.submitting='true';
      const q=await budgetQuoteForSubmit(f);if(!q){delete f.dataset.submitting;return;}
      const previous=structuredClone(data);
      const days=Number(v.get('days')),name=String(v.get('title')).trim();if(!name||days<1||days>30){delete f.dataset.submitting;return;}
      const start=(new Date(String(v.get('date'))+'T09:00:00').getTime()/1000)-978307200;
      if(f.dataset.edit==='true'){
        const target=data.trips.find(x=>x.id===f.dataset.tripId);if(!target){delete f.dataset.submitting;return;}
        const changed=target.budgetKRW!==q.totalKRW;
        Object.assign(target,{title:name,city:String(v.get('city')).trim(),startDate:start,budgetKRW:q.totalKRW,isSample:false});rememberBudgetQuote(target,q,changed);
      }else{
        const tr={id:uuid(),title:name,city:String(v.get('city')).trim(),startDate:start,budgetKRW:q.totalKRW,expenses:[],isSample:false,days:Array.from({length:days},()=>({id:uuid(),startMinutes:540,stops:[]}))};
        data.trips.push(tr);data.selectedTripID=tr.id;dayIndex=0;tab='plan';rememberBudgetQuote(tr,q);
      }
      if(await save()){modal.close();render();}
      else{data=previous;delete f.dataset.submitting;await updateBudgetPreview();}
      return;
    }
    if(f.id==='budget-form'){
      if(f.dataset.submitting==='true')return;f.dataset.submitting='true';
      const q=await budgetQuoteForSubmit(f);
      const target=data.trips.find(x=>x.id===f.dataset.tripId);
      if(!q||!target){delete f.dataset.submitting;return;}
      if(target.budgetKRW!==budgetDraft.baseKRW){budgetDraft.baseKRW=target.budgetKRW;delete f.dataset.submitting;await updateBudgetPreview();toast(t('The budget changed. Review the new total.','예산이 변경됐습니다. 새 합계를 확인해주세요.'));return;}
      const previous=structuredClone(data);
      target.budgetKRW=q.totalKRW;rememberBudgetQuote(target,q);
      if(await save()){modal.close();render();toast(t('Budget added','예산을 추가했어요'));}
      else{data=previous;delete f.dataset.submitting;await updateBudgetPreview();}
      return;
    }
    if(f.id==='add-place-form'){const p=findPlace(f.dataset.id);dayIndex=Number(v.get('day'));if(p&&day()){day().stops.push({id:uuid(),place:p,stayMinutes:60,mode:'transit',durationSource:'manual',note:''});toast(t(`Added to Day ${dayIndex+1}`,`${dayIndex+1}일차에 추가했어요`));}}
    if(f.id==='stop-form'){const s=day().stops.find(x=>x.id===f.dataset.id);const travel=String(v.get('travel'));const changed=s.mode!==v.get('mode')||String(s.travelMinutes??'')!==travel;let note=mergeTransitNote(String(v.get('note')),readTransitNote(s.note).plan,readTransitNote(s.note).summary,readTransitNote(s.note).kind);if(changed)note=setTransitManualTime(note,travel===''?null:Number(travel));s.stayMinutes=Number(v.get('stay'));s.mode=String(v.get('mode'));s.note=note;if(changed){if(travel==='')delete s.travelMinutes;else s.travelMinutes=Number(travel);s.durationSource='manual';}}
    if(f.id==='expense-form'){
      if(f.dataset.submitting==='true'||expenseDraft?.form!==f)return;
      f.dataset.submitting='true';
      const oldQuote=expenseDraft.quote;
      const quote=await updateExpensePreview({refresh:oldQuote?.source==='latest'&&now()-oldQuote.rate.fetchedAt>60});
      if(!quote||quote.fingerprint!==expenseFingerprint(f)){delete f.dataset.submitting;return;}
      const values=new FormData(f),merchant=String(values.get('merchant')).trim();
      const target=data.trips.find(x=>x.id===f.dataset.tripId),expenseDay=Number(values.get('day'));
      if(!merchant||!target||!Number.isInteger(expenseDay)||expenseDay<0||expenseDay>=target.days.length){delete f.dataset.submitting;return;}
      const fingerprint=values.get('fingerprint');
      if(fingerprint&&data.trips.flatMap(x=>x.expenses).some(e=>e.sourceFingerprint===fingerprint)){
        delete f.dataset.submitting;toast(t('This message is already recorded.','이미 기록한 메시지입니다.'));return;
      }
      const previous=structuredClone(data);
      const expense={id:uuid(),merchant,amountKRW:quote.amountKRW,category:String(values.get('category')),dayIndex:expenseDay,createdAt:now(),...(fingerprint?{sourceFingerprint:fingerprint}:{})};
      target.expenses.push(expense);
      if(quote.source!=='none')data.rates[expenseRateKey(expense.id,quote)]=quote.rate;
      if(quote.source==='latest')data.rates[quote.rate.currency]=quote.rate;
      if(await save()){modal.close();render();toast(t('Expense recorded at the selected rate','선택한 환율로 경비를 저장했어요'));}
      else{data=previous;delete f.dataset.submitting;await updateExpensePreview();}
      return;
    }
    if(f.id==='start-form'){const [hours,minutes]=String(v.get('time')).split(':').map(Number);day().startMinutes=hours*60+minutes;}
    if(f.id==='import-form'){
      if(!native){toast(t('Enter the amount manually in the web version.','웹에서는 금액을 직접 입력해주세요.'));return;}
      const proposal=await bridge('parseExpense',{text:String(v.get('message'))});expenseModal(proposal);return;
    }
    if(await save()){modal.close();render();}
  }catch(e){toast(t('Could not complete that action. Please try again.','작업을 완료하지 못했습니다. 다시 시도해주세요.'));}
});
document.addEventListener('click',async e=>{
  const anchor=e.target.closest('a[target="_blank"]');
  if(anchor&&native){e.preventDefault();try{await external(anchor.href);}catch{}return;}
  const el=e.target.closest('[data-action]');if(!el)return;
  const a=el.dataset.action,id=el.dataset.id;
  try{
    if(a==='close'){modal.close();return;}
    if(a==='tab'){tab=id;render();window.scrollTo(0,0);return;}
    if(['explore','budget'].includes(a)){tab=a;render();window.scrollTo(0,0);return;}
    if(a==='day'){dayIndex=Number(el.dataset.index);render();return;}
    if(a==='language'){languageModal();return;}
    if(a==='selectLanguage'){data.language=el.dataset.language;modal.close();languageModal();return;}
    if(a==='confirmLanguage'){data.hasSelectedLanguage=true;if(await save()){modal.close();render();}return;}
    if(a==='trips'){tripModal();return;}
    if(a==='selectTrip'){data.selectedTripID=id;dayIndex=0;await save();modal.close();render();return;}
    if(a==='newTrip'){if(modal.open)modal.close();newTripModal();return;}
    if(a==='editTrip'){newTripModal(true);return;}
    if(a==='addBudget'){addBudgetModal();return;}
    if(a==='refreshBudgetRate'){await updateBudgetPreview({refresh:true});return;}
    if(a==='category'){query=el.dataset.query;render();$('#placeSearchField').blur();await search();return;}
    if(a==='place'){placeModal(findPlace(id));return;}
    if(a==='editStop'){editStopModal(id);return;}
    if(a==='routeMap'){await journeyViewer.open(id);return;}
    if(a==='route'||a==='autoRoute'){await autoPlanner.open(id);return;}
    if(a==='mixed'){await mixedPlanner.open(id);return;}
    if(a==='bus'){await busPlanner.open(id);return;}
    if(a==='subway'){await metroPlanner.open(id);return;}
    if(a==='copyAddress'){const p=findPlace(el.dataset.place);if(native)await bridge('copy',{text:p.address});else await navigator.clipboard.writeText(p.address);toast(t('Address copied','주소를 복사했어요'));return;}
    if(a==='placeMap'){const p=findPlace(el.dataset.place);if(p)placeMapViewer.open([p]);return;}
    if(a==='stopMap'){const p=day().stops.find(s=>s.id===id)?.place;if(p)placeMapViewer.open([p]);return;}
    if(a==='tripMap'){placeMapViewer.open(day()?.stops.map(s=>s.place)||[]);return;}
    if(a==='refreshRoutes'){await refreshRoutes(id);return;}
    if(a==='moveUp'){const d=day(),i=d.stops.findIndex(s=>s.id===id);if(i>0){[d.stops[i],d.stops[i-1]]=[d.stops[i-1],d.stops[i]];invalidateTransitDay(d);await save();render();}return;}
    if(a==='removeStop'){day().stops=day().stops.filter(s=>s.id!==id);invalidateTransitDay(day());await save();modal.close();render();return;}
    if(a==='dayStart'){openModal(`${modalTop(t('Start your day','하루 시작 시간'))}<form id="start-form" class="form-grid"><label>${t('Start time','시작 시간')}<input name="time" type="time" required value="${clock(day().startMinutes)}"></label><button type="submit" class="primary">${t('Save','저장')}</button></form>`);return;}
    if(a==='newExpense'){expenseModal();return;}
    if(a==='refreshExpenseRate'){await updateExpensePreview({refresh:true});return;}
    if(a==='importExpense'){openModal(`${modalTop(t('Review a payment message','결제 메시지 확인'))}<p class="note" style="margin-bottom:15px">${t('Paste one KRW purchase. The original message is not saved.','원화 결제 메시지 한 건을 붙여넣으세요. 원문은 저장하지 않습니다.')}</p><form id="import-form" class="form-grid"><label>${t('Message','메시지')}<textarea name="message" required maxlength="10000"></textarea></label><button class="primary" type="submit">${t('Review amount','금액 확인')}</button></form>`);return;}
    if(a==='deleteExpense'){openModal(`${modalTop(t('Delete this expense?','이 경비를 삭제할까요?'))}<div class="dialog-actions">${btn('close',t('Cancel','취소'))}${btn('confirmDeleteExpense',t('Delete','삭제'),'danger',`data-id="${id}"`)}</div>`);return;}
    if(a==='confirmDeleteExpense'){removeExpenseFX([id]);trip().expenses=trip().expenses.filter(x=>x.id!==id);await save();modal.close();render();return;}
    if(a==='deleteTrip'){modal.close();openModal(`${modalTop(t('Delete this trip?','이 여행을 삭제할까요?'))}<p class="note">${t('Its itinerary and expenses will be removed from this device.','이 기기의 여행 일정과 경비가 삭제됩니다.')}</p><div class="dialog-actions">${btn('close',t('Cancel','취소'))}${btn('confirmDeleteTrip',t('Delete','삭제'),'danger')}</div>`);return;}
    if(a==='confirmDeleteTrip'){const id=trip().id;removeExpenseFX(trip().expenses.map(e=>e.id));delete data.rates['budget-manual:'+id];delete data.rates['budget-latest:'+id];data.trips=data.trips.filter(x=>x.id!==id);data.selectedTripID=data.trips[0]?.id;dayIndex=0;await save();modal.close();render();return;}
    if(a==='fx'){await loadFX();return;}
    if(a==='share'){await shareText(exportText());return;}
    if(a==='backup'){await shareText(JSON.stringify(data,null,2),'TripFlow-backup.json');return;}
    if(a==='restore'){$('#restore-file').click();return;}
    if(a==='confirmRestore'){data=window.__pendingRestore;delete window.__pendingRestore;dayIndex=0;if(await save()){modal.close();render();}return;}
    if(a==='retrySave'){await save();return;}
    if(a==='refreshWeb'){if(await save())location.reload();return;}
    if(a==='offline'){await bridge('offline');return;}
  }catch(e){if(e?.name!=='AbortError')toast(t('Could not complete that action. Please try again.','완료하지 못했습니다. 다시 시도해주세요.'));}
});
async function loadFX(){
  const currency=data.homeCurrency;
  toast(t('Loading reference rate…','기준환율을 불러오는 중…'));
  const rate=await requestRate(currency);
  data.rates[currency]=rate;await save();render();toast(t('Reference rate updated','기준환율을 갱신했어요'));
}
modal.addEventListener('cancel',e=>{if(modal.dataset.locked==='true')e.preventDefault();});
modal.addEventListener('close',()=>{if(data)render();});
window.addEventListener('online',()=>data&&render());window.addEventListener('offline',()=>data&&render());
window.TripFlow={resume:async()=>{
  if(modal.open||saveFailed)return;
  const r=revision;try{const response=await fetch(new URL('./version.json?ts='+Date.now(),location.href),{cache:'no-store'});if(!response.ok)return;const v=await response.json();if(v.bridge<=1&&v.version!==VERSION&&revision===r){await saveQueue;if(!saveFailed&&!modal.open&&revision===r)location.reload();}}catch{}
}};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')window.TripFlow.resume();});
async function start(){
  try{
    if(native){const bootstrap=await bridge('bootstrap');data=bootstrap.data;catalog=bootstrap.catalog;nativeFeatures=bootstrap.features||{};}
    else{
      const response=await fetch('./catalog.json');if(!response.ok)throw Error('catalog');catalog=await response.json();
      const raw=localStorage.getItem('tripflow-v1');
      if(raw){data=JSON.parse(raw);if(!validState(data))throw Error('saved-data');}
      else data=sampleState(catalog,navigator.languages?.some(x=>x.startsWith('ko'))?'ko':'en');
    }
    if(!validState(data))throw Error('saved-data');render();if(data.hasSelectedLanguage!==true)languageModal();
  }catch{root.innerHTML=`<main class="boot"><h1>TripFlow Korea</h1><p>여행을 불러오지 못했습니다.<br>Could not open your trip. Existing data was kept.</p><button class="primary" onclick="location.reload()" style="margin-top:20px">다시 시도 / Retry</button></main>`;root.removeAttribute('aria-busy');}
}
start();
