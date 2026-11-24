// Bytes received for each data request, counted as the body arrives, for the
// loading screens ("12.3 of 27.0 MB"). Only real counts: a total comes from the
// response's Content-Length (when the body is not transfer-compressed) or from
// the size the caller already knows (the manifest). Nothing is estimated.
//
// fetchWithTransientRetry meters every response it returns. In the data worker
// the counts are posted to the page in small batches (setMeterSink); the page
// merges them (applyRemoteMeter), so one meter covers both threads.
const MAX_ENTRIES=4000,entries=new Map();
let sink=null,dirty=new Map(),flushTimer=0;

export function meterKey(url,range){const href=String(url instanceof URL?url.href:url);return range?href+'#'+range:href;}
function rangeOf(options){const headers=options?.headers;if(!headers)return'';const value=typeof headers.get==='function'?headers.get('Range'):headers.Range||headers.range;return value?String(value):'';}
function note(key,entry){
  entries.delete(key);entries.set(key,entry);
  if(entries.size>MAX_ENTRIES)for(const[old,value]of entries){if(entries.size<=MAX_ENTRIES)break;if(value.done)entries.delete(old);}
  if(sink){dirty.set(key,entry);if(entry.done)flush();else if(!flushTimer)flushTimer=setTimeout(flush,150);}
}
function flush(){if(flushTimer){clearTimeout(flushTimer);flushTimer=0;}if(!sink||!dirty.size)return;const list=[...dirty].map(([key,e])=>[key,e.received,e.total,e.done?1:0,e.started]);dirty=new Map();sink(list);}

export function setMeterSink(fn){sink=fn;}
export function applyRemoteMeter(list){for(const[key,received,total,done,started]of list||[])note(key,{received,total,done:!!done,started});}

// Wraps a response so its body is counted as it is read. The caller reads the
// returned response exactly as it would the original.
export function meterResponse(url,options,response,now=()=>Date.now()){
  if(!response?.ok||!response.body||typeof TransformStream!=='function')return response;
  const key=meterKey(url,rangeOf(options)),encoding=(response.headers.get('content-encoding')||'identity').toLowerCase();
  const length=Number(response.headers.get('content-length'));
  const entry={received:0,total:encoding==='identity'&&Number.isFinite(length)&&length>0?length:null,done:false,started:now()};note(key,entry);
  const counter=new TransformStream({
    transform(chunk,controller){entry.received+=chunk.byteLength;note(key,entry);controller.enqueue(chunk);},
    flush(){entry.done=true;if(entry.total===null||entry.total<entry.received)entry.total=entry.received;note(key,entry);}
  });
  try{return new Response(response.body.pipeThrough(counter),{status:response.status,statusText:response.statusText,headers:response.headers});}
  catch{return response;}
}

// Bytes for the requests a view waits on: [{key, size}] where size is the
// known size (manifest) or null. totalBytes is null when any size is unknown.
export function meterBytes(items){
  let bytes=0,totalBytes=0,known=true;
  for(const{key,size}of items){
    const entry=entries.get(key),total=Number.isFinite(size)&&size>0?size:entry?.total??null;
    if(entry)bytes+=total?Math.min(entry.received,total):entry.received;
    if(total)totalBytes+=total;else known=false;
  }
  return{bytes,totalBytes:known?totalBytes:null};
}
// Bytes of every request started at or after `since` (ms since the epoch): for
// a load whose requests are not known one by one.
export function meterBytesSince(since){
  let bytes=0;for(const entry of entries.values())if(entry.started>=since)bytes+=entry.received;
  return{bytes,totalBytes:null};
}
// Data bytes the page has received since it opened, for the opening screen:
// every metered request, plus completed fetches the meter did not see (an
// early prefetch made before the modules ran), from the browser's Resource
// Timing entries. Scripts, styles and map images are not data and not counted.
export function meterPageBytes(perf=globalThis.performance){
  let bytes=0;const seen=new Set();
  for(const[key,entry]of entries){bytes+=entry.received;seen.add(key.split('#')[0]);}
  let timings=[];try{timings=perf?.getEntriesByType?.('resource')||[];}catch{}
  for(const timing of timings){
    if(seen.has(timing.name)||(timing.initiatorType!=='fetch'&&timing.initiatorType!=='xmlhttprequest'))continue;
    seen.add(timing.name);bytes+=timing.encodedBodySize||timing.transferSize||0;
  }
  return{bytes,totalBytes:null};
}
export function resetMeterForTests(){entries.clear();dirty=new Map();sink=null;if(flushTimer)clearTimeout(flushTimer);flushTimer=0;}
