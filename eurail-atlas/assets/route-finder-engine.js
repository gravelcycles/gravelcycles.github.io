// Route finder search engine: decodes the delivery's route-finder timetable
// (assets/route-finder/, rail_data/route_finder.py) and answers A to B
// questions with a connection scan. Pure functions, no DOM: the worker
// (route-finder-worker.js) and the Node tests share it.
//
// Rules, from the owner's direction and docs/RAIL_ROUTE_FINDER.md:
// - changes only within one canonical station (same station index), after the
//   minimum change time, or over a reviewed stay-on-board link (no change);
// - a trip is boarded only where pickup is allowed and left only where
//   drop-off is allowed (code 1 = none);
// - every train is in the data once (the duplicate rule is applied upstream);
// - nothing is inferred: no walking, no invented connections.

export const NO_PICKUP=1,NO_DROPOFF=1,INF=0x3fffffff;
// The most trains one journey may take (owner, 27 Nov: across all of Europe,
// "even if it takes like 50 hours"; Narvik to Napoli needs nine).
export const MAX_TRAINS=12;
const NONE=-1;

const planes16=(bytes,offset,count,signed=false)=>{
  const out=signed?new Int16Array(count):new Uint16Array(count);
  for(let i=0;i<count;i++){const v=bytes[offset+i]|bytes[offset+count+i]<<8;out[i]=signed&&v>=0x8000?v-0x10000:v;}
  return out;
};
const u32=(buffer,bytes,offset,count)=>{
  if(offset%4===0)return new Uint32Array(buffer.slice(bytes.byteOffset+offset,bytes.byteOffset+offset+4*count));
  const view=new DataView(buffer,bytes.byteOffset),out=new Uint32Array(count);
  for(let i=0;i<count;i++)out[i]=view.getUint32(offset+4*i,true);
  return out;
};
const magic=(bytes,text)=>{for(let i=0;i<4;i++)if(bytes[i]!==text.charCodeAt(i))throw new Error('route_finder_bad_magic:'+text);};
const header=(bytes,count,at=4)=>{const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out=[];for(let i=0;i<count;i++)out.push(view.getUint32(at+4*i,true));return out;};

// patterns.bin, profiles.bin and links.bin (uncompressed ArrayBuffers) plus
// the parsed stations.json and journeys.json.
// footpaths: optional reviewed walks, [[from station, to station, minutes], ...] (directed).
export function decodeWeek({stations,journeys,patterns,profiles,links,footpaths}){
  let bytes=new Uint8Array(patterns);magic(bytes,'RFP2');
  const[P,S,R]=header(bytes,3);let o=16;
  const patternStart=u32(patterns,bytes,o,P+1);o+=4*(P+1);
  const patternStation=planes16(bytes,o,S);o+=2*S;
  const steps=u32(patterns,bytes,o,R);o+=4*R;
  const code=new Uint8Array(S);for(let i=0,at=0;i<R;i++){at+=steps[i];code[at]=bytes[o+i];}
  bytes=new Uint8Array(profiles);magic(bytes,'RFR1');
  const[F,C]=header(bytes,2);o=12;
  const profilePattern=new Uint32Array(F),profileCall=new Uint32Array(F+1);
  for(let i=0,p=0;i<F;i++){p+=bytes[o+i];profilePattern[i]=p;profileCall[i+1]=profileCall[i]+patternStart[p+1]-patternStart[p];}
  o+=F;
  if(profileCall[F]!==C)throw new Error('route_finder_profiles_do_not_cover_their_patterns');
  const run=planes16(bytes,o,C);o+=2*C;const dwell=planes16(bytes,o,C);
  const arrival=new Uint16Array(C),departure=new Uint16Array(C);
  for(let f=0;f<F;f++){let clock=0;for(let k=profileCall[f];k<profileCall[f+1];k++){clock+=run[k];arrival[k]=clock;clock+=dwell[k];departure[k]=clock;}}
  const week={stations,journeys,N:stations.names.length,P,patternStart,patternStation,code,profilePattern,profileCall,arrival,departure,links:null};
  if(links)week.links=decodeLinks(links);
  if(footpaths&&footpaths.length){week.footpaths=new Map();for(const[a,b,w]of footpaths){if(a===b||!(w>0))continue;if(!week.footpaths.has(a))week.footpaths.set(a,[]);week.footpaths.get(a).push([b,w]);}}
  return week;
}

export function decodeLinks(buffer){
  const bytes=new Uint8Array(buffer);magic(bytes,'RFS1');
  const[n]=header(bytes,1);let o=8;
  const fromDay=bytes.slice(o,o+n);o+=n;const fromTrip=u32(buffer,bytes,o,n);o+=4*n;
  const toDay=bytes.slice(o,o+n);o+=n;const toTrip=u32(buffer,bytes,o,n);o+=4*n;
  return{n,fromDay,fromTrip,toDay,toTrip,station:planes16(bytes,o,n)};
}

// day-<n>.bin: trips sorted by profile, then start.
export function decodeDay(buffer){
  const bytes=new Uint8Array(buffer);magic(bytes,'RFD2');
  const[T]=header(bytes,1);const steps=u32(buffer,bytes,8,T),profile=new Uint32Array(T);
  for(let i=0,p=0;i<T;i++){p+=steps[i];profile[i]=p;}
  return{T,profile,start:planes16(bytes,8+4*T,T,true)};
}

