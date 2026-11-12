import{BUS_LIMITS,busMatches,foldBusText,intersects,searchBusRoutes,validBusDocument,viewportTiles}from'./bus-core.js?v=fce68094a07b4a25';

// Source indexes are admitted by the aggregate byte budgets, largest inventory first; `sources` is only a
// sanity bound on fan-out. A count cut by bbox-centre distance once excluded the dominant national source.
export const BUS_SEARCH_LIMITS=Object.freeze({sources:64,partitions:6,wireBytes:2*1024*1024,decodedBytes:12*1024*1024,catalogueBytes:1024*1024,indexBytes:1024*1024,packetBytes:512*1024});
const distance=(box,bounds)=>!box||!bounds?0:((box[0]+box[2]-bounds[0]-bounds[2])/2)**2+((box[1]+box[3]-bounds[1]-bounds[3])/2)**2;
const visible=(row,bounds)=>Array.isArray(row.bbox)&&intersects(row.bbox,bounds);
// Stopping patterns expected inside the map area if a row's patterns were spread evenly over its box.
// Search boxes are coarse region cells, so a source's own recorded extent (when the manifest has one)
// narrows them first. This routes the fixed packet budget; it never claims coverage or completeness.
const box4=box=>Array.isArray(box)&&box.length===4&&box.every(Number.isFinite);
export function busSearchRelevance(row,bounds,extent=null){
  let b=row?.bbox;const patterns=Number.isFinite(row?.patterns)&&row.patterns>0?row.patterns:1;
  if(!box4(b)||!box4(bounds))return 0;
  if(box4(extent)){const c=[Math.max(b[0],extent[0]),Math.max(b[1],extent[1]),Math.min(b[2],extent[2]),Math.min(b[3],extent[3])];if(c[0]<=c[2]&&c[1]<=c[3])b=c;}
  const w=Math.min(b[2],bounds[2])-Math.max(b[0],bounds[0]),h=Math.min(b[3],bounds[3])-Math.max(b[1],bounds[1]);
  if(w<0||h<0)return 0;
  const area=(b[2]-b[0])*(b[3]-b[1]);
  return patterns*(area>0?Math.min(1,w*h/area):1);
}
// Spend a fixed number of packets across sources in proportion to each source's expected in-view patterns
// (highest averages), best-overlapping packet first within a source. `admit` applies the byte budgets.
export function apportionBusPartitions(candidates,bounds,seats,admit=()=>true,extentOf=()=>null){
  const bySource=new Map(),order=(a,b)=>b.relevance-a.relevance||distance(a.row.bbox,bounds)-distance(b.row.bbox,bounds)||a.row.key.localeCompare(b.row.key);
  for(const row of candidates){
    let group=bySource.get(row.sourceId);if(!group){group={sourceId:row.sourceId,rows:[],weight:0,taken:0};bySource.set(row.sourceId,group);}
    const relevance=busSearchRelevance(row,bounds,extentOf(row));group.rows.push({row,relevance});group.weight+=relevance;
  }
  const groups=[...bySource.values()];for(const group of groups)group.rows.sort(order);
  const selected=[];let refused=false;
  while(selected.length<seats){
    // The last packet goes to the best source not yet read, so one dense source cannot hide every other.
    const fresh=seats>1&&selected.length===seats-1&&groups.some(group=>group.rows.length&&!group.taken);let best=null;
    for(const group of groups){
      if(!group.rows.length||(fresh&&group.taken))continue;
      const value=group.weight/(group.taken+1);
      if(!best||value>best.value||(value===best.value&&order(group.rows[0],best.group.rows[0])<0))best={group,value};
    }
    if(!best)break;
    const{row}=best.group.rows.shift();
    if(!admit(row)){refused=true;continue;}
    best.group.taken++;selected.push(row);
  }
  return{selected,limited:refused||groups.some(group=>group.rows.length>0)};
}
function budget(limits){return{wire:0,decoded:0,add(row){if(!Number.isSafeInteger(row?.bytes)||row.bytes<1||!Number.isSafeInteger(row?.uncompressedBytes)||row.uncompressedBytes<1)throw new Error('Missing bounded bus packet sizes');if(this.wire+row.bytes>limits.wireBytes||this.decoded+row.uncompressedBytes>limits.decodedBytes)return false;this.wire+=row.bytes;this.decoded+=row.uncompressedBytes;return true;}};}

