import {busGraph,busStopName} from './bus-core.js?v=web-9';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createBusMap({element,region,line,all=false,route=[],from,to,vias=[],focus,onStation,onCamera,camera,t,lang}){
  const g=busGraph(region),lat0=Object.values(region.stops)[0].lat,cos=Math.cos(lat0*Math.PI/180),points=Object.fromEntries(Object.entries(region.stops).map(([id,s])=>[id,[s.lng*cos*111200,-s.lat*111200]]));
  const ids=Object.keys(points),bounds=arr=>{const p=arr.map(id=>points[id]).filter(Boolean);return [Math.min(...p.map(x=>x[0])),Math.min(...p.map(x=>x[1])),Math.max(...p.map(x=>x[0])),Math.max(...p.map(x=>x[1]))];};
  const whole=bounds(ids),selected=()=>[...new Set([...(g.routes.get(line)?.stops||[]),...route.flatMap(([id,a,b])=>g.routes.get(id).stops.slice(a,b+1)),from,to,...vias].filter(Boolean))];
  const b=all?whole:bounds(selected()),canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',t('Bus stop position map. Tap a stop, or use search and the stop list below.','버스 정류장 위치도. 정류장을 누르거나 검색·아래 정류장 목록으로 선택하세요.'));canvas.tabIndex=0;element.replaceChildren(canvas);const c=canvas.getContext('2d');
  let width=1,height=1,base=1,state=camera?{...camera}:{x:(b[0]+b[2])/2,y:(b[1]+b[3])/2,zoom:1},frame,disposed=false,visible=[];
  function fit(stopIDs){const q=stopIDs?.length?bounds(stopIDs):b;state={x:(q[0]+q[2])/2,y:(q[1]+q[3])/2,zoom:1};base=Math.max(q[2]-q[0]+300,(q[3]-q[1]+300)*width/height,500);schedule();}
  function screen(id){const p=points[id];return [(p[0]-state.x)*width/base*state.zoom+width/2,(p[1]-state.y)*width/base*state.zoom+height/2];}
  function stroke(stops,color,weight,alpha=1,arrows=false){
    if(stops.length<2)return;c.beginPath();for(let i=0;i<stops.length;i++){const[x,y]=screen(stops[i]);if(i)c.lineTo(x,y);else c.moveTo(x,y);}c.strokeStyle=color;c.globalAlpha=alpha;c.lineWidth=weight;c.lineJoin='round';c.lineCap='round';c.stroke();c.globalAlpha=1;
    if(arrows){c.fillStyle=color;for(let i=1;i<stops.length;i+=5){const a=screen(stops[i-1]),b=screen(stops[i]),d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(d<18)continue;const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,angle=Math.atan2(b[1]-a[1],b[0]-a[0]);c.save();c.translate(x,y);c.rotate(angle);c.beginPath();c.moveTo(4,0);c.lineTo(-4,-3);c.lineTo(-4,3);c.closePath();c.fill();c.restore();}}
  }
  function paint(){
    if(disposed)return;const r=element.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);const dpr=Math.min(2,window.devicePixelRatio||1);if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);c.fillStyle='#f7faf6';c.fillRect(0,0,width,height);
    c.strokeStyle='#e7ede6';c.lineWidth=1;for(let x=0;x<width;x+=60){c.beginPath();c.moveTo(x,0);c.lineTo(x,height);c.stroke();}for(let y=0;y<height;y+=60){c.beginPath();c.moveTo(0,y);c.lineTo(width,y);c.stroke();}
    if(all)for(const r of region.routes)stroke(r.stops,r.color,1,.15);
    const l=g.routes.get(line);if(l)stroke(l.stops,l.color,3,1,true);
    for(const [id,a,b]of route){const r=g.routes.get(id);stroke(r.stops.slice(a,b+1),'#fff',9);stroke(r.stops.slice(a,b+1),r.color,5,1,true);}
    const pins=new Map([[from,t('S','출')],[to,t('E','도')],...vias.map((v,i)=>[v,String(i+1)])].filter(x=>x[0]));const important=new Set([...selected(),focus].filter(Boolean)),candidates=all&&state.zoom>=5?ids:[...important];visible=[];
    for(const id of candidates){const [x,y]=screen(id);if(x<-18||y<-18||x>width+18||y>height+18)continue;visible.push({id,x,y});const pin=pins.get(id),focused=id===focus;c.beginPath();c.arc(x,y,pin?10:focused?7:3.6,0,Math.PI*2);c.fillStyle=pin?'#216767':'#fff';c.fill();c.strokeStyle=focused?'#db503b':l?.color||'#326c75';c.lineWidth=pin?2:1.6;c.stroke();if(pin){c.fillStyle='#fff';c.font='bold 11px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(pin,x,y);}}
    const occupied=[];const ordered=[...visible].sort((a,b)=>(pins.has(b.id)?100:0)+(b.id===focus?90:0)-(pins.has(a.id)?100:0)-(a.id===focus?90:0));
    for(const p of ordered){const important=pins.has(p.id)||p.id===focus;if(!important&&state.zoom<1.7&&visible.indexOf(p)%5)continue;const text=busStopName(region.stops[p.id],lang),font=important?13:11;c.font=(important?'bold ':'')+font+'px system-ui';const w=Math.min(210,c.measureText(text).width),box={x:p.x+10,y:p.y-20,w:w+4,h:17};if(box.x+box.w>width||box.y<0||(!important&&occupied.some(o=>box.x<o.x+o.w&&box.x+box.w>o.x&&box.y<o.y+o.h&&box.y+box.h>o.y)))continue;occupied.push(box);c.textAlign='left';c.textBaseline='top';c.lineWidth=4;c.strokeStyle='#fff';c.strokeText(text,box.x,box.y,210);c.fillStyle='#244d49';c.fillText(text,box.x,box.y,210);}
    c.font='bold 11px system-ui';c.fillStyle='#607970';c.fillText('N ↑',12,12);onCamera?.({...state});
  }
  function schedule(){if(disposed||frame)return;frame=requestAnimationFrame(()=>{frame=null;paint();});}
  function zoom(factor){state.zoom=clamp(state.zoom*factor,1,48);schedule();}
  let pointers=new Map(),drag,moved=false,pinched=false;
  const point=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  function baseline(){const p=[...pointers.values()];if(p.length===1)drag={...p[0],cx:state.x,cy:state.y};if(p.length>=2){drag={distance:Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),zoom:state.zoom};pinched=true;}}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;pointers.set(e.pointerId,point(e));canvas.setPointerCapture(e.pointerId);if(pointers.size===1){moved=false;pinched=false;}baseline();});
  canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,point(e));const ps=[...pointers.values()];if(ps.length>1){state.zoom=clamp(drag.zoom*Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y)/Math.max(1,drag.distance),1,48);moved=true;}else{const dx=ps[0].x-drag.x,dy=ps[0].y-drag.y;if(Math.hypot(dx,dy)>5)moved=true;state.x=drag.cx-dx*base/width/state.zoom;state.y=drag.cy-dy*base/width/state.zoom;}schedule();});
  canvas.addEventListener('pointerup',e=>{if(!moved&&!pinched&&pointers.size===1){const p=point(e);const near=visible.map(s=>({...s,d:Math.hypot(s.x-p.x,s.y-p.y)})).filter(s=>s.d<20).sort((a,b)=>a.d-b.d);if(near.length)onStation(near[0].id,near.slice(1,6).map(s=>s.id));}pointers.delete(e.pointerId);baseline();});
  canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);baseline();});canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.2:1/1.2);},{passive:false});
  canvas.addEventListener('keydown',e=>{if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();if(e.key==='+'||e.key==='=')zoom(1.5);if(e.key==='-')zoom(1/1.5);if(e.key.startsWith('Arrow')){const q=base/state.zoom*.1;state.x+=e.key==='ArrowLeft'?-q:e.key==='ArrowRight'?q:0;state.y+=e.key==='ArrowUp'?-q:e.key==='ArrowDown'?q:0;schedule();}});
  const resize=new ResizeObserver(schedule);resize.observe(element);const rect=element.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);base=camera?.base||Math.max(b[2]-b[0]+300,(b[3]-b[1]+300)*width/height,500);paint();
  return {zoom,fit,focus(id){if(!points[id])return;[state.x,state.y]=points[id];state.zoom=Math.max(state.zoom,4);schedule();},getCamera:()=>({...state,base}),destroy(){disposed=true;resize.disconnect();if(frame)cancelAnimationFrame(frame);}};
}