// Every hop of date d's trips, and of date d + 1's trips that start on d + 1
// (offset by 1440), sorted by departure: the connections one search reads.
// `days` holds decoded day files by date index (d + 1 may be missing at the
// end of the week). `allow(pattern)` may leave patterns out (pass filters).
export function buildConnections(week,days,d,allow=null){
  const parts=[[d,0]];if(days[d+1])parts.push([d+1,1440]);
  // First pass: the trips of the search and their number of hops.
  let T=0,count=0;
  for(const[day,shift]of parts){const D=days[day];for(let i=0;i<D.T;i++){
    if(shift&&D.start[i]<0)continue; // already in date d as an after-midnight run
    const f=D.profile[i];if(allow&&!allow(week.profilePattern[f]))continue;T++;count+=week.profileCall[f+1]-week.profileCall[f]-1;}}
  const{patternStart,patternStation,code,profilePattern,profileCall,arrival,departure}=week;
  // Second pass: count hops per sort key, so the third pass writes every hop
  // straight to its place. Key: departure, and within a minute zero-minute
  // hops first, so a hop arriving at that minute precedes the departures it
  // feeds (with the minimum change of at least one minute, that is exact).
  let lo=INF,hi=-INF;
  for(const[day,shift]of parts){const D=days[day];for(let i=0;i<D.T;i++){if(shift&&D.start[i]<0)continue;const f=D.profile[i];if(allow&&!allow(profilePattern[f]))continue;
    const s0=D.start[i]+shift,k0=profileCall[f],k1=profileCall[f+1]-1;if(k1<=k0)continue;
    const first=s0+departure[k0],last=s0+departure[k1-1];if(first<lo)lo=first;if(last>hi)hi=last;}}
  const span=count?2*(hi-lo)+3:1,slot=new Uint32Array(span);
  for(const[day,shift]of parts){const D=days[day];for(let i=0;i<D.T;i++){if(shift&&D.start[i]<0)continue;const f=D.profile[i];if(allow&&!allow(profilePattern[f]))continue;
    const s0=D.start[i]+shift,k0=profileCall[f],n=profileCall[f+1]-k0;
    for(let x=0;x<n-1;x++){const dp=departure[k0+x];slot[2*(s0+dp-lo)+(arrival[k0+x+1]>dp?1:0)+1]++;}}}
  for(let i=1;i<span;i++)slot[i]+=slot[i-1];
  const tripDay=new Uint8Array(T),tripIndex=new Uint32Array(T),tripStart=new Int32Array(T),tripProfile=new Uint32Array(T);
  const from=new Uint16Array(count),to=new Uint16Array(count),dep=new Int32Array(count),arr=new Int32Array(count),trip=new Uint32Array(count),call=new Uint16Array(count),flags=new Uint8Array(count);
  let t=0;
  for(const[day,shift]of parts){const D=days[day];for(let i=0;i<D.T;i++){
    if(shift&&D.start[i]<0)continue;const f=D.profile[i],p=profilePattern[f];if(allow&&!allow(p))continue;
    const ps=patternStart[p],k0=profileCall[f],n=profileCall[f+1]-k0,s0=D.start[i]+shift;
    tripDay[t]=day;tripIndex[t]=i;tripStart[t]=s0;tripProfile[t]=f;
    for(let x=0;x<n-1;x++){const dp=departure[k0+x],ar=arrival[k0+x+1],c=slot[2*(s0+dp-lo)+(ar>dp?1:0)]++;
      from[c]=patternStation[ps+x];to[c]=patternStation[ps+x+1];dep[c]=s0+dp;arr[c]=s0+ar;trip[c]=t;call[c]=x;
      // Bit 0: pickup allowed at from; bit 1: drop-off allowed at to.
      flags[c]=((code[ps+x]&3)!==NO_PICKUP?1:0)|((code[ps+x+1]>>2&3)!==NO_DROPOFF?2:0);}
    t++;}}
  const C={d,count,T,from,to,dep,arr,trip,call,flags,arrivalOrder:null,tripDay,tripIndex,tripStart,tripProfile,
    stay:new Map(),stayBack:new Map(),hasStay:new Uint8Array(T),hasStayBack:new Uint8Array(T)};
  // Reviewed stay-on-board links between trips of this search: key trip*65536+station.
  if(week.links){const local=new Map();for(let t=0;t<T;t++)local.set(C.tripDay[t]*0x100000000+C.tripIndex[t],t);
    const L=week.links;for(let r=0;r<L.n;r++){const a=local.get(L.fromDay[r]*0x100000000+L.fromTrip[r]),b=local.get(L.toDay[r]*0x100000000+L.toTrip[r]);
      if(a===undefined||b===undefined)continue;const key=a*65536+L.station[r],back=b*65536+L.station[r];
      if(!C.stay.has(key))C.stay.set(key,[]);C.stay.get(key).push(b);C.hasStay[a]=1;
      if(!C.stayBack.has(back))C.stayBack.set(back,[]);C.stayBack.get(back).push(a);C.hasStayBack[b]=1;}}
  return C;
}

const canBoard=(week,C,c)=>(C.flags[c]&1)!==0;

// A hop mask belongs to one connection set: a mask of another set (another
// date, or rebuilt) is refused rather than misread.
function checkedMask(C,usable){
  if(!usable)return null;
  if(!(usable instanceof Uint8Array)||usable.length!==C.count)throw new Error('route_finder_mask_does_not_match');
  return usable;
}

