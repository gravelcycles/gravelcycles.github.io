// Early Traffic downloads. index.html loads this small module before app.js.
// When the page opens on the Traffic view, it starts the display index and the
// overview bucket the opening view will draw, while the rest of the interface
// is still downloading. Everything comes from the delivery's inline bootstrap
// (the same hashes app.js reads), so nothing here names a week or a release.
// app.js takes a prefetched response only when its own URL is identical
// (takeTrafficPrefetch); otherwise it fetches as before. A wrong guess costs
// one download, never a wrong picture: every packet is still validated.
import{europeFrame,atlasFramePadding}from'./frame-padding.js?v=59f1bc0be76aaba9';

export const TRAFFIC_INDEX_PATH='assets/physical-heat/manifest.json';
const MOBILE_LAYOUT='(max-width:700px), (max-height:500px) and (pointer:coarse)';
// Leaflet options the atlas map is created with (app.js: L.map).
export const MAP_ZOOM={snap:.25,min:3,max:19};
// URL parameters that leave the overview's filters as they are; any other
// parameter (a source, day, minimum, focus…) means no overview prefetch.
const NEUTRAL=new Set(['view','lat','lon','z','pass','key','stations','about','coverage']);

export function trafficIndexURL(bootstrap,base){
  const logical=bootstrap?.files?.physicalRailHeat,sha=bootstrap?.assets?.[bootstrap?.assetPaths?.[logical]]?.sha256;
  if(typeof sha!=='string'||!/^[0-9a-f]{64}$/.test(sha))return null;
  const url=new URL(TRAFFIC_INDEX_PATH,base);url.searchParams.set('v',sha);return url.href;
}
// The overview the opening view asks for: 'default', 'pass' or null.
export function openingVariant(params){
  if(params.get('view')!=='traffic')return null;
  for(const key of params.keys())if(!NEUTRAL.has(key))return null;
  if(params.get('pass')!=='1')return'default';
  return'pass';
}
// The opening zoom: the URL's when it is valid (readState's rule), else the
// zoom Leaflet's fitBounds gives the Europe frame (getBoundsZoom, unpadded
// start zoom 0, zoomSnap and min/max as the map is created).
export function openingZoom(params,size,{phone=false,compact=false,focus=false}={}){
  const lat=Number(params.get('lat')),lon=Number(params.get('lon')),z=Number(params.get('z'));
  // setView snaps the zoom (Leaflet _limitZoom) and keeps it within min/max.
  if(params.has('lat')&&Number.isFinite(lat)&&Math.abs(lat)<=85&&Number.isFinite(lon)&&Math.abs(lon)<=180&&z>=2&&z<=19)return Math.max(MAP_ZOOM.min,Math.min(MAP_ZOOM.max,Math.round(z/MAP_ZOOM.snap)*MAP_ZOOM.snap));
  if(!(size?.x>0&&size?.y>0))return null;
  const frame=europeFrame(size,atlasFramePadding({phone,compact,focus},size));
  return fitZoom(frame.bounds,frame.padding,size);
}
const MAX_LATITUDE=85.0511287798;
function projectY(lat){const r=Math.max(-MAX_LATITUDE,Math.min(MAX_LATITUDE,lat))*Math.PI/180;return 256*(.5-Math.log(Math.tan(Math.PI/4+r/2))/(2*Math.PI));}
export function fitZoom([[south,west],[north,east]],padding,size,{snap,min,max}=MAP_ZOOM){
  const tl=padding?.paddingTopLeft||[0,0],br=padding?.paddingBottomRight||[0,0];
  const width=size.x-tl[0]-br[0],height=size.y-tl[1]-br[1];
  const boundsWidth=256*(east-west)/360,boundsHeight=projectY(south)-projectY(north);
  let zoom=Math.log2(Math.min(width/boundsWidth,height/boundsHeight));
  zoom=Math.round(zoom/(snap/100))*(snap/100);zoom=Math.floor(zoom/snap)*snap;
  return Math.max(min,Math.min(max,zoom));
}
// physical-heat-overview.js::overviewBucketFor, over the index's bucket keys.
export function openingBucket(index,variant,zoom){
  const entry=index?.overview?(variant==='pass'?index.overview.pass:index.overview):null;
  const buckets=entry?.buckets&&typeof entry.buckets==='object'?Object.keys(entry.buckets).map(Number).filter(Number.isInteger).sort((a,b)=>a-b):[];
  if(!buckets.length||!Number.isFinite(zoom))return null;
  const bucket=Math.max(buckets[0],Math.ceil(zoom));
  return buckets.includes(bucket)?{bucket,info:entry.buckets[String(bucket)]}:null;
}
export function overviewURL(info,indexURL){
  if(typeof info?.path!=='string'||!/^[0-9a-f]{64}$/.test(info?.sha256||''))return null;
  const url=new URL('assets/physical-heat/'+info.path,new URL('../../',indexURL));url.searchParams.set('v',info.sha256);return url.href;
}

