/* The Traffic overview: precomputed raster primitives for the default filters
 * at low zoom (rail_data/physical_heat_display.py::overview_payloads). For a
 * zoom bucket it holds the same quarter-pixel lines and dots, colours and stroke
 * widths the raster worker draws from all sections (rail-lod.js renderWorld,
 * rail-primitives.js quantizedRailPrimitives, map-renderer.js prepareStyles),
 * so the first frame needs no section data. It is shown only while the exact
 * sections are loading, only for the default filters it was computed for, and
 * the interface says so. Counts and picks always come from the sections.
 * Since 28 November it is drawn by the map's own renderer (map-renderer.js
 * RailRenderer.setStaticLayer), beneath the sections, in the same frame as
 * them (docs/design/traffic-convergence.md, option A): there is no separate
 * overview canvas, worker or handoff any more. */
import{FREQUENCY_COLORS}from'./atlas-core.js?v=14a270392708fc8e';
import{rgb}from'./rail-gpu.js?v=14a270392708fc8e';

export const PHYSICAL_OVERVIEW_FORMAT='rail-atlas-physical-heat-overview-v1';
const invalid=message=>{throw new Error('Invalid Traffic overview'+(message?': '+message:''));};

// An overview exists for the default filters and, separately, for the default
// filters with the Eurail pass filter on ("pass").
export function overviewEntry(index,variant){
  const overview=index?.overview?.format===PHYSICAL_OVERVIEW_FORMAT?index.overview:null;
  return!overview?null:variant==='pass'?overview.pass||null:variant==='default'?overview:null;
}
export function overviewBuckets(index,variant='default'){
  const buckets=overviewEntry(index,variant)?.buckets;
  return buckets&&typeof buckets==='object'?Object.keys(buckets).map(Number).filter(Number.isInteger).sort((a,b)=>a-b):[];
}
// The raster worker groups by Math.ceil(zoom). Below the smallest bucket the
// smallest one is used: it is never finer than the screen can show.
export function overviewBucketFor(zoom,buckets){
  if(!buckets.length||!Number.isFinite(zoom))return null;
  const bucket=Math.max(buckets[0],Math.ceil(zoom));
  return buckets.includes(bucket)?bucket:null;
}
// The filters an overview was computed for: the default sources (exactly),
// primary feeds only, every day, no minimum, trains and inferred railway
// sections shown; no pass filter ("default") or the pass filter without the
// review strokes ("pass"). Anything else has no overview (null).
export function overviewVariant(state,overview){
  const sources=overview?.sources;
  if(!Array.isArray(sources)||state.mode!=='traffic'||state.trains===false||state.inferred===false||state.alternatives||state.altSourceIds?.size||(state.day||'all')!=='all'||Number(state.min)>0)return null;
  if(!(state.sources instanceof Set&&state.sources.size===sources.length&&sources.every(id=>state.sources.has(id))))return null;
  if(!state.pass)return'default';
  return!state.review&&overview.pass?'pass':null;
}
export function overviewMatchesState(state,overview){return overviewVariant(state,overview)==='default';}
// Below the delivery's largest overview bucket, with the default filters and
// no focus, the overview is the exact picture: the producer computes it with
// the viewer's own styling, and the bench replay
// (reports/traffic-perf-2026-11-19/overview-exact.md) finds 0 differing lines,
// dots or priorities against the tiles at every quarter zoom it covers. There
// the viewer fetches no tiles for the view. The limit comes from the index:
// zoom 6 for a packet with buckets 3-6, zoom 8 for one with buckets 3-8. The
// pass view, any other filter, a focus, a closer zoom or a failed overview
// packet loads the view's tiles as before.
export function overviewExactBelowZoom(index){const buckets=overviewBuckets(index,'default');return buckets.length?buckets[buckets.length-1]:null;}
export function overviewIsExactFor({state,index,zoom,focused=false,error=false,failed=()=>false}){
  if(state?.mode!=='traffic'||error||focused||!index||!(zoom<overviewExactBelowZoom(index)))return false;
  if(overviewVariant(state,index.overview)!=='default')return false;
  const bucket=overviewBucketFor(zoom,overviewBuckets(index,'default'));
  return bucket!==null&&!failed(bucket);
}