// A cancelled multi-stage operation must not start a later index/packet fetch.
function readerScope(requests,reader){const epoch=requests.epochs?.get(reader)||0,check=()=>{if(epoch!==(requests.epochs?.get(reader)||0))throw new DOMException('Stale bus operation','AbortError');};return{check,load:async(descriptor,options)=>{check();const value=await requests.load(descriptor,{...options,reader});check();return value;}};}

export function busBloomQuery(text){const grams=new Set(),positions=new Set();for(const token of foldBusText(text).trim().split(/\s+/)){const points=[...token],n=points.length>=3?3:2;for(let i=0;i<=points.length-n;i++)grams.add(points.slice(i,i+n).join(''));}for(const gram of grams){const bytes=new TextEncoder().encode(gram);for(const seed of[2166136261,0x9e3779b9,0x85ebca6b]){let hash=seed;for(const byte of bytes)hash=Math.imul(hash^byte,16777619)>>>0;positions.add(hash%16384);}}return[...positions];}
export function busBloomMayMatch(bloom,positions){if(!bloom||bloom.version!==1||bloom.algorithm!=='fnv1a-utf8-2or3gram')return true;if(bloom.bits!==16384)throw new Error('Unsupported bus search routing bitmap');const raw=atob(bloom.data);if(raw.length!==2048)throw new Error('Invalid bus search routing bitmap');return positions.every(i=>raw.charCodeAt(i>>3)&(1<<(i&7)));}

