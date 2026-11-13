import {readMetroNote,mergeMetroNote,metroStatus,metroTimingText} from './metro-core.js?v=web-9';
import {readBusNote,mergeBusNote} from './bus-core.js?v=web-9';
export function readTransitNote(note=''){
  const bus=readBusNote(note);if(bus.plan)return {...bus,kind:'bus'};
  const metro=readMetroNote(note);return {...metro,kind:metro.plan?'subway':null};
}
export function mergeTransitNote(note,plan,summary='',kind){
  const parsed=readTransitNote(note);return (kind||parsed.kind)==='bus'?mergeBusNote(parsed.note,plan,summary):mergeMetroNote(parsed.note,plan,summary);
}
export const transitStatus=metroStatus;
export function isAutoTransitTime(stop){const p=readTransitNote(stop?.note).plan?.timing;return stop?.mode==='transit'&&p?.v===1&&p.mode==='auto'&&Number.isInteger(p.minutes)&&p.minutes>0&&p.minutes<=2880&&stop.travelMinutes===p.minutes;}
export function setTransitManualTime(note,minutes){
  const parsed=readTransitNote(note);if(!parsed.plan)return note;if(minutes!==null&&(!Number.isInteger(minutes)||minutes<0||minutes>2880))throw Error('invalid-time');
  const plan={...parsed.plan,timing:{v:1,mode:'manual',minutes}},summary=parsed.summary.split('\n').filter(s=>!s.startsWith('⏱ ')).join('\n'),text=metroTimingText(plan.timing);return mergeTransitNote(parsed.note,plan,summary+(text?'\n'+text:''),parsed.kind);
}
