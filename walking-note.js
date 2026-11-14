const START='[TripFlow WalkRoute v1]',END='[/TripFlow WalkRoute]';
export function readWalkingNote(note=''){
  const pos=note.lastIndexOf(START);if(pos<0||!note.endsWith(END))return {note};
  try{const lines=note.slice(pos+START.length,-END.length).trim().split('\n'),plan=JSON.parse(lines.shift());
    if(plan.v!==1||typeof plan.from!=='string'||typeof plan.to!=='string'||plan.route?.provider!=='fossgis-osrm-foot'||!/^[a-f0-9]{64}$/.test(plan.route.id)||!Number.isFinite(plan.route.meters)||!Number.isFinite(plan.route.seconds)||!['auto','manual'].includes(plan.timing?.mode))return {note};
    return {note:note.slice(0,pos).trimEnd(),plan,summary:lines.join('\n')};
  }catch{return {note};}
}
export function mergeWalkingNote(note,plan,summary=''){
  const plain=readWalkingNote(note).note,result=plan?`${plain}${plain?'\n\n':''}${START}\n${JSON.stringify(plan)}\n${summary}\n${END}`:plain;if(result.length>2000)throw Error('note-too-long');return result;
}
