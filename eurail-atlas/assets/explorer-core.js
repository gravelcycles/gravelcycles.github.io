import{normalize,prepareEdge,aggregateMapPairs,selectedDays,effectivePass}from'./atlas-core.js?v=a8d1727da1380e07';

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
  const pair=row=>JSON.stringify([row.fromCity,row.toCity].sort()),examples=new Set();
  if(field)for(const row of document.connections){
    if(state.sources&&!state.sources.has(row.source)||row.primary===false&&!state.alternatives&&!state.altSourceIds?.has(row.source))continue;
    if(days.some(i=>row[field]?.[i]))examples.add(pair(row));
  }
  const rows=[];
  for(const row of document.connections){
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
    _stationIds:[...new Set(edge._directionEdges.flatMap(row=>row.sourceStations||[]))],
    journeyIds:[...new Set(edge._directionEdges.flatMap(row=>row.journeyIds||[]))]}));
}
