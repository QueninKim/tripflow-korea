const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export function isoDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('intercity-date');const date=new Date(value+'T00:00:00Z');if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==value)throw Error('intercity-date');return value;}
export function tripDayDate(trip,index){const d=new Date((trip.startDate+978307200)*1000+9*3600000);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+index)).toISOString().slice(0,10);}
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
export function clockInput(value){if(!/^\d{2}:\d{2}$/.test(value))throw Error('intercity-time');const [h,m]=value.split(':').map(Number);if(h>23||m>59)throw Error('intercity-time');return h*60+m;}
export function railDistance(data,train,from,to){
 const high=train.kind.startsWith('KTX'),classic=train.stops.some(s=>['수원','구포','밀양'].includes(s[0])),wanted=high&&!classic?(train.line==='호남선'||train.line==='전라선'?'2-호남KTX운행거리':train.line==='경부선'||train.line==='경전선'||train.line.startsWith('동해선(서울')?'1-경부KTX운행거리':null):null;
 if(high&&classic)return null;
 const pairs=data.distances.filter(p=>p[0]===from&&p[1]===to||p[0]===to&&p[1]===from),exact=wanted&&pairs.find(p=>p[3]===wanted);
 if(exact)return {km:exact[2],source:exact[3],basis:'published-corridor'};
 // A distance is shown only when one compatible official line table contains both stations.
 const roots={경부선:'경부',호남선:'호남',전라선:'전라',장항선:'장항',중앙선:'중앙',경전선:'경전',충북선:'충북',동해선:'동해',대구선:'대구',영동선:'영동',태백선:'태백',경북선:'경북',강릉선:'경강',중부내륙선:'중부내륙',서해선:'서해'},root=roots[train.line];
 const eligible=pairs.filter(p=>root&&p[3].includes(root)&&!p[3].includes('KTX'));
 if(!eligible.length||high&&wanted)return null;const km=eligible[0][2];if(eligible.some(p=>Math.abs(p[2]-km)>.2))return null;return {km,source:eligible[0][3],basis:'published-corridor'};
}
export function searchRailTimetable(data,{from,to,date,after='00:00',kind='all',sort='departure'}){
 isoDate(date);if(date<data.effectiveFrom)throw Error('intercity-before-source');if(!data.stations[from]||!data.stations[to]||from===to)throw Error('intercity-stations');const min=clockInput(after),day=new Date(date+'T00:00:00Z');const rows=[],seen=new Set();
 for(const train of data.trains){if(kind==='highspeed'&&!train.kind.startsWith('KTX')||kind==='regional'&&train.kind.startsWith('KTX'))continue;
  for(let i=0;i<train.stops.length-1;i++){if(train.stops[i][0]!==from)continue;const j=train.stops.findIndex((s,n)=>n>i&&s[0]===to);if(j<0)continue;const departure=train.stops[i][1],arrival=train.stops[j][2]??train.stops[j][1],offset=Math.floor(departure/1440)*1440,dep=departure-offset,arr=arrival-offset,base=new Date(+day-offset*60000),weekday=(base.getUTCDay()+6)%7;
   if(!train.days.includes(weekday)||dep<min||arr<=dep||arr-dep>1440)continue;const id=[train.no,train.kind,dep,arr].join('|');if(seen.has(id))continue;seen.add(id);
   rows.push({id:train.id+':'+i+':'+j,mode:'rail',no:train.no,kind:train.kind,line:train.line,from,to,date,departure:dep,arrival:arr,rideMinutes:arr-dep,days:train.days,stops:train.stops.slice(i,j+1).map(([name,time])=>[name,time-offset]),distance:railDistance(data,train,from,to),source:train.source,sourceVersion:data.version,sourceType:'published',checkedAt:data.checkedAt});break;
  }
 }
 return rows.sort((a,b)=>(sort==='duration'?a.rideMinutes-b.rideMinutes:sort==='arrival'?a.arrival-b.arrival:a.departure-b.departure)||a.departure-b.departure);
}
export function validateIntercityService(s){
 if(!s||!['rail','bus','flight'].includes(s.mode)||!['published','api','entered'].includes(s.sourceType)||typeof s.from!=='string'||typeof s.to!=='string'||!s.from||!s.to||s.from===s.to||s.from.length>100||s.to.length>100||typeof s.kind!=='string'||!s.kind.trim()||s.kind.length>60||typeof s.no!=='string'||s.no.length>30||!integer(s.departure,0,1439)||!integer(s.arrival,s.departure+1,s.departure+1440)||s.rideMinutes!==s.arrival-s.departure)throw Error('intercity-service');isoDate(s.date);
 if(s.distance!==null&&s.distance!==undefined&&(!Number.isFinite(s.distance.km)||s.distance.km<=0||s.distance.km>5000))throw Error('intercity-service');return s;
}
export function intercityTiming(service,{readyMinutes,accessMinutes,egressMinutes,bufferMinutes=20,date}){
 validateIntercityService(service);if(isoDate(date)!==service.date)throw Error('intercity-day-mismatch');if(!integer(readyMinutes,0,2879))throw Error('intercity-unknown-arrival');for(const n of [accessMinutes,egressMinutes,bufferMinutes])if(!integer(n,0,600))throw Error('intercity-access');
 const atStation=readyMinutes+accessMinutes;if(atStation+bufferMinutes>service.departure)throw Error('intercity-missed');const wait=service.departure-atStation,total=accessMinutes+wait+service.rideMinutes+egressMinutes;if(!integer(total,1,2880))throw Error('intercity-time');
 return {v:1,mode:'auto',minutes:total,options:{accessMinutes,egressMinutes,bufferMinutes},access:accessMinutes,wait,ride:service.rideMinutes,egress:egressMinutes,arrival:service.arrival+egressMinutes};
}
export const intercitySummary=(service,timing)=>`${service.kind} ${service.no} · ${service.from} → ${service.to}\n${service.date} · ${String(Math.floor(service.departure/60)).padStart(2,'0')}:${String(service.departure%60).padStart(2,'0')} → ${String(Math.floor(service.arrival/60)%24).padStart(2,'0')}:${String(service.arrival%60).padStart(2,'0')}${service.arrival>=1440?' +1d':''} · ${service.rideMinutes} min\n${service.distance?service.distance.km+'km · '+(service.sourceType==='entered'?'직접 입력 / Entered':'철도 거리표 참고 / Rail corridor reference'):'거리 미제공 / Distance unavailable'}\n${service.sourceType==='published'?'공개 시간표 / Published timetable':service.sourceType==='api'?'TAGO 조회 / TAGO timetable':'직접 입력한 승차편 / Entered service'}\n접근 / Access ${timing.access} · 대기 / Wait ${timing.wait} · 탑승 / Ride ${timing.ride} · 도착 / Egress ${timing.egress} min\n⏱ 시간표 적용 / Timetable ${timing.minutes} min`;
