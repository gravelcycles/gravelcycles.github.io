// City figures for More views: the hub cities of a delivery, the hourly tide
// of trains into and out of each, and the fastest journey between each pair.
import{haversineKm,clockUtcOffset}from'./explore-data.js?v=a613641732ab9825';
import{dayConnections,makeFastestSearch}from'./explore-scan.js?v=a613641732ab9825';

const LABELS={zurich:'Zürich','istanbul-halkali':'Istanbul',krakow:'Kraków',poznan:'Poznań',wroclaw:'Wrocław',gdansk:'Gdańsk',klaipeda:'Klaipėda'};
export const hubLabel=key=>LABELS[key]||key.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');

// Standard-time hours ahead of UTC; every other country in the data is UTC+1.
const UTC_HOURS={'Great Britain':0,Ireland:0,Portugal:0,Finland:2,Estonia:2,Latvia:2,Lithuania:2,Romania:2,Bulgaria:2,Greece:2,Ukraine:2,Moldova:2,'Türkiye':3};
// Minutes to add to the delivery's shared clock for a country's own clock.
// The shared clock is Central European (winter or summer) time; Türkiye keeps
// one offset all year.
export function localShift(country,manifest){
  const clock=clockUtcOffset(manifest),summer=clock>=120,hours=UTC_HOURS[country]??1;
  return(hours+(summer&&country!=='Türkiye'?1:0))*60-clock;
}

// Hub cities: their stations, a centre point and the country most of their
// stations are in.
export function hubCities(data){
  const S=data.stations,cities=S.hubs.map((key,index)=>({index,key,name:hubLabel(key),stations:[],lat:0,lon:0,country:''}));
  const tallies=cities.map(()=>new Map());
  for(let i=0;i<S.N;i++){const h=S.hub[i];if(h<0)continue;const c=cities[h];c.stations.push(i);c.lat+=S.lat[i];c.lon+=S.lon[i];const name=S.countries[S.country[i]];if(name)tallies[h].set(name,(tallies[h].get(name)||0)+1);}
  for(const c of cities){const n=c.stations.length||1;c.lat/=n;c.lon/=n;let top=0;for(const [name,count] of tallies[c.index])if(count>top){top=count;c.country=name;}}
  return cities;
}

// Trains entering and leaving each city in each local hour of one day. A
// train counts as arriving when it calls in the city after a stop outside it,
// and as leaving when its next stop is outside. A through train does both.
export function cityTides(data,day,cities=hubCities(data)){
  const S=data.stations,lo=data.dayStart[day],hi=data.dayStart[day+1];
  const tides=cities.map(c=>({city:c,arrive:new Uint32Array(24),leave:new Uint32Array(24),shift:localShift(c.country,data.manifest),arrivals:0,departures:0}));
  for(let t=lo;t<hi;t++){
    const p=data.tripProfile[t],pat=data.profilePattern[p],ps=data.patternStart[pat],b=data.profileStart[p],n=data.profileStart[p+1]-b,s0=data.tripStart[t];
    let before=-1;
    for(let i=0;i<n;i++){
      const h=S.hub[data.patternStation[ps+i]],after=i<n-1?S.hub[data.patternStation[ps+i+1]]:-1;
      if(h>=0){const tide=tides[h];
        if(i>0&&before!==h){const m=s0+data.profileArr[b+i]+tide.shift;if(m>=0&&m<1440){tide.arrive[Math.floor(m/60)]++;tide.arrivals++;}}
        if(i<n-1&&after!==h){const m=s0+data.profileDep[b+i]+tide.shift;if(m>=0&&m<1440){tide.leave[Math.floor(m/60)]++;tide.departures++;}}}
      before=h;
    }
  }
  // Net arrivals over a run of hours, as a share of the trains arriving then.
  const net=(tide,from,to)=>{let a=0,l=0;for(let h=from;h<to;h++){a+=tide.arrive[h];l+=tide.leave[h];}return a?(a-l)/a:0;};
  for(const tide of tides){tide.morning=net(tide,6,10);tide.evening=net(tide,16,20);}
  return tides;
}

// Journeys may start from this minute of the shared clock: 05:00.
export const NEIGHBOUR_FROM=5*60;
// Pairs further apart than this are not searched.
export const NEIGHBOUR_MAX_KM=800;
// Cities with fewer trains leaving than this have too little of their
// timetable published with clock times to be judged.
export const MIN_CITY_TRAINS=100;

// Fastest journey of the day between every pair of cities up to 800 km apart,
// changes included, taking the quicker direction. Returns a stepper: call
// next() once per origin city until it returns false, so a page can stay
// responsive, then read pairs().
export function neighbourSearch(data,day,cities=hubCities(data),tides=cityTides(data,day,cities),minTrains=MIN_CITY_TRAINS){
  const included=cities.filter(c=>tides[c.index].departures>=minTrains),left=cities.filter(c=>tides[c.index].departures<minTrains);
  const fastest=makeFastestSearch(data,dayConnections(data,day)),found=new Map();
  const distance=(a,b)=>haversineKm(a.lat,a.lon,b.lat,b.lon);
  let at=0;
  function next(){
    if(at>=included.length)return false;
    const origin=included[at++],targets=included.filter(c=>c!==origin&&distance(origin,c)<=NEIGHBOUR_MAX_KM);
    if(targets.length)fastest(origin.stations,targets.map(c=>c.stations),NEIGHBOUR_FROM).forEach((j,i)=>{
      if(!j)return;const target=targets[i],key=origin.index<target.index?origin.index*1000+target.index:target.index*1000+origin.index,old=found.get(key);
      if(!old||j.minutes<old.minutes)found.set(key,{...j,from:origin.index,to:target.index});});
    return at<included.length;
  }
  function pairs(){
    const rows=[];
    for(let i=0;i<included.length;i++)for(let k=i+1;k<included.length;k++){
      const a=included[i],b=included[k],km=distance(a,b);if(km>NEIGHBOUR_MAX_KM)continue;
      const j=found.get(a.index*1000+b.index)||null;
      rows.push({a,b,km,journey:j,speed:j?km/(j.minutes/60):0});
    }
    return rows;
  }
  return{next,pairs,included,left,get done(){return at;},total:included.length};
}
