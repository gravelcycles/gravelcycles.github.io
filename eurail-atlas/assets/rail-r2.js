// Rail data from the R2 Worker, with the Pages lite fallback and hash checks
// (docs/R2_MIGRATION_PLAN.md, sections 2a and 6a). Inactive unless the
// manifest names a rail pointer; then every rail object is
//   1. requested from the Worker by its SHA-256 (o/<sha>), at most 8 at a time;
//   2. on a refusal (1027, 1015, 429, 5xx, CORS or network failure, or a
//      20-second timeout) the Worker is marked refusing for 10 minutes, and an
//      object with a lite copy is read from Pages (assets/rail-lite/<site path>);
//   3. checked with WebCrypto SHA-256 against the inventory before use,
//      whichever copy answered. A mismatch counts as a refusal of that copy.
// An object with no lite copy while the Worker refuses raises
// DetailUnavailable, which the caller shows as a notice, never an empty panel.

export const REFUSAL_MS=10*60*1000;
export const TIMEOUT_MS=20000;
export const MAX_CONCURRENT=8;
const SHA=/^[0-9a-f]{64}$/;

// The notice text depends on why: a refusal the daily limit explains, or a copy
// that failed (integrity, network) where the limit would be the wrong claim.
export const NOTICES={
  worker_refusing:'Detailed data is temporarily unavailable (daily limit reached); it returns after 00:00 UTC. Trains still show on the map.',
  failed:'Detailed data could not be loaded right now. Trains still show on the map; try again in a few minutes.',
};
export function noticeFor(reason){return reason==='worker_refusing'?NOTICES.worker_refusing:NOTICES.failed;}
export class DetailUnavailable extends Error{constructor(path,reason){super(noticeFor(reason));this.name='DetailUnavailable';this.path=path;this.reason=reason;}}
export class HashMismatch extends Error{constructor(path,where){super('hash mismatch: '+path+' from '+where);this.name='HashMismatch';this.path=path;this.where=where;}}

// The pointer as published beside the manifest: Worker base, the delivery's
// manifest hash, its inventory (site path -> {sha256, bytes}) and the lite list.
export function validPointer(pointer){
  if(!pointer||typeof pointer!=='object'||pointer.kind!=='rail_r2_pointer')return false;
  if(typeof pointer.worker!=='string'||!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(pointer.worker))return false;
  if(!SHA.test(pointer.manifestSha256||''))return false;
  if(!pointer.objects||typeof pointer.objects!=='object')return false;
  for(const info of Object.values(pointer.objects))if(!info||!SHA.test(info.sha256||'')||!Number.isInteger(info.bytes))return false;
  if(!Array.isArray(pointer.fallback))return false;
  for(const row of pointer.fallback)if(!row||typeof row.path!=='string'||pointer.objects[row.path]?.sha256!==row.sha256)return false;
  return true;
}


