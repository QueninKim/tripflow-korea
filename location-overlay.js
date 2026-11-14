import {locationMessage} from './current-location.js?v=web-18';
export function createLocationOverlay({element,map,L,service,t,onFrom}){
  if(!service)return {destroy(){}};
  const pane=map.getPane?.('tripflow-current-location')||map.createPane?.('tripflow-current-location');if(pane)pane.style.zIndex='675';
  const controls=document.createElement('div');controls.className='map-location-controls';
  const locate=document.createElement('button');locate.type='button';locate.textContent='◎ '+t('My location','현재 위치');locate.setAttribute('aria-label',t('Show my location','지도에 현재 위치 표시'));controls.append(locate);
  const status=document.createElement('div');status.className='map-location-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const stop=document.createElement('button');stop.type='button';stop.className='location-stop';stop.textContent=t('Stop location','위치 표시 끄기');stop.hidden=true;controls.append(stop);
  const from=onFrom?document.createElement('button'):null;if(from){from.type='button';from.className='location-from';from.textContent=t('Start here','현재 위치에서 출발');controls.append(from);}
  L.DomEvent?.disableClickPropagation(controls);L.DomEvent?.disableScrollPropagation(controls);
  element.append(controls,status);const requestController=new AbortController();let point,circle,disposed=false,focus=false,latest;
  const clear=()=>{point?.remove();circle?.remove();point=circle=null;};
  const unsubscribe=service.subscribe(s=>{
    if(disposed)return;stop.hidden=!s.enabled;locate.disabled=s.status==='loading';
    if(!s.enabled){clear();status.textContent='';return;}
    if(s.status==='error'){clear();status.textContent=locationMessage(s.error,t);return;}
    if(s.status==='loading'){status.textContent=t('Finding your location…','현재 위치를 찾는 중…');return;}
    if(s.status==='paused'){clear();return;}
    const fix=s.fix;if(!fix)return;latest=fix;clear();const p=[fix.latitude,fix.longitude];
    circle=L.circle(p,{pane:pane?'tripflow-current-location':undefined,radius:fix.accuracy,color:'#1976e8',weight:1,fillColor:'#1976e8',fillOpacity:.1,interactive:false}).addTo(map);
    const label=document.createElement('span');label.textContent=t('Your current location','내 현재 위치')+' · '+t('accuracy ≈ ','정확도 약 ')+Math.ceil(fix.accuracy)+'m';
    point=L.circleMarker(p,{pane:pane?'tripflow-current-location':undefined,radius:8,color:'#fff',weight:3,fillColor:'#1976e8',fillOpacity:1}).addTo(map).bindTooltip(label,{direction:'top',className:'current-location-tooltip'});
    status.textContent=t('My location · accuracy ≈ ','현재 위치 · 정확도 약 ')+Math.ceil(fix.accuracy)+'m';
    if(focus){map.setView(p,Math.min(16,map.getMaxZoom?.()||19),{animate:false});focus=false;}
  });
  locate.onclick=()=>{focus=true;service.enable();const s=service.snapshot();if(s.status==='ready'&&s.fix){map.setView([s.fix.latitude,s.fix.longitude],16,{animate:false});focus=false;}};
  stop.onclick=()=>{focus=false;service.disable();};
  if(from)from.onclick=async()=>{from.disabled=true;try{const fix=await service.request({signal:requestController.signal});if(!disposed)onFrom(fix);}catch(error){if(!disposed)status.textContent=locationMessage(error.message,t);}finally{if(!disposed)from.disabled=false;}};
  return {destroy(){disposed=true;requestController.abort();unsubscribe();clear();controls.remove();status.remove();}};
}
