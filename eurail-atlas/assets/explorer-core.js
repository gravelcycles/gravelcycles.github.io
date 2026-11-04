import{normalize,prepareEdge,aggregateMapPairs,selectedDays,effectivePass,CHARGE_MASKS}from'./atlas-core.js?v=e50a46fa12bae65b';
import{journeyDaily,selectCityJourneyContexts}from'./train-services.js?v=e50a46fa12bae65b';
import{continuationMetrics,deduplicateContinuationAvailability}from'./through-continuations.js?v=e50a46fa12bae65b';

export const countryMatches=(a,b)=>normalize(a)===normalize(b);
export function countryEdge(edge,country,stations){
  if(!country)return true;
  const names=[edge.country,...edge.countries||[],stations.get(edge.a)?.country,stations.get(edge.b)?.country];
  return names.some(name=>name&&countryMatches(name,country));
}
export function countryBounds(country,stations){
  const rows=stations.filter(s=>countryMatches(s.country,country)&&Number.isFinite(s.lon)&&Number.isFinite(s.lat)&&s.lon>=-25&&s.lon<=60&&s.lat>=33&&s.lat<=73);
  if(!rows.length)return null;
  return[[Math.min(...rows.map(s=>s.lat)),Math.min(...rows.map(s=>s.lon))],[Math.max(...rows.map(s=>s.lat)),Math.max(...rows.map(s=>s.lon))]];
}
export function cityConnectionEdges(document,state,dates){
  if(!document)return[];
  const limit=[50,100,250,500].includes(state.hubCount)?state.hubCount:100;
  const cities=new Map(document.cities.filter(city=>city.rank<=limit).map(city=>[city.id,city]));
  const days=selectedDays(state.day,dates),prefix=state.hubExamples==='fast'?'fast':state.hubExamples==='overnight'?'overnight':null;
  const field=prefix?prefix+(effectivePass(state)?'Included':'')+'ExampleDaily':null;
  const special=new Map(),connections=document.connections.filter(row=>!row.availabilityJourneyId);
  for(const row of document.connections)if(row.availabilityJourneyId){const key=JSON.stringify([row.fromCity,row.toCity]);if(!special.has(key))special.set(key,[]);special.get(key).push(selectCityJourneyContexts({...row,_cityRowId:row.id,id:row.availabilityJourneyId},state,dates));}
  for(const rows of special.values())for(const item of deduplicateContinuationAvailability(rows,{dates,selectedDayIndices:days,dailyFor:row=>journeyDaily(row,state,dates),spanFor:(row,day)=>row._contextSpansByDate?.[day]||row._contextSpan})){
    const context=continuationMetrics(item,state,dates),raw=context?.daily||item.daily;
    const included=context?raw.map((n,i)=>Math.min(n,context.eurailDaily[i]+context.reviewedEurailDaily[i])):raw.map((n,i)=>Math.min(n,(Number(item.eurailDaily?.[i])||0)+(Number(item.reviewedEurailDaily?.[i])||0)));
    // Resolve contextual metrics before ordinary map-pair aggregation. Keeping
    // the first row's policy object on a summed city edge would lose later
    // logical runs or re-evaluate station IDs as city IDs.
    const{sourceSupport,odPolicies,coveredFragments,...row}=item;
    row.id=item._cityRowId;row.daily=raw;row.eurailDaily=included;row.reviewedEurailDaily=dates.map(()=>0);
    row.conditionalDaily=context?.uncertainDaily||dates.map(()=>0);row.conditionalBoardableDaily=row.conditionalDaily;
    const reservation=row.reservation||'unknown',supplement=row.supplement||'unknown';
    const noReservation=['none','optional','not_required'].includes(reservation),noSupplement=['none','not_required','no_listed_additional_train_supplement'].includes(supplement),requiredSupplement=['required','passholder_fare_required'].includes(supplement);
    const mask=(reservation==='required'?1:0)|(requiredSupplement?2:0)|(noReservation&&noSupplement?4:0)|(!noReservation&&reservation!=='required'||!noSupplement&&!requiredSupplement?8:0);
    row._cityChargeMetrics=Object.fromEntries(CHARGE_MASKS.map(value=>['chargeMask'+value+'Daily',context?.['chargeMask'+value+'Daily']||included.map(n=>value===mask?n:0)]));
    row.weekly=raw.reduce((a,b)=>a+b,0);row.eurailWeekly=included.reduce((a,b)=>a+b,0);row.reviewedEurailWeekly=0;
    for(const prefix of['fast','overnight']){row[prefix+'ExampleDaily']=raw.map((n,i)=>Number(n>0&&item[prefix+'ExampleDaily']?.[i]>0));row[prefix+'IncludedExampleDaily']=included.map((n,i)=>Number(n>0&&item[prefix+'ExampleDaily']?.[i]>0));}
    connections.push(row);
  }
  const pair=row=>JSON.stringify([row.fromCity,row.toCity].sort()),examples=new Set();
  if(field)for(const row of connections){
    if(state.sources&&!state.sources.has(row.source)||row.primary===false&&!state.alternatives&&!state.altSourceIds?.has(row.source))continue;
    if(days.some(i=>row[field]?.[i]))examples.add(pair(row));
  }
  const rows=[];
  for(const row of connections){
    if(state.sources&&!state.sources.has(row.source)||row.primary===false&&!state.alternatives&&!state.altSourceIds?.has(row.source))continue;
    const a=cities.get(row.fromCity),b=cities.get(row.toCity);if(!a||!b)continue;
    if(state.hubCity&&a.id!==state.hubCity&&b.id!==state.hubCity)continue;
    if(field&&!examples.has(pair(row)))continue;
    const edge=prepareEdge({...row,a:a.id,b:b.id,_cityConnection:true,_stationIds:row.sourceStations,
      country:a.country,countries:[...new Set([a.country,b.country])],
      geometryStatus:'schematic_city_connection',coords:[[a.lon,a.lat],[b.lon,b.lat]],
      boardableDaily:row.daily,boardableWeekly:row.weekly,
      eurailBoardableDaily:row.eurailDaily,eurailBoardableWeekly:row.eurailWeekly});
    if(edge)rows.push(edge);
  }
  return aggregateMapPairs(rows).map(edge=>({...edge,
    callValidationReview:edge._directionEdges.find(row=>row.callValidationReview)?.callValidationReview,
    _passPolicy:Object.fromEntries(CHARGE_MASKS.map(mask=>['chargeMask'+mask+'Daily',dates.map((_,i)=>edge._directionEdges.reduce((sum,row)=>sum+(row._cityChargeMetrics?.['chargeMask'+mask+'Daily']?.[i]??(mask===8?row.eurailDaily?.[i]||0:0)),0))])),
    _stationIds:[...new Set(edge._directionEdges.flatMap(row=>row.sourceStations||[]))],
    journeyIds:[...new Set(edge._directionEdges.flatMap(row=>row.journeyIds||[]))]}));
}
