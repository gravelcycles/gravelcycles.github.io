// Shared journey search for the Explore views: one day's hops sorted by
// departure, walking links between nearby stations, and a connection scan
// that reports the fastest journeys of the day rather than earliest arrivals.
import{haversineKm}from'./explore-data.js?v=1db9ee4e69a277e5';

export const CHANGE=5,WALK_M=700,INF=1e9;
const NO_START=-32768;

// Walking links between stations under 700 m, from a coarse lat/lon grid.
// Each list holds pairs: station, minutes. Built once per delivery.
const footCache=new WeakMap();
export function footLinks(data){
  if(footCache.has(data))return footCache.get(data);
  const S=data.stations,N=S.N,foot=Array.from({length:N},()=>[]),grid=new Map(),key=(a,b)=>a*100000+b;
  for(let i=0;i<N;i++){const k=key(Math.floor(S.lat[i]/0.01),Math.floor(S.lon[i]/0.015));if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);}
  for(let i=0;i<N;i++){const gy=Math.floor(S.lat[i]/0.01),gx=Math.floor(S.lon[i]/0.015);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const j of grid.get(key(gy+dy,gx+dx))||[]){if(j===i)continue;const m=haversineKm(S.lat[i],S.lon[i],S.lat[j],S.lon[j])*1000;if(m<WALK_M)foot[i].push(j,Math.round(m/75)+2);}}
  footCache.set(data,foot);return foot;
}

// Connections (one per hop) for the chosen day, sorted by departure. The last
// day asked for is kept, so Reach and More views share one copy.
const connCache=new WeakMap();
export function dayConnections(data,day){
  const cached=connCache.get(data);if(cached?.day===day)return cached;
  const lo=data.dayStart[day],hi=data.dayStart[day+1];let count=0;
  for(let t=lo;t<hi;t++){const p=data.tripProfile[t];count+=data.profileStart[p+1]-data.profileStart[p]-1;}
  const from=new Uint16Array(count),to=new Uint16Array(count),dep=new Int16Array(count),arr=new Int16Array(count),trip=new Uint32Array(count),call=new Uint16Array(count);
  let c=0;
  for(let t=lo;t<hi;t++){const p=data.tripProfile[t],pat=data.profilePattern[p],ps=data.patternStart[pat],b=data.profileStart[p],n=data.profileStart[p+1]-b,s0=data.tripStart[t];
    for(let i=0;i<n-1;i++){from[c]=data.patternStation[ps+i];to[c]=data.patternStation[ps+i+1];dep[c]=s0+data.profileDep[b+i];arr[c]=s0+data.profileArr[b+i+1];trip[c]=t;call[c]=i;c++;}}
  // Counting sort by departure minute.
  const minDep=-1440,span=5761,counts=new Uint32Array(span+1);for(let i=0;i<count;i++)counts[dep[i]-minDep+1]++;for(let i=1;i<=span;i++)counts[i]+=counts[i-1];
  const order=new Uint32Array(count);for(let i=0;i<count;i++)order[counts[dep[i]-minDep]++]=i;
  const pick=(src,Type)=>{const out=new Type(count);for(let i=0;i<count;i++)out[i]=src[order[i]];return out;};
  const passBlocked=new Uint8Array(hi-lo);for(let t=lo;t<hi;t++){const pc=data.journeys.patternPass[data.profilePattern[data.tripProfile[t]]];passBlocked[t-lo]=pc===1||pc===3?1:0;}
  const result={day,lo,hi,count,from:pick(from,Uint16Array),to:pick(to,Uint16Array),dep:pick(dep,Int16Array),arr:pick(arr,Int16Array),trip:pick(trip,Uint32Array),call:pick(call,Uint16Array),passBlocked};
  connCache.set(data,result);return result;
}

