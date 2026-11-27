// Route finder service: loads the delivery's route-finder timetable on demand
// and answers the panel's questions. Runs in route-finder-worker.js; Node
// tests drive it directly with a file reader. Every answer says what was not
// searched (held week, sources without times, replacement buses without
// times) so the panel never presents a partial answer as complete.
import{decodeWeek,decodeDay,buildConnections,earliest,arriveBy,tighten,daySweep,reach,MAX_TRAINS}from'./route-finder-engine.js?v=a8efea473ec2c6f7';
import{latinSpellings}from'./transliterate.js?v=a8efea473ec2c6f7';
import{fixedWindow,hopMask}from'./route-finder-window.js?v=a8efea473ec2c6f7';
import{daylightWindow}from'./route-finder-sun.js?v=a8efea473ec2c6f7';
import{splitDays}from'./trip-days.js?v=a8efea473ec2c6f7';

export const KIND='route_finder_timetable';
// Extra searches one query may add for travel hours and a daily limit (AR3 I7).
export const SEARCH_BUDGET={searches:8,ms:8000};
// The country of a source id's two-letter prefix (source ids start with the
// country code, as in config/rail-sources), in the names stations.json uses;
// only to say which sources without times touch a gap.
const SOURCE_COUNTRY={al:'Albania',at:'Austria',ba:'Bosnia-Herzegovina',be:'Belgium',bg:'Bulgaria',by:'Belarus',ch:'Switzerland',cz:'Czechia',de:'Germany',dk:'Denmark',
  ee:'Estonia',es:'Spain',fi:'Finland',fr:'France',gb:'Great Britain',uk:'Great Britain',gr:'Greece',hr:'Croatia',hu:'Hungary',ie:'Ireland',it:'Italy',li:'Liechtenstein',
  lt:'Lithuania',lu:'Luxembourg',lv:'Latvia',mc:'Monaco',md:'Moldova',me:'Montenegro',mk:'North Macedonia',nl:'Netherlands',no:'Norway',pl:'Poland',pt:'Portugal',
  ro:'Romania',rs:'Serbia',se:'Sweden',si:'Slovenia',sk:'Slovakia',tr:'Türkiye',ua:'Ukraine',xk:'Kosovo'};
