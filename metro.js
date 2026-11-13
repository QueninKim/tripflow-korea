// TripFlow's own station-order diagrams, based on factual operator station lists.
const START='[TripFlow Subway v1]',END='[/TripFlow Subway]';
export function readMetroNote(note=''){
  const pos=note.lastIndexOf(START);if(pos<0||!note.endsWith(END))return {note};
  try{
    const lines=note.slice(pos+START.length,-END.length).trim().split('\n'),plan=JSON.parse(lines.shift());
    if(plan.v!==1||typeof plan.region!=='string'||typeof plan.from!=='string'||typeof plan.to!=='string'||!Array.isArray(plan.legs)||!plan.legs.length||plan.legs.length>8||!plan.legs.every(l=>Array.isArray(l)&&l.length===4&&l.every(v=>typeof v==='string')))return {note};
    return {note:note.slice(0,pos).trimEnd(),plan,summary:lines.join('\n')};
  }catch{return {note};}
}
export function mergeMetroNote(note,plan,summary=''){
  const plain=readMetroNote(note).note;
  const result=plan?`${plain}${plain?'\n\n':''}${START}\n${JSON.stringify(plan)}\n${summary}\n${END}`:plain;
  // Swift's String.count can only be smaller than JS's UTF-16 count.
  if(result.length>2000)throw Error('note-too-long');return result;
}
export function metroStatus(parsed,previous,stop){
  if(!parsed.plan)return 'none';
  if(!previous||parsed.plan.from!==previous.id||parsed.plan.to!==stop.id)return 'stale';
  return stop.mode==='transit'?'active':'inactive';
}
export function metroPaths(line,from,to){
  if(!line||from===to)return [];
  const edges=new Map();
  const edge=(a,b)=>{if(!edges.has(a))edges.set(a,new Set());edges.get(a).add(b);};
  line.tracks.forEach((track,i)=>{for(let j=1;j<track.length;j++){edge(track[j-1],track[j]);if(!line.directedTracks.includes(i))edge(track[j],track[j-1]);}});
  if(!edges.has(from)||!edges.has(to))return [];
  const found=[];
  function visit(path,seen){if(found.length>=8)return;const last=path.at(-1);if(last===to){found.push(path);return;}for(const n of edges.get(last)||[])if(!seen.has(n)){const next=new Set(seen);next.add(n);visit([...path,n],next);}}
  visit([from],new Set([from]));return found.sort((a,b)=>a.length-b.length||a.join().localeCompare(b.join()));
}
export function validateMetroPlan(network,plan){
  const r=network.regions.find(r=>r.id===plan.region);
  if(!r||!plan.legs.length||plan.legs.length>8)throw Error('invalid-route');
  let end;const paths=[];
  for(const [id,a,b,next]of plan.legs){const line=r.lines.find(l=>l.id===id);const path=metroPaths(line,a,b).find(p=>p[1]===next);if(!path||(end&&end!==a))throw Error('invalid-route');paths.push(path);end=b;}
  return {region:r,paths};
}
const stationLabel=(r,id)=>{const s=r.stations[id];return s?`${s.ko}${s.en?' · '+s.en:''}`:id;};
export function metroSummary(network,plan){
  const {region:r,paths}=validateMetroPlan(network,plan);
  return [r.ko+' / '+r.en,...plan.legs.map(([id,a,b],i)=>{const l=r.lines.find(l=>l.id===id);const next=paths[i][1];return `${l.ko} / ${l.en}: ${stationLabel(r,a)} → ${stationLabel(r,b)} (${stationLabel(r,next)} 방면 / towards; ${paths[i].length-1} ${paths[i].length===2?'stop':'stops'})`;})].join('\n');
}
export function createMetroPlanner(ctx){
  const {t,h,btn,modalTop,openModal,modal,toast}=ctx;
  let network,request,draft;
  const region=()=>network.regions.find(r=>r.id===draft.region);
  const line=()=>region().lines.find(l=>l.id===draft.line);
  const label=(obj)=>t(obj.en,obj.ko);
  const name=id=>label(region().stations[id]);
  const stationOptions=(selected)=>[...new Set(line().tracks.flat())].map(id=>`<option value="${h(id)}" ${selected===id?'selected':''}>${h(stationLabel(region(),id))}</option>`).join('');
  const paths=()=>metroPaths(line(),draft.a,draft.b);
  const currentPath=()=>paths()[draft.choice]||paths()[0]||[];
  function mapHTML(){
    const r=region(),l=line(),savedPaths=draft.legs.filter(leg=>leg[0]===l.id).flatMap(leg=>metroPaths(l,leg[1],leg[2]).find(p=>p[1]===leg[3])||[]),selected=new Set(currentPath().length?currentPath():savedPaths);
    return `<div class="metro-map-head"><strong style="color:${l.color}">${h(label(l))}</strong><small>${t('Station order · scroll to explore','역 순서 노선도 · 스크롤해서 보세요')}</small></div><div class="metro-diagram" role="region" tabindex="0" aria-label="${h(label(l))} ${t('station diagram','역 노선도')}">${l.tracks.map((track,i)=>`<section class="metro-branch"><h3>${h(name(track[0]))} ↔ ${h(name(track.at(-1)))}${l.directedTracks.includes(i)?' · '+t('One-way loop →','한 방향 순환 →'):track[0]===track.at(-1)?' · '+t('Loop','순환'):''}</h3><ol class="metro-track" style="--metro-color:${l.color}">${track.map((id,j)=>{const other=r.lines.filter(other=>other.id!==l.id&&other.tracks.some(tr=>tr.includes(id)));return `<li class="${selected.has(id)?'on-path':''}"><button type="button" data-metro="station" data-id="${h(id)}" aria-label="${h(stationLabel(r,id))}" ${draft.a===id||draft.b===id?'aria-pressed="true"':''}><span class="metro-dot" aria-hidden="true"></span><span><strong>${h(name(id))}</strong><small>${h(t(r.stations[id].ko,r.stations[id].en))}</small></span>${draft.a===id?`<b class="metro-endpoint">${t('From','출발')}</b>`:draft.b===id?`<b class="metro-endpoint">${t('To','도착')}</b>`:''}</button>${other.length?`<div class="metro-transfers">${other.map(o=>`<button type="button" data-metro="transfer" data-line="${h(o.id)}" data-id="${h(id)}">↔ ${h(label(o))}</button>`).join('')}</div>`:''}</li>`;}).join('')}</ol></section>`).join('')}</div>`;
  }
  function routeHTML(){
    const r=region();
    return `<div class="metro-plan"><div class="row between"><h3>${t('My subway route','내 지하철 경로')}</h3><small>${draft.legs.length}/8 ${t('legs','구간')}</small></div>${draft.legs.length?`<ol class="metro-legs">${draft.legs.map(([id,a,b,next],i)=>{const l=r.lines.find(l=>l.id===id),p=metroPaths(l,a,b).find(p=>p[1]===next);return `<li><span class="metro-line-dot" style="background:${l.color}"></span><div><strong>${h(label(l))}</strong><p>${h(name(a))} → ${h(name(b))}</p><small>${h(name(next))} ${t('direction','방면')} · ${p.length-1}${t(p.length===2?' stop':' stops','개 역 이동')}</small></div>${i===draft.legs.length-1?'<button type="button" class="text-btn" data-metro="undo">'+t('Undo','되돌리기')+'</button>':''}</li>`;}).join('')}</ol>`:`<p class="note">${t('Choose a line, then select the departure and arrival stations. Add another leg at a transfer station.','노선과 출발·도착역을 선택해 구간을 추가하세요. 환승역에서는 다음 노선을 이어 붙일 수 있어요.')}</p>`}</div>`;
  }
  function draw(){
    const scroll=modal.open&&modal.classList.contains('metro-modal')?modal.scrollTop:0;
    const r=region(),l=line(),ps=paths(),d=ctx.getDay();
    const lines=draft.legs.length?r.lines.filter(l=>l.tracks.some(tr=>tr.includes(draft.legs.at(-1)[2]))):r.lines;
    const content=`${modalTop(t('Subway maps & route','지하철 노선도·경로'))}<p class="note">${t('Build your route on station-order diagrams. They are not geographic maps.','노선별 역 순서를 보며 경로를 직접 짜보세요. 지리적 위치·축척을 나타내는 지도는 아닙니다.')}</p><div class="metro-layout"><section class="stack"><div class="form-grid"><label>${t('Region','지역')}<select id="metroRegion" ${draft.legs.length?'disabled':''}>${network.regions.map(r=>`<option value="${r.id}" ${r.id===draft.region?'selected':''}>${h(label(r))}</option>`).join('')}</select></label><label>${draft.legs.length?t('Next line from the transfer station','환승역에서 이어 갈 노선'):t('Line','노선')}<select id="metroLine">${lines.map(l=>`<option value="${h(l.id)}" ${l.id===draft.line?'selected':''}>${h(label(l))}</option>`).join('')}</select></label><label>${t('Find a station · Korean or English','역 찾기 · 한글·영어')}<input id="metroSearch" type="search" autocomplete="off" placeholder="${t('e.g. Hongik, Seoul, Busan','예: 홍대입구, 서울역, 부산역')}"></label><div id="metroSearchResults" role="status"></div></div><div class="row metro-pick"><button type="button" data-metro="pick-from" class="${draft.pick==='a'?'active':''}" ${draft.legs.length?'disabled':''}>${t('① Select departure','① 출발역 선택')}</button><button type="button" data-metro="pick-to" class="${draft.pick==='b'?'active':''}">${t('② Select arrival','② 도착역 선택')}</button></div><div id="metroMap">${mapHTML()}</div><div class="note metro-sources">${t('Station lists checked','역 목록 확인')} ${network.checkedAt}<br>${r.sources.map(s=>`<a href="${s.url}" target="_blank" rel="noopener noreferrer">${h(s.name)} · ${t('Full official map ↗','공식 전체 노선도 ↗')}</a>`).join('<br>')}</div></section><section class="stack"><div class="form-grid panel"><div class="field-pair"><label>${t('Departure station','출발역')}<select id="metroFrom" ${draft.legs.length?'disabled':''}><option value="">${t('Choose','선택')}</option>${stationOptions(draft.a)}</select></label><label>${t('Arrival station','도착역')}<select id="metroTo"><option value="">${t('Choose','선택')}</option>${stationOptions(draft.b)}</select></label></div>${ps.length?`<label>${t('Direction','이동 방향')}<select id="metroDirection">${ps.map((p,i)=>`<option value="${i}" ${i===draft.choice?'selected':''}>${h(name(p[1]))} ${t('direction','방면')} · ${p.length-1}${t(p.length===2?' stop':' stops','개 역 이동')}</option>`).join('')}</select></label><p class="metro-selected-path">${currentPath().map(id=>h(name(id))).join(' → ')}</p>`:`<p class="note" role="status">${draft.a&&draft.b?t('These stations are not connected on this line. Choose a different line or add a transfer leg.','이 노선으로 이어지지 않는 역입니다. 다른 노선을 선택하거나 환승 구간을 나눠주세요.'):t('Tap stations on the diagram or use the station selectors.','노선도에서 역을 누르거나 위 목록에서 선택하세요.')}</p>`}<button type="button" data-metro="add" class="secondary" ${!ps.length||draft.legs.length>=8?'disabled':''}>${t('＋ Add this leg','＋ 이 구간 추가')}</button></div>${routeHTML()}<form id="metro-form" class="form-grid"><label>${t('Save to itinerary movement','저장할 일정 이동 구간')}<select id="metroTarget" required><option value="">${t('Choose a movement','이동 구간 선택')}</option>${draft.existing&&d?.stops[0]?.id===draft.target?`<option value="${draft.target}" selected>${t('First place · remove or choose a movement','첫 장소 · 삭제하거나 이동 구간을 선택하세요')}</option>`:''}${d?.stops.slice(1).map((s,i)=>`<option value="${s.id}" ${draft.target===s.id?'selected':''}>${h(ctx.placeName(d.stops[i].place))} → ${h(ctx.placeName(s.place))}</option>`).join('')||''}</select></label>${(d?.stops.length||0)<2?`<p class="note">${t('Add at least two places to today’s itinerary to save a route.','오늘 일정에 장소를 2곳 이상 추가하면 경로를 저장할 수 있어요.')}</p>`:''}<label>${t('Total travel time · minutes, optional','전체 이동시간 · 분, 선택')}<input type="number" id="metroMinutes" min="0" max="2880" step="1" value="${h(draft.minutes)}" placeholder="${t('Include walks, waits and transfers','도보·대기·환승 포함')}"></label><p class="note">${t('Times are entered by you. Check train direction, express stops and current service in the official map before travelling.','시간은 직접 입력합니다. 이동 전 공식 노선도에서 열차 방향·급행 정차역·운행정보를 확인하세요.')}</p>${draft.b?`<p class="note">${t('Add the selected leg before saving.','선택한 구간을 먼저 추가한 뒤 저장하세요.')}</p>`:''}<p id="metroError" class="status error" role="alert"></p><button type="submit" class="primary" ${!draft.legs.length||!draft.target||draft.b||d?.stops[0]?.id===draft.target?'disabled':''}>${t('Save subway route','지하철 경로 저장')}</button></form><div class="row wrap"><button type="button" class="text-btn" data-metro="reset">${t('Start over','새로 짜기')}</button>${draft.existing?`<button type="button" class="text-btn" data-metro="remove">${t('Remove saved subway route','저장된 지하철 경로 삭제')}</button>`:''}</div></section></div>`;
    openModal(content);modal.classList.add('metro-modal');const map=modal.querySelector('.metro-diagram'),selected=map.querySelector('.on-path');if(selected)map.scrollTop=Math.max(0,selected.offsetTop-45);modal.scrollTop=scroll;
  }
  async function open(target){
    try{
      if(!network){if(!request)request=fetch('./metro-data.json?v=web-6').then(r=>{if(!r.ok)throw Error('data');return r.json();}).catch(e=>{request=null;throw e;});network=await request;}
      const d=ctx.getDay(),s=d?.stops.find(s=>s.id===target),parsed=readMetroNote(s?.note);
      let plan=parsed.plan;try{if(plan)validateMetroPlan(network,plan);}catch{plan=null;}
      const city=ctx.getCity();let regionID=plan?.region||(/부산|busan|김해|gimhae|울산|ulsan/i.test(city)?'busan':/대구|daegu/i.test(city)?'daegu':/대전|daejeon/i.test(city)?'daejeon':/광주|gwangju/i.test(city)?'gwangju':'capital');
      draft={region:regionID,line:plan?.legs.at(-1)[0]||network.regions.find(r=>r.id===regionID).lines[0].id,a:plan?.legs.at(-1)[2]||'',b:'',choice:0,pick:plan?'b':'a',legs:structuredClone(plan?.legs||[]),target:s?.id||'',minutes:plan?String(s?.travelMinutes??''):'',existing:!!parsed.plan,dayID:d?.id,tripID:ctx.getTripID()};
      draw();
      if(parsed.plan&&metroStatus(parsed,d.stops[d.stops.indexOf(s)-1],s)==='stale')toast(t('Review this route for the changed itinerary before saving.','일정 순서가 바뀌었습니다. 경로를 확인한 뒤 다시 저장해주세요.'));
    }catch{toast(t('Could not load subway maps. Check your connection and retry.','지하철 노선도를 불러오지 못했습니다. 연결을 확인한 뒤 다시 열어주세요.'));}
  }
  function selectStation(id){
    if(draft.pick==='a'&&!draft.legs.length){draft.a=id;draft.b='';draft.pick='b';}
    else draft.b=id;
    draft.choice=0;const top=modal.querySelector('.metro-diagram')?.scrollTop||0;draw();modal.querySelector('.metro-diagram').scrollTop=top;
  }
  modal.addEventListener('click',async e=>{
    const el=e.target.closest('[data-metro]');if(!el||!draft||!modal.classList.contains('metro-modal'))return;
    const a=el.dataset.metro;
    if(a==='station')selectStation(el.dataset.id);
    if(a==='pick-from'||a==='pick-to'){draft.pick=a==='pick-from'?'a':'b';draw();}
    if(a==='transfer'){
      if(draft.legs.length){toast(t('Add your current leg first, then choose the transfer line.','현재 구간을 먼저 추가한 다음 환승 노선을 선택하세요.'));return;}
      draft.line=el.dataset.line;draft.a=el.dataset.id;draft.b='';draft.pick='b';draft.choice=0;draw();
    }
    if(a==='search-station'){
      const l=region().lines.find(l=>l.id===el.dataset.line);
      if(draft.legs.length&&!l.tracks.some(tr=>tr.includes(draft.legs.at(-1)[2]))){toast(t('Choose a line serving your last arrival station.','마지막 도착역에서 탈 수 있는 노선을 선택하세요.'));return;}
      if(draft.line!==l.id){draft.line=l.id;if(!l.tracks.some(tr=>tr.includes(draft.a)))draft.a='';draft.b='';}
      selectStation(el.dataset.id);
    }
    if(a==='add'){
      const path=currentPath();if(!path.length||draft.legs.length>=8)return;
      draft.legs.push([draft.line,draft.a,draft.b,path[1]]);draft.a=draft.b;draft.b='';draft.pick='b';draft.choice=0;draw();
    }
    if(a==='undo'){const last=draft.legs.pop();draft.line=last[0];draft.a=draft.legs.at(-1)?.[2]||last[1];draft.b=last[2];draft.pick=draft.legs.length?'b':'a';draft.choice=Math.max(0,paths().findIndex(p=>p[1]===last[3]));draw();}
    if(a==='reset'){draft.legs=[];draft.a='';draft.b='';draft.pick='a';draft.choice=0;draw();}
    if(a==='remove'){await ctx.onSave({...draft,remove:true});}
  });
  modal.addEventListener('input',e=>{
    if(!modal.classList.contains('metro-modal'))return;
    if(e.target.id==='metroMinutes')draft.minutes=e.target.value;
    if(e.target.id==='metroSearch'){
      const q=e.target.value.trim().toLowerCase();const r=region();let matches=[];
      if(q)for(const [id,s]of Object.entries(r.stations))if(`${s.ko} ${s.en}`.toLowerCase().includes(q))for(const l of r.lines.filter(l=>l.tracks.some(tr=>tr.includes(id))))matches.push({id,s,l});
      const el=modal.querySelector('#metroSearchResults');el.innerHTML=q?(matches.length?matches.slice(0,16).map(({id,s,l})=>`<button type="button" class="metro-search-result" data-metro="search-station" data-line="${h(l.id)}" data-id="${h(id)}"><strong>${h(label(s))}</strong><small>${h(label(l))} · ${h(t(s.ko,s.en))}</small></button>`).join(''):`<p class="note">${t('No matching stations in this region.','이 지역에서 찾은 역이 없습니다.')}</p>`):'';
    }
  });
  modal.addEventListener('change',e=>{
    if(!modal.classList.contains('metro-modal'))return;
    const id=e.target.id,value=e.target.value;
    if(id==='metroRegion'){draft.region=value;draft.line=region().lines[0].id;draft.a='';draft.b='';draft.choice=0;draft.pick='a';draw();}
    if(id==='metroLine'){draft.line=value;draft.a=draft.legs.at(-1)?.[2]||'';draft.b='';draft.choice=0;draft.pick=draft.legs.length?'b':'a';draw();}
    if(id==='metroFrom'||id==='metroTo'){draft[id==='metroFrom'?'a':'b']=value;draft.pick='b';draft.choice=0;draw();}
    if(id==='metroDirection'){draft.choice=Number(value);draw();}
    if(id==='metroTarget'){draft.target=value;const s=ctx.getDay()?.stops.find(s=>s.id===value);draft.minutes=readMetroNote(s?.note).plan?String(s?.travelMinutes??''):'';draft.existing=!!readMetroNote(s?.note).plan;draw();}
  });
  modal.addEventListener('submit',async e=>{
    if(e.target.id!=='metro-form')return;e.preventDefault();
    try{
      const d=ctx.getDay(),i=d?.stops.findIndex(s=>s.id===draft.target);
      if(draft.b||ctx.getTripID()!==draft.tripID||d?.id!==draft.dayID||i<1)throw Error('changed');
      const minutes=draft.minutes===''?null:Number(draft.minutes);if(minutes!==null&&(!Number.isInteger(minutes)||minutes<0||minutes>2880))throw Error('time');
      const plan={v:1,region:draft.region,from:d.stops[i-1].id,to:d.stops[i].id,legs:draft.legs};validateMetroPlan(network,plan);
      await ctx.onSave({...draft,plan,summary:metroSummary(network,plan),minutes});
    }catch(e){modal.querySelector('#metroError').textContent=e.message==='note-too-long'?t('The route and note exceed 2,000 characters. Shorten the place note or use fewer legs.','경로와 메모가 2,000자를 넘습니다. 장소 메모를 줄이거나 이동 구간을 줄여주세요.'):t('Check the route and movement, then try again.','경로와 저장할 이동 구간을 확인한 뒤 다시 시도해주세요.');}
  });
  return {open};
}