// The hop mask of connection set C: ok(from, dep, to, arr) with times on C's
// clock (minutes from 00:00 of C's first date, C.d). Cached on C by `id`.
export function maskConnections(C,id,ok){
  C.usable??=new Map();if(C.usable.has(id))return C.usable.get(id);
  const m=new Uint8Array(C.count);for(let c=0;c<C.count;c++)m[c]=ok(C.from[c],C.dep[c],C.to[c],C.arr[c])?1:0;
  C.usable.set(id,m);return m;
}
const canAlight=(week,C,c)=>(C.flags[c]&2)!==0;

// Earliest arrival at `to` for a departure at or after `depart` (minutes on
// the shared clock from 00:00 of date d), for every number of trains up to
// maxChanges + 1, passing through `via` stations in order. Returns the
// journeys that are not dominated (fewer trains or earlier arrival).
// query: {from:[station], to:[station], depart, maxChanges=5, minChange=5,
//         (minChange is at least 1 minute)
//         via:[{stations:[station], stopover:minutes}], tripAllowed(t),
//         horizon: minutes after `depart` within which the first train must
//           leave (1440); trains already boarded and later changes are
//           followed past it, so long journeys still arrive (Luzern → Palermo),
//         slack: how much later than the fastest a fewer-change journey may arrive (360),
//         arriveFrom: arrivals at `to` before this minute do not count (arrive-by windows),
//         carry: {state, C, shift} continues the search of `state` (returned by an
//           earlier earliest() with keepState on connections C) on these
//           connections, whose clock starts `shift` minutes later: every station
//           time reached there is a start here (multi-day journeys, overnight
//           waits). Times of the journeys stay on the first search's clock,
//         keepState: return {journeys, state} so a later search can carry on,
//         usable: Uint8Array(C.count), 1 where a hop may be ridden (a daily
//           travel window, docs/RAIL_ROUTE_FINDER_DAY_TRIPS.md; maskConnections()).
//           A masked hop cannot be ridden, so a passenger on board must leave the
//           train before it: the trip is split there. Waiting at a station
//           stays allowed (a night stop)}
export function earliest(week,C,query){
  const N=week.N,K=Math.min(MAX_TRAINS,(query.maxChanges??5)+1),change=Math.max(1,query.minChange??5);
  const via=query.via||[],P=via.length+1,viaSet=via.map(v=>new Set(v.stations)),stopover=via.map(v=>Math.max(0,v.stopover||0));
  const target=new Set(query.to),allowed=query.tripAllowed||null,isTarget=new Uint8Array(N);for(const s of target)isTarget[s]=1;
  const size=P*(K+1)*N,at=(p,k,s)=>(p*(K+1)+k)*N+s;
  const best=new Int32Array(size).fill(INF),parentConn=new Int32Array(size).fill(NONE),parentEnter=new Int32Array(size).fill(NONE),parentVia=new Uint8Array(size);
  // Reviewed footpaths (week.footpaths: station -> [[station, minutes]]), walked
  // straight after a train arrives or from the origin; never two in a row.
  // A walk record (parentVia 2) keeps the station walked from and the minutes.
  const foot=query.footpaths===false?null:week.footpaths||null,walkFrom=foot?new Int32Array(size).fill(NONE):null,walkMinutes=foot?new Uint16Array(size):null;
  // Arrivals by train only: a walk starts from those (a walk record must not stop a train arrival from walking on).
  const rideBest=foot?new Int32Array(size).fill(INF):null;
  // Stations a walk away from the destination: station -> [[destination, minutes]].
  let walkIn=null;if(foot)for(const[s,list]of foot)for(const[b,w]of list)if(target.has(b)){walkIn??=new Map();if(!walkIn.has(s))walkIn.set(s,[]);walkIn.get(s).push([b,w]);}
  // Walking into the destination: the arrival is the end of the walk.
  const finalBest=new Int32Array(K+1).fill(INF),finalConn=new Int32Array(K+1).fill(NONE),finalEnter=new Int32Array(K+1).fill(NONE),finalFrom=new Int32Array(K+1).fill(NONE),finalMinutes=new Uint16Array(K+1);
  const legs=new Uint8Array(P*C.T).fill(255),enter=new Int32Array(P*C.T).fill(NONE);
  // Boardings: conn index (>= 0) or -(2 + stay row) for a stay-on-board or
  // pass-through record: [phase, trip, conn at the handoff, enter before].
  const records=[];
  // A stay-on-board handoff applies from the handoff call of the next trip
  // onward, never to its earlier calls: kept pending until that trip departs
  // the station. Key (phase * T + trip) * 65536 + station -> [trains, record].
  const pending=new Map(),hasPending=new Uint8Array(C.T);
  // Phases above `top` hold nothing yet (no via reached): the scan skips them.
  const carry=query.carry||null;let top=0;
  const usable=checkedMask(C,query.usable);
  if(carry){const prev=carry.state;if(prev.P!==P||prev.K!==K||prev.N!==N)throw new Error('route_finder_carry_does_not_match');
    // Arrivals of the earlier search, on this clock; reconstruction goes back into it (parentVia 3).
    for(let i=0;i<size;i++){const b=prev.best[i];if(b<INF){best[i]=b-carry.shift;parentVia[i]=3;}}top=prev.top;}
  else for(const o of query.from)best[at(0,0,o)]=query.depart;
  if(foot&&!carry)for(const o of query.from)for(const[b,w]of foot.get(o)||[]){const i=at(0,0,b);if(query.depart+w<best[i]){best[i]=query.depart+w;parentVia[i]=2;walkFrom[i]=o;walkMinutes[i]=w;}}
  const ready=(p,s,dep,k0)=>{for(let k=k0;k<K;k++){const b=best[at(p,k,s)];if(b<INF&&b+(k?change:0)<=dep)return k;}return -1;};
  // The first train leaves from `depart` to `depart + horizon` (default 24 h).
  // The horizon bounds only that boarding: the scan follows trains already
  // boarded and later changes past it, until the arrival bounds below stop it
  // (or the connections of the two dates end).
  const firstBound=query.depart+(query.horizon??1440),arriveFrom=query.arriveFrom??-INF;let bound=INF;const slack=query.slack??360;
  const arrive=(p,k,s,time,c,e)=>{
    if(!(p===P-1&&time<arriveFrom&&target.has(s)))for(let kk=k;kk<=K;kk++){const i=at(p,kk,s);if(time<best[i]){best[i]=time;parentConn[i]=c;parentEnter[i]=e;parentVia[i]=0;}else break;}
    // Walking into the destination: checked for every arrival, since with an
    // arrival window (arriveFrom) an earlier arrival does not make a later one useless.
    if(walkIn&&p===P-1){const into=walkIn.get(s);if(into)for(const[b,w]of into)if(time+w>=arriveFrom)for(let kk=k;kk<=K;kk++){if(time+w<finalBest[kk]){finalBest[kk]=time+w;finalConn[kk]=c;finalEnter[kk]=e;finalFrom[kk]=s;finalMinutes[kk]=w;}else break;}}
    if(!foot||time>=rideBest[at(p,k,s)])return;
    for(let kk=k;kk<=K;kk++){const i=at(p,kk,s);if(time<rideBest[i])rideBest[i]=time;else break;}
    for(const[b,w]of foot.get(s)||[]){
      // Ready to board at b as if the walk were the change (at least the minimum change).
      const ready=time+Math.max(w,change)-change;
      // In the last phase the destination holds arrivals only; a walk into it is finalBest.
      if(!(p===P-1&&target.has(b)))for(let kk=k;kk<=K;kk++){const i=at(p,kk,b);if(ready<best[i]){best[i]=ready;parentConn[i]=c;parentEnter[i]=e;parentVia[i]=2;walkFrom[i]=s;walkMinutes[i]=w;}else break;}
    }
  };
  let first=0,lo=0,hi=C.count;while(lo<hi){const m=lo+hi>>1;if(C.dep[m]<query.depart)lo=m+1;else hi=m;}first=lo;
  for(let c=first;c<C.count;c++){
    if(C.dep[c]>bound)break;
    const t=C.trip[c];if(allowed&&!allowed(t))continue;
    const s=C.from[c],a=C.to[c];
    // A masked hop: nobody rides it. Everyone on board leaves before it (every
    // phase), and a stay-on-board hand-off waiting for this departure is dropped,
    // so a later call of the same trip at this station cannot pick it up.
    if(usable&&!usable[c]){for(let p=0;p<P;p++){const j=p*C.T+t;legs[j]=255;enter[j]=NONE;if(hasPending[t])pending.delete(j*65536+s);}continue;}
    const board=canBoard(week,C,c);
    for(let p=0;p<=top;p++){
      const j=p*C.T+t;
      if(hasPending[t]){const waiting=pending.get(j*65536+s);if(waiting&&waiting[0]<legs[j]){legs[j]=waiting[0];enter[j]=waiting[1];}}
      // No boarding at the destination: leaving it to come back is never a journey.
      if(board&&!(p===P-1&&isTarget[s])){const k=ready(p,s,C.dep[c],C.dep[c]>firstBound?1:0);if(k>=0&&k+1<legs[j]){legs[j]=k+1;enter[j]=c;}}
      const L=legs[j];if(L===255)continue;
      if(canAlight(week,C,c)){
        arrive(p,L,a,C.arr[c],c,enter[j]);
        // Reaching a via station: the next phase starts there after the stopover.
        if(p+1<P&&viaSet[p].has(a)){const wait=Math.max(0,stopover[p]-change);
          for(let kk=L;kk<=K;kk++){const i=at(p+1,kk,a),time=C.arr[c]+wait;if(time<best[i]){best[i]=time;parentConn[i]=c;parentEnter[i]=enter[j];parentVia[i]=1;if(p+1>top)top=p+1;}else break;}}
        // Fewer trains may still arrive later than the best overall: the scan
        // can stop only once departures pass the best one-train arrival.
        // Alternatives with fewer trains are searched up to `slack` minutes
        // (default 6 h) after the fastest arrival.
        if(p===P-1&&target.has(a))bound=Math.min(bound,best[at(P-1,1,a)],best[at(P-1,K,a)]+slack);
        if(p===P-1&&finalBest[K]<INF)bound=Math.min(bound,finalBest[1],finalBest[K]+slack);
      }
      // Riding through a via station without a stopover moves to the next phase on the same train.
      if(p+1<P&&!stopover[p]&&viaSet[p].has(a)){const q=(p+1)*C.T+t;if(L<legs[q]){legs[q]=L;records.push([p,t,c,enter[j]]);enter[q]=-(2+records.length-1);if(p+1>top)top=p+1;}}
      // A reviewed stay-on-board link continues on another trip with no change.
      const next=C.hasStay[t]?C.stay.get(t*65536+a):undefined;
      if(next)for(const t2 of next){const key=(p*C.T+t2)*65536+a,waiting=pending.get(key);
        if(!waiting||L<waiting[0]){records.push([p,t,c,enter[j]]);pending.set(key,[L,-(2+records.length-1)]);hasPending[t2]=1;}}
    }
  }
  const results=[];let previous=INF;
  const state={best,parentConn,parentEnter,parentVia,records,at,P,K,N,change,walkFrom,walkMinutes,C,
    offset:carry?carry.state.offset+carry.shift:0,carry:carry?carry.state:null,top};
  for(let k=1;k<=K;k++){let bestTime=INF,bestStation=NONE;for(const s of target){const b=best[at(P-1,k,s)];if(b<bestTime){bestTime=b;bestStation=s;}}
    const walkIn=finalBest[k]<bestTime;
    if(walkIn)bestTime=finalBest[k];
    if(bestTime<previous){
      const journey=walkIn?reconstruct(week,C,state,P-1,k,NONE,{conn:finalConn[k],enter:finalEnter[k],from:finalFrom[k],to:[...target].find(t=>(foot.get(finalFrom[k])||[]).some(([b,w])=>b===t&&w===finalMinutes[k])),minutes:finalMinutes[k]}):reconstruct(week,C,state,P-1,k,bestStation);
      results.push(journey);previous=bestTime;}}
  return query.keepState?{journeys:results,state}:results;
}

