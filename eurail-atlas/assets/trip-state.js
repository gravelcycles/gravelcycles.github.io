// Share-link state of the route finder ("Plan a trip"), read and written
// with the rest of the atlas state (atlas-core.js readState/serializeState).
// Stations are canonical station ids, which stay stable from week to week;
// the time is the origin's local clock on a delivery date.
//   trip=FROM~TO        tripvia=ID[~ID]     tripat=YYYY-MM-DDTHH:MM (absent: now)
//   triparr=1 (arrive by)  tripdirect=1     tripmax=N (max changes)
//   tripchange=M (minimum change minutes)  trippass=e|r|s (Eurail only,
//   no reservation, no supplement; letters combine)
const ID=/^[A-Za-z0-9:._-]{1,80}$/;
const ids=value=>String(value||'').split('~').filter(id=>ID.test(id));

export function readTrip(p){
  const ends=ids(p.get('trip'));if(ends.length!==2)return null;
  const at=p.get('tripat'),pass=p.get('trippass')||'',max=p.has('tripmax')?Number(p.get('tripmax')):NaN,change=p.has('tripchange')?Number(p.get('tripchange')):NaN;
  return{from:ends[0],to:ends[1],via:ids(p.get('tripvia')).slice(0,3),
    at:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at||'')?at:null,arriveBy:p.get('triparr')==='1',direct:p.get('tripdirect')==='1',
    maxChanges:Number.isInteger(max)&&max>=0&&max<=7?max:null,minChange:Number.isInteger(change)&&change>=1&&change<=60?change:null,
    filters:{eurailOnly:pass.includes('e'),noReservation:pass.includes('r'),noSupplement:pass.includes('s')}};
}

export function writeTrip(p,trip){
  if(!trip||!ID.test(trip.from||'')||!ID.test(trip.to||''))return;
  p.set('trip',trip.from+'~'+trip.to);
  const via=(trip.via||[]).filter(id=>ID.test(id));if(via.length)p.set('tripvia',via.join('~'));
  if(trip.at)p.set('tripat',trip.at);if(trip.arriveBy)p.set('triparr','1');if(trip.direct)p.set('tripdirect','1');
  if(Number.isInteger(trip.maxChanges))p.set('tripmax',String(trip.maxChanges));
  if(Number.isInteger(trip.minChange))p.set('tripchange',String(trip.minChange));
  const f=trip.filters||{},pass=(f.eurailOnly?'e':'')+(f.noReservation?'r':'')+(f.noSupplement?'s':'');if(pass)p.set('trippass',pass);
}
