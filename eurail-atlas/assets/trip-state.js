// Share-link state of the route finder ("Plan a trip"), read and written
// with the rest of the atlas state (atlas-core.js readState/serializeState).
// Stations are canonical station ids, which stay stable from week to week;
// the time is the origin's local clock on a delivery date.
//   trip=FROM~TO        tripvia=ID[~ID] (up to 4 stops on the way, in order)
//   tripstay=M[~M] (minutes to stay at each via, same order; absent: 0)
//   tripat=YYYY-MM-DDTHH:MM (absent: now)
//   triparr=1 (arrive by)  tripdirect=1     tripmax=N (max changes)
//   tripchange=M (minimum change minutes)  trippass=e|r|s (Eurail only,
//   no reservation, no supplement; letters combine)
//   tripday=HH:MM-HH:MM | daylight | daylight~M | daylight~-M (daily travel
//   window on each station's local clock; M is 30 or 60, widening or with -
//   narrowing the daylight; start before end, none across midnight; `~`, not
//   `+`, which a typed link decodes as a space: AR3 M5)   tripmaxday=M (max travel per day, 60-1440 min)
//   (docs/RAIL_ROUTE_FINDER_DAY_TRIPS.md)
const ID=/^[A-Za-z0-9:._-]{1,80}$/;
const MARGINS=[-60,-30,0,30,60];
const hm=text=>{const m=/^(\d{2}):(\d{2})$/.exec(text||'');if(!m)return NaN;const h=Number(m[1]),n=Number(m[2]);return h<=24&&n<60&&h*60+n<=1440?h*60+n:NaN;};
const clock=minutes=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
export function readDayWindow(text){
  const d=/^daylight(?:~(-?)(\d{2}))?$/.exec(text||'');
  if(d){const margin=d[2]?(d[1]==='-'?-1:1)*Number(d[2]):0;return MARGINS.includes(margin)?{daylight:true,margin}:null;}
  const r=/^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(text||'');if(!r)return null;
  const start=hm(r[1]),end=hm(r[2]);return start<end?{start,end}:null;
}
export function writeDayWindow(w){
  if(!w)return null;
  if(w.daylight)return MARGINS.includes(w.margin||0)?'daylight'+(w.margin?'~'+(w.margin<0?'-':'')+String(Math.abs(w.margin)).padStart(2,'0'):''):null;
  return Number.isInteger(w.start)&&Number.isInteger(w.end)&&w.start>=0&&w.start<w.end&&w.end<=1440?clock(w.start)+'-'+clock(w.end):null;
}
const ids=value=>String(value||'').split('~').filter(id=>ID.test(id));

export function readTrip(p){
  const ends=ids(p.get('trip'));if(ends.length!==2)return null;
  const at=p.get('tripat'),pass=p.get('trippass')||'',max=p.has('tripmax')?Number(p.get('tripmax')):NaN,change=p.has('tripchange')?Number(p.get('tripchange')):NaN,maxDay=p.has('tripmaxday')?Number(p.get('tripmaxday')):NaN;
  const via=ids(p.get('tripvia')).slice(0,4),stays=String(p.get('tripstay')||'').split('~').map(Number);
  return{from:ends[0],to:ends[1],via,viaStay:via.map((_,n)=>Number.isInteger(stays[n])&&stays[n]>=0&&stays[n]<=2880?stays[n]:0),
    at:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at||'')?at:null,arriveBy:p.get('triparr')==='1',direct:p.get('tripdirect')==='1',
    maxChanges:Number.isInteger(max)&&max>=0&&max<=7?max:null,minChange:Number.isInteger(change)&&change>=1&&change<=60?change:null,
    filters:{eurailOnly:pass.includes('e'),noReservation:pass.includes('r'),noSupplement:pass.includes('s')},
    dayWindow:readDayWindow(p.get('tripday')),maxDay:Number.isInteger(maxDay)&&maxDay>=60&&maxDay<=1440?maxDay:null};
}

export function writeTrip(p,trip){
  if(!trip||!ID.test(trip.from||'')||!ID.test(trip.to||''))return;
  p.set('trip',trip.from+'~'+trip.to);
  // A stay belongs to its via: invalid ids are dropped together with their stays.
  const kept=(trip.via||[]).map((id,n)=>[id,(trip.viaStay||[])[n]]).filter(([id])=>ID.test(id)).slice(0,4);
  if(kept.length){p.set('tripvia',kept.map(([id])=>id).join('~'));
    const stays=kept.map(([,m])=>Number.isInteger(m)&&m>0&&m<=2880?m:0);if(stays.some(Boolean))p.set('tripstay',stays.join('~'));}
  if(trip.at)p.set('tripat',trip.at);if(trip.arriveBy)p.set('triparr','1');if(trip.direct)p.set('tripdirect','1');
  if(Number.isInteger(trip.maxChanges))p.set('tripmax',String(trip.maxChanges));
  if(Number.isInteger(trip.minChange))p.set('tripchange',String(trip.minChange));
  const f=trip.filters||{},pass=(f.eurailOnly?'e':'')+(f.noReservation?'r':'')+(f.noSupplement?'s':'');if(pass)p.set('trippass',pass);
  const day=writeDayWindow(trip.dayWindow);if(day)p.set('tripday',day);
  if(Number.isInteger(trip.maxDay)&&trip.maxDay>=60&&trip.maxDay<=1440)p.set('tripmaxday',String(trip.maxDay));
}
