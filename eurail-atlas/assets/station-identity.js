import{normalize}from'./atlas-core.js?v=78cd4ddea0382b77';

// Canonical places are a display/lookup layer. Journey calls and rail geometry
// continue to use the original source station IDs and boarding locations.
export function stationMemberIds(station){return station?.memberIds?.length?[...new Set(station.memberIds)]:station?.id?[station.id]:[];}
export function stationSources(station){return station?.sources?.length?[...new Set(station.sources)]:station?.source?[station.source]:[];}
export function stationSourceSelected(station,state={}){return !state.sources||stationSources(station).some(source=>state.sources.has(source));}
export function stationSourceLabel(station,sourceName){return stationSources(station).map(sourceName).join(' · ');}
export function stationSearchText(station){return station._search||[station._name||normalize(station.name),...(station.aliases||[]).map(normalize),normalize(station.country)].join(' ');}

// Boarding modes come from explicit source evidence. Identical stop names can
// still describe different places to board, especially a replacement bus.
export function stationBoardingAreas(station){
  const categories={rail:'Rail platforms',temporary_replacement_bus:'Replacement bus stops'},seen=new Set(),areas=[];
  for(const area of station?.boardingAreas||[]){
    const name=typeof area==='string'?area.trim():typeof area?.name==='string'?area.name.trim():'';
    if(!name)continue;
    const category=Object.hasOwn(categories,area?.serviceMode)?categories[area.serviceMode]:'',key=JSON.stringify([name,category]);
    if(seen.has(key))continue;seen.add(key);areas.push({name,category});
  }
  return areas;
}

export class StationCatalog{
  constructor(){this.sourceStations=new Map();this.canonicalStations=new Map();this.memberStations=new Map();}
  addSource(station){
    // A spatial packet may arrive after the complete index. Preserve fields
    // omitted by that smaller packet, including its canonical correspondence.
    const row={...this.sourceStations.get(station.id),...station};row._name=normalize(row.name);delete row._search;row._search=stationSearchText(row);this.sourceStations.set(row.id,row);return row;
  }
  addCanonical(station){const row={...this.canonicalStations.get(station.id),...station};row._name=normalize(row.name);delete row._search;row._search=stationSearchText(row);this.canonicalStations.set(row.id,row);for(const id of stationMemberIds(row))this.memberStations.set(id,row.id);return row;}
  resolve(id){const row=this.sourceStations.get(id);return this.canonicalStations.get(id)||this.canonicalStations.get(row?.canonicalId)||this.canonicalStations.get(this.memberStations.get(id))||row;}
  values(){return[...this.canonicalStations.values(),...[...this.sourceStations.values()].filter(row=>!this.canonicalStations.has(row.canonicalId)&&!this.canonicalStations.has(row.id))];}
}
