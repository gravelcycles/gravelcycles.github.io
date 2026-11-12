import{effectivePass,selectedDays,journeyMatchesEdge,journeyThroughMatch,publicTrainLabels,normalizeCharge,serviceVisible,usesHubConnections}from'./atlas-core.js?v=8eeddc2d0b1f1115';
import{duplicateScope}from'./rail-duplicates.js?v=8eeddc2d0b1f1115';
import{mergeSleepServices}from'./sleep-service.js?v=8eeddc2d0b1f1115';
import{mapPairFocusId}from'./route-focus.js?v=8eeddc2d0b1f1115';
import{continuationFocusEdgeIds,deduplicateContinuationAvailability,continuationMetrics,scopeAvailabilityCounts}from'./through-continuations.js?v=8eeddc2d0b1f1115';
import{logicalCommonOdDeductions}from'./logical-common-od.js?v=8eeddc2d0b1f1115';
import{nativePublicTrainLabels,numberedRunViews}from'./native-public-numbers.js?v=8eeddc2d0b1f1115';

export const callId=call=>Array.isArray(call)?call[0]:call.id;
export function passengerCall(call){
  const pickup=Array.isArray(call)?call[1]:call?.pickup,dropoff=Array.isArray(call)?call[2]:call?.dropoff;
  return String(pickup??'0')!=='1'||String(dropoff??'0')!=='1';
}
export function sourceTrainLabelKey(value){const text=String(value||'').replace(/\s+/g,'').toUpperCase(),match=text.match(/^(?:RJX|RJ|RAILJET|EC|ECE|IC|ICE|EN|NJ)?(\d{1,6})$/);return match?match[1]:text;}
export const journeyIdentity=journey=>JSON.stringify([journey.source,journey.snapshot,journey.id,journey.agencyPrimary!==false]);
// A public number identifies a run, not a route. Preserve source, provider,
// direction, repeated calls and every intermediate station in route identity.
export const routeIdentity=journey=>JSON.stringify([journey.source,journey.snapshot,(journey.operator||'').trim()||['unknown-provider',journey.id],journey.agencyPrimary!==false,journey.serviceMode||'rail',(journey.stops||[]).map(callId)]);

