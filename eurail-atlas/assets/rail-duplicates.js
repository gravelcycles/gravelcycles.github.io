// National feeds overlap: the Geneva Léman Express is in the Swiss and the
// French feed. The published delivery counts every feed's copy and stays
// unchanged. This packet, shipped with the map and matched against exactly one
// delivery, lists the dated runs that are copies of a run in another feed and
// what each published count loses when they are counted once. Without a
// matching packet every count is the published one.
export const DUPLICATES_FORMAT='rail-atlas-duplicates-v1';
export function shippedDuplicatesURL(){const url=new URL('./rail-duplicates.json',import.meta.url);url.search=new URL(import.meta.url).search;return url.href;}

const SHA256=/^[0-9a-f]{64}$/;
const index=(value,limit)=>Number.isInteger(value)&&value>=0&&value<limit;
const flatReferences=(row,start,width,limits)=>Array.isArray(row)&&row.length>=start&&(row.length-start)%width===0&&row.slice(start).every((value,i)=>index(value,limits[i%width]));

export function validDuplicates(data){
  try{
    const dates=data?.binding?.dates,days=dates?.length;
    if(data?.schemaVersion!==1||data.format!==DUPLICATES_FORMAT||data.dataUnchanged!==true||!Array.isArray(dates)||days<1||days>31||typeof data.binding.releaseId!=='string'||!data.binding.releaseId||!SHA256.test(data.binding.manifestSha256||''))return false;
    const files=data.binding.files;
    if(!files||typeof files!=='object'||!Object.keys(files).length||Object.values(files).some(value=>!SHA256.test(value||'')))return false;
    const{sources,conditions,fields,geometryStatuses,values,profiles,edges,pairs,journeys,cityConnections}=data;
    if(![sources,fields,geometryStatuses].every(list=>Array.isArray(list)&&list.every(value=>typeof value==='string'))||!sources.length||!fields.includes('daily'))return false;
    if(!Array.isArray(conditions)||conditions.some(list=>!Array.isArray(list)||!list.length||list.some(value=>!index(value,sources.length))))return false;
    if(!Array.isArray(values)||values.some(row=>!Array.isArray(row)||row.length!==days||row.some(n=>!Number.isSafeInteger(n)||n<0)))return false;
    if(!Array.isArray(profiles)||profiles.some(row=>!flatReferences(row,0,2,[fields.length,values.length])||!row.length))return false;
    const limits=[conditions.length,profiles.length];
    if(!edges||typeof edges!=='object'||Object.values(edges).some(row=>!flatReferences(row,0,2,limits)||!row.length))return false;
    if(!Array.isArray(pairs)||pairs.some(row=>!Array.isArray(row)||!index(row[0],sources.length)||typeof row[1]!=='string'||!row[1]||!index(row[2],2)||!index(row[3],geometryStatuses.length)||!index(row[4],2)||!flatReferences(row,5,2,limits)||row.length<7))return false;
    const mask=1<<days;
    if(!journeys||typeof journeys!=='object'||Object.values(journeys).some(rows=>!Array.isArray(rows)||!rows.length||rows.some(row=>!Array.isArray(row)||row.length<4||row.length>6||!Number.isInteger(row[0])||row[0]<0||!index(row[1],conditions.length)||!index(row[2],mask)||!row[2]||!index(row[3],mask)||(row[3]&~row[2])!==0||row.slice(4).some(value=>typeof value!=='string'))))return false;
    // Runs that are copies between a kept run's calls only: run, condition, dates, pass dates, the stops that kept run calls at (0 = all), train label, run identity.
    if(data.partial!==undefined&&(!data.partial||typeof data.partial!=='object'||Array.isArray(data.partial)||Object.values(data.partial).some(rows=>!Array.isArray(rows)||!rows.length||rows.some(row=>!Array.isArray(row)||row.length<5||row.length>7||!Number.isInteger(row[0])||row[0]<0||!index(row[1],conditions.length)||!index(row[2],mask)||!row[2]||!index(row[3],mask)||(row[3]&~row[2])!==0||!(row[4]===0||Array.isArray(row[4])&&row[4].length>1&&row[4].every(n=>Number.isInteger(n)&&n>=0))||row.slice(5).some(value=>typeof value!=='string')))))return false;
    // Kept runs whose uncertain pass status is shown by another feed's included copy: run, condition, dates, the stops that copy covers (0 = all), run identity.
    if(data.uncertain!==undefined&&(!data.uncertain||typeof data.uncertain!=='object'||Array.isArray(data.uncertain)||Object.values(data.uncertain).some(rows=>!Array.isArray(rows)||!rows.length||rows.some(row=>!Array.isArray(row)||row.length<4||row.length>5||!Number.isInteger(row[0])||row[0]<0||!index(row[1],conditions.length)||!index(row[2],mask)||!row[2]||!(row[3]===0||Array.isArray(row[3])&&row[3].length&&row[3].every(n=>Number.isInteger(n)&&n>=0))||row.length===5&&typeof row[4]!=='string'))))return false;
    if(!cityConnections||typeof cityConnections!=='object'||Object.values(cityConnections).some(row=>!flatReferences(row,0,3,[conditions.length,values.length,values.length])||!row.length))return false;
    if(data.logical!==undefined&&(!Array.isArray(data.logical)||data.logical.some(row=>!Array.isArray(row)||row.length<4||typeof row[0]!=='string'||!row[0]||typeof row[1]!=='string'||!row[1]||!flatReferences(row,2,2,[conditions.length,mask]))))return false;
    if(!Array.isArray(data.sourcePairs)||data.sourcePairs.some(row=>!Array.isArray(row)||row.length!==3||typeof row[0]!=='string'||typeof row[1]!=='string'||!Number.isSafeInteger(row[2])))return false;
    return true;
  }catch{return false;}
}

