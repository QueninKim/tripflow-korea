import {validateIntercityService} from './intercity-core.js?v=web-21';
const START='[TripFlow Intercity v1]',END='[/TripFlow Intercity]';
export function readIntercityNote(note=''){
 const pos=note.lastIndexOf(START);if(pos<0||!note.endsWith(END))return {note};try{const lines=note.slice(pos+START.length,-END.length).trim().split('\n'),plan=JSON.parse(lines.shift());if(plan.v!==1||typeof plan.from!=='string'||typeof plan.to!=='string'||!plan.timing)throw Error('invalid');validateIntercityService(plan.service);return {note:note.slice(0,pos).trimEnd(),plan,summary:lines.join('\n')};}catch{return {note};}
}
export function mergeIntercityNote(note,plan,summary=''){
 const plain=readIntercityNote(note).note,result=plan?`${plain}${plain?'\n\n':''}${START}\n${JSON.stringify(plan)}\n${summary}\n${END}`:plain;if(result.length>2000)throw Error('note-too-long');return result;
}
