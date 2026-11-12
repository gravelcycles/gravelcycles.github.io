// Optional city-transit layer (trams, metros and later other non-bus modes).
// Loaded only on activation; makes zero requests while off. Data lives under its
// own transit-data/ namespace with its true mode on every record. Counters are
// per mode and never summed with bus or train counters. Pass inclusion: unknown.
export const TRANSIT_LIMITS=Object.freeze({regions:8,tiles:6,tileBytes:8*1024*1024,decodedBytes:24*1024*1024,routes:800,stops:900});
export const TRANSIT_MODE_STYLE=Object.freeze({
  tram:{label:'Tram',color:'#c8102e',weight:3.5,dash:null},
  metro:{label:'Metro',color:'#1f4fbf',weight:4.5,dash:null},
  funicular:{label:'Funicular',color:'#6b3fa0',weight:3,dash:'6 3'},
  aerial_lift:{label:'Cable car',color:'#6b3fa0',weight:2.5,dash:'2 4'},
  rack_railway:{label:'Rack railway',color:'#6b3fa0',weight:3,dash:null},
  ferry:{label:'Ferry',color:'#0b7a8a',weight:2.5,dash:'8 6'},
  cable_tram:{label:'Cable tram',color:'#c8102e',weight:3,dash:'4 2'},
  monorail:{label:'Monorail',color:'#1f4fbf',weight:3.5,dash:'10 3'}});
const HASH=/^[a-f0-9]{64}$/;
// The layer's bytes may live in a data repository: transit-data/manifest.json is then a
// pointer (docs/DATA_LAYERS_OUTSIDE_PAGES.md). Only this exact shape is followed: the raw
// host, an allowed repository, a full commit and the manifest's own hash in the path.
const POINTER_BASE=/^https:\/\/raw\.githubusercontent\.com\/gravelcycles\/eurail-transit-data(?:-[0-9]+)?\/[a-f0-9]{40}\/snapshots\/([a-f0-9]{64})\/$/;
export function transitPointerBase(pointer){
  const base=pointer?.delivery?.baseUrl,sha=pointer?.manifest?.sha256,match=typeof base==='string'?POINTER_BASE.exec(base):null;
  if(pointer?.schemaVersion!==1||pointer.kind!=='transit_atlas_pointer'||!match||match[1]!==sha||pointer.manifest.path!=='manifest.json')throw new Error('Unsupported transit pointer');
  return{base,manifest:{path:'manifest.json',sha256:sha}};
}

export function intersects(a,b){return Array.isArray(a)&&a.length===4&&a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
export function transitCount(route,day,dates){const i=dates.indexOf(day);return day==='all'?(route.dates||[]).reduce((n,v)=>n+(Number(v)||0),0):i<0?0:Number(route.dates?.[i])||0;}
// Estimated-headway lines (transit_data/headway.py): the feed's headway windows
// (frequencies.txt, exact_times=0) per service date. A count of stated windows, never
// of trips: it decides only whether the line is drawn on that date, never a total.
export function transitHeadwayWindows(route,day,dates){const v=route?.headwayDays;if(!Array.isArray(v))return 0;const i=dates.indexOf(day);return day==='all'?v.reduce((n,x)=>n+(Number(x)||0),0):i<0?0:Number(v[i])||0;}
export function transitRuns(route,day,dates){return transitCount(route,day,dates)>0||transitHeadwayWindows(route,day,dates)>0;}

// Viewport selection: nearest regions/packets first, inside explicit budgets.
export function selectEntries(rows,bounds,limit,budgets={bytes:Infinity,decoded:Infinity}){
  const c=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2],d=e=>{const b=e.bbox;return((b[0]+b[2])/2-c[0])**2+((b[1]+b[3])/2-c[1])**2;};
  const hits=rows.filter(e=>intersects(e.bbox,bounds)).sort((a,b)=>d(a)-d(b)||String(a.key).localeCompare(String(b.key)));
  const out=[];let bytes=0,decoded=0;
  for(const e of hits){if(out.length>=limit||bytes+(e.bytes||0)>budgets.bytes||decoded+(e.uncompressedBytes||0)>budgets.decoded)continue;out.push(e);bytes+=e.bytes||0;decoded+=e.uncompressedBytes||0;}
  return{entries:out,limited:hits.length>out.length};
}

export function visibleRoutes(packets,{modes,day,dates,bounds},limit=TRANSIT_LIMITS.routes){
  const seen=new Map();let limited=false;
  for(const p of packets)for(const r of p.routes||[]){
    if(seen.has(r.id)||!modes.has(r.mode)||!intersects(r.bbox,bounds)||!transitRuns(r,day,dates))continue;
    if(seen.size>=limit){limited=true;break;}
    seen.set(r.id,r);
  }
  return{routes:[...seen.values()],limited};
}