export function decodeOverview(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<12||bytes[0]!==82||bytes[1]!==80||bytes[2]!==72||bytes[3]!==79||view.getUint32(4,true)!==1)invalid('header');
  const headLength=view.getUint32(8,true);if(12+headLength>bytes.length)invalid('header length');
  const head=JSON.parse(new TextDecoder().decode(bytes.subarray(12,12+headLength))),body=bytes.subarray(12+headLength);
  if(head?.format!==PHYSICAL_OVERVIEW_FORMAT||head.schemaVersion!==1||!Number.isInteger(head.bucket)||!Array.isArray(head.groups)||!Array.isArray(head.sources))invalid('metadata');
  const step=.25/2**head.bucket;let cursor=0,read=0;
  const next=()=>{let result=0,shift=0,byte;do{if(cursor>=body.length)invalid('stream');byte=body[cursor++];result+=(byte&127)*2**shift;shift+=7;}while(byte&128);read++;return result%2?-(result+1)/2:result/2;};
  const groups=head.groups.map(row=>{
    if(!Array.isArray(row)||row.length!==7||row.some(n=>!Number.isSafeInteger(n)||n<0)||row[0]>=FREQUENCY_COLORS.length||row[1]>255||row[2]>255)invalid('group');
    const[band,w95,w100,priority,rank,lineCount,dotCount]=row,lines=new Float64Array(lineCount*4),dots=new Float64Array(dotCount*2);
    let x=0,y=0;
    for(let i=0;i<lineCount;i++){x+=next();y+=next();const bx=x+next(),by=y+next();lines[i*4]=x*step;lines[i*4+1]=y*step;lines[i*4+2]=bx*step;lines[i*4+3]=by*step;}
    x=0;y=0;for(let i=0;i<dotCount;i++){x+=next();y+=next();dots[i*2]=x*step;dots[i*2+1]=y*step;}
    return{band,w95,w100,priority,rank,lines,dots};
  });
  if(cursor!==body.length||read!==head.values)invalid('stream length');
  return{bucket:head.bucket,pass:head.pass===true,sources:head.sources,dates:head.dates,visibleSections:head.visibleSections,groups};
}

const colorStrings=new Map();
function colorString(band){
  if(!colorStrings.has(band)){const c=rgb(FREQUENCY_COLORS[band]);colorStrings.set(band,`rgb(${Math.round(c[0]*255)},${Math.round(c[1]*255)},${Math.round(c[2]*255)})`);}
  return colorStrings.get(band);
}
// The worker's style groups for this zoom: colour and quarter-pixel width,
// drawn in priority order (ties: first member in paint order).
export function overviewStyleGroups(overview,zoom){
  const below=zoom<5,groups=new Map();
  for(const group of overview.groups){
    const byte=below?group.w95:group.w100,width=Math.round(byte/255*16*4)/4,color=colorString(group.band),key=color+':'+width;
    let target=groups.get(key);
    if(!target){target={color,width,priority:group.priority,rank:group.rank,members:[]};groups.set(key,target);}
    if(group.rank<target.rank){target.rank=group.rank;target.priority=group.priority;}
    target.members.push(group);
  }
  return[...groups.values()].sort((a,b)=>a.priority-b.priority||a.rank-b.rank);
}


function concatenated(arrays){let length=0;for(const a of arrays)length+=a.length;const out=new Float64Array(length);let offset=0;for(const a of arrays){out.set(a,offset);offset+=a.length;}return out;}