// The packet names one release, its dates and the hashes of the delivery
// files its counts were derived from and are applied to. Every one of them is
// in the page's start-up manifest; any difference means another delivery.
export function duplicatesMatchDelivery(data,manifest){
  const binding=data?.binding;
  if(!binding||!manifest||binding.releaseId!==manifest.releaseId||JSON.stringify(binding.dates)!==JSON.stringify(manifest.dates))return false;
  for(const[key,sha256]of Object.entries(binding.files||{})){
    const logical=manifest.files?.[key];if(typeof logical!=='string')return false;
    if(manifest.assets?.[manifest.assetPaths?.[logical]||logical]?.sha256!==sha256)return false;
  }
  return true;
}

// Movement counts lose every copy. Pass counts lose a copy only where the kept
// run carries pass evidence at least as good (the packet's second date mask).
const MOVEMENT=new Set(['daily','boardableDaily','conditionalPickupDaily']);
const BOARDING_ALIAS={daily:'boardableDaily',eurailDaily:'eurailBoardableDaily',reviewedEurailDaily:'reviewedEurailBoardableDaily'};
const countVector=(value,days)=>Array.isArray(value)&&value.length===days&&value.every(n=>typeof n==='number');
const weeklyKey=key=>key==='daily'?'weekly':key.slice(0,-5)+'Weekly';
const total=values=>values.reduce((sum,n)=>sum+n,0);