function segment(week,C,trip,boardConn,alightConn,stayIn,offset=0){
  const f=C.tripProfile[trip],p=week.profilePattern[f],ps=week.patternStart[p];
  return{trip,day:C.tripDay[trip],index:C.tripIndex[trip],pattern:p,board:C.call[boardConn],alight:C.call[alightConn]+1,
    from:week.patternStation[ps+C.call[boardConn]],to:week.patternStation[ps+C.call[alightConn]+1],dep:C.dep[boardConn]+offset,arr:C.arr[alightConn]+offset,stayOnBoard:!!stayIn};
}

// Walk back from (phase, trains, station): legs in travel order. A stay-on-
// board handoff splits one ride into two segments of one leg.
function reconstruct(week,C,state,p,k,s,finalWalk=null){return finish(rides(week,C,state,p,k,s,finalWalk));}
// The legs (groups of segments of one ride) reaching (phase, trains, station).
function rides(week,C,state,p,k,s,finalWalk=null){
  const{parentConn,parentEnter,parentVia,records,at,walkFrom,walkMinutes,offset}=state,legs=[];
  let guard=0,pendingConn=NONE,pendingEnter=NONE;
  // Walking into the destination: the last ride ends where the walk starts.
  if(finalWalk){legs.push([{walk:true,from:finalWalk.from,to:finalWalk.to,minutes:finalWalk.minutes}]);s=finalWalk.from;pendingConn=finalWalk.conn;pendingEnter=finalWalk.enter;}
  while(k>0){
    if(++guard>64)throw new Error('route_finder_reconstruction_loop');
    const i=at(p,k,s);let c=parentConn[i],e=parentEnter[i];let viaStep=parentVia[i];
    // Reached in an earlier search (an earlier date's connections): its rides come first.
    if(pendingConn===NONE&&viaStep===3)return[...rides(week,state.carry.C,state.carry,p,k,s),...legs];
    if(pendingConn!==NONE){c=pendingConn;e=pendingEnter;viaStep=0;pendingConn=NONE;}
    else if(viaStep===2){
      // A walk to s after the ride that arrived at walkFrom (same trains, same phase).
      legs.unshift([{walk:true,from:walkFrom[i],to:s,minutes:walkMinutes[i]}]);s=walkFrom[i];viaStep=0;
    }
    if(c===NONE)throw new Error('route_finder_no_parent');
    // A record made on reaching a via station belongs to the phase before it.
    const ride=[];let t=C.trip[c],phase=viaStep===1?p-1:p;
    for(;;){
      if(e>=0){ride.unshift(segment(week,C,t,e,c,false,offset));break;}
      const[q,t1,cs,before]=records[-e-2];
      // Same train through a via (t1 === t), or a stay-on-board handoff onto t.
      if(t1!==t){ride.unshift(segment(week,C,t,firstCallAfter(C,t,cs),c,true,offset));c=cs;t=t1;}
      phase=q;e=before;
    }
    // Merge consecutive segments of the same trip (a ride through a via).
    for(let n=ride.length-1;n>0;n--)if(ride[n].trip===ride[n-1].trip&&!ride[n].stayOnBoard){ride[n-1].alight=ride[n].alight;ride[n-1].to=ride[n].to;ride[n-1].arr=ride[n].arr;ride.splice(n,1);}
    legs.unshift(ride);
    s=C.from[e];k-=1;p=phase;
  }
  // A walk from the origin to the first boarding station.
  if(walkFrom){const i=at(p,0,s);if(parentVia[i]===2)legs.unshift([{walk:true,from:walkFrom[i],to:s,minutes:walkMinutes[i]}]);
    else if(parentVia[i]===3)return[...rides(week,state.carry.C,state.carry,p,0,s),...legs];}
  else if(state.carry&&state.parentVia[at(p,0,s)]===3)return[...rides(week,state.carry.C,state.carry,p,0,s),...legs];
  return legs;
}

