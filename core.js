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

export const budgetCurrencies = ['KRW','USD','EUR','JPY','GBP','CNY','AUD','CAD','SGD'];
export function budgetAmount(raw, currency) {
  const text = String(raw).trim();
  if (!budgetCurrencies.includes(currency) || text.length > 32 || !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) throw Error('invalid-amount');
  const clean = text.replaceAll(',','');
  if (['KRW','JPY'].includes(currency) && clean.includes('.') && Number(clean.split('.')[1]) !== 0) throw Error('whole-units');
  if (!Number.isFinite(Number(clean))) throw Error('invalid-amount');
  return clean;
}
function decimalRatio(value) {
  const match = String(value).match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  if (!match) throw Error('invalid-rate');
  const fraction = match[2] || '', exponent = Number(match[3] || 0) - fraction.length;
  let numerator = BigInt(match[1] + fraction), denominator = 1n;
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  else denominator = 10n ** BigInt(-exponent);
  return [numerator,denominator];
}
function rateRatio(rate,unit) {
  if (typeof rate === 'string' && !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,8})?$/.test(rate.trim())) throw Error('invalid-rate');
  const rateText = String(rate).trim().replaceAll(',','');
  if (!Number.isFinite(Number(rateText)) || Number(rateText) <= 0 || Number(rateText) > 1e9 || ![1,100].includes(Number(unit))) throw Error('invalid-rate');
  const [numerator,denominator]=decimalRatio(rateText);
  return [numerator,denominator*BigInt(unit)];
}
/// Keep KRW budgets integral and round exactly once, half up, after conversion.
export function convertedBudget(raw, currency, rate = 1, unit = 1) {
  const amount = budgetAmount(raw,currency);
  if (currency === 'KRW') { rate = 1; unit = 1; }
  const [a,b] = decimalRatio(amount), [c,d] = rateRatio(rate,unit);
  const denominator = b*d, numerator = a*c;
  const rounded = (2n*numerator + denominator)/(2n*denominator);
  if (rounded > 1000000000n) throw Error('budget-limit');
  return Number(rounded);
}
export function budgetTotal(current, converted, adding) {
  if (!Number.isSafeInteger(converted) || converted < 0 || (adding && converted === 0)) throw Error('invalid-amount');
  const total = adding ? current + converted : converted;
  if (!Number.isSafeInteger(total) || total < 0 || total > 1000000000) throw Error('budget-limit');
  return total;
}
export function convertedExpense(raw,inputCurrency,rateCurrency='KRW',rate=1,unit=1) {
  const originalAmount=budgetAmount(raw,inputCurrency);
  if (!budgetCurrencies.includes(rateCurrency) || (inputCurrency!=='KRW'&&rateCurrency!==inputCurrency)) throw Error('invalid-rate');
  const amountKRW=convertedBudget(originalAmount,inputCurrency,rate,unit);
  if (amountKRW<1) throw Error('expense-minimum');
  let foreignAmount;
  if (rateCurrency==='KRW') foreignAmount=amountKRW;
  else {
    const [numerator,denominator]=rateRatio(rate,unit);
    if(inputCurrency!=='KRW') foreignAmount=Number(originalAmount);
    else {
      const scale=rateCurrency==='JPY'?1n:100n;
      const n=BigInt(amountKRW)*denominator*scale;
      const minor=(2n*n+numerator)/(2n*numerator);
      if(minor>BigInt(Number.MAX_SAFE_INTEGER)) throw Error('invalid-rate');
      foreignAmount=Number(minor)/Number(scale);
    }
  }
  return {amountKRW,originalAmount,originalCurrency:inputCurrency,rateCurrency,foreignAmount};
}
// Versioned keys preserve the original amount alongside an FXRate snapshot in
// the installed native schema. The native app retains arbitrary rate keys.
export function expenseRateKey(id,quote) {
  if(!['manual','latest'].includes(quote.source)||![1,100].includes(quote.unit))throw Error('invalid-rate');
  return `expense-fx-v1:${id.toUpperCase()}:${quote.originalCurrency}:${quote.originalAmount}:${quote.source}:${quote.unit}`;
}
export function expenseRateEntries(rates) {
  const entries=new Map();
  for(const [key,rate] of Object.entries(rates)) {
    const parts=key.split(':');
    if(parts.length!==6||parts[0]!=='expense-fx-v1'||!['manual','latest'].includes(parts[4])||![1,100].includes(Number(parts[5])))continue;
    try {
      const converted=convertedExpense(parts[3],parts[2],rate.currency,rate.krwPerUnit,1);
      entries.set(parts[1].toUpperCase(),{...converted,rate,key,source:parts[4],unit:Number(parts[5])});
    }catch{}
  }
  return entries;
}
export function sampleState(catalog,lang='en') {
  const trip={id:uuid(),title:'A little Seoul escape',city:'Seoul',startDate:now(),budgetKRW:450000,expenses:[],isSample:true,days:Array.from({length:3},()=>({id:uuid(),startMinutes:540,stops:[]}))};
  const stop=(p,stay,travel) => ({id:uuid(),place:p,stayMinutes:stay,mode:'walking',...(travel?{travelMinutes:travel}:{}),durationSource:travel?'sample':'manual',note:''});
  trip.days[0].stops=[stop(catalog[0],90),stop(catalog[1],75,20),stop(catalog[2],60,25)];
  trip.days[1].stops=[stop(catalog[3],90)];
  return {schemaVersion:1,trips:[trip],selectedTripID:trip.id,language:lang,homeCurrency:'USD',rates:{}};
}
