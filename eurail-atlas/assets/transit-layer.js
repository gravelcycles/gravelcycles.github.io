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

export function intersects(a,b){return Array.isArray(a)&&a.length===4&&a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
export function transitCount(route,day,dates){const i=dates.indexOf(day);return day==='all'?(route.dates||[]).reduce((n,v)=>n+(Number(v)||0),0):i<0?0:Number(route.dates?.[i])||0;}

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
    if(seen.has(r.id)||!modes.has(r.mode)||!intersects(r.bbox,bounds)||transitCount(r,day,dates)<=0)continue;
    if(seen.size>=limit){limited=true;break;}
    seen.set(r.id,r);
  }
  return{routes:[...seen.values()],limited};
}

async function sha256Hex(bytes){const d=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}

export class TransitRequests{
  constructor(base,fetcher=globalThis.fetch.bind(globalThis)){this.base=new URL(base,globalThis.document?.baseURI||globalThis.location?.href);this.fetcher=fetcher;this.controller=new AbortController();this.cache=new Map();}
  abort(){this.controller.abort();this.controller=new AbortController();this.cache.clear();}
  async json(descriptorOrPath,kind){
    const desc=typeof descriptorOrPath==='string'?{path:descriptorOrPath}:descriptorOrPath;
    const url=new URL(desc.path,this.base);
    if(url.origin!==this.base.origin||!url.pathname.startsWith(this.base.pathname))throw new Error('Transit asset outside its base');
    if(this.cache.has(url.href))return this.cache.get(url.href);
    const signal=this.controller.signal;
    const promise=(async()=>{
      const response=await this.fetcher(url.href,{signal,credentials:'same-origin'});
      if(!response.ok)throw new Error('Transit asset unavailable');
      const raw=new Uint8Array(await response.arrayBuffer());
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
  constructor(map,{base='transit-data/',L=globalThis.L,onSelect=null,onStatus=null,fetcher}={}){
    this.map=map;this.L=L;this.base=base;this.onSelect=onSelect;this.onStatus=onStatus;this.fetcher=fetcher;
    this.enabled=false;this.modes=new Set(['tram','metro']);this.day=null;this.generation=0;this.group=null;
  }
  async enable(){
    if(this.enabled)return;
    this.enabled=true;this.requests=new TransitRequests(this.base,this.fetcher);
    this.renderer=this.L.canvas({padding:0.2});this.group=this.L.layerGroup().addTo(this.map);
    this.manifest=await this.requests.json('manifest.json','transit_atlas_manifest');
    this.dates=this.manifest.dates;this.day=this.day||this.dates[0];
    this.catalogue=await this.requests.json(this.manifest.tiles.catalogue,'transit_atlas_tile_catalogue');
    this.refresh=()=>this.draw();this.map.on('moveend zoomend',this.refresh);
    await this.draw();
  }
  disable(){
    if(!this.enabled)return;
    this.enabled=false;this.generation++;this.requests?.abort();
    if(this.refresh)this.map.off('moveend zoomend',this.refresh);
    this.group?.remove();this.group=null;this.manifest=null;this.catalogue=null;
  }
  setModes(modes){this.modes=new Set(modes);return this.enabled?this.draw():null;}
  setDay(day){this.day=day;return this.enabled?this.draw():null;}
  bounds(){const b=this.map.getBounds();return[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];}
  async draw(){
    const generation=++this.generation,box=this.bounds();
    if(this.map.getZoom()<this.manifest.minimumZoom){this.group.clearLayers();this.status(`Zoom in to see city transit (from zoom ${this.manifest.minimumZoom}).`);return{routes:0};}
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
    this.status((limited||picked.limited?'Partial view: zoom in or filter. ':'')+(routes.length?Object.entries(byMode).map(([m,n])=>`${n} ${TRANSIT_MODE_STYLE[m]?.label||m} route patterns`).join(' · '):'No selected city transit in this view on this date.'));
    return{routes:routes.length,byMode,limited:limited||picked.limited};
  }
  async select(route){const detail=await this.requests.json(route.detail,'transit_atlas_detail');this.onSelect?.(detail,this.day);return detail;}
  status(text){this.onStatus?.(text);}
}

// Departures of one pattern on one service date, from native clocks (agency timezone).
export function departures(detail,day){
  const out=[];
  for(const t of detail.trips){if(!t.serviceDates.includes(day)||t.clockStartSeconds==null)continue;const first=detail.clockProfiles[t.clockProfile][0];const s=t.clockStartSeconds+(first[1]??first[0]??0);out.push({trip:t.sourceTripId,seconds:s,headsign:t.headsign});}
  return out.sort((a,b)=>a.seconds-b.seconds);
}
export function clock(seconds){const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60);return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}${h>=24?' (+1)':''}`;}