// The renderer's static layer for a decoded overview at a zoom: its style groups
// in paint order, each with one packed array of lines (x1,y1,x2,y2) and one of
// dots (x,y), in zoom-0 world units. The key names the variant, bucket and the
// width set (below zoom 5 the producer's 95% widths apply), so a layer is
// rebuilt only when one of them changes.
export function staticLayerFor(overview,zoom,variant=overview?.pass?'pass':'default'){
  const below=zoom<5;
  return{key:variant+':'+overview.bucket+':'+(below?'w95':'w100'),bucket:overview.bucket,pass:overview.pass===true,
    groups:overviewStyleGroups(overview,zoom).map(group=>({color:group.color,width:group.width,lines:concatenated(group.members.map(m=>m.lines)),dots:concatenated(group.members.map(m=>m.dots))}))};
}
// Decoded primitive memory of a layer or a decoded overview: the bytes of its
// Float64 line and dot arrays.
export function staticLayerBytes(layer){let bytes=0;for(const group of layer?.groups||[])bytes+=(group.lines?.byteLength||0)+(group.dots?.byteLength||0);return bytes;}

// Whether a static layer paints anything within `radius` screen pixels of a
// world point at `scale` (2^zoom). Used for the pointer over the overview and
// to skip fetching for a tap on empty map. A uniform grid of segment numbers
// is built on first use and kept with the layer; the coordinates are read from
// the layer's own arrays (no copy), segment numbers running through each
// group's lines, then its dots.
const grids=new WeakMap();
function segmentAt(layer,grid,s,out){
  let g=0;while(s>=grid.ends[g])g++;
  const group=layer.groups[g],local=s-(g?grid.ends[g-1]:0),lineCount=group.lines.length/4;
  if(local<lineCount){const i=local*4;out[0]=group.lines[i];out[1]=group.lines[i+1];out[2]=group.lines[i+2];out[3]=group.lines[i+3];}
  else{const i=(local-lineCount)*2;out[0]=out[2]=group.dots[i];out[1]=out[3]=group.dots[i+1];}
  return out;
}
function gridFor(layer){
  let grid=grids.get(layer);if(grid)return grid;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,count=0,widest=0;const ends=new Uint32Array(layer.groups.length);
  const each=visit=>{let s=0;for(const group of layer.groups){const l=group.lines,d=group.dots;for(let i=0;i<l.length;i+=4)visit(s++,l[i],l[i+1],l[i+2],l[i+3]);for(let i=0;i<d.length;i+=2)visit(s++,d[i],d[i+1],d[i],d[i+1]);}};
  layer.groups.forEach((group,g)=>{widest=Math.max(widest,group.width);count+=group.lines.length/4+group.dots.length/2;ends[g]=count;});
  if(!count){grid={count:0,widest};grids.set(layer,grid);return grid;}
  each((s,ax,ay,bx,by)=>{minX=Math.min(minX,ax,bx);minY=Math.min(minY,ay,by);maxX=Math.max(maxX,ax,bx);maxY=Math.max(maxY,ay,by);});
  const width=Math.max(maxX-minX,1e-9),height=Math.max(maxY-minY,1e-9),cell=Math.max(16/2**(layer.bucket||0),Math.sqrt(width*height/250000));
  const columns=Math.max(1,Math.ceil(width/cell)+1),rows=Math.max(1,Math.ceil(height/cell)+1),starts=new Uint32Array(columns*rows+1);
  const cellsOf=(ax,ay,bx,by,visit)=>{const x0=Math.floor((Math.min(ax,bx)-minX)/cell),x1=Math.floor((Math.max(ax,bx)-minX)/cell),y0=Math.floor((Math.min(ay,by)-minY)/cell),y1=Math.floor((Math.max(ay,by)-minY)/cell);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)visit(y*columns+x);};
  each((s,ax,ay,bx,by)=>cellsOf(ax,ay,bx,by,c=>{starts[c+1]++;}));
  for(let i=1;i<starts.length;i++)starts[i]+=starts[i-1];
  const fill=starts.slice(0,-1),members=new Uint32Array(starts[starts.length-1]);
  each((s,ax,ay,bx,by)=>cellsOf(ax,ay,bx,by,c=>{members[fill[c]++]=s;}));
  grid={count,widest,minX,minY,cell,columns,rows,starts,members,ends};grids.set(layer,grid);return grid;
}
export function staticLayerNear(layer,x,y,scale,radius=4){
  if(!layer?.groups?.length||!(scale>0))return false;
  const grid=gridFor(layer);if(!grid.count)return false;
  const reach=(radius+grid.widest/2)/scale,reach2=reach*reach,segment=new Float64Array(4);
  const x0=Math.max(0,Math.floor((x-reach-grid.minX)/grid.cell)),x1=Math.min(grid.columns-1,Math.floor((x+reach-grid.minX)/grid.cell));
  const y0=Math.max(0,Math.floor((y-reach-grid.minY)/grid.cell)),y1=Math.min(grid.rows-1,Math.floor((y+reach-grid.minY)/grid.cell));
  for(let row=y0;row<=y1;row++)for(let column=x0;column<=x1;column++){
    const c=row*grid.columns+column;
    for(let k=grid.starts[c];k<grid.starts[c+1];k++){
      const[ax,ay,bx,by]=segmentAt(layer,grid,grid.members[k],segment),dx=bx-ax,dy=by-ay,length2=dx*dx+dy*dy;
      const t=length2>0?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/length2)):0,px=ax+t*dx-x,py=ay+t*dy-y;
      if(px*px+py*py<=reach2)return true;
    }
  }
  return false;
}