// Fastest journeys of the day from a set of origin stations to several sets
// of target stations, changes included: the least time between the first
// train leaving and the last one arriving, for any start from `earliest` on.
//
// An earliest-arrival search cannot answer this, because an early slow train
// may reach a junction first and then share its last leg with a later, faster
// start. Instead one pass in time order carries, for every station, the
// latest start from the origin that can be standing there ready to board, and
// for every train the latest start among the people on it. Each arrival at a
// target then gives one candidate journey, and the shortest is exact.
export function makeFastestSearch(data,conn,foot=footLinks(data)){
  const N=data.stations.N,C=conn,trips=C.hi-C.lo,NONE=-32768,RING=32;
  // Hops in order of arrival, for the moment each becomes a possible change.
  const byArrival=new Uint32Array(C.count);
  {const base=-1440,span=7201,counts=new Uint32Array(span+1);for(let c=0;c<C.count;c++)counts[C.arr[c]-base+1]++;for(let i=1;i<=span;i++)counts[i]+=counts[i-1];for(let c=0;c<C.count;c++)byArrival[counts[C.arr[c]-base]++]=c;}
  const lastArrival=C.count?C.arr[byArrival[C.count-1]]:0,lastDeparture=C.count?C.dep[C.count-1]:0;
  const ready=new Int16Array(N),readyTrains=new Uint8Array(N),isOrigin=new Uint8Array(N),targetOf=new Int16Array(N);
  const aboard=new Int16Array(trips),aboardTrains=new Uint8Array(trips),hopStart=new Int16Array(C.count),hopTrains=new Uint8Array(C.count);
  // People walking to a nearby station are ready there a few minutes later.
  const walking=Array.from({length:RING},()=>[]);
  function stand(station,start,trains){if(start>ready[station]||(start===ready[station]&&trains<readyTrains[station])){ready[station]=start;readyTrains[station]=trains;return true;}return false;}
  return function fastest(origins,targets,earliest){
    ready.fill(NONE);isOrigin.fill(0);targetOf.fill(-1);aboard.fill(NONE);hopStart.fill(NONE);for(const list of walking)list.length=0;
    for(const o of origins){isOrigin[o]=1;const f=foot[o];for(let k=0;k<f.length;k+=2)isOrigin[f[k]]=1;}
    targets.forEach((stations,index)=>{for(const s of stations)if(!isOrigin[s])targetOf[s]=index;});
    const best=targets.map(()=>null);
    let i=0,hi=C.count;while(i<hi){const m=(i+hi)>>1;if(C.dep[m]<earliest)i=m+1;else hi=m;}
    let j=0;hi=C.count;while(j<hi){const m=(j+hi)>>1;if(C.arr[byArrival[m]]<earliest)j=m+1;else hi=m;}
    const end=Math.max(lastDeparture,lastArrival+CHANGE);
    for(let minute=earliest;minute<=end;minute++){
      // Arrivals: after the change time, the people on a train can board here.
      while(j<C.count){const c=byArrival[j],a=C.arr[c];if(a+CHANGE>minute)break;j++;
        const start=hopStart[c];if(start===NONE)continue;
        const station=C.to[c],trains=hopTrains[c],target=targetOf[station];
        if(target>=0){const minutes=a-start,old=best[target];if(!old||minutes<old.minutes||(minutes===old.minutes&&trains<old.trains))best[target]={minutes,trains,depart:start,arrive:a};}
        if(stand(station,start,trains)){const f=foot[station];for(let k=0;k<f.length;k+=2)if(start>ready[f[k]])walking[(minute+f[k+1])%RING].push(f[k],start,trains);}
      }
      const walked=walking[minute%RING];if(walked.length){for(let k=0;k<walked.length;k+=3)stand(walked[k],walked[k+1],walked[k+2]);walked.length=0;}
      // Departures: board with the latest start standing here, or stay aboard.
      while(i<C.count&&C.dep[i]===minute){
        const from=C.from[i],tl=C.trip[i]-C.lo;let start=NONE,trains=0;
        if(isOrigin[from]){start=minute;trains=1;}else if(ready[from]!==NONE){start=ready[from];trains=Math.min(255,readyTrains[from]+1);}
        if(start!==NONE&&(start>aboard[tl]||(start===aboard[tl]&&trains<aboardTrains[tl]))){aboard[tl]=start;aboardTrains[tl]=trains;}
        hopStart[i]=aboard[tl];hopTrains[i]=aboardTrains[tl];i++;
      }
    }
    return best;
  };
}
