import{colorFor,qualifiesEdge,effectivePass,selectedDays,threshold,conditionalCount,edgeCount,isItaly,approximateAlignment,matchesGeometry,serviceVisible,serviceLayers,isTemporaryReplacement,chargeFiltered}from'./atlas-core.js?v=a8d1727da1380e07';
import{RailGPU,rgb,frequencyPriority}from'./rail-gpu.js?v=a8d1727da1380e07';
import{RouteIndex}from'./rail-picking.js?v=a8d1727da1380e07';
import{renderWorld}from'./rail-lod.js?v=a8d1727da1380e07';
import{RasterClient}from'./raster-client.js?v=a8d1727da1380e07';
import{matchesFocus}from'./route-focus.js?v=a8d1727da1380e07';
import{isPhysicalSection}from'./physical-heat.js?v=a8d1727da1380e07';
import{edgeInScope}from'./project-scope.js?v=a8d1727da1380e07';
import{createPhysicalCountCache}from'./physical-count-cache.js?v=a8d1727da1380e07';

export const sameCamera=(a,b)=>['width','height','zoom','scale','centerX','centerY'].every(key=>a[key]===b[key]);

const intersects=(b,v,pad=12)=>b[2]>=v.centerX-(v.width/2+pad)/v.scale&&b[0]<=v.centerX+(v.width/2+pad)/v.scale&&b[3]>=v.centerY-(v.height/2+pad)/v.scale&&b[1]<=v.centerY+(v.height/2+pad)/v.scale;

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
    const dashed=isTemporaryReplacement(edge)||approximateAlignment(edge);
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
  const counts=new Uint32Array(152);
  for(let i=0;i<edges.length;i++){
    const value=Math.max(base.pixels[i*16+4]?base.frequencies[i*2]:0,base.pixels[i*16+12]?base.frequencies[i*2+1]:0);
    if(value>0&&(base.pixels[i*16+4]||base.pixels[i*16+12])&&intersects(edges[i]._bbox,view))counts[Math.min(151,Math.floor(value))]++;
  }
  for(let i=150;i>=0;i--)counts[i]+=counts[i+1];return counts;
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
    const requested=new URLSearchParams(location.search).get('renderer');
    try{if(requested==='canvas'||requested==='worker')throw new Error('Canvas requested');this.gpu=new RailGPU(this.canvas,{allowSoftware:requested==='webgl'});}
    catch{
      this.canvas=canvas();this.surface=this.canvas;
      if(requested!=='canvas'&&typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'){
        try{this.raster=new RasterClient(this.canvas,{onFrame:info=>this.workerPresented(info),onError:()=>this.workerFailed(),canPresent:job=>!this.zoomAnimating&&sameCamera(job.view,this.view())&&(job.metadata.intent===this.intent||this.thresholdPreview&&job.metadata.thresholdPreview&&job.metadata.baseKey===this.filterKey(this.getData(),this.map.getZoom())),allowIntermediate:job=>this.thresholdPreview&&job.metadata.thresholdPreview});}
        catch{this.canvas=canvas();this.surface=this.canvas;}
      }
      if(!this.raster)this.ctx=this.canvas.getContext('2d');
    }
    this.canvas.dataset.renderer=this.gpu?'webgl':this.raster?'worker-canvas':'canvas';map.getContainer().appendChild(this.canvas);
    if(this.gpu){
      this.canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.gpuLost=true;this.canvas.hidden=true;this.surface=canvas();this.surface.dataset.renderer='canvas';this.ctx=this.surface.getContext('2d');map.getContainer().appendChild(this.surface);this.canvas.dataset.renderer='canvas-fallback';this.schedule();});
      this.canvas.addEventListener('webglcontextrestored',()=>{try{this.gpu.restore();if(this.surface!==this.canvas)this.surface.remove();this.surface=this.canvas;this.canvas.hidden=false;this.gpuLost=false;this.canvas.dataset.renderer='webgl';this.edgesReference=null;this.highlightKey=null;this.highlightEdgesReference=null;this.schedule();}catch{this.gpuLost=true;}});
    }
    map.on('move',()=>this.pan());map.on('moveend resize',()=>this.schedule());
    map.on('zoomanim',event=>this.zoomAnimation(event));map.on('zoomend',()=>{this.zoomAnimating=false;this.surface.style.transition='none';if(this.raster)this.alignBitmap(this.view());else this.surface.style.transform='';this.schedule();});
    map.on('click',event=>{const edge=this.pick(event.containerPoint.x,event.containerPoint.y);if(edge)this.onPick(edge);});
    map.on('mousemove',event=>{this.hoverPoint=event.containerPoint;if(this.dragging||this.zoomAnimating||this.hoverFrame)return;this.hoverFrame=requestAnimationFrame(()=>{this.hoverFrame=0;if(this.dragging||this.zoomAnimating)return;const point=this.hoverPoint,edge=this.pick(point.x,point.y);map.getContainer().style.cursor=edge?'pointer':'';});});
    map.on('mouseout',()=>this.clearHover());map.on('dragstart',()=>{this.dragging=true;this.clearHover();});map.on('dragend',()=>{this.dragging=false;});
  }
  view(){const size=this.map.getSize(),zoom=this.map.getZoom(),center=this.map.project(this.map.getCenter(),0);return{width:size.x,height:size.y,zoom,scale:2**zoom,centerX:center.x,centerY:center.y};}
  clearHover(){if(this.hoverFrame)cancelAnimationFrame(this.hoverFrame);this.hoverFrame=0;this.map.getContainer().style.cursor='';}
  pan(){
    this.clearHover();if(this.zoomAnimating)return;
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
    if(this.raster&&this.meshEdges&&this.lastPixels&&!this.zoomAnimating){const view=this.view();this.alignBitmap(view);this.queueRaster(view,{geometryReused:true,styleReused:true,meshMs:0,cpuSubmitMs:0});return;}
    if(!this.gpu||this.gpuLost||!this.meshEdges||this.zoomAnimating)return;
    const view=this.view();this.resize(view);this.gpu.draw(view,this.reviewOn);this.paintView=view;
    this.canvas.dataset.frame=String((Number(this.canvas.dataset.frame)||0)+1);
  }
  meshContains(view){const b=this.meshBounds;return b&&b[0]<=view.centerX-view.width/2/view.scale&&b[1]<=view.centerY-view.height/2/view.scale&&b[2]>=view.centerX+view.width/2/view.scale&&b[3]>=view.centerY+view.height/2/view.scale;}
  prepareGeometry(edges,view){
    const padded={...view,width:view.width*2,height:view.height*2};
    this.meshEdges=edges.filter(edge=>intersects(edge._bbox,padded)).sort((a,b)=>(a.weekly||0)-(b.weekly||0));
    this.meshBounds=[view.centerX-padded.width/2/view.scale,view.centerY-padded.height/2/view.scale,view.centerX+padded.width/2/view.scale,view.centerY+padded.height/2/view.scale];
    this.index=new RouteIndex(this.meshEdges);this.edgesReference=edges;this.styleCache.clear();this.canvasGroups.clear();this.currentStyleKey=null;
    this.lodBucket=Math.ceil(view.zoom);
    if(this.raster){this.geometryEpoch++;this.raster.geometry(this.geometryEpoch,this.meshEdges.map(edge=>renderWorld(edge._world,view.zoom)),{compactPrimitives:this.meshEdges.length>0&&this.meshEdges.every(isPhysicalSection)});}
    if(this.gpu&&!this.gpuLost)this.gpu.upload(this.meshEdges.map(edge=>({_world:renderWorld(edge._world,view.zoom)})),false,[view.centerX,view.centerY]);
  }
  filterKey({state,stations,focusIds},zoom){const layers=serviceLayers(state);return JSON.stringify([state.scopeRevision||0,state.mode,state.day,state.pass,state.review,state.charge,state.chargeMatch,state.included,layers.trains,layers.replacements,state.alternatives,state.schematic,state.aligned,state.inferred,state.sources?[...state.sources].sort():null,[...state.altSourceIds||[]].sort(),zoom<5,zoomStrokeBoost(zoom),stations.size,focusIds?[...focusIds]:null]);}
  draw(){
    if(this.zoomAnimating)return;
    const started=performance.now(),data=this.getData(),view=this.view();if(!(view.width>0&&view.height>0))return;this.resize(view);if(!this.raster)this.surface.style.transform='';
    const geometryChanged=this.edgesReference!==data.edges||!this.meshContains(view)||this.lodBucket!==Math.ceil(view.zoom),meshStarted=performance.now();
    if(geometryChanged)this.prepareGeometry(data.edges,view);
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
      this.updateHighlights(data);this.reviewOn=effectivePass(data.state)&&data.state.review;this.gpu.draw(view,this.reviewOn);
    }else this.drawCanvas(data,view,pixels,key);
    this.currentStyleKey=key;this.paintView=view;let visible=0;
    for(let i=0;i<this.meshEdges.length;i++)if((pixels[i*16+4]||pixels[i*16+12])&&intersects(this.meshEdges[i]._bbox,view))visible++;
    this.visible=visible;this.canvas.dataset.frame=String((Number(this.canvas.dataset.frame)||0)+1);
    this.canvas.dispatchEvent(new CustomEvent('atlasdraw',{detail:{visible,minimum,renderMs:performance.now()-started,meshMs,geometryReused:!geometryChanged,styleReused,engine:this.gpu&&!this.gpuLost?'webgl':'canvas',segments:this.gpu&&!this.gpuLost?this.gpu.main.count:undefined}}));
  }
  alignBitmap(view){
    if(!this.paintView)return;
    const painted=this.paintView,scale=view.scale/painted.scale,x=(painted.centerX-view.centerX)*view.scale+(view.width-painted.width*scale)/2,y=(painted.centerY-view.centerY)*view.scale+(view.height-painted.height*scale)/2;
    this.surface.style.transform=Math.abs(x)+Math.abs(y)+Math.abs(scale-1)<.000001?'':`translate3d(${x}px,${y}px,0) scale(${scale})`;
  }
  rasterHighlightItems(data){
    if(!data.highlightIds?.size&&!data.selected)return[];
    const zoom=this.map.getZoom(),key=(data.selected?.id||'')+'|'+[...data.highlightIds||[]].join(',')+'|'+this.filterKey(data,zoom)+'|'+threshold(data.state.min);
    if(this.rasterHighlightKey===key&&this.rasterHighlightEdges===data.edges)return this.rasterHighlights;
    const selected=data.highlightIds?.size?data.edges.filter(edge=>matchesFocus(edge,data.highlightIds)):[],items=highlightItems(selected,data,zoom,2.5);
    if(data.selected?._world)items.push(...highlightItems([data.selected],data,zoom));
    this.rasterHighlightKey=key;this.rasterHighlightEdges=data.edges;this.rasterHighlights=items;return items;
  }
  queueRaster(view,detail){
    const localThreshold=!!this.raster.scene?.compactPrimitives&&this.meshEdges.length>5000&&view.zoom<=8;let visible=0;
    if(localThreshold){
      const cached=this.visibleFrequencyCache;
      if(!cached||cached.base!==this.lastStyleBase||cached.edges!==this.meshEdges||!sameCamera(cached.view,view))this.visibleFrequencyCache={base:this.lastStyleBase,edges:this.meshEdges,view:{...view},counts:visibleFrequencyHistogram(this.meshEdges,this.lastStyleBase,view)};
      visible=this.visibleFrequencyCache.counts[Math.min(151,Math.max(0,Math.ceil(this.minimum)))];
    }else for(let i=0;i<this.meshEdges.length;i++)if((this.lastPixels[i*16+4]||this.lastPixels[i*16+12])&&intersects(this.meshEdges[i]._bbox,view))visible++;
    this.canvas.setAttribute('aria-busy','true');this.map.getContainer().setAttribute('aria-busy','true');
    this.raster.paint({...view,dpr:this.dpr},this.lastPixels,{styleKey:this.currentStyleKey+':lod:'+this.lodBucket,baseKey:this.currentBaseKey,basePixels:this.lastStyleBase?.pixels,baseFrequencies:this.lastStyleBase?.frequencies,localThreshold,minimum:this.minimum,reviewOn:this.reviewOn,highlights:this.rasterHighlights||[],metadata:{intent:this.intent,thresholdPreview:!!this.thresholdPreview,baseKey:this.currentBaseKey,detail:{...detail,visible,minimum:this.minimum}}});
  }
  workerPresented(info){
    this.paintView=info.view;this.alignBitmap(this.view());this.visible=info.metadata.detail.visible;
    this.canvas.setAttribute('aria-busy','false');this.map.getContainer().setAttribute('aria-busy','false');this.canvas.dataset.frame=String((Number(this.canvas.dataset.frame)||0)+1);
    this.canvas.dispatchEvent(new CustomEvent('atlasdraw',{detail:{...info.metadata.detail,...info.profile,renderMs:info.latencyMs,workerPaintMs:info.workerPaintMs,latencyMs:info.latencyMs,engine:'worker-canvas'}}));
  }
  workerFailed(){
    this.raster?.destroy();this.raster=null;if(this.surface!==this.canvas)this.surface.remove();
    this.canvas.hidden=true;this.surface=canvas();this.surface.dataset.renderer='canvas';this.ctx=this.surface.getContext('2d');this.map.getContainer().appendChild(this.surface);this.canvas.dataset.renderer='canvas-fallback';this.canvas.setAttribute('aria-busy','false');this.map.getContainer().setAttribute('aria-busy','false');this.schedule();
  }
  updateHighlights(data){
    const key=(data.selected?.id||'')+'|'+[...data.highlightIds||[]].join(',')+'|'+this.filterKey(data,this.map.getZoom())+'|'+threshold(data.state.min);
    if(this.highlightKey===key&&this.highlightEdgesReference===data.edges)return;
    const items=this.rasterHighlightItems(data),edges=items.map(item=>({_world:item.world})),styles=items.map(({world,...style})=>({normal:style}));
    const view=this.view();this.gpu.upload(edges,true,[view.centerX,view.centerY]);this.gpu.styles(styles,true);this.highlightKey=key;this.highlightEdgesReference=data.edges;
  }
  pathFor(edge,zoom){
    let paths=this.paths.get(edge._world);if(!paths){paths=new Map();this.paths.set(edge._world,paths);}
    const bucket=Math.ceil(zoom);if(paths.has(bucket))return paths.get(bucket);
    const path=new Path2D(),p=renderWorld(edge._world,zoom);path.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)path.lineTo(p[i],p[i+1]);paths.set(bucket,path);if(paths.size>3)paths.delete(paths.keys().next().value);return path;
  }
  drawCanvas(data,view,pixels,key){
    const ctx=this.ctx,dpr=this.dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,view.width,view.height);
    ctx.setTransform(dpr*view.scale,0,0,dpr*view.scale,dpr*(view.width/2-view.centerX*view.scale),dpr*(view.height/2-view.centerY*view.scale));ctx.lineCap='round';ctx.lineJoin='round';
    key+=':lod:'+Math.ceil(view.zoom);let cached=this.canvasGroups.get(key);
    if(!cached){cached=[];for(let pass=0;pass<2;pass++){
      const groups=new Map();
      for(let i=0;i<this.meshEdges.length;i++){
        const edge=this.meshEdges[i],offset=i*16+pass*8;if(!pixels[offset+4])continue;
        const color=`rgb(${pixels[offset]},${pixels[offset+1]},${pixels[offset+2]})`,width=Math.max(.25,Math.round(pixels[offset+3]/255*16*4)/4),dash=!!pixels[offset+5],key=color+':'+width+':'+dash;
        let group=groups.get(key);if(!group){group={path:new Path2D(),color,width,dash,priority:pixels[offset+7]};groups.set(key,group);}group.path.addPath(this.pathFor(edge,view.zoom));
      }
      cached.push([...groups.values()].sort((a,b)=>a.priority-b.priority));
    }this.canvasGroups.set(key,cached);if(this.canvasGroups.size>4)this.canvasGroups.delete(this.canvasGroups.keys().next().value);}
    for(const groups of cached)for(const group of groups){ctx.strokeStyle=group.color;ctx.lineWidth=group.width/view.scale;ctx.lineCap=group.dash?'butt':'round';ctx.setLineDash(group.dash?[1/view.scale,5/view.scale]:[]);ctx.stroke(group.path);}
    for(const item of this.rasterHighlightItems(data)){
      ctx.strokeStyle=item.color;ctx.lineWidth=item.width/view.scale;ctx.lineCap=item.dash?'butt':'round';ctx.setLineDash(item.dash?[1/view.scale,5/view.scale]:[]);ctx.stroke(this.pathFor({_world:item.world},view.zoom));
    }
    ctx.setLineDash([]);
  }
  pick(x,y){
    if(!this.index||this.zoomAnimating)return null;
    const data=this.getData(),zoom=this.map.getZoom(),baseKey=this.filterKey(data,zoom),minimum=threshold(data.state.min),key=baseKey+':min:'+minimum+':selected:'+(data.selected?.id||'')+':highlighted:'+JSON.stringify([...data.highlightIds||[]]);
    if(this.pickStyleKey!==key||this.pickStyleEdges!==this.meshEdges){
      let base=this.styleCache.get(baseKey);if(!base){base=prepareStyles(this.meshEdges,data,zoom);this.styleCache.set(baseKey,base);}
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
}
