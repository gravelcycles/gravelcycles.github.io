import{normalize,validMapLocation}from'./atlas-core.js?v=c2d325ced363137f';

export function restoreContextFocus(chip){
  // Phone sheets clear background inertness in their hidden-state observer.
  // Restore focus after that observer, never into a newer modal or hidden drawer.
  const ownerDocument=globalThis.document,restore=()=>{
    const available=node=>node&&!node.hidden&&!node.inert&&!node.closest?.('[inert]')&&node.getClientRects?.().length!==0,
      target=available(chip)?chip:ownerDocument?.getElementById('controlsToggle');
    if(available(target))target.focus({preventScroll:true});
  };
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(restore);else queueMicrotask(restore);
}

// Context panels describe a deliberate map/filter selection. A pending fetch
// may update its data, but cannot retain a panel from an earlier selection.
export function contextSelectionKey(state,dates=[]){
  return JSON.stringify([state.mode,state.country,state.day,dates,state.pass,state.review,
    state.charge,state.chargeMatch,state.included,state.min,state.trains,state.replacements,
    state.aligned,state.inferred,state.schematic,state.alternatives,state.accommodation,
    state.hubCount,state.hubExamples,state.hubCity,state.closedCorridors,state.physicalRailways,
    state.sources instanceof Set?[...state.sources].sort():null]);
}

export function contextCountryVisible(row,state,resolveCountries=()=>[]){
  if(state.mode!=='countries'||!state.country)return true;
  const declared=[row.country,...row.countries||[]].filter(Boolean),countries=declared.length?declared:resolveCountries(row);
  return [...countries].some(country=>normalize(country)===normalize(state.country));
}

export function createContextCountryResolver(getStations=()=>[],{maximumKm=2}={}){
  const cell=.05,radians=Math.PI/180;
  let retained=null,count=-1,index=new Map(),cache=new WeakMap();
  function refresh(){
    const stations=getStations()||[];if(stations===retained&&stations.length===count)return;
    retained=stations;count=stations.length;index=new Map();cache=new WeakMap();
    for(const station of stations){
      if(!station.country||!validMapLocation(station.lon,station.lat))continue;
      const key=Math.floor(station.lon/cell)+','+Math.floor(station.lat/cell);
      if(!index.has(key))index.set(key,[]);index.get(key).push(station);
    }
  }
  function countriesAt(point){
    if(!validMapLocation(point.lon,point.lat))return[];
    const x=Math.floor(point.lon/cell),y=Math.floor(point.lat/cell),cos=Math.max(.08,Math.cos(point.lat*radians)),
      dx=Math.ceil(maximumKm/(111.32*cos*cell)),dy=Math.ceil(maximumKm/(111.32*cell)),nearby=[];
    for(let a=x-dx;a<=x+dx;a++)for(let b=y-dy;b<=y+dy;b++)for(const station of index.get(a+','+b)||[]){
      const distance=111.32*Math.hypot((station.lon-point.lon)*cos,station.lat-point.lat);
      if(distance<=maximumKm)nearby.push({station,distance});
    }
    const name=normalize(point.name||''),named=name?nearby.filter(({station})=>[station.name,...station.aliases||[]].some(label=>normalize(label)===name)):[],candidates=named.length?named:nearby;
    if(!candidates.length)return[];
    const nearest=Math.min(...candidates.map(row=>row.distance));
    // Keep close border/platform references explicit instead of assigning an
    // operator's home country to the physical notice geography.
    return candidates.filter(row=>row.distance<=nearest+.05).map(row=>row.station.country);
  }
  return row=>{
    refresh();if(cache.has(row))return cache.get(row);
    let points=row.endpoints||[];
    if(!points.length&&row.geometry){
      const lines=row.geometry.type==='LineString'?[row.geometry.coordinates]:row.geometry.type==='MultiLineString'?row.geometry.coordinates:[];
      points=lines.flatMap(line=>line.map(([lon,lat])=>({lon,lat})));
    }
    const countries=new Set(points.flatMap(countriesAt));cache.set(row,countries);return countries;
  };
}
