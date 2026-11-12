// Deployment configuration is trusted same-origin UI data, never a shared-link URL.
const HASH=/^[a-f0-9]{64}$/;
const DISPLAY=[['busNetwork','catalogue'],['busDuplicates','duplicates']],DERIVATIVES=[['busAtlasOverview','catalogue'],['busGeometry','manifest'],...DISPLAY];
function boundDerivative(value,key,sha){
  const descriptor=value?.[key];
  return value?.busManifestSha256===sha&&HASH.test(descriptor?.sha256||'')&&Number.isSafeInteger(descriptor?.bytes)&&descriptor.bytes>=1&&descriptor.bytes<=3*1024*1024&&Number.isSafeInteger(descriptor?.uncompressedBytes)&&descriptor.uncompressedBytes>=1&&descriptor.uncompressedBytes<=16*1024*1024&&descriptor.encoding==='gzip';
}
export function safeBusBase(value,pageURL=globalThis.location?.href){
  if(!(value instanceof URL)&&(typeof value!=='string'||!value.trim()))throw new Error('Invalid public bus asset base');
  const base=new URL(value,pageURL),page=pageURL?new URL(pageURL):base;
  const development=base.protocol==='http:'&&base.origin===page.origin&&['localhost','127.0.0.1','[::1]'].includes(base.hostname);
  if((base.protocol!=='https:'&&!development)||base.username||base.password||base.search||base.hash||!base.pathname.endsWith('/'))throw new Error('Invalid public bus asset base');
  return base;
}
export function resolveBusDelivery(configuration,localBase,pageURL=globalThis.location?.href){
  const local=safeBusBase(localBase,pageURL);
  if(configuration==null)return{baseURL:local,detailsBaseURL:null,manifest:'manifest.json',requireHashes:false,sourceIds:null};
  if(configuration.schemaVersion!==1||configuration.kind!=='bus_atlas_delivery')throw new Error('Unsupported bus delivery configuration');
  const base=safeBusBase(configuration.assetBaseUrl,pageURL),details=Object.hasOwn(configuration,'detailsBaseUrl')?safeBusBase(configuration.detailsBaseUrl,pageURL):null,manifest=configuration.manifest;
  if(manifest?.path!=='manifest.json'||!HASH.test(manifest.sha256)||!Number.isSafeInteger(manifest.bytes)||manifest.bytes<1||manifest.bytes>2*1024*1024)throw new Error('Remote bus manifest must have a bounded checksum descriptor');
  const sourceIds=configuration.publication?.sourceIds;
  if(!Array.isArray(sourceIds)||!sourceIds.length||sourceIds.some(s=>typeof s!=='string'||!s)||new Set(sourceIds).size!==sourceIds.length||configuration.publication?.manifestSha256!==manifest.sha256)throw new Error('Bus delivery lacks its reviewed source binding');
  const derivatives={};
  for(const[name,key]of DERIVATIVES)if(Object.hasOwn(configuration,name)){
    const value=configuration[name];
    if(!boundDerivative(value,key,manifest.sha256))throw new Error('Invalid bus derivative binding');
    derivatives[name]={...value,assetBaseUrl:safeBusBase(value.assetBaseUrl,pageURL).href};
  }
  return{baseURL:base,detailsBaseURL:details,manifest,requireHashes:true,sourceIds,...derivatives};
}
// The display binding (assets/bus-display.json) names the network tiles and
// the duplicate list published for one bus cohort. Every release composes it
// for the cohort the site delivers (scripts/bus_display_binding.py); no
// interface file pins the tiles of a cohort. Its blocks join the delivery
// configuration only when they are bound to that configuration's manifest. A
// missing, foreign or malformed binding changes nothing, so the map keeps its
// packet view; a block the configuration carries itself is never replaced.
export function bindBusDisplay(configuration,display,pageURL=globalThis.location?.href){
  const sha=configuration?.manifest?.sha256;
  if(!display||typeof display!=='object'||display.schemaVersion!==1||display.kind!=='bus_atlas_display'||!HASH.test(sha||'')||display.busManifestSha256!==sha)return configuration;
  const bound={...configuration};
  for(const[name,key]of DISPLAY)if(!Object.hasOwn(bound,name)&&boundDerivative(display[name],key,sha)){
    try{safeBusBase(display[name].assetBaseUrl,pageURL);}catch{continue;}
    bound[name]=display[name];
  }
  return bound;
}
// The explorer products carried on the site itself (country overview with its
// city places, and the local routing index) are named by the same binding, in
// blocks with "location":"site" whose descriptors are relative to assets/. They
// are used only when the binding names the configuration's manifest; otherwise
// the explorer runs without them. No interface module pins their cohort.
const SITE_PRODUCTS=[['busCountryOverview','bus-countries/',['catalogue','places']],['busLocalRouting','bus-local-routing/',['catalogue']]];
function siteDescriptor(descriptor,prefix){
  return descriptor&&typeof descriptor==='object'&&typeof descriptor.path==='string'&&descriptor.path.startsWith(prefix)&&descriptor.path.endsWith('.json.gz')&&!descriptor.path.includes('..')&&!descriptor.path.includes('//')&&!/[?#\\]/.test(descriptor.path)
    &&HASH.test(descriptor.sha256||'')&&Number.isSafeInteger(descriptor.bytes)&&descriptor.bytes>=1&&descriptor.bytes<=3*1024*1024&&Number.isSafeInteger(descriptor.uncompressedBytes)&&descriptor.uncompressedBytes>=1&&descriptor.uncompressedBytes<=16*1024*1024&&descriptor.encoding==='gzip';
}
export function busExplorerProducts(configuration,display){
  const sha=configuration?.manifest?.sha256,none={countryOverview:null,places:null,localRouting:null};
  if(!display||typeof display!=='object'||display.schemaVersion!==1||display.kind!=='bus_atlas_display'||!HASH.test(sha||'')||display.busManifestSha256!==sha)return none;
  const blocks={};
  for(const[name,prefix,entries]of SITE_PRODUCTS){
    const block=display[name];
    if(block?.busManifestSha256===sha&&block.location==='site'&&entries.every(entry=>siteDescriptor(block[entry],prefix)))blocks[name]=block;
  }
  const country=blocks.busCountryOverview,local=blocks.busLocalRouting;
  return{countryOverview:country?{busManifestSha256:sha,catalogue:country.catalogue}:null,places:country?country.places:null,
    localRouting:local?{busManifestSha256:sha,catalogue:local.catalogue}:null};
}