// A marketed line (R7, S1, Z7) is separate from a public train number. Keep
// source wording without promoting it to route identity or another service.
export function sourceServiceDesignations(journeys){
  const text=value=>typeof value==='string'||typeof value==='number'?String(value).trim():'';
  const labels=new Set(journeys.flatMap(journey=>nativePublicTrainLabels(journey).map(row=>text(row.label))).filter(Boolean));
  return[...new Set(journeys.flatMap(journey=>[journey.line,journey.lineName]).map(text).filter(value=>value&&!labels.has(value)))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}

function chargeMatches(journey,charge,match='any'){
  let reservation=journey.reservation,supplement=journey.supplement;
  const rules=new Set(journey.reviewedRuleIds||[]),countries=new Set(journey.countries||[]);
  if(rules.has('eurostar-ns-known-core-corridors-2026-11'))reservation='required';
  if(rules.has('db-ice-international-2026-11')&&countries.has('France')){reservation='required';supplement='passholder_fare_required';}
  if(rules.has('oebb-railjet-non-italy-international-2026-11')&&countries.has('Hungary'))reservation='required';
  charge=normalizeCharge(charge);if(charge==='all')return true;if(charge==='none')return false;
  const noReservation=['none','optional','not_required'].includes(reservation),noSupplement=['none','not_required','no_listed_additional_train_supplement'].includes(supplement),requiredSupplement=['required','passholder_fare_required'].includes(supplement);
  const flags={reservation:reservation==='required',supplement:requiredSupplement,free:noReservation&&noSupplement,chargeUnknown:!noReservation&&reservation!=='required'||!noSupplement&&!requiredSupplement};
  return charge.split(',')[match==='all'?'every':'some'](kind=>flags[kind]);
}
export function journeyDaily(journey,state,dates){
  if(!serviceVisible(journey,state))return dates.map(()=>0);
  if(state.sources&&!state.sources.has(journey.source))return dates.map(()=>0);
  if(journey.agencyPrimary===false&&!state.alternatives&&!state.altSourceIds?.has(journey.source))return dates.map(()=>0);
  const pass=effectivePass(state),charge=state.mode==='eurail'?state.charge:'all',context=continuationMetrics(journey,state,dates);
  if(context){
    if(!pass)return context.daily;
    return dates.map((_,i)=>{const supported=state.mode==='eurail'&&state.included===false?0:context.eurailDaily[i]+context.reviewedEurailDaily[i];
      if(charge&&charge!=='all'){if(charge==='none'||!supported)return 0;const bits={reservation:1,supplement:2,free:4,chargeUnknown:8},wanted=charge.split(',').reduce((mask,key)=>mask|(bits[key]||0),0);return[1,2,3,4,8,9,10].reduce((sum,mask)=>sum+((state.chargeMatch==='all'?(mask&wanted)===wanted:!!(mask&wanted))?context['chargeMask'+mask+'Daily'][i]:0),0);}
      return supported+(state.review?context.uncertainDaily[i]:0);});
  }
  if(pass&&!chargeMatches(journey,charge,state.chargeMatch))return dates.map(()=>0);
  return dates.map((_,i)=>{
    if(!pass)return Number(journey.daily?.[i])||0;
    const supported=(Number(journey.eurailDaily?.[i])||0)+(Number(journey.reviewedEurailDaily?.[i])||0),included=state.mode==='eurail'&&state.included===false?0:supported;
    // A copy counted on another feed's line can still be the only one with this pass status.
    const uncertain=state.review&&(!charge||charge==='all')&&['unknown','conditional','conflicting_reference'].includes(journey.inclusion)?Math.max(0,(Number((journey._passDaily||journey.daily)?.[i])||0)-supported-(journey._uncertainLost?.[i]||0)):0;
    return included+uncertain;
  });
}
// Identifier and accommodation metadata must describe the same dated subset
// as the selected service. A number is presence evidence, never another train.
export function filteredServiceMetadata(journey,daily,pass=false){
  // In the pass view a copy keeps the train numbers whose pass status still counts.
  if(pass&&journey._passJourney)journey=journey._passJourney;
  const trim=row=>{
    const result={...row};
    for(const[key,value]of Object.entries(row))if((key==='daily'||key.endsWith('Daily'))&&Array.isArray(value)){
      result[key]=value.map((n,i)=>daily[i]>0?Math.min(Number(n)||0,daily[i]):0);
      const weekly=key==='daily'?'weekly':key.slice(0,-5)+'Weekly';
      if(weekly in row)result[weekly]=result[key].reduce((sum,n)=>sum+n,0);
    }
    if(Array.isArray(row.sleepServices))result.sleepServices=row.sleepServices.map(trim);
    return result;
  };
  return{publicTrains:nativePublicTrainLabels(journey).map(trim),sleepServices:(journey.sleepServices||[]).map(trim)};
}
export function policyJourneysForSelection(journeys,{trainLabel='',run=null,dates}={}){
  return(run?[run.journey]:journeys).flatMap(journey=>{
    const labels=trainLabel?nativePublicTrainLabels(journey).filter(row=>row.label===trainLabel):null;
    if(labels&&!labels.length)return[];
    return[{...journey,daily:(journey.daily||[]).map((n,i)=>
      (!run||run.dates.includes(dates[i]))&&(!labels||labels.some(row=>!Array.isArray(row.daily)||row.daily[i]>0))?n:0)}];
  });
}
export function selectCityJourneyContexts(journey,state,dates){
  if(!Array.isArray(journey.availabilityCallSpans)||!journey.availabilityCallSpans.length)return journey;
  const candidates=journey.availabilityCallSpans.map(span=>{const row={...journey,_contextSpan:span,_contextSpansByDate:undefined,_match:{from:span[0],to:span[1]}};return{span,visible:journeyDaily(row,state,dates),raw:continuationMetrics(row,state,dates)?.daily||row.daily};});
  const selected=dates.map((_,day)=>candidates.find(candidate=>candidate.visible[day]>0)?.span||candidates.find(candidate=>candidate.raw[day]>0)?.span||candidates[0].span);
  return{...journey,_contextSpan:selected[0],_contextSpansByDate:selected};
}
// A journey as a connection or a station sees it (rail-duplicates.js): where
// another feed's included copy covers the stops asked about, a kept run is
// not listed as uncertain, exactly as the connection's count leaves it out.
export function journeyForQuery(journey,{directions=[],stationIds=null}={}){
  if(!journey?._duplicateUncertain&&!journey?._duplicatePartial)return journey;
  const calls=journey.stops||[];let positions=null;
  if(stationIds){positions=calls.flatMap((call,index)=>stationIds.has(callId(call))?[index]:[]);}
  else for(const direction of directions){
    if(direction.throughConnection){const match=journeyThroughMatch(journey,direction);if(match){positions=[match.from,match.to];break;}}
    else{
      // A drawn connection between two successive calls (or two successive city hubs).
      const identity=i=>direction.isHub?journey.hubIds?.[i]:callId(calls[i]);let previous=-1;
      for(let i=0;i<calls.length&&!positions;i++){if(!identity(i))continue;if(previous>=0&&identity(previous)===direction.a&&identity(i)===direction.b)positions=[previous,i];previous=i;}
      if(positions)break;
    }
  }
  return duplicateScope(journey,positions);
}
// The feeds that carry trains left out of a station's list, for its "counted
// once" note: read from each pattern the current view shows, as that station
// sees it. A run that is a copy between a kept run's calls only names its
// keeper where the kept run calls, and a tier that is not shown names nobody.
export function stationDuplicateSources(journeys,stationIds,state){
  const names=new Set(),stations=stationIds instanceof Set?stationIds:new Set(stationIds||[]);
  for(const journey of journeys||[]){
    if(!journey||!serviceVisible(journey,state)||state.sources&&!state.sources.has(journey.source))continue;
    if(journey.agencyPrimary===false&&!state.alternatives&&!state.altSourceIds?.has(journey.source))continue;
    for(const name of journeyForQuery(journey,{stationIds:stations})._duplicateSources||[])names.add(name);
  }
  return[...names].sort();
}
// True when this dated run is already left out of the current view as a copy.
export function runLeftOut(journey,runId,day,state){
  const pass=effectivePass(state);
  return!!((journey?._duplicateRunIds?.get(runId)?.[pass?1:0]||0)>>day&1)||!!pass&&!!state.review&&!!((journey?._uncertainLostRunIds?.get(runId)||0)>>day&1);
}
export function groupSegmentRoutes(journeys,edge,state,dates){
  if(edge._cityConnection)journeys=(journeys||[]).flatMap(journey=>{
    const members=(edge._directionEdges||[edge]).filter(row=>row.availabilityJourneyId===journey.id&&row.source===journey.source&&row.snapshot===journey.snapshot);
    if(!members.length)return[journey];
    return members.map(member=>{
      const row={...journey,_availabilityCityDirection:[member.fromCity,member.toCity],_contextSpan:member._contextSpan,_contextSpansByDate:member._contextSpansByDate,availabilityCallSpans:member.availabilityCallSpans,_match:member._match};
      if(member._logicalAvailabilityDeduplicated||member._logicalAvailabilityAlternative||member._cityGeometryDates){
        for(const[key,value]of Object.entries(member))if(key==='daily'||key==='weekly'||key.endsWith('Daily')||key.endsWith('Weekly')||['publicTrains','sleepServices','_logicalAvailabilityDeduplicated'].includes(key))row[key]=value;
      }
      if(member._logicalAvailabilityAlternative){
        // The city row omits native continuation/clock/permission metadata.
        // Restore only its query counts onto the actual immutable full journey.
        const original=member._logicalAvailabilityAlternative.originalJourney,inspection={...journey,
          _availabilityCityDirection:row._availabilityCityDirection,_contextSpan:row._contextSpan,
          _contextSpansByDate:row._contextSpansByDate,availabilityCallSpans:row.availabilityCallSpans,_match:row._match};
        for(const[key,value]of Object.entries(original))if(key==='daily'||key==='weekly'||key.endsWith('Daily')||key.endsWith('Weekly'))inspection[key]=value;
        if(member._cityGeometryDates){const selected=new Set(member._cityGeometryDates);for(const[key,value]of Object.entries(inspection))if((key==='daily'||key.endsWith('Daily'))&&Array.isArray(value)){inspection[key]=value.map((n,i)=>selected.has(i)?n:0);const week=key==='daily'?'weekly':key.slice(0,-5)+'Weekly';if(week in inspection)inspection[week]=inspection[key].reduce((a,b)=>a+b,0);}}
        row._logicalAvailabilityAlternative={...member._logicalAvailabilityAlternative,originalJourney:inspection};
      }
      return row;
    });
  });
  const directions=(edge._directionEdges||[edge]).map(direction=>({...direction,...(usesHubConnections(state)&&!edge.availabilityOnly?{isHub:true}:{}),...(edge.throughConnection?{throughConnection:true}:{})})),days=selectedDays(state.day,dates),seen=new Set(),groups=new Map();
  const stationIds=edge._stationIds?new Set(edge._stationIds):null;
  // A city connection row counts its patterns between its own two stations (rail-duplicates.js does the same).
  const rowStations=edge._cityConnection?journey=>{const row=(edge._directionEdges||[edge]).find(row=>Array.isArray(row.journeyIds)&&row.journeyIds.includes(journey.id)&&row.source===journey.source&&Array.isArray(row.sourceStations));return row?new Set(row.sourceStations):stationIds;}:()=>stationIds;
  journeys=(journeys||[]).map(journey=>journeyForQuery(journey,{directions,stationIds:rowStations(journey)}));
  const matching=journeys.filter(journey=>stationIds?(journey.stops||[]).some(call=>stationIds.has(callId(call))):directions.some(direction=>journeyMatchesEdge(journey,direction)));
  const spanFor=(journey,day)=>{if(Number.isSafeInteger(day)&&journey._contextSpansByDate?.[day])return journey._contextSpansByDate[day];if(edge._cityConnection&&journey._availabilityCityDirection)return journey._contextSpan;if(edge._cityConnection){const spans=directions.filter(row=>row.availabilityJourneyId===journey.id&&row.source===journey.source&&row.snapshot===journey.snapshot&&Array.isArray(row._contextSpan)).map(row=>row._contextSpan),unique=[...new Map(spans.map(span=>[JSON.stringify(span),span])).values()];if(unique.length===1)return unique[0];}if(stationIds){const indexes=(journey.stops||[]).flatMap((call,index)=>stationIds.has(callId(call))?[index]:[]);return indexes.length===1?[indexes[0],indexes[0]]:null;}const calls=journey.stops||[];for(const edge of directions){const starts=calls.flatMap((call,index)=>callId(call)===edge.a?[index]:[]),ends=calls.flatMap((call,index)=>callId(call)===edge.b?[index]:[]);if(starts.length===1&&ends.length===1&&ends[0]>starts[0])return[starts[0],ends[0]];}return null;};
  const contextual=matching.map(journey=>journey.availabilityOnly?{...journey,_contextSpan:spanFor(journey)||undefined}:journey);
  const available=edge._cityConnection?contextual:deduplicateContinuationAvailability(contextual,{dates,selectedDayIndices:days,dailyFor:journey=>journeyDaily(journey,state,dates),spanFor,leftOut:(parent,runId,day)=>runLeftOut(parent,runId,day,state)});
  for(const journey of available){
    const identity=journeyIdentity(journey)+(edge._cityConnection?JSON.stringify(journey._availabilityCityDirection):'');if(seen.has(identity)||(stationIds?!(journey.stops||[]).some(call=>stationIds.has(callId(call))):!directions.some(direction=>journeyMatchesEdge(journey,direction))))continue;seen.add(identity);
    const daily=journeyDaily(journey,state,dates),count=days.reduce((sum,i)=>sum+daily[i],0),inspection=journey._logicalAvailabilityAlternative?.originalJourney||journey,routeDaily=journeyDaily(inspection,state,dates),routeCount=days.reduce((sum,i)=>sum+routeDaily[i],0);if(!count&&!routeCount)continue;
    const key=routeIdentity(journey);
    if(!groups.has(key))groups.set(key,{key,source:journey.source,operator:journey.operator||'Recorded operator',serviceMode:journey.serviceMode||'rail',availabilityOnly:journey.availabilityOnly===true,callValidationReview:journey.continuation?.callValidationReview,sourceStopNames:journey.sourceStopNames,stops:journey.stops,daily:dates.map(()=>0),count:0,routeCount:0,journeys:[],labels:[],sleepServices:[],edgeIds:new Set()});
    const group=groups.get(key);group.count+=count;group.routeCount+=routeCount;group.logicalOverlapAlternative||=!!journey._logicalAvailabilityAlternative;group.journeys.push(inspection);daily.forEach((n,i)=>group.daily[i]+=n);
    for(const id of continuationFocusEdgeIds(journey))group.edgeIds.add(id);
    const metadata=filteredServiceMetadata(inspection,routeDaily,effectivePass(state));
    group.labels.push(...publicTrainLabels(metadata.publicTrains,{day:state.day,dates,limit:Infinity}));
    group.sleepServices=mergeSleepServices(group.sleepServices,metadata.sleepServices);
  }
  return[...groups.values()].map(group=>{
    // Distinct branch routes retain their original availability, but duplicate
    // views of the same complete native route must not reappear in route cards
    // or clock lists merely because their logical wrapper IDs differ.
    const duplicates=logicalCommonOdDeductions(group.journeys,{dates,selectedDayIndices:days,
      dailyFor:row=>journeyDaily(row,state,dates),spanFor:row=>[0,row.stops.length-1]});
    if(duplicates.size){
      group.journeys=group.journeys.map((row,index)=>duplicates.has(index)?scopeAvailabilityCounts(row,duplicates.get(index).daily):row);
      group.routeCount=0;group.labels=[];group.sleepServices=[];
      for(const row of group.journeys){const daily=journeyDaily(row,state,dates),metadata=filteredServiceMetadata(row,daily,effectivePass(state));group.routeCount+=days.reduce((sum,i)=>sum+daily[i],0);group.labels.push(...publicTrainLabels(metadata.publicTrains,{day:state.day,dates,limit:Infinity}));group.sleepServices=mergeSleepServices(group.sleepServices,metadata.sleepServices);}
    }
    return{...group,lineDesignations:sourceServiceDesignations(group.journeys),labels:publicTrainLabels(group.labels,{day:state.day,dates,limit:Infinity}).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}))};
  }).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
}
export function groupStationRoutes(journeys,stationIds,state,dates){return groupSegmentRoutes(journeys,{_stationIds:[...stationIds],_directionEdges:[]},state,dates);}

