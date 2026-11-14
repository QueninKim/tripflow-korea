import {readIntercityNote,mergeIntercityNote} from './intercity-note.js?v=web-21';
import {readWalkingNote,mergeWalkingNote} from './walking-note.js?v=web-21';
import {readAutoNote,mergeAutoNote} from './auto-note.js?v=web-21';
import {readMetroNote,mergeMetroNote,metroStatus,metroTimingText} from './metro-core.js?v=web-21';
import {readMixedNote,mergeMixedNote} from './mixed-core.js?v=web-21';
import {readBusNote,mergeBusNote} from './bus-core.js?v=web-21';
export function readTransitNote(note=''){
  const intercity=readIntercityNote(note);if(intercity.plan)return {...intercity,kind:'intercity'};
  const walk=readWalkingNote(note);if(walk.plan)return {...walk,kind:'walking'};
  const auto=readAutoNote(note);if(auto.plan)return {...auto,kind:'auto'};
  const mixed=readMixedNote(note);if(mixed.plan)return {...mixed,kind:'mixed'};
  const bus=readBusNote(note);if(bus.plan)return {...bus,kind:'bus'};
  const metro=readMetroNote(note);return {...metro,kind:metro.plan?'subway':null};
}
export function mergeTransitNote(note,plan,summary='',kind){
  const parsed=readTransitNote(note);return (kind||parsed.kind)==='intercity'?mergeIntercityNote(parsed.note,plan,summary):(kind||parsed.kind)==='walking'?mergeWalkingNote(parsed.note,plan,summary):(kind||parsed.kind)==='auto'?mergeAutoNote(parsed.note,plan,summary):(kind||parsed.kind)==='mixed'?mergeMixedNote(parsed.note,plan,summary):(kind||parsed.kind)==='bus'?mergeBusNote(parsed.note,plan,summary):mergeMetroNote(parsed.note,plan,summary);
}
export function transitStatus(parsed,previous,stop){if(parsed.kind==='auto'||parsed.kind==='walking'||parsed.kind==='intercity'){if(!previous||parsed.plan.from!==previous.id||parsed.plan.to!==stop.id)return 'stale';return stop.mode===(parsed.kind==='walking'?'walking':parsed.kind==='intercity'?'transit':parsed.plan.routeMode)?'active':'inactive';}return metroStatus(parsed,previous,stop);}
export function isAutoTransitTime(stop){const parsed=readTransitNote(stop?.note),p=parsed.plan?.timing;return stop?.mode===(parsed.kind==='walking'?'walking':parsed.kind==='auto'?parsed.plan.routeMode:'transit')&&p?.v===1&&p.mode==='auto'&&Number.isInteger(p.minutes)&&(p.minutes>0||parsed.kind==='walking'&&p.minutes===0)&&p.minutes<=2880&&stop.travelMinutes===p.minutes;}
export function setTransitManualTime(note,minutes){
  const parsed=readTransitNote(note);if(!parsed.plan)return note;if(minutes!==null&&(!Number.isInteger(minutes)||minutes<0||minutes>2880))throw Error('invalid-time');
  const plan={...parsed.plan,timing:{v:1,mode:'manual',minutes,...(parsed.plan.timing?.options?{options:parsed.plan.timing.options}:{}),...(parsed.plan.timing?.pedestrian?{pedestrian:parsed.plan.timing.pedestrian}:{})}},summary=parsed.summary.split('\n').filter(s=>!s.startsWith('⏱ ')).join('\n'),text=metroTimingText(plan.timing);return mergeTransitNote(parsed.note,plan,summary+(text?'\n'+text:''),parsed.kind);
}