// The week files every search reads, in the order open() decodes them.
const SEARCH=['stations.json.gz','journeys.json.gz','patterns.bin.gz','profiles.bin.gz','links.bin.gz','footpaths.json.gz'];
// Letters of every script are kept: Bulgarian, Serbian and Greek stations are
// often published only in Cyrillic or Greek (27 Nov: 1,168 of them could not be
// found when only a-z was kept).
const fold=text=>String(text||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
// How well a folded station name matches a folded query, best first, or -1:
// the whole name, its start, a word start, anywhere, and last each word typed
// starting a word of the name ("paris est" finds "paris gare de l est").
export function stationScore(name,q){
  if(name===q)return 0;if(name.startsWith(q))return 1;if(name.includes(' '+q))return 2;if(name.includes(q))return 3;
  const words=q.split(' ').filter(Boolean);if(words.length<2)return -1;
  const parts=name.split(' ');
  return words.every(w=>parts.some(p=>p.startsWith(w)))?4:-1;
}
export const foldStationName=text=>fold(text);

// fetchBytes(name, tag) -> Promise<Uint8Array> of the published file (gzip
// as published); `tag` is absent for index.json (always revalidated) and the
// delivery's manifest hash prefix for every other file.
// gunzip(bytes) -> Promise<ArrayBuffer>.
// sha256(bytes) -> Promise<hex>, optional: each file is then checked against index.json by hash too.
export function createService({fetchBytes,gunzip,onTotal,sha256}){
  let index=null,week=null,stations=null,folded=null,calls=null,days=[],connections=new Map(),lazy=new Map();
  const file=async name=>{const entry=index.files[name];if(!entry)throw new Error('route_finder_file_not_listed:'+name);
    // Tagged with the delivery's manifest hash: the file names repeat every week.
    const bytes=await fetchBytes(name,index.binding.manifestSha256.slice(0,16));if(bytes.byteLength!==entry.bytes)throw new Error('route_finder_file_size_differs:'+name);
    if(sha256&&await sha256(bytes)!==entry.sha256)throw new Error('route_finder_file_hash_differs:'+name);return gunzip(bytes);};
  const json=async name=>JSON.parse(new TextDecoder().decode(await file(name)));
  const once=(name,load)=>{if(!lazy.has(name))lazy.set(name,load().catch(error=>{lazy.delete(name);throw error;}));return lazy.get(name);};

  async function open(){
    if(index)return summary();
    const raw=await fetchBytes('index.json');
    const parsed=JSON.parse(new TextDecoder().decode(raw));
    if(parsed.kind!==KIND||parsed.schemaVersion!==1)throw new Error('route_finder_index_not_recognised');
    index=parsed;
    if(index.state!=='built')return summary();
    onTotal?.(raw.byteLength+SEARCH.reduce((n,name)=>n+(index.files[name]?.bytes||0),0));
    // footpaths.json is absent from a packet built before reviewed footpaths existed.
    const[st,jo,pa,pr,li,fo]=await Promise.all(SEARCH.map((n,i)=>i===5?(index.files[n]?json(n):Promise.resolve({pairs:[]})):i<2?json(n):file(n)));
    stations=st;week=decodeWeek({stations:st,journeys:jo,patterns:pa,profiles:pr,links:li,footpaths:fo.pairs});
    // Each name with its Latin spellings (transliterate.js: letters, never place
    // names), so "Sofia" finds София and "Београд" finds Beograd. Search only.
    folded=st.names.map(name=>{const f=fold(name),latin=latinSpellings(f);return latin.length?[f,...latin]:f;});
    // How many timetable patterns call at each station: ranks bigger stations first in the search.
    calls=new Uint32Array(st.names.length);for(let i=0;i<week.patternStation.length;i++)calls[week.patternStation[i]]++;
    return summary();
  }
  function summary(){
    const n=index.notices||{};
    return{state:index.state,reason:index.reason||null,releaseId:index.binding.releaseId,dates:index.binding.dates,
      clock:index.clock?{label:index.clock.label,offsetMinutes:index.clock.offsetMinutes,countryOffsets:index.clock.countryOffsets||{}}:null,
      stations:stations?stations.names.length:0,sourcesWithoutTimes:n.sourcesWithoutTimes||[],
      replacementBuses:(n.replacementBuses||[]).length,replacementBusesWithTimes:(n.replacementBusesWithTimes||[]).length,
      stayOnBoard:index.stayOnBoard||null};
  }
  function requireBuilt(){if(!index)throw new Error('route_finder_not_open');if(index.state!=='built')throw new Error('route_finder_held:'+(index.reason||''));}

  // Station names by folded prefix (then word prefix, then substring).
  function searchStations(query,limit=8){
    requireBuilt();const q=fold(query);if(!q)return[];const qs=[q,...latinSpellings(q)];
    const scored=[];
    for(let i=0;i<folded.length;i++){
      // No country: no known local clock, so no boarding there (rail_data/route_finder.py).
      if(!stations.countries[stations.country[i]])continue;
      const names=folded[i];let score=-1;
      for(const name of typeof names==='string'?[names]:names)for(const v of qs){const x=stationScore(name,v);if(x>=0&&(score<0||x<score))score=x;}
      if(score>=0)scored.push([score,calls[i],i]);}
    scored.sort((a,b)=>a[0]-b[0]||b[1]-a[1]||a[2]-b[2]);
    return scored.slice(0,limit).map(([,,i])=>station(i));
  }
  const station=i=>({index:i,name:stations.names[i],country:stations.countries[stations.country[i]]||''});

  // Cities of the delivery's Hubs projection (cities.json, on demand): a city is
  // the set of its stations, searched together; nothing is merged, and each
  // journey names its actual station. Absent from packets built before 27 Nov.
  const cityList=()=>once('cities',()=>index.files['cities.json.gz']?json('cities.json.gz').then(d=>(d.cities||[]).map(c=>{
    const names=[c.name,...(c.aliases||[]),...(c.localNames||[])].map(fold).filter(Boolean);
    return{...c,keys:[...new Set([...names,...names.flatMap(latinSpellings)])]};})):Promise.resolve([]));
  const cityPlace=c=>({city:true,id:c.id,name:c.name,localName:(c.localNames||[])[0]||'',country:c.country,stations:c.stations.slice(),count:c.stations.length});
  // Places for a typed name: up to two cities whose name or alias is, or starts
  // with, what was typed (the bigger first), then the stations.
  async function searchPlaces(query,limit=8){
    requireBuilt();const q=fold(query);if(!q)return[];const qs=[q,...latinSpellings(q)];
    const cities=(await cityList()).map(c=>{let best=-1;for(const k of c.keys)for(const v of qs){const x=k===v?0:k.startsWith(v)?1:-1;if(x>=0&&(best<0||x<best))best=x;}return[best,c];})
      .filter(([x])=>x>=0).sort((a,b)=>a[0]-b[0]||b[1].population-a[1].population||a[1].id.localeCompare(b[1].id)).slice(0,2).map(([,c])=>cityPlace(c));
    return[...cities,...searchStations(query,limit-cities.length)];
  }
  async function stationIds(){return once('station-ids',()=>json('station-ids.json.gz').then(d=>d.ids));}
  // Canonical station ids, or city ids of cities.json (share links).
  async function resolveIds(ids){requireBuilt();const all=await stationIds(),where=new Map(all.map((id,i)=>[id,i]));
    const cities=ids.some(id=>String(id).startsWith('city:'))?new Map((await cityList()).map(c=>[c.id,c])):new Map();
    return ids.map(id=>where.has(id)?station(where.get(id)):cities.has(id)?cityPlace(cities.get(id)):null);}

  async function day(d){
    if(d<0||d>=index.binding.dates.length)return null;
    if(!days[d])days[d]=once('day-'+d,()=>file('day-'+d+'.bin.gz').then(decodeDay));
    return days[d];
  }
  // The connections of a search on date d (dates d and d + 1, about 80 MB on a
  // full week): the two used last are kept, so a multi-day search (d and d + 2)
  // or going back and forth between two dates does not rebuild them.
  async function connectionsFor(d){
    if(!connections.has(d))connections.set(d,(async()=>{const list=[];list[d]=await day(d);const next=await day(d+1);if(next)list[d+1]=next;return buildConnections(week,list,d);})());
    const C=connections.get(d);connections.delete(d);connections.set(d,C);
    while(connections.size>2)connections.delete(connections.keys().next().value);
    return C;
  }

  // Everything a search on date d reads, loaded ahead while the visitor fills
  // in the form: the two dates' trips, their connections and the run labels.
  async function prepare(d){
    requireBuilt();
    await Promise.all([connectionsFor(d),dayLabels(d),dayLabels(d+1),once('labels',()=>json('labels.json.gz').then(x=>x.labels))]);
    return true;
  }
  function dayLabels(d){
    if(d<0||d>=index.binding.dates.length)return Promise.resolve(null);
    return once('day-labels-'+d,()=>file('day-'+d+'-labels.bin.gz').then(buf=>{const v=new DataView(buf),n=v.getUint32(4,true),out=new Uint32Array(n);for(let i=0;i<n;i++)out[i]=v.getUint32(8+4*i,true);return out;}));
  }

  // Pass filters: unknown is not included. Returns the predicate on patterns
  // and its description.
  function patternFilter(filters={}){
    const J=week.journeys,inc=J.inclusion,res=J.reservation,sup=J.supplement;
    const tests=[];
    if(filters.eurailOnly)tests.push(row=>inc[row[4]]==='included');
    if(filters.noReservation)tests.push(row=>['none','optional','recommended'].includes(res[row[5]]));
    if(filters.noSupplement)tests.push(row=>sup[row[6]]==='no_listed_additional_train_supplement');
    if(!tests.length)return null;
    const allowed=new Uint8Array(J.rows.length);J.rows.forEach((row,p)=>{allowed[p]=tests.every(test=>test(row))?1:0;});
    return allowed;
  }

  // q: {date (index), from:[station], to:[station], via:[{stations,stopover}],
  //     depart | arriveBy (minutes after 00:00 of the date on the shared clock),
  //     maxChanges, minChange, direct, filters, tighten}
  //     maxChanges (null or absent: 5, raised for a long journey that needs more), minChange, direct, filters, tighten,
  //     travelWindow: {start, end} local minutes, a daily travel window (docs/RAIL_ROUTE_FINDER_DAY_TRIPS.md):
  //       only hops departing and arriving inside it on each station's local clock are ridden}
  // A forward search that finds nothing on dates d and d + 1 looks further
  // (owner, 27 Nov: "pick a start point, say Brasov, and we'll figure out how
  // to get you there to Palermo, even if it takes like 50 hours"): with more
  // trains when the week's timetable needs them, then on through dates d + 2
  // and d + 3 (overnight waits of up to about 72 h). If there is still nothing,
  // `noJourney` says why. Only the week's dated trains are used.
  async function route(q){
    requireBuilt();
    const d=q.date,C=await connectionsFor(d),forward=q.arriveBy===undefined||q.arriveBy===null;
    const allowedPatterns=patternFilter(q.filters),win=await travelWindow(q),queryFor=(C,maxChanges,w=win)=>({from:q.from,to:q.to,via:(q.via||[]).filter(v=>v.stations&&v.stations.length),maxChanges,minChange:q.minChange??5,
      ...(allowedPatterns?{tripAllowed:t=>allowedPatterns[week.profilePattern[C.tripProfile[t]]]===1}:{}),
      // Each connection set gets the mask on its own date base (a carried set too).
      // With a window, fewer-change journeys are kept up to a window's length after
      // the fastest (AR3 M3): the fastest arrives inside a window, so the rest of
      // that day's window is covered.
      ...(w?{usable:hopMask(C,w,offsetOf),slack:w.slack}:{})});
    const auto=!q.direct&&(q.maxChanges===undefined||q.maxChanges===null);
    const query=queryFor(C,q.direct?0:(q.maxChanges??5));
    let journeys,longer=null,noJourney=null,state=null,dailyLimit=null;
    // A per-query budget for the extra searches a window or a daily limit adds
    // (AR3 I7): when it is spent they stop and the answer says so.
    const budget={searches:0,max:SEARCH_BUDGET.searches,until:Date.now()+SEARCH_BUDGET.ms,stopped:false};
    const spend=()=>{if(budget.searches>=budget.max||Date.now()>budget.until){budget.stopped=true;return false;}budget.searches++;return true;};
    const last=Math.min(d+3,index.binding.dates.length-1),vias=query.via;
    // No travel hours at all at the origin, the destination or a via on every
    // searched date (polar night under Daylight, AR3 I5): say so before searching.
    if(win){for(const[side,stations]of[['from',q.from],['to',q.to],...vias.map((v,n)=>['via'+n,v.stations])])
      if(emptyEverywhere(win,stations,d,last))return{date:d,dateIso:index.binding.dates[d],journeys:[],leftOut:null,notices:await notices([],q),lastDate:d===index.binding.dates.length-1,longer:null,
        noJourney:{reason:'no_travel_hours',side,station:station(stations[0]),daylight:!!q.travelWindow.daylight,lastSearchedDate:index.binding.dates[last]}};}
    if(!forward)journeys=arriveBy(week,C,{...query,arriveBy:q.arriveBy});
    // The search state is kept so a long search can carry on from it without scanning date d again.
    else{({journeys,state}=earliest(week,C,{...query,depart:q.depart,keepState:true}));if(q.tighten===true)journeys=journeys.map(j=>tighten(week,C,{...query,depart:j.dep},j));}
    // Dates d and d + 1, then on through d + 2 and d + 3 (carried state), with up to maxChanges + 1 trains.
    // `always` carries on even when dates d and d + 1 found journeys: a claimed
    // minimum must cover all four dates (a later train may need fewer changes).
    const longSearch=async(maxChanges,slack,always=false,w=win)=>{
      const first=maxChanges===query.maxChanges&&slack===undefined&&w===win?{journeys,state}:earliest(week,C,{...queryFor(C,maxChanges,w),depart:q.depart,keepState:true,...(slack!==undefined?{slack}:{})});
      if(first.journeys.length&&!always||d+2>=index.binding.dates.length)return first.journeys;
      const C2=await connectionsFor(d+2);
      const later=earliest(week,C2,{...queryFor(C2,maxChanges,w),depart:q.depart-2880,carry:{state:first.state,C,shift:2880},...(slack!==undefined?{slack}:{})});
      // A walk into the destination found on dates d and d + 1 is not part of the
      // carried state, so with `always` both searches' journeys are returned.
      return always?[...first.journeys,...later]:later;
    };
    if(!journeys.length){
      const why=await explain(q,query.via,allowedPatterns);
      if(why.reason!=='connected')noJourney=why;
      else if(forward){
        // More trains only when the visitor set no limit. reach()'s count is
        // only a guide here (a train through a via counts twice, stay-on-board
        // links are not followed), so it never stops a search and is never shown.
        const maxChanges=auto?Math.max(query.maxChanges,Math.min(MAX_TRAINS-1,why.fewestTrains+1)):query.maxChanges;
        journeys=await longSearch(maxChanges);
        if(journeys.length)longer={maxChanges,days:journeys.some(j=>j.arr>=2880||j.legs.some(l=>l.day>d+1))?'multi':'two'};
        else{
          const lastSearchedDate=index.binding.dates[Math.min(d+3,index.binding.dates.length-1)];
          // A limit set too low: the same search with the most trains, every
          // trade-off kept (no slack), gives the real fewest trains of a journey
          // leaving from this time on these dates.
          const open=maxChanges<MAX_TRAINS-1?await longSearch(MAX_TRAINS-1,Infinity,true):[];
          noJourney=open.length?{reason:'more_changes',fewestTrains:Math.min(...open.map(j=>j.trains)),lastSearchedDate}:{reason:'not_in_dates',lastSearchedDate};
        }
      }
    }
    // Nothing within the travel hours: the same search without them (its
    // connection sets are cached) says whether hours are the reason (AR3 I5).
    if(win&&!journeys.length&&noJourney?.reason!=='no_travel_hours'&&spend()){
      const open=await route({...q,travelWindow:null,maxDay:null});
      noJourney=open.journeys.length?{reason:'outside_travel_hours',withoutHours:open.journeys.length,firstWithoutHours:{depLocal:open.journeys[0].depLocal,arrLocal:open.journeys[0].arrLocal,trains:open.journeys[0].trains},
        arriveBy:!forward,lastSearchedDate:index.binding.dates[forward?last:Math.min(d+1,index.binding.dates.length-1)]}:(open.noJourney||noJourney);}
    // The daily limit (AR3 I3): every journey shown has no day longer than it.
    // Journeys over it are hidden; forward searches also try sub-windows of the
    // limit's length inside the travel hours (early, middle, late), each an exact
    // search whose journeys mostly meet the limit by construction, then checked.
    if(q.maxDay&&journeys.length){
      const viaStops=viaStays(q),longest=j=>Math.max(...rawDays(j,d,win,viaStops).map(x=>x.minutes));
      const fits=j=>longest(j)<=q.maxDay,hidden=journeys.filter(j=>!fits(j));
      let kept=journeys.filter(fits);
      if(hidden.length&&forward){const seen=new Set(kept.map(rawKey));
        for(const w of subWindows(win,q.maxDay)){if(!spend())break;
          const found=await longSearch(query.maxChanges,undefined,false,w);
          for(const j of found)if(fits(j)&&!seen.has(rawKey(j))){seen.add(rawKey(j));kept.push(j);}}
        kept.sort((a,b)=>a.arr-b.arr||a.trains-b.trains);}
      dailyLimit={limit:q.maxDay,hidden:hidden.length,shortestHiddenLongestDay:hidden.length?Math.min(...hidden.map(longest)):null};
      journeys=kept;}
    // With a pass filter, say whether trains the filter leaves out (unknown or
    // excluded) would give an earlier or simpler journey.
    let leftOut=null;
    if(allowedPatterns){const open=q.arriveBy!=null?arriveBy(week,C,{...query,tripAllowed:undefined,arriveBy:q.arriveBy}):earliest(week,C,{...query,tripAllowed:undefined,depart:q.depart});
      const better=open.filter(o=>!journeys.some(j=>j.trains<=o.trains&&(q.arriveBy!=null?j.dep>=o.dep:j.arr<=o.arr)));
      leftOut={betterJourneysWithoutFilter:better.length,patternsLeftOut:allowedPatterns.length-allowedPatterns.reduce((a,b)=>a+b,0)};}
    // Each journey's travel days and nights (docs/RAIL_ROUTE_FINDER_DAY_TRIPS.md, section 3).
    const described=await Promise.all(journeys.map(j=>describe(j,d)));
    await attachDays(described,d,win,viaStays(q));
    return{date:d,dateIso:index.binding.dates[d],journeys:described,leftOut,notices:await notices(journeys,q),lastDate:d===index.binding.dates.length-1,longer,noJourney,
      travelHours:win?{daylight:!!q.travelWindow.daylight,nightTrainsExcluded:true}:null,dailyLimit,stoppedEarly:budget.stopped};
  }

  // The missing stretch (owner, 27 Nov: "if a route is missing tell which chunk
  // of track is missing"): of the stations reachable from one side (`out`) and
  // those from which the other side is reachable (`back`), the closest pair by
  // distance. It is a gap in this week's timetable, never a service or a
  // confirmed railway: nothing is inferred about the track. With what is known
  // about it: replacement buses without times at either end on the date (or the
  // next), timetable sources without times in either end's country, and when
  // the two are a few hundred metres apart, that they are listed as separate
  // stations with no reviewed walk or shared record between them.
  async function gapBetween(out,back,date){
    const geo=await once('geo',()=>json('station-geo.json.gz'));
    const side=trains=>{const list=[];for(let s=0;s<trains.length;s++)if(trains[s]!==255&&stations.countries[stations.country[s]])list.push(s);return list;};
    let a=side(out),b=side(back);const swap=a.length>b.length;if(swap)[a,b]=[b,a];
    if(!a.length||!b.length)return null;
    // Equirectangular distance in km (good to a fraction of a percent at these ranges).
    const lat=i=>geo.lat[i]/1e5,lon=i=>geo.lon[i]/1e5,km=(i,j)=>{const x=(lon(j)-lon(i))*Math.cos((lat(i)+lat(j))*Math.PI/360),y=lat(j)-lat(i);return 111.195*Math.hypot(x,y);};
    // The larger side in one-degree cells, searched in rings around each station of the smaller side.
    const cell=(la,lo)=>Math.floor(la)*1000+Math.floor(lo),grid=new Map();for(const j of b){const k=cell(lat(j),lon(j));if(!grid.has(k))grid.set(k,[]);grid.get(k).push(j);}
    let best=Infinity,pair=null;
    for(const i of a){const la=Math.floor(lat(i)),lo=Math.floor(lon(i));
      for(let r=0;r<=40;r++){
        // A ring r cells out is at least (r - 1) cells away: (r - 1) * 111 km north
        // or south, and east or west at least that times the cosine of the
        // highest latitude the ring reaches (no cap, so it stays a lower bound
        // in the far north: Narvik, Abisko, Kiruna).
        if((r-1)*111.195*Math.cos(Math.min(89.9,Math.abs(lat(i))+r)*Math.PI/180)>best)break;
        for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
          for(const j of grid.get((la+dy)*1000+lo+dx)||[]){const d=km(i,j);if(d<best){best=d;pair=[i,j];}}}
      }}
    if(!pair)return null;
    const[from,to]=swap?[pair[1],pair[0]]:pair,countries=new Set([from,to].map(s=>stations.countries[stations.country[s]]));
    const buses=(index.notices?.replacementBuses||[]).length?await busesAt([from,to],date,true):[];
    return{from:station(from),to:station(to),km:Math.round(best*10)/10,points:[[lat(from),lon(from)],[lat(to),lon(to)]],
      separateStations:best<1,replacementBuses:buses.map(b=>b.line||b.operator).filter(Boolean),
      sourcesWithoutTimes:(index.notices?.sourcesWithoutTimes||[]).filter(id=>countries.has(SOURCE_COUNTRY[String(id).slice(0,2)]))};
  }

  // Why no journey was found, from the week's timetable whatever the times
  // (engine reach()): {reason, fewestTrains, ...}. reason: 'not_connected'
  // (no chain of timed trains links them: the countries each side reaches, so
  // the panel can name the gap), 'via_not_connected' (a via breaks the chain),
  // 'filter' (only without the pass filters), or 'connected'.
  async function explain(q,via,allowedPatterns){
    const allow=allowedPatterns?p=>allowedPatterns[p]===1:null,legs=[q.from,...via.map(v=>v.stations),q.to];
    const countriesOf=trains=>{const seen=new Map();for(let s=0;s<trains.length;s++)if(trains[s]!==255){const c=stations.countries[stations.country[s]];if(c)seen.set(c,(seen.get(c)||0)+1);}
      return[...seen].sort((a,b)=>b[1]-a[1]).map(([c])=>c);};
    let fewest=0;
    for(let i=0;i+1<legs.length;i++){
      const out=reach(week,legs[i],{allow}),n=Math.min(...legs[i+1].map(s=>out[s]));
      if(n===255){
        if(allow&&Math.min(...legs[i+1].map(s=>reach(week,legs[i])[s]))!==255)return{reason:'filter',fewestTrains:null};
        const back=reach(week,legs[i+1],{allow,reverse:true});
        return{reason:i===0&&i+2===legs.length?'not_connected':'via_not_connected',fewestTrains:null,part:i,
          fromCountries:countriesOf(out),toCountries:countriesOf(back),fromStations:out.reduce((a,v)=>a+(v!==255),0),toStations:back.reduce((a,v)=>a+(v!==255),0),
          gap:await gapBetween(out,back,q.date)};
      }
      fewest+=n;
    }
    return{reason:'connected',fewestTrains:fewest};
  }

  // The same arrival with the latest departure, for each journey of a
  // forward search, asked for after its first answer is shown.
  async function tightenAll(q,journeys){
    requireBuilt();const C=await connectionsFor(q.date),allowedPatterns=patternFilter(q.filters),tripPattern=t=>week.profilePattern[C.tripProfile[t]];
    const win=await travelWindow(q),query={from:q.from,to:q.to,via:(q.via||[]).filter(v=>v.stations&&v.stations.length),maxChanges:q.direct?0:(q.maxChanges??5),minChange:q.minChange??5,
      ...(allowedPatterns?{tripAllowed:t=>allowedPatterns[tripPattern(t)]===1}:{}),...(win?{usable:hopMask(C,win,offsetOf)}:{})};
    const out=[];
    // With a daily limit, a refined journey must keep it: refining rebuilds the
    // onward trains as the earliest ones, which can move a day's start earlier
    // and lengthen that day. Otherwise the journey stays as it was.
    const viaStops=viaStays(q),fits=t=>!q.maxDay||Math.max(...rawDays(t,q.date,win,viaStops).map(x=>x.minutes))<=q.maxDay;
    for(const j of journeys){const raw={dep:j.dep,arr:j.arr,trains:j.trains};const t=tighten(week,C,{...query,depart:j.dep},{...raw,legs:[]});
      out.push(t.legs&&t.legs.length&&fits(t)?await describe(t,q.date):j);}
    await attachDays(out,q.date,win,viaStays(q));
    return out;
  }
  // The journeys of a day's window (daySweep), a few per call so the panel can
  // show them as they come: {journeys, next, done}.
  let sweepPending=null;
  async function sweep(q,from,until,max=1){
    requireBuilt();const C=await connectionsFor(q.date),allowedPatterns=patternFilter(q.filters),tripPattern=t=>week.profilePattern[C.tripProfile[t]];
    const win=await travelWindow(q),query={from:q.from,to:q.to,via:(q.via||[]).filter(v=>v.stations&&v.stations.length),maxChanges:q.direct?0:(q.maxChanges??5),minChange:q.minChange??5,
      ...(allowedPatterns?{tripAllowed:t=>allowedPatterns[tripPattern(t)]===1}:{}),...(win?{usable:hopMask(C,win,offsetOf)}:{})};
    // A search answer not yet tightened waits here for the next call of the same window.
    const at=JSON.stringify([q.date,q.from,q.to,q.via||[],q.direct,q.maxChanges,q.minChange,q.filters||{},q.travelWindow||null,q.maxDay||null,from,until]);
    const part=daySweep(week,C,query,from,until,max,sweepPending&&sweepPending.at===at?sweepPending.pending:null);
    sweepPending=part.pending?{at:JSON.stringify([q.date,q.from,q.to,q.via||[],q.direct,q.maxChanges,q.minChange,q.filters||{},q.travelWindow||null,q.maxDay||null,part.next,until]),pending:part.pending}:null;
    // The daily limit applies to swept journeys too (hidden, and counted).
    const viaStops=viaStays(q),fit=q.maxDay?part.journeys.filter(j=>Math.max(...rawDays(j,q.date,win,viaStops).map(x=>x.minutes))<=q.maxDay):part.journeys;
    const described=await Promise.all(fit.map(j=>describe(j,q.date)));await attachDays(described,q.date,win,viaStops);
    return{journeys:described,hiddenByDailyLimit:part.journeys.length-fit.length,next:part.next,done:part.next>=until&&!part.pending};
  }
  // Every call of a described leg, boarding to alighting (owner, 27 Nov:
  // "intermediate stops for each leg"): station, local arrival and departure,
  // and whether passengers may board or alight there. Times come from the
  // trip's own profile, on the same clock as the leg.
  async function legStops(leg){
    requireBuilt();const D=await day(leg.day);if(!D)throw new Error('route_finder_leg_date_not_found');
    const f=D.profile[leg.trip],p=week.profilePattern[f];
    if(p!==leg.pattern)throw new Error('route_finder_leg_does_not_match_its_trip');
    const k0=week.profileCall[f],ps=week.patternStart[p];
    // The leg's departure fixes the trip's start on the leg's clock (its date may be the next one).
    const start=leg.dep-week.departure[k0+leg.board];
    // The leg's clock is that of its search date (describe() sets it).
    if(!Number.isInteger(leg.base))throw new Error('route_finder_leg_without_search_date');
    // The leg's own stations and arrival must come out of its trip (cheap; a mismatch is refused).
    if(week.patternStation[ps+leg.board]!==leg.from.index||week.patternStation[ps+leg.alight]!==leg.to.index||start+week.arrival[k0+leg.alight]!==leg.arr)
      throw new Error('route_finder_leg_does_not_match_its_trip');
    const out=[];
    for(let x=leg.board;x<=leg.alight;x++){const s=week.patternStation[ps+x],c=week.code[ps+x];
      out.push({station:station(s),arrLocal:x>leg.board?local(s,start+week.arrival[k0+x],leg.base):null,depLocal:x<leg.alight?local(s,start+week.departure[k0+x],leg.base):null,
        pickup:(c&3)!==1,dropOff:(c>>2&3)!==1,request:(c&3)>=2||(c>>2&3)>=2});}
    return out;
  }
  // d: the search date index, whose 00:00 starts the journey's clock.
  async function describe(j,d){
    if(!Number.isInteger(d))throw new Error('route_finder_describe_without_search_date');
    const labels=await once('labels',()=>json('labels.json.gz').then(x=>x.labels));
    const J=week.journeys,legs=[];
    for(const seg of j.legs){
      if(seg.walk){legs.push({walk:true,from:station(seg.from),to:station(seg.to),minutes:seg.minutes,dep:seg.dep,arr:seg.arr,base:d,depLocal:local(seg.from,seg.dep,d),arrLocal:local(seg.to,seg.arr,d),stops:[seg.from,seg.to]});continue;}
      const labelsOfDay=await dayLabels(seg.day);
      const row=J.rows[seg.pattern],label=labelsOfDay[seg.index],ps=week.patternStart[seg.pattern];
      const codeAt=i=>week.code[ps+i];
      legs.push({from:station(seg.from),to:station(seg.to),dep:seg.dep,arr:seg.arr,stayOnBoard:seg.stayOnBoard,base:d,
        depLocal:local(seg.from,seg.dep,d),arrLocal:local(seg.to,seg.arr,d),
        line:row[0],operator:J.operators[row[1]]||'',source:J.sources[row[2]]||'',category:J.categories[row[3]]||'',
        inclusion:J.inclusion[row[4]],reservation:J.reservation[row[5]],supplement:J.supplement[row[6]],
        label:label===0xFFFFFFFF?'':labels[label]||'',pattern:seg.pattern,day:seg.day,trip:seg.index,board:seg.board,alight:seg.alight,
        stops:Array.from({length:seg.alight-seg.board+1},(_,k)=>week.patternStation[ps+seg.board+k]),
        boardingNote:(codeAt(seg.board)&3)===2||(codeAt(seg.board)&3)===3?'request':'',alightingNote:(codeAt(seg.alight)>>2&3)===2||(codeAt(seg.alight)>>2&3)===3?'request':''});
    }
    return{dep:j.dep,arr:j.arr,trains:j.trains,changes:j.changes,minutes:j.arr-j.dep,depLocal:local(j.from,j.dep,d),arrLocal:local(j.to,j.arr,d),legs};
  }
  // The minutes to add to the shared clock for station s's local clock on
  // delivery date `date` (countryOffsets is indexed by delivery date).
  function offsetOf(s,date){
    const country=stations.countries[stations.country[s]],offsets=(index.clock.countryOffsets||{})[country];
    return offsets?offsets[Math.max(0,Math.min(offsets.length-1,date))]:0;
  }
  // A search's daily travel window, or null (refused when malformed):
  // {start, end} local minutes, or {daylight: true, margin} (sunrise - margin
  // to sunset + margin at each station on each date; route-finder-sun.js).
  // `slack` (AR3 M3): fewer-change journeys are kept up to this long after the
  // fastest, which arrives inside a window, so that day's window is covered.
  async function travelWindow(q){
    const w=q.travelWindow;if(!w)return null;
    if(w.daylight){const margin=w.margin??0;if(![-60,-30,0,30,60].includes(margin))throw new Error('route_finder_bad_travel_window');return daylight(margin);}
    const f=fixedWindow(w.start,w.end);return{...f,slack:w.end-w.start};
  }
  // Daylight windows, per station and delivery date, computed when first asked
  // for. A station on a date where the sun does not rise has an empty window
  // (no travel there that day): never a made-up fallback.
  const daylight=margin=>once('daylight:'+margin,async()=>{
    const geo=await once('geo',()=>json('station-geo.json.gz'));
    const D=index.binding.dates.length+2,N=week.N,lo=new Int16Array(N*D).fill(-32768),hi=new Int16Array(N*D);
    // ISO date of delivery date index `date` (one past the week is the next calendar day).
    const isoOf=date=>{const t=new Date(index.binding.dates[0]+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+date);return t.toISOString().slice(0,10);};
    const at=(s,date)=>{const x=Math.max(-1,Math.min(D-2,date)),k=s*D+x+1;
      if(lo[k]===-32768){const lat=geo.lat[s]/1e5,lon=geo.lon[s]/1e5;
        const w=Number.isFinite(lat)&&Number.isFinite(lon)?daylightWindow(isoOf(x),lat,lon,(index.clock.offsetMinutes||0)+offsetOf(s,x),margin):{start:1,end:0};
        lo[k]=w.start;hi[k]=w.end;}
      return k;};
    return{id:'daylight:'+margin,start:(s,date)=>lo[at(s,date)],end:(s,date)=>hi[at(s,date)],slack:1440};
  });
  // Is the window empty at all of `stations` on every date from d to last?
  const emptyEverywhere=(win,stations,d,last)=>stations.every(s=>{for(let x=d;x<=last;x++)if(win.start(s,x)<=win.end(s,x))return false;return true;});
  // Day split on an engine journey (raw station indices), for the daily limit.
  function rawDays(j,d,win,viaStops){
    const legs=j.legs.flat().map(seg=>({from:{index:seg.from},to:{index:seg.to},dep:seg.dep,arr:seg.arr,stayOnBoard:!!seg.stayOnBoard,depLocal:local(seg.from,seg.dep,d),arrLocal:local(seg.to,seg.arr,d)}));
    return splitDays({legs},{windowEnd:win?(s,k)=>win.end(s,d+k):null,viaStops});
  }
  const rawKey=j=>j.dep+'|'+j.arr+'|'+j.legs.flat().map(l=>l.walk?'w':l.day+':'+l.index).join(',');
  // Stays at the visitor's vias (station -> minutes), left out of daily travel time.
  const viaStays=q=>{const m=new Map();for(const v of q.via||[])if(v.stopover>0)for(const s of v.stations||[])m.set(s,Math.max(m.get(s)||0,v.stopover));return m;};
  // Sub-windows of length H inside a window (or, with no window, inside
  // 05:00-23:00, for candidates only): early, middle and late. Each has the
  // base window's id plus its own, so its masks are cached apart.
  function subWindows(win,H){
    const base=win||{id:'day',start:()=>300,end:()=>1380},out=[];
    for(const kind of['early','middle','late']){
      const lo=(s,x)=>{const a=base.start(s,x),b=base.end(s,x);if(a>b)return a;return kind==='early'?a:kind==='late'?Math.max(a,b-H):Math.max(a,Math.round((a+b-H)/2));};
      out.push({id:base.id+':'+kind+':'+H,start:lo,end:(s,x)=>{const a=base.start(s,x),b=base.end(s,x);return a>b?b:Math.min(b,lo(s,x)+H);},slack:base.slack??H});}
    return out;
  }
  // Travel days on described journeys: the legs of each day (first and last
  // index), its travel time, and the night after it: the station where the
  // overnight wait is, named by its Hubs city when it belongs to one (never a
  // hotel or an inferred place).
  async function attachDays(journeys,d,win,viaStops){
    let cityOf=null;
    for(const j of journeys){
      const days=splitDays(j,{windowEnd:win?(s,k)=>win.end(s,d+k):null,viaStops});
      if(days.length>1&&!cityOf)cityOf=await stationCities();
      j.days=days.map(x=>({first:j.legs.indexOf(x.legs[0]),last:j.legs.indexOf(x.legs[x.legs.length-1]),dayOffset:x.dayOffset,minutes:x.minutes,depLocal:x.depLocal,arrLocal:x.arrLocal,overnightLegs:x.overnightLegs,
        night:x.night?{station:x.night.station,city:cityOf?.get(x.night.station.index)||null,arrLocal:x.night.arrLocal,depLocal:x.night.depLocal,minutes:x.night.minutes}:null}));
    }
  }
  // Station -> its Hubs city name (the most populous city whose catchment holds it).
  const stationCities=()=>once('stationCities',async()=>{const m=new Map(),pop=new Map();
    for(const c of await cityList())for(const s of c.stations)if(!m.has(s)||c.population>pop.get(s)){m.set(s,c.name);pop.set(s,c.population);}
    return m;});
  // Minutes on the station's local clock, and the day offset from the search
  // date d (minutes are on d's clock). The offset is that of the delivery date
  // d + day, not of the day relative to the search (AR3 I2).
  function local(s,minutes,d){
    const value=minutes+offsetOf(s,d+Math.floor(minutes/1440));
    return{minutes:value,dayOffset:Math.floor(value/1440),clock:String(Math.floor((value%1440+1440)%1440/60)).padStart(2,'0')+':'+String((value%60+60)%60).padStart(2,'0')};
  }
  // Replacement buses without times that touch the journey's stations, the
  // origin or the destination on the search date (or the next one), and the
  // published sources the search could not use.
  async function notices(journeys,q){
    const n=index.notices||{},touched=[...new Set([...q.from,...q.to,...journeys.flatMap(j=>j.legs.flatMap(l=>[l.from,l.to]))])];
    const buses=(n.replacementBuses||[]).length?await busesAt(touched,q.date,true):[];
    return{replacementBuses:buses,sourcesWithoutTimes:n.sourcesWithoutTimes||[],stayOnBoardUnresolved:(index.stayOnBoard||{}).unresolved||{}};
  }
  // The replacement buses of the date that call at any of these stations (canonical ids, loaded on demand).
  // `nextDate` also counts buses of the following date (overnight journeys).
  async function busesAt(stationIndices,date,nextDate=false){
    requireBuilt();const ids=await stationIds(),wanted=new Set(stationIndices.map(i=>ids[i])),mask=nextDate?3:1;
    return(index.notices.replacementBuses||[]).filter(b=>(b.dateMask>>date&mask)&&b.stations.some(s=>wanted.has(s)))
      .map(b=>({id:b.id,line:b.line,operator:b.operator,source:b.source,stations:b.stations.map(s=>ids.indexOf(s)).filter(i=>i>=0)}));
  }
  async function geometry(stationIndices){requireBuilt();const geo=await once('geo',()=>json('station-geo.json.gz'));return stationIndices.map(i=>[geo.lat[i]/1e5,geo.lon[i]/1e5]);}
  // What the map needs to draw described legs on the atlas's own geometry:
  // the source journey and the canonical stations of each leg (loaded on demand).
  // Coordinates of each leg's stops, for the instant preview (station-geo only).
  async function legPoints(legs){requireBuilt();const geo=await once('geo',()=>json('station-geo.json.gz'));return legs.map(l=>(l.walk?[l.from.index,l.to.index]:l.stops).map(i=>[geo.lat[i]/1e5,geo.lon[i]/1e5]));}
  // Loaded once results are shown, so choosing one draws at once.
  async function warmDrawing(){requireBuilt();await Promise.all([once('geo',()=>json('station-geo.json.gz')),once('journey-ids',()=>json('journey-ids.json.gz'))]);return true;}
  // (Station-panel lookup stop and stop coordinates; no station index needed.)
  async function legIdentities(legs){
    requireBuilt();const[journeys,geo]=await Promise.all([once('journey-ids',()=>json('journey-ids.json.gz')),once('geo',()=>json('station-geo.json.gz'))]);
    const point=i=>[geo.lat[i]/1e5,geo.lon[i]/1e5];
    return legs.map(l=>l.walk?{walk:true,minutes:l.minutes,points:[point(l.from.index),point(l.to.index)]}:
      {source:l.source,journeyId:journeys.ids[l.pattern],lookupStop:journeys.lookupStops[l.pattern],board:l.board,alight:l.alight,points:l.stops.map(point)});
  }
  async function stationIdsOf(indices){requireBuilt();const ids=await stationIds();return indices.map(i=>ids[i]);}
  async function journeyIds(patterns){requireBuilt();const ids=(await once('journey-ids',()=>json('journey-ids.json.gz'))).ids;return patterns.map(p=>ids[p]);}

  return{open,prepare,searchStations,searchPlaces,resolveIds,route,sweep,legStops,tightenAll,busesAt,geometry,journeyIds,legIdentities,legPoints,warmDrawing,stationIdsOf,station:i=>{requireBuilt();return station(i);}};
}