export async function sha256Hex(bytes,subtle=globalThis.crypto?.subtle){
  const digest=await subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

export async function gunzip(bytes){
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function createLimiter(max=MAX_CONCURRENT){
  let active=0;const queue=[];
  const next=()=>{if(active>=max||!queue.length)return;active++;const{task,resolve,reject}=queue.shift();
    Promise.resolve().then(task).then(resolve,reject).finally(()=>{active--;next();});};
  const run=task=>new Promise((resolve,reject)=>{queue.push({task,resolve,reject});next();});
  run.active=()=>active;run.queued=()=>queue.length;
  return run;
}

// The viewer is degraded when an object was read from its lite copy instead of
// the Worker, or could not be read at all: the main view then shows less than
// the full delivery. Each first occurrence per object is reported once, to
// onDegraded() listeners and as a DEGRADED_EVENT on globalThis (detail:
// {kind:'lite'|'unavailable', path, reason}); isDegraded() and degradedState()
// answer at any time (also from the console: activeRailR2()?.degradedState()).
export const DEGRADED_EVENT='rail-r2-degraded';
export class RailR2{
  constructor(pointer,{pagesBase,fetchImpl=globalThis.fetch?.bind(globalThis),now=()=>Date.now(),subtle=globalThis.crypto?.subtle,limit=createLimiter()}={}){
    if(!validPointer(pointer))throw new Error('invalid rail pointer');
    this.pointer=pointer;this.pagesBase=pagesBase;this.fetch=fetchImpl;this.now=now;this.subtle=subtle;this.limit=limit;
    this.lite=new Map(pointer.fallback.map(row=>[row.path,row]));
    this.refusingUntil=0;
    this.degraded={lite:new Map(),unavailable:new Map()};this.listeners=new Set();
  }
  onDegraded(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  isDegraded(){return this.degraded.lite.size>0||this.degraded.unavailable.size>0;}
  degradedState(){return{degraded:this.isDegraded(),lite:[...this.degraded.lite.keys()],unavailable:[...this.degraded.unavailable.keys()]};}
  _degrade(kind,path,reason){
    if(this.degraded[kind].has(path))return;
    this.degraded[kind].set(path,reason);
    const detail={kind,path,reason};
    for(const listener of this.listeners){try{listener(detail);}catch(error){/* a listener never breaks a data read */}}
    try{if(typeof globalThis.dispatchEvent==='function'&&typeof CustomEvent==='function')globalThis.dispatchEvent(new CustomEvent(DEGRADED_EVENT,{detail}));}catch(error){/* no event target */}
  }
  _unavailable(path,reason){this._degrade('unavailable',path,reason);return new DetailUnavailable(path,reason);}
  refusing(){return this.now()<this.refusingUntil;}
  markRefusing(){this.refusingUntil=this.now()+REFUSAL_MS;}
  info(path){const info=this.pointer.objects[path];if(!info)throw new Error('not in the rail inventory: '+path);return info;}
  // The manifest is stored as m/rail/<sha>.json; every other object as o/<sha>.
  workerURL(path){const info=this.info(path);return path==='data/manifest.json'&&info.sha256===this.pointer.manifestSha256?this.manifestURL():this.pointer.worker+'/o/'+info.sha256;}
  manifestURL(){return this.pointer.worker+'/m/rail/'+this.pointer.manifestSha256+'.json';}
  // The lite set sits under assets/rail-lite/ with each object's full site path
  // (rail_data/r2_site.py), outside data/, which stays the manifest inventory.
  liteURL(path){return new URL('assets/rail-lite/'+path,this.pagesBase).href;}
  hasLite(path){return this.lite.has(path);}

  async _get(url,{signal,headers}={}){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
    const abort=()=>controller.abort();signal?.addEventListener?.('abort',abort,{once:true});
    try{return await this.fetch(url,{signal:controller.signal,headers,mode:'cors',credentials:'omit'});}
    finally{clearTimeout(timer);signal?.removeEventListener?.('abort',abort);}
  }

  async _verified(url,expected,path,where,options){
    const response=await this._get(url,options);
    if(!response.ok){const error=new Error('status '+response.status);error.status=response.status;throw error;}
    const bytes=await response.arrayBuffer();
    if(await sha256Hex(bytes,this.subtle)!==expected)throw new HashMismatch(path,where);
    return bytes;
  }

  // The verified bytes of one rail object, as fetched (gzip stays compressed).
  async bytes(path,{signal}={}){
    const info=this.info(path);
    let why=this.refusing()?'worker_refusing':null;
    if(!this.refusing()){
      try{return await this.limit(()=>this._verified(this.workerURL(path),info.sha256,path,'worker',{signal}));}
      catch(error){
        if(signal?.aborted)throw error;
        // A 404 is a missing object (an incomplete upload), not a refusal: the
        // Worker stays in use, but an object with a lite copy still loads.
        if(error.status===404){if(!this.hasLite(path)){this._degrade('unavailable',path,'missing');throw error;}why='missing';}
        // A bad body is a failure of that answer, as in range(): try the lite
        // copy, but do not stop asking the Worker for other objects.
        else if(error instanceof HashMismatch)why='hash_mismatch';
        else{this.markRefusing();why='worker_refusing';}
      }
    }
    if(this.hasLite(path)){
      let bytes;
      try{bytes=await this._verified(this.liteURL(path),info.sha256,path,'pages',{signal});}
      catch(error){if(signal?.aborted)throw error;throw this._unavailable(path,'lite_failed');}
      this._degrade('lite',path,why);
      return bytes;
    }
    throw this._unavailable(path,this.refusing()?'worker_refusing':'failed');
  }

  // One byte range of an object, decoded and checked against its per-chunk
  // hash. The station panel's chunkSha256 (rail_data/station_panel.py) is the
  // SHA-256 of the gunzipped chunk, from the index the caller hash-checked, so
  // the check runs after decode. Range reads have no lite copy, so a refusing
  // Worker raises DetailUnavailable. Returns the decoded bytes.
  async range(path,start,end,chunkSha256,{signal,decode=gunzip}={}){
    if(!SHA.test(chunkSha256||''))throw new Error('no chunk hash');
    if(this.refusing())throw this._unavailable(path,'worker_refusing');
    try{
      return await this.limit(async()=>{
        const response=await this._get(this.workerURL(path),{signal,headers:{Range:`bytes=${start}-${end}`}});
        if(response.status!==206){const error=new Error('status '+response.status);error.status=response.status;throw error;}
        const bytes=await response.arrayBuffer();
        if(bytes.byteLength!==end-start+1)throw new HashMismatch(path+'#'+start,'worker');
        const decoded=await decode(bytes);
        if(await sha256Hex(decoded,this.subtle)!==chunkSha256)throw new HashMismatch(path+'#'+start,'worker');
        return decoded;});
    }catch(error){
      if(signal?.aborted)throw error;
      // Aligned with bytes(): a 404 is a missing object, a bad chunk is an
      // integrity failure of that answer; only a refusal marks the Worker.
      if(error.status!==404&&!(error instanceof HashMismatch))this.markRefusing();
      throw this._unavailable(path,error.status===404?'missing':error instanceof HashMismatch?'hash_mismatch':'range_failed');
    }
  }
}

// ---------------------------------------------------------------------------
// Activation and the fetch seam (step 2b part 2).
//
// The composer puts the rail pointer in the inline start-up manifest
// (scripts/build_rail_atlas.py::bootstrap_manifest) as `railPointer`:
//   {kind:'rail_r2_bootstrap', worker, manifestSha256,
//    inventory:{sha256, bytes}, fallback:[{path, sha256, bytes}]}
// The inventory (d/rail/<manifest>/assets-<inventory sha>.json.gz, one key per
// composition of the delivery: site path -> sha256, bytes)
// is read from the Worker, or from its lite copy on Pages, hash-checked, and
// becomes the RailR2 object map. A site without `railPointer` is the in-tree
// layout (contract version 1) and nothing here runs.
//
// railFetch(url, init) is the one seam: every data fetch (the data worker,
// Traffic, station panels, the station-panel index) goes through
// fetchWithTransientRetry or station-panel's fetcher, whose default is
// railFetch. A Pages URL whose path is in the inventory is answered from the
// Worker or the lite copy, verified; data/manifest.json is the full manifest
// from the Worker; anything else goes to the network unchanged.

let active=null;
export function activeRailR2(){return active;}
export function uninstallRailR2(){active=null;}

export function validBootstrapPointer(pointer){
  return !!pointer&&pointer.kind==='rail_r2_bootstrap'&&typeof pointer.worker==='string'&&/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(pointer.worker)
    &&SHA.test(pointer.manifestSha256||'')&&SHA.test(pointer.inventory?.sha256||'')&&Number.isInteger(pointer.inventory?.bytes)
    &&Array.isArray(pointer.fallback)&&pointer.fallback.every(row=>row&&typeof row.path==='string'&&SHA.test(row.sha256||'')&&Number.isInteger(row.bytes));
}

async function verifiedFrom(urls,expected,fetchImpl,subtle){
  let last;
  for(const url of urls){
    try{const response=await fetchImpl(url,{mode:'cors',credentials:'omit'});if(!response.ok)throw new Error('status '+response.status);
      const bytes=await response.arrayBuffer();if(await sha256Hex(bytes,subtle)!==expected)throw new HashMismatch(url,'bootstrap');return bytes;}
    catch(error){last=error;}
  }
  throw last||new Error('unavailable');
}

// Build the RailR2 source for a bootstrap pointer: inventory first from the
// Worker, then from Pages (assets/rail-lite/inventory.json.gz), both checked.
export async function railR2FromBootstrap(pointer,{pagesBase,fetchImpl=globalThis.fetch?.bind(globalThis),subtle=globalThis.crypto?.subtle,now,limit}={}){
  if(!validBootstrapPointer(pointer))throw new Error('invalid rail bootstrap pointer');
  const workerInventory=`${pointer.worker}/d/rail/${pointer.manifestSha256}/assets-${pointer.inventory.sha256}.json.gz`;
  const liteInventory=new URL('assets/rail-lite/inventory.json.gz',pagesBase).href;
  const bytes=await verifiedFrom([workerInventory,liteInventory],pointer.inventory.sha256,fetchImpl,subtle);
  const inventory=JSON.parse(new TextDecoder().decode(await gunzip(bytes)));
  if(inventory?.kind!=='rail_r2_inventory'||inventory.manifestSha256!==pointer.manifestSha256||!Array.isArray(inventory.objects))throw new Error('invalid rail inventory');
  const objects={};
  for(const row of inventory.objects)objects[row.path]={sha256:row.sha256,bytes:row.bytes};
  if(objects['data/manifest.json']?.sha256!==pointer.manifestSha256)throw new Error('inventory names another manifest');
  return new RailR2({kind:'rail_r2_pointer',worker:pointer.worker,manifestSha256:pointer.manifestSha256,objects,
    fallback:pointer.fallback.map(row=>({path:row.path,sha256:row.sha256}))},{pagesBase,fetchImpl,subtle,...(now?{now}:{}),...(limit?{limit}:{})});
}

export function installRailR2(source){active=source;return source;}

// A cache key that names the week: decoded caches are keyed by the installed
// delivery's manifest SHA-256 plus the URL, because some paths (the station-panel
// blob, the Traffic index) are the same in every week (plan section 9c). On an
// in-tree site, with no source installed, the key is the URL as before.
export function weekCacheKey(url,source=active){return source?source.pointer.manifestSha256+'|'+url:url;}

// The site path a Pages URL names, or null (another origin, or outside the site).
export function sitePath(url,pagesBase){
  let target;try{target=new URL(url,pagesBase);}catch{return null;}
  const base=new URL(pagesBase);
  if(target.origin!==base.origin||!target.pathname.startsWith(base.pathname))return null;
  return decodeURIComponent(target.pathname.slice(base.pathname.length));
}

function rangeOf(init){
  const headers=init?.headers;const value=headers instanceof Headers?headers.get('Range'):headers?.Range||headers?.range;
  const match=/^bytes=(\d+)-(\d+)$/.exec(value||'');return match?{start:Number(match[1]),end:Number(match[2])}:null;
}

export async function railFetch(url,init={},{source=active,network=globalThis.fetch?.bind(globalThis)}={}){
  const href=typeof url==='string'?url:url?.url||String(url);
  if(!source)return network(url,init);
  const path=sitePath(href,source.pagesBase);
  if(path===null||!(path in source.pointer.objects))return network(url,init);
  const range=rangeOf(init);
  if(range){
    // Station-panel ranges: the caller checks each gzip member against its
    // chunk hash after decoding (station-panel.js), so the raw run is passed on.
    if(source.refusing())throw source._unavailable(path,'worker_refusing');
    try{
      const response=await source.limit(()=>source._get(source.workerURL(path),{signal:init.signal,headers:{Range:`bytes=${range.start}-${range.end}`}}));
      if(response.status>=500||response.status===429){source.markRefusing();throw source._unavailable(path,'worker_refusing');}
      return response;
    }catch(error){if(init.signal?.aborted||error instanceof DetailUnavailable)throw error;source.markRefusing();throw source._unavailable(path,'worker_refusing');}
  }
  const bytes=await source.bytes(path,{signal:init.signal});
  return new Response(bytes,{status:200,headers:{'Content-Type':path.endsWith('.json')?'application/json':'application/octet-stream'}});
}
