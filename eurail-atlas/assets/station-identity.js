import{normalize}from'./atlas-core.js?v=1feafcec58b2ffae';

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
  constructor(){this.sourceStations=new Map();this.canonicalStations=new Map();this.memberStations=new Map();this.displayPositions=new Map();this.originalPositions=new Map();}
  restorePosition(row){
    const original=this.originalPositions.get(row);if(!original)return;
    row.lon=original.lon;row.lat=original.lat;
    if(original.hadSourcePoint)row.sourceOriginalPosition=original.sourcePoint;else delete row.sourceOriginalPosition;
    this.originalPositions.delete(row);
  }
  displayPosition(row,mapping){
    if(!mapping||row.lon!==mapping.sourceOriginalPosition[0]||row.lat!==mapping.sourceOriginalPosition[1])return;
    this.originalPositions.set(row,{lon:row.lon,lat:row.lat,hadSourcePoint:Object.hasOwn(row,'sourceOriginalPosition'),sourcePoint:row.sourceOriginalPosition});
    row.sourceOriginalPosition=[...mapping.sourceOriginalPosition];[row.lon,row.lat]=mapping.displayPosition;
  }
  sourcePosition(station){
    const mapping=this.displayPositions.get(station.id),identity=station.sourceNativeIdentity;
    if(mapping&&station.source===mapping.source&&(!identity||['source','snapshotId','sourceStationId'].every(key=>identity[key]===mapping.nativeIdentity[key])))this.displayPosition(station,mapping);
  }
  canonicalPosition(station){
    const members=station.memberIds;if(!Array.isArray(members)||members.length!==1)return;
    const source=this.sourceStations.get(members[0]);if(!source||!this.originalPositions.has(source))return;
    this.displayPosition(station,this.displayPositions.get(source.id));
  }
  setDisplayPositions(positions){
    const changed=this.originalPositions.size>0;
    for(const row of this.originalPositions.keys())this.restorePosition(row);
    this.displayPositions=new Map(positions.map(row=>[row.id,row]));
    for(const row of this.sourceStations.values())this.sourcePosition(row);
    for(const row of this.canonicalStations.values())this.canonicalPosition(row);
    return changed||this.originalPositions.size>0;
  }
  addSource(station){
    // A spatial packet may arrive after the complete index. Preserve fields
    // omitted by that smaller packet, including its canonical correspondence.
    // Keep selected/search objects alive when reviewed positions or late rows
    // arrive; the immutable packet's source point remains separately retained.
    const row=this.sourceStations.get(station.id)||{};this.restorePosition(row);Object.assign(row,station);row._name=normalize(row.name);delete row._search;row._search=stationSearchText(row);this.sourceStations.set(row.id,row);this.sourcePosition(row);
    const canonical=this.canonicalStations.get(this.memberStations.get(row.id));if(canonical){this.restorePosition(canonical);this.canonicalPosition(canonical);}return row;
  }
  addCanonical(station){const row=this.canonicalStations.get(station.id)||{};this.restorePosition(row);const previous=stationMemberIds(row);Object.assign(row,station);row._name=normalize(row.name);delete row._search;row._search=stationSearchText(row);this.canonicalStations.set(row.id,row);for(const id of previous)if(this.memberStations.get(id)===row.id)this.memberStations.delete(id);for(const id of stationMemberIds(row))this.memberStations.set(id,row.id);this.canonicalPosition(row);return row;}
  resolve(id){const row=this.sourceStations.get(id);return this.canonicalStations.get(id)||this.canonicalStations.get(row?.canonicalId)||this.canonicalStations.get(this.memberStations.get(id))||row;}
  values(){return[...this.canonicalStations.values(),...[...this.sourceStations.values()].filter(row=>!this.canonicalStations.has(row.canonicalId)&&!this.canonicalStations.has(row.id))];}
}
