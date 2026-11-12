import{safeBusBase}from'./bus-delivery.js?v=1db9ee4e69a277e5';
// Ordinary bus records have their own source namespace, dates and counters.
export const BUS_LIMITS=Object.freeze({minimumZoom:7,tiles:6,tileBytes:8*1024*1024,decodedTileBytes:24*1024*1024,routes:800,vertices:30000,stops:900,pickSegments:18000,cacheBytes:48*1024*1024,searchBytes:12*1024*1024});
export const BUS_OVERVIEW_LIMITS=Object.freeze({routes:12000,vertices:250000,bytes:2*1024*1024,decodedBytes:16*1024*1024});
export function intersects(a,b){return Array.isArray(a)&&a.length===4&&a.every(Number.isFinite)&&a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
// Geographic city-area focus uses retained display paths, not invented calls.
export function busRouteInArea(route,box){
  if(!intersects(route.bbox,box))return false;
  const coords=route.coordinates;if(!Array.isArray(coords)||coords.length<2)return true;
  for(let i=1;i<coords.length;i++){
    const a=coords[i-1],b=coords[i],dx=b[0]-a[0],dy=b[1]-a[1];let low=0,high=1,hit=true;
    for(const[p,q]of[[-dx,a[0]-box[0]],[dx,box[2]-a[0]],[-dy,a[1]-box[1]],[dy,box[3]-a[1]]]){
      if(p===0){if(q<0){hit=false;break;}}else{const t=q/p;if(p<0)low=Math.max(low,t);else high=Math.min(high,t);if(low>high){hit=false;break;}}
    }
    if(hit)return true;
  }
  return false;
}
export function busCount(route,day,dates){const i=dates.indexOf(day);return day==='all'?(route.dates||[]).reduce((n,v)=>n+(Number(v)||0),0):i<0?0:Number(route.dates?.[i])||0;}
export function busEstimate(route,day,dates){return busCount({dates:route.estimatedDates},day,dates);}
export function busMatches(route,filters,dates){return(!filters.source||route.sourceId===filters.source)&&(!filters.operator||route.operator===filters.operator)&&(!filters.country||route.countries?.includes(filters.country))&&(!filters.international||route.countries?.length>1)&&(!filters.mode||(filters.mode==='coach')===(route.mode==='coach'))&&(!filters.cityBounds||busRouteInArea(route,filters.cityBounds))&&(busCount(route,filters.day,dates)>0||busEstimate(route,filters.day,dates)>0);}
export function viewportTiles(manifest,bounds,zoom,limits=BUS_LIMITS,filters={}){
  if(zoom<Math.max(manifest.minimumZoom||0,limits.minimumZoom))return{entries:[],limited:false};
  const center=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2],distance=e=>{const b=e.bbox;return((b[0]+b[2])/2-center[0])**2+((b[1]+b[3])/2-center[1])**2;};
  const rows=(manifest.tiles?.entries||[]).filter(e=>(!filters.source||!e.sourceId||e.sourceId===filters.source)&&intersects(e.bbox,bounds)).sort((a,b)=>distance(a)-distance(b)||a.key.localeCompare(b.key));
  const entries=[];let bytes=0,decodedBytes=0;for(const row of rows){if(entries.length>=limits.tiles||bytes+(row.bytes||0)>limits.tileBytes||decodedBytes+(row.uncompressedBytes||0)>limits.decodedTileBytes)continue;entries.push(row);bytes+=row.bytes||0;decodedBytes+=row.uncompressedBytes||0;}
  return{entries,limited:rows.length>entries.length};
}
export const foldBusText=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const fold=foldBusText;
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
export function busQualityNote(source){
  const holds=source?.qualityHolds,trips=holds?.tripTemplates,dates=holds?.tripServiceDates;
  if(!Number.isSafeInteger(trips)||trips<1||!Number.isSafeInteger(dates)||dates<0)return'';
  return`${trips.toLocaleString()} timetable ${trips===1?'journey':'journeys'} omitted (${dates.toLocaleString()} dated timetable ${dates===1?'entry':'entries'}). Some stops or times are unavailable or inconsistent.`;
}
export function busBoardingScopeNote(source){
  const excluded=source?.boardingScopeExclusions,trips=excluded?.tripTemplates,dates=excluded?.tripServiceDates;
  if(excluded?.reason!=='students_only'||excluded?.status!=='excluded_authority_nonpublic'||!Number.isSafeInteger(trips)||trips<1||!Number.isSafeInteger(dates)||dates<0)return'';
  const retained=excluded.publicExceptionsRetained,publicTrips=retained?.tripTemplates,publicDates=retained?.tripServiceDates;
  const publicSchools=Number.isSafeInteger(publicTrips)&&publicTrips>0&&Number.isSafeInteger(publicDates)&&publicDates>=0;
  return`The public bus layer excludes ${trips.toLocaleString()} timetable ${trips===1?'journey':'journeys'} restricted to students (${dates.toLocaleString()} dated timetable ${dates===1?'entry':'entries'}) from this source.${publicSchools?' Recorded school services open to the public remain included.':''}`;
}
export function displayClock(clock,seconds){if(typeof clock==='string'&&/^\d{1,3}:\d\d(?::\d\d)?$/.test(clock)){const [h,m]=clock.split(':').map(Number);return`${String(h%24).padStart(2,'0')}:${String(m).padStart(2,'0')}${h>=24?' +'+Math.floor(h/24)+'d':''}`;}if(Number.isFinite(seconds)){const h=Math.floor(seconds/3600);return`${String(h%24).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}${h>=24?' +'+Math.floor(h/24)+'d':''}`;}return'—';}
export function validBusDocument(value,kind){if(value?.schemaVersion!==1||value.kind!==kind)throw new Error('Unsupported bus data format');return value;}
const aborted=()=>new DOMException('Stale bus request','AbortError');
export class BusRequests{
  constructor(base,{fetcher=globalThis.fetch,maximumBytes=BUS_LIMITS.cacheBytes,concurrency=3,requireHashes=false,detailsBaseUrl=null,sharedPool=null}={}){this.base=new URL(base);this.detailsBase=detailsBaseUrl===null?null:safeBusBase(detailsBaseUrl);this.requireHashes=requireHashes||this.detailsBase!==null;this.fetcher=fetcher.bind(globalThis);this.pool=sharedPool||{maximumBytes,concurrency:Math.max(1,concurrency),epochs:new Map(),cache:new Map(),cacheBytes:0,flights:new Map(),readers:new Map(),queue:[],active:0};for(const key of['maximumBytes','concurrency','epochs','cache','cacheBytes','flights','readers','queue','active'])Object.defineProperty(this,key,{get:()=>this.pool[key],set:value=>{this.pool[key]=value;}});}
  cancel(reader){this.epochs.set(reader,(this.epochs.get(reader)||0)+1);for(const call of [...this.readers.get(reader)||[]]){this.detach(call);call.reject(aborted());}}
  cancelAll(){for(const reader of new Set([...this.epochs.keys(),...this.readers.keys()]))this.cancel(reader);this.cache.clear();this.cacheBytes=0;this.queue=[];}
  assetURL(descriptor){
    const path=typeof descriptor==='string'?descriptor:descriptor?.path;
    if(typeof path!=='string'||!path||/[\\?#\u0000-\u001f]/.test(path)||path.startsWith('/')||/%(?:2f|5c)/i.test(path))throw new Error('Invalid bus asset path');
    let invalid;try{invalid=path.split('/').some(part=>!part||['.','..'].includes(decodeURIComponent(part)));}catch{invalid=true;}if(invalid)throw new Error('Invalid bus asset path');
    const base=path.startsWith('details/')&&this.detailsBase?this.detailsBase:this.base,url=new URL(path,base);
    if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||url.username||url.password||url.search||url.hash)throw new Error('Invalid bus asset path');
    return url;
  }
  identity(descriptor){return this.cache.get(this.assetURL(descriptor).href+':'+(descriptor?.sha256||''))?.sha256;}
  detach(call){const{flight,reader}=call;flight.calls.delete(call);const readers=this.readers.get(reader);readers?.delete(call);if(!readers?.size)this.readers.delete(reader);if(!flight.calls.size){if(this.flights.get(flight.flightKey)===flight)this.flights.delete(flight.flightKey);flight.controller.abort();}}
  validateSize(descriptor,wireBytes,bytes){if(Number.isInteger(descriptor?.bytes)&&descriptor.bytes!==wireBytes)throw new Error('Bus asset byte count mismatch');if(Number.isInteger(descriptor?.uncompressedBytes)&&descriptor.uncompressedBytes!==bytes)throw new Error('Bus decoded byte count mismatch');}
  pump(){while(this.active<this.concurrency&&this.queue.length){const flight=this.queue.shift();if(!flight.calls.size)continue;this.active++;this.read(flight).then(value=>this.settle(flight,null,value),error=>this.settle(flight,error)).finally(()=>{this.active--;this.pump();});}}
  settle(flight,error,value){if(this.flights.get(flight.flightKey)===flight)this.flights.delete(flight.flightKey);for(const call of [...flight.calls]){this.detach(call);if(error)call.reject(error);else call.resolve(value);}}
  async load(descriptor,{reader='viewport',limit=4*1024*1024}={}){
    const url=this.assetURL(descriptor);
    if(this.requireHashes&&(!/^[a-f0-9]{64}$/.test(descriptor?.sha256||'')||!Number.isSafeInteger(descriptor?.bytes)||descriptor.bytes<1))throw new Error('Remote bus asset requires a checksum descriptor');
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
    // A checksum-bound packet is immutable and verified below, so the HTTP cache may answer without a
    // revalidation round trip. The manifest and any unhashed load still revalidate on every read.
    const immutable=/^[a-f0-9]{64}$/.test(descriptor?.sha256||'')&&!url.pathname.endsWith('/manifest.json');
    const response=await this.fetcher(url.href,{signal:controller.signal,cache:immutable?'default':'no-cache',credentials:'omit',mode:'cors',redirect:'error',referrerPolicy:'no-referrer'});if(!response.ok||response.type==='opaque')throw new Error('Bus data unavailable ('+response.status+')');
    if(response.url){const final=new URL(response.url);if(final.origin!==url.origin||final.pathname!==url.pathname||final.search!==url.search)throw new Error('Unexpected bus asset redirect');}
    if(Number(response.headers?.get('content-length'))>limit)throw new Error('Bus asset exceeds download budget');
    let buffer;if(response.body?.getReader){const stream=response.body.getReader(),chunks=[];let size=0;try{for(;;){const{done,value}=await stream.read();if(done)break;size+=value.byteLength;if(size>limit){await stream.cancel();throw new Error('Bus asset exceeds download budget');}chunks.push(value);}}finally{stream.releaseLock();}buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}}
    else{buffer=new Uint8Array(await response.arrayBuffer());if(buffer.byteLength>limit)throw new Error('Bus asset exceeds download budget');}
    check();
    if(Number.isInteger(descriptor?.bytes)&&descriptor.bytes!==buffer.byteLength)throw new Error('Bus asset byte count mismatch');
    const wireBytes=buffer.byteLength;
    const sha256=descriptor?.sha256||url.pathname.endsWith('/manifest.json')?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join(''):undefined;if(descriptor?.sha256&&sha256!==descriptor.sha256)throw new Error('Bus asset checksum mismatch');
    check();
    if(descriptor?.encoding==='gzip'||url.pathname.endsWith('.gz')){
      if(typeof DecompressionStream!=='function'){const{gunzip}=await import('./gunzip.js?v=1db9ee4e69a277e5');buffer=gunzip(buffer,{maxBytes:Math.min(limit*8,48*1024*1024)});}
      else{const stream=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[],abort=()=>{stream.cancel().catch(()=>{});};let size=0;controller.signal.addEventListener('abort',abort,{once:true});
      try{for(;;){const{done,value}=await stream.read();if(done)break;size+=value.byteLength;if(size>Math.min(limit*8,48*1024*1024)){await stream.cancel();throw new Error('Decoded bus asset exceeds memory budget');}chunks.push(value);}}finally{controller.signal.removeEventListener('abort',abort);stream.releaseLock();}
      buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}}
    }
    check();
    if(Number.isInteger(descriptor?.uncompressedBytes)&&descriptor.uncompressedBytes!==buffer.byteLength)throw new Error('Bus decoded byte count mismatch');
    const value=JSON.parse(new TextDecoder().decode(buffer));check();if(buffer.byteLength<=this.maximumBytes){this.cacheBytes-=this.cache.get(key)?.bytes||0;this.cache.delete(key);this.cache.set(key,{value,bytes:buffer.byteLength,wireBytes,sha256});this.cacheBytes+=buffer.byteLength;while(this.cacheBytes>this.maximumBytes){const first=this.cache.keys().next().value;this.cacheBytes-=this.cache.get(first).bytes;this.cache.delete(first);}}
    return value;
  }
}

// SILENT licence class (publisher states no licence). Takedown requests go to
// the public Pages repository's issue tracker (coordinator decision, 11 Nov 2026).
export const SILENT_TAKEDOWN_CONTACT='https://github.com/gravelcycles/gravelcycles.github.io/issues';
export function silentLicenceNotice(notice){if(!notice||typeof notice!=='object'||notice.class!=='SILENT'||notice.takedown!==true)return null;return{label:'licence: none stated',takedown:`Publisher wants this removed? Open an issue at ${SILENT_TAKEDOWN_CONTACT}`};}