// Wide-zoom overview (below the manifest's minimumZoom): one small packet,
// transit-data/overview.json.gz, built with this layer's week and hash-named in
// its manifest. Markers per city network; generalized lines from OVERVIEW_LINE_ZOOM.
export const OVERVIEW_LINE_ZOOM=6;
export function decodePath(flat,quantum=1e-4){const out=[];let x=0,y=0;for(let i=0;i+1<flat.length;i+=2){x+=flat[i];y+=flat[i+1];out.push([+(y*quantum).toFixed(5),+(x*quantum).toFixed(5)]);}return out;}
const dayCount=(dates,day,all)=>day==='all'?(dates||[]).reduce((n,v)=>n+(Number(v)||0),0):Number((dates||[])[all.indexOf(day)])||0;
export function overviewSelection(overview,{modes,day,dates,bounds,zoom}){
  const cities=[],lines=[],keep=new Set();
  (overview?.cities||[]).forEach((c,i)=>{
    const shown=Object.entries(c.modes||{}).filter(([m,v])=>modes.has(m)&&(dayCount(v.dates,day,dates)>0||dayCount(v.headwayDays,day,dates)>0));
    if(!shown.length||!intersects(c.bbox,bounds))return;
    keep.add(i);cities.push({...c,index:i,shownModes:shown.map(([m])=>m),patterns:shown.reduce((n,[,v])=>n+(v.patterns||0),0),lineCount:shown.reduce((n,[,v])=>n+(v.lines||0),0)});
  });
  if(zoom>=OVERVIEW_LINE_ZOOM)for(const l of overview?.lines||[])if(keep.has(l.city)&&modes.has(l.mode)&&(dayCount(l.dates,day,dates)>0||dayCount(l.headwayDays,day,dates)>0))lines.push(l);
  return{cities,lines};
}
// A build from before the overview product (or while its overview cannot load):
// approximate areas from the catalogue, no lines. A region's bbox is its routes'
// unclipped box, so a route crossing many z5 tiles (or one bad coordinate) would
// stack markers far from the city: each box is clipped to its own tile, and the
// regions of one source that touch are folded into one area marker placed on the
// region with the most patterns.
const clip=(b,t)=>t?[Math.max(b[0],t[0]),Math.max(b[1],t[1]),Math.min(b[2],t[2]),Math.min(b[3],t[3])]:b;
const touches=(a,b)=>a[0]<=b[2]+1e-9&&b[0]<=a[2]+1e-9&&a[1]<=b[3]+1e-9&&b[1]<=a[3]+1e-9;
export function catalogueOverview(catalogue,dates){
  const ones=(dates||[]).map(()=>1),bySource=new Map();
  for(const r of catalogue?.regions||[]){
    let box=clip(r.bbox,r.tileBounds);
    if(!(box[0]<=box[2]&&box[1]<=box[3]))box=r.tileBounds||r.bbox;
    if(!bySource.has(r.sourceId))bySource.set(r.sourceId,[]);
    bySource.get(r.sourceId).push({r,box,tile:r.tileBounds||box});
  }
  const cities=[];
  for(const[sourceId,items]of[...bySource].sort((a,b)=>String(a[0]).localeCompare(String(b[0])))){
    const seen=new Set();
    for(let i=0;i<items.length;i++){
      if(seen.has(i))continue;
      const group=[],stack=[i];seen.add(i);
      while(stack.length){const k=stack.pop();group.push(items[k]);for(let j=0;j<items.length;j++)if(!seen.has(j)&&touches(items[k].tile,items[j].tile)){seen.add(j);stack.push(j);}}
      const main=group.reduce((a,b)=>(b.r.patterns||0)>(a.r.patterns||0)?b:a),modes=new Set(group.flatMap(g=>g.r.modes||[]));
      // Routes repeat in every tile they cross: the largest region's count, never a sum.
      cities.push({id:main.r.key,sourceId,label:'',approximate:true,regions:group.length,bbox:main.box,centre:[(main.box[0]+main.box[2])/2,(main.box[1]+main.box[3])/2],
        modes:Object.fromEntries([...modes].map(m=>[m,{patterns:main.r.patterns,lines:0,dates:ones}]))});
    }
  }
  return{cities,lines:[],fallback:true};
}
const MARKER_MODE=['metro','tram','rack_railway','funicular','aerial_lift','monorail','cable_tram','ferry'];
export function markerMode(modes){return MARKER_MODE.find(m=>modes.includes(m))||modes[0];}
export function markerRadius(patterns,zoom){return Math.min(11,3+Math.log2(1+(patterns||0))*0.8)*(zoom>=OVERVIEW_LINE_ZOOM?0.75:1);}
// Clicking a city opens its network at a zoom where the real lines draw.
export function cityZoom(boundsZoom,minimumZoom){return Math.max(minimumZoom,Math.min(14,boundsZoom));}

