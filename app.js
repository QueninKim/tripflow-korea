import {uuid,now,toDate,escapeHTML as h,arrivals,clock,validState,invalidate,sampleState} from './core.js?v=web-2';

const VERSION='web-2';
const native=!!window.webkit?.messageHandlers?.tripflow;
const bridge=(command,payload={})=>window.webkit.messageHandlers.tripflow.postMessage({command,...payload});
const $=s=>document.querySelector(s);
const root=$('#app'),modal=$('#modal');
let data,catalog=[],tab='plan',dayIndex=0,query='',area='대한민국',results=[],searching=false,searchError='',searched=false;
let generation=0,debounce,toastTimer,saveQueue=Promise.resolve(),saveFailed=false,revision=0;
let lastSearchAt=0,abortSearch,activeSearchKey;
const cache=new Map();
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
function planPage(){
  const tr=trip();
  if(!tr)return `<div class="intro"><div class="eyebrow">YOUR NEXT CHAPTER</div><h1>${t('Make room for Korea.','한국 여행을 시작해볼까요?')}</h1></div><div class="empty"><h2>${t('A trip of your own','나만의 여행')}</h2><p>${t('Give your trip a name, then collect the places you want to go.','여행 이름을 정하고 가고 싶은 장소를 모아보세요.')}</p>${btn('newTrip',t('Create a trip','여행 만들기'),'primary')}</div>`;
  if(dayIndex>=tr.days.length)dayIndex=0;
  const d=day(),times=arrivals(d),spent=tr.expenses.reduce((s,e)=>s+e.amountKRW,0);
  return `<div class="trip-heading"><div><div class="eyebrow">${t('A LITTLE FURTHER, A LITTLE SLOWER','내 속도로, 더 가까이')}</div><h1 style="margin-top:11px">${h(title(tr))}</h1><div class="row wrap trip-meta">${pill(cityName(tr.city))}${pill(toDate(tr.startDate).toLocaleDateString(data.language==='ko'?'ko-KR':'en-US',{month:'short',day:'numeric'}))}${pill(tr.days.length+t(' days','일'))}</div></div></div>
  <div class="day-tabs" aria-label="${t('Travel days','여행 날짜')}">${tr.days.map((d,i)=>btn('day',t('Day ','')+(i+1)+t('','일차'),i===dayIndex?'active':'',`data-index="${i}"`)).join('')}</div>
  <div class="plan-layout"><section><div class="row between"><h2>${t('Today, at your pace.','오늘, 나의 속도로.')}</h2>${btn('dayStart',clock(d.startMinutes),'text-btn',`aria-label="${t('Change start time','시작 시간 변경')}"`)}</div><div class="itinerary">${d.stops.length?d.stops.map((s,i)=>`<article class="stop"><div class="time">${clock(times[i])}</div><div class="panel">${i?`<div class="route-label">${h(modeName(s.mode))} · ${s.travelMinutes==null?t('Time not set','이동시간 미정'):s.travelMinutes+t(' min','분')+' · '+h(sourceName(s.durationSource))}</div>`:''}<div class="stop-title"><button data-action="editStop" data-id="${s.id}">${h(placeName(s.place))}</button><span class="muted">${i+1}</span></div><p class="address muted">${h(s.place.address)}</p><div class="row wrap">${pill(t('Stay ','체류 ')+s.stayMinutes+t(' min','분'))}${s.note?`<small>${h(s.note)}</small>`:''}</div><div class="stop-tools">${btn('editStop',t('Edit','수정'),'text-btn',`data-id="${s.id}"`)}${btn('stopMap',t('Map ↗','지도 ↗'),'text-btn',`data-id="${s.id}"`)}${i?btn('route',t('Directions ↗','길찾기 ↗'),'text-btn',`data-id="${s.id}"`):''}${i?btn('moveUp','↑','text-btn',`data-id="${s.id}" aria-label="${t('Move earlier','앞으로 이동')}"`):''}</div></div></article>`).join(''):`<div class="empty"><h3>${t('The day is yours.','아직 비어 있는 하루예요.')}</h3><p>${t('Start with a place that catches your eye.','마음이 가는 장소부터 추가해보세요.')}</p></div>`}</div><div class="row wrap" style="margin-top:20px">${btn('explore',t('＋ Add a place','＋ 장소 추가'),'primary')}${btn('tripMap',t('⌖ See map','⌖ 지도 보기'))}${btn('refreshRoutes',t('Update travel times','이동시간 조회'),'text-btn')}</div><p class="note" style="margin-top:13px">${t('A dash means travel time is unknown. Sample times are labelled. Check transit directions in Kakao Maps.','— 표시는 이동시간 미정입니다. 예시 시간은 별도 표시됩니다. 대중교통 경로는 카카오맵에서 확인하세요.')}</p></section>
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
  const spent=tr.expenses.reduce((sum,e)=>sum+e.amountKRW,0),percent=tr.budgetKRW?Math.min(100,spent/tr.budgetKRW*100):0;
  return `<div class="intro"><div class="eyebrow">MORE MEMORIES, LESS MATH</div><h1>${t('A little peace of mind.','여행 경비, 한눈에.')}</h1><p>${h(title(tr))} · ${t('All expenses stay on your device.','경비는 이 기기에 저장됩니다.')}</p></div><div class="budget-grid"><div class="panel summary-card"><div class="eyebrow">${t('REMAINING','남은 예산')}</div><div class="money">${krw(tr.budgetKRW-spent)}</div><small>${h(homeMoney(tr.budgetKRW-spent))}</small><div class="budget-bar"><span style="width:${percent}%"></span></div><small>${t('Budget','전체 예산')} ${krw(tr.budgetKRW)}</small></div><div class="panel"><div class="eyebrow">${t('SPENT SO FAR','지금까지 지출')}</div><div class="money">${krw(spent)}</div><p class="muted" style="margin-top:8px">${tr.expenses.length}${t(' expenses recorded','건 기록')}</p><div class="row wrap" style="margin-top:16px">${btn('newExpense',t('＋ Record expense','＋ 경비 기록'),'primary')}${btn('importExpense',t('Paste payment message','결제 메시지 붙여넣기'),'text-btn')}</div></div></div><div class="section-heading"><h2>${t('The little things add up.','차곡차곡 모인 기록')}</h2>${btn('editTrip',t('Edit budget','예산 수정'),'text-btn')}</div><div class="panel">${tr.expenses.length?[...tr.expenses].reverse().map(e=>`<article class="expense"><span class="place-icon" aria-hidden="true" style="height:44px;width:44px;font-size:20px">${e.category==='Food & drink'?'☕':'▱'}</span><div><strong>${h(e.merchant)}</strong><small>${h(catName(e.category))} · ${t('Day ','')+(e.dayIndex+1)+t('','일차')}</small></div><div class="amount">${krw(e.amountKRW)}<small>${h(homeMoney(e.amountKRW))}</small></div><button class="delete" data-action="deleteExpense" data-id="${e.id}" aria-label="${t('Delete expense','경비 삭제')}">×</button></article>`).join(''):`<div class="empty"><p>${t('Your first coffee, train ride or market lunch. Record it here.','첫 커피, 기차표, 시장 점심부터 기록해보세요.')}</p></div>`}</div>`;
}
function toolsPage(){
  const rate=data.rates[data.homeCurrency];
  const link=(url,name,desc)=>`<a href="${url}" target="_blank" rel="noopener noreferrer" class="tool-link"><div><strong>${name}</strong><br><span>${desc}</span></div>↗</a>`;
  return `<div class="intro"><div class="eyebrow">A FEW THINGS, SORTED</div><h1>${t('Travel a little lighter.','조금 더 가볍게 떠나요.')}</h1><p>${t('The useful bits, all in one place.','여행에 필요한 것들을 한곳에 모았어요.')}</p></div><div class="tools-grid"><section class="panel stack"><div class="eyebrow">${t('YOUR PREFERENCES','나의 여행 설정')}</div><div class="row between"><strong>${t('Language','언어')}</strong>${btn('language',data.language==='ko'?'한국어':'English')}</div><label class="row between"><strong>${t('Home currency','기준 통화')}</strong><select id="homeCurrency" aria-label="${t('Home currency','기준 통화')}" style="padding:12px;border:1px solid var(--line);border-radius:12px;background:white">${['USD','EUR','JPY','GBP','CNY','AUD','CAD','SGD'].map(c=>`<option ${data.homeCurrency===c?'selected':''}>${c}</option>`).join('')}</select></label><p class="note">${rate?`1 ${h(rate.currency)} = ${krw(rate.krwPerUnit)} · ${h(rate.referenceDate)}`:t('No reference rate loaded.','저장된 기준환율이 없습니다.')}<br>${t('Reference rates from Frankfurter. Card charges and fees may differ.','Frankfurter 기준환율입니다. 카드 적용 환율·수수료와 다를 수 있습니다.')}</p>${btn('fx',t('Refresh exchange rate','환율 새로고침'))}</section><section class="panel"><div class="eyebrow">${t('GETTING AROUND','한국에서 이동하기')}</div>${link('https://map.kakao.com',t('Kakao Maps','카카오맵'),t('Local routes and transit','국내 길찾기·대중교통'))}${link('https://www.letskorail.com/ebizbf/EbizBfTicketSearch.do',t('KORAIL','코레일'),t('Intercity train tickets','도시 간 철도 승차권'))}${link('https://www.lotterentacar.net/hp/eng/main/index.do',t('LOTTE Rent-a-Car','롯데렌터카'),t('Check licence and age requirements','운전면허·연령 조건 확인'))}${link('https://www.socar.kr',t('SOCAR','쏘카'),t('Check eligibility before booking','이용 자격 확인 후 예약'))}</section><section class="panel stack"><div class="eyebrow">${t('YOUR TRIP, YOUR DEVICE','나의 여행, 나의 기기')}</div><p class="note">${t('Trips and expenses are saved on this device, not published on this website. Safari and the iPhone app keep separate storage. Export a backup before removing the app or clearing browser data.','일정과 경비는 이 기기에 저장되며 홈페이지에 공개되지 않습니다. Safari와 아이폰 앱은 저장 공간이 다릅니다. 앱 삭제나 브라우저 데이터 정리 전 백업을 내보내세요.')}</p><div class="row wrap">${btn('backup',t('Export backup','백업 내보내기'))}${btn('restore',t('Restore backup','백업 불러오기'))}</div>${btn('retrySave',t('Save again','다시 저장'),'text-btn')}${btn('refreshWeb',t('Check for a website update','웹 화면 새로고침'),'text-btn')}${native?btn('offline',t('Open offline native view','오프라인 화면 열기'),'text-btn'):''}<input id="restore-file" type="file" accept="application/json,.json" hidden></section><section class="panel stack"><div class="eyebrow">${t('GOOD TO KNOW','알아두세요')}</div><p class="note">${t('Transit times are entered manually or checked through Kakao Maps. Walking and driving times can be requested in the iPhone app. No SMS access or automatic payment collection is used.','대중교통 시간은 직접 입력하거나 카카오맵에서 확인합니다. 아이폰 앱에서 도보·자동차 이동시간을 조회할 수 있습니다. 문자 자동 열람·결제 자동 수집은 사용하지 않습니다.')}</p>${btn('share',t('Share itinerary','여행 일정 공유'),'text-btn')}<p class="footer-version">TripFlow Korea · ${VERSION}${native?' · iPhone':''}</p></section></div>`;
}
function openModal(content,{locked=false}={}){
  modal.innerHTML=content;modal.dataset.locked=locked?'true':'false';modal.showModal();
}
function modalTop(title,locked=false){return `<div class="modal-top"><h2 id="modal-title">${title}</h2>${locked?'':btn('close','×','icon-btn',`aria-label="${t('Close','닫기')}"`)}</div>`;}
function languageModal(){
  const locked=data.hasSelectedLanguage!==true;
  openModal(`${modalTop('언어 / Language',locked)}<p class="muted">언어를 선택하세요.<br>Choose your language.</p>${[['ko','한국어','Korean'],['en','English','영어']].map(([code,name,hint])=>btn('selectLanguage',`${name}<span>${hint} ${data.language===code?'✓':''}</span>`,'language-choice'+(data.language===code?' selected':''),`data-language="${code}" id="languageChoice-${code}"`)).join('')}<p class="note" style="margin-top:19px">언제든 변경할 수 있어요.<br>You can change this anytime.</p>${btn('confirmLanguage','선택 완료 / Continue','primary full',`style="margin-top:18px" id="confirmLanguage"`)}`,{locked});
}
function tripModal(){openModal(`${modalTop(t('Your trips','나의 여행'))}${data.trips.map(tr=>btn('selectTrip',`${h(title(tr))}<small>${h(cityName(tr.city))} · ${tr.days.length}${t(' days','일')}</small>`,'trip-option',`data-id="${tr.id}"`)).join('')}${btn('newTrip',t('＋ New trip','＋ 새 여행'),'primary full')}`);}
function newTripModal(edit=false){
  const tr=edit?trip():null;
  openModal(`${modalTop(edit?t('Trip settings','여행 설정'):t('A new adventure','새로운 여행'))}<form id="trip-form" class="form-grid" data-edit="${edit}"><label>${t('Trip name','여행 이름')}<input name="title" maxlength="100" required placeholder="${t('My Korea trip','나의 한국 여행')}" value="${h(tr?.title||'')}"></label><label>${t('City or region','도시·지역')}<input name="city" maxlength="80" required value="${h(tr?.city||t('Seoul','서울'))}"></label><div class="field-pair"><label>${t('Start date','출발일')}<input type="date" name="date" required value="${dateInput(tr?toDate(tr.startDate):new Date())}"></label><label>${t('Days','여행일수')}<input type="number" name="days" min="1" max="30" required value="${tr?.days.length||3}" ${edit?'readonly':''}></label></div><label>${t('Budget (KRW)','예산 (원)')}<input type="number" inputmode="numeric" name="budget" min="0" max="1000000000" step="1" required value="${tr?.budgetKRW??450000}"></label><button class="primary" type="submit">${t(edit?'Save':'Create',edit?'저장':'만들기')}</button></form>${edit?btn('deleteTrip',t('Delete this trip','이 여행 삭제'),'text-btn',`style="color:#a73a2a;margin-top:15px"`):''}`);
}
function dateInput(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function placeModal(p){
  openModal(`${modalTop(t('A closer look','장소 자세히'))}<div class="eyebrow">${h(catName(p.category))}</div><h2 style="margin:12px 0">${h(placeName(p))}</h2><p class="muted">${h(p.address)}</p><div class="row wrap" style="margin:18px 0">${btn('copyAddress',t('Copy address','주소 복사'),'text-btn',`data-place="${h(p.id)}"`)}<a href="${placeURL(p)}" target="_blank" rel="noopener">${t('Kakao Maps ↗','카카오맵 ↗')}</a></div>${trip()?`<form id="add-place-form" class="form-grid" data-id="${h(p.id)}"><label>${t('Add to day','추가할 날짜')}<select name="day">${trip().days.map((_,i)=>`<option value="${i}" ${i===dayIndex?'selected':''}>${t('Day ','')+(i+1)+t('','일차')}</option>`).join('')}</select></label><button class="primary" type="submit">${t('Add to my itinerary','내 일정에 추가')}</button></form>`:`${btn('newTrip',t('Create a trip first','먼저 여행 만들기'),'primary full')}`}`);
}
function editStopModal(id){
  const s=day().stops.find(s=>s.id===id);if(!s)return;
  openModal(`${modalTop(h(placeName(s.place)))}<form id="stop-form" data-id="${id}" class="form-grid"><label>${t('Stay (minutes)','머무는 시간 (분)')}<input type="number" name="stay" min="0" max="1440" step="1" value="${s.stayMinutes}" required></label><label>${t('Travel from previous stop','이전 장소에서 이동')}<select name="mode">${['transit','walking','driving'].map(m=>`<option value="${m}" ${m===s.mode?'selected':''}>${modeName(m)}</option>`).join('')}</select></label><label>${t('Travel time (minutes, leave blank if unknown)','이동시간 (분, 미정이면 비우세요)')}<input type="number" name="travel" min="0" max="2880" step="1" value="${s.travelMinutes??''}"></label><label>${t('Notes','메모')}<textarea name="note" maxlength="2000">${h(s.note)}</textarea></label><button type="submit" class="primary">${t('Save','저장')}</button></form>${btn('removeStop',t('Remove from itinerary','일정에서 삭제'),'text-btn',`data-id="${id}" style="color:#a73a2a;margin-top:15px"`)}`);
}
function expenseModal(proposal=null){
  openModal(`${modalTop(t('Record an expense','경비 기록'))}${proposal?`<p class="note" style="margin-bottom:18px">${t('Review the proposed amount before saving.','금액을 확인한 뒤 저장해주세요.')}</p>`:''}<form id="expense-form" class="form-grid"><label>${t('Merchant / description','사용처·내용')}<input name="merchant" id="merchantField" maxlength="120" required placeholder="${t('Lunch in Seoul','서울에서 점심')}"></label><label>${t('Amount (KRW)','금액 (원)')}<input type="number" name="amount" id="amountField" inputmode="numeric" min="1" max="1000000000" step="1" required value="${proposal?.amountKRW||''}"></label><div class="field-pair"><label>${t('Category','분류')}<select name="category">${['Food & drink','Transport','Stay','Shopping','Activities','Other'].map(c=>`<option value="${c}">${h(catName(c))}</option>`).join('')}</select></label><label>${t('Day','여행일')}<select name="day">${trip().days.map((_,i)=>`<option value="${i}" ${i===dayIndex?'selected':''}>${t('Day ','')+(i+1)+t('','일차')}</option>`).join('')}</select></label></div>${proposal?`<input type="hidden" name="fingerprint" value="${h(proposal.fingerprint)}">`:''}<button class="primary" type="submit">${t('Save','저장')}</button></form>`);
}
function findPlace(id){return results.find(p=>p.id===id)||catalog.find(p=>p.id===id)||trip()?.days.flatMap(d=>d.stops).find(s=>s.place.id===id)?.place;}
function placeURL(p){return `https://map.kakao.com/link/map/${encodeURIComponent(p.koreanName||p.name)},${p.latitude},${p.longitude}`;}
function external(url){if(native)return bridge('open',{url});window.open(url,'_blank','noopener');}
function exportText(){const tr=trip();if(!tr)return '';return `${title(tr)}\n${cityName(tr.city)} · ${tr.days.length}${t(' days','일')}\n\n`+tr.days.map((d,i)=>{const a=arrivals(d);return t('DAY ','여행일 ')+(i+1)+'\n'+d.stops.map((s,j)=>`${clock(a[j])}  ${placeName(s.place)}\n${s.place.address}\n${t('Stay','체류')} ${s.stayMinutes}${t(' min','분')}${j?' · '+modeName(s.mode)+' '+(s.travelMinutes??t('unknown','미정'))+' '+sourceName(s.durationSource):''}${s.note?'\n'+s.note:''}`).join('\n\n');}).join('\n\n');}
async function shareText(text,name='TripFlow-itinerary.txt'){
  if(native)return bridge('share',{text,name});
  if(navigator.share)return navigator.share({title:'TripFlow Korea',text});
  download(text,name,'text/plain');
}
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
async function refreshRoutes(){
  if(!native){toast(t('Use directions or enter travel times. Automatic driving / walking estimates are available in the iPhone app.','길찾기를 보거나 시간을 직접 입력해주세요. 도보·자동차 시간 조회는 아이폰 앱에서 지원합니다.'));return;}
  const d=day();if(!d||d.stops.length<2)return;
  const before=JSON.stringify(d),tripID=trip().id,dayID=d.id;
  toast(t('Checking walking and driving routes…','도보·자동차 이동시간을 확인 중…'));
  const response=await bridge('routes',{day:d});
  const current=data.trips.find(x=>x.id===tripID)?.days.find(x=>x.id===dayID);
  if(!current||JSON.stringify(current)!==before){toast(t('The itinerary changed. Please try again.','일정이 변경됐습니다. 다시 조회해주세요.'));return;}
  for(const r of response){const s=current.stops.find(x=>x.id===r.id);if(s){s.travelMinutes=r.minutes;s.durationSource=r.source;}}
  await save();render();toast(t(`Updated ${response.length} route(s). Check other times in Kakao Maps.`,`${response.length}개 경로를 갱신했습니다. 나머지는 카카오맵에서 확인하세요.`));
}
root.addEventListener('input',e=>{
  if(e.target.id!=='placeSearchField')return;
  query=e.target.value;generation++;results=[];searchError='';searched=false;searching=false;clearTimeout(debounce);updateSearch();
  if(native&&query.trim().length>=2)debounce=setTimeout(search,650);
});
document.addEventListener('change',async e=>{
  if(e.target.id==='searchAreaPicker'){area=e.target.value;if(query)await search();}
  if(e.target.id==='homeCurrency'){data.homeCurrency=e.target.value;await save();render();}
  if(e.target.id==='restore-file'){
    const file=e.target.files[0];if(!file)return;
    try{if(file.size>2000000)throw Error();const restored=JSON.parse(await file.text());if(!validState(restored))throw Error();openModal(`${modalTop(t('Restore backup?','백업을 불러올까요?'))}<p>${t('This replaces trips on this device. Export your current backup first if you need it.', '이 기기의 여행 목록을 백업 내용으로 바꿉니다. 현재 여행이 필요하면 먼저 백업을 내보내세요.')}</p><div class="dialog-actions">${btn('close',t('Cancel','취소'))}${btn('confirmRestore',t('Restore','불러오기'),'primary')}</div>`);window.__pendingRestore=restored;}
    catch{toast(t('This backup could not be opened.','백업 파일을 열 수 없습니다.'));}
  }
});
document.addEventListener('submit',async e=>{
  const f=e.target;if(!['search-form','trip-form','add-place-form','stop-form','expense-form','start-form','import-form'].includes(f.id))return;e.preventDefault();const v=new FormData(f);
  try{
    if(f.id==='search-form'){query=String(v.get('q'));f.querySelector('input').blur();await search();return;}
    if(f.id==='trip-form'){
      const budget=Number(v.get('budget')),days=Number(v.get('days')),name=String(v.get('title')).trim();if(!name||!Number.isSafeInteger(budget)||budget<0||days<1||days>30)return;
      const start=(new Date(String(v.get('date'))+'T09:00:00').getTime()/1000)-978307200;
      if(f.dataset.edit==='true'){Object.assign(trip(),{title:name,city:String(v.get('city')).trim(),startDate:start,budgetKRW:budget,isSample:false});}
      else{const tr={id:uuid(),title:name,city:String(v.get('city')).trim(),startDate:start,budgetKRW:budget,expenses:[],isSample:false,days:Array.from({length:days},()=>({id:uuid(),startMinutes:540,stops:[]}))};data.trips.push(tr);data.selectedTripID=tr.id;dayIndex=0;tab='plan';}
    }
    if(f.id==='add-place-form'){const p=findPlace(f.dataset.id);dayIndex=Number(v.get('day'));if(p&&day()){day().stops.push({id:uuid(),place:p,stayMinutes:60,mode:'transit',durationSource:'manual',note:''});toast(t(`Added to Day ${dayIndex+1}`,`${dayIndex+1}일차에 추가했어요`));}}
    if(f.id==='stop-form'){const s=day().stops.find(x=>x.id===f.dataset.id);const travel=String(v.get('travel'));const changed=s.mode!==v.get('mode')||String(s.travelMinutes??'')!==travel;s.stayMinutes=Number(v.get('stay'));s.mode=String(v.get('mode'));s.note=String(v.get('note'));if(changed){if(travel==='')delete s.travelMinutes;else s.travelMinutes=Number(travel);s.durationSource='manual';}}
    if(f.id==='expense-form'){const amount=Number(v.get('amount')),merchant=String(v.get('merchant')).trim();if(!merchant||!Number.isSafeInteger(amount)||amount<=0||amount>1000000000)return;const fingerprint=v.get('fingerprint');if(fingerprint&&data.trips.flatMap(x=>x.expenses).some(e=>e.sourceFingerprint===fingerprint)){toast(t('This message is already recorded.','이미 기록한 메시지입니다.'));return;}trip().expenses.push({id:uuid(),merchant,amountKRW:amount,category:String(v.get('category')),dayIndex:Number(v.get('day')),createdAt:now(),...(fingerprint?{sourceFingerprint:fingerprint}:{})});}
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
    if(a==='category'){query=el.dataset.query;render();$('#placeSearchField').blur();await search();return;}
    if(a==='place'){placeModal(findPlace(id));return;}
    if(a==='editStop'){editStopModal(id);return;}
    if(a==='copyAddress'){const p=findPlace(el.dataset.place);if(native)await bridge('copy',{text:p.address});else await navigator.clipboard.writeText(p.address);toast(t('Address copied','주소를 복사했어요'));return;}
    if(a==='stopMap'){await external(placeURL(day().stops.find(s=>s.id===id).place));return;}
    if(a==='route'){const i=day().stops.findIndex(s=>s.id===id);if(i<1)return;const from=day().stops[i-1].place,to=day().stops[i].place,method={transit:'traffic',walking:'walk',driving:'car'}[day().stops[i].mode];await external(`https://map.kakao.com/link/by/${method}/${encodeURIComponent(from.koreanName||from.name)},${from.latitude},${from.longitude}/${encodeURIComponent(to.koreanName||to.name)},${to.latitude},${to.longitude}`);return;}
    if(a==='tripMap'){if(native)await bridge('map',{places:day().stops.map(s=>s.place)});else if(day().stops[0])await external(placeURL(day().stops[0].place));else toast(t('Add a place first.','먼저 장소를 추가해주세요.'));return;}
    if(a==='refreshRoutes'){await refreshRoutes();return;}
    if(a==='moveUp'){const d=day(),i=d.stops.findIndex(s=>s.id===id);if(i>0){[d.stops[i],d.stops[i-1]]=[d.stops[i-1],d.stops[i]];invalidate(d);await save();render();}return;}
    if(a==='removeStop'){day().stops=day().stops.filter(s=>s.id!==id);invalidate(day());await save();modal.close();render();return;}
    if(a==='dayStart'){openModal(`${modalTop(t('Start your day','하루 시작 시간'))}<form id="start-form" class="form-grid"><label>${t('Start time','시작 시간')}<input name="time" type="time" required value="${clock(day().startMinutes)}"></label><button type="submit" class="primary">${t('Save','저장')}</button></form>`);return;}
    if(a==='newExpense'){expenseModal();return;}
    if(a==='importExpense'){openModal(`${modalTop(t('Review a payment message','결제 메시지 확인'))}<p class="note" style="margin-bottom:15px">${t('Paste one KRW purchase. The original message is not saved.','원화 결제 메시지 한 건을 붙여넣으세요. 원문은 저장하지 않습니다.')}</p><form id="import-form" class="form-grid"><label>${t('Message','메시지')}<textarea name="message" required maxlength="10000"></textarea></label><button class="primary" type="submit">${t('Review amount','금액 확인')}</button></form>`);return;}
    if(a==='deleteExpense'){openModal(`${modalTop(t('Delete this expense?','이 경비를 삭제할까요?'))}<div class="dialog-actions">${btn('close',t('Cancel','취소'))}${btn('confirmDeleteExpense',t('Delete','삭제'),'danger',`data-id="${id}"`)}</div>`);return;}
    if(a==='confirmDeleteExpense'){trip().expenses=trip().expenses.filter(x=>x.id!==id);await save();modal.close();render();return;}
    if(a==='deleteTrip'){modal.close();openModal(`${modalTop(t('Delete this trip?','이 여행을 삭제할까요?'))}<p class="note">${t('Its itinerary and expenses will be removed from this device.','이 기기의 여행 일정과 경비가 삭제됩니다.')}</p><div class="dialog-actions">${btn('close',t('Cancel','취소'))}${btn('confirmDeleteTrip',t('Delete','삭제'),'danger')}</div>`);return;}
    if(a==='confirmDeleteTrip'){const id=trip().id;data.trips=data.trips.filter(x=>x.id!==id);data.selectedTripID=data.trips[0]?.id;dayIndex=0;await save();modal.close();render();return;}
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
  let rate;
  if(native)rate=await bridge('fx',{currency});
  else{const response=await fetch(`https://api.frankfurter.dev/v2/rate/${currency.toLowerCase()}/krw`);if(!response.ok)throw Error('fx');const body=await response.json();if(body.base.toUpperCase()!==currency||body.quote.toUpperCase()!=='KRW'||!Number.isFinite(body.rate)||body.rate<=0)throw Error('fx');rate={currency,krwPerUnit:body.rate,referenceDate:body.date,fetchedAt:now()};}
  data.rates[currency]=rate;await save();render();toast(t('Reference rate updated','기준환율을 갱신했어요'));
}
modal.addEventListener('cancel',e=>{if(modal.dataset.locked==='true')e.preventDefault();});
modal.addEventListener('close',()=>{if(data)render();});
window.addEventListener('online',()=>data&&render());window.addEventListener('offline',()=>data&&render());
window.TripFlow={resume:async()=>{
  if(modal.open||saveFailed)return;
  const r=revision;try{const response=await fetch('./version.json',{cache:'no-store'});if(!response.ok)return;const v=await response.json();if(v.bridge<=1&&v.version!==VERSION&&revision===r){await saveQueue;if(!saveFailed&&!modal.open&&revision===r)location.reload();}}catch{}
}};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')window.TripFlow.resume();});
async function start(){
  try{
    if(native){const bootstrap=await bridge('bootstrap');data=bootstrap.data;catalog=bootstrap.catalog;}
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