// Times of the walks (from the rides beside them) and the journey's totals.
function finish(groups){
  const flat=groups.flat();
  for(let n=0;n<flat.length;n++){const leg=flat[n];if(!leg.walk)continue;
    if(n>0){leg.dep=flat[n-1].arr;leg.arr=leg.dep+leg.minutes;}else{leg.arr=flat[1].dep;leg.dep=leg.arr-leg.minutes;}}
  const trains=groups.filter(group=>!group[0].walk).length;
  return{legs:flat,trains,changes:trains-1,dep:flat[0].dep,arr:flat[flat.length-1].arr,from:flat[0].from,to:flat[flat.length-1].to};
}

// The connection of trip t that departs from the station where hop cs arrives (the handoff).
function firstCallAfter(C,t,cs){
  // Connections are sorted by departure; scan forward from the handoff time.
  let lo=0,hi=C.count;while(lo<hi){const m=lo+hi>>1;if(C.dep[m]<C.arr[cs])lo=m+1;else hi=m;}
  for(let c=lo;c<C.count;c++)if(C.trip[c]===t&&C.from[c]===C.to[cs])return c;
  throw new Error('route_finder_handoff_not_found');
}

// Latest departure from `from` arriving at `to` by `query.arriveBy`, for
// every number of trains up to maxChanges + 1: the mirror of earliest(),
// scanning connections by decreasing arrival. No via stations (arriveBy()
// handles those). query: {from, to, arriveBy, maxChanges, minChange,
// tripAllowed, window: minutes before arriveBy within which the last train
// must arrive (1440); earlier boardings of a long journey are followed past it}.
// Connection indices by decreasing arrival (stable), built on first use.
function arrivalOrder(C){
  if(C.arrivalOrder)return C.arrivalOrder;
  let lo=INF,hi=-INF;for(let i=0;i<C.count;i++){const v=C.arr[i];if(v<lo)lo=v;if(v>hi)hi=v;}
  const span=C.count?hi-lo+2:1,counts=new Uint32Array(span);for(let i=0;i<C.count;i++)counts[C.arr[i]-lo+1]++;
  for(let i=1;i<span;i++)counts[i]+=counts[i-1];
  const ascending=new Uint32Array(C.count);for(let i=0;i<C.count;i++)ascending[counts[C.arr[i]-lo]++]=i;
  return C.arrivalOrder=ascending.reverse();
}