// A phone at Europe zoom keeps a filter or focus the overview cannot draw on
// the overview instead of loading every tile in view (review condition 1 of
// docs/design/traffic-convergence.md): all tiles at Europe zoom measured
// 360-818 MB of heap on a phone profile. Returns null (load the view's tiles as
// usual) or why the view is held: 'focus' or 'filter'. Desktop never holds.
export const TRAFFIC_HOLD_BELOW_ZOOM=8;
export function trafficPhoneHold({phone,zoom,exact=false,focused=false,variant=null,viewTiles=0,budget=Infinity,staticAvailable=false}){
  if(!phone||exact||!staticAvailable||!(zoom<TRAFFIC_HOLD_BELOW_ZOOM)||!(viewTiles>budget))return null;
  if(focused)return'focus';
  return variant==='default'?null:'filter';
}

// Which static layer the renderer should hold (app.js updateTrafficOverview):
// in Traffic, for the overview's variant (or a phone hold's), at the bucket for
// the zoom, and beyond the last bucket the last one (the renderer leaves it out
// of the frames whose edges hold the view's sections: staticLayerWanted). A
// focus greys other sections, which the overview cannot show, so only a hold
// keeps it then. 'show' a decoded packet; 'keep' the current layer while this
// one loads, unless the current one is the other variant ('clear': a default
// frame is never shown under the pass filter, nor the reverse).
export function trafficStaticPlan({active,error=false,focused=false,hold=false,variant=null,zoom,buckets=[],decoded=()=>false,currentPass=null}){
  let bucket=variant?overviewBucketFor(zoom,buckets):null;
  if(bucket===null&&variant&&buckets.length&&zoom>buckets[buckets.length-1])bucket=buckets[buckets.length-1];
  if(!active||error||bucket===null||focused&&!hold)return{action:'clear',key:null,bucket:null};
  const key=variant+':'+bucket;
  if(decoded(key))return{action:'show',key,bucket};
  return{action:currentPass!==null&&currentPass!==(variant==='pass')?'clear':'keep',key,bucket};
}
// Whether the frame being drawn still needs the static layer: until the edges
// handed to the renderer hold every exact section the view can show (all its
// tiles merged, or the complete product of a delivery without tiles).
export function staticLayerWanted({mode,documentReady=false,tiled=false,viewTiles=[],merged=new Set()}){
  if(mode!=='traffic'||!documentReady)return true;
  if(!tiled)return false;
  return!viewTiles.every(k=>merged.has(k));
}