async function sha256Hex(bytes){const d=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}

// A serving host that accepts the connection and then sends nothing would leave "Loading…" up
// for ever. Each object gets this long (request and body); after it the request is aborted and
// fails like any unavailable object, so start-up ends with the usual "not available" message.
export const TRANSIT_TIMEOUT_MS=20000;
export class TransitRequests{
  constructor(base,fetcher=globalThis.fetch.bind(globalThis),timeoutMs=TRANSIT_TIMEOUT_MS){this.timeoutMs=timeoutMs;this.base=new URL(base,globalThis.document?.baseURI||globalThis.location?.href);this.fetcher=fetcher;this.controller=new AbortController();this.cache=new Map();}
  abort(){this.controller.abort();this.controller=new AbortController();this.cache.clear();}
  async json(descriptorOrPath,kind){
    const desc=typeof descriptorOrPath==='string'?{path:descriptorOrPath}:descriptorOrPath;
    const url=new URL(desc.path,this.base);
    if(url.origin!==this.base.origin||!url.pathname.startsWith(this.base.pathname))throw new Error('Transit asset outside its base');
    if(this.cache.has(url.href))return this.cache.get(url.href);
    const outer=this.controller.signal,own=new AbortController(),signal=own.signal;
    const stop=()=>own.abort();
    if(outer.aborted)own.abort();else outer.addEventListener('abort',stop,{once:true});
    const promise=(async()=>{
      let timer,raw;
      const late=new Promise((_,reject)=>{timer=setTimeout(()=>{own.abort();reject(new Error('Transit asset timed out'));},this.timeoutMs);});
      try{
        raw=await Promise.race([late,(async()=>{
          const response=await this.fetcher(url.href,{signal,credentials:'same-origin'});
          if(!response.ok)throw new Error('Transit asset unavailable');
          return new Uint8Array(await response.arrayBuffer());})()]);
      }finally{clearTimeout(timer);outer.removeEventListener('abort',stop);}
      if(desc.sha256){if(!HASH.test(desc.sha256)||await sha256Hex(raw)!==desc.sha256)throw new Error('Transit asset hash mismatch');}
      let text;
      if(desc.path.endsWith('.gz')){const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));text=await new Response(stream).text();}
      else text=new TextDecoder().decode(raw);
      const value=JSON.parse(text);
      if(value?.schemaVersion!==1||(kind&&value.kind!==kind))throw new Error('Unsupported transit data format');
      return value;
    })();
    this.cache.set(url.href,promise);
    promise.catch(()=>this.cache.delete(url.href));
    return promise;
  }
}