export function latest(week,C,query){
  const N=week.N,K=Math.min(MAX_TRAINS,(query.maxChanges??5)+1),change=Math.max(1,query.minChange??5),A=query.arriveBy;
  const origin=new Set(query.from),target=new Set(query.to),allowed=query.tripAllowed||null,at=(k,s)=>k*N+s,departBy=query.departBy??INF;
  // late: the latest boarding at a station; lateWalk: the latest time to set off
  // walking from it to a boarding elsewhere (reviewed footpaths, never two in a row).
  const late=new Int32Array((K+1)*N).fill(-INF),parentConn=new Int32Array((K+1)*N).fill(NONE),parentExit=new Int32Array((K+1)*N).fill(NONE),parentLegs=new Uint8Array((K+1)*N);
  const foot=query.footpaths===false?null:week.footpaths||null,footIn=foot?footpathsInto(week):null;
  const lateWalk=foot?new Int32Array((K+1)*N).fill(-INF):null,walkTo=foot?new Int32Array((K+1)*N).fill(NONE):null,walkMinutes=foot?new Uint16Array((K+1)*N):null;
  // A station from which the destination is a walk away: [destination, minutes].
  const toTarget=new Map();if(foot)for(const t of target)for(const[x,w]of footIn.get(t)||[])if(!target.has(x)&&(!toTarget.has(x)||w<toTarget.get(x)[1]))toTarget.set(x,[t,w]);
  const ready=j=>foot?Math.max(late[j],lateWalk[j]):late[j];
  const legs=new Uint8Array(C.T).fill(255),exit=new Int32Array(C.T).fill(NONE),records=[];
  // On board trip t at its departure from a station that is a reviewed handoff: [trains, exit].
  const atHandoff=new Map(),order=arrivalOrder(C);
  for(const s of target)late[at(0,s)]=A;
  // The last train arrives from `arriveBy - window` to `arriveBy`. The window
  // bounds only that alighting: earlier hops of the same journey are followed
  // past it, until the origin bound below stops the scan.
  // departFrom (optional): no departure earlier than this is wanted, so hops
  // arriving before it belong to no answer and the scan stops there.
  const lastFloor=A-(query.window??1440);let floor=query.departFrom??-INF;
  const usable=checkedMask(C,query.usable);
  for(let i=0;i<C.count;i++){
    const c=order[i];if(C.arr[c]>A)continue;if(C.arr[c]<floor)break;
    const t=C.trip[c];if(allowed&&!allowed(t))continue;
    const a=C.to[c],s=C.from[c];
    // A masked hop (see earliest()): nobody rides it, so in this reverse scan
    // nobody is on board trip t before it, and no hand-off onto t's departure
    // from s exists. Before the hand-off and alighting blocks.
    if(usable&&!usable[c]){legs[t]=255;exit[t]=NONE;atHandoff.delete(t*65536+s);continue;}
    // Arriving at a handoff: stay on board onto the linked trip, no change.
    if(C.hasStay[t]){const next=C.stay.get(t*65536+a);if(next)for(const t2 of next){const v=atHandoff.get(t2*65536+a);
      if(v&&v[0]<legs[t]){records.push([c,t2,v[1]]);legs[t]=v[0];exit[t]=-(2+records.length-1);}}}
    if(C.flags[c]&2){let k=-1;
      if(C.arr[c]>=lastFloor&&target.has(a))k=0;else if(toTarget.has(a)&&C.arr[c]+toTarget.get(a)[1]<=A&&C.arr[c]+toTarget.get(a)[1]>=lastFloor)k=0;
      else for(let kk=1;kk<K;kk++){const v=ready(at(kk,a));if(v>-INF&&C.arr[c]+change<=v){k=kk;break;}}
      if(k>=0&&k+1<legs[t]){legs[t]=k+1;exit[t]=c;}}
    const L=legs[t];if(L===255)continue;
    // No boarding at the destination: leaving it to come back is never a journey.
    // departBy (optional) bounds the departure from the origin (the end of a day's window).
    if(C.flags[c]&1&&!target.has(s)&&!(origin.has(s)&&C.dep[c]>departBy)){const improved=C.dep[c]>late[at(L,s)];
      for(let kk=L;kk<=K;kk++){const j=at(kk,s);if(C.dep[c]>late[j]){late[j]=C.dep[c];parentConn[j]=c;parentExit[j]=exit[t];parentLegs[j]=L;}else break;}
      // Walking to this boarding from a station a footpath away (as a change of at least the minimum).
      if(improved&&foot)for(const[x,w]of footIn.get(s)||[]){const v=C.dep[c]-Math.max(w,change)+change;
        for(let kk=L;kk<=K;kk++){const j=at(kk,x);if(v>lateWalk[j]){lateWalk[j]=v;walkTo[j]=s;walkMinutes[j]=w;}else break;}}}
    if(C.hasStayBack[t]&&C.stayBack.has(t*65536+s)){const key=t*65536+s,v=atHandoff.get(key);if(!v||L<v[0])atHandoff.set(key,[L,exit[t]]);}
    // Fewer trains may leave earlier than the best: stop below the best one-train departure.
    if(origin.has(s)&&L===1)floor=Math.max(floor,late[at(1,s)]);
  }
  const state={parentConn,parentExit,parentLegs,records,at,late,lateWalk,walkTo,walkMinutes,change,target,toTarget};
  const results=[];let previous=-INF;
  for(let k=1;k<=K;k++){
    // From the origin: board there, or walk first (taking just the walk) to a boarding.
    let bestTime=-INF,start=null;
    for(const o of origin){const v=late[at(k,o)];if(v>bestTime){bestTime=v;start={station:o};}
      if(foot)for(const[b,w]of foot.get(o)||[]){const u=late[at(k,b)]-w;if(late[at(k,b)]>-INF&&u>bestTime&&u<=departBy){bestTime=u;start={station:b,walk:{from:o,to:b,minutes:w}}};}}
    if(bestTime>previous){results.push(forwardFrom(week,C,state,k,start));previous=bestTime;}}
  return results;
}

