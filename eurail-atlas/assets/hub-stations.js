import{normalize,qualifiesEdge,edgeCount,conditionalCount,effectivePass,selectedDays,serializeState,validMapLocation}from'./atlas-core.js?v=7e389cc516b08c39';
import{stationMemberIds,stationSourceSelected}from'./station-identity.js?v=7e389cc516b08c39';
import{stationInScope}from'./project-scope.js?v=7e389cc516b08c39';

// Existing reviewed50-city intercity station anchors, not a ridership ranking.
// Source: config/rail-international-major-stations.json (3 Nov anchors;
// reviewed 4 Nov canonical updates retain their previous IDs in that source).
// They rank only real stations which have active displayed city connections.
export const REVIEWED_MAIN_ANCHORS=[{"city":"London","country":"Great Britain","primary":"103b16992195da36ae","alternatives":[]},{"city":"Paris","country":"France","primary":"01185a4301d46fefe2","alternatives":["14b118fb792dcc3624","5dd98ecc57e333c37c","091101f410a77eec2b","00f877be857f038273","a349eeb7ac02c80469"]},{"city":"Brussels","country":"Belgium","primary":"0d6114b5d597ccb8ca","alternatives":["418222cc5df40448b6","1f649c36736d54fa29"]},{"city":"Amsterdam","country":"Netherlands","primary":"7ebdd1ef970964bc7e","alternatives":["ffda6893cea9ce84cc","d4431b2603f364a352"]},{"city":"Berlin","country":"Germany","primary":"1bca2dff3c6641887b","alternatives":["1dffbed22c7514db6c","2802cbe10ab4ab3a81","2f8b60bd34a2fc5b0c","4ff8ba3805940d881d"]},{"city":"Hamburg","country":"Germany","primary":"261c33a2218d95fdc5","alternatives":["068d3254679debe3a2","59fb873f9b77786428","2bca7a170afc53f3ee"]},{"city":"Munich","country":"Germany","primary":"1421c03504f5416e4c","alternatives":["07bbc261f67c2ed0c0"]},{"city":"Frankfurt","country":"Germany","primary":"2a446a362facd90ff8","alternatives":["5681d53efe8b418b99"]},{"city":"Cologne","country":"Germany","primary":"00532706ec2cc4a232","alternatives":["8cd2d8b3e4e8b235c1"]},{"city":"Zürich","country":"Switzerland","primary":"12eeb5ab1382869f4c","alternatives":[]},{"city":"Basel","country":"Switzerland","primary":"23600de62ddbc4aee4","alternatives":["7a3f33d533d949f836"]},{"city":"Geneva","country":"Switzerland","primary":"abe82993b52f76b7ca","alternatives":[]},{"city":"Bern","country":"Switzerland","primary":"3cccae69d74f01d64a","alternatives":[]},{"city":"Vienna","country":"Austria","primary":"030cdf445766091e0d","alternatives":["851d0526415102ddde"]},{"city":"Salzburg","country":"Austria","primary":"1b27be6d0925332a5e","alternatives":[]},{"city":"Innsbruck","country":"Austria","primary":"07cf7f8afff5e59973","alternatives":[]},{"city":"Prague","country":"Czechia","primary":"31e09122d880f6656e","alternatives":[]},{"city":"Warsaw","country":"Poland","primary":"0d298abe3d06893ff7","alternatives":["2cbf7f4c65d6e200c6","061ec2bbf76437f1cd"]},{"city":"Kraków","country":"Poland","primary":"21185fa50b224ee680","alternatives":["20c2952aa0f450c5eb"]},{"city":"Budapest","country":"Hungary","primary":"2dde8909b59866a7a8","alternatives":["f9acbaa3a04e165ff6","0c0bd42d52d7d52125","ebcb5cb554a1b3db9f","68eb96020769c14ca3"]},{"city":"Bratislava","country":"Slovakia","primary":"60ee55f15ad1e6e763","alternatives":["76e6505890cc804e5b"]},{"city":"Ljubljana","country":"Slovenia","primary":"04429529e1f4732051","alternatives":[]},{"city":"Zagreb","country":"Croatia","primary":"51da5fb3c35f8a47b0","alternatives":[]},{"city":"Belgrade","country":"Serbia","primary":"feb3163f7fb3963ed4","alternatives":[]},{"city":"Rome","country":"Italy","primary":"4d598b62ba72b0e9de","alternatives":["24537248546fb0057b"]},{"city":"Milan","country":"Italy","primary":"2f5f40ebe2217fc86d","alternatives":["1306657540b651d9ec","21c0733a6a03ece71b","c49d6de307271950a1"]},{"city":"Venice","country":"Italy","primary":"323d42e46e1d8e2026","alternatives":["1c8971e13ff832bdea"]},{"city":"Bologna","country":"Italy","primary":"04cf1df565717b4b40","alternatives":["1508079fb801366237"]},{"city":"Florence","country":"Italy","primary":"58d530912ba8b23f80","alternatives":["0bd1baa0cb3d224e19","23b339f48a1dfc8d63","93edded623ef47198f"]},{"city":"Naples","country":"Italy","primary":"2c6c0d4207ee39873f","alternatives":[]},{"city":"Turin","country":"Italy","primary":"2f9badaaa0a9cdff9f","alternatives":["36f49de52ecfaf3721"]},{"city":"Barcelona","country":"Spain","primary":"258a72afb61204c137","alternatives":[]},{"city":"Madrid","country":"Spain","primary":"1942757ae5655ad98b","alternatives":["1f03a496cbd1a1b4a2"]},{"city":"Lisbon","country":"Portugal","primary":"42cb9a705a0d158b10","alternatives":["ab8ecab4616ff3acdf"]},{"city":"Porto","country":"Portugal","primary":"302206ab87c735e615","alternatives":[]},{"city":"Copenhagen","country":"Denmark","primary":"81b3f95c3162305008","alternatives":["30c54180d58aaadefd","6080fb2f36e57be752"]},{"city":"Stockholm","country":"Sweden","primary":"0109283334b5d878b1","alternatives":[]},{"city":"Oslo","country":"Norway","primary":"5768da0224ccf0fc16","alternatives":[]},{"city":"Helsinki","country":"Finland","primary":"480d3aca32a4a858ff","alternatives":[]},{"city":"Gothenburg","country":"Sweden","primary":"1c2c02466456f23a86","alternatives":[]},{"city":"Luxembourg","country":"Luxembourg","primary":"78042aebeeb3a42611","alternatives":["4b577e7a148b00c27c"]},{"city":"Strasbourg","country":"France","primary":"0e77d1009c0b22628b","alternatives":[]},{"city":"Lyon","country":"France","primary":"32b9a5d9aef767a0c2","alternatives":["544a6a3ac49172cfc7"]},{"city":"Marseille","country":"France","primary":"0f9056546a051f604f","alternatives":[]},{"city":"Nice","country":"France","primary":"c12d7cb47de26f342b","alternatives":[]},{"city":"Bucharest","country":"Romania","primary":"fe0762cc4e900f3165","alternatives":["2aab4b2b198f00d547"]},{"city":"Sofia","country":"Bulgaria","primary":"a0eee86853a0177365","alternatives":[]},{"city":"Thessaloniki","country":"Greece","primary":"979d6b8ce54d50b462","alternatives":[]},{"city":"Athens","country":"Greece","primary":"5fe2dbd9b730aeec9a","alternatives":[]},{"city":"Istanbul","country":"Türkiye","primary":"038521a8698945ee80","alternatives":[]}];
const primary=new Set(REVIEWED_MAIN_ANCHORS.map(row=>row.primary)),alternatives=new Set(REVIEWED_MAIN_ANCHORS.flatMap(row=>row.alternatives));
const catalogs=new WeakMap(),results=new WeakMap();
const countryKey=value=>normalize(value).replace(/^the netherlands$/,'netherlands');
const mainName=name=>{const label=normalize(name);return /\b(airport|flughafen|aeroport|aeropuerto)\b/.test(label)?-2:/\b(hauptbahnhof|hbf|centralstation|centralna|centralny|centrale|central|centraal|hlavni nadrazi|hl n|hl st|hb|glowny|glavni kolodvor|termini)\b/.test(label)?2:0;};
function stationCatalog(stations,cities){
  let catalog=catalogs.get(stations);
  if(!catalog||catalog.cities!==cities){
    const members=new Map();for(const station of stations)for(const id of stationMemberIds(station))members.set(id,station);
    catalog={cities,members,assignments:new WeakMap()};catalogs.set(stations,catalog);
  }
  return catalog;
}
function assignedCity(station,catalog){
  if(catalog.assignments.has(station))return catalog.assignments.get(station);
  let nearest=null;
  for(const city of catalog.cities){
    if(countryKey(station.country)!==countryKey(city.country)||!validMapLocation(city.lon,city.lat))continue;
    const distance=111320*Math.hypot((station.lon-city.lon)*Math.cos(city.lat*Math.PI/180),station.lat-city.lat),radius=city.catchmentRadiusM||(city.population>=1000000?22000:city.population>=250000?12000:8000);
    if(distance>radius)continue;
    if(!nearest||distance<nearest.distance||distance===nearest.distance&&(city.population>nearest.city.population||city.population===nearest.city.population&&city.id<nearest.city.id))nearest={city,distance};
  }
  const city=nearest?.city||null;catalog.assignments.set(station,city);return city;
}
function endpointIds(row,state,dates){
  if(row.availabilityJourneyId&&Array.isArray(row.stops)&&Array.isArray(row._contextSpan)){
    const ids=new Set();
    for(const day of selectedDays(state.day,dates)){
      if(row._cityGeometryDates&&!row._cityGeometryDates.includes(day))continue;
      const dayState={...state,day:'day-'+day,min:0},normal=edgeCount(row,dayState,dates),review=effectivePass(dayState)&&dayState.review?conditionalCount(row,dayState,dates):0;
      if(normal+review<=0)continue;
      const span=row._contextSpansByDate?.[day]||row._contextSpan;
      for(const index of span){const call=row.stops[index],id=Array.isArray(call)?call[0]:call?.stationId;if(typeof id==='string')ids.add(id);}
    }
    return[...ids];
  }
  return row.sourceStations||row._stationIds||[];
}
export function mainHubStations(stations,cities,edges,state,dates){
  if(state.mode!=='hubs'||state.hubs===false||!stations.length||!cities.length)return[];
  const cacheKey=JSON.stringify([serializeState(state),state.sources?[...state.sources].sort():null]);
  let cached=results.get(edges);
  if(cached&&cached.stations===stations&&cached.cities===cities&&cached.dates===dates&&cached.key===cacheKey)return cached.rows;
  const catalog=stationCatalog(stations,cities),limit=[50,100,250,500].includes(state.hubCount)?state.hubCount:100,byCity=new Map(),seen=new Set();
  for(const edge of edges){
    if(!edge._cityConnection||!qualifiesEdge(edge,state,dates,catalog.members))continue;
    for(const row of edge._directionEdges||[edge]){
      const rowKey=JSON.stringify([row.id,row.source,row._cityGeometryDates||null]);if(seen.has(rowKey))continue;seen.add(rowKey);
      if(!qualifiesEdge(row,{...state,min:0},dates,catalog.members))continue;
      const activeCities=new Set([row.fromCity||row.a,row.toCity||row.b]);
      const support=edgeCount(row,state,dates)+(effectivePass(state)&&state.review?conditionalCount(row,state,dates):0);
      for(const id of endpointIds(row,state,dates)){
        const station=catalog.members.get(id);
        if(!station||!validMapLocation(station.lon,station.lat)||!stationInScope(station,state)||!stationSourceSelected(station,state))continue;
        const city=assignedCity(station,catalog);if(!city||city.rank>limit||!activeCities.has(city.id))continue;
        let candidates=byCity.get(city.id);if(!candidates){candidates=new Map();byCity.set(city.id,candidates);}
        const memberIds=stationMemberIds(station),anchor=memberIds.some(value=>primary.has(value))?2:memberIds.some(value=>alternatives.has(value))?1:0;
        const previous=candidates.get(station.id),candidate={station,city,anchor,name:mainName(station.name),support:Math.max(support,previous?.support||0)};
        candidates.set(station.id,candidate);
      }
    }
  }
  const rows=[];
  for(const candidates of byCity.values()){
    const best=[...candidates.values()].sort((a,b)=>b.anchor-a.anchor||b.name-a.name||b.support-a.support||(b.station.primaryWeekly||b.station.weekly||0)-(a.station.primaryWeekly||a.station.weekly||0)||a.station.id.localeCompare(b.station.id))[0];
    rows.push({...best.station,hubCityId:best.city.id,hubCityName:best.city.name,hubCityRank:best.city.rank,
      mainStationSelection:best.anchor===2?'reviewed_primary':best.anchor===1?'reviewed_alternative':best.name>0?'main_name_with_active_connection':'active_connection_station',
      ...(best.anchor?{mainStationSelectionReference:'config/rail-international-major-stations.json'}:{})});
  }
  rows.sort((a,b)=>a.hubCityRank-b.hubCityRank||a.id.localeCompare(b.id));
  results.set(edges,{stations,cities,dates,key:cacheKey,rows});return rows;
}
