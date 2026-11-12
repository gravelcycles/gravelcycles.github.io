import{BUS_LIMITS,busMatches,intersects,validBusDocument}from'./bus-core.js?v=8eeddc2d0b1f1115';

export const BUS_LOCAL_ROUTING_LIMITS=Object.freeze({cells:6,wireBytes:3*1024*1024,decodedBytes:12*1024*1024});
const ENCODING='i32le-rows-packet-profile-identity-west-south-east-north',SCALE=100000;
const distance=(box,bounds)=>((box[0]+box[2]-bounds[0]-bounds[2])/2)**2+((box[1]+box[3]-bounds[1]-bounds[3])/2)**2;
const sizes=row=>Number.isSafeInteger(row?.bytes)&&row.bytes>0&&Number.isSafeInteger(row.uncompressedBytes)&&row.uncompressedBytes>0;
const invalid=()=>{throw new Error('Invalid native bus spatial routing index');};

// Routing metadata chooses existing native packets; it supplies no display
// geometry or passenger calls. Every request uses the existing shared pool.
export class BusLocalRouting{
  constructor(requests,metadataRequests,configuration,{limits=BUS_LIMITS,metadataLimits=BUS_LOCAL_ROUTING_LIMITS}={}){
    this.requests=requests;this.metadataRequests=metadataRequests;this.configuration=configuration;this.limits=limits;this.metadataLimits=metadataLimits;this.metadata=new WeakMap();
  }
  clear(){this.metadata=new WeakMap();}
  decode(document,manifest,known){
    let value=this.metadata.get(document);if(value)return value;
    const {packets,profiles,rowCount,rowsB64}=document;
    if(document.coordinateScale!==SCALE||document.rowEncoding!==ENCODING||!Array.isArray(packets)||packets.length>20000||!Array.isArray(profiles)||profiles.length>65536||!Number.isSafeInteger(rowCount)||rowCount<0||rowCount>500000||typeof rowsB64!=='string')invalid();
    for(const packet of packets)if(!known.has(packet.sourceId)||!sizes(packet)||!/^([a-f0-9]{64})$/.test(packet.sha256)||!packet.path?.startsWith('tiles/'+packet.sourceId+'/')||typeof packet.key!=='string')invalid();
    for(const profile of profiles)if(!known.has(profile.sourceId)||typeof profile.operator!=='string'||!Array.isArray(profile.countries)||profile.countries.some(c=>typeof c!=='string'||!c)||!Array.isArray(profile.dates)||profile.dates.length!==manifest.dates.length||profile.dates.some(v=>!Number.isSafeInteger(v)||v<0)||!Array.isArray(profile.estimatedDates)||profile.estimatedDates.length!==manifest.dates.length||profile.estimatedDates.some(v=>!Number.isFinite(v)||v<0))invalid();
    const raw=atob(rowsB64);if(raw.length!==rowCount*28)invalid();const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    let rows=new Int32Array(bytes.buffer);
    if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1){const view=new DataView(bytes.buffer);rows=Int32Array.from({length:raw.length/4},(_,i)=>view.getInt32(i*4,true));}
    for(let i=0;i<rows.length;i+=7){const p=rows[i],f=rows[i+1],id=rows[i+2],w=rows[i+3],s=rows[i+4],e=rows[i+5],n=rows[i+6];if(p<0||p>=packets.length||f<0||f>=profiles.length||id<0||id>=manifest.totals.patterns||profiles[f].sourceId!==packets[p].sourceId||w>e||s>n||w< -180*SCALE||e>180*SCALE||s< -85.052*SCALE||n>85.052*SCALE)invalid();}
    value={packets,profiles,rows};this.metadata.set(document,value);return value;
  }
  async plan(manifest,manifestSha,bounds,zoom,filters,{reader='viewport',check:outerCheck=()=>{}}={}){
    if(zoom<Math.max(manifest.minimumZoom||0,this.limits.minimumZoom))return{entries:[],limited:false};
    const epoch=this.requests.epochs.get(reader)||0,check=()=>{outerCheck();if(epoch!==(this.requests.epochs.get(reader)||0))throw new DOMException('Stale bus spatial routing request','AbortError');};
    if(manifestSha!==this.configuration.busManifestSha256)throw new Error('Bus spatial routing cohort mismatch');
    let wire=0,decoded=0;
    const reserve=row=>{if(!sizes(row))invalid();if(wire+row.bytes>Math.min(this.metadataLimits.wireBytes,this.limits.tileBytes)||decoded+row.uncompressedBytes>Math.min(this.metadataLimits.decodedBytes,this.limits.decodedTileBytes))return false;wire+=row.bytes;decoded+=row.uncompressedBytes;return true;};
    const load=async(desc,kind)=>{check();const value=validBusDocument(await this.metadataRequests.load(desc,{reader,limit:this.metadataLimits.wireBytes}),kind);check();if(value.busManifestSha256!==manifestSha)throw new Error('Bus spatial routing cohort mismatch');return value;};
    if(!reserve(this.configuration.catalogue))throw new Error('Bus spatial routing catalogue exceeds budget');
    const catalogue=await load(this.configuration.catalogue,'bus_atlas_local_routing_catalogue'),known=new Set(manifest.sources.map(s=>s.id));
    if(catalogue.routeCount!==manifest.totals.patterns||JSON.stringify(catalogue.dates)!==JSON.stringify(manifest.dates)||JSON.stringify(catalogue.sourceIds)!==JSON.stringify([...known].sort())||catalogue.zoom!==7||catalogue.coordinateScale!==SCALE||!Array.isArray(catalogue.regions)||catalogue.regions.some(r=>!sizes(r)||!Array.isArray(r.bbox)||r.bbox.length!==4||r.bbox.some(v=>!Number.isFinite(v))))invalid();
    const regions=catalogue.regions.filter(r=>intersects(r.bbox,bounds)).sort((a,b)=>distance(a.bbox,bounds)-distance(b.bbox,bounds)||a.key.localeCompare(b.key));
    const candidates=new Map(),quantized=[Math.floor(bounds[0]*SCALE),Math.floor(bounds[1]*SCALE),Math.ceil(bounds[2]*SCALE),Math.ceil(bounds[3]*SCALE)],cellKeys=[];
    let limited=regions.length>this.metadataLimits.cells;
    for(const descriptor of regions.slice(0,this.metadataLimits.cells)){
      if(!reserve(descriptor)){limited=true;continue;}
      const document=await load(descriptor,'bus_atlas_local_routing_cell');if(document.key!==descriptor.key)invalid();
      const{packets,profiles,rows}=this.decode(document,manifest,known),active=profiles.map(p=>busMatches(p,{...filters,cityBounds:null},manifest.dates));cellKeys.push(descriptor.key);
      for(let i=0;i<rows.length;i+=7){const p=rows[i],f=rows[i+1];if(!active[f]||rows[i+3]>quantized[2]||rows[i+5]<quantized[0]||rows[i+4]>quantized[3]||rows[i+6]<quantized[1])continue;
        const packet=packets[p],d=distance([rows[i+3]/SCALE,rows[i+4]/SCALE,rows[i+5]/SCALE,rows[i+6]/SCALE],bounds);let candidate=candidates.get(packet.path);
        if(!candidate){candidate={packet,ids:new Set(),distance:d};candidates.set(packet.path,candidate);}else if(candidate.packet.sha256!==packet.sha256||candidate.packet.bytes!==packet.bytes||candidate.packet.uncompressedBytes!==packet.uncompressedBytes||candidate.packet.sourceId!==packet.sourceId)invalid();
        candidate.ids.add(rows[i+2]);candidate.distance=Math.min(candidate.distance,d);
      }
    }
    check();const entries=[],covered=new Set(),remaining=[...candidates.values()];let nativeWire=0,nativeDecoded=0;
    while(entries.length<this.limits.tiles){
      let best=null,bestCount=0;
      for(const candidate of remaining){if(candidate.used)continue;const packet=candidate.packet;if(wire+nativeWire+packet.bytes>this.limits.tileBytes||decoded+nativeDecoded+packet.uncompressedBytes>this.limits.decodedTileBytes)continue;
        let count=0;for(const id of candidate.ids)if(!covered.has(id))count++;
        if(count>bestCount||count===bestCount&&count>0&&(candidate.distance<best.distance||candidate.distance===best.distance&&packet.key.localeCompare(best.packet.key)<0)){best=candidate;bestCount=count;}
      }
      if(!best)break;best.used=true;entries.push(best.packet);for(const id of best.ids)covered.add(id);nativeWire+=best.packet.bytes;nativeDecoded+=best.packet.uncompressedBytes;
    }
    if(remaining.some(c=>[...c.ids].some(id=>!covered.has(id))))limited=true;
    return{entries,limited,metadataBytes:wire,metadataDecodedBytes:decoded,routingCells:cellKeys,matchedNativeBounds:covered.size};
  }
}
