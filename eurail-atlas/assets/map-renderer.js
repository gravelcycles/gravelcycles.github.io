import{FREQUENCY_BREAKS,colorFor,qualifiesEdge,effectivePass,selectedDays,threshold,conditionalCount,edgeCount,isItaly,approximateAlignment,dashedAlignment,matchesGeometry,serviceVisible,serviceLayers,isTemporaryReplacement,chargeFiltered}from'./atlas-core.js?v=14a270392708fc8e';
import{RailGPU,rgb,frequencyPriority}from'./rail-gpu.js?v=14a270392708fc8e';
import{RouteIndex}from'./rail-picking.js?v=14a270392708fc8e';
import{renderWorld}from'./rail-lod.js?v=14a270392708fc8e';
import{RasterClient}from'./raster-client.js?v=14a270392708fc8e';
import{matchesFocus}from'./route-focus.js?v=14a270392708fc8e';
import{isPhysicalSection}from'./physical-heat.js?v=14a270392708fc8e';
import{edgeInScope}from'./project-scope.js?v=14a270392708fc8e';
import{createPhysicalCountCache}from'./physical-count-cache.js?v=14a270392708fc8e';
import{supplementalFocusItems}from'./supplemental-availability.js?v=14a270392708fc8e';
import{staticLayerNear}from'./physical-heat-overview.js?v=14a270392708fc8e';

export const sameCamera=(a,b)=>['width','height','zoom','scale','centerX','centerY'].every(key=>a[key]===b[key]);

const intersects=(b,v,pad=12)=>b[2]>=v.centerX-(v.width/2+pad)/v.scale&&b[0]<=v.centerX+(v.width/2+pad)/v.scale&&b[3]>=v.centerY-(v.height/2+pad)/v.scale&&b[1]<=v.centerY+(v.height/2+pad)/v.scale;
// A path is in view only if one of its segments is: a long city link's bounding
// box can span the whole view while none of its line does (Hubs over open
// country), and a box-only count then claimed connections on an empty map.
function segmentHitsRect(ax,ay,bx,by,x0,y0,x1,y1){
  // Cheap reject first: both ends beyond the same side (most segments of a path that misses the view).
  if(ax<x0&&bx<x0||ax>x1&&bx>x1||ay<y0&&by<y0||ay>y1&&by>y1)return false;
  if(ax>=x0&&ax<=x1&&ay>=y0&&ay<=y1)return true;
  // Liang–Barsky clip, unrolled, with no allocation.
  let t0=0,t1=1,r;const dx=bx-ax,dy=by-ay;
  if(dx===0){if(ax<x0||ax>x1)return false;}
  else{
    r=(x0-ax)/dx;const r2=(x1-ax)/dx,lo=r<r2?r:r2,hi=r<r2?r2:r;if(lo>t0)t0=lo;if(hi<t1)t1=hi;if(t0>t1)return false;
  }
  if(dy===0){if(ay<y0||ay>y1)return false;}
  else{
    r=(y0-ay)/dy;const r2=(y1-ay)/dy,lo=r<r2?r:r2,hi=r<r2?r2:r;if(lo>t0)t0=lo;if(hi<t1)t1=hi;if(t0>t1)return false;
  }
  return true;
}
export function pathInView(edge,v,pad=12){
  const b=edge._bbox;if(!b||!intersects(b,v,pad))return false;
  const x0=v.centerX-(v.width/2+pad)/v.scale,x1=v.centerX+(v.width/2+pad)/v.scale,y0=v.centerY-(v.height/2+pad)/v.scale,y1=v.centerY+(v.height/2+pad)/v.scale;
  if(b[0]>=x0&&b[2]<=x1&&b[1]>=y0&&b[3]<=y1)return true;
  const w=edge._world;if(!w||w.length<4)return true;
  for(let k=0;k+3<w.length;k+=2)if(segmentHitsRect(w[k],w[k+1],w[k+2],w[k+3],x0,y0,x1,y1))return true;
  return false;
}

// Street detail competes with a much busier basemap. Add CSS pixels as the
// camera closes in, including to rare services; frequency colors/counts stay
// fixed. Integer buckets keep style caches useful through fractional zooms.
export const zoomStrokeBoost=zoom=>Math.max(0,Math.min(7,Math.floor(zoom)-11))*2.2/7;

