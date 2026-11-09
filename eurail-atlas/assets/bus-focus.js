// Focus uses native boarding identities and their retained positions. Display
// paths and city labels never establish an additional passenger call.
export function busFocusMembership(rows=[],stops=[],focus=null,selected=null){
  const kind=selected?'route':focus?.kind,active=!!selected||kind==='route'||kind==='stop'||kind==='city',routeIds=new Set(),stopIds=new Set();
  if(!active)return{active:false,kind:'',routeIds,stopIds};
  const positions=new Map(stops.map(stop=>[stop.id,stop])),allRows=selected?[...rows,selected]:rows,cityRouteIds=kind==='city'&&Array.isArray(focus?.routeIds)?new Set(focus.routeIds):null;
  for(const row of allRows)for(const call of row.calls||[])if(!positions.has(call.id))positions.set(call.id,call);
  const inCity=stop=>{const b=focus?.bounds;return Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]<=b[2]&&b[1]<=b[3]&&Number.isFinite(stop?.lon)&&Number.isFinite(stop?.lat)&&stop.lon>=b[0]&&stop.lon<=b[2]&&stop.lat>=b[1]&&stop.lat<=b[3];};
  for(const row of allRows){
    const ids=row.stopIds||row.calls?.map(call=>call.id)||[];
    const match=kind==='route'?row.id===(selected?.id||focus.id):kind==='stop'?!!focus.stop?.id&&ids.includes(focus.stop.id):cityRouteIds?cityRouteIds.has(row.id):ids.some(id=>inCity(positions.get(id)));
    if(!match)continue;routeIds.add(row.id);for(const id of ids)stopIds.add(id);
  }
  if(kind==='stop'&&focus.stop?.id)stopIds.add(focus.stop.id);
  return{active,kind,routeIds,stopIds};
}

export const busRouteFocused=(row,membership)=>!membership?.active||membership.routeIds.has(row.id);
