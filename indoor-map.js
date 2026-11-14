import {indoorGuides,indoorTime} from './indoor-core.js?v=web-21';
export function createIndoorPanel({element,quote,t,library=window.L,imageFactory=()=>new Image()}){
  const transfers=(quote.connections||[]).flatMap((c,index)=>c.indoor?[{...c,index,fromLine:quote.details[index],toLine:quote.details[index+1]}]:[]);
  if(!transfers.length)return {open(){},destroy(){}};
  const panel=document.createElement('section');panel.className='indoor-panel';const heading=document.createElement('h3');heading.textContent=t('Inside your transfer stations','환승역 내부 지도');panel.append(heading);const items=[];
  for(const c of transfers){
    const guides=indoorGuides(c.indoor),details=document.createElement('details');details.className='indoor-station';details.dataset.indoorIndex=String(c.index);const summary=document.createElement('summary');
    summary.textContent=t(c.from.en||c.from.ko,c.from.ko)+' · '+t(c.fromLine.en,c.fromLine.ko)+' → '+t(c.toLine.en,c.toLine.ko);details.append(summary);
    const metric=document.createElement('p');metric.className='indoor-metric';metric.textContent=`${c.indoor.meters}m · ${indoorTime(c.seconds,t)} · `+t('official corridor distance','공식 환승 거리 기준');details.append(metric);
    let real,observer,image,disposed=false,selected=0,started=false,serial=0;
    const status=document.createElement('p');status.className='note indoor-map-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');details.append(status);
    const frame=document.createElement('div');frame.className='indoor-map-frame';frame.hidden=!guides.length;const viewport=document.createElement('div');viewport.className='indoor-map';viewport.setAttribute('role','region');viewport.setAttribute('aria-label',summary.textContent+' · '+t('official station interior diagram','공식 역 내부 안내도'));frame.append(viewport);
    const tabs=document.createElement('div');tabs.className='indoor-map-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label',t('Station guide by line','노선별 역 안내도'));
    const lineName=id=>id===c.fromLine.id?t(c.fromLine.en,c.fromLine.ko):id===c.toLine.id?t(c.toLine.en,c.toLine.ko):t('Line '+id.split('-').at(-1),id.split('-').at(-1)+'호선');
    for(const [i,g]of guides.entries()){const button=document.createElement('button');button.type='button';button.textContent=lineName(g.line);button.setAttribute('aria-pressed',String(i===0));button.addEventListener('click',()=>{selected=i;for(const [j,b]of [...tabs.children].entries())b.setAttribute('aria-pressed',String(j===i));load();});tabs.append(button);}
    if(guides.length>1)details.append(tabs);details.append(frame);
    const controls=document.createElement('div');controls.className='indoor-map-controls';
    const addButton=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);controls.append(b);};
    addButton(t('Zoom +','확대 ＋'),()=>real?.zoomIn());addButton(t('Zoom −','축소 −'),()=>real?.zoomOut());addButton(t('Full diagram','전체 안내도'),()=>{if(real&&image)real.fitBounds([[0,0],[image.naturalHeight,image.naturalWidth]],{padding:[4,4],animate:false});});addButton(t('Retry','다시 불러오기'),()=>load());if(guides.length)details.append(controls);
    const hint=document.createElement('p');hint.className='note';hint.textContent=t('Zoom and drag the original diagram to follow the Transfer signs between your selected lines. It shows the station’s corridors and floors, including other transfers. “You are here” is the sign’s position.','확대·이동하며 선택한 노선 사이의 ‘갈아타는 곳’ 표시를 확인하세요. 원본 안내도에는 층별 통로와 다른 환승 구간도 함께 표시됩니다. 안내도의 ‘현위치’는 안내판 설치 위치입니다.');details.append(hint);
    const source=document.createElement('p');source.className='note indoor-attribution';source.append(document.createTextNode(t('Seoul Metro · KOGL Type 1 · Time 2025-03 / Guide 2024-03. Walking basis 1.2 m/s; waiting time is added separately.','서울교통공사 · 공공누리 1유형 · 시간 2025.03 / 안내도 2024.03. 보행속도 1.2m/s 기준이며 열차 대기는 별도로 더합니다.')+' '));
    const link=document.createElement('a');link.href='./indoor-sources.html';link.target='_blank';link.rel='noopener';link.textContent=t('Sources & coverage','출처·지원 범위');source.append(link);details.append(source);
    function load(){
      started=true;const token=++serial;real?.remove();real=null;observer?.disconnect();viewport.replaceChildren();if(!guides.length){status.textContent=t('The official transfer time is available, but this station’s interior diagram is not in this image snapshot.','공식 환승시간은 반영했지만, 이 역의 내부 안내도는 현재 공개 이미지 목록에 없습니다.');return;}
      status.textContent=t('Loading the official station diagram…','공식 역 내부 안내도를 불러오는 중…');image=imageFactory();const requested=image;requested.referrerPolicy='no-referrer';
      requested.onload=()=>{if(disposed||token!==serial)return;
        if(!library?.map||!library?.CRS?.Simple){const fallback=document.createElement('img');fallback.src=guides[selected].url;fallback.alt=viewport.getAttribute('aria-label');fallback.className='indoor-map-image';viewport.append(fallback);status.textContent=t('Original station diagram · zoom with your browser','공식 역 내부 안내도 · 화면을 확대해 보세요');return;}
        try{const L=library,bounds=[[0,0],[requested.naturalHeight,requested.naturalWidth]];real=L.map(viewport,{crs:L.CRS.Simple,minZoom:-6,maxZoom:2,zoomControl:false,scrollWheelZoom:false,attributionControl:false,zoomSnap:.25,fadeAnimation:false,zoomAnimation:false});L.imageOverlay(guides[selected].url,bounds,{alt:viewport.getAttribute('aria-label'),interactive:false}).addTo(real);real.fitBounds(bounds,{padding:[4,4],animate:false});observer=new ResizeObserver(()=>real?.invalidateSize({pan:false}));observer.observe(viewport);status.textContent=t('Original transfer corridors and floors · drag or pinch to explore','공식 환승 통로·층별 구조 · 끌어서 이동·두 손가락으로 확대');}catch{real?.remove();real=null;status.textContent=t('The diagram could not open. Retry to load it again.','안내도를 열지 못했습니다. 다시 불러오기를 눌러주세요.');}
      };
      requested.onerror=()=>{if(!disposed&&token===serial)status.textContent=t('The official image could not load. Your route and its saved time are kept. Use Retry when connected.','공식 안내도를 불러오지 못했습니다. 경로와 저장된 시간은 유지됩니다. 연결 후 다시 불러오기를 눌러주세요.');};requested.src=guides[selected].url;
    }
    details.addEventListener('toggle',()=>{if(details.open){if(!started)load();else real?.invalidateSize({pan:false});}});
    items.push({index:c.index,open(){details.open=true;if(!started)load();details.scrollIntoView({block:'nearest',behavior:'smooth'});},destroy(){disposed=true;serial++;if(image){image.onload=null;image.onerror=null;}observer?.disconnect();real?.remove();}});panel.append(details);
  }
  const frame=element.closest('.network-map-frame')||element;frame.after(panel);
  return {open(index){items.find(i=>i.index===index)?.open();},destroy(){for(const i of items)i.destroy();panel.remove();}};
}
