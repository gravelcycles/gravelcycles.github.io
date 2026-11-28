import{normalize,prepareEdge,aggregateMapPairs,selectedDays,effectivePass,edgeCount,dashedAlignment,CHARGE_MASKS}from'./atlas-core.js?v=bb4836e4a6de50c2';
import{journeyDaily,selectCityJourneyContexts,runLeftOut}from'./train-services.js?v=bb4836e4a6de50c2';
import{continuationMetrics,deduplicateContinuationAvailability}from'./through-continuations.js?v=bb4836e4a6de50c2';

const countryKeys=new Map();
function countryKey(country){if(!countryKeys.has(country))countryKeys.set(country,normalize(country));return countryKeys.get(country);}
export const countryMatches=(a,b)=>countryKey(a)===countryKey(b);
export function countryEdge(edge,country,stations){
  if(!country)return true;
  if(edge.country&&countryMatches(edge.country,country))return true;
  if(edge.countries?.some(name=>name&&countryMatches(name,country)))return true;
  return[stations.get(edge.a)?.country,stations.get(edge.b)?.country].some(name=>name&&countryMatches(name,country));
}
export function countryBounds(country,stations){
  let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
  for(const s of stations){if(!countryMatches(s.country,country)||!Number.isFinite(s.lon)||!Number.isFinite(s.lat)||s.lon< -25||s.lon>60||s.lat<33||s.lat>73)continue;west=Math.min(west,s.lon);south=Math.min(south,s.lat);east=Math.max(east,s.lon);north=Math.max(north,s.lat);}
  return Number.isFinite(west)?[[south,west],[north,east]]:null;
}
const contextCountryAliases=new Map([
  ['great britain',['united kingdom','uk','britain']],['turkiye',['turkey']],
  ['bosnia herzegovina',['bosnia and herzegovina','bosnia and herz']],
  ['north macedonia',['macedonia']],['czechia',['czech republic']]
]);
// The small immutable basemap frames a country without downloading the full
// station catalogue. Ignore overseas land outside the atlas' retained extent.
export function countryContextBounds(country,document){
  const key=countryKey(country),names=new Set([key,...contextCountryAliases.get(key)||[]]);
  const feature=document?.features?.find(row=>['NAME','NAME_LONG','ADMIN','GEOUNIT','NAME_EN'].some(field=>names.has(countryKey(row.properties?.[field]))));
  if(!feature)return null;
  let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
  function visit(value){
    if(!Array.isArray(value))return;
    if(typeof value[0]==='number'&&typeof value[1]==='number'){
      const[lon,lat]=value;if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon< -25||lon>60||lat<33||lat>73)return;
      west=Math.min(west,lon);south=Math.min(south,lat);east=Math.max(east,lon);north=Math.max(north,lat);
    }else for(const child of value)visit(child);
  }
  visit(feature.geometry?.coordinates);
  return Number.isFinite(west)?[[south,west],[north,east]]:null;
}
// A city is a service selector, never a geometric endpoint. Draw retained
// source rail legs and preserve gaps instead of joining them with city chords.
export function cityRailGeometryParts(document,path){
  const parts=[];let coords=[],ids=[],statuses=new Set();
  const finish=()=>{if(coords.length>1)parts.push({coords,ids,statuses:[...statuses]});coords=[];ids=[];statuses=new Set();};
  for(const ref of path?.legs||[]){
    const rail=ref&&document.railGeometry?.[ref[0]];
    if(!rail||!['provider','inferred','inferred_shortest_rail_path'].includes(rail.geometryStatus)||!Array.isArray(rail.coords)||rail.coords.length<2){finish();continue;}
    const points=ref[1]?[...rail.coords].reverse():rail.coords;
    if(coords.length&&(coords.at(-1)[0]!==points[0][0]||coords.at(-1)[1]!==points[0][1]))finish();
    coords.push(...points.slice(coords.length?1:0));ids.push([rail.shapeId||ref[0],Number(!!ref[1]!==!rail.shapeForward)]);statuses.add(rail.geometryStatus);
  }
  finish();return parts;
}
function cityPathRows(row,dates){
  const paths=row.railPaths||[];if(!paths.length)return[];
  if(!row.availabilityJourneyId)return[{row,path:paths[0]}];
  const bySpan=new Map(paths.map(path=>[JSON.stringify(path.callSpan),{path,days:new Set()}]));
  dates.forEach((_,day)=>bySpan.get(JSON.stringify(row._contextSpansByDate?.[day]||row._contextSpan))?.days.add(day));
  return[...bySpan.values()].filter(item=>item.days.size).map(({path,days})=>{
    const masked={...row,_cityGeometryDates:[...days]};
    for(const[key,value]of Object.entries(row))if((key==='daily'||key.endsWith('Daily'))&&Array.isArray(value)){
      masked[key]=value.map((n,i)=>days.has(i)?n:0);const week=key==='daily'?'weekly':key.slice(0,-5)+'Weekly';
      if(week in row)masked[week]=masked[key].reduce((a,b)=>a+b,0);
    }
    if(row._cityChargeMetrics)masked._cityChargeMetrics=Object.fromEntries(Object.entries(row._cityChargeMetrics).map(([key,value])=>[key,value.map((n,i)=>days.has(i)?n:0)]));
    return{row:masked,path};
  });
}
function displayShapeKey(text){
  // A compact display/cache identity; publication integrity uses the producer's
  // SHA256 shape IDs. Keep selected-edge URLs independent of route length.
  let a=2166136261,b=2246822507;
  for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);a=Math.imul(a^n,16777619);b=Math.imul(b^n,3266489909);}
  return(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
// The Top N a city belongs to: its tier when the projection has always-included
// cities (capitals, checklist), otherwise its population rank.
export const cityHubTier=city=>city?.hubTier??city?.rank;
// What a Top N choice shows, from the projection itself: "Top 50" for a
// population-only week, "Top 50 + capitals and checklist cities (79)" otherwise.
export function hubCountLabel(document,count,{short=false}={}){
  const cities=document?.cities||[];
  if(!cities.some(city=>city.hubTier))return'Top '+count;
  return'Top '+count+(short?' + capitals (':' + capitals and checklist cities (')+cities.filter(city=>cityHubTier(city)<=count).length+')';
}
// Listed capitals or checklist cities with no published rail call this week.
export function hubCitiesWithoutRailCalls(document){
  const rows=document?.summary?.alwaysIncludedWithoutRailCalls;
  return Array.isArray(rows)?rows.filter(row=>row&&typeof row.name==='string'):[];
}
// Zoomed out (overview), Hubs draws one stroke per city pair along its
// busiest recorded route with a complete, solid railway path and styles it by the city-pair total: both
// directions, every route variant and every source the current filters keep,
// after the duplicate rule already applied to the rows above. A row drawn as
// several geometry parts (gaps in its railway path) still counts once. Each
// overview stroke carries all of the pair's rows, so the stroke colour, the
// inspector count and the listed services agree. Zoomed in, the owner's
// route-specific counts apply unchanged (AGENTS.md, 4 November cleanup): one
// stroke per retained railway route and source, counted separately.
const CITY_PAIR_FIELDS=['daily','eurailDaily','boardableDaily','eurailBoardableDaily','conditionalDaily','conditionalBoardableDaily','reviewedEurailDaily','reviewedEurailBoardableDaily','reviewedConditionalDaily','reviewedConditionalBoardableDaily'];
function cityRowKey(row){return JSON.stringify([row.source,row.snapshot,row.id,row.primary!==false,row._cityGeometryDates||null]);}
function sumCityRows(rows,state,dates){let total=0;for(const row of rows)total+=edgeCount(row,state,dates);return total;}
export function cityPairEdges(rows,state,dates,overview=false){
  if(!overview)return aggregateMapPairs(rows);
  const pairs=new Map();
  for(const row of rows){
    let pair=pairs.get(row._cityPairKey);
    if(!pair){pair={unique:new Map(),geometries:new Map(),paths:new Map()};pairs.set(row._cityPairKey,pair);}
    const key=cityRowKey(row);if(!pair.unique.has(key))pair.unique.set(key,row);
    let geometry=pair.geometries.get(row._cityGeometryKey);
    if(!geometry){geometry={coords:row.coords,statuses:new Set(),rows:new Map(),paths:new Set()};pair.geometries.set(row._cityGeometryKey,geometry);}
    for(const status of row.railGeometryStatuses||[])geometry.statuses.add(status);
    if(!geometry.rows.has(key))geometry.rows.set(key,row);geometry.paths.add(row._cityPathKey);
    let path=pair.paths.get(row._cityPathKey);if(!path){path=new Map();path.clean=true;pair.paths.set(row._cityPathKey,path);}if(!path.has(key))path.set(key,row);
    if(row.railGeometryMissingLegs||dashedAlignment(row))path.clean=false;
  }
  const result=[];
  for(const[pairKey,pair]of pairs){
    const members=[...pair.unique.values()];
    let geometries=[...pair.geometries.entries()];
    if(pair.paths.size>1){
      // The busiest route whose railway path is complete and drawn solid;
      // only when no route qualifies, the busiest route as recorded.
      let best=null,bestScore=null;
      for(const[pathKey,path]of[...pair.paths.entries()].sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:0)){const score=[path.clean?1:0,sumCityRows(path.values(),state,dates)];if(!bestScore||score[0]>bestScore[0]||score[0]===bestScore[0]&&score[1]>bestScore[1]){best=pathKey;bestScore=score;}}
      geometries=geometries.filter(([,geometry])=>geometry.paths.has(best));
    }
    // Sum with the same field rules as an ordinary map pair; members keep
    // their own source, snapshot and journey identities for the inspector.
    const total=aggregateMapPairs(members.map(row=>({...row,source:'city-pair',mapPairId:pairKey,primary:true,geometryStatus:'city'})))[0];
    for(const field of CITY_PAIR_FIELDS)if(!Array.isArray(total[field]))total[field]=null;
    const partial=members.some(row=>row.railGeometryMissingLegs);
    for(const[geometryKey,geometry]of geometries){
      const variant=[...geometry.rows.values()];
      const edge=prepareEdge({...total,_world:undefined,_bbox:undefined,_pointCount:undefined,straightJumpKm:undefined,
        id:'city-pair:'+pairKey+':'+geometryKey,mapPairId:JSON.stringify([JSON.parse(pairKey),geometryKey]),
        source:members[0].source,primary:members.some(row=>row.primary!==false),
        availabilityOnly:members.every(row=>row.availabilityOnly===true)||undefined,
        throughConnection:members.every(row=>row.throughConnection)||undefined,
        availabilityJourneyId:undefined,_contextSpan:undefined,
        geometryStatus:partial?'retained_city_railway_partial':'retained_city_railway',
        coords:geometry.coords,railGeometryStatuses:[...geometry.statuses],
        _directionEdges:members,_cityPairSources:[...new Set(members.map(row=>row.source))].sort(),
        _cityOverview:{geometryKey,routes:pair.paths.size,rows:variant}});
      if(edge)result.push(edge);
    }
  }
  return result;
}
export function cityConnectionEdges(document,state,dates,{overview=false}={}){
  if(!document)return[];
  const limit=[50,100,250,500].includes(state.hubCount)?state.hubCount:100;
  const cities=new Map(document.cities.filter(city=>cityHubTier(city)<=limit).map(city=>[city.id,city]));
  const days=selectedDays(state.day,dates),prefix=state.hubExamples==='fast'?'fast':state.hubExamples==='overnight'?'overnight':null;
  const field=prefix?prefix+(effectivePass(state)?'Included':'')+'ExampleDaily':null;
  // Trains another selected feed also publishes are counted once (rail-duplicates.js).
  const counted=state.duplicates,published=counted?counted.cityRows(document.connections):document.connections;
  const special=new Map(),connections=published.filter(row=>!row.availabilityJourneyId);
  for(const row of published)if(row.availabilityJourneyId){const key=JSON.stringify([row.fromCity,row.toCity]),journey={...row,_cityRowId:row.id,id:row.availabilityJourneyId};if(!special.has(key))special.set(key,[]);special.get(key).push(selectCityJourneyContexts(counted?counted.journey(journey):journey,state,dates));}
  for(const rows of special.values())for(const item of deduplicateContinuationAvailability(rows,{dates,selectedDayIndices:days,dailyFor:row=>journeyDaily(row,state,dates),spanFor:(row,day)=>row._contextSpansByDate?.[day]||row._contextSpan,leftOut:(parent,runId,day)=>runLeftOut(parent,runId,day,state)})){
    const context=continuationMetrics(item,state,dates),raw=context?.daily||item.daily;
    const included=context?raw.map((n,i)=>Math.min(n,context.eurailDaily[i]+context.reviewedEurailDaily[i])):raw.map((n,i)=>Math.min(item._passDaily?.[i]??n,(Number(item.eurailDaily?.[i])||0)+(Number(item.reviewedEurailDaily?.[i])||0)));
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
    for(const{row:route,path}of cityPathRows(row,dates)){
      const parts=cityRailGeometryParts(document,path);
      for(const part of parts){
        const signature=JSON.stringify(part.ids),reversed=JSON.stringify([...part.ids].reverse().map(([id,direction])=>[id,1-direction]));
        const geometryKey=displayShapeKey(signature<reversed?signature:reversed);
        const edge=prepareEdge({...route,a:a.id,b:b.id,_cityConnection:true,_stationIds:route.sourceStations,
          _cityPairKey:JSON.stringify([a.id,b.id].sort()),_cityGeometryKey:geometryKey,_cityPathKey:JSON.stringify(path.legs||[]),
          country:a.country,countries:[...new Set([a.country,b.country])],
          mapPairId:JSON.stringify([[a.id,b.id].sort(),geometryKey]),
          railGeometryMissingLegs:path.missingLegs||0,railGeometryPartCount:parts.length,
          railGeometryStatuses:part.statuses,geometryStatus:path.missingLegs?'retained_city_railway_partial':'retained_city_railway',coords:part.coords,
          boardableDaily:route.daily,boardableWeekly:route.weekly,
          eurailBoardableDaily:route.eurailDaily,eurailBoardableWeekly:route.eurailWeekly});
        if(edge)rows.push(edge);
      }
    }
  }
  return cityPairEdges(rows,state,dates,overview).map(edge=>({...edge,
    railGeometryMissingLegs:Math.max(...edge._directionEdges.map(row=>row.railGeometryMissingLegs)),
    railGeometryPartCount:Math.max(...edge._directionEdges.map(row=>row.railGeometryPartCount)),
    railGeometryStatuses:[...new Set(edge._directionEdges.flatMap(row=>row.railGeometryStatuses))],
    callValidationReview:edge._directionEdges.find(row=>row.callValidationReview)?.callValidationReview,
    _passPolicy:Object.fromEntries(CHARGE_MASKS.map(mask=>['chargeMask'+mask+'Daily',dates.map((_,i)=>edge._directionEdges.reduce((sum,row)=>sum+(row._cityChargeMetrics?.['chargeMask'+mask+'Daily']?.[i]??(mask===8?row.eurailDaily?.[i]||0:0)),0))])),
    _stationIds:[...new Set(edge._directionEdges.flatMap(row=>row.sourceStations||[]))],
    journeyIds:[...new Set(edge._directionEdges.flatMap(row=>row.journeyIds||[]))]}));
}
