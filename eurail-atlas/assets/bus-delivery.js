// Deployment configuration is trusted same-origin UI data, never a shared-link URL.
const HASH=/^[a-f0-9]{64}$/;
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
  for(const[name,key]of[['busAtlasOverview','catalogue'],['busGeometry','manifest']])if(Object.hasOwn(configuration,name)){
    const value=configuration[name],descriptor=value?.[key];
    if(value?.busManifestSha256!==manifest.sha256||!HASH.test(descriptor?.sha256||'')||!Number.isSafeInteger(descriptor?.bytes)||descriptor.bytes<1||descriptor.bytes>3*1024*1024||!Number.isSafeInteger(descriptor?.uncompressedBytes)||descriptor.uncompressedBytes<1||descriptor.uncompressedBytes>16*1024*1024||descriptor.encoding!=='gzip')throw new Error('Invalid bus derivative binding');
    derivatives[name]={...value,assetBaseUrl:safeBusBase(value.assetBaseUrl,pageURL).href};
  }
  return{baseURL:base,detailsBaseURL:details,manifest,requireHashes:true,sourceIds,...derivatives};
}
