// Scope follows physical station/edge identities supplied by the build. A
// feed's home country is deliberately irrelevant to an in-scope cross-border
// train. Full calling patterns remain available as timetable evidence.
export function stationInScope(station,state){return!!station&&!state.scopeExcludedStationIds?.has(station.id)&&!state.scopeExcludedHubIds?.has(station.id);}
export function edgeInScope(edge,state){
  if(!edge||state.scopeExcludedEdgeIds?.has(edge.id))return false;
  for(const id of[edge.a,edge.b])if(id&&(state.scopeExcludedStationIds?.has(id)||state.scopeExcludedHubIds?.has(id)))return false;
  return!edge._directionEdges?.length||edge._directionEdges.some(row=>edgeInScope(row,state));
}
export function applyProjectScope(state,scope){
  for(const[key,field]of[['excludedStationIds','scopeExcludedStationIds'],['excludedEdgeIds','scopeExcludedEdgeIds'],['excludedHubIds','scopeExcludedHubIds']])state[field]=new Set(scope?.schemaVersion===1?scope[key]||[]:[]);
  state.scopeRevision=(state.scopeRevision||0)+1;
  for(const field of['from','to','station'])if(state[field]&&!stationInScope({id:state[field]},state))state[field]='';
  if(state.scopeExcludedEdgeIds.has(state.edge))state.edge='';
}
