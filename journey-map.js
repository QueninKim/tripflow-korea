import {createLocationOverlay} from './location-overlay.js?v=web-16';
import {journeyGeometry,journeyStyles} from './journey-geometry.js?v=web-16';
import {loadJourneyShapes} from './journey-shapes.js?v=web-16';
export function journeyMapLegend(t){return `<div class="journey-map-legend" aria-label="${t('Route map legend','경로 지도 범례')}"><span><i class="journey-key-bus"></i>${t('Bus','버스')}</span><span><i class="journey-key-subway"></i>${t('Subway','지하철')}</span><span><i class="journey-key-walking"></i>${t('Walk','도보')}</span><small>${t('Numbers show boarding order','숫자는 탑승 순서')}</small></div>`;}
export function journeyMapNote(t){return t('Bus lines follow official road geometry; subway lines follow mapped tracks. Missing source sections are left blank. Dashed walking links are reference connections, not pedestrian directions.','버스는 공식 운행 도로, 지하철은 지도에 기록된 선로를 따라 표시합니다. 자료가 없는 구간은 비워 둡니다. 점선 도보는 위치 연결 참고선이며 실제 보행 길안내가 아닙니다.')+` <a href="./route-shape-sources.html" target="_blank" rel="noopener">${t('Sources & coverage','출처·표시 범위')} ↗</a>`;}
export function createJourneyMap(options){
  let inner,disposed=false;const {element,t}=options;if(!options.quote.details.length)options={...options,shapes:{bus:{},subway:{}}};
  const render=(shapes,state)=>{if(disposed)return;const camera=inner?.getCamera()||options.camera;inner?.destroy();inner=renderJourneyMap({...options,shapes,camera:camera?.type==='geographic'?camera:options.camera,shapeState:state});};
  render(options.shapes,options.shapes?'loaded':'loading');
  const ready=options.shapes?Promise.resolve():((options.loadShapes||loadJourneyShapes)(options.region).then(shapes=>render(shapes,'loaded')).catch(()=>render(null,'error')));
  return {ready,zoom:factor=>inner?.zoom(factor),fit:()=>inner?.fit(),focusLeg:i=>inner?.focusLeg(i),getCamera:()=>inner?.getCamera(),destroy:()=>{disposed=true;inner?.destroy();}};
}
function renderJourneyMap({element,quote,fromPlace,toPlace,t,placeName,camera,onStation=()=>{},library=window.L,shapes,shapeState,location,onFromCurrent}){
  const geometry=journeyGeometry(quote,{fromPlace,toPlace,shapes}),name=p=>p.name?placeName(p):t(p.en||p.ko,p.ko),kindName=k=>k==='bus'?t('Bus','버스'):k==='subway'?t('Subway','지하철'):t('Walk','도보');
  const status=document.createElement('div');status.className='journey-map-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  element.classList.add('journey-map');element.setAttribute('role','region');element.setAttribute('aria-label',t('Selected journey on the street map','실제 지도 위 선택한 이동경로'));
  const viewport=document.createElement('div');viewport.className='journey-map-viewport';const coverage=document.createElement('div');coverage.className='journey-shape-status';coverage.setAttribute('role','status');coverage.setAttribute('aria-live','polite');
  const missing=geometry.coverage.filter(c=>c.available<c.total);element.dataset.shapeStatus=shapeState==='loading'?'loading':missing.length?'partial':'complete';
  coverage.textContent=shapeState==='loading'?t('Loading road and track shapes…','운행 도로·선로를 불러오는 중…'):shapeState==='error'?t('Route geometry could not load. Stops remain visible. Reopen the map to retry.','운행 경로 자료를 불러오지 못했습니다. 정류장·역 위치는 표시됩니다. 지도를 다시 열어 재시도해주세요.'):missing.length?t('Geometry unavailable for part of: ','일부 구간의 운행 경로 자료 없음: ')+missing.map(c=>`${c.legIndex+1}. ${t(c.service.en,c.service.ko)} (${c.available}/${c.total})`).join(' · '):quote.details.length?t('Following bus roads and subway tracks','버스 운행 도로·지하철 선로 표시 중'):t('Walking connection · reference only','도보 위치 연결 · 참고용');
  element.replaceChildren(viewport,status,coverage);let real,tiles,observer,locationOverlay,disposed=false,frames=[];
  const notify=(state,text='')=>{if(disposed)return;element.dataset.mapStatus=state;status.textContent=text;};
  function fallback(){
    element.setAttribute('aria-label',t('Selected journey map unavailable','선택한 이동경로 지도 사용 불가'));
    viewport.classList.add('journey-map-fallback');
    const title=document.createElement('p');title.textContent=t('The map could not open. Your selected route is kept. Reopen this screen when connected.','지도를 열지 못했습니다. 선택한 경로는 유지됩니다. 연결 상태를 확인하고 지도를 다시 열어주세요.');viewport.replaceChildren(title);
    notify('unavailable');return {zoom:()=>{},fit:()=>{},focusLeg:()=>{},getCamera:()=>null,destroy:()=>{disposed=true;}};
  }
  if(!library?.map||!library?.tileLayer)return fallback();
  const L=library;
  function popup(title,subtitle){const div=document.createElement('div');div.className='journey-map-popup';const strong=document.createElement('strong');strong.textContent=title;div.append(strong);if(subtitle){const small=document.createElement('small');small.textContent=subtitle;div.append(small);}return div;}
  const fit=(bounds=geometry.bounds)=>{if(disposed)return;real.invalidateSize({pan:false});real.fitBounds(bounds,{paddingTopLeft:location?[30,122]:[29,36],paddingBottomRight:location?[30,100]:[29,36],maxZoom:16,animate:false});};
  try{
    real=L.map(viewport,{zoomControl:false,minZoom:5,maxZoom:19,scrollWheelZoom:false,zoomSnap:.5,keyboard:true,fadeAnimation:false,zoomAnimation:false,markerZoomAnimation:false});real.attributionControl.setPrefix(false);
    let tileErrors=0;
    tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,detectRetina:false,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'});
    tiles.on('loading',()=>{tileErrors=0;notify('loading',t('Loading street map…','실제 지도를 불러오는 중…'));});
    tiles.on('tileerror',()=>{tileErrors++;});
    tiles.on('load',()=>{notify(tileErrors?'partial':'loaded',tileErrors?t('Some map tiles could not load. Route lines remain visible; retry when connected.','일부 지도 배경을 불러오지 못했습니다. 경로선은 유지되며 연결 후 다시 확인해주세요.'):'');});tiles.addTo(real);
    L.control.scale({imperial:false,maxWidth:90}).addTo(real);
    const layers=[],labels=new Set(),labelLines=new Map();
    for(const line of geometry.lines.filter(l=>l.role==='ride'))if(!labelLines.has(line.legIndex)||line.points.length>labelLines.get(line.legIndex).points.length)labelLines.set(line.legIndex,line);
    for(const line of geometry.lines){
      // White outline keeps each mode visible on dense roads and railway labels.
      L.polyline(line.points,{color:'#fff',weight:line.weight+4,opacity:.92,interactive:false,lineCap:'round'}).addTo(real);
      const path=L.polyline(line.points,{color:line.color,weight:line.weight,opacity:1,dashArray:line.dashArray||undefined,lineCap:'round',lineJoin:'round'}).addTo(real);
      if(line.kind==='subway')L.polyline(line.points,{color:'#fff',weight:2,dashArray:'2 8',opacity:.9,interactive:false}).addTo(real);
      const title=line.role==='ride'?kindName(line.kind)+' · '+t(line.service.en,line.service.ko):t('Walking connection','도보 연결');
      path.bindPopup(popup(title,name(line.nodes[0])+' → '+name(line.nodes.at(-1))));layers.push({line,path});
      if(line.role==='ride'&&labelLines.get(line.legIndex)===line){
        const tag=document.createElement('span');tag.className='journey-line-tag journey-line-tag-'+line.kind;tag.textContent=(line.legIndex+1)+' · '+t(line.service.en,line.service.ko);
        path.bindTooltip(tag,{permanent:true,direction:line.kind==='bus'?'right':'center',offset:line.kind==='bus'?[15,-21]:[0,0],className:'journey-line-tooltip',opacity:1});
      }
      if(line.role==='ride'&&!labels.has(line.legIndex)){labels.add(line.legIndex);for(const node of line.service.path.slice(1,-1))L.circleMarker([node.lat,node.lng],{radius:2.5,color:line.color,weight:1.5,fillColor:'#fff',fillOpacity:1,interactive:false}).addTo(real);}
    }
    for(const pin of geometry.markers){
      const endpoint=pin.kind==='origin'||pin.kind==='destination',board=pin.kind==='board',transfer=pin.kind==='transfer-out',color=pin.kind==='origin'?'#216767':pin.kind==='destination'?'#d54b36':transfer?'#243c43':journeyStyles[pin.service.kind].color;
      const title=endpoint?(pin.kind==='origin'?t('Departure','출발지'):t('Destination','도착지'))+' · '+name(pin.node):board?`${pin.legIndex+1}. ${kindName(pin.service.kind)} · ${t(pin.service.en,pin.service.ko)}`:transfer?t('Transfer','환승')+' '+pin.transfer:t('Alight','하차')+' · '+name(pin.node);
      const subtitle=pin.node.code?'#'+pin.node.code+' · '+name(pin.node):name(pin.node),content=popup(title,transfer?name(pin.node)+' → '+name(pin.next):subtitle);
      if(endpoint||board||transfer){
        const symbol=pin.kind==='origin'?t('S','출'):pin.kind==='destination'?t('E','도'):transfer?'↔':String(pin.legIndex+1),size=endpoint?32:board?26:22;
        L.marker(pin.point,{title,alt:title,keyboard:true,zIndexOffset:endpoint?1200:board?800:400,icon:L.divIcon({className:'journey-pin',html:`<span style="--pin-color:${color};--pin-size:${size}px">${symbol}</span>`,iconSize:[size,size],iconAnchor:[size/2,size/2]})}).addTo(real).bindPopup(content).on('click',()=>onStation(pin.node));
      }else L.circleMarker(pin.point,{radius:4,color,weight:2,fillColor:'#fff',fillOpacity:1}).addTo(real).bindPopup(content);
    }
    if(camera?.type==='geographic'&&Array.isArray(camera.center)&&camera.center.every(Number.isFinite)&&Number.isFinite(camera.zoom))real.setView(camera.center,camera.zoom,{animate:false});else fit();
    locationOverlay=createLocationOverlay({element,map:real,L,service:location,t,onFrom:onFromCurrent});
    observer=new ResizeObserver(()=>{if(!disposed)real.invalidateSize({pan:false});});observer.observe(element);
    frames.push(requestAnimationFrame(()=>{if(!disposed)real.invalidateSize({pan:false});}));
    return {zoom:factor=>{if(!disposed)real.setZoom(real.getZoom()+Math.log2(factor),{animate:false});},fit:()=>fit(),focusLeg:index=>{const points=geometry.lines.filter(l=>l.role==='ride'&&l.legIndex===index).flatMap(l=>l.points);if(points.length)fit(L.latLngBounds(points));},getCamera:()=>{const p=real.getCenter();return {type:'geographic',center:[p.lat,p.lng],zoom:real.getZoom()};},destroy:()=>{disposed=true;locationOverlay?.destroy();observer?.disconnect();for(const f of frames)cancelAnimationFrame(f);real.remove();}};
  }catch{
    locationOverlay?.destroy();observer?.disconnect();for(const f of frames)cancelAnimationFrame(f);try{real?.remove();}catch{}viewport.replaceChildren();return fallback();
  }
}
