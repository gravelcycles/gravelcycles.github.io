import{normalize,validMapLocation}from'./atlas-core.js?v=a8efea473ec2c6f7';
import{countryMatches}from'./explorer-core.js?v=a8efea473ec2c6f7';
import{latinSpellings}from'./transliterate.js?v=a8efea473ec2c6f7';

const searchIndex=new WeakMap();
const countryAliases={'The Netherlands':'Netherlands','Bosnia and Herzegovina':'Bosnia-Herzegovina'};

export function cityAreaOptions(cities,query,limit=4){
  const key=normalize(query);
  if(key.length<2)return[];
  if(!searchIndex.has(cities))searchIndex.set(cities,cities.map(city=>[
    city,[...new Set([city.name,...(city.aliases||[])].map(normalize))]
  ]));
  const keys=[key,...latinSpellings(key)];
  return searchIndex.get(cities).flatMap(([city,names])=>
    names.some(name=>keys.some(value=>name.startsWith(value)))?[{city,exact:keys.some(value=>names.includes(value))}]:[]
  ).sort((a,b)=>Number(b.exact)-Number(a.exact)||b.city.population-a.city.population||a.city.id.localeCompare(b.city.id))
    .slice(0,limit).map(({city})=>({...city,isCityArea:true}));
}

export function cityAreaRadius(city){
  return city.population>=1000000?22:city.population>=250000?12:8;
}

export function cityAreaBounds(city){
  const dy=cityAreaRadius(city)/111.32,dx=dy/Math.cos(city.lat*Math.PI/180);
  return [[city.lat-dy,city.lon-dx],[city.lat+dy,city.lon+dx]];
}

// Use source points for membership even when a reviewed map position exists.
export function cityAreaStationIds(city,stations){
  const radius=cityAreaRadius(city)/111.32,scale=Math.cos(city.lat*Math.PI/180),ids=[];
  const country=countryAliases[city.country]||city.country;
  for(const station of stations){
    if(!countryMatches(station.country,country))continue;
    const [lon,lat]=station.sourceOriginalPosition||[station.lon,station.lat];
    if(validMapLocation(lon,lat)&&Math.hypot((lon-city.lon)*scale,lat-city.lat)<=radius)ids.push(station.id);
  }
  return ids;
}

// Whether any recorded station inside a city area has scheduled service in
// the current view (all trains, or Eurail-included trains when a pass view or
// filter is active). A station without a weekly figure counts as served, so a
// city is only marked when every member positively records none.
export function cityAreaHasService(city,stations,{pass=false,inScope=()=>true}={}){
  const radius=cityAreaRadius(city)/111.32,scale=Math.cos(city.lat*Math.PI/180);
  const country=countryAliases[city.country]||city.country;
  for(const station of stations){
    if(!countryMatches(station.country,country)||!inScope(station))continue;
    const [lon,lat]=station.sourceOriginalPosition||[station.lon,station.lat];
    if(!validMapLocation(lon,lat)||Math.hypot((lon-city.lon)*scale,lat-city.lat)>radius)continue;
    const weekly=pass?station.eurailWeekly:station.weekly;
    if(!Number.isFinite(weekly)||weekly>0)return true;
  }
  return false;
}