export class BusSearch{
  constructor(requests,manifest,{limits=BUS_SEARCH_LIMITS}={}){this.requests=requests;this.manifest=manifest;this.limits=limits;this.catalogue=null;}
  async catalogueFor(reader='search',load=(d,o)=>this.requests.load(d,{...o,reader})){
    if(this.catalogue)return this.catalogue;
    const value=validBusDocument(await load(this.manifest.search.catalogue,{limit:this.limits.catalogueBytes}),'bus_atlas_search_catalogue');
    const ids=new Set(this.manifest.sources.map(s=>s.id));
    if(!Array.isArray(value.sources)||value.sources.length!==ids.size||value.sources.some(s=>!ids.delete(s.sourceId))||ids.size||value.totalPatterns!==this.manifest.totals.patterns)throw new Error('Bus search source inventory mismatch');
    this.catalogue=value;return value;
  }
  async findRoute(id,{reader='detail-index'}={}){
    const{load,check}=readerScope(this.requests,reader);
    if(this.manifest.search.kind!=='partitioned'){
      const document=validBusDocument(await load(this.manifest.search,{reader,limit:BUS_LIMITS.searchBytes}),'bus_atlas_search');
      return document.routes?.find(r=>r.id===id)||null;
    }
    const match=/^([a-z0-9_-]+):([a-f0-9]{24})$/.exec(id);if(!match)return null;
    const catalogue=await this.catalogueFor(reader,load);check();const source=catalogue.sources.find(s=>s.sourceId===match[1]);if(!source)return null;
    const index=validBusDocument(await load(source.index,{reader,limit:this.limits.indexBytes}),'bus_atlas_source_search');
    if(index.sourceId!==source.sourceId)throw new Error('Bus search source mismatch');
    const lookups=(index.lookups||[]).filter(p=>/^[a-f0-9]{2,24}$/.test(p.prefix)&&match[2].startsWith(p.prefix));
    if(lookups.length>1)throw new Error('Ambiguous bus route lookup');if(!lookups.length)return null;
    const packet=validBusDocument(await load(lookups[0],{reader,limit:this.limits.packetBytes}),'bus_atlas_route_lookup');
    if(packet.sourceId!==source.sourceId||!Array.isArray(packet.routes)||packet.routes.length>512)throw new Error('Invalid bus route lookup');
    return packet.routes.find(r=>r.id===id&&r.sourceId===source.sourceId)||null;
  }
  // `adjust` maps a published row to the row to show, or null to leave it out (a trip shown by another source).
  async query(text,{filters,dates,bounds,scope='area',country='',reader='search',adjust=null}={}){
    const{load,check}=readerScope(this.requests,reader);
    if(this.manifest.search.kind!=='partitioned'){
      const document=validBusDocument(await load(this.manifest.search,{reader,limit:BUS_LIMITS.searchBytes}),'bus_atlas_search');
      const rows=searchBusRoutes(adjust?(document.routes||[]).map(adjust).filter(Boolean):document.routes||[],text,filters,dates,41);return{rows,limited:rows.length>40,scope:'published cohort',loadedPartitions:1,availablePartitions:1};
    }
    if((scope==='source'&&!filters.source)||(scope==='country'&&!country))return{rows:[],needsScope:true,limited:false};
    if(!['area','source','country'].includes(scope))throw new Error('Choose a bounded bus search area');
    const catalogue=await this.catalogueFor(reader,load);check();const quota=budget(this.limits),terms=busBloomQuery(text);
    if(!quota.add(this.manifest.search.catalogue))throw new Error('Bus search catalogue exceeds aggregate budget');
    // Every source whose recorded extent meets the map area is eligible; catalogue boxes alone are whole
    // region cells. Indexes load largest inventory first and must leave room for the packets themselves.
    const extents=new Map((this.manifest.sources||[]).map(s=>[s.id,box4(s.bbox)?s.bbox:null])),extentOf=row=>extents.get(row.sourceId)||null;
    const sources=catalogue.sources.filter(s=>(!filters.source||s.sourceId===filters.source)&&(scope!=='country'||s.countries?.includes(country))&&(scope!=='area'||(visible(s,bounds)&&(!extentOf(s)||intersects(extentOf(s),bounds)))))
      .sort((a,b)=>(b.patterns||0)-(a.patterns||0)||distance(a.bbox,bounds)-distance(b.bbox,bounds)||a.sourceId.localeCompare(b.sourceId));
    const reserve=Math.min(this.limits.packetBytes,this.limits.wireBytes/4);
    let limited=sources.length>this.limits.sources,searchedSources=0;const candidates=[];
    for(const source of sources.slice(0,this.limits.sources)){
      if(quota.wire+(source.index?.bytes||0)>this.limits.wireBytes-reserve||!quota.add(source.index)){limited=true;continue;}
      const index=validBusDocument(await load(source.index,{reader,limit:this.limits.indexBytes}),'bus_atlas_source_search');
      if(index.sourceId!==source.sourceId)throw new Error('Bus search source mismatch');
      searchedSources++;
      for(const partition of index.partitions||[]){if(!busBloomMayMatch(partition.termBloom,terms))continue;if(scope==='area'&&!visible(partition,bounds))continue;if(scope==='country'&&!partition.countries?.includes(country))continue;candidates.push({...partition,sourceId:source.sourceId});}
    }
    const apportioned=apportionBusPartitions(candidates,bounds,this.limits.partitions,partition=>quota.add(partition),extentOf),selected=apportioned.selected;
    if(apportioned.limited)limited=true;
    const found=[],seen=new Set();
    for(let offset=0;offset<selected.length;offset+=2){
      const pages=await Promise.all(selected.slice(offset,offset+2).map(async descriptor=>{
        const page=validBusDocument(await load(descriptor,{reader,limit:this.limits.packetBytes}),'bus_atlas_search');
        if(page.sourceId!==descriptor.sourceId||!Array.isArray(page.routes)||page.routes.length>512)throw new Error('Invalid bounded bus search packet');
        return page;
      }));
      for(const page of pages)for(const row of page.routes){if(row.sourceId!==page.sourceId||seen.has(row.id))continue;seen.add(row.id);if(scope==='area'&&!visible(row,bounds))continue;if(scope==='country'&&!row.countries?.includes(country))continue;const kept=adjust?adjust(row):row;if(kept)found.push(kept);}
    }
    const rows=searchBusRoutes(found,text,filters,dates,41);
    // Say how much was read: a bounded search that found nothing has not established that nothing runs.
    const area=scope==='area'?'this map area':scope==='source'?'the selected source':country,partial=selected.length<candidates.length||searchedSources<sources.length;
    return{rows,limited:limited||rows.length>40,scope:partial?`${area} (${selected.length} of ${candidates.length} candidate packets from ${searchedSources} of ${sources.length} sources searched; more matches may exist)`:area,
      area,partial,loadedPartitions:selected.length,availablePartitions:candidates.length,sourceCount:searchedSources,availableSources:sources.length,
      searchedPatterns:selected.reduce((n,row)=>n+(row.patterns||0),0),candidatePatterns:candidates.reduce((n,row)=>n+(row.patterns||0),0),wireBytes:quota.wire,decodedBytes:quota.decoded};
  }
}

