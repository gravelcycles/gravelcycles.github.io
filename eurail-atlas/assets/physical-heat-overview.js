/* The Traffic overview: precomputed raster primitives for the default filters
 * at low zoom (rail_data/physical_heat_display.py::overview_payloads). For a
 * zoom bucket it holds the same quarter-pixel lines and dots, colours and stroke
 * widths the raster worker draws from all sections (rail-lod.js renderWorld,
 * rail-primitives.js quantizedRailPrimitives, map-renderer.js prepareStyles),
 * so the first frame needs no section data. It is shown only while the exact
 * sections are loading, only for the default filters it was computed for, and
 * the interface says so. Counts and picks always come from the sections. */
import{FREQUENCY_COLORS}from'./atlas-core.js?v=bd769551cdd0b233';
import{rgb}from'./rail-gpu.js?v=bd769551cdd0b233';

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

export class TrafficOverviewLayer{
  constructor(map,{before=null,workerFactory}={}){
    this.map=map;this.overview=null;this.visible=false;this.paths=new Map();this.paintView=null;this.sequence=0;this.sentKey=null;this.onPresent=null;
    this.createWorker=workerFactory||(()=>{const url=new URL('./raster-worker.js?v=bd769551cdd0b233',import.meta.url);url.search=new URL(import.meta.url).search;return new Worker(url,{type:'module',name:'rail-atlas-traffic-overview'});});
    // Paint off the interaction thread when possible, like the train raster.
    // The worker starts only when an overview is first shown.
    this.useWorker=typeof OffscreenCanvas!=='undefined'&&typeof Worker!=='undefined';this.worker=null;
    this.canvas=this.makeCanvas(this.useWorker?'bitmaprenderer':'2d');
    if(before?.parentNode)before.parentNode.insertBefore(this.canvas,before);else map.getContainer().appendChild(this.canvas);
    map.on('move',()=>this.pan());map.on('moveend resize zoomend',()=>this.draw());
    map.on('zoomanim',event=>this.zoomAnimation(event));
  }
  makeCanvas(kind){
    const canvas=document.createElement('canvas');canvas.className='atlas-overview-canvas leaflet-zoom-animated';canvas.style.transformOrigin='0 0';canvas.setAttribute('aria-hidden','true');canvas.dataset.layer='traffic-overview';canvas.hidden=true;
    this.context=canvas.getContext(kind);if(!this.context&&kind==='bitmaprenderer'){this.useWorker=false;this.context=canvas.getContext('2d');}
    return canvas;
  }
  fallback(){
    this.worker?.terminate();this.worker=null;this.useWorker=false;const previous=this.canvas,canvas=this.makeCanvas('2d');previous.replaceWith(canvas);this.canvas=canvas;this.sentKey=null;this.draw();
  }
  receive(message){
    if(message?.op==='error'){this.fallback();return;}
    if(message?.op!=='overviewPainted')return;
    const job=this.pending;if(!job||job.id!==message.id||!this.visible){message.bitmap?.close();return;}
    this.pending=null;const view=this.view();
    if(view.zoom!==job.view.zoom){message.bitmap.close();this.draw();return;}
    this.canvas.width=message.bitmap.width;this.canvas.height=message.bitmap.height;this.context.transferFromImageBitmap(message.bitmap);
    this.present(job.view);this.pan();
  }
  present(view){
    const canvas=this.canvas;canvas.style.width=view.width+'px';canvas.style.height=view.height+'px';canvas.style.transition='none';canvas.style.transform='';
    canvas.hidden=false;this.paintView=view;canvas.dataset.frame=String((Number(canvas.dataset.frame)||0)+1);this.onPresent?.();
  }
  view(){const size=this.map.getSize(),zoom=this.map.getZoom(),center=this.map.project(this.map.getCenter(),0);return{width:size.x,height:size.y,zoom,scale:2**zoom,centerX:center.x,centerY:center.y};}
  // Whether the presented overview paints anything within `radius` CSS pixels
  // of a map container point (alpha above `alpha`). Reads back only that small
  // square, so it is cheap enough for hover; null when nothing is presented.
  paintedNear(point,radius=4,alpha=0){
    const canvas=this.canvas;if(!this.visible||canvas.hidden||!canvas.width)return null;
    const map=this.map.getContainer().getBoundingClientRect(),box=canvas.getBoundingClientRect();if(!box.width||!box.height)return null;
    const sx=canvas.width/box.width,sy=canvas.height/box.height,size=Math.max(1,Math.ceil((2*radius+1)*sx));
    const x=Math.round((map.left+point.x-box.left-radius)*sx),y=Math.round((map.top+point.y-box.top-radius)*sy);
    if(!this.probe){this.probe=document.createElement('canvas');this.probeContext=this.probe.getContext('2d',{willReadFrequently:true});}
    if(this.probe.width!==size){this.probe.width=size;this.probe.height=size;}
    const context=this.probeContext;context.clearRect(0,0,size,size);
    try{context.drawImage(canvas,x,y,size,size,0,0,size,size);}catch{return null;}
    const data=context.getImageData(0,0,size,size).data;
    for(let i=3;i<data.length;i+=4)if(data[i]>alpha)return true;
    return false;
  }
  show(overview){if(this.overview!==overview){this.overview=overview;this.paths.clear();this.sentKey=null;}if(!this.visible){this.visible=true;this.draw();}}
  hide(){if(!this.visible&&this.canvas.hidden)return;this.visible=false;this.pending=null;this.canvas.hidden=true;this.paintView=null;}
  // Release the worker once the exact sections are drawn; it restarts if needed.
  release(){this.hide();this.worker?.terminate();this.worker=null;this.sentKey=null;}
  pathsFor(zoom){
    const key=this.overview.bucket+':'+(zoom<5);
    if(!this.paths.has(key)){
      this.paths.clear();
      this.paths.set(key,overviewStyleGroups(this.overview,zoom).map(group=>({color:group.color,width:group.width,lines:concatenated(group.members.map(m=>m.lines)),dots:concatenated(group.members.map(m=>m.dots))})));
    }
    return{key,groups:this.paths.get(key)};
  }
  draw(){
    if(!this.visible||!this.overview){this.canvas.hidden=true;return;}
    const view=this.view(),dpr=Math.min(Math.min(2,devicePixelRatio||1),Math.sqrt(6000000/(view.width*view.height)),8192/view.width,8192/view.height),width=Math.round(view.width*dpr),height=Math.round(view.height*dpr);
    if(!(width>0&&height>0))return;
    const{key,groups}=this.pathsFor(view.zoom);
    if(this.useWorker&&!this.worker){try{this.worker=this.createWorker();this.worker.onmessage=event=>this.receive(event.data);this.worker.onerror=event=>{event.preventDefault?.();this.fallback();};}catch{this.fallback();return;}}
    if(this.worker){
      if(this.sentKey!==key){this.worker.postMessage({op:'overviewData',key,groups:groups.map(g=>({color:g.color,width:g.width,lines:g.lines,dots:g.dots}))});this.sentKey=key;}
      const id=++this.sequence;this.pending={id,view};this.worker.postMessage({op:'overviewPaint',id,key,view:{...view,dpr}});return;
    }
    const canvas=this.canvas;if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    const context=this.context;context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,width,height);
    const left=view.centerX*view.scale-view.width/2,top=view.centerY*view.scale-view.height/2;
    context.setTransform(dpr*view.scale,0,0,dpr*view.scale,-left*dpr,-top*dpr);context.lineCap='round';context.lineJoin='round';context.setLineDash([]);
    for(const group of groups){
      if(!group.path){group.path=new Path2D();for(let i=0;i<group.lines.length;i+=4){group.path.moveTo(group.lines[i],group.lines[i+1]);group.path.lineTo(group.lines[i+2],group.lines[i+3]);}}
      context.strokeStyle=group.color;context.lineWidth=group.width/view.scale;context.stroke(group.path);
      const radius=group.width/2/view.scale,dots=new Path2D();
      for(let i=0;i<group.dots.length;i+=2){const x=group.dots[i],y=group.dots[i+1];dots.moveTo(x+radius,y);dots.arc(x,y,radius,0,Math.PI*2);}
      context.fillStyle=group.color;context.fill(dots);
    }
    this.present(view);
  }
  pan(){
    if(!this.visible||!this.paintView)return;const view=this.view(),painted=this.paintView;
    if(painted.zoom!==view.zoom)return;
    this.canvas.style.transform=`translate3d(${(painted.centerX-view.centerX)*view.scale}px,${(painted.centerY-view.centerY)*view.scale}px,0)`;
  }
  zoomAnimation(event){
    if(!this.visible||!this.paintView)return;const view=this.paintView,target=this.map.project(event.center,0),scale=2**(event.zoom-view.zoom),factor=2**event.zoom;
    const x=(view.centerX-target.x)*factor+(1-scale)*view.width/2,y=(view.centerY-target.y)*factor+(1-scale)*view.height/2;
    this.canvas.style.transition='transform 250ms cubic-bezier(0.25,0.1,0.25,1)';this.canvas.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
  }
}