export function createDuplicateIndex(data){
  if(!validDuplicates(data))throw new Error('Invalid duplicate-train packet');
  const days=data.binding.dates.length,{sources,conditions,fields,values,profiles}=data,rows=new Map(Object.entries(data.edges));
  for(const pair of data.pairs)rows.set('pair:'+JSON.stringify([sources[pair[0]],pair[1],pair[2]===1,data.geometryStatuses[pair[3]]]),pair.slice(5));
  const journeys=new Map(Object.entries(data.journeys)),partial=new Map(Object.entries(data.partial||{})),uncertain=new Map(Object.entries(data.uncertain||{})),cities=new Map(Object.entries(data.cityConnections)),logical=new Map();
  // A logical through service and its drawn connection share one list of copied dates.
  for(const row of data.logical||[]){logical.set(row[0],row.slice(2));logical.set(row[1],row.slice(2));}
  let active=conditions.map(()=>true),selection=null,selected=null,revision=1;
  const metricCache=new Map(),journeyCache=new WeakMap(),listCache=new WeakMap();
  const zeros=()=>Array(days).fill(0);

  // A copy is left out only while a feed that keeps the train is selected.
  function select(sourceIds){
    const next=conditions.map(list=>!sourceIds||list.some(i=>sourceIds.has(sources[i]))),key=next.map(Number).join('')+'|'+(sourceIds?[...sourceIds].sort().join(','):'*');
    if(key!==selection){selection=key;active=next;selected=sourceIds?new Set(sourceIds):null;revision++;metricCache.clear();}
    return revision;
  }
  function keepers(conditionIds){
    const names=new Set();
    for(const id of conditionIds)if(active[id])for(const i of conditions[id])if(!selected||selected.has(sources[i]))names.add(sources[i]);
    return[...names].sort();
  }

  // Published through-service counters of one connection or drawn pair.
  function metrics(id,base){
    const entries=rows.get(id);if(!entries||!base)return base;
    const cached=metricCache.get(id);if(cached&&cached.base===base)return cached.value;
    const changed=new Map();
    for(let i=0;i<entries.length;i+=2){
      if(!active[entries[i]])continue;const profile=profiles[entries[i+1]];
      for(let k=0;k<profile.length;k+=2){
        const field=fields[profile[k]],original=base[field];if(!countVector(original,days))continue;
        let next=changed.get(field);if(!next){next=original.slice();changed.set(field,next);}
        const minus=values[profile[k+1]];for(let day=0;day<days;day++)next[day]=Math.max(0,next[day]-minus[day]);
      }
    }
    let value=base;
    if(changed.size){
      value={...base};
      for(const[field,next]of changed){value[field]=next;const alias=BOARDING_ALIAS[field];if(alias&&base[alias]===base[field])value[alias]=next;}
    }
    metricCache.set(id,{base,value});return value;
  }
  // Feeds whose line now carries trains left out of this connection's count.
  // `shown` names the published counters the caller displays: a note belongs
  // only beside a number that is lower than the published one.
  function countedOn(id,shown=['daily']){
    const entries=rows.get(id);if(!entries)return[];
    const wanted=new Set(shown.map(field=>fields.indexOf(field))),conditionIds=[];
    for(let i=0;i<entries.length;i+=2){const profile=profiles[entries[i+1]];for(let k=0;k<profile.length;k+=2)if(wanted.has(profile[k])){conditionIds.push(entries[i]);break;}}
    return keepers(conditionIds);
  }

  // A logical through service joins the fragments one feed publishes. Where
  // another selected feed publishes that whole train as one run, the joined
  // service (journey or drawn connection) has no dates of its own left.
  function logicalRow(row){
    const entries=row&&typeof row.id==='string'&&!row._countedOnce?logical.get(row.id):null;if(!entries)return row;
    const cached=journeyCache.get(row);if(cached&&cached.revision===revision)return cached.value;
    let copied=0;const conditionIds=[];
    for(let i=0;i<entries.length;i+=2)if(active[entries[i]]){copied|=entries[i+1];conditionIds.push(entries[i]);}
    const clear=item=>{
      const result={...item};
      for(const[key,vector]of Object.entries(item)){
        if(key!=='daily'&&!key.endsWith('Daily')||!countVector(vector,days))continue;
        result[key]=vector.map((n,day)=>copied>>day&1?0:n);if(weeklyKey(key)in item)result[weeklyKey(key)]=total(result[key]);
      }
      return result;
    };
    let value=row;
    if(copied){
      value=clear(row);value._duplicateSources=keepers(conditionIds);value._countedOnce=true;
      for(const key of['_throughServices','_passPolicy'])if(row[key]&&typeof row[key]==='object')value[key]=clear(row[key]);
      for(const key of['publicTrains','sleepServices'])if(Array.isArray(row[key]))value[key]=row[key].map(clear);
    }
    journeyCache.set(row,{revision,value});return value;
  }
  function logicalEdges(list){
    if(!Array.isArray(list)||!logical.size)return list;
    const cached=listCache.get(list);if(cached&&cached.revision===revision&&cached.length===list.length)return cached.value;
    let changed=false;const mapped=list.map(row=>{const next=logicalRow(row);if(next!==row)changed=true;return next;}),value=changed?mapped:list;
    listCache.set(list,{revision,length:list.length,value});return value;
  }

  // One source pattern: fewer dated runs, and the runs to leave out of lists.
  function journey(row){
    if(row?.availabilityOnly===true)return logicalRow(row);
    // A row this index already reduced is never reduced again.
    const known=row&&typeof row.id==='string'&&!row._countedOnce,entries=known?journeys.get(row.id)||[]:[],parts=known?partial.get(row.id)||[]:[],shown=known?uncertain.get(row.id)||[]:[];
    if(!entries.length&&!parts.length&&!shown.length)return row;
    const cached=journeyCache.get(row);if(cached&&cached.revision===revision)return cached.value;
    const whole=entries.filter(([,condition])=>active[condition]).map(([run,condition,mask,passMask,label,runId])=>({run,condition,mask,passMask,label,runId}));
    let value=whole.length?leaveOut(row,whole,days,keepers(whole.map(entry=>entry.condition))):row;
    // A fuller run than the kept one (a whole train beside one feed's half)
    // is a copy only between the kept run's calls. Which of its trains are
    // left out depends on the stops asked about (duplicateScope); where the
    // kept run calls at every stop, they are left out everywhere.
    const between=parts.filter(([,condition])=>active[condition]).map(([run,condition,mask,passMask,covered,label,runId])=>({run,condition,mask,passMask,label,runId,covered:covered===0?null:new Set(covered)}));
    if(between.length){
      const everywhere=between.filter(entry=>!entry.covered);
      if(everywhere.length)value=leaveOut(value,everywhere,days,keepers(everywhere.map(entry=>entry.condition)));
      else if(value===row)value={...row,_countedOnce:true,_published:row};
      value._duplicatePartial={entries:between.filter(entry=>entry.covered),days,keepers:list=>keepers(list.map(entry=>entry.condition))};
    }
    // A kept run with uncertain pass status, where another selected feed's
    // included copy shows the same train: on the stops that copy covers, the
    // train is the included one and this run is not listed as uncertain.
    const elsewhere=shown.filter(([,condition])=>active[condition]).map(([run,,mask,covered,runId])=>({run,mask,covered:covered===0?null:new Set(covered),runId:runId||null}));
    if(elsewhere.length){
      if(value===row)value={...row,_countedOnce:true,_published:row};
      value._duplicateUncertain=elsewhere;
      Object.assign(value,uncertainLost(elsewhere.filter(entry=>!entry.covered),days));
    }
    journeyCache.set(row,{revision,value});return value;
  }
  function journeyList(list){
    if(!Array.isArray(list))return list;
    const cached=listCache.get(list);if(cached&&cached.revision===revision&&cached.length===list.length)return cached.value;
    let changed=false;const mapped=list.map(row=>{const next=journey(row);if(next!==row)changed=true;return next;}),value=changed?mapped:list;
    listCache.set(list,{revision,length:list.length,value});return value;
  }

  // A city-connection row of the Hubs view is the sum of its source patterns.
  function cityRow(row){
    const id=typeof row?.id==='string'&&row.id.startsWith('city-connection:')?row.id.slice(16):null,entries=id?cities.get(id):null;
    if(!entries||row._countedOnce||!countVector(row.daily,days))return row;
    const movement=zeros(),included=zeros(),conditionIds=[];
    for(let i=0;i<entries.length;i+=3){
      if(!active[entries[i]])continue;conditionIds.push(entries[i]);
      for(let day=0;day<days;day++){movement[day]+=values[entries[i+1]][day];included[day]+=values[entries[i+2]][day];}
    }
    if(!conditionIds.length)return row;
    const daily=row.daily.map((n,day)=>Math.max(0,n-movement[day])),eurailDaily=countVector(row.eurailDaily,days)?row.eurailDaily.map((n,day)=>Math.max(0,n-included[day])):row.eurailDaily,value={...row,daily,eurailDaily,_duplicateSources:keepers(conditionIds),_countedOnce:true};
    if('weekly'in row)value.weekly=total(daily);
    if('eurailWeekly'in row&&Array.isArray(eurailDaily))value.eurailWeekly=total(eurailDaily);
    // Example flags mark dates with a fast or overnight train; none is left
    // on a date whose trains are all counted on another feed's line.
    for(const prefix of['fast','overnight']){
      if(countVector(row[prefix+'ExampleDaily'],days))value[prefix+'ExampleDaily']=row[prefix+'ExampleDaily'].map((n,day)=>daily[day]>0?n:0);
      if(countVector(row[prefix+'IncludedExampleDaily'],days)&&Array.isArray(eurailDaily))value[prefix+'IncludedExampleDaily']=row[prefix+'IncludedExampleDaily'].map((n,day)=>eurailDaily[day]>0?n:0);
    }
    return value;
  }
  function cityRows(list){
    if(!Array.isArray(list))return list;
    const cached=listCache.get(list);if(cached&&cached.revision===revision&&cached.length===list.length)return cached.value;
    const value=list.map(cityRow);listCache.set(list,{revision,length:list.length,value});return value;
  }

  // Traffic sections keep every feed's count. Name the feeds among a section's
  // contributors that publish some of the same trains.
  function sharedTrains(sourceIds){
    const present=new Set(sourceIds),pairs=new Map();
    for(const[dropped,kept,count]of data.sourcePairs){
      if(!present.has(dropped)||!present.has(kept))continue;
      const feeds=[dropped,kept].sort(),key=feeds.join('|'),known=pairs.get(key);
      if(known)known.count+=count;else pairs.set(key,{feeds,count});
    }
    return[...pairs.values()].sort((a,b)=>b.count-a.count||a.feeds.join('|').localeCompare(b.feeds.join('|')));
  }
  return{get revision(){return revision;},dates:data.binding.dates,totals:data.totals||{},traffic:data.traffic||{corrected:false},
    select,metrics,countedOn,journey,journeyList,logicalEdges,cityRow,cityRows,sharedTrains};
}