function start(){
  const params=new URLSearchParams(location.search);
  if(window.busPageRedirect||window.atlasUnsupportedBrowser||window.atlasTrafficPrefetch===false||params.get('view')!=='traffic')return;
  let bootstrap;try{bootstrap=JSON.parse(document.getElementById('atlasBootstrap')?.textContent||'null');}catch{return;}
  // On an R2 site (a rail pointer in the bootstrap) the Pages path holds no
  // Traffic bytes, and every object must be hash-checked: app.js fetches
  // through the R2 source instead, so there is nothing to prefetch here.
  if(bootstrap?.railPointer)return;
  const url=trafficIndexURL(bootstrap,location.href);if(!url)return;
  const response=fetch(url,{priority:'high'});response.catch(()=>{});
  const variant=openingVariant(params),mapElement=document.getElementById('map');
  const size=mapElement?{x:mapElement.clientWidth,y:mapElement.clientHeight}:null;
  const zoom=variant?openingZoom(params,size,{phone:matchMedia(MOBILE_LAYOUT).matches,compact:matchMedia('(max-width:900px)').matches,focus:document.body?.classList.contains('map-focus')}):null;
  const overview=zoom===null?Promise.resolve(null):response.then(r=>r.ok?r.clone().json():null).then(index=>{
    const chosen=openingBucket(index,variant,zoom),target=chosen&&overviewURL(chosen.info,url);
    if(!target)return null;
    const early=fetch(target,{priority:'high'});early.catch(()=>{});return{url:target,response:early};
  }).catch(()=>null);
  window.atlasTrafficPrefetch={index:{url,response},overview};
}
// app.js: the prefetched response for exactly this URL, once; null otherwise
// (no prefetch, another URL, a failed or non-OK answer), so the caller fetches.
export function takeTrafficPrefetch(kind,url,holder=globalThis.window){
  const early=holder?.atlasTrafficPrefetch,slot=early?.[kind];
  // Nothing prefetched yet: close the slot so a late prefetch never duplicates
  // a download app.js is about to start.
  if(!slot){if(holder&&early==null)holder.atlasTrafficPrefetch=false;return Promise.resolve(null);}
  early[kind]=null;
  return Promise.resolve(slot).then(value=>value&&value.url===url?value.response:null).then(response=>response&&response.ok?response:null).catch(()=>null);
}
// index.html loads this module async, so it runs as soon as it arrives, not
// after the deferred leaflet.js. It waits only for the parser to finish (the
// bootstrap and #map exist), which comes before deferred scripts run.
function startWhenParsed(){
  if(document.readyState!=='loading'){try{start();}catch{}return;}
  document.addEventListener('readystatechange',function once(){if(document.readyState==='loading')return;document.removeEventListener('readystatechange',once);try{start();}catch{}});
}
if(typeof document!=='undefined'&&typeof location!=='undefined')startWhenParsed();
