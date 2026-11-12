import{normalize,validMapLocation}from'./atlas-core.js?v=654e053d9fab5bcf';
import{countryMatches}from'./explorer-core.js?v=654e053d9fab5bcf';

const searchIndex=new WeakMap();
const countryAliases={'The Netherlands':'Netherlands','Bosnia and Herzegovina':'Bosnia-Herzegovina'};

export function cityAreaOptions(cities,query,limit=4){
  const key=normalize(query);
  if(key.length<2)return[];
  if(!searchIndex.has(cities))searchIndex.set(cities,cities.map(city=>[
    city,[...new Set([city.name,...(city.aliases||[])].map(normalize))]
  ]));
  return searchIndex.get(cities).flatMap(([city,names])=>
    names.some(name=>name.startsWith(key))?[{city,exact:names.includes(key)}]:[]
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