function footpathsInto(week){
  if(week.footpathsIn)return week.footpathsIn;
  const into=new Map();for(const[s,list]of week.footpaths||[])for(const[b,w]of list){if(!into.has(b))into.set(b,[]);into.get(b).push([s,w]);}
  return week.footpathsIn=into;
}

function forwardFrom(week,C,state,k,start){
  const{parentConn,parentExit,parentLegs,records,at,late,lateWalk,walkTo,walkMinutes,target,toTarget}=state,legs=[];let guard=0,s=start.station;
  if(start.walk)legs.push([{walk:true,...start.walk}]);
  while(k>0){
    if(++guard>64)throw new Error('route_finder_reconstruction_loop');
    let j=at(k,s);
    // After a ride: walk on if that is the later boarding (the walk is the change).
    if(legs.length&&!legs[legs.length-1][0].walk&&lateWalk&&lateWalk[j]>late[j]){legs.push([{walk:true,from:s,to:walkTo[j],minutes:walkMinutes[j]}]);s=walkTo[j];j=at(k,s);}
    let c=parentConn[j],e=parentExit[j];const L=parentLegs[j];
    if(c===NONE)throw new Error('route_finder_no_parent');
    const ride=[];let t=C.trip[c],stay=false;
    for(;;){
      if(e>=0){ride.push(segment(week,C,t,c,e,stay));break;}
      const[cs,t2,e2]=records[-e-2];ride.push(segment(week,C,t,c,cs,stay));c=firstCallAfter(C,t2,cs);t=t2;e=e2;stay=true;
    }
    legs.push(ride);s=ride[ride.length-1].to;k=L-1;
  }
  // The last ride may end a walk away from the destination.
  if(!target.has(s)&&toTarget.has(s)){const[b,w]=toTarget.get(s);legs.push([{walk:true,from:s,to:b,minutes:w}]);}
  return finish(legs);
}

// Arrive by `query.arriveBy`: the latest departures that still arrive in
// time. Without via stations this is the reverse scan; with them, the
// latest departure is found by halving the window over earliest() (the
// earliest arrival never decreases as the departure gets later).
export function arriveBy(week,C,query){
  if(!(query.via||[]).length)return latest(week,C,query);
  // The last train arrives within the window; the departure may be earlier
  // (a long journey), down to the first connection of the search.
  // (Whether a journey leaving at d or later arrives in the window is monotone in d.)
  const A=query.arriveBy,floor=A-(query.window??1440),arrives=d=>earliest(week,C,{...query,depart:d,horizon:A-d,slack:INF,arriveFrom:floor}).filter(j=>j.arr<=A);
  // A journey may set off walking to its first train (reviewed footpaths, at most 60 min).
  let walk=0;for(const list of(week.footpaths||new Map()).values())for(const[,w]of list)walk=Math.max(walk,w);
  let lo=Math.min(floor,C.count?C.dep[0]-walk:floor),hi=Math.min(A,query.departBy??A);
  if(!arrives(lo).length)return[];
  while(lo<hi){const mid=lo+hi+1>>1;if(arrives(mid).length)lo=mid;else hi=mid-1;}
  return arrives(lo);
}