// Leaflet layer. L is the page's Leaflet global; nothing is fetched until enable().
export class TransitLayer{
  constructor(map,{base='transit-data/',L=globalThis.L,onSelect=null,onStatus=null,fetcher,timeoutMs=TRANSIT_TIMEOUT_MS}={}){this.timeoutMs=timeoutMs;
    this.map=map;this.L=L;this.base=base;this.onSelect=onSelect;this.onStatus=onStatus;this.fetcher=fetcher;
    this.enabled=false;this.modes=new Set(['tram','metro']);this.day=null;this.generation=0;this.group=null;
  }
  async enable(){
    if(this.enabled)return;
    this.enabled=true;this.requests=new TransitRequests(this.base,this.fetcher,this.timeoutMs);
    this.renderer=this.L.canvas({padding:0.2});
    // City markers are SVG: the rail station hit-test gives painted station dots
    // precedence over an SVG path but takes every tap inside its tolerance halo
    // from a canvas, which would make markers at main stations untappable.
    if(this.map.getPane&&!this.map.getPane('transitCities'))this.map.createPane('transitCities').style.zIndex=450;
    this.cityRenderer=this.L.svg?this.L.svg({pane:'transitCities',padding:0.2}):this.renderer;this.group=this.L.layerGroup().addTo(this.map);
    let first=await this.requests.json('manifest.json');
    // A pointer: read the hash-checked manifest and everything after it from the pinned base.
    this.pointer=null;
    if(first.kind==='transit_atlas_pointer'){
      const target=transitPointerBase(first);this.pointer=first;
      this.requests.abort();this.requests=new TransitRequests(target.base,this.fetcher,this.timeoutMs);
      first=await this.requests.json(target.manifest,'transit_atlas_manifest');
      if(!this.enabled)return;
    }
    // A recorded hold (its week has passed, or its sources changed) draws nothing and says why.
    if(first.kind==='transit_atlas_hold'){this.hold=first;this.status(first.message);return;}
    if(first.kind!=='transit_atlas_manifest')throw new Error('Unsupported transit data format');
    this.manifest=first;this.hold=null;
    if(!this.modesChosen)this.modes=new Set(this.manifest.modes||['tram','metro']);
    this.dates=this.manifest.dates;this.day=this.day==='all'||this.dates.includes(this.day)?this.day:defaultDay(this.dates);
    this.catalogue=await this.requests.json(this.manifest.tiles.catalogue,'transit_atlas_tile_catalogue');
    this.overview=null;
    this.refresh=()=>this.draw();this.map.on('moveend zoomend',this.refresh);
    await this.draw();
  }
  disable(){
    if(!this.enabled)return;
    this.enabled=false;this.generation++;this.requests?.abort();
    if(this.refresh)this.map.off('moveend zoomend',this.refresh);
    this.group?.remove();this.group=null;this.manifest=null;this.hold=null;this.catalogue=null;this.overview=null;
  }
  setModes(modes){this.modes=new Set(modes);this.modesChosen=true;return this.enabled?this.draw():null;}
  setDay(day){this.day=day;return this.enabled?this.draw():null;}
  bounds(){const b=this.map.getBounds();return[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];}
  async draw(){
    const generation=++this.generation,box=this.bounds();
    if(this.map.getZoom()<this.manifest.minimumZoom)return this.drawOverview(generation,box);
    const regions=selectEntries(this.catalogue.regions,box,TRANSIT_LIMITS.regions).entries;
    const indexes=await Promise.all(regions.map(r=>this.requests.json(r.index,'transit_atlas_tile_region')));
    const picked=selectEntries(indexes.flatMap(i=>i.entries.filter(e=>e.modes.some(m=>this.modes.has(m)))),box,TRANSIT_LIMITS.tiles,{bytes:TRANSIT_LIMITS.tileBytes,decoded:TRANSIT_LIMITS.decodedBytes});
    const packets=await Promise.all(picked.entries.map(e=>this.requests.json(e,'transit_atlas_tile')));
    if(generation!==this.generation||!this.enabled)return{stale:true};
    const{routes,limited}=visibleRoutes(packets,{modes:this.modes,day:this.day,dates:this.dates,bounds:box});
    this.group.clearLayers();this.lastRoutes=routes;
    const order=['ferry','aerial_lift','funicular','rack_railway','tram','cable_tram','monorail','metro'];
    routes.sort((a,b)=>order.indexOf(a.mode)-order.indexOf(b.mode));
    for(const r of routes){
      const s=TRANSIT_MODE_STYLE[r.mode]||TRANSIT_MODE_STYLE.tram;
      const line=this.L.polyline(r.coordinates.map(([lon,lat])=>[lat,lon]),{renderer:this.renderer,color:s.color,weight:s.weight,dashArray:r.geometry==='schematic'?'3 5':s.dash,opacity:0.9,interactive:true});
      line.on('click',()=>this.select(r));line.addTo(this.group);
      // Partly held lines and lines the train layer also shows get a thin white centre dash.
      if(r.partlyHeld||r.alsoShownAsTrain)this.L.polyline(line.getLatLngs(),{renderer:this.renderer,color:'#ffffff',weight:1,dashArray:'2 6',opacity:0.95,interactive:false}).addTo(this.group);
    }
    if(this.map.getZoom()>=13){
      const stops=new Map(),wanted=new Set(routes.flatMap(r=>r.stopIds));
      for(const p of packets)for(const s of p.stops||[])if(wanted.has(s.id)&&s.lat!=null&&stops.size<TRANSIT_LIMITS.stops)stops.set(s.id,s);
      for(const s of stops.values())this.L.circleMarker([s.lat,s.lon],{renderer:this.renderer,radius:2.5,color:'#222',weight:1,fillColor:'#fff',fillOpacity:1,interactive:false}).addTo(this.group);
    }
    const byMode={};for(const r of routes)byMode[r.mode]=(byMode[r.mode]||0)+1;
    const estimated=routes.filter(r=>transitHeadwayWindows(r,this.day,this.dates)>0).length;
    this.status((limited||picked.limited?'Partial view: zoom in or filter. ':'')+(routes.length?Object.entries(byMode).map(([m,n])=>`${n} ${TRANSIT_MODE_STYLE[m]?.label||m} route patterns`).join(' · ')+(estimated?` (${estimated} from estimated headways)`:''):'No selected city transit in this view on this date.'));
    return{routes:routes.length,byMode,limited:limited||picked.limited,estimated};
  }
  async loadOverview(){
    // Fetched once per activation, only when a wide view first needs it; hash-checked against the manifest.
    // A failed fetch or hash check is not kept: the next draw retries, and this one shows catalogue areas.
    if(!this.overview)this.overview=this.manifest.overview?this.requests.json(this.manifest.overview,'transit_atlas_overview'):Promise.resolve(catalogueOverview(this.catalogue,this.dates));
    const pending=this.overview;
    try{const value=await pending;this.overviewFailed=false;return value;}
    catch(error){if(this.overview===pending)this.overview=null;this.overviewFailed=true;return catalogueOverview(this.catalogue,this.dates);}
  }
  async drawOverview(generation,box){
    const overview=await this.loadOverview(),zoom=this.map.getZoom();
    if(generation!==this.generation||!this.enabled)return{stale:true};
    const{cities,lines}=overviewSelection(overview,{modes:this.modes,day:this.day,dates:this.dates,bounds:box,zoom});
    this.group.clearLayers();this.lastRoutes=[];
    const q=overview.quantum||1e-4,order=['ferry','aerial_lift','funicular','rack_railway','tram','cable_tram','monorail','metro'];
    // One canvas path per city and mode (not per line): about a fifth of the layers at zoom 6.
    const merged=new Map();
    for(const l of lines){const key=l.city+'|'+l.mode;if(!merged.has(key))merged.set(key,{city:l.city,mode:l.mode,paths:[]});merged.get(key).paths.push(...l.paths);}
    const groups=[...merged.values()].sort((a,b)=>order.indexOf(a.mode)-order.indexOf(b.mode));
    for(const g of groups){
      const s=TRANSIT_MODE_STYLE[g.mode]||TRANSIT_MODE_STYLE.tram,city=overview.cities[g.city];
      const line=this.L.polyline(g.paths.map(p=>decodePath(p,q)),{renderer:this.renderer,color:s.color,weight:Math.max(1.5,s.weight*(zoom>=8?0.7:0.5)),dashArray:s.dash,opacity:0.85,interactive:true});
      line.on('click',()=>this.openCity(city));line.addTo(this.group);
    }
    for(const c of cities){
      const mode=markerMode(c.shownModes),s=TRANSIT_MODE_STYLE[mode]||TRANSIT_MODE_STYLE.tram;
      const marker=this.L.circleMarker([c.centre[1],c.centre[0]],{renderer:this.cityRenderer,pane:'transitCities',radius:markerRadius(c.patterns,zoom),color:'#ffffff',weight:1.5,fillColor:s.color,fillOpacity:0.9,interactive:true});
      marker.on('click',()=>this.openCity(c));marker.addTo(this.group);
    }
    const byMode={};for(const c of cities)for(const m of c.shownModes)byMode[m]=(byMode[m]||0)+1;
    const fallback=!!overview.fallback,unit=n=>fallback?(n===1?'approximate area':'approximate areas'):(n===1?'city':'cities');
    const note=this.overviewFailed?'The transit overview could not be loaded; showing approximate areas and retrying on the next move. ':'';
    this.status(note+(cities.length?`Overview: ${Object.entries(byMode).map(([m,n])=>`${n} ${unit(n)} with ${(TRANSIT_MODE_STYLE[m]?.label||m).toLowerCase()} lines`).join(' · ')}. Tap ${fallback?'an area':'a city'}, or zoom in to ${this.manifest.minimumZoom}+, for its full network.`:'No selected city transit in this view on this date.'));
    return{routes:0,overview:true,cities:cities.length,lines:lines.length,byMode,fallback,overviewFailed:!!this.overviewFailed};
  }
  openCity(city){
    if(!this.enabled||!city?.bbox)return;
    const b=city.bbox,bounds=this.L.latLngBounds([b[1],b[0]],[b[3],b[2]]);
    this.map.flyTo(bounds.getCenter(),cityZoom(this.map.getBoundsZoom(bounds),this.manifest.minimumZoom));
  }
  async select(route){if(!this.enabled)return null;const detail=await this.requests.json(route.detail,'transit_atlas_detail');this.onSelect?.(detail,this.day);return detail;}
  status(text){this.onStatus?.(text);}
}

