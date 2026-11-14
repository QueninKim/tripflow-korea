const START='[TripFlow AutoTransit v1]',END='[/TripFlow AutoTransit]';
export function readAutoNote(note=''){
  const pos=note.lastIndexOf(START);if(pos<0||!note.endsWith(END))return {note};
  try{const lines=note.slice(pos+START.length,-END.length).trim().split('\n'),plan=JSON.parse(lines.shift());
    const leg=l=>Array.isArray(l)&&(l[0]==='b'?l.length===4&&typeof l[1]==='string'&&l.slice(2).every(Number.isInteger):l[0]==='s'&&l.length===5&&l.slice(1).every(v=>typeof v==='string'));
    if(plan.v!==1||!['region','b','m','from','to'].every(k=>typeof plan[k]==='string')||!Array.isArray(plan.legs)||plan.legs.length>6||!plan.legs.every(leg)||!['transit','walking'].includes(plan.routeMode)||(plan.routeMode==='walking')!==(plan.legs.length===0))return {note};
    return {note:note.slice(0,pos).trimEnd(),plan,summary:lines.join('\n')};
  }catch{return {note};}
}
export function mergeAutoNote(note,plan,summary=''){
  const plain=readAutoNote(note).note,result=plan?`${plain}${plain?'\n\n':''}${START}\n${JSON.stringify(plan)}\n${summary}\n${END}`:plain;if(result.length>2000)throw Error('note-too-long');return result;
}
