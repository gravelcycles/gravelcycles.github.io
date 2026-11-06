import{BUS_LIMITS,busMatches,foldBusText,intersects,searchBusRoutes,validBusDocument,viewportTiles}from'./bus-core.js?v=2b8acad8c5d626c4';

export const BUS_SEARCH_LIMITS=Object.freeze({sources:4,partitions:6,wireBytes:2*1024*1024,decodedBytes:12*1024*1024,catalogueBytes:1024*1024,indexBytes:1024*1024,packetBytes:512*1024});
const distance=(box,bounds)=>!box||!bounds?0:((box[0]+box[2]-bounds[0]-bounds[2])/2)**2+((box[1]+box[3]-bounds[1]-bounds[3])/2)**2;
const visible=(row,bounds)=>Array.isArray(row.bbox)&&intersects(row.bbox,bounds);
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
  async query(text,{filters,dates,bounds,scope='area',country='',reader='search'}={}){
    const{load,check}=readerScope(this.requests,reader);
    if(this.manifest.search.kind!=='partitioned'){
      const document=validBusDocument(await load(this.manifest.search,{reader,limit:BUS_LIMITS.searchBytes}),'bus_atlas_search');
      const rows=searchBusRoutes(document.routes||[],text,filters,dates,41);return{rows,limited:rows.length>40,scope:'published cohort',loadedPartitions:1,availablePartitions:1};
    }
    if((scope==='source'&&!filters.source)||(scope==='country'&&!country))return{rows:[],needsScope:true,limited:false};
    if(!['area','source','country'].includes(scope))throw new Error('Choose a bounded bus search area');
    const catalogue=await this.catalogueFor(reader,load);check();const quota=budget(this.limits),terms=busBloomQuery(text);
    if(!quota.add(this.manifest.search.catalogue))throw new Error('Bus search catalogue exceeds aggregate budget');
    const sources=catalogue.sources.filter(s=>(!filters.source||s.sourceId===filters.source)&&(scope!=='country'||s.countries?.includes(country))&&(scope!=='area'||visible(s,bounds)))
      .sort((a,b)=>distance(a.bbox,bounds)-distance(b.bbox,bounds)||a.sourceId.localeCompare(b.sourceId));
    let limited=sources.length>this.limits.sources;const candidates=[];
    for(const source of sources.slice(0,this.limits.sources)){
      if(!quota.add(source.index)){limited=true;continue;}
      const index=validBusDocument(await load(source.index,{reader,limit:this.limits.indexBytes}),'bus_atlas_source_search');
      if(index.sourceId!==source.sourceId)throw new Error('Bus search source mismatch');
      for(const partition of index.partitions||[]){if(!busBloomMayMatch(partition.termBloom,terms))continue;if(scope==='area'&&!visible(partition,bounds))continue;if(scope==='country'&&!partition.countries?.includes(country))continue;candidates.push({...partition,sourceId:source.sourceId});}
    }
    candidates.sort((a,b)=>distance(a.bbox,bounds)-distance(b.bbox,bounds)||a.key.localeCompare(b.key));
    const selected=[];for(const partition of candidates){if(selected.length>=this.limits.partitions||!quota.add(partition)){limited=true;continue;}selected.push(partition);}
    const found=[],seen=new Set();
    for(let offset=0;offset<selected.length;offset+=2){
      const pages=await Promise.all(selected.slice(offset,offset+2).map(async descriptor=>{
        const page=validBusDocument(await load(descriptor,{reader,limit:this.limits.packetBytes}),'bus_atlas_search');
        if(page.sourceId!==descriptor.sourceId||!Array.isArray(page.routes)||page.routes.length>512)throw new Error('Invalid bounded bus search packet');
        return page;
      }));
      for(const page of pages)for(const row of page.routes){if(row.sourceId!==page.sourceId||seen.has(row.id))continue;seen.add(row.id);if(scope==='area'&&!visible(row,bounds))continue;if(scope==='country'&&!row.countries?.includes(country))continue;found.push(row);}
    }
    const rows=searchBusRoutes(found,text,filters,dates,41);
    return{rows,limited:limited||rows.length>40,scope:scope==='area'?'this map area':scope==='source'?'the selected source':country,
      loadedPartitions:selected.length,availablePartitions:candidates.length,sourceCount:Math.min(sources.length,this.limits.sources),wireBytes:quota.wire,decodedBytes:quota.decoded};
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
