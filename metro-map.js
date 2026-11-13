import {metroGraph,metroPaths} from './metro-core.js?v=web-8';
const NS='http://www.w3.org/2000/svg';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function createNetworkMap({element,region,layout,label,t,h,camera,onStation,onCamera}){
  const points=layout.nodes,graph=metroGraph(region),pins=new Map();
  let highlight='',legs=[],focused='',frame=0,disposed=false,selected=new Set();
  let width=1,height=1,baseW=1,baseH=1,viewW=1,viewH=1;
  const bounds=layout.bounds;
  let state=camera?{...camera}:{x:(bounds[0]+bounds[2])/2,y:(bounds[1]+bounds[3])/2,zoom:1};
  const terminal=new Set(region.lines.flatMap(l=>l.tracks.flatMap(tr=>[tr[0],tr.at(-1)])));
  const node=(name,attrs={})=>{const n=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
  const svg=node('svg',{class:'metro-network-svg',role:'group','aria-label':t('Full subway network. Drag to move; pinch or use the zoom buttons.','전체 지하철 노선도. 끌어서 이동하고 두 손가락이나 확대 버튼을 사용하세요.'),tabindex:'0'});
  const linesLayer=node('g',{class:'network-lines','aria-hidden':'true'}),routeLayer=node('g',{class:'network-route','aria-hidden':'true'}),stations=node('g',{class:'network-stations'}),labels=node('g',{class:'network-labels','aria-hidden':'true'});
  svg.append(linesLayer,routeLayer,stations,labels);element.replaceChildren(svg);
  const lineElements=[],sharedGeometry=[],edgeLines=new Map();
  const edgeKey=(a,b)=>[a,b].sort().join('\x1f');
  for(const l of region.lines)for(const tr of l.tracks)for(let i=1;i<tr.length;i++){const key=edgeKey(tr[i-1],tr[i]);if(!edgeLines.has(key))edgeLines.set(key,new Set());edgeLines.get(key).add(l.id);}
  for(const l of region.lines){
    const group=node('g',{'data-network-line':l.id}),seen=new Set();
    for(const track of l.tracks)for(let i=1;i<track.length;i++){
      const a=track[i-1],b=track[i],key=edgeKey(a,b);if(seen.has(key))continue;seen.add(key);
      const ls=[...edgeLines.get(key)],offset=(ls.indexOf(l.id)-(ls.length-1)/2)*3.5,p=node('path',{fill:'none',stroke:l.color,'stroke-width':'2.5','stroke-linejoin':'round','stroke-linecap':'round','vector-effect':'non-scaling-stroke'});
      group.append(p);sharedGeometry.push({p,a,b,offset});
    }
    linesLayer.append(group);lineElements.push([l.id,group]);
  }
  const elements=new Map();
  for(const[id,p]of Object.entries(points)){
    const g=node('g',{class:'network-station',transform:`translate(${p[0]} ${p[1]})`,role:'button',tabindex:'0','data-network-station':id,'aria-label':`${label(region.stations[id])} · ${[...graph.membership.get(id)].map(l=>label(region.lines.find(line=>line.id===l))).join(', ')}`});
    const hit=node('circle',{class:'network-hit',r:'9',fill:'transparent'}),circle=node('circle',{class:'network-dot',r:'3.5',fill:'#fff',stroke:graph.membership.get(id).size>1?'#20343b':region.lines.find(l=>l.id===[...graph.membership.get(id)][0]).color,'stroke-width':graph.membership.get(id).size>1?'2':'1.5','vector-effect':'non-scaling-stroke'});
    const pin=node('text',{class:'network-pin',x:'0',y:'0','text-anchor':'middle','dominant-baseline':'central'});
    g.append(hit,circle,pin);stations.append(g);elements.set(id,{g,circle,hit,pin});
  }
  function view(){
    const rect=element.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);
    const bw=bounds[2]-bounds[0]+90,bh=bounds[3]-bounds[1]+90;
    baseW=Math.max(bw,bh*width/height);baseH=baseW*height/width;
    state.zoom=clamp(state.zoom,1,24);viewW=baseW/state.zoom;viewH=baseH/state.zoom;
    // Keep some padding available while preventing the network being lost offscreen.
    state.x=clamp(state.x,bounds[0]-viewW*.35,bounds[2]+viewW*.35);state.y=clamp(state.y,bounds[1]-viewH*.35,bounds[3]+viewH*.35);
    svg.setAttribute('viewBox',`${state.x-viewW/2} ${state.y-viewH/2} ${viewW} ${viewH}`);
    svg.style.setProperty('--map-unit',String(viewW/width));
    onCamera?.({...state});
  }
  function renderLabels(){
    labels.replaceChildren();const unit=viewW/width,occupied=[];
    const left=state.x-viewW/2,top=state.y-viewH/2;
    const candidates=Object.keys(points).sort((a,b)=>priority(b)-priority(a));
    function priority(id){return (pins.has(id)?1000:0)+(id===focused?900:0)+(selected.has(id)?300:0)+(graph.membership.get(id).size>1?100:0)+(terminal.has(id)?20:0);}
    for(const id of candidates){
      const p=points[id],sx=(p[0]-left)/unit,sy=(p[1]-top)/unit;
      if(sx<0||sy<0||sx>width||sy>height)continue;
      const important=pins.has(id)||id===focused;
      // At overview show useful anchors; every station label becomes eligible as the map is enlarged.
      if(state.zoom<1.7&&!important&&!terminal.has(id)&&graph.membership.get(id).size<2)continue;
      const text=label(region.stations[id]),font=important?12:10.5,textW=Math.min(220,[...text].reduce((n,c)=>n+(/[가-힣]/.test(c)?font:font*.57),0));
      const options=[[sx+8,sy-6],[sx+8,sy+15],[sx-textW-8,sy-6],[sx-textW-8,sy+15]];
      let box;
      for(const[x,y]of options){const r={x:x-2,y:y-font,w:textW+5,h:font+5};if(r.x<1||r.x+r.w>width-1||r.y<1||r.y+r.h>height-1)continue;if(important||!occupied.some(o=>r.x<o.x+o.w&&r.x+r.w>o.x&&r.y<o.y+o.h&&r.y+r.h>o.y)){box={...r,tx:x,ty:y};break;}}
      if(!box)continue;occupied.push(box);
      const el=node('text',{x:left+box.tx*unit,y:top+box.ty*unit,'font-size':font*unit,class:important?'map-label important':'map-label'});el.textContent=text;labels.append(el);
    }
  }
  function paint(){
    if(disposed)return;view();const unit=viewW/width;
    for(const {p,a,b,offset}of sharedGeometry){
      const pa=points[a],pb=points[b],[ca,cb]=a<b?[pa,pb]:[pb,pa],dx=cb[0]-ca[0],dy=cb[1]-ca[1],length=Math.hypot(dx,dy)||1,ox=-dy/length*offset*unit,oy=dx/length*offset*unit;
      p.setAttribute('d',`M${pa[0]},${pa[1]} L${pa[0]+ox},${pa[1]+oy} L${pb[0]+ox},${pb[1]+oy} L${pb[0]},${pb[1]}`);
    }
    for(const[id,{g,circle,hit,pin}]of elements){
      const mark=pins.get(id),isSelected=selected.has(id),isFocus=id===focused;
      circle.setAttribute('r',(mark?8:isFocus?6:graph.membership.get(id).size>1?4.3:3.1)*unit);
      hit.setAttribute('r',9*unit);circle.setAttribute('fill',mark?'#216767':isSelected?'#e1f0e7':'#fff');
      circle.setAttribute('stroke',mark?'#fff':isFocus?'#db503b':graph.membership.get(id).size>1?'#20343b':region.lines.find(l=>l.id===[...graph.membership.get(id)][0]).color);
      pin.textContent=mark||'';pin.setAttribute('font-size',10*unit);g.classList.toggle('focused',isFocus);g.setAttribute('aria-pressed',mark?'true':'false');
    }
    renderLabels();
  }
  function schedule(){if(frame||disposed)return;frame=requestAnimationFrame(()=>{frame=0;paint();});}
  function zoomBy(factor,anchor={x:width/2,y:height/2}){
    const x=state.x+(anchor.x/width-.5)*viewW,y=state.y+(anchor.y/height-.5)*viewH;
    state.zoom=clamp(state.zoom*factor,1,24);
    state.x=x-(anchor.x/width-.5)*baseW/state.zoom;state.y=y-(anchor.y/height-.5)*baseH/state.zoom;schedule();
  }
  const pointers=new Map();let drag=null,moved=false,gesture=false;
  function point(e){const r=element.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  function baseline(){const ps=[...pointers.values()];if(ps.length===1)drag={...ps[0],cx:state.x,cy:state.y,w:viewW,h:viewH};else if(ps.length>=2){const a=ps[0],b=ps[1],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};drag={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:state.zoom,worldX:state.x+(mid.x/width-.5)*viewW,worldY:state.y+(mid.y/height-.5)*viewH};gesture=true;}}
  svg.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;pointers.set(e.pointerId,point(e));svg.setPointerCapture(e.pointerId);if(pointers.size===1){moved=false;gesture=false;}baseline();});
  svg.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId)||!drag)return;pointers.set(e.pointerId,point(e));const ps=[...pointers.values()];
    if(ps.length>=2){const a=ps[0],b=ps[1],dist=Math.hypot(a.x-b.x,a.y-b.y),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};state.zoom=clamp(drag.zoom*dist/Math.max(1,drag.distance),1,24);state.x=drag.worldX-(mid.x/width-.5)*baseW/state.zoom;state.y=drag.worldY-(mid.y/height-.5)*baseH/state.zoom;moved=true;}
    else {const p=ps[0],dx=p.x-drag.x,dy=p.y-drag.y;if(Math.hypot(dx,dy)>5)moved=true;state.x=drag.cx-dx*drag.w/width;state.y=drag.cy-dy*drag.h/height;}schedule();
  });
  function pick(e){
    const p=point(e),unit=viewW/width,wx=state.x+(p.x/width-.5)*viewW,wy=state.y+(p.y/height-.5)*viewH;
    const nearby=Object.keys(points).map(id=>({id,d:Math.hypot(points[id][0]-wx,points[id][1]-wy)/unit})).filter(x=>x.d<18).sort((a,b)=>a.d-b.d).slice(0,6);
    const actual=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-network-station]')?.getAttribute('data-network-station');
    const id=nearby[0]?.id||actual;if(id)onStation(id,nearby.map(x=>x.id));
  }
  svg.addEventListener('pointerup',e=>{const choose=!moved&&!gesture&&pointers.size===1;pointers.delete(e.pointerId);try{svg.releasePointerCapture(e.pointerId);}catch{}if(choose)pick(e);baseline();if(!pointers.size){drag=null;schedule();}});
  svg.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);moved=true;gesture=true;baseline();});
  svg.addEventListener('wheel',e=>{e.preventDefault();zoomBy(Math.exp(-e.deltaY*.002),point(e));},{passive:false});
  svg.addEventListener('dblclick',e=>{e.preventDefault();zoomBy(1.8,point(e));});
  svg.addEventListener('keydown',e=>{
    const target=e.target.closest('[data-network-station]');if(target&&['Enter',' '].includes(e.key)){e.preventDefault();onStation(target.dataset.networkStation,[]);return;}
    if(['+','=','-','Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(e.key==='+'||e.key==='=')zoomBy(1.5);if(e.key==='-')zoomBy(1/1.5);if(e.key==='Home')fit();if(e.key==='ArrowLeft')state.x-=viewW*.15;if(e.key==='ArrowRight')state.x+=viewW*.15;if(e.key==='ArrowUp')state.y-=viewH*.15;if(e.key==='ArrowDown')state.y+=viewH*.15;schedule();}
  });
  function fit(ids){
    if(!ids?.length){state={x:(bounds[0]+bounds[2])/2,y:(bounds[1]+bounds[3])/2,zoom:1};}
    else {const ps=ids.map(id=>points[id]).filter(Boolean);if(!ps.length)return;const xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),w=Math.max(...xs)-Math.min(...xs)+90,h=Math.max(...ys)-Math.min(...ys)+90;state.x=(Math.max(...xs)+Math.min(...xs))/2;state.y=(Math.max(...ys)+Math.min(...ys))/2;state.zoom=clamp(Math.min(baseW/w,baseH/h),1,16);}schedule();
  }
  function update({from,vias=[],to,focus='',route=[],line=''}={}){
    focused=focus;legs=route;highlight=line;pins.clear();if(from)pins.set(from,t('S','출'));vias.forEach((v,i)=>pins.set(v,String(i+1)));if(to)pins.set(to,t('E','도'));
    routeLayer.replaceChildren();selected=new Set();
    for(const[id,a,b,next]of legs){const l=region.lines.find(l=>l.id===id),p=metroPaths(l,a,b).find(p=>p[1]===next)||[];p.forEach(id=>selected.add(id));
      routeLayer.append(node('polyline',{points:p.map(id=>points[id].join(',')).join(' '),fill:'none',stroke:'#fff','stroke-width':'8','stroke-linejoin':'round','stroke-linecap':'round','vector-effect':'non-scaling-stroke'}),node('polyline',{points:p.map(id=>points[id].join(',')).join(' '),fill:'none',stroke:l.color,'stroke-width':'4.5','stroke-linejoin':'round','stroke-linecap':'round','vector-effect':'non-scaling-stroke'}));
    }
    for(const[id,g]of lineElements)g.setAttribute('opacity',highlight&&highlight!==id?'.18':legs.length?'.48':'1');schedule();
  }
  const observer=new ResizeObserver(schedule);observer.observe(element);paint();
  return {update,fit,zoom:zoomBy,focus(id){const p=points[id];if(p){state.x=p[0];state.y=p[1];state.zoom=Math.max(state.zoom,4);schedule();}},getCamera:()=>({...state}),destroy(){disposed=true;observer.disconnect();cancelAnimationFrame(frame);},get selected(){return [...selected];}};
}