export class BusTileIndex{
  constructor(requests,manifest,{limits=BUS_LIMITS}={}){this.requests=requests;this.manifest=manifest;this.limits=limits;this.catalogue=null;}
  async plan(bounds,zoom,filters={},{reader='viewport'}={}){
    const{load,check}=readerScope(this.requests,reader);
    if(zoom<Math.max(this.manifest.minimumZoom||0,this.limits.minimumZoom))return{entries:[],limited:false};
    if(this.manifest.tiles?.kind!=='partitioned')return viewportTiles(this.manifest,bounds,zoom,this.limits,filters);
    const descriptor=this.manifest.tiles.catalogue;
    if(!this.catalogue)this.catalogue=validBusDocument(await load(descriptor,{reader,limit:1024*1024}),'bus_atlas_tile_catalogue');
    check();const known=new Set(this.manifest.sources.map(s=>s.id));if(!Array.isArray(this.catalogue.regions)||this.catalogue.regions.some(r=>!known.has(r.sourceId)))throw new Error('Bus map source inventory mismatch');
    const regions=(this.catalogue.regions||[]).filter(r=>(!filters.source||r.sourceId===filters.source)&&visible(r,bounds))
      .sort((a,b)=>distance(a.bbox,bounds)-distance(b.bbox,bounds)||a.key.localeCompare(b.key));
    const quota=budget({wireBytes:this.limits.tileBytes,decodedBytes:this.limits.decodedTileBytes});
    if(!quota.add(descriptor))throw new Error('Bus map catalogue exceeds aggregate budget');
    const entries=[];let limited=regions.length>this.limits.tiles;
    for(const region of regions.slice(0,this.limits.tiles)){
      if(!quota.add(region.index)){limited=true;continue;}
      const index=validBusDocument(await load(region.index,{reader,limit:512*1024}),'bus_atlas_tile_region');
      if(index.sourceId!==region.sourceId||!Array.isArray(index.entries)||index.entries.some(e=>e.sourceId!==region.sourceId||!Number.isSafeInteger(e.bytes)||e.bytes<1||!Number.isSafeInteger(e.uncompressedBytes)||e.uncompressedBytes<1))throw new Error('Bus map source mismatch or unbounded packet');
      entries.push(...(index.entries||[]));
    }
    const plan=viewportTiles({...this.manifest,tiles:{entries}},bounds,zoom,{...this.limits,tileBytes:this.limits.tileBytes-quota.wire,decodedTileBytes:this.limits.decodedTileBytes-quota.decoded},filters);
    return{...plan,limited:limited||plan.limited,metadataBytes:quota.wire};
  }
}