// Same policy predicates as qualifiesEdge, with each service count calculated
// only once. The tests compare visibility for all modes/days/source switches.
export function prepareStyles(edges,{state,dates,stations,focusIds},zoom){
  const pixels=new Uint8Array(edges.length*16),frequencies=new Float64Array(edges.length*2),days=Math.max(1,selectedDays(state.day,dates).length),pass=effectivePass(state),colors=new Map();
  const physicalCounts=state.mode==='traffic'?createPhysicalCountCache({...state,pass},selectedDays(state.day,dates)):null,normalPaint=[new Map(),new Map()],reviewPaint=[new Map(),new Map()],boost=zoomStrokeBoost(zoom);
  const put=(offset,color,width,dash,value)=>{let c=colors.get(color);if(!c){c=rgb(color);colors.set(color,c);}pixels[offset]=Math.round(c[0]*255);pixels[offset+1]=Math.round(c[1]*255);pixels[offset+2]=Math.round(c[2]*255);pixels[offset+3]=Math.round(width/16*255);pixels[offset+4]=255;pixels[offset+5]=dash?255:0;pixels[offset+6]=255;pixels[offset+7]=frequencyPriority(value);};
  const putPhysical=(offset,value,dashed,review)=>{
    const cache=(review?reviewPaint:normalPaint)[dashed?1:0];let paint=cache.get(value);
    if(!paint){const color=rgb(review?'#a85c00':colorFor(value)),width=review?Math.min(3.3,.85+Math.log1p(value)*.32)+boost:Math.min(4.4,.75+Math.log1p(value)*.48)*(zoom<5?.95:1)+boost;paint=new Uint8Array([Math.round(color[0]*255),Math.round(color[1]*255),Math.round(color[2]*255),Math.round(width/16*255),255,dashed?255:0,255,frequencyPriority(value)]);cache.set(value,paint);}pixels.set(paint,offset);
  };
  for(let i=0;i<edges.length;i++){
    const edge=edges[i];
    const physical=isPhysicalSection(edge);
    if(!edgeInScope(edge,state)||(state.mode==='traffic')!==physical||!physical&&(state.sources&&!state.sources.has(edge.source)||edge.primary===false&&!state.alternatives&&!state.altSourceIds?.has(edge.source))||!serviceVisible(edge,state)||!matchesGeometry(edge,state))continue;
    if(state.mode==='italy'){const a=stations.get(edge.a),b=stations.get(edge.b);if(a&&b?(!isItaly(a.country)||!isItaly(b.country)):!isItaly(edge.country))continue;}
    const value=(physical?physicalCounts.count(edge):edgeCount(edge,state,dates))/days,review=pass&&state.review?(physical?(chargeFiltered(state)?0:physicalCounts.count(edge,{conditional:true})):conditionalCount(edge,state,dates))/days:0;
    frequencies[i*2]=value;frequencies[i*2+1]=review;
    const dashed=isTemporaryReplacement(edge)||dashedAlignment(edge);
    if(value>0){if(physical)putPhysical(i*16,value,dashed,false);else put(i*16,colorFor(value),Math.min(4.4,.75+Math.log1p(value)*.48)*(zoom<5?.95:1)+boost,dashed,value);}
    if(review>0){if(physical)putPhysical(i*16+8,review,dashed,true);else put(i*16+8,'#a85c00',Math.min(3.3,.85+Math.log1p(review)*.32)+boost,dashed,review);}
    if(focusIds&&!matchesFocus(edge,focusIds)){
      for(const offset of[i*16,i*16+8])if(pixels[offset+4]){pixels[offset]=176;pixels[offset+1]=184;pixels[offset+2]=179;}
    }
  }
  return{pixels,frequencies};
}

// Slider changes reuse all source/date/pass calculations and exact averages.
// A color/priority byte is intentionally not used for this numerical boundary.
export function thresholdStyles(base,minimum){
  const pixels=base.pixels.slice();
  if(minimum>0)for(let i=0;i<base.frequencies.length;i++)if(base.frequencies[i]<minimum)pixels.fill(0,i*8,i*8+8);
  return pixels;
}
export function renderStyles(edges,data,zoom){return thresholdStyles(prepareStyles(edges,data,zoom),threshold(data.state.min));}
export function visibleFrequencyHistogram(edges,base,view){
  const maximum=FREQUENCY_BREAKS.at(-1),counts=new Uint32Array(maximum+2);
  for(let i=0;i<edges.length;i++){
    const value=Math.max(base.pixels[i*16+4]?base.frequencies[i*2]:0,base.pixels[i*16+12]?base.frequencies[i*2+1]:0);
    if(value>0&&(base.pixels[i*16+4]||base.pixels[i*16+12])&&intersects(edges[i]._bbox,view))counts[Math.min(maximum+1,Math.floor(value))]++;
  }
  for(let i=maximum;i>=0;i--)counts[i]+=counts[i+1];return counts;
}
const fullRouteState=state=>({...state,mode:['italy','hubs'].includes(state.mode)?'frequency':state.mode,pass:effectivePass(state),...(state.mode==='hubs'?{replacements:false}:{}),min:0});

// Selection is an outline, not a second frequency scale. Reuse the same
// visibility, color and dash decision as the ordinary network in every engine.
export function highlightItems(edges,data,zoom,width=3.2){
  const focused=!!data.focusIds?.size,highlightData=focused?{...data,focusIds:null,state:fullRouteState(data.state)}:data;
  const pixels=renderStyles(edges,highlightData,zoom),items=[],boost=zoomStrokeBoost(zoom);
  for(let pass=0;pass<2;pass++)for(const[layer,extra]of[['#fbfaf6',4],['#173f3b',2],[null,0]]){
    for(let i=0;i<edges.length;i++){
      const offset=i*16+pass*8;if(!pixels[offset+4])continue;
      const color=layer||'#'+[...pixels.slice(offset,offset+3)].map(value=>value.toString(16).padStart(2,'0')).join('');
      items.push({world:edges[i]._world,color,width:width+boost+extra,dash:!!pixels[offset+5]});
    }
  }
  return items;
}

// Review strokes are painted over normal strokes, followed by frequency
// priority. Keep picking bound to those actual styles rather than weekly totals.
export function paintedRouteOrder(pixels,index,highlight=null){
  const pass=pixels[index*16+12]?1:0,offset=index*16+pass*8;
  return pixels[offset+4]?{pass:pass+(highlight?(highlight.selected?4:2):0),priority:pixels[offset+7],width:highlight?highlight.width:pixels[offset+3]/255*16,order:index}:null;
}