// Callers pass the already filtered route groups. Derive markers from their
// ordered passenger calls, never from geometry vertices or infrastructure ends.
export function routeStationFocus(groups){
  const stations=new Set(),endpoints=new Set();
  for(const group of groups){
    const calls=(group.stops||[]).filter(passengerCall).map(callId).filter(Boolean);
    for(const id of calls)stations.add(id);
    if(calls.length){endpoints.add(calls[0]);endpoints.add(calls.at(-1));}
  }
  return{stations,endpoints};
}

export const runDisplayClockTimes=run=>Array.isArray(run?.localCallTimes)&&run.localCallTimes.length===run.callTimes?.length?run.localCallTimes:run?.callTimes||[];
export const runUsesStationTimezones=run=>Array.isArray(run?.callTimezones)&&new Set(run.callTimezones).size>1;

export function formatClock(seconds){
  if(!Number.isSafeInteger(seconds)||seconds<0)return'—';
  const days=Math.floor(seconds/86400),hour=Math.floor(seconds/3600)%24,minute=Math.floor(seconds/60)%60;
  return String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')+(days?' +'+days:'');
}
export function serviceDates(daily,state,dates){return selectedDays(state.day,dates).filter(i=>Number(daily?.[i])>0).map(i=>dates[i]);}

function routePairValues(group){
  const first=group.journeys[0],stops=group.stops.map(callId),values=[];
  for(let i=1;i<stops.length;i++)if(stops[i-1]!==stops[i]){
    const pair=[stops[i-1],stops[i]].sort();
    if(group.serviceMode==='temporary_replacement_bus'){
      // Compact rows omit directed edge IDs. Match each existing bus producer's
      // source/snapshot/mode identity so route and station focus survive that
      // projection; never fall back to an unscoped station pair or rail hash.
      values.push(['mode-map-pair',first.source,first.snapshot,group.serviceMode,...pair],
        ['temporary-replacement-map-pair',first.source,first.snapshot,...pair,group.serviceMode],
        ['replacement-backfill-map-pair',first.source,first.snapshot,...pair,group.serviceMode],
        ['context-replacement-map-pair',first.source,first.snapshot,group.serviceMode,...pair,first.agencyPrimary!==false]);
    }else values.push(['map-pair',first.source,...pair,first.agencyPrimary!==false]);
  }
  return values;
}
const pairHash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,18);
export async function routeMapPairs(group){return new Set(await Promise.all(routePairValues(group).map(value=>pairHash(JSON.stringify(value)))));}