// Timed departures of one pattern on one service date, from native clocks (agency timezone).
// A template with exact windows (exact_times=1) runs at start, start+headway, … before end, as
// GTFS defines; a headway window (exact_times=0) is not a timed departure and is never listed.
export function departures(detail,day){
  const out=[];
  for(const t of detail.trips){
    if(!t.serviceDates.includes(day)||t.clockStartSeconds==null)continue;
    const freqs=t.frequencies||[];
    if(freqs.length){for(const f of freqs)if(f.exactTimes===1)for(let s=f.startSeconds;s<f.endSeconds;s+=f.headwaySeconds)out.push({trip:t.sourceTripId,seconds:s,headsign:t.headsign});continue;}
    const first=detail.clockProfiles[t.clockProfile][0];const s=t.clockStartSeconds+(first[1]??first[0]??0);out.push({trip:t.sourceTripId,seconds:s,headsign:t.headsign});
  }
  return out.sort((a,b)=>a.seconds-b.seconds);
}
// The feed's headway windows (exact_times=0; for a converted feed, the converter's restatement) of one pattern on one service date, as stated.
export function headwayWindows(detail,day){
  const out=[];
  for(const t of detail.trips||[]){if(!t.serviceDates?.includes(day))continue;for(const f of t.frequencies||[])if(f.exactTimes!==1)out.push({trip:t.sourceTripId,headsign:t.headsign,start:f.startSeconds,end:f.endSeconds,headway:f.headwaySeconds});}
  return out.sort((a,b)=>a.start-b.start||a.end-b.end||String(a.trip).localeCompare(String(b.trip)));
}
export function headwayMinutes(seconds){const m=seconds/60;return seconds<60?`${seconds} s`:Number.isInteger(m)?`${m} min`:`${m.toFixed(1)} min`;}
// The spans the windows cover: windows that touch or overlap are joined, a gap between
// windows starts a new span. Each span keeps the range of headways stated inside it.
export function headwaySpans(windows){
  const spans=[];
  for(const w of [...windows].sort((a,b)=>a.start-b.start||a.end-b.end)){
    const last=spans[spans.length-1];
    if(last&&w.start<=last.end){last.end=Math.max(last.end,w.end);last.lo=Math.min(last.lo,w.headway);last.hi=Math.max(last.hi,w.headway);}
    else spans.push({start:w.start,end:w.end,lo:w.headway,hi:w.headway});
  }
  return spans;
}
// One sentence per day: for each span of windows, the range of stated headways and its
// start and end. A gap between windows is never bridged: each span is stated on its own.
// An estimate, labelled with its basis; it is not a number of trips.
export function headwaySummary(windows){
  if(!windows.length)return'';
  const every=s=>s.lo===s.hi?headwayMinutes(s.lo):headwayMinutes(s.lo).replace(' min','')+'–'+headwayMinutes(s.hi);
  const spans=headwaySpans(windows);
  return`${spans.map(s=>`about every ${every(s)}, ${clock(s.start)}–${clock(s.end)}`).join('; ')}${spans.length>1?' (no service stated between these spans)':''}, estimated from the feed's headway windows`;
}
export function clock(seconds){const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60);return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}${h>=24?' (+1)':''}`;}

// The layer's own dates decide the day shown: today when it is inside the week, else the first day.
export function defaultDay(dates,now=new Date()){const today=now.toISOString().slice(0,10);return dates.includes(today)?today:dates[0];}

const ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>ESC[c]);
const safeURL=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:'';}catch{return'';}};
const link=(url,text)=>{const u=safeURL(url);return u?`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)} ↗</a>`:esc(text);};
const LICENCE_NAMES={'CC0-1.0':'CC0 1.0','CC-BY-4.0':'CC BY 4.0','CC-BY-SA-4.0':'CC BY-SA 4.0','ODbL-1.0':'ODbL 1.0','Licence-Ouverte-2.0':'Licence Ouverte 2.0','NLOD-2.0':'NLOD 2.0','Swiss-ODmCH-Terms':'opentransportdata.swiss terms of use','HR-Open-Licence':'Otvorena dozvola (Republic of Croatia open licence)','RS-Open-Data-Licence':'Serbian Open Data Licence','TR-Gaziantep-Open-Data-Licence':'Gaziantep Açık Veri Lisansı','ES-CRTM-Open-Data-Licence':'CRTM open-data licence','OGL-UK-3.0':'Open Government Licence v3.0','Licence-Mobilites':'Licence Mobilités','PL-ZTM-Warszawa-Timetable-Data-Terms':'ZTM Warszawa timetable-data terms','none-stated':'licence: none stated'};

// Lines held from the layer, with the reviewed reason. A line none of whose
// route rows is admitted (e.g. a wholly held U-Bahn line) is invisible on the
// map, so it must be listed here.
export function transitHeldLines(manifest){
  const out=[];
  for(const s of manifest?.sources||[])for(const h of s.heldLines||[])
    out.push({sourceId:s.id,source:s.name||s.id,operator:h.operator||'',label:h.label||h.sourceRouteId,reason:h.reason||'Held after review.',whole:!h.otherRowsOfLineAdmitted,tripDates:Number(h.tripServiceDates)||0});
  return out.sort((a,b)=>Number(b.whole)-Number(a.whole)||b.tripDates-a.tripDates||a.operator.localeCompare(b.operator)||String(a.label).localeCompare(String(b.label)));
}

export function transitEstimatedLines(manifest){
  return(manifest?.sources||[]).flatMap(s=>((s.estimatedHeadway||{}).lines||[]).filter(l=>l.basis!=='timed').map(l=>`${l.label||l.sourceRouteId} (${l.operator||s.name||s.id})`));
}

export function transitCredits(manifest){
  return(manifest?.credits||[]).map(c=>({...c,licenceName:LICENCE_NAMES[c.licence]||c.licence}));
}

// Sources shown from an archive already held because this week's download kept failing
// (transit_data/weekly.py): named with that archive's own retrieval date, never as fresh.
export function transitFallbackSources(manifest){
  return(manifest?.sources||[]).filter(s=>s.archiveRetrieval?.kind==='fallback')
    .map(s=>({sourceId:s.id,name:s.name||s.id,retrievedAt:String(s.archiveRetrieval.retrievedAt||'').slice(0,10),reason:s.archiveRetrieval.reason||''}));
}

// Every source's archive retrieval date (sources[].retrievedAt), so an older archive is
// never implied to be this week's; a cached archive shown under a recorded exception says so.
export function transitRetrievalDates(manifest){
  const out={};
  for(const s of manifest?.sources||[])out[s.id]={retrievedAt:String(s.retrievedAt||'').slice(0,10),ageException:s.archiveRetrieval?.ageException||''};
  return out;
}

export function transitPanelHTML(document,{heldLimit=40,day=null}={}){
  if(!document)return'';
  if(document.kind==='transit_atlas_hold')return`<p class="transit-hold"><strong>Held.</strong> ${esc(document.message)}</p>`;
  const week=document.serviceWeek||{},credits=transitCredits(document),held=transitHeldLines(document),whole=held.filter(h=>h.whole);
  const retrieved=transitRetrievalDates(document);
  const swiss=credits.some(c=>c.licence==='Swiss-ODmCH-Terms');
  const heldRows=held.slice(0,heldLimit).map(h=>`<li><strong>${esc(h.label)}</strong> · ${esc(h.operator||h.source)}${h.whole?' · <em>whole line held</em>':' · part of line held'}<br><span>${esc(h.reason)}</span></li>`).join('');
  const days=(document.dates||[]).map(d=>`<option value="${esc(d)}"${d===day?' selected':''}>${esc(new Date(d+'T12:00:00Z').toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}))}</option>`).join('');
  return`<p class="transit-week"><strong>${esc(week.label||'')}</strong> — separate from the rail map's dates. ${esc(week.note||'')}</p>`+
    (days?`<label class="select-label" for="transitDay"><span>Transit day</span><select id="transitDay">${days}<option value="all"${day==='all'?' selected':''}>All days of the week</option></select></label>`:'')+
    `<p class="helper">Counts are scheduled source records per mode, separate from trains and buses. Coverage is partial; pass inclusion is unknown. White centre dashes mark lines that are partly held or also shown as trains.</p>`+
    (transitEstimatedLines(document).length?`<p class="helper transit-estimate">Some lines (${esc(transitEstimatedLines(document).join(', '))}) are drawn from the feed's headway windows, not timed trips: their panels show the windows as estimates, and they are not counted as recorded departures.</p>`:'')+
    ((document.heldSources||[]).length?`<details class="transit-held"><summary>Sources held this week (${document.heldSources.length.toLocaleString()}): not drawn</summary><ul>${document.heldSources.map(h=>`<li><strong>${esc(h.sourceId)}</strong> · ${esc(h.reason)}</li>`).join('')}</ul></details>`:'')+
    (transitFallbackSources(document).length?`<details class="transit-held transit-fallback"><summary>Sources shown from an earlier archive (${transitFallbackSources(document).length.toLocaleString()})</summary><ul>${transitFallbackSources(document).map(f=>`<li><strong>${esc(f.name)}</strong> · archive retrieved ${esc(f.retrievedAt)}<br><span>${esc(f.reason)}</span></li>`).join('')}</ul></details>`:'')+
    (held.length?`<details class="transit-held"><summary>Held lines (${held.length.toLocaleString()}${whole.length?`, ${whole.length.toLocaleString()} not drawn at all`:''})</summary><ul>${heldRows}</ul>${held.length>heldLimit?`<p class="helper">${(held.length-heldLimit).toLocaleString()} more held route rows are listed in the transit manifest.</p>`:''}</details>`:'')+
    `<details class="transit-credits" open><summary>Transit sources & credits (${credits.length})</summary>${swiss?'<p>Timetable data: <a href="https://opentransportdata.swiss/" target="_blank" rel="noopener noreferrer">opentransportdata.swiss</a></p>':''}<ul>${credits.map(c=>`<li>${esc(c.attribution)} · ${link(c.licenceUrl,c.licenceName)} · ${link(c.sourcePage,'Source')}${c.dataUpdated?.date?` · Data last updated ${esc(c.dataUpdated.date)}`:''}${retrieved[c.sourceId]?.retrievedAt?` · Archive retrieved ${esc(retrieved[c.sourceId].retrievedAt)}`:''}${retrieved[c.sourceId]?.ageException?`<br><span>Older archive shown by recorded exception: ${esc(retrieved[c.sourceId].ageException)}</span>`:''}${c.licenceNotice?`<br><span class="silent-licence">${esc(c.licenceNotice.label)}. ${esc(c.licenceNotice.takedown)}</span>`:''}</li>`).join('')}</ul>${document.odblNotice||document.databaseOffer?.path?`<p class="helper">${document.odblNotice?esc(document.odblNotice):''}${document.databaseOffer?.path?` ${link(new URL('transit-data/'+document.databaseOffer.path,globalThis.document?.baseURI||'https://example.invalid/').href,'Modified database offer')}`:''}</p>`:''}</details>`;
}