function canvas(){const c=document.createElement('canvas');c.className='atlas-canvas leaflet-zoom-animated';c.style.transformOrigin='0 0';c.setAttribute('aria-hidden','true');return c;}

export class RailRenderer{
  constructor(map,getData,onPick){
    this.map=map;this.getData=getData;this.onPick=onPick;this.canvas=canvas();this.surface=this.canvas;
    this.paths=new WeakMap();this.styleCache=new Map();this.canvasGroups=new Map();this.frame=0;this.hoverFrame=0;this.dragging=false;this.gpuLost=false;this.intent=0;this.geometryEpoch=0;
    // The static layer (setStaticLayer): set by the app, drawn or not per frame (frameStatic), and the one in the
    // frame on screen (staticPresented).
    this.staticLayer=null;this.frameStatic=null;this.frameEdges=true;this.staticPresented=null;this.staticPaths=new WeakMap();
    const requested=new URLSearchParams(location.search).get('renderer');
    try{if(requested==='canvas'||requested==='worker')throw new Error('Canvas requested');this.gpu=new RailGPU(this.canvas,{allowSoftware:requested==='webgl'});}
    catch{
      this.canvas=canvas();this.surface=this.canvas;
      if(requested!=='canvas'&&typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'){
        try{this.raster=new RasterClient(this.canvas,{onFrame:info=>this.workerPresented(info),onBitmap:(bitmap,job)=>{if(job.metadata?.staticLayer)this.captureBackdrop(bitmap,job.view);},onError:()=>this.workerFailed(),canPresent:job=>!this.zoomAnimating&&(this.gestureFrame(job)||sameCamera(job.view,this.view())&&(job.metadata.intent===this.intent||this.thresholdPreview&&job.metadata.thresholdPreview&&job.metadata.baseKey===this.filterKey(this.getData(),this.map.getZoom()))),allowIntermediate:job=>this.gestureFrame(job)||this.thresholdPreview&&job.metadata.thresholdPreview});}
        catch{this.canvas=canvas();this.surface=this.canvas;}
      }
      if(!this.raster)this.ctx=this.canvas.getContext('2d');
    }
    this.canvas.dataset.renderer=this.gpu?'webgl':this.raster?'worker-canvas':'canvas';map.getContainer().appendChild(this.canvas);
    // The last presented frame that held the static layer, kept at CSS resolution beneath the live surface. It is
    // shown, aligned to the view like the surface, only while the presented frame does not cover the view (zooming
    // out from a frame painted closer in, before the new frame is presented), so lines never vanish meanwhile.
    this.backdrop=canvas();this.backdrop.className='atlas-overview-canvas leaflet-zoom-animated';this.backdrop.dataset.layer='static-backdrop';this.backdrop.hidden=true;
    map.getContainer().insertBefore(this.backdrop,this.canvas);this.backdropView=null;
    if(this.gpu){
      this.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.gpuLost=true;this.canvas.hidden=true;this.surface=canvas();this.surface.dataset.renderer='canvas';this.ctx=this.surface.getContext('2d');map.getContainer().appendChild(this.surface);this.canvas.dataset.renderer='canvas-fallback';this.schedule();});
      this.canvas.addEventListener('webglcontextrestored',()=>{try{this.gpu.restore();if(this.surface!==this.canvas)this.surface.remove();this.surface=this.canvas;this.canvas.hidden=false;this.gpuLost=false;this.canvas.dataset.renderer='webgl';this.edgesReference=null;this.highlightKey=null;this.highlightEdgesReference=null;this.schedule();}catch{this.gpuLost=true;}});
    }
    // During a pinch, wheel zoom or drag the worker's frames are shown as they arrive, each aligned from the camera
    // it was painted for, so lines follow the gesture instead of stretching until it ends (owner, 27 November).
    // The exact level-of-detail redraw still runs when the gesture ends.
    map.on('movestart zoomstart',()=>{this.gesturing=true;});map.on('moveend zoomend',()=>{this.gesturing=false;});
    map.on('wheelzoomstart',()=>{this.wheelZooming=true;this.gesturing=true;this.clearHover();this.surface.style.transition='none';});map.on('wheelzoomend',()=>{this.wheelZooming=false;this.gesturing=false;this.schedule();});
    map.on('move',()=>this.pan());map.on('moveend resize',()=>this.schedule());
    map.on('zoomanim',event=>this.zoomAnimation(event));map.on('zoomend',()=>{this.zoomAnimating=false;this.surface.style.transition='none';if(this.raster)this.alignBitmap(this.view());else{this.surface.style.transform='';this.placeBackdrop(this.view());}this.schedule();});
    map.on('click',event=>{const edge=this.pick(event.containerPoint.x,event.containerPoint.y);if(edge)this.onPick(edge,this.pickAll(event.containerPoint.x,event.containerPoint.y,edge));});
    map.on('mousemove',event=>{this.hoverPoint=event.containerPoint;if(this.dragging||this.zoomAnimating||this.hoverFrame)return;this.hoverFrame=requestAnimationFrame(()=>{this.hoverFrame=0;if(this.dragging||this.zoomAnimating)return;const point=this.hoverPoint,edge=this.pick(point.x,point.y);map.getContainer().style.cursor=edge||this.staticAt(point)?'pointer':'';});});
    map.on('mouseout',()=>this.clearHover());map.on('dragstart',()=>{this.dragging=true;this.clearHover();});map.on('dragend',()=>{this.dragging=false;});
  }
  // A pre-styled, unpickable layer drawn beneath the edges in every engine, in the same frame as them:
  // {key, bucket, pass, groups:[{color, width, lines:Float64Array, dots:Float64Array}]} in zoom-0 world units
  // (physical-heat-overview.js staticLayerFor), or null. A frame leaves it out when getData() says
  // staticLayerWanted:false, a decision taken inside that frame's draw() (docs/design/traffic-convergence.md,
  // review condition 3). Until a newer frame is drawn the presented one keeps the layer it was drawn with.
  setStaticLayer(layer){
    layer=layer||null;if(layer===this.staticLayer)return;this.staticLayer=layer;
    // The kept frame is of one variant: never shown for the other, nor without a layer.
    if(!layer||this.backdropView&&this.backdropPass!==layer.pass){this.backdropView=null;if(this.backdrop)this.backdrop.hidden=true;}
    this.schedule();
  }
  // Keep a presented frame holding the static layer (a canvas or the worker's bitmap) as the backdrop.
  captureBackdrop(source,view){
    const backdrop=this.backdrop;if(!backdrop||!this.staticLayer)return;
    const width=Math.max(1,Math.round(view.width)),height=Math.max(1,Math.round(view.height));
    if(backdrop.width!==width)backdrop.width=width;if(backdrop.height!==height)backdrop.height=height;
    const context=this.backdropContext||(this.backdropContext=backdrop.getContext('2d'));if(!context)return;
    context.clearRect(0,0,width,height);try{context.drawImage(source,0,0,width,height);}catch{return;}
    backdrop.style.width=view.width+'px';backdrop.style.height=view.height+'px';this.backdropView={...view};this.backdropPass=this.staticLayer.pass;
  }
  // Where a frame painted for `painted` lands on the screen at `view` (transform-origin 0 0).
  static placement(painted,view){const scale=view.scale/painted.scale;return{scale,x:(painted.centerX-view.centerX)*view.scale+(view.width-painted.width*scale)/2,y:(painted.centerY-view.centerY)*view.scale+(view.height-painted.height*scale)/2};}
  frameCovers(view){
    const painted=this.paintView;if(!painted)return false;const{scale,x,y}=RailRenderer.placement(painted,view);
    return x<=.5&&y<=.5&&x+painted.width*scale>=view.width-.5&&y+painted.height*scale>=view.height-.5;
  }
  placeBackdrop(view,transition='none'){
    const backdrop=this.backdrop,kept=this.backdropView;if(!backdrop)return;
    if(!kept||!this.staticLayer||this.frameCovers(view)){backdrop.hidden=true;return;}
    // Magnified more than 4x the kept frame is too coarse to stand in for the map.
    const{scale,x,y}=RailRenderer.placement(kept,view);if(scale>4){backdrop.hidden=true;return;}
    backdrop.style.transition=transition;backdrop.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;backdrop.hidden=false;
  }
  // Whether the static layer in the frame on screen paints within `radius` CSS pixels of a container point.
  staticAt(point,radius=4){
    const layer=this.staticPresented;if(!layer||!point)return false;const view=this.view();
    return staticLayerNear(layer,view.centerX+(point.x-view.width/2)/view.scale,view.centerY+(point.y-view.height/2)/view.scale,view.scale,radius);
  }
  view(){const size=this.map.getSize(),zoom=this.map.getZoom(),center=this.map.project(this.map.getCenter(),0);return{width:size.x,height:size.y,zoom,scale:2**zoom,centerX:center.x,centerY:center.y};}
  clearHover(){if(this.hoverFrame)cancelAnimationFrame(this.hoverFrame);this.hoverFrame=0;this.map.getContainer().style.cursor='';}
  pan(){
    this.clearHover();if(this.zoomAnimating)return;this.panSurface();this.placeBackdrop(this.view());
  }
  panSurface(){
    if(this.wheelZooming){this.alignBitmap(this.view());if(this.raster&&this.meshEdges)this.scheduleView();return;}
    if(this.raster&&this.meshEdges){this.alignBitmap(this.view());this.scheduleView();return;}
    if(this.gpu&&!this.gpuLost&&this.meshEdges){this.scheduleView();return;}
    if(!this.paintView||this.paintView.zoom!==this.map.getZoom()){this.schedule();return;}
    const view=this.view();this.surface.style.transform=`translate3d(${(this.paintView.centerX-view.centerX)*view.scale}px,${(this.paintView.centerY-view.centerY)*view.scale}px,0)`;
  }
  zoomAnimation(event){
    if(!this.paintView)return;this.zoomAnimating=true;this.clearHover();
    const view=this.paintView,target=this.map.project(event.center,0),scale=2**(event.zoom-view.zoom),factor=2**event.zoom;
    const x=(view.centerX-target.x)*factor+(1-scale)*view.width/2,y=(view.centerY-target.y)*factor+(1-scale)*view.height/2;
    this.surface.style.transition='transform 250ms cubic-bezier(0.25,0.1,0.25,1)';
    this.surface.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
    // The backdrop moves with the same animation, to the camera the zoom ends at.
    const size=this.map.getSize(),end={width:size.x,height:size.y,zoom:event.zoom,scale:factor,centerX:target.x,centerY:target.y};
    this.placeBackdrop(end,'transform 250ms cubic-bezier(0.25,0.1,0.25,1)');
  }
  schedule(){this.thresholdPreview=false;this.intent++;this.fullFrame=true;this.requestFrame();}
  previewThreshold(){this.thresholdPreview=true;this.intent++;this.fullFrame=true;this.requestFrame();}
  scheduleView(){this.intent++;this.requestFrame();}
  requestFrame(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;if(this.fullFrame){this.fullFrame=false;this.draw();}else this.drawView();});}
  resize(view){
    const dpr=Math.min(2,devicePixelRatio||1),width=Math.round(view.width*dpr),height=Math.round(view.height*dpr);
    this.dpr=dpr;if(this.raster)return;
    if(this.surface.width!==width||this.surface.height!==height){this.surface.width=width;this.surface.height=height;this.surface.style.width=view.width+'px';this.surface.style.height=view.height+'px';}
    this.dpr=dpr;
  }
  drawView(){
    if(this.raster&&this.meshEdges&&this.lastPixels&&!this.zoomAnimating){const view=this.view();this.alignBitmap(view);this.queueRaster(view,{geometryReused:true,styleReused:true,meshMs:0,cpuSubmitMs:0,panFrame:true,staticOnly:!this.frameEdges});return;}
    if(!this.gpu||this.gpuLost||!this.meshEdges||this.zoomAnimating)return;
    const view=this.view();this.resize(view);this.gpu.draw(view,this.reviewOn,{staticLayer:!!this.frameStatic,edges:this.frameEdges});this.paintView=view;
    this.canvas.dataset.frame=String((Number(this.canvas.dataset.frame)||0)+1);
  }
  meshContains(view){const b=this.meshBounds;return b&&b[0]<=view.centerX-view.width/2/view.scale&&b[1]<=view.centerY-view.height/2/view.scale&&b[2]>=view.centerX+view.width/2/view.scale&&b[3]>=view.centerY+view.height/2/view.scale;}
  prepareGeometry(edges,view){
    const padded={...view,width:view.width*2,height:view.height*2};
    if(this.sortedEdgesReference!==edges){let ordered=true;for(let i=1;i<edges.length;i++)if((edges[i-1].weekly||0)>(edges[i].weekly||0)){ordered=false;break;}this.sortedEdges=ordered?edges:[...edges].sort((a,b)=>(a.weekly||0)-(b.weekly||0));this.sortedEdgesReference=edges;}
    this.meshEdges=this.sortedEdges.filter(edge=>intersects(edge._bbox,padded));
    this.meshBounds=[view.centerX-padded.width/2/view.scale,view.centerY-padded.height/2/view.scale,view.centerX+padded.width/2/view.scale,view.centerY+padded.height/2/view.scale];
    this.index=new RouteIndex(this.meshEdges);this.edgesReference=edges;this.styleCache.clear();this.canvasGroups.clear();this.currentStyleKey=null;
    this.lodBucket=Math.ceil(view.zoom);
    if(this.raster){this.geometryEpoch++;this.raster.geometry(this.geometryEpoch,this.meshEdges.map(edge=>renderWorld(edge._world,view.zoom)),{compactPrimitives:this.meshEdges.length>0&&this.meshEdges.every(isPhysicalSection)});}
    if(this.gpu&&!this.gpuLost)this.gpu.upload(this.meshEdges.map(edge=>({_world:renderWorld(edge._world,view.zoom)})),false,[view.centerX,view.centerY]);
  }
  // Traffic styles never read stations (only the Italy view does), so the
  // station list arriving later does not restyle 700k physical sections.
  filterKey({state,stations,focusIds},zoom){const layers=serviceLayers(state);return JSON.stringify([state.scopeRevision||0,state.duplicateRevision||0,state.mode,state.day,state.pass,state.review,state.charge,state.chargeMatch,state.included,layers.trains,layers.replacements,state.alternatives,state.schematic,state.aligned,state.inferred,state.sources?[...state.sources].sort():null,[...state.altSourceIds||[]].sort(),zoom<5,zoomStrokeBoost(zoom),state.mode==='traffic'?0:stations.size,focusIds?[...focusIds]:null]);}
  draw(){
    if(this.zoomAnimating||this.wheelZooming)return;
    const started=performance.now(),data=this.getData(),view=this.view();if(!(view.width>0&&view.height>0))return;this.resize(view);if(!this.raster)this.surface.style.transform='';
    // This frame's static layer: cleared in the very frame whose edges make it unnecessary, never before.
    const staticLayer=this.staticLayer&&data.staticLayerWanted!==false?this.staticLayer:null;this.frameStatic=staticLayer;
    // Where the static layer is the exact picture of the edges (getData().staticCoversEdges: Traffic's default
    // filters below its exact zoom), a frame with it paints no edges: the same lines, without restyling and painting
    // every loaded section, so zooming back out presents the overview at once. Edges come back in the very frame
    // that leaves the layer out (the mirror of the zoom 8 handoff); picking always uses the edges.
    const edges=!(staticLayer&&data.staticCoversEdges===true);this.frameEdges=edges;
    const geometryChanged=!!this.geometryStale||this.edgesReference!==data.edges||!this.meshContains(view)||this.lodBucket!==Math.ceil(view.zoom),meshStarted=performance.now();
    if(!edges&&(this.raster?this.raster.scene:this.meshEdges)){
      // A static-only frame: the edges' mesh and styles wait for the next frame that paints them, or for a pick.
      if(geometryChanged)this.geometryStale=true;
      this.reviewOn=effectivePass(data.state)&&data.state.review;
      if(this.raster){this.rasterHighlights=this.rasterHighlightItems(data);this.queueRaster(view,{geometryReused:true,styleReused:true,meshMs:0,cpuSubmitMs:performance.now()-started,staticOnly:true});return;}
      if(this.gpu&&!this.gpuLost){if(this.gpu.staticKey!==(this.staticLayer?.key??null))this.gpu.uploadStatic(this.staticLayer);this.updateHighlights(data);this.gpu.draw(view,this.reviewOn,{staticLayer:true,edges:false});}
      else this.drawCanvas(data,view,null,null,staticLayer,false);
      this.paintView=view;this.staticPresented=staticLayer;this.captureBackdrop(this.surface,view);this.placeBackdrop(view);const visible=this.visible||0;this.canvas.dataset.frame=String((Number(this.canvas.dataset.frame)||0)+1);
      this.canvas.dispatchEvent(new CustomEvent('atlasdraw',{detail:{visible,minimum:threshold(data.state.min),renderMs:performance.now()-started,meshMs:0,geometryReused:true,styleReused:true,engine:this.gpu&&!this.gpuLost?'webgl':'canvas',staticLayer:staticLayer.key,staticOnly:true}}));
      return;
    }
    if(geometryChanged){this.prepareGeometry(data.edges,view);this.geometryStale=false;}
    const meshMs=performance.now()-meshStarted,baseKey=this.filterKey(data,view.zoom),minimum=threshold(data.state.min),key=baseKey+':min:'+minimum;
    let base=this.styleCache.get(baseKey),styleReused=!!base;
    if(!base){base=prepareStyles(this.meshEdges,data,view.zoom);this.styleCache.set(baseKey,base);if(this.styleCache.size>4)this.styleCache.delete(this.styleCache.keys().next().value);}
    const localThreshold=!!this.raster?.scene?.compactPrimitives&&this.meshEdges.length>5000&&view.zoom<=8;
    const pixels=localThreshold?base.pixels:this.currentStyleKey===key&&this.lastStyleBase===base?this.lastPixels:thresholdStyles(base,minimum);
    this.lastStyleBase=base;this.lastPixels=pixels;this.minimum=minimum;this.currentBaseKey=baseKey;
    this.reviewOn=effectivePass(data.state)&&data.state.review;
    if(this.raster){
      this.currentStyleKey=key;this.lastPixels=pixels;this.rasterHighlights=this.rasterHighlightItems(data);
      this.queueRaster(view,{geometryReused:!geometryChanged,styleReused,meshMs,cpuSubmitMs:performance.now()-started});return;
    }
    if(this.gpu&&!this.gpuLost){
      if(this.currentStyleKey!==key||geometryChanged)this.gpu.styles(pixels);
      if(this.gpu.staticKey!==(this.staticLayer?.key??null))this.gpu.uploadStatic(this.staticLayer);
      this.updateHighlights(data);this.reviewOn=effectivePass(data.state)&&data.state.review;this.gpu.draw(view,this.reviewOn,{staticLayer:!!staticLayer,edges});
    }else this.drawCanvas(data,view,pixels,key,staticLayer,edges);
    this.currentStyleKey=key;this.paintView=view;this.staticPresented=staticLayer;if(staticLayer)this.captureBackdrop(this.surface,view);this.placeBackdrop(view);let visible=0;
    visible=this.countVisible(pixels,view);
    this.visible=visible;this.canvas.dataset.frame=String((Number(this.canvas.dataset.frame)||0)+1);
    this.canvas.dispatchEvent(new CustomEvent('atlasdraw',{detail:{visible,minimum,renderMs:performance.now()-started,meshMs,geometryReused:!geometryChanged,styleReused,engine:this.gpu&&!this.gpuLost?'webgl':'canvas',segments:this.gpu&&!this.gpuLost?this.gpu.main.count:undefined,staticLayer:staticLayer?.key??null}}));
  }
  alignBitmap(view){
    if(!this.paintView)return;
    const painted=this.paintView,scale=view.scale/painted.scale,x=(painted.centerX-view.centerX)*view.scale+(view.width-painted.width*scale)/2,y=(painted.centerY-view.centerY)*view.scale+(view.height-painted.height*scale)/2;
    this.surface.style.transform=Math.abs(x)+Math.abs(y)+Math.abs(scale-1)<.000001?'':`translate3d(${x}px,${y}px,0) scale(${scale})`;
    this.placeBackdrop(view);
  }
  rasterHighlightItems(data){
    if(!data.highlightIds?.size&&!data.selected)return[];
    const zoom=this.map.getZoom(),key=(data.selected?.id||'')+'|'+[...data.highlightIds||[]].join(',')+'|'+this.filterKey(data,zoom)+'|'+threshold(data.state.min)+'|'+(data.supplementalFocusGroup?.key||'');
    if(this.rasterHighlightKey===key&&this.rasterHighlightEdges===data.edges)return this.rasterHighlights;
    const selected=data.highlightIds?.size?data.edges.filter(edge=>matchesFocus(edge,data.highlightIds)):[],items=highlightItems(selected,data,zoom,2.5);
    if(data.selected?._world)items.push(...highlightItems([data.selected],data,zoom));
    items.push(...supplementalFocusItems(data.edges,data.supplementalFocusGroup,data.state,data.dates,data.highlightIds,zoom));
    this.rasterHighlightKey=key;this.rasterHighlightEdges=data.edges;this.rasterHighlights=items;return items;
  }
  // Painted paths with a segment in view, cached per camera, geometry and styles (pans repaint often).
  countVisible(pixels,view,{settled=true}={}){
    const c=this.visibleCountCache;
    if(c&&c.edges===this.meshEdges&&c.pixels===pixels&&(sameCamera(c.view,view)||!settled))return c.count;
    let count=0;for(let i=0;i<this.meshEdges.length;i++)if((pixels[i*16+4]||pixels[i*16+12])&&pathInView(this.meshEdges[i],view))count++;
    this.visibleCountCache={edges:this.meshEdges,pixels,view:{...view},count};return count;
  }
  queueRaster(view,detail){
    const localThreshold=!detail.staticOnly&&!!this.raster.scene?.compactPrimitives&&this.meshEdges.length>5000&&view.zoom<=8;let visible=0;
    if(detail.staticOnly)visible=this.visible||0;
    else if(localThreshold){
      const cached=this.visibleFrequencyCache;
      if(!cached||cached.base!==this.lastStyleBase||cached.edges!==this.meshEdges||!sameCamera(cached.view,view))this.visibleFrequencyCache={base:this.lastStyleBase,edges:this.meshEdges,view:{...view},counts:visibleFrequencyHistogram(this.meshEdges,this.lastStyleBase,view)};
      visible=this.visibleFrequencyCache.counts[Math.min(this.visibleFrequencyCache.counts.length-1,Math.max(0,Math.ceil(this.minimum)))];
    }else visible=this.countVisible(this.lastPixels,view,{settled:!detail.panFrame});
    this.canvas.setAttribute('aria-busy','true');this.map.getContainer().setAttribute('aria-busy','true');
    this.raster.paint({...view,dpr:this.dpr},this.lastPixels,{staticLayer:this.frameStatic,edges:this.frameEdges,styleKey:this.currentStyleKey+':lod:'+this.lodBucket,baseKey:this.currentBaseKey,basePixels:this.lastStyleBase?.pixels,baseFrequencies:this.lastStyleBase?.frequencies,localThreshold,minimum:this.minimum,reviewOn:this.reviewOn,highlights:this.rasterHighlights||[],metadata:{intent:this.intent,thresholdPreview:!!this.thresholdPreview,baseKey:this.currentBaseKey,staticLayer:this.frameStatic,detail:{...detail,visible,minimum:this.minimum,staticLayer:this.frameStatic?.key??null}}});
  }
  // A frame painted earlier in the current gesture with the current filters: safe to show, since
  // workerPresented aligns it from its own camera to the live one.
  gestureFrame(job){return !!this.gesturing&&!this.thresholdPreview&&job.metadata.baseKey===this.currentBaseKey;}
  workerPresented(info){
    this.paintView=info.view;this.alignBitmap(this.view());this.visible=info.metadata.detail.visible;this.staticPresented=info.metadata.staticLayer||null;
    this.canvas.setAttribute('aria-busy','false');this.map.getContainer().setAttribute('aria-busy','false');this.canvas.dataset.frame=String((Number(this.canvas.dataset.frame)||0)+1);
    this.canvas.dispatchEvent(new CustomEvent('atlasdraw',{detail:{...info.metadata.detail,...info.profile,renderMs:info.latencyMs,workerPaintMs:info.workerPaintMs,latencyMs:info.latencyMs,engine:'worker-canvas'}}));
  }
  workerFailed(){
    this.raster?.destroy();this.raster=null;if(this.surface!==this.canvas)this.surface.remove();
    this.canvas.hidden=true;this.surface=canvas();this.surface.dataset.renderer='canvas';this.ctx=this.surface.getContext('2d');this.map.getContainer().appendChild(this.surface);this.canvas.dataset.renderer='canvas-fallback';this.canvas.setAttribute('aria-busy','false');this.map.getContainer().setAttribute('aria-busy','false');this.schedule();
  }
  updateHighlights(data){
    const key=(data.selected?.id||'')+'|'+[...data.highlightIds||[]].join(',')+'|'+this.filterKey(data,this.map.getZoom())+'|'+threshold(data.state.min)+'|'+(data.supplementalFocusGroup?.key||'');
    if(this.highlightKey===key&&this.highlightEdgesReference===data.edges)return;
    const items=this.rasterHighlightItems(data),edges=items.map(item=>({_world:item.world})),styles=items.map(({world,...style})=>({normal:style}));
    const view=this.view();this.gpu.upload(edges,true,[view.centerX,view.centerY]);this.gpu.styles(styles,true);this.highlightKey=key;this.highlightEdgesReference=data.edges;
  }
  pathFor(edge,zoom){
    let paths=this.paths.get(edge._world);if(!paths){paths=new Map();this.paths.set(edge._world,paths);}
    const bucket=Math.ceil(zoom);if(paths.has(bucket))return paths.get(bucket);
    const path=new Path2D(),p=renderWorld(edge._world,zoom);path.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)path.lineTo(p[i],p[i+1]);paths.set(bucket,path);if(paths.size>2)paths.delete(paths.keys().next().value);return path;
  }
  // The static layer's groups in the world transform, before any edge: lines as one cached Path2D per group, dots as
  // circles of the stroke width (as the raster worker draws them).
  drawStaticCanvas(ctx,layer,view){
    ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);
    for(const group of layer.groups){
      let path=this.staticPaths.get(group);
      if(!path){path=new Path2D();for(let i=0;i<group.lines.length;i+=4){path.moveTo(group.lines[i],group.lines[i+1]);path.lineTo(group.lines[i+2],group.lines[i+3]);}this.staticPaths.set(group,path);}
      ctx.strokeStyle=group.color;ctx.lineWidth=group.width/view.scale;ctx.stroke(path);
      if(!group.dots.length)continue;
      const radius=group.width/2/view.scale,dots=new Path2D();
      for(let i=0;i<group.dots.length;i+=2){const x=group.dots[i],y=group.dots[i+1];dots.moveTo(x+radius,y);dots.arc(x,y,radius,0,Math.PI*2);}
      ctx.fillStyle=group.color;ctx.fill(dots);
    }
  }
  drawCanvas(data,view,pixels,key,staticLayer=null,edges=true){
    const ctx=this.ctx,dpr=this.dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,view.width,view.height);
    ctx.setTransform(dpr*view.scale,0,0,dpr*view.scale,dpr*(view.width/2-view.centerX*view.scale),dpr*(view.height/2-view.centerY*view.scale));ctx.lineCap='round';ctx.lineJoin='round';
    if(staticLayer)this.drawStaticCanvas(ctx,staticLayer,view);
    if(edges)this.drawCanvasEdges(ctx,view,pixels,key);
    for(const item of this.rasterHighlightItems(data)){
      ctx.strokeStyle=item.color;ctx.lineWidth=item.width/view.scale;ctx.lineCap=item.dash?'butt':'round';ctx.setLineDash(item.dash?[1/view.scale,5/view.scale]:[]);ctx.stroke(this.pathFor({_world:item.world},view.zoom));
    }
    ctx.setLineDash([]);
  }
  drawCanvasEdges(ctx,view,pixels,key){
    key+=':lod:'+Math.ceil(view.zoom);let cached=this.canvasGroups.get(key);
    if(!cached){cached=[];for(let pass=0;pass<2;pass++){
      const groups=new Map();
      for(let i=0;i<this.meshEdges.length;i++){
        const edge=this.meshEdges[i],offset=i*16+pass*8;if(!pixels[offset+4])continue;
        const color=`rgb(${pixels[offset]},${pixels[offset+1]},${pixels[offset+2]})`,width=Math.max(.25,Math.round(pixels[offset+3]/255*16*4)/4),dash=!!pixels[offset+5],key=color+':'+width+':'+dash;
        let group=groups.get(key);if(!group){group={path:new Path2D(),color,width,dash,priority:pixels[offset+7]};groups.set(key,group);}group.path.addPath(this.pathFor(edge,view.zoom));
      }
      cached.push([...groups.values()].sort((a,b)=>a.priority-b.priority));
    }this.canvasGroups.set(key,cached);if(this.canvasGroups.size>3)this.canvasGroups.delete(this.canvasGroups.keys().next().value);}
    for(const groups of cached)for(const group of groups){ctx.strokeStyle=group.color;ctx.lineWidth=group.width/view.scale;ctx.lineCap=group.dash?'butt':'round';ctx.setLineDash(group.dash?[1/view.scale,5/view.scale]:[]);ctx.stroke(group.path);}
  }
  // Static-only frames leave the mesh for later: a pick builds it first (picking always uses the edges).
  freshGeometry(){if(this.geometryStale&&!this.zoomAnimating&&!this.wheelZooming){this.prepareGeometry(this.getData().edges,this.view());this.geometryStale=false;}}
  pick(x,y){
    this.freshGeometry();
    if(!this.index||this.zoomAnimating||this.wheelZooming)return null;
    const data=this.getData(),zoom=this.map.getZoom(),baseKey=this.filterKey(data,zoom),minimum=threshold(data.state.min),key=baseKey+':min:'+minimum+':selected:'+(data.selected?.id||'')+':highlighted:'+JSON.stringify([...data.highlightIds||[]]);
    if(this.pickStyleKey!==key||this.pickStyleEdges!==this.meshEdges){
      let base=this.styleCache.get(baseKey);if(!base){base=prepareStyles(this.meshEdges,data,zoom);this.styleCache.set(baseKey,base);if(this.styleCache.size>4)this.styleCache.delete(this.styleCache.keys().next().value);}
      const pixels=thresholdStyles(base,minimum),focusData=data.focusIds?.size?{...data,focusIds:null,state:fullRouteState(data.state)}:null;
      const focusPixels=focusData?renderStyles(this.meshEdges,focusData,zoom):null;
      this.pickStyles=new Map(this.meshEdges.map((edge,index)=>{
        const selected=edge.id===data.selected?.id||(edge._directionEdges||[]).some(row=>row.id===data.selected?.id),highlighted=matchesFocus(edge,data.highlightIds);
        return[edge,paintedRouteOrder(focusPixels&&highlighted?focusPixels:pixels,index,selected||highlighted?{selected,width:(selected?3.2:2.5)+4+zoomStrokeBoost(zoom)}:null)];
      }));
      this.pickStyleKey=key;this.pickStyleEdges=this.meshEdges;
    }
    return this.index.pick(x,y,this.view(),7.5,edge=>qualifiesEdge(edge,matchesFocus(edge,data.focusIds)?fullRouteState(data.state):data.state,data.dates,data.stations),edge=>this.pickStyles.get(edge));
  }
  // All visible routes under the pointer, with the painted winner first.
  pickAll(x,y,winner=null){
    this.freshGeometry();const data=this.getData();if(!this.index||this.dragging||this.zoomAnimating)return winner?[winner]:[];
    const rows=this.index.pickAll(x,y,this.view(),5,edge=>qualifiesEdge(edge,matchesFocus(edge,data.focusIds)?fullRouteState(data.state):data.state,data.dates,data.stations));
    return winner?[winner,...rows.filter(edge=>edge!==winner)]:rows;
  }
}
