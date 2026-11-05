// Ordinary bus records have their own source namespace, dates and counters.
export const BUS_LIMITS=Object.freeze({minimumZoom:7,tiles:6,tileBytes:8*1024*1024,decodedTileBytes:24*1024*1024,routes:800,vertices:30000,stops:900,pickSegments:18000,cacheBytes:48*1024*1024,searchBytes:12*1024*1024});
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
// The source documents are immutable. Cache normalized text by object identity;
// the weak keys let eviction of a decoded packet release its search strings too.
let searchText=new WeakMap();
export function clearBusSearchCache(){searchText=new WeakMap();}
export function searchBusRoutes(routes,query,filters,dates,limit=40){
  const tokens=fold(query).trim().split(/\s+/).filter(Boolean),results=[];if(!tokens.length||limit<=0)return results;
  for(const route of routes){if(!busMatches(route,filters,dates))continue;let text=searchText.get(route);if(text===undefined){text=fold([route.label,route.operator,...route.countries||[],...route.stopNames||[]].join(' '));searchText.set(route,text);}if(tokens.every(t=>text.includes(t))){results.push(route);if(results.length>=limit)break;}}
  return results;
}
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
const aborted=()=>new DOMException('Stale bus request','AbortError');
export class BusRequests{
  constructor(base,{fetcher=globalThis.fetch,maximumBytes=BUS_LIMITS.cacheBytes,concurrency=3}={}){this.base=new URL(base);this.fetcher=fetcher.bind(globalThis);this.maximumBytes=maximumBytes;this.concurrency=Math.max(1,concurrency);this.cache=new Map();this.cacheBytes=0;this.flights=new Map();this.readers=new Map();this.queue=[];this.active=0;}
  cancel(reader){for(const call of [...this.readers.get(reader)||[]]){this.detach(call);call.reject(aborted());}}
  cancelAll(){for(const reader of [...this.readers.keys()])this.cancel(reader);this.cache.clear();this.cacheBytes=0;this.queue=[];}
  detach(call){const{flight,reader}=call;flight.calls.delete(call);const readers=this.readers.get(reader);readers?.delete(call);if(!readers?.size)this.readers.delete(reader);if(!flight.calls.size){if(this.flights.get(flight.flightKey)===flight)this.flights.delete(flight.flightKey);flight.controller.abort();}}
  validateSize(descriptor,wireBytes,bytes){if(Number.isInteger(descriptor?.bytes)&&descriptor.bytes!==wireBytes)throw new Error('Bus asset byte count mismatch');if(Number.isInteger(descriptor?.uncompressedBytes)&&descriptor.uncompressedBytes!==bytes)throw new Error('Bus decoded byte count mismatch');}
  pump(){while(this.active<this.concurrency&&this.queue.length){const flight=this.queue.shift();if(!flight.calls.size)continue;this.active++;this.read(flight).then(value=>this.settle(flight,null,value),error=>this.settle(flight,error)).finally(()=>{this.active--;this.pump();});}}
  settle(flight,error,value){if(this.flights.get(flight.flightKey)===flight)this.flights.delete(flight.flightKey);for(const call of [...flight.calls]){this.detach(call);if(error)call.reject(error);else call.resolve(value);}}
  async load(descriptor,{reader='viewport',limit=4*1024*1024}={}){
    const path=typeof descriptor==='string'?descriptor:descriptor?.path;if(typeof path!=='string'||!path)throw new Error('Invalid bus asset path');const url=new URL(path,this.base);
    if(url.origin!==this.base.origin||!url.pathname.startsWith(this.base.pathname)||url.username||url.password)throw new Error('Invalid bus asset path');
    if(descriptor?.bytes>limit)throw new Error('Bus asset exceeds download budget');
    const key=url.href+':'+(descriptor?.sha256||'');if(this.cache.has(key)){const entry=this.cache.get(key);if(entry.wireBytes>limit)throw new Error('Bus asset exceeds download budget');if(entry.bytes>Math.min(limit*8,48*1024*1024))throw new Error('Decoded bus asset exceeds memory budget');this.validateSize(descriptor,entry.wireBytes,entry.bytes);this.cache.delete(key);this.cache.set(key,entry);return entry.value;}
    // Independent readers share one immutable download. Cancelling a viewport
    // must not abort another reader inspecting the same source packet.
    const flightKey=key+':'+JSON.stringify([limit,descriptor?.bytes,descriptor?.uncompressedBytes,descriptor?.encoding]);let flight=this.flights.get(flightKey),created=false;
    if(!flight){created=true;flight={flightKey,key,url,descriptor,limit,controller:new AbortController(),calls:new Set()};this.flights.set(flightKey,flight);}
    const result=new Promise((resolve,reject)=>{const call={reader,flight,resolve,reject};flight.calls.add(call);if(!this.readers.has(reader))this.readers.set(reader,new Set());this.readers.get(reader).add(call);});
    if(created){this.queue.push(flight);this.pump();}return result;
  }
  async read(flight){
    const{url,descriptor,limit,controller,key}=flight;const check=()=>{if(controller.signal.aborted||!flight.calls.size)throw aborted();};check();
    const response=await this.fetcher(url.href,{signal:controller.signal,cache:'no-cache'});if(!response.ok)throw new Error('Bus data unavailable ('+response.status+')');
    if(Number(response.headers?.get('content-length'))>limit)throw new Error('Bus asset exceeds download budget');
    let buffer;if(response.body?.getReader){const stream=response.body.getReader(),chunks=[];let size=0;try{for(;;){const{done,value}=await stream.read();if(done)break;size+=value.byteLength;if(size>limit){await stream.cancel();throw new Error('Bus asset exceeds download budget');}chunks.push(value);}}finally{stream.releaseLock();}buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}}
    else{buffer=new Uint8Array(await response.arrayBuffer());if(buffer.byteLength>limit)throw new Error('Bus asset exceeds download budget');}
    check();
    if(Number.isInteger(descriptor?.bytes)&&descriptor.bytes!==buffer.byteLength)throw new Error('Bus asset byte count mismatch');
    const wireBytes=buffer.byteLength;
    if(descriptor?.sha256){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==descriptor.sha256)throw new Error('Bus asset checksum mismatch');}
    check();
    if(descriptor?.encoding==='gzip'||url.pathname.endsWith('.gz')){
      if(typeof DecompressionStream!=='function')throw new Error('This browser cannot decompress bus data');
      const stream=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[],abort=()=>{stream.cancel().catch(()=>{});};let size=0;controller.signal.addEventListener('abort',abort,{once:true});
      try{for(;;){const{done,value}=await stream.read();if(done)break;size+=value.byteLength;if(size>Math.min(limit*8,48*1024*1024)){await stream.cancel();throw new Error('Decoded bus asset exceeds memory budget');}chunks.push(value);}}finally{controller.signal.removeEventListener('abort',abort);stream.releaseLock();}
      buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
    }
    check();
    if(Number.isInteger(descriptor?.uncompressedBytes)&&descriptor.uncompressedBytes!==buffer.byteLength)throw new Error('Bus decoded byte count mismatch');
    const value=JSON.parse(new TextDecoder().decode(buffer));check();if(buffer.byteLength<=this.maximumBytes){this.cacheBytes-=this.cache.get(key)?.bytes||0;this.cache.delete(key);this.cache.set(key,{value,bytes:buffer.byteLength,wireBytes});this.cacheBytes+=buffer.byteLength;while(this.cacheBytes>this.maximumBytes){const first=this.cache.keys().next().value;this.cacheBytes-=this.cache.get(first).bytes;this.cache.delete(first);}}
    return value;
  }
}