export async function routeFocusIds(groups){
  const ids=new Set(groups.flatMap(group=>[...group.edgeIds])),pairs=new Map();
  // Many stopping patterns share the same legs at busy stations. Hash each
  // distinct identity once rather than once for every serving route.
  for(const group of groups)for(const value of routePairValues(group))pairs.set(JSON.stringify(value),group.source);
  await Promise.all([...pairs].map(async([value,source])=>ids.add(mapPairFocusId(source,await pairHash(value)))));
  return ids;
}

// Timetable pages refer to exact journey identities. A date belongs to the
// source service day, including 24:xx/25:xx calls; never modulo it for joins.
export function routeRuns(group,pages,state,dates){
  const result=[],seen=new Set();
  for(const journey of group.journeys){
    const daily=journeyDaily(journey,state,dates),entry=pages.get(journey.id);
    if(!entry||entry.source!==journey.source||entry.snapshot!==journey.snapshot)continue;
    // Dated runs another selected feed also publishes are listed there, not here.
    const copies=journey._duplicateRuns,copyField=effectivePass(state)?1:0,elsewhere=effectivePass(state)?journey._uncertainLostRuns:null;
    for(const[runIndex,run]of(entry.runs||[]).entries()){
      const consumed=journey._logicalAvailabilityDeduplicated?.runs?.find(row=>row.runId===run.id)?.daily,copied=copies?.get(runIndex)?.[copyField]||0;
      const active=serviceDates(run.daily,state,dates).filter(date=>daily[dates.indexOf(date)]>0&&!consumed?.[dates.indexOf(date)]&&!(copied>>dates.indexOf(date)&1)&&!((elsewhere?.get(runIndex)||0)>>dates.indexOf(date)&1));if(!active.length)continue;
      if(!Array.isArray(run.callTimes)||run.callTimes.length!==journey.stops.length)continue;
      const key=JSON.stringify([journeyIdentity(journey),run.id]);if(seen.has(key))continue;seen.add(key);
      for(const view of numberedRunViews(journey,entry,run,active)){
        const activeDates=view.dates.filter(date=>!journey._supplementalLabelDaily||(journey._supplementalLabelDaily[sourceTrainLabelKey(view.label)]||journey._supplementalLabelDaily[sourceTrainLabelKey(view._nativePublicLabel)])?.[dates.indexOf(date)]>0);
        if(activeDates.length)result.push({...view,journey,dates:activeDates});
      }
    }
  }
  return result.sort((a,b)=>(a.callTimes[0]?.[1]??a.callTimes[0]?.[0]??Infinity)-(b.callTimes[0]?.[1]??b.callTimes[0]?.[0]??Infinity)||String(a.label||'').localeCompare(String(b.label||''),undefined,{numeric:true}));
}