const dayName=d=>{const t=new Date(d+'T12:00:00Z');return isNaN(t)?d:t.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});};
// The panel for a line admitted as estimated headway (detail.basis): the basis label and the
// stated windows per day; timed trips of a mixed line are shown separately, never added.
function headwayHTML(detail,day){
  const h=detail.headway||{},days=day==='all'?(detail.trips||[]).flatMap(t=>t.serviceDates||[]).filter((d,i,a)=>a.indexOf(d)===i).sort():[day];
  const blocks=days.map(d=>{const w=headwayWindows(detail,d),timed=departures(detail,d).length;
    if(!w.length&&!timed)return'';
    const rows=w.map(x=>`<li>${esc(clock(x.start))}–${esc(clock(x.end))} · about every ${esc(headwayMinutes(x.headway))}${x.headsign?` · towards ${esc(x.headsign)}`:''}</li>`).join('');
    return`<div class="transit-headway-day"><p><strong>${esc(dayName(d))}</strong>: ${w.length?`<span class="transit-estimate">Estimated service: ${esc(headwaySummary(w))}.</span>`:'No headway windows on this day.'}</p>`+
      (detail.basis==='mixed'||timed?`<p>${timed?`${timed.toLocaleString()} timed departures recorded on this day (exact times; listed separately from the estimate)`:'No timed departures recorded on this day'}.</p>`:'')+
      (rows?`<details class="transit-windows"><summary>Headway windows as stated (${w.length.toLocaleString()})</summary><ul>${rows}</ul></details>`:'')+'</div>';}).join('');
  return`<p class="transit-estimate-basis"><strong>${detail.basis==='mixed'?'Mixed: estimated headways and timed trips.':'Estimated headways.'}</strong> ${esc(h.label||'')}</p>`+(blocks||`<p>No service on ${esc(day==='all'?'these days':dayName(day))}.</p>`);
}

