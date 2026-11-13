export const uuid = () => crypto.randomUUID().toUpperCase();
export const now = () => Date.now() / 1000 - 978307200;
export const toDate = seconds => new Date((seconds + 978307200) * 1000);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function arrivals(day) {
  let next = day.startMinutes;
  return day.stops.map((stop,i) => {
    if (i) next = next == null || stop.travelMinutes == null ? null : next + Math.max(0,stop.travelMinutes);
    const time = next;
    next = next == null ? null : next + Math.max(0,stop.stayMinutes);
    return time;
  });
}
export function clock(minutes) {
  if (minutes == null) return '—:—';
  const n = Math.max(0,minutes);
  return `${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}${n>=1440?' +'+Math.floor(n/1440)+'d':''}`;
}
export function validState(data) {
  if (!data || data.schemaVersion !== 1 || !['en','ko'].includes(data.language) || !Array.isArray(data.trips) || data.trips.length > 100) return false;
  return data.trips.every(t => typeof t.title === 'string' && Number.isSafeInteger(t.budgetKRW) && t.budgetKRW >= 0 && Array.isArray(t.days) && t.days.length <= 30 && Array.isArray(t.expenses) && t.expenses.every(e => Number.isSafeInteger(e.amountKRW) && e.amountKRW > 0) && t.days.every(d => Array.isArray(d.stops) && d.stops.every(s => typeof s.place?.name === 'string' && Number.isFinite(s.place.latitude) && Number.isFinite(s.place.longitude))));
}
export function invalidate(day) { for (const stop of day.stops) { delete stop.travelMinutes; stop.durationSource = 'manual'; } }
export function sampleState(catalog,lang='en') {
  const trip={id:uuid(),title:'A little Seoul escape',city:'Seoul',startDate:now(),budgetKRW:450000,expenses:[],isSample:true,days:Array.from({length:3},()=>({id:uuid(),startMinutes:540,stops:[]}))};
  const stop=(p,stay,travel) => ({id:uuid(),place:p,stayMinutes:stay,mode:'walking',...(travel?{travelMinutes:travel}:{}),durationSource:travel?'sample':'manual',note:''});
  trip.days[0].stops=[stop(catalog[0],90),stop(catalog[1],75,20),stop(catalog[2],60,25)];
  trip.days[1].stops=[stop(catalog[3],90)];
  return {schemaVersion:1,trips:[trip],selectedTripID:trip.id,language:lang,homeCurrency:'USD',rates:{}};
}
