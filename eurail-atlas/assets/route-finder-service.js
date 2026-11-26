// Route finder service: loads the delivery's route-finder timetable on demand
// and answers the panel's questions. Runs in route-finder-worker.js; Node
// tests drive it directly with a file reader. Every answer says what was not
// searched (held week, sources without times, replacement buses without
// times) so the panel never presents a partial answer as complete.
import{decodeWeek,decodeDay,buildConnections,earliest,arriveBy,tighten}from'./route-finder-engine.js?v=59f1bc0be76aaba9';

export const KIND='route_finder_timetable';
// The week files every search reads, in the order open() decodes them.
const SEARCH=['stations.json.gz','journeys.json.gz','patterns.bin.gz','profiles.bin.gz','links.bin.gz','footpaths.json.gz'];
const fold=text=>String(text||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
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
    folded=st.names.map(fold);
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
    requireBuilt();const q=fold(query);if(!q)return[];
    const scored=[];
    for(let i=0;i<folded.length;i++){
      // No country: no known local clock, so no boarding there (rail_data/route_finder.py).
      if(!stations.countries[stations.country[i]])continue;
      const score=stationScore(folded[i],q);
      if(score>=0)scored.push([score,calls[i],i]);}
    scored.sort((a,b)=>a[0]-b[0]||b[1]-a[1]||a[2]-b[2]);
    return scored.slice(0,limit).map(([,,i])=>station(i));
  }
  const station=i=>({index:i,name:stations.names[i],country:stations.countries[stations.country[i]]||''});
  async function stationIds(){return once('station-ids',()=>json('station-ids.json.gz').then(d=>d.ids));}
  async function resolveIds(ids){requireBuilt();const all=await stationIds(),where=new Map(all.map((id,i)=>[id,i]));return ids.map(id=>where.has(id)?station(where.get(id)):null);}

  async function day(d){
    if(d<0||d>=index.binding.dates.length)return null;
    if(!days[d])days[d]=once('day-'+d,()=>file('day-'+d+'.bin.gz').then(decodeDay));
    return days[d];
  }
  async function connectionsFor(d){
    if(!connections.has(d))connections.set(d,(async()=>{const list=[];list[d]=await day(d);const next=await day(d+1);if(next)list[d+1]=next;return buildConnections(week,list,d);})());
    return connections.get(d);
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
  async function route(q){
    requireBuilt();
    const d=q.date,C=await connectionsFor(d);
    const allowedPatterns=patternFilter(q.filters),tripPattern=t=>week.profilePattern[C.tripProfile[t]];
    const query={from:q.from,to:q.to,via:(q.via||[]).filter(v=>v.stations&&v.stations.length),maxChanges:q.direct?0:(q.maxChanges??5),minChange:q.minChange??5,
      ...(allowedPatterns?{tripAllowed:t=>allowedPatterns[tripPattern(t)]===1}:{})};
    let journeys;
    if(q.arriveBy!==undefined&&q.arriveBy!==null)journeys=arriveBy(week,C,{...query,arriveBy:q.arriveBy});
    else{journeys=earliest(week,C,{...query,depart:q.depart});if(q.tighten===true)journeys=journeys.map(j=>tighten(week,C,{...query,depart:j.dep},j));}
    // With a pass filter, say whether trains the filter leaves out (unknown or
    // excluded) would give an earlier or simpler journey.
    let leftOut=null;
    if(allowedPatterns){const open=q.arriveBy!=null?arriveBy(week,C,{...query,tripAllowed:undefined,arriveBy:q.arriveBy}):earliest(week,C,{...query,tripAllowed:undefined,depart:q.depart});
      const better=open.filter(o=>!journeys.some(j=>j.trains<=o.trains&&(q.arriveBy!=null?j.dep>=o.dep:j.arr<=o.arr)));
      leftOut={betterJourneysWithoutFilter:better.length,patternsLeftOut:allowedPatterns.length-allowedPatterns.reduce((a,b)=>a+b,0)};}
    return{date:d,dateIso:index.binding.dates[d],journeys:await Promise.all(journeys.map(describe)),leftOut,notices:await notices(journeys,q),lastDate:d===index.binding.dates.length-1};
  }

  // The same arrival with the latest departure, for each journey of a
  // forward search, asked for after its first answer is shown.
  async function tightenAll(q,journeys){
    requireBuilt();const C=await connectionsFor(q.date),allowedPatterns=patternFilter(q.filters),tripPattern=t=>week.profilePattern[C.tripProfile[t]];
    const query={from:q.from,to:q.to,via:(q.via||[]).filter(v=>v.stations&&v.stations.length),maxChanges:q.direct?0:(q.maxChanges??5),minChange:q.minChange??5,
      ...(allowedPatterns?{tripAllowed:t=>allowedPatterns[tripPattern(t)]===1}:{})};
    const out=[];
    for(const j of journeys){const raw={dep:j.dep,arr:j.arr,trains:j.trains};const t=tighten(week,C,{...query,depart:j.dep},{...raw,legs:[]});
      out.push(t.legs&&t.legs.length?await describe(t):j);}
    return out;
  }
  async function describe(j){
    const labels=await once('labels',()=>json('labels.json.gz').then(x=>x.labels));
    const J=week.journeys,legs=[];
    for(const seg of j.legs){
      if(seg.walk){legs.push({walk:true,from:station(seg.from),to:station(seg.to),minutes:seg.minutes,dep:seg.dep,arr:seg.arr,depLocal:local(seg.from,seg.dep),arrLocal:local(seg.to,seg.arr),stops:[seg.from,seg.to]});continue;}
      const labelsOfDay=await dayLabels(seg.day);
      const row=J.rows[seg.pattern],label=labelsOfDay[seg.index],ps=week.patternStart[seg.pattern];
      const codeAt=i=>week.code[ps+i];
      legs.push({from:station(seg.from),to:station(seg.to),dep:seg.dep,arr:seg.arr,stayOnBoard:seg.stayOnBoard,
        depLocal:local(seg.from,seg.dep),arrLocal:local(seg.to,seg.arr),
        line:row[0],operator:J.operators[row[1]]||'',source:J.sources[row[2]]||'',category:J.categories[row[3]]||'',
        inclusion:J.inclusion[row[4]],reservation:J.reservation[row[5]],supplement:J.supplement[row[6]],
        label:label===0xFFFFFFFF?'':labels[label]||'',pattern:seg.pattern,day:seg.day,trip:seg.index,board:seg.board,alight:seg.alight,
        stops:Array.from({length:seg.alight-seg.board+1},(_,k)=>week.patternStation[ps+seg.board+k]),
        boardingNote:(codeAt(seg.board)&3)===2||(codeAt(seg.board)&3)===3?'request':'',alightingNote:(codeAt(seg.alight)>>2&3)===2||(codeAt(seg.alight)>>2&3)===3?'request':''});
    }
    return{dep:j.dep,arr:j.arr,trains:j.trains,changes:j.changes,minutes:j.arr-j.dep,depLocal:local(j.from,j.dep),arrLocal:local(j.to,j.arr),legs};
  }
  // Minutes on the station's local clock, and the day offset from the search date.
  function local(s,minutes){
    const country=stations.countries[stations.country[s]],offsets=(index.clock.countryOffsets||{})[country];
    const dayIndex=Math.floor(minutes/1440),value=minutes+(offsets?offsets[Math.max(0,Math.min(offsets.length-1,dayIndex))]:0);
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

  return{open,prepare,searchStations,resolveIds,route,tightenAll,busesAt,geometry,journeyIds,legIdentities,legPoints,warmDrawing,stationIdsOf,station:i=>{requireBuilt();return station(i);}};
}

