// Ordinary bus records have their own source namespace, dates and counters.
export const BUS_LIMITS=Object.freeze({minimumZoom:7,tiles:6,tileBytes:8*1024*1024,decodedTileBytes:24*1024*1024,routes:800,vertices:30000,stops:900,pickSegments:18000,cacheBytes:12*1024*1024,searchBytes:12*1024*1024});
export function intersects(a,b){return Array.isArray(a)&&a.length===4&&a.every(Number.isFinite)&&a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
export function busCount(route,day,dates){const i=dates.indexOf(day);return day==='all'?(route.dates||[]).reduce((n,v)=>n+(Number(v)||0),0):i<0?0:Number(route.dates?.[i])||0;}
export function busEstimate(route,day,dates){return busCount({dates:route.estimatedDates},day,dates);}
export function busMatches(route,filters,dates){return(!filters.source||route.sourceId===filters.source)&&(!filters.operator||route.operator===filters.operator)&&(busCount(route,filters.day,dates)>0||busEstimate(route,filters.day,dates)>0);}
export function viewportTiles(manifest,bounds,zoom,limits=BUS_LIMITS){
  if(zoom<Math.max(manifest.minimumZoom||0,limits.minimumZoom))return{entries:[],limited:false};
  const center=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2],distance=e=>{const b=e.bbox;return((b[0]+b[2])/2-center[0])**2+((b[1]+b[3])/2-center[1])**2;};
  const rows=(manifest.tiles?.entries||[]).filter(e=>intersects(e.bbox,bounds)).sort((a,b)=>distance(a)-distance(b)||a.key.localeCompare(b.key));
  const entries=[];let bytes=0,decodedBytes=0;for(const row of rows){if(entries.length>=limits.tiles||bytes+(row.bytes||0)>limits.tileBytes||decodedBytes+(row.uncompressedBytes||0)>limits.decodedTileBytes)continue;entries.push(row);bytes+=row.bytes||0;decodedBytes+=row.uncompressedBytes||0;}
  return{entries,limited:rows.length>entries.length};
}
const fold=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
export function searchBusRoutes(routes,query,filters,dates,limit=40){const tokens=fold(query).trim().split(/\s+/).filter(Boolean);if(!tokens.length)return[];return routes.filter(route=>busMatches(route,filters,dates)&&tokens.every(t=>fold([route.label,route.operator,...route.countries||[],...route.stopNames||[]].join(' ')).includes(t))).slice(0,limit);}
export function boundedRoutes(routes,filters,dates,limits=BUS_LIMITS){
  const kept=[],seen=new Set();let vertices=0,limited=false;
  for(const route of routes){if(seen.has(route.id)||!busMatches(route,filters,dates))continue;seen.add(route.id);const n=route.coordinates?.length||0;if(n<2)continue;if(kept.length>=limits.routes||vertices+n>limits.vertices){limited=true;continue;}vertices+=n;kept.push(route);}
  return{routes:kept,vertices,limited};
}
export function activeBusTrips(detail,day){return(detail.trips||[]).filter(trip=>day==='all'||trip.serviceDates?.includes(day));}
export function busTripClock(detail,trip,index){if(!trip)return{};if(trip.calls)return trip.calls[index]||{};const row=detail.clockProfiles?.[trip.clockProfile]?.[index];if(!Array.isArray(row))return{};const relative=detail.clockProfileBasis==='relative_to_trip_clockStartSeconds',base=trip.clockStartSeconds,seconds=value=>Number.isFinite(value)?relative?(Number.isFinite(base)?value+base:null):value:null;return{arrivalSeconds:seconds(row[0]),departureSeconds:seconds(row[1]),timepoint:row[2]};}
export function permissionText(value,action){return({0:`${action} allowed`,1:`No ${action.toLowerCase()}`,2:`Arrange ${action.toLowerCase()} by phone`,3:`Arrange ${action.toLowerCase()} with driver`})[value]||`${action} permission unknown`;}
export function displayClock(clock,seconds){if(typeof clock==='string'&&/^\d{1,3}:\d\d(?::\d\d)?$/.test(clock)){const [h,m]=clock.split(':').map(Number);return`${String(h%24).padStart(2,'0')}:${String(m).padStart(2,'0')}${h>=24?' +'+Math.floor(h/24)+'d':''}`;}if(Number.isFinite(seconds)){const h=Math.floor(seconds/3600);return`${String(h%24).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}${h>=24?' +'+Math.floor(h/24)+'d':''}`;}return'—';}
export function validBusDocument(value,kind){if(value?.schemaVersion!==1||value.kind!==kind)throw new Error('Unsupported bus data format');return value;}
export class BusRequests{
  constructor(base,{fetcher=globalThis.fetch,maximumBytes=BUS_LIMITS.cacheBytes}={}){this.base=new URL(base);this.fetcher=fetcher.bind(globalThis);this.maximumBytes=maximumBytes;this.cache=new Map();this.cacheBytes=0;this.controllers=new Map();this.epochs=new Map();}
  cancel(reader){this.epochs.set(reader,(this.epochs.get(reader)||0)+1);this.controllers.get(reader)?.abort();this.controllers.delete(reader);}
  cancelAll(){for(const reader of new Set([...this.epochs.keys(),...this.controllers.keys()]))this.cancel(reader);this.cache.clear();this.cacheBytes=0;}
  async load(descriptor,{reader='viewport',limit=4*1024*1024}={}){
    const path=typeof descriptor==='string'?descriptor:descriptor?.path,url=new URL(path,this.base);
    if(url.origin!==this.base.origin||!url.pathname.startsWith(this.base.pathname)||url.username||url.password)throw new Error('Invalid bus asset path');
    if(descriptor?.bytes>limit)throw new Error('Bus asset exceeds download budget');
    const key=url.href+':'+(descriptor?.sha256||'');if(this.cache.has(key)){const entry=this.cache.get(key);if(Number.isInteger(descriptor?.bytes)&&descriptor.bytes!==entry.wireBytes)throw new Error('Bus asset byte count mismatch');if(Number.isInteger(descriptor?.uncompressedBytes)&&descriptor.uncompressedBytes!==entry.bytes)throw new Error('Bus decoded byte count mismatch');this.cache.delete(key);this.cache.set(key,entry);return entry.value;}
    const epoch=this.epochs.get(reader)||0,controller=this.controllers.get(reader)||new AbortController();this.controllers.set(reader,controller);
    const response=await this.fetcher(url.href,{signal:controller.signal,cache:'no-cache'});if(!response.ok)throw new Error('Bus data unavailable ('+response.status+')');
    if(Number(response.headers?.get('content-length'))>limit)throw new Error('Bus asset exceeds download budget');
    let buffer;if(response.body?.getReader){const stream=response.body.getReader(),chunks=[];let size=0;try{for(;;){const{done,value}=await stream.read();if(done)break;size+=value.byteLength;if(size>limit){await stream.cancel();throw new Error('Bus asset exceeds download budget');}chunks.push(value);}}finally{stream.releaseLock();}buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}}
    else{buffer=new Uint8Array(await response.arrayBuffer());if(buffer.byteLength>limit)throw new Error('Bus asset exceeds download budget');}
    if(controller.signal.aborted||epoch!==(this.epochs.get(reader)||0))throw new DOMException('Stale bus request','AbortError');
    if(Number.isInteger(descriptor?.bytes)&&descriptor.bytes!==buffer.byteLength)throw new Error('Bus asset byte count mismatch');
    const wireBytes=buffer.byteLength;
    if(descriptor?.sha256){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==descriptor.sha256)throw new Error('Bus asset checksum mismatch');}
    if(controller.signal.aborted||epoch!==(this.epochs.get(reader)||0))throw new DOMException('Stale bus request','AbortError');
    if(descriptor?.encoding==='gzip'||url.pathname.endsWith('.gz')){
      if(typeof DecompressionStream!=='function')throw new Error('This browser cannot decompress bus data');
      const stream=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[],abort=()=>{stream.cancel().catch(()=>{});};let size=0;controller.signal.addEventListener('abort',abort,{once:true});
      try{for(;;){const{done,value}=await stream.read();if(done)break;size+=value.byteLength;if(size>Math.min(limit*8,48*1024*1024)){await stream.cancel();throw new Error('Decoded bus asset exceeds memory budget');}chunks.push(value);}}finally{controller.signal.removeEventListener('abort',abort);stream.releaseLock();}
      buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
    }
    if(controller.signal.aborted||epoch!==(this.epochs.get(reader)||0))throw new DOMException('Stale bus request','AbortError');
    if(Number.isInteger(descriptor?.uncompressedBytes)&&descriptor.uncompressedBytes!==buffer.byteLength)throw new Error('Bus decoded byte count mismatch');
    const value=JSON.parse(new TextDecoder().decode(buffer));if(buffer.byteLength<=this.maximumBytes){this.cacheBytes-=this.cache.get(key)?.bytes||0;this.cache.set(key,{value,bytes:buffer.byteLength,wireBytes});this.cacheBytes+=buffer.byteLength;while(this.cacheBytes>this.maximumBytes){const first=this.cache.keys().next().value;this.cacheBytes-=this.cache.get(first).bytes;this.cache.delete(first);}}
    return value;
  }
}