// Leave dated runs out of one source pattern: fewer trains in every counter,
// fewer train numbers, and the runs to leave out of lists. `row` can be a
// pattern that was reduced before; a date already left out is not taken twice.
function leaveOut(row,list,days,sourceNames){
  const zeros=()=>Array(days).fill(0),movement=zeros(),pass=zeros(),labels=new Map(),passLabels=new Map();
  const runs=new Map(row._duplicateRuns||[]),runIds=new Map(row._duplicateRunIds||[]),added=new Map();
  for(const entry of list){const known=added.get(entry.run)||{mask:0,passMask:0,label:entry.label,runId:entry.runId};known.mask|=entry.mask;known.passMask|=entry.passMask;added.set(entry.run,known);}
  for(const[run,{mask,passMask,label,runId}]of added){
    const before=runs.get(run)||[0,0],fresh=mask&~before[0],freshPass=passMask&~before[1],now=[before[0]|mask,before[1]|passMask];
    runs.set(run,now);if(runId)runIds.set(runId,now);
    for(let day=0;day<days;day++){
      if(fresh>>day&1){movement[day]++;if(label){if(!labels.has(label))labels.set(label,zeros());labels.get(label)[day]++;}}
      if(freshPass>>day&1){pass[day]++;if(label){if(!passLabels.has(label))passLabels.set(label,zeros());passLabels.get(label)[day]++;}}
    }
  }
  // The published row stays at hand for readers that need to know how its runs were split (through-continuations.js).
  const value={...row,_countedOnce:true,_published:row._published||row};
  for(const[key,vector]of Object.entries(row)){
    if(key!=='daily'&&!key.endsWith('Daily')||key.endsWith('ExampleDaily')||!countVector(vector,days))continue;
    const minus=MOVEMENT.has(key)?movement:pass;value[key]=vector.map((n,day)=>Math.max(0,n-minus[day]));
    if(weeklyKey(key)in row)value[weeklyKey(key)]=total(value[key]);
  }
  const trains=(published,subtract)=>(published||[]).map(train=>{const minus=subtract.get(train.label);if(!minus||!countVector(train.daily,days))return train;const daily=train.daily.map((n,day)=>Math.max(0,n-minus[day]));return{...train,daily,...('weekly'in train?{weekly:total(daily)}:{})};});
  if(Array.isArray(row.publicTrains))value.publicTrains=trains(row.publicTrains,labels);
  value._duplicateRuns=runs;value._duplicateRunIds=runIds;value._duplicateSources=[...new Set([...(row._duplicateSources||[]),...sourceNames])].sort();
  // Runs whose pass status still counts, although another feed's line
  // carries the train: the pass view keeps them and their train numbers.
  if(!countVector(row._passDaily,days)&&countVector(row.daily,days)&&pass.some((n,day)=>n!==movement[day]))value._passDaily=row.daily.map((n,day)=>Math.max(0,n-pass[day]));
  if(countVector(value._passDaily,days))value._passJourney={...value,daily:value._passDaily,...(Array.isArray(row.publicTrains)?{publicTrains:trains(row._passJourney?.publicTrains||row.publicTrains,passLabels)}:{})};
  return value;
}
// Dated runs that are not shown as uncertain: per run a date mask, and a count per date.
function uncertainLost(entries,days){
  const runs=new Map(),runIds=new Map();
  for(const entry of entries){runs.set(entry.run,(runs.get(entry.run)||0)|entry.mask);if(entry.runId)runIds.set(entry.runId,(runIds.get(entry.runId)||0)|entry.mask);}
  const lost=Array(days).fill(0);for(const mask of runs.values())for(let day=0;day<days;day++)if(mask>>day&1)lost[day]++;
  return{_uncertainLost:lost,_uncertainLostRuns:runs,_uncertainLostRunIds:runIds};
}
const scoped=new WeakMap();
// The same journey as seen from some of its stops (a connection's two ends, a
// station): a kept run is not uncertain there if an included copy covers all
// of them. `positions` are indexes into the journey's stops.
export function uncertainScope(journey,positions){
  const entries=journey?._duplicateUncertain;
  if(!entries||!Array.isArray(positions)||!positions.length||entries.every(entry=>!entry.covered))return journey;
  const key=positions.join(','),known=scoped.get(journey)||new Map();if(known.has(key))return known.get(key);
  const days=journey._uncertainLost.length,value={...journey,...uncertainLost(entries.filter(entry=>!entry.covered||positions.every(position=>entry.covered.has(position))),days)};
  known.set(key,value);scoped.set(journey,known);return value;
}