export function transitDetailHTML(detail,day){
  const style=TRANSIT_MODE_STYLE[detail.mode]||{label:detail.mode},p=detail.provenance||{},estimated=detail.basis==='estimated_headway'||detail.basis==='mixed',list=estimated?[]:departures(detail,day);
  return`<button class="close-button" id="transitDetailClose" aria-label="Close city transit line">×</button><p class="eyebrow">${esc(style.label)} · CITY TRANSIT${estimated?' · ESTIMATED HEADWAY':''}</p><h3>${esc(detail.label||detail.sourceRouteId)}</h3><p>${esc(detail.operator||'Operator unavailable')}</p>`+
    (detail.partlyHeld?`<p class="transit-hold">${esc(detail.partlyHeld.note)}</p>`:'')+
    (detail.alsoShownAsTrain?`<p class="helper">The train layer also shows this line (${esc(detail.alsoShownAsTrain.railRoute||'')}); it is not counted twice in either layer's totals.</p>`:'')+
    (estimated?headwayHTML(detail,day):`<p>${list.length.toLocaleString()} recorded departures on ${esc(day)} · ${esc(detail.countBasis||'')}</p>`)+`<p class="helper">${esc(detail.geometryWarning||'')} Eurail / Interrail inclusion: unknown.</p>`+
    `<p class="helper">${esc(p.attribution||'')} · ${link(p.licenceUrl,LICENCE_NAMES[p.licence]||p.licence||'Licence')} · ${link(p.sourcePage,'Source')}</p>`;
}
