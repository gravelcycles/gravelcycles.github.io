// Day-by-day trips (owner, 27 Nov: "the UI should show like day 1 travel,
// day 2 travel"): split a described journey (route-finder-service.js
// describe()) into travel days with the night between them. Pure functions;
// no engine logic. See docs/RAIL_ROUTE_FINDER_DAY_TRIPS.md, section 3.
//
// A journey's legs carry depLocal/arrLocal = {minutes, dayOffset, clock}:
// minutes on the station's local clock from 00:00 of the search date.
//
// The legs are split at every overnight wait between two consecutive legs:
//  - with a daily window (options.windowEnd(station, dayOffset) gives that
//    day's window end at the station, in local minutes after 00:00, or null
//    for no window there): a wait during which the window closes;
//  - with no window: a wait of at least NIGHT_WAIT minutes across local
//    midnight.
// A leg that itself runs past midnight (a night train) stays in its day and
// is flagged overnight. The night is spent where the wait is: the arrival
// station of the day's last leg. Nothing else is inferred.

export const NIGHT_WAIT=240;

function closesDuring(windowEnd,station,a,b){
  // Is there a day k with a <= k*1440 + end(k) < b?
  for(let k=Math.floor(a/1440)-1;k<=Math.floor(b/1440);k++){
    const end=windowEnd(station,k);
    if(end===null||end===undefined)continue;
    const t=k*1440+end;if(t>=a&&t<b)return true;}
  return false;
}

function overnightWait(prev,next,options){
  const a=prev.arrLocal.minutes,b=next.depLocal.minutes;
  if(!(b>a))return false;
  if(options.windowEnd)return closesDuring(options.windowEnd,prev.to.index,a,b);
  return b-a>=NIGHT_WAIT&&Math.floor(a/1440)<Math.floor(b/1440);
}

// -> [{legs, dayOffset, dep, arr, minutes, depLocal, arrLocal, overnightLegs,
//      night: null | {station, arrLocal, depLocal, minutes}}]
// `minutes` is the day's elapsed travel time (first departure to last
// arrival, changes included), the measure of the per-day limit, less the time
// spent at a via of the visitor's own choosing, up to its stay
// (options.viaStops: Map station index -> stay minutes; AR3 I3).
export function splitDays(journey,options={}){
  const legs=journey.legs||[];if(!legs.length)return[];
  const days=[];let current=[legs[0]];
  for(let i=1;i<legs.length;i++){
    if(!legs[i].stayOnBoard&&overnightWait(legs[i-1],legs[i],options)){days.push(current);current=[];}
    current.push(legs[i]);}
  days.push(current);
  return days.map((dayLegs,n)=>{
    const first=dayLegs[0],last=dayLegs[dayLegs.length-1],next=days[n+1]?.[0];
    let stays=0;if(options.viaStops)for(let i=1;i<dayLegs.length;i++){const stay=options.viaStops.get(dayLegs[i-1].to.index);if(stay)stays+=Math.max(0,Math.min(stay,dayLegs[i].dep-dayLegs[i-1].arr));}
    return{legs:dayLegs,dayOffset:first.depLocal.dayOffset,dep:first.dep,arr:last.arr,minutes:last.arr-first.dep-stays,
      depLocal:first.depLocal,arrLocal:last.arrLocal,
      overnightLegs:dayLegs.filter(l=>l.arrLocal.dayOffset>l.depLocal.dayOffset).length,
      night:next?{station:last.to,arrLocal:last.arrLocal,depLocal:next.depLocal,minutes:next.dep-last.arr}:null};});
}

// The day-by-day layout is used when a journey has more than one travel day.
export const isMultiDay=days=>days.length>1;

// The longest day's travel time, for the per-day limit (a post-check: see the
// design note, section 2).
export const longestDay=days=>days.reduce((m,d)=>Math.max(m,d.minutes),0);

// The name of the place to spend the night: the station's Hubs city when it
// belongs to one (cityOf(stationIndex) -> {name} | null), else the station's
// own name. Never a hotel or an inferred place.
export function nightPlace(station,cityOf=null){
  const city=cityOf?cityOf(station.index):null;
  return city&&city.name?city.name:station.name;
}
