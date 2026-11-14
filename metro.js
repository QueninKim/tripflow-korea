import {readMetroNote,metroStatus,metroGraph,metroPaths,findMetroRoutes,validateMetroPlan,metroSummary,routeContainsTransfers,isAutoMetroTime} from './metro-core.js?v=web-11';
import {createNetworkMap} from './metro-map.js?v=web-11';
export * from './metro-core.js?v=web-11';
import {estimateMetroTime,timingSnapshot,projectedArrivals} from './metro-time.js?v=web-11';
import {clock} from './core.js?v=web-11';

export function createMetroPlanner(ctx){
  const {t,h,modal,modalTop,openModal,toast}=ctx;
  let network,layout,timeData,request,draft,map;
  const region=()=>network.regions.find(r=>r.id===draft.region);
  const label=obj=>t(obj.en,obj.ko);
  const name=id=>label(region().stations[id]);
  const serving=id=>region().lines.filter(l=>metroGraph(region()).membership.get(id)?.has(l.id));
  const choice=()=>draft.options[draft.choice];
  const linePill=l=>`<span class="network-line-pill"><i style="background:${l.color}"></i>${h(label(l))}</span>`;
  function recalculate(){
    draft.choice=0;draft.timeMode='auto';draft.manualMinutes='';draft.options=draft.from&&draft.to?findMetroRoutes(region(),{from:draft.from,to:draft.to,vias:draft.vias}):[];
  }
  function autoTime(route=choice()){
    if(!route)return null;
    try{
      const d=ctx.getDay(),i=d?.stops.findIndex(s=>s.id===draft.target);
      return estimateMetroTime(network,timeData,draft.region,route.legs,{fromPlace:i>0?d.stops[i-1].place:undefined,toPlace:i>0?d.stops[i].place:undefined,options:draft.timingOptions});
    }catch(e){return {error:e.message};}
  }
  function timeBadge(route){const q=autoTime(route);return q&&!q.error?t('≈ ','약 ')+q.minutes+t(' min','분'):'';}
  function selectedTime(){
    if(draft.timeMode==='auto')return autoTime();
    const raw=draft.manualMinutes;
    if(raw==='')return {v:1,mode:'manual',minutes:null};
    const minutes=Number(raw);return Number.isInteger(minutes)&&minutes>=0&&minutes<=2880?{v:1,mode:'manual',minutes}:{error:'invalid-time'};
  }
  function timeError(error){
    return error==='station-too-far'?t('The itinerary places are far from the selected stations. Choose closer stations, turn off place-to-station walking, or enter the total time.','일정 장소와 선택한 역이 멀리 떨어져 있습니다. 가까운 역을 고르거나 장소↔역 도보를 끄거나 시간을 직접 입력하세요.'):error==='invalid-time-options'?t('Enter whole waiting / transfer minutes within the allowed range.','대기·환승시간을 허용 범위의 정수로 입력해주세요.'):error==='invalid-time'?t('Enter a whole number from 0 to 2,880 minutes, or leave it unknown.','0~2,880분의 정수를 입력하거나 미정으로 비워주세요.'):t('Could not estimate this time. Check the stations or enter the total time.','시간을 계산하지 못했습니다. 역을 확인하거나 전체 시간을 직접 입력해주세요.');
  }
  function timeQuoteHTML(){
    const q=selectedTime();if(!q)return `<p>${t('Choose a route to calculate its travel time.','경로를 선택하면 이동시간을 자동 계산합니다.')}</p>`;
    if(q.error)return `<p class="time-quote-error" role="alert">${h(timeError(q.error))}</p>`;
    const manual=draft.timeMode==='manual';
    let text=`<span class="eyebrow">${manual?t('ENTERED TRAVEL TIME','직접 입력한 이동시간'):t('AUTOMATIC ESTIMATE','자동 예상 이동시간')}</span><strong>${q.minutes===null?t('Time unknown','이동시간 미정'):q.minutes+t(' min','분')}</strong>`;
    if(!manual){
      text+=`<div class="time-breakdown">${[['ride','Train','열차'],['transfer','Transfer','환승'],['wait','Wait','대기'],['walk','Walk','도보']].map(([key,en,ko])=>`<span>${t(en,ko)}<b>${q.parts[key]}${t(' min','분')}</b></span>`).join('')}</div><p class="note">${q.accessIncluded?t('Includes walking between itinerary places and stations, plus station entry/exit.','일정 장소↔역 사이 도보와 역 승·하차 이동을 포함합니다.'):t('Station entry/exit included. Place-to-station walking is not included.','역 승·하차 이동 포함 · 일정 장소↔역 도보는 미포함입니다.')}<br>${q.modelEdges?t('Includes distance-based running-time estimates.','거리 기반 운행시간 추정 구간이 포함됩니다.'):t('Uses Humetro’s published inter-station reference times.','부산교통공사 역간 기준시간을 사용합니다.')}</p>`;
    }
    const d=ctx.getDay(),i=d?.stops.findIndex(s=>s.id===draft.target);
    if(i>0&&q.minutes!==null){const times=projectedArrivals(d,draft.target,q.minutes);text+=`<div class="time-arrival-preview">${h(ctx.placeName(d.stops[i].place))}<b>${clock(times[i])}</b><small>${times[i]===null?t('Earlier travel times are still unknown.','앞 이동 구간이 미정이라 도착 시각도 미정입니다.'):t('Arrival after saving · later stops update too','저장 후 예상 도착 · 이후 일정도 함께 조정')}</small></div>`;}
    return text;
  }
  function timingFields(){
    const q=selectedTime(),auto=draft.timeMode==='auto',value=auto?(q&&!q.error?q.minutes:''):draft.manualMinutes;
    return `<fieldset class="metro-time-inputs"><legend>${t('Travel time','이동시간')}</legend><label>${t('Calculation','계산 방법')}<select id="metroTimeMode"><option value="auto" ${auto?'selected':''}>${t('Calculate automatically','자동 계산')}</option><option value="manual" ${!auto?'selected':''}>${t('Enter total time','전체 시간 직접 입력')}</option></select></label><div id="metroTimeQuote" class="metro-time-quote" role="status" aria-live="polite">${timeQuoteHTML()}</div><label>${auto?t('Calculated total · minutes','자동 계산한 전체 시간 · 분'):t('Total time · minutes, leave blank if unknown','전체 이동시간 · 분, 미정이면 비우세요')}<input type="number" id="metroMinutes" min="0" max="2880" step="1" value="${h(value)}" ${auto?'readonly':''}></label><details id="metroTimeSettings" ${auto?'':'hidden'}><summary>${t('Walking, waiting & transfer settings','도보·대기·환승시간 조정')}</summary><div class="stack"><label class="time-walk-toggle"><input id="metroIncludeWalk" type="checkbox" ${draft.timingOptions.includeWalk?'checked':''}>${t('Include walks between places and stations','일정 장소↔역 사이 도보 포함')}</label><label>${t('Initial train wait · minutes','첫 열차 대기 · 분')}<input type="number" data-time-option="waitMinutes" min="0" max="60" step="1" value="${h(draft.timingOptions.waitMinutes)}"></label><div class="field-pair"><label>${t('Walk per transfer · min','환승 1회 이동 · 분')}<input type="number" data-time-option="transferWalkMinutes" min="0" max="30" step="1" value="${h(draft.timingOptions.transferWalkMinutes)}"></label><label>${t('Wait per transfer · min','환승 1회 대기 · 분')}<input type="number" data-time-option="transferWaitMinutes" min="0" max="60" step="1" value="${h(draft.timingOptions.transferWaitMinutes)}"></label></div></div></details><p class="note">${t('Planning estimate. Live arrivals, delays and express stopping patterns are not included. Changing the route or itinerary movement restores automatic calculation.','계획용 예상시간입니다. 실시간 도착·지연·급행 정차는 반영하지 않습니다. 경로나 일정 이동 구간을 바꾸면 자동 계산으로 전환됩니다.')}</p></fieldset>`;
  }
  function updateTime(){
    const q=selectedTime();modal.querySelector('#metroTimeQuote').innerHTML=timeQuoteHTML();
    if(draft.timeMode==='auto')modal.querySelector('#metroMinutes').value=q&&!q.error?q.minutes:'';
    modal.querySelector('#networkRoutes').innerHTML=routeHTML();
    const i=ctx.getDay()?.stops.findIndex(s=>s.id===draft.target),button=modal.querySelector('#metro-form [type="submit"]');
    if(button)button.disabled=!choice()||!draft.target||i<1||!!q?.error;
  }
  function routeHTML(){
    if(!draft.from||!draft.to)return `<div class="network-empty"><strong>${t('Your route starts on the map','지도에서 경로를 만들어보세요')}</strong><p>${t('Tap a station, then choose Start, Transfer or End. You can also search for a station.','역을 누른 뒤 출발·환승·도착을 선택하세요. 역 이름으로 검색해도 선택할 수 있어요.')}</p></div>`;
    if(!draft.options.length)return `<p class="network-route-error" role="alert">${t('No connected route follows these transfer choices. Check the region and the order of your transfer stations.','선택한 환승역 순서로 이어지는 경로가 없습니다. 지역과 환승역 순서를 확인해주세요.')}</p>`;
    return `<div class="network-options" role="group" aria-label="${t('Route choices','노선 연결안')}">${draft.options.map((c,i)=>`<button type="button" data-metro="choice" data-index="${i}" class="${draft.choice===i?'selected':''}" aria-pressed="${draft.choice===i}"><span class="network-choice-head">${t('Route ','경로 ')}${i+1}<b class="choice-time">${timeBadge(c)}</b><small>${c.changes}${t(' transfers','회 환승')} · ${c.stops}${t(' station hops','개 역 이동')}</small></span><span class="network-choice-lines">${c.legs.map(leg=>leg[0]).map(id=>linePill(region().lines.find(l=>l.id===id))).join('')}</span></button>`).join('')}</div><ol class="network-route-legs">${choice().legs.map(([id,a,b,next],i)=>{const l=region().lines.find(l=>l.id===id),p=metroPaths(l,a,b).find(p=>p[1]===next);return `<li style="--leg-color:${l.color}"><strong>${h(label(l))}</strong><p>${h(name(a))} → ${h(name(b))}</p><small>${h(name(next))} ${t('direction','방면')} · ${p.length-1}${t(' station hops','개 역 이동')}</small>${i<choice().legs.length-1?`<span class="network-transfer-caption">↔ ${h(name(b))} ${t('transfer','환승')}</span>`:''}</li>`;}).join('')}</ol>`;
  }
  function selections(){
    const row=(role,id,i)=>`<div class="network-waypoint"><b>${role==='from'?t('Start','출발'):role==='to'?t('End','도착'):t('Transfer ','환승 ')+(i+1)}</b><span>${id?h(name(id)):t('Choose on map','지도에서 선택')}</span>${id?`<button type="button" data-metro="clear-point" data-role="${role}" data-index="${i??''}" aria-label="${h((role==='from'?t('Clear start','출발역 삭제'):role==='to'?t('Clear end','도착역 삭제'):t('Remove transfer','환승역 삭제')))}">×</button>`:''}</div>`;
    return `<div class="network-waypoints">${row('from',draft.from)}${draft.vias.map((v,i)=>row('via',v,i)).join('')}${row('to',draft.to)}</div>`;
  }
  function dockHTML(){
    const id=draft.focused;if(!id)return `<p class="network-tap-hint">${t('Tap a station to choose start, transfer or end','역을 누르면 출발·환승·도착을 선택할 수 있어요')}</p>`;
    const s=region().stations[id],ls=serving(id);
    return `<div class="network-station-dock"><div class="row between"><div><strong>${h(name(id))}</strong><small>${h(t(s.ko,s.en))}</small></div><button type="button" data-metro="unfocus" class="text-btn" aria-label="${t('Close station details','역 선택 닫기')}">×</button></div><div class="network-dock-lines">${ls.map(linePill).join('')}</div><div class="network-assign"><button type="button" data-metro="assign-from">${t('Start','출발역')}</button><button type="button" data-metro="assign-via" ${ls.length<2||draft.vias.includes(id)?'disabled':''}>${t('＋ Transfer','＋ 환승역')}</button><button type="button" data-metro="assign-to">${t('End','도착역')}</button></div>${ls.length<2?`<small>${t('Transfer selection is available at stations served by multiple lines.','두 개 이상 노선이 만나는 역에서 환승역을 선택할 수 있어요.')}</small>`:''}${draft.nearby.filter(other=>other!==id).length?`<details class="network-nearby"><summary>${t('Other nearby stations','가까운 다른 역')}</summary>${draft.nearby.filter(other=>other!==id).map(other=>`<button type="button" data-metro="focus" data-id="${h(other)}">${h(name(other))}<small>${serving(other).map(l=>h(label(l))).join(' · ')}</small></button>`).join('')}</details>`:''}</div>`;
  }
  function readableHTML(){
    const r=region(),line=r.lines.find(l=>l.id===draft.readableLine)||r.lines[0];
    const paths=new Set((choice()?.legs||[]).filter(l=>l[0]===line.id).flatMap(([id,a,b,next])=>metroPaths(line,a,b).find(p=>p[1]===next)||[]));
    return `<label class="readable-line-label">${t('Choose a line','크게 볼 노선')}<select id="metroReadableLine">${r.lines.map(l=>`<option value="${h(l.id)}" ${l.id===line.id?'selected':''}>${h(label(l))}</option>`).join('')}</select></label><div class="readable-map" style="--metro-color:${line.color}"><div class="readable-map-head"><i></i><div><strong>${h(label(line))}</strong><small>${t('Tap any station · coloured chips open connecting lines','역을 눌러 선택 · 색상 버튼으로 환승 노선 보기')}</small></div></div><div class="readable-stations" id="readableStations">${line.tracks.map((track,branch)=>`<section class="metro-branch">${line.tracks.length>1?`<h3>${h(name(track[0]))} ↔ ${h(name(track.at(-1)))} ${line.directedTracks.includes(branch)?t('· one direction','· 단방향'):''}</h3>`:''}<ol class="metro-track">${track.map(id=>{const others=serving(id).filter(l=>l.id!==line.id),role=id===draft.from?t('Start','출발'):id===draft.to?t('End','도착'):draft.vias.includes(id)?t('Transfer ','환승 ')+(draft.vias.indexOf(id)+1):'';return `<li class="${paths.has(id)?'on-path ':''}${id===draft.focused?'readable-focused':''}"><button type="button" data-metro="focus" data-id="${h(id)}" aria-label="${h(name(id))}" aria-pressed="${id===draft.focused}"><i class="metro-dot ${others.length?'interchange':''}"></i><span><strong>${h(name(id))}</strong><small>${h(t(r.stations[id].ko,r.stations[id].en))}</small></span>${role?`<b class="metro-endpoint">${role}</b>`:''}</button>${others.length?`<div class="metro-transfers">${others.map(l=>`<button type="button" data-metro="readable-line" data-line="${h(l.id)}" data-id="${h(id)}" style="--transfer-color:${l.color}"><i></i>${h(label(l))} ↗</button>`).join('')}</div>`:''}</li>`;}).join('')}</ol></section>`).join('')}</div></div><div id="networkDock" class="readable-dock">${dockHTML()}</div>`;
  }
  function mapHTML(){
    const r=region();
    const tabs=`<div class="network-view-switch" role="group" aria-label="${t('Subway map view','지하철 노선도 보기 방식')}"><button type="button" data-metro="view" data-view="readable" aria-pressed="${draft.view==='readable'}">${t('Large text · by line','큰 글씨 · 노선별')}</button><button type="button" data-metro="view" data-view="map" aria-pressed="${draft.view==='map'}">${t('Whole network','전체 지도')}</button></div>`;
    if(draft.view==='readable')return tabs+readableHTML();
    return tabs+`<div class="network-map-frame"><div id="metroNetwork" class="metro-network"></div><div class="network-map-buttons"><button type="button" data-metro="zoom-in" aria-label="${t('Zoom in','노선도 확대')}">＋</button><button type="button" data-metro="zoom-out" aria-label="${t('Zoom out','노선도 축소')}">−</button><button type="button" data-metro="fit">${t('All','전체')}</button><button type="button" data-metro="fit-route" ${choice()?'':'disabled'}>${t('Route','경로')}</button><span id="networkZoom">1.0×</span></div><div id="networkDock" class="network-dock-host">${dockHTML()}</div><a class="network-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a></div><div class="network-map-foot"><span>${t('Drag to move · pinch to zoom','끌어서 이동 · 두 손가락으로 확대')}</span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a></div><p class="note">${t('Schematic view: station locations and distances are simplified. Zoom in to see more station names.','역 위치와 거리를 단순화한 개략도입니다. 확대하면 더 많은 역 이름이 표시됩니다.')}</p><details class="network-legend" open><summary>${t('Line colours · tap to highlight','노선 색상 · 눌러서 강조')}</summary><div><button type="button" data-metro="highlight" data-line="" aria-pressed="${!draft.highlight}">${t('All lines','전체 노선')}</button>${r.lines.map(l=>`<button type="button" data-metro="highlight" data-line="${h(l.id)}" aria-pressed="${draft.highlight===l.id}">${linePill(l)}</button>`).join('')}</div></details>`;
  }
  function updateMap(){map?.update({from:draft.from,vias:draft.vias,to:draft.to,focus:draft.focused,route:choice()?.legs||[],line:draft.highlight});}
  function focus(id,nearby=[],zoom=false){
    draft.focused=id;draft.nearby=nearby;
    modal.querySelector('#networkDock').innerHTML=dockHTML();updateMap();if(draft.view==='readable'){if(!serving(id).some(l=>l.id===draft.readableLine))draft.readableLine=serving(id)[0].id;draw();if(zoom)modal.querySelector(`[data-metro="focus"][data-id="${CSS.escape(id)}"]`)?.scrollIntoView({block:'nearest'});}else if(zoom)map?.focus(id);
  }
  function draw(){
    const scroll=modal.open&&modal.classList.contains('metro-modal')?modal.scrollTop:0;
    const stationScroll=modal.querySelector('#readableStations')?.scrollTop;
    const camera=map?.getCamera();map?.destroy();map=null;
    const r=region(),d=ctx.getDay(),targetIndex=d?.stops.findIndex(s=>s.id===draft.target);
    openModal(`${modalTop(t('Full subway map','전체 지하철 노선도'))}<div class="network-heading"><p>${t('See all lines together. Tap stations to build your route.','모든 노선을 한눈에 보고, 역을 눌러 경로를 만드세요.')}</p><span>${r.lines.length}${t(' lines','개 노선')} · ${Object.keys(r.stations).length}${t(' stations','개 역')}</span></div><div class="network-layout"><section class="network-map-column"><div class="network-top-controls form-grid"><label>${t('Region','지역')}<select id="metroRegion" ${draft.from||draft.to||draft.vias.length?'disabled':''}>${network.regions.map(r=>`<option value="${r.id}" ${r.id===draft.region?'selected':''}>${h(label(r))}</option>`).join('')}</select></label><label>${t('Find a station · Korean or English','역 찾기 · 한글·영어')}<input id="metroSearch" type="search" autocomplete="off" placeholder="${t('e.g. Hongik, Seoul, Busan','예: 홍대입구, 서울역, 부산역')}"></label></div><div id="metroSearchResults" class="network-search-results" role="status"></div>${mapHTML()}<details class="network-sources"><summary>${t('Official maps & data sources','공식 노선도·자료 출처')}</summary><p class="note">${t('Line information checked','노선 정보 확인')} ${network.checkedAt}. ${t('Position data: OpenStreetMap; adjusted for this schematic.','위치 자료: OpenStreetMap · 개략도에 맞게 배치 조정.')}</p>${r.sources.map(s=>`<a href="${s.url}" target="_blank" rel="noopener noreferrer">${h(s.name)} ↗</a>`).join('')}<a href="./metro-layout.json" download>Map layout · ODbL-1.0</a>${r.id==='busan'?`<a href="https://www.data.go.kr/data/3033564/fileData.do" target="_blank" rel="noopener">${t('Humetro reference travel times ↗','부산교통공사 역간 기준시간 ↗')}</a>`:''}</details></section><section class="network-route-column"><div class="row between"><h3>${t('My route','내 지하철 경로')}</h3><button type="button" class="text-btn" data-metro="reset">${t('Start over','새로 짜기')}</button></div>${selections()}<div id="networkRoutes">${routeHTML()}</div><form id="metro-form" class="form-grid"><label>${t('Save to itinerary movement','저장할 일정 이동 구간')}<select id="metroTarget" required><option value="">${t('Choose a movement','이동 구간 선택')}</option>${draft.existing&&targetIndex===0?`<option value="${draft.target}" selected>${t('First place · choose a movement or remove','첫 장소 · 이동 구간을 선택하거나 경로를 삭제하세요')}</option>`:''}${d?.stops.slice(1).map((s,i)=>`<option value="${s.id}" ${draft.target===s.id?'selected':''}>${h(ctx.placeName(d.stops[i].place))} → ${h(ctx.placeName(s.place))}</option>`).join('')||''}</select></label>${(d?.stops.length||0)<2?`<p class="note">${t('Add at least two places to this day to save a route.','오늘 일정에 장소를 2곳 이상 추가하면 저장할 수 있어요.')}</p>`:''}${timingFields()}${ctx.getRouteKind?.(draft.target)==='bus'?`<p class="note">${t("Saving replaces this movement’s bus route.","저장하면 이 이동 구간의 기존 버스 경로를 지하철 경로로 바꿉니다.")}</p>`:''}<p id="metroError" role="alert" class="status error"></p><button type="submit" class="primary" ${!choice()||!draft.target||targetIndex<1||selectedTime()?.error?'disabled':''}>${t('Save subway route','지하철 경로 저장')}</button></form>${draft.existing?`<button type="button" data-metro="remove" class="text-btn">${t('Remove saved subway route','저장된 지하철 경로 삭제')}</button>`:''}</section></div>`);
    modal.classList.add('metro-modal','network-modal');
    if(draft.view==='map')map=createNetworkMap({element:modal.querySelector('#metroNetwork'),region:r,layout:layout.regions[r.id],label,t,h,camera:draft.resetCamera?null:camera,onStation:(id,near)=>focus(id,near),onCamera:camera=>{const el=modal.querySelector('#networkZoom');if(el)el.textContent=camera.zoom.toFixed(1)+'×';}});
    if(draft.pick){
      const form=modal.querySelector('#metro-form'),target=form.querySelector('#metroTarget');target.closest('label').hidden=true;target.disabled=true;target.required=false;const timing=form.querySelector('fieldset');timing.hidden=true;timing.disabled=true;for(const p of form.querySelectorAll(':scope > p.note'))p.hidden=true;const button=form.querySelector('[type="submit"]');button.textContent=t('Use this subway section','이 지하철 구간 추가');button.disabled=!choice();modal.querySelector('#metroRegion').disabled=true;modal.querySelector('#modal-title').textContent=t('Pick a subway section','지하철 구간 선택');
    }
    draft.resetCamera=false;updateMap();modal.scrollTop=scroll;
    if(draft.view==='readable'){
      const box=modal.querySelector('#readableStations');
      if(draft.readableScrollLine===draft.readableLine&&stationScroll!==undefined)box.scrollTop=stationScroll;
      else {const id=draft.focused||(choice()?.legs.find(l=>l[0]===draft.readableLine)?.[1])||draft.from,el=id?box.querySelector(`[data-id="${CSS.escape(id)}"]`):null;if(el)box.scrollTop=el.getBoundingClientRect().top-box.getBoundingClientRect().top-65;}
      draft.readableScrollLine=draft.readableLine;
    }
  }
  async function open(target,pick=null){
    try{
      if(!network||!layout||!timeData){
        if(!request)request=Promise.all(['metro-data.json','metro-layout.json','metro-times.json'].map(name=>fetch('./'+name+'?v=web-11').then(r=>{if(!r.ok)throw Error('data');return r.json();}))).catch(e=>{request=null;throw e;});
        [network,layout,timeData]=await request;
      }
      map?.destroy();map=null;
      const d=ctx.getDay(),s=d?.stops.find(s=>s.id===target),parsed=readMetroNote(s?.note);let plan=pick?.plan||parsed.plan;
      try{if(plan)validateMetroPlan(network,plan);}catch{plan=null;}
      const city=ctx.getCity(),id=pick?.region||plan?.region||(/부산|busan|김해|gimhae|울산|ulsan/i.test(city)?'busan':/대구|daegu/i.test(city)?'daegu':/대전|daejeon/i.test(city)?'daejeon':/광주|gwangju/i.test(city)?'gwangju':'capital');
      const r=network.regions.find(r=>r.id===id);
      const legacyVias=plan?.legs.slice(1).map(l=>l[1]).filter((v,i,all)=>metroGraph(r).membership.get(v).size>1&&all.indexOf(v)===i)||[];
      draft={view:'readable',readableLine:plan?.legs[0][0]||r.lines[0].id,region:id,from:plan?.legs[0][1]||'',to:plan?.legs.at(-1)[2]||'',vias:plan?.vias||legacyVias,options:plan?[{legs:structuredClone(plan.legs),changes:plan.legs.length-1,stops:plan.legs.reduce((sum,[id,a,b,next])=>sum+(metroPaths(r.lines.find(l=>l.id===id),a,b).find(p=>p[1]===next)?.length||1)-1,0)}]:[],choice:0,focused:'',nearby:[],highlight:'',target:s?.id||'',timeMode:plan&&(plan.timing?.mode==='manual'||(s?.travelMinutes!=null&&!isAutoMetroTime(s)))?'manual':'auto',manualMinutes:plan?String(s?.travelMinutes??''):'',timingOptions:{...timeData.defaults,...plan?.timing?.options},existing:!!parsed.plan,tripID:ctx.getTripID(),dayID:d?.id,resetCamera:true};
      draft.pick=pick;if(pick){draft.target='';draft.existing=false;draft.timeMode='auto';draft.timingOptions.includeWalk=false;if(!plan&&pick.seedFrom){draft.from=pick.seedFrom;draft.readableLine=serving(pick.seedFrom)[0]?.id||draft.readableLine;}}
      draw();
      if(parsed.plan&&metroStatus(parsed,d.stops[d.stops.indexOf(s)-1],s)==='stale')toast(t('Review this route for the changed itinerary before saving.','일정 순서가 바뀌었습니다. 경로를 확인한 뒤 다시 저장해주세요.'));
    }catch{toast(t('Could not load subway maps. Check your connection and retry.','지하철 노선도를 불러오지 못했습니다. 연결을 확인한 뒤 다시 열어주세요.'));}
  }
  function assign(role){
    const id=draft.focused;if(!id)return;
    if(role==='via'){
      if(serving(id).length<2||draft.vias.includes(id))return;
      if(draft.vias.length>=7){toast(t('Choose up to seven transfer stations.','환승역은 7곳까지 선택할 수 있어요.'));return;}
      if(id===draft.from||id===draft.to){toast(t('Choose a different station for the transfer.','출발·도착역과 다른 환승역을 선택해주세요.'));return;}
      draft.vias.push(id);
    }else {
      if((role==='from'&&id===draft.to)||(role==='to'&&id===draft.from)||draft.vias.includes(id)){toast(t('Start, transfer and end stations must be different.','출발역·환승역·도착역은 서로 다르게 선택해주세요.'));return;}
      draft[role]=id;
    }
    draft.focused='';draft.nearby=[];recalculate();draw();
  }
  modal.addEventListener('click',async e=>{
    const el=e.target.closest('[data-metro]');if(!el||!draft||!modal.classList.contains('network-modal'))return;
    const action=el.dataset.metro;
    if(action==='view'){draft.view=el.dataset.view;draft.resetCamera=true;draw();}
    if(action==='readable-line'){draft.readableLine=el.dataset.line;draft.focused=el.dataset.id;draw();modal.querySelector(`[data-metro="focus"][data-id="${CSS.escape(draft.focused)}"]`)?.scrollIntoView({block:'nearest'});}
    if(action==='focus'){focus(el.dataset.id,[],true);modal.querySelector('#metroSearchResults').innerHTML='';modal.querySelector('#metroSearch').blur();}
    if(action==='unfocus'){draft.focused='';draft.nearby=[];modal.querySelector('#networkDock').innerHTML=dockHTML();updateMap();}
    if(action.startsWith('assign-'))assign(action.slice(7));
    if(action==='choice'){draft.choice=Number(el.dataset.index);draft.timeMode='auto';draft.manualMinutes='';draw();}
    if(action==='highlight'){draft.highlight=el.dataset.line;updateMap();for(const button of modal.querySelectorAll('[data-metro="highlight"]'))button.setAttribute('aria-pressed',String(button.dataset.line===draft.highlight));}
    if(action==='zoom-in')map?.zoom(1.6);
    if(action==='zoom-out')map?.zoom(1/1.6);
    if(action==='fit')map?.fit();
    if(action==='fit-route')map?.fit(choice()?.legs.flatMap(([id,a,b,next])=>metroPaths(region().lines.find(l=>l.id===id),a,b).find(p=>p[1]===next)||[]));
    if(action==='clear-point'){if(el.dataset.role==='via')draft.vias.splice(Number(el.dataset.index),1);else draft[el.dataset.role]='';recalculate();draw();}
    if(action==='reset'){draft.from='';draft.to='';draft.vias=[];draft.options=[];draft.focused='';draft.nearby=[];draft.highlight='';draft.choice=0;draft.timeMode='auto';draft.manualMinutes='';draft.resetCamera=true;draw();}
    if(action==='remove')try{await ctx.onSave({...draft,remove:true});}catch{toast(t('The itinerary changed. Open the route again.','일정이 변경됐습니다. 경로를 다시 열어주세요.'));}
  });
  modal.addEventListener('input',e=>{
    if(!modal.classList.contains('network-modal'))return;
    if(e.target.id==='metroMinutes'&&draft.timeMode==='manual'){draft.manualMinutes=e.target.value;updateTime();}
    if(e.target.dataset.timeOption){draft.timingOptions[e.target.dataset.timeOption]=e.target.value;updateTime();}
    if(e.target.id==='metroSearch'){
      const q=e.target.value.trim().toLowerCase(),r=region();const results=q?Object.entries(r.stations).filter(([id,s])=>`${s.ko} ${s.en}`.toLowerCase().includes(q)).sort((a,b)=>Number([b[1].ko,b[1].en].some(n=>n?.toLowerCase()===q))-Number([a[1].ko,a[1].en].some(n=>n?.toLowerCase()===q))).slice(0,12):[];
      modal.querySelector('#metroSearchResults').innerHTML=!q?'':results.length?results.map(([id,s])=>`<button type="button" class="metro-search-result" data-metro="focus" data-id="${h(id)}"><strong>${h(label(s))}</strong><small>${h(t(s.ko,s.en))} · ${serving(id).map(l=>h(label(l))).join(' / ')}</small></button>`).join(''):`<p class="note">${t('No matching stations in this region.','이 지역에서 찾은 역이 없습니다.')}</p>`;
    }
  });
  modal.addEventListener('change',e=>{
    if(!modal.classList.contains('network-modal'))return;
    if(e.target.id==='metroReadableLine'){draft.readableLine=e.target.value;draw();}
    if(e.target.id==='metroTimeMode'){draft.timeMode=e.target.value;if(draft.timeMode==='manual'&&draft.manualMinutes===''){const q=autoTime();if(q&&!q.error)draft.manualMinutes=String(q.minutes);}draw();}
    if(e.target.id==='metroIncludeWalk'){draft.timingOptions.includeWalk=e.target.checked;updateTime();}
    if(e.target.id==='metroRegion'){draft.region=e.target.value;draft.readableLine=region().lines[0].id;draft.focused='';draft.nearby=[];draft.highlight='';draft.resetCamera=true;draft.from='';draft.to='';draft.vias=[];draft.options=[];draw();}
    if(e.target.id==='metroTarget'){draft.target=e.target.value;const s=ctx.getDay()?.stops.find(s=>s.id===draft.target);draft.existing=!!readMetroNote(s?.note).plan;draft.timeMode='auto';draft.manualMinutes='';draw();}
  });
  modal.addEventListener('submit',async e=>{
    if(e.target.id!=='metro-form')return;e.preventDefault();if(!choice()||draft.saving)return;
    try{
      if(draft.pick){const plan={v:1,region:draft.region,from:'',to:'',legs:choice().legs,...(draft.vias.length?{vias:draft.vias}:{})};validateMetroPlan(network,plan);const pick=draft.pick;draft.pick=null;map?.destroy();map=null;await pick.onSelect({kind:'subway',plan});return;}
      const d=ctx.getDay(),i=d?.stops.findIndex(s=>s.id===draft.target);
      if(ctx.getTripID()!==draft.tripID||d?.id!==draft.dayID||i<1)throw Error('changed');
      const quote=selectedTime();if(!quote||quote.error)throw Error(quote?.error||'time');const minutes=quote.minutes;
      const plan={v:1,region:draft.region,from:d.stops[i-1].id,to:d.stops[i].id,legs:choice().legs,timing:draft.timeMode==='auto'?timingSnapshot(quote):{v:1,mode:'manual',minutes},...(draft.vias.length?{vias:draft.vias}:{})};
      validateMetroPlan(network,plan);if(!routeContainsTransfers(plan.legs,draft.vias))throw Error('route');
      draft.saving=true;e.target.querySelector('[type="submit"]').disabled=true;
      if(!await ctx.onSave({...draft,plan,summary:metroSummary(network,plan),minutes})){draft.saving=false;e.target.querySelector('[type="submit"]').disabled=false;}
    }catch(error){draft.saving=false;const button=modal.querySelector('#metro-form [type="submit"]');if(button)button.disabled=false;modal.querySelector('#metroError').textContent=error.message==='note-too-long'?t('The route and note exceed 2,000 characters. Shorten the note or choose fewer transfers.','경로와 메모가 2,000자를 넘습니다. 메모를 줄이거나 환승역을 줄여주세요.'):t('Check the route and movement, then try again.','경로와 저장할 이동 구간을 확인한 뒤 다시 시도해주세요.');}
  });
  modal.addEventListener('close',()=>{map?.destroy();map=null;const pick=draft?.pick;if(pick){draft.pick=null;pick.onCancel?.();}});
  return {open};
}
