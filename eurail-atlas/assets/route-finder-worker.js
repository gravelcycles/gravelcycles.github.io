// Route finder worker: owns the route-finder timetable for the session and
// answers {id, method, args} messages with {id, result} or {id, error}.
// Created only when the route finder opens (assets/route-finder.js).
import{createService}from'./route-finder-service.js?v=62e2a17f7184a8a5';

let service=null,base='';
const gunzip=async bytes=>{
  if(typeof DecompressionStream==='function'){
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  }
  const{gunzip:inflate}=await import('./gunzip.js?v=62e2a17f7184a8a5');const out=inflate(bytes);
  return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);
};
// Bytes as they arrive, posted to the page a few times a second: the panel
// shows "1.2 of 2.1 MB · 4 s" while the timetable loads (true sizes from index.json).
let received=0,posted=0;
// Each file is checked against the SHA-256 that index.json lists (WebCrypto; absent outside a secure context).
const sha256=globalThis.crypto?.subtle?async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join(''):null;
const report=(force=false)=>{const now=performance.now();if(force||now-posted>200){posted=now;self.postMessage({progress:{bytes:received}});}};
const fetchBytes=async(name,tag)=>{
  const response=await fetch(base+name+(tag?'?r='+tag:''),{cache:tag?'default':'no-cache'});
  if(!response.ok)throw new Error('route_finder_fetch_failed:'+name+':'+response.status);
  if(!response.body?.getReader)return new Uint8Array(await response.arrayBuffer());
  const reader=response.body.getReader(),parts=[];let length=0;
  for(;;){const{done,value}=await reader.read();if(done)break;parts.push(value);length+=value.byteLength;received+=value.byteLength;report();}
  report(true);
  const out=new Uint8Array(length);let at=0;for(const part of parts){out.set(part,at);at+=part.byteLength;}return out;
};

self.onmessage=async({data})=>{
  const{id,method,args=[]}=data||{};
  try{
    if(method==='init'){base=args[0];service=createService({fetchBytes,gunzip,sha256,onTotal:total=>self.postMessage({progress:{total}})});self.postMessage({id,result:true});return;}
    if(!service)throw new Error('route_finder_worker_not_initialised');
    if(typeof service[method]!=='function')throw new Error('route_finder_unknown_method:'+method);
    const started=performance.now(),result=await service[method](...args);
    self.postMessage({id,result,ms:Math.round(performance.now()-started)});
  }catch(error){self.postMessage({id,error:String(error&&error.message||error)});}
};