const between=new WeakMap();
// A journey as seen from some of its stops. A run that is a copy between a
// kept run's calls only (a whole train beside one feed's half of it) is left
// out where the kept run calls at all of them, and stays elsewhere: on a
// connection only the whole train serves, it is the one publication.
export function duplicateScope(journey,positions){
  const holder=journey?._duplicatePartial;let value=journey;
  if(holder&&holder.entries.length&&Array.isArray(positions)&&positions.length){
    const key=positions.join(','),known=between.get(journey)||new Map();
    if(known.has(key))value=known.get(key);
    else{
      const covering=holder.entries.filter(entry=>positions.every(position=>entry.covered.has(position)));
      if(covering.length)value=leaveOut(journey,covering,holder.days,holder.keepers(covering));
      known.set(key,value);between.set(journey,known);
    }
  }
  return uncertainScope(value,positions);
}

const names=list=>list.length<3?list.join(' and '):list.slice(0,-1).join(', ')+' and '+list.at(-1);
// A long chain of feeds carrying one train is named by its first three.
const feeds=list=>list.length>4?names([...list.slice(0,3),`${list.length-3} other feeds`]):names(list);
// One plain sentence for a count that is lower than the published one.
export function duplicateNote(sourceNames){
  return sourceNames?.length?`Trains also published by ${feeds(sourceNames)} are counted once, on that feed’s line, and are left out of this count.`:'';
}
// Shown once the packet is in use: what "counted once" covers and what it cannot.
export const DUPLICATE_SCOPE='A train published by two feeds is counted once where both timetables agree on every stop to the minute. Other copies can still appear twice, and feeds without published times cannot be compared.';
// About: what is counted once, and plainly what is not.
export function duplicateMethodText(totals={},fmt=String){
  const number=key=>fmt(Number(totals[key])||0),left=[];
  if(totals.logicalThroughServiceDatesKeptForPassStatus)left.push(`${number('logicalThroughServiceDatesKeptForPassStatus')} dated through services joined from one feed’s parts stay beside another feed’s whole train, because only the joined service carries pass evidence`);
  if(totals.logicalThroughFragmentCopiesBesideTheirJoinedService)left.push(`${number('logicalThroughFragmentCopiesBesideTheirJoinedService')} dated trains stay beside a joined through service they are a part of`);
  return`National feeds overlap at borders and in shared networks. ${number('duplicateDatedTrains')} dated trains of this week are recognised as the same train in two feeds. ${DUPLICATE_SCOPE} In the Frequency, Eurail, Hubs and Countries views a recognised train is counted, drawn and listed once, on the line of the feed with the fuller timetable or, between equal timetables, of the country where the train starts; hide that feed under Timetable sources and the other copy returns. Where only the left-out copy is marked pass-included, the pass view keeps it and lists the other feed’s train as included rather than uncertain. Not corrected: ${left.length?left.join('; ')+'; ':''}trains whose two timetables differ by more than a minute at any stop, or that one feed publishes without times, still appear twice; and Rail traffic adds up totals per feed without the trains behind them, so a train in two feeds counts twice there. The published data files are unchanged.`;
}
// Traffic sections store totals per feed, not trains: whether a shared train
// runs on this section is not known, so this is a caution, not a correction.
export function trafficDuplicateNote(shared,sourceName){
  if(!shared?.length)return'';
  const pairs=shared.slice(0,3).map(row=>row.feeds.map(sourceName).join(' and '));
  return`This section adds up each feed’s own total. Elsewhere this week ${pairs.join('; ')} publish some of the same trains. The section does not record which trains it counts, so if such a train runs here it may be counted once per feed, and this total is not corrected.`;
}