// The same arrival with as late a departure as possible (least time
// travelling), with at most the result's number of trains.
// `latestDep` optionally bounds the departure (the end of a day's window).
export function tighten(week,C,query,result,latestDep=Infinity){
  const q={...query,maxChanges:result.trains-1,arriveBy:result.arr,window:result.arr-result.dep,departFrom:result.dep,...(latestDep<Infinity?{departBy:latestDep}:{})};
  const r=arriveBy(week,C,q).filter(j=>j.arr<=result.arr&&j.trains<=result.trains&&j.dep>=result.dep&&j.dep<=latestDep);
  if(!r.length)return result;
  const late=r.reduce((x,y)=>y.dep>x.dep||y.dep===x.dep&&y.trains<x.trains?y:x);
  // Shown with the earliest onward trains from that departure (the most time
  // for each change), which a forward scan from it reconstructs.
  const forward=earliest(week,C,{...query,via:query.via,depart:late.dep,maxChanges:result.trains-1,horizon:result.arr-late.dep+1,slack:INF})
    .filter(j=>j.arr<=result.arr&&j.dep===late.dep);
  return forward.length?forward[forward.length-1]:late;
}

// Every journey of a day (owner, 27 Nov: "show all routes for the selected
// day"): from `from`, the fastest journey whose first train leaves before
// `until`, tightened to its latest departure for that arrival; then again from
// one minute after that departure. For every minute t of the window, the
// earliest arrival of any journey leaving at t or later is the earliest
// arrival of a listed journey leaving at t or later. Returns {journeys, next}
// where next is where to continue (>= until when the window is done); `max`
// bounds the work of one call in half steps (a search, or the tightening of
// its answer), so a caller shows journeys as they come and a new search waits
// for one half step at most; `pending` carries a search answer not yet
// tightened from one call to the next (returned, and passed back unchanged).
export function daySweep(week,C,query,from,until,max=Infinity,pending=null){
  const journeys=[];let t=from,work=0;
  while(t<until&&work<max){
    if(!pending){
      const r=earliest(week,C,{...query,depart:t,horizon:until-1-t,slack:query.slack??360});work++;
      if(!r.length){t=until;break;}
      pending=r[r.length-1];if(work>=max)break;
    }
    const fastest=pending,tight=tighten(week,C,{...query,depart:fastest.dep},fastest,until-1);pending=null;work++;
    // A later departure inside the window with the same arrival replaces the earlier one.
    const last=journeys[journeys.length-1];
    if(last&&last.arr===tight.arr&&last.trains>=tight.trains)journeys.pop();
    journeys.push(tight);t=tight.dep+1;
  }
  return{journeys,next:t,pending};
}

// Fewest trains from `from` to every station over the week's timetable
// patterns, whatever the times and dates (owner, 27 Nov: when no route exists
// because data is missing, say why). Uint8Array by station: 0 at the origin,
// 255 where no chain of timed trains of the week leads. Pickup and drop-off
// codes and reviewed footpaths apply (a walk adds no train); stay-on-board
// links are not used, so a count may be one higher than the journey's.
// reverse: fewest trains from every station to `from` instead.
// allow(pattern) may leave patterns out (pass filters).
export function reach(week,from,{reverse=false,allow=null,maxTrains=MAX_TRAINS+4}={}){
  const{N,P,patternStart,patternStation,code}=week;
  if(!week.stationCalls){const count=new Uint32Array(N+1);for(let i=0;i<patternStation.length;i++)count[patternStation[i]+1]++;
    for(let i=0;i<N;i++)count[i+1]+=count[i];const list=new Uint32Array(patternStation.length),fill=count.slice(0,N);
    for(let i=0;i<patternStation.length;i++)list[fill[patternStation[i]]++]=i;
    const owner=new Uint32Array(patternStation.length);for(let p=0;p<P;p++)for(let i=patternStart[p];i<patternStart[p+1];i++)owner[i]=p;
    week.stationCalls={start:count,list,owner};}
  const{start,list,owner}=week.stationCalls,trains=new Uint8Array(N).fill(255);
  const pickup=i=>(code[i]&3)!==NO_PICKUP,dropOff=i=>(code[i]>>2&3)!==NO_DROPOFF;
  // Forward: the earliest call boarded in each pattern; reverse: the latest call left.
  const mark=new Int32Array(P).fill(reverse?-1:0x7fffffff);const stamp=new Int32Array(P);
  const walks=reverse?footpathsInto(week):week.footpaths||new Map();
  let frontier=[];const add=(s,r,into)=>{if(trains[s]>r){trains[s]=r;into.push(s);}};
  for(const s of from)add(s,0,frontier);
  for(const s of[...frontier])for(const[b]of walks.get(s)||[])add(b,0,frontier);
  for(let r=1;r<=maxTrains&&frontier.length;r++){
    const touched=[];
    for(const s of frontier)for(let j=start[s];j<start[s+1];j++){const i=list[j],p=owner[i];if(allow&&!allow(p))continue;
      if(reverse?dropOff(i)&&i>mark[p]:pickup(i)&&i<mark[p]){if(stamp[p]!==r){stamp[p]=r;touched.push(p);}mark[p]=i;}}
    const next=[];
    for(const p of touched){if(reverse){for(let i=mark[p]-1;i>=patternStart[p];i--)if(pickup(i))add(patternStation[i],r,next);}
      else for(let i=mark[p]+1;i<patternStart[p+1];i++)if(dropOff(i))add(patternStation[i],r,next);}
    for(const s of[...next])for(const[b]of walks.get(s)||[])add(b,r,next);
    frontier=next;
  }
  return trains;
}
