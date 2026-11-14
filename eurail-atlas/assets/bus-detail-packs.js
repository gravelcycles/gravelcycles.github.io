// Bounded detail packs (bus-detail-pack-v1). A route's original detail record
// is read from one pack selected by its source and id; the worker returns only
// that record. Packs reuse the shared BusRequests pool: same concurrency,
// cancellation, 48 MiB decoded cache and per-download hash/size checks.
export const BUS_DETAIL_PACK_LIMITS=Object.freeze({catalogueBytes:256*1024,sourceCatalogueBytes:128*1024,packBytes:512*1024,recordBytes:8*1024*1024});
const FORMAT='bus-detail-pack-v1',HEX=/^[a-f0-9]{64}$/,ID=/^[a-f0-9]{24}$/,DETAIL=/^details\/([a-z0-9_-]+)\/([a-f0-9]{2})\/([a-f0-9]{2})\/([a-f0-9]{24})\.json\.gz$/;
const COLUMNS='["id","offset","length","wireSha256","wireBytes"]';
export function parseDetailPath(path){const match=DETAIL.exec(String(path||''));if(!match||match[2]!==match[4].slice(0,2)||match[3]!==match[4].slice(2,4))return null;return{sourceId:match[1],id:match[4]};}
export function findPack(packs,id){let lo=0,hi=packs.length-1;while(lo<=hi){const mid=(lo+hi)>>1,pack=packs[mid];if(id<pack.first)hi=mid-1;else if(id>pack.last)lo=mid+1;else return pack;}return null;}
export class BusDetailPacks{
  constructor(requests,configuration){this.requests=requests;this.configuration=configuration;this.verified=new WeakSet();this.indexes=new WeakMap();}
  async catalogue(reader){
    const value=await this.requests.load(this.configuration.catalogue,{reader,limit:BUS_DETAIL_PACK_LIMITS.catalogueBytes});
    if(!this.verified.has(value)){if(value?.schemaVersion!==1||value.kind!=='bus_atlas_detail_pack_catalogue'||value.format!==FORMAT||value.busManifestSha256!==this.configuration.busManifestSha256||!Array.isArray(value.sources))throw new Error('Bus detail pack catalogue binding mismatch');this.verified.add(value);}
    return value;
  }
  // Large sources shard their pack list by the id's leading hex digit(s).
  async sourcePacks(sourceId,detailId,reader){
    const top=await this.catalogue(reader),row=top.sources.find(item=>item?.sourceId===sourceId);if(!row)return null;
    const k=row.shardPrefixLength;if(!Number.isSafeInteger(k)||k<0||k>4||!Array.isArray(row.shards))throw new Error('Bus detail pack shard mismatch');
    const prefix=detailId.slice(0,k),shard=row.shards.find(item=>item?.prefix===prefix);if(!shard)return null;
    if(shard.catalogue?.path!==(k?`sources/${sourceId}/catalogue-${prefix}.json.gz`:`sources/${sourceId}/catalogue.json.gz`))throw new Error('Bus detail pack source path mismatch');
    const table=await this.requests.load(shard.catalogue,{reader,limit:BUS_DETAIL_PACK_LIMITS.sourceCatalogueBytes});
    if(!this.verified.has(table)){
      if(table?.schemaVersion!==1||table.kind!=='bus_atlas_detail_pack_source'||table.format!==FORMAT||table.busManifestSha256!==this.configuration.busManifestSha256||table.sourceId!==sourceId||table.prefix!==prefix||!Array.isArray(table.packs)||!table.packs.length)throw new Error('Bus detail pack source binding mismatch');
      let previous='';for(const pack of table.packs){if(!ID.test(pack?.first||'')||!ID.test(pack?.last||'')||pack.first>pack.last||pack.first<=previous||pack.first.slice(0,k)!==prefix||pack.last.slice(0,k)!==prefix||pack.path!==`sources/${sourceId}/${pack.first}.pack.gz`||!HEX.test(pack.sha256||'')||!Number.isSafeInteger(pack.bytes)||pack.bytes<1||pack.bytes>BUS_DETAIL_PACK_LIMITS.packBytes||pack.encoding!=='gzip')throw new Error('Invalid bus detail pack range');previous=pack.last;}
      this.verified.add(table);
    }
    return table.packs;
  }
  async load(descriptor,{reader='detail',check=()=>{}}={}){
    const target=parseDetailPath(descriptor?.path);if(!target)throw new Error('Invalid bus detail path');
    if(!HEX.test(descriptor?.sha256||'')||!Number.isSafeInteger(descriptor?.bytes)||!Number.isSafeInteger(descriptor?.uncompressedBytes)||descriptor.uncompressedBytes>BUS_DETAIL_PACK_LIMITS.recordBytes)throw new Error('Packed bus detail requires its original checksum descriptor');
    const packs=await this.sourcePacks(target.sourceId,target.id,reader);check();const pack=packs&&findPack(packs,target.id);if(!pack)throw new Error('Bus detail is not in the pack set');
    const parsed=await this.requests.load(pack,{reader,limit:BUS_DETAIL_PACK_LIMITS.packBytes,format:'detail-pack'});check();
    let index=this.indexes.get(parsed);
    if(!index){
      const header=parsed.header;
      if(header?.schemaVersion!==1||header.kind!=='bus_atlas_detail_pack'||header.format!==FORMAT||header.busManifestSha256!==this.configuration.busManifestSha256||header.sourceId!==target.sourceId||JSON.stringify(header.recordColumns)!==COLUMNS||header.bodyBytes!==parsed.body.byteLength||!Array.isArray(header.records)||header.records.length!==pack.records)throw new Error('Bus detail pack header mismatch');
      index=new Map();let offset=0;for(const row of header.records){if(!Array.isArray(row)||row.length!==5||!ID.test(row[0])||row[1]!==offset||!Number.isSafeInteger(row[2])||row[2]<1||row[0]<pack.first||row[0]>pack.last)throw new Error('Bus detail pack record mismatch');index.set(row[0],row);offset+=row[2];}
      if(offset!==parsed.body.byteLength)throw new Error('Bus detail pack body mismatch');this.indexes.set(parsed,index);
    }
    const row=index.get(target.id);
    // Bind the record to the manifest-pinned original file descriptor.
    if(!row||row[3]!==descriptor.sha256||row[4]!==descriptor.bytes||row[2]!==descriptor.uncompressedBytes)throw new Error('Packed bus detail does not match its descriptor');
    const value=JSON.parse(new TextDecoder().decode(parsed.body.subarray(row[1],row[1]+row[2])));check();return value;
  }
}
