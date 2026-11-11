// The complete data/manifest.json stays the authenticated release record. A
// composed site can also carry a slim start-up projection of it: the same
// top-level metadata without the audit-sized `provenance` and
// `passPolicyProjection` objects, which become separately hashed part files.
// Sites published before that projection have neither a pointer nor parts and
// keep loading the complete manifest; every value here is optional for them.
const SHA256=/^[0-9a-f]{64}$/;
const STARTUP_PATH=/^assets\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
const PART_PATH=/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
const own=(value,key)=>value!==null&&typeof value==='object'&&Object.prototype.hasOwnProperty.call(value,key);

// Only the embedded bootstrap names a start-up manifest, and only inside the
// page's own assets directory. Anything else falls back to the complete one.
export function startupManifestURL(bootstrap,pageURL){
  const path=bootstrap?._bootstrap===true?bootstrap.startupManifest?.path:null;
  if(typeof path!=='string'||!STARTUP_PATH.test(path))return null;
  return new URL(path,pageURL).href;
}

// A start-up manifest must still be a usable manifest; a truncated or foreign
// document is replaced by the complete manifest rather than trusted.
export function usableManifest(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&value.files!==null&&typeof value.files==='object';
}

export function manifestPart(manifest,name){
  const parts=manifest?.manifestParts;
  const part=parts?.schemaVersion===1&&own(parts.parts,name)?parts.parts[name]:null;
  return part&&typeof part.path==='string'&&PART_PATH.test(part.path)&&typeof part.sha256==='string'&&SHA256.test(part.sha256)?part:null;
}

export function manifestPartURL(manifest,name,startupURL){
  const part=manifestPart(manifest,name);
  if(!part||!startupURL)return null;
  const url=new URL(part.path,startupURL);url.searchParams.set('v',part.sha256);return url.href;
}

// The start-up manifest keeps the few keys a panel reads inline and lists
// every key held by the deferred part. A part is fetched only for a key that
// it holds and the inline subset lacks; with no keys, the whole part is wanted.
export function needsManifestPart(manifest,name,keys=[]){
  const part=manifestPart(manifest,name);
  if(!part)return false;
  if(!keys.length)return true;
  const listed=Array.isArray(part.keys)?new Set(part.keys):null;
  return keys.some(key=>!own(manifest[name],key)&&(!listed||listed.has(key)));
}

// `load(url)` reads one JSON document; `complete()` reads the complete
// manifest. A missing or unreadable part falls back to the complete manifest,
// which always carries the same value. Failures stay retryable.
export function createManifestPartLoader({load,complete}){
  const loaded=new WeakMap(),pending=new WeakMap();
  return function ensureManifestPart(manifest,name,{keys=[],startupURL=null}={}){
    if(loaded.get(manifest)?.has(name)||!needsManifestPart(manifest,name,keys))return Promise.resolve(false);
    if(!pending.has(manifest))pending.set(manifest,new Map());
    const jobs=pending.get(manifest);
    if(!jobs.has(name)){
      const url=manifestPartURL(manifest,name,startupURL);
      const fromComplete=()=>Promise.resolve().then(complete).then(full=>{
        if(!own(full,name))throw new Error('The complete manifest has no '+name);
        return full[name];
      });
      const job=(url?Promise.resolve().then(()=>load(url)).catch(fromComplete):fromComplete()).then(value=>{
        manifest[name]=value;
        if(!loaded.has(manifest))loaded.set(manifest,new Set());
        loaded.get(manifest).add(name);jobs.delete(name);return true;
      },error=>{jobs.delete(name);throw error;});
      jobs.set(name,job);
    }
    return jobs.get(name);
  };
}
