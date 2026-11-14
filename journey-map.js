import {journeyGeometry,journeyFallbackRegion,journeyStyles} from './journey-geometry.js?v=web-13';
import {createBusMap} from './bus-map.js?v=web-13';
export function journeyMapLegend(t){return `<div class="journey-map-legend" aria-label="${t('Route map legend','경로 지도 범례')}"><span><i class="journey-key-bus"></i>${t('Bus','버스')}</span><span><i class="journey-key-subway"></i>${t('Subway','지하철')}</span><span><i class="journey-key-walking"></i>${t('Walk','도보')}</span><small>${t('Numbers show boarding order','숫자는 탑승 순서')}</small></div>`;}
export function journeyMapNote(t){return t('Real map background. Route lines connect the selected stop/station coordinates; they do not trace exact roads, tracks, entrances or pedestrian crossings.','배경은 실제 지도입니다. 경로선은 선택한 정류장·역 좌표를 연결하며, 정밀 도로·선로·출입구·횡단보도 경로는 반영하지 않습니다.');}
export function createJourneyMap({element,quote,fromPlace,toPlace,t,placeName,camera,onStation=()=>{},library=window.L}){
  const geometry=journeyGeometry(quote,{fromPlace,toPlace}),name=p=>p.name?placeName(p):t(p.en||p.ko,p.ko),kindName=k=>k==='bus'?t('Bus','버스'):k==='subway'?t('Subway','지하철'):t('Walk','도보');
  const status=document.createElement('div');status.className='journey-map-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  element.classList.add('journey-map');element.setAttribute('role','region');element.setAttribute('aria-label',t('Selected journey on the street map','실제 지도 위 선택한 이동경로'));
  const viewport=document.createElement('div');viewport.className='journey-map-viewport';element.replaceChildren(viewport,status);let real,tiles,observer,disposed=false,frames=[];
  const notify=(state,text='')=>{if(disposed)return;element.dataset.mapStatus=state;status.textContent=text;};
  function fallback(){
    element.setAttribute('aria-label',t('Selected journey coordinate diagram','선택한 이동경로 좌표 연결도'));
    viewport.classList.add('journey-map-fallback');const region=journeyFallbackRegion(geometry,name),rides=region.routes.filter(r=>r.kind!=='walking'),walks=region.routes.filter(r=>r.kind==='walking'),from=region.routes[0].stops[0],to=region.routes.at(-1).stops.at(-1),line=rides[0]?.id||'';
    const map=createBusMap({element:viewport,region,line,route:rides.map(r=>[r.id,0,r.stops.length-1]),walks,from,to,t,lang:t('en','ko'),camera:camera?.type==='diagram'?camera.value:null,onStation:id=>onStation(region.stops[id])});
    viewport.querySelector('canvas')?.setAttribute('aria-label',t('Route coordinate diagram; street map unavailable','경로 좌표 연결도 · 배경지도 사용 불가'));
    notify('unavailable',t('Street map unavailable. Showing the route coordinate diagram.','배경지도를 사용할 수 없어 경로 좌표 연결도를 표시합니다.'));
    return {zoom:factor=>map.zoom(factor),fit:()=>map.fit(),focusLeg:()=>map.fit(),getCamera:()=>({type:'diagram',value:map.getCamera()}),destroy:()=>{disposed=true;map.destroy();}};
  }
  if(!library?.map||!library?.tileLayer)return fallback();
  const L=library;
  function popup(title,subtitle){const div=document.createElement('div');div.className='journey-map-popup';const strong=document.createElement('strong');strong.textContent=title;div.append(strong);if(subtitle){const small=document.createElement('small');small.textContent=subtitle;div.append(small);}return div;}
  const fit=(bounds=geometry.bounds)=>{if(disposed)return;real.invalidateSize({pan:false});real.fitBounds(bounds,{padding:[29,36],maxZoom:16,animate:false});};
  try{
    real=L.map(viewport,{zoomControl:false,minZoom:5,maxZoom:19,scrollWheelZoom:false,zoomSnap:.5,keyboard:true,fadeAnimation:false,zoomAnimation:false,markerZoomAnimation:false});real.attributionControl.setPrefix(false);
    let tileErrors=0;
    tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,detectRetina:false,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'});
    tiles.on('loading',()=>{tileErrors=0;notify('loading',t('Loading street map…','실제 지도를 불러오는 중…'));});
    tiles.on('tileerror',()=>{tileErrors++;});
    tiles.on('load',()=>{notify(tileErrors?'partial':'loaded',tileErrors?t('Some map tiles could not load. Route lines remain visible; retry when connected.','일부 지도 배경을 불러오지 못했습니다. 경로선은 유지되며 연결 후 다시 확인해주세요.'):'');});tiles.addTo(real);
    L.control.scale({imperial:false,maxWidth:90}).addTo(real);
    const layers=[];
    for(const line of geometry.lines){
      // White outline keeps each mode visible on dense roads and railway labels.
      L.polyline(line.points,{color:'#fff',weight:line.weight+4,opacity:.92,interactive:false,lineCap:'round'}).addTo(real);
      const path=L.polyline(line.points,{color:line.color,weight:line.weight,opacity:1,dashArray:line.dashArray||undefined,lineCap:'round',lineJoin:'round'}).addTo(real);
      if(line.kind==='subway')L.polyline(line.points,{color:'#fff',weight:2,dashArray:'2 8',opacity:.9,interactive:false}).addTo(real);
      const title=line.role==='ride'?kindName(line.kind)+' · '+t(line.service.en,line.service.ko):t('Walking connection','도보 연결');
      path.bindPopup(popup(title,name(line.nodes[0])+' → '+name(line.nodes.at(-1))));layers.push({line,path});
      if(line.role==='ride'){
        const tag=document.createElement('span');tag.className='journey-line-tag journey-line-tag-'+line.kind;tag.textContent=(line.legIndex+1)+' · '+t(line.service.en,line.service.ko);
        path.bindTooltip(tag,{permanent:true,direction:line.kind==='bus'?'right':'center',offset:line.kind==='bus'?[15,-21]:[0,0],className:'journey-line-tooltip',opacity:1});
      }
      if(line.role==='ride')for(let j=1;j<line.points.length-1;j++)L.circleMarker(line.points[j],{radius:2.5,color:line.color,weight:1.5,fillColor:'#fff',fillOpacity:1,interactive:false}).addTo(real);
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
    observer=new ResizeObserver(()=>{if(!disposed)real.invalidateSize({pan:false});});observer.observe(element);
    frames.push(requestAnimationFrame(()=>{if(!disposed)real.invalidateSize({pan:false});}));
    return {zoom:factor=>{if(!disposed)real.setZoom(real.getZoom()+Math.log2(factor),{animate:false});},fit:()=>fit(),focusLeg:index=>{const line=geometry.lines.find(l=>l.role==='ride'&&l.legIndex===index);if(line)fit(L.latLngBounds(line.points));},getCamera:()=>{const p=real.getCenter();return {type:'geographic',center:[p.lat,p.lng],zoom:real.getZoom()};},destroy:()=>{disposed=true;observer?.disconnect();for(const f of frames)cancelAnimationFrame(f);real.remove();}};
  }catch{
    observer?.disconnect();for(const f of frames)cancelAnimationFrame(f);try{real?.remove();}catch{}viewport.replaceChildren();return fallback();
  }
}
