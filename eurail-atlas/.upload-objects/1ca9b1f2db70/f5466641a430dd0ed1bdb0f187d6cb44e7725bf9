import{BUS_LIMITS,BUS_OVERVIEW_LIMITS}from'./bus-core.js?v=fce68094a07b4a25';
import{worldPoint,FREQUENCY_COLORS}from'./atlas-core.js?v=fce68094a07b4a25';
import{BUS_NETWORK_LIMITS,busNetworkPaths,paintBusNetwork}from'./bus-network.js?v=fce68094a07b4a25';
import{renderWorld}from'./rail-lod.js?v=fce68094a07b4a25';
import{RouteIndex}from'./rail-picking.js?v=fce68094a07b4a25';
import{busFocusMembership,busRouteFocused}from'./bus-focus.js?v=fce68094a07b4a25';

// Reuse the train renderer's world coordinates, half-pixel display LOD and
// geographic route index. Original vertices remain the picking authority.
export class BusGeometryCache{
  constructor(maximumVertices=BUS_LIMITS.vertices*3){this.maximumVertices=maximumVertices;this.entries=new Map();this.vertices=0;}
  get(row){
    const coordinates=row.coordinates||[],key=row.geometryKey||coordinates,old=this.entries.get(key);
    if(old){this.entries.delete(key);this.entries.set(key,old);return old;}
    const packed=row._world instanceof Float64Array,world=packed?row._world.slice():new Float64Array(coordinates.length*2);let minX=packed?row._bbox[0]:Infinity,minY=packed?row._bbox[1]:Infinity,maxX=packed?row._bbox[2]:-Infinity,maxY=packed?row._bbox[3]:-Infinity,valid=true;
    for(let i=0;!packed&&i<coordinates.length;i++){
      const[lon,lat]=coordinates[i];
      if(!Number.isFinite(lon)||!Number.isFinite(lat)){world[i*2]=world[i*2+1]=NaN;valid=false;continue;}
      const[x,y]=worldPoint(lon,lat);world[i*2]=x;world[i*2+1]=y;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
    const entry={_world:world,_bbox:[minX,minY,maxX,maxY],valid,paths:new Map()};
    if(world.length/2<=this.maximumVertices){this.entries.set(key,entry);this.vertices+=world.length/2;while(this.vertices>this.maximumVertices){const first=this.entries.keys().next().value;this.vertices-=this.entries.get(first)._world.length/2;this.entries.delete(first);}}
    return entry;
  }
  clear(){this.entries.clear();this.vertices=0;}
}

export function busPath(entry,zoom){
  const bucket=Math.ceil(zoom);if(entry.paths.has(bucket))return entry.paths.get(bucket);
  const world=entry.valid?renderWorld(entry._world,zoom):entry._world,path=new Path2D();let connected=false;
  for(let i=0;i<world.length;i+=2){const x=world[i],y=world[i+1];if(!Number.isFinite(x)||!Number.isFinite(y)){connected=false;continue;}if(connected)path.lineTo(x,y);else path.moveTo(x,y);connected=true;}
  const result={path,vertices:world.length/2};entry.paths.set(bucket,result);if(entry.paths.size>3)entry.paths.delete(entry.paths.keys().next().value);return result;
}

// The index stores route boxes, not thousands of screen-space segment objects.
// Only original segments crossing the viewport consume the picking allowance.
export function busPickEdges(rows,view,limit=BUS_LIMITS.pickSegments){
  const edges=[];let segments=0;
  const left=view.centerX-(view.width/2+8)/view.scale,right=view.centerX+(view.width/2+8)/view.scale,top=view.centerY-(view.height/2+8)/view.scale,bottom=view.centerY+(view.height/2+8)/view.scale;
  for(const row of rows){const p=row._world;let run=[];
    const flush=()=>{if(run.length){edges.push({...row,_world:new Float64Array(run)});run=[];}};
    for(let i=2;i<p.length;i+=2){const ax=p[i-2],ay=p[i-1],bx=p[i],by=p[i+1];
      if(!Number.isFinite(ax+ay+bx+by)||Math.max(ax,bx)<left||Math.min(ax,bx)>right||Math.max(ay,by)<top||Math.min(ay,by)>bottom){flush();continue;}
      if(segments===limit){flush();return{edges,segments};}
      if(!run.length)run.push(ax,ay);run.push(bx,by);segments++;
    }flush();
  }return{edges,segments};
}

export const busPaintOrder=edge=>({pass:edge.selectedPaint?2:edge.focusedPaint?1:0,priority:edge.paintGroup||0,width:edge.selectedPaint?5:edge.strokeWidth||2.8,order:edge.paintOrder||0});

export class BusCanvas{
  constructor(map,onPick){
    this.map=map;this.onPick=onPick;this.rows=[];this.stops=[];this.selected=null;this.focus=null;this.overview=false;this.aggregate=null;this.network=null;this.frame=0;this.moving=false;this.geometry=new BusGeometryCache(BUS_OVERVIEW_LIMITS.vertices*2);this.groups=null;this.paintedStops=[];
    this.canvas=document.createElement('canvas');this.canvas.className='bus-map-canvas leaflet-zoom-animated';this.canvas.setAttribute('aria-hidden','true');this.ctx=this.canvas.getContext('2d');map.getContainer().append(this.canvas);
    this.move=()=>{if(!this.zoomAnimating)this.align();};this.end=()=>{this.moving=false;this.zoomAnimating=false;this.canvas.style.transition='none';this.schedule();};this.start=()=>{this.moving=true;};
    this.zoom=event=>{if(!this.camera)return;this.zoomAnimating=true;this.canvas.style.transition='transform 250ms cubic-bezier(0.25,0.1,0.25,1)';this.align(this.view(event.center,event.zoom));};
    this.click=event=>{const row=this.pick(event.containerPoint.x,event.containerPoint.y);if(row)this.onPick(row);};
    map.on('move',this.move);map.on('moveend zoomend resize wheelzoomend',this.end);map.on('zoomstart dragstart wheelzoomstart',this.start);map.on('zoomanim',this.zoom);map.on('click',this.click);
  }
  view(center=this.map.getCenter(),zoom=this.map.getZoom()){const size=this.map.getSize(),p=this.map.project(center,0);return{center,zoom,width:size.x,height:size.y,scale:2**zoom,centerX:p.x,centerY:p.y};}
  set(rows,stops,selected,options={}){this.rows=rows;this.stops=stops;this.selected=selected;if('network'in options&&this.network!==options.network){this.network?.bitmap?.close();this.network=options.network;}if('focus'in options)this.focus=options.focus;if('overview'in options)this.overview=options.overview;if('aggregate'in options&&this.aggregate!==options.aggregate){this.aggregate?.bitmap?.close();this.aggregate=options.aggregate;}if(this.aggregate&&this.aggregate.vertices+Math.min(BUS_LIMITS.vertices,selected?.coordinates?.length||0)>BUS_OVERVIEW_LIMITS.vertices){this.aggregate.bitmap?.close();this.aggregate=null;}this.groups=null;this.paintedStops=[];this.schedule();}
  schedule(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});}
  align(view=this.view()){
    if(!this.camera)return;const old=this.camera,scale=view.scale/old.scale,x=(old.centerX-view.centerX)*view.scale+(view.width-old.width*scale)/2,y=(old.centerY-view.centerY)*view.scale+(view.height-old.height*scale)/2;
    this.canvas.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
  }
  prepare(zoom){
    const bucket=Math.ceil(zoom);if(this.groups&&this.bucket===bucket)return;
    this.membership=busFocusMembership(this.rows,this.stops,this.focus,this.selected);
    if(this.overview){this.prepareOverview(zoom);return;}
    const rows=this.selected?[...this.rows.filter(r=>r.id!==this.selected.id).slice(0,BUS_LIMITS.routes-1),this.selected]:this.rows.slice(0,BUS_LIMITS.routes),groups=[];if(this.membership.active)rows.sort((a,b)=>Number(busRouteFocused(a,this.membership))-Number(busRouteFocused(b,this.membership)));let remaining=BUS_LIMITS.vertices,rendered=0;
    const reserve=this.selected?Math.min(BUS_LIMITS.vertices,this.selected.coordinates?.length||0):0;this.painted=[];
    for(const row of rows){let coords=row.coordinates||[];const selected=row.id===this.selected?.id,allowed=selected?remaining:remaining-reserve;if(allowed<2||coords.length<2)continue;
      let record=row;if(coords.length>allowed){if(!selected)continue;const stride=Math.ceil((coords.length-1)/(allowed-1)),points=[];for(let i=0;i<coords.length-1;i+=stride)points.push(coords[i]);points.push(coords.at(-1));record={...row,coordinates:points,geometryKey:undefined};coords=points;}
      remaining-=coords.length;const entry=this.geometry.get(record),{path,vertices}=busPath(entry,zoom),focused=busRouteFocused(row,this.membership),style=(selected?'selected:':focused?'normal:':'context:')+(row.geometry==='provider_shape'?'solid':'dash');let group=groups.at(-1);
      // Consecutive equal styles share a native stroke without changing order.
      if(!group||group.style!==style){group={style,path:new Path2D(),selected,focused,dash:row.geometry!=='provider_shape'};groups.push(group);}group.path.addPath(path);rendered+=vertices;this.painted.push({...entry,row,id:row.id,selectedPaint:selected,focusedPaint:this.membership.active&&focused,strokeWidth:selected?5:this.membership.active&&focused?3.4:2.8,paintOrder:this.painted.length});
    }
    this.vertexCount=BUS_LIMITS.vertices-remaining;this.renderedVertices=rendered;this.groups=groups;this.bucket=bucket;
  }
  prepareOverview(zoom){
    // Admission rejects an oversized derivative before this point. Paint every
    // matching native pattern; regional caps must never truncate this view.
    this.membership??=busFocusMembership(this.rows,this.stops,this.focus,this.selected);const rows=this.rows.filter(row=>row.id!==this.selected?.id),groups=new Map();let vertices=0,rendered=0;this.painted=[];
    if(rows.length>BUS_OVERVIEW_LIMITS.routes||rows.reduce((n,row)=>n+(row._pointCount||row.coordinates?.length||0),0)>BUS_OVERVIEW_LIMITS.vertices)throw new Error('Bus overview exceeds display budget');
    if(this.selected)rows.push(this.selected);
    if(this.membership.active)rows.sort((a,b)=>Number(busRouteFocused(a,this.membership))-Number(busRouteFocused(b,this.membership)));
    for(const row of rows){
      const selected=row.id===this.selected?.id;let record=row;
      if(selected&&row.coordinates?.length>BUS_LIMITS.vertices){const stride=Math.ceil((row.coordinates.length-1)/(BUS_LIMITS.vertices-1)),coordinates=row.coordinates.filter((_,i)=>i%stride===0);if(coordinates.at(-1)!==row.coordinates.at(-1))coordinates.push(row.coordinates.at(-1));record={...row,coordinates,geometryKey:undefined};}
      const entry=this.geometry.get(record);if(entry._world.length<4)continue;const result=busPath(entry,zoom),focused=busRouteFocused(row,this.membership),style=(selected?'selected:':focused?'normal:':'context:')+(row.geometry==='provider_shape'?'solid':'dash');let group=groups.get(style);
      if(!group){group={style,path:new Path2D(),selected,focused,dash:row.geometry!=='provider_shape',order:groups.size};groups.set(style,group);}group.path.addPath(result.path);vertices+=entry._world.length/2;rendered+=result.vertices;
      this.painted.push({...entry,row,id:row.id,selectedPaint:selected,focusedPaint:this.membership.active&&focused,paintGroup:group.order,strokeWidth:this.membership.active&&focused?3.4:1.5,paintOrder:this.painted.length});
    }
    this.vertexCount=vertices;this.renderedVertices=rendered;this.groups=[...groups.values()];this.bucket=Math.ceil(zoom);
  }
  drawAggregate(ctx,view,ratio){
    const scene=this.aggregate;if(!scene)return;
    const focused=!!this.selected||['route','stop','city'].includes(this.focus?.kind);
    if(scene.bitmap){const old=scene.camera,scale=view.scale/old.scale,x=(old.centerX-view.centerX)*view.scale+(view.width-old.width*scale)/2,y=(old.centerY-view.centerY)*view.scale+(view.height-old.height*scale)/2;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.filter=focused?'grayscale(1) brightness(1.45)':'none';ctx.globalAlpha=focused?.6:1;ctx.drawImage(scene.bitmap,x,y,old.width*scale,old.height*scale);ctx.filter='none';}
    else{
      // Independent aggregate segments must never be fed through polyline LOD:
      // joining consecutive pairs would invent links absent from the packet.
      if(!scene.paths){scene.paths=(scene.aggregateGroups||[]).map(group=>{const path=new Path2D();for(let i=0;i<group.world.length;i+=4){path.moveTo(group.world[i],group.world[i+1]);path.lineTo(group.world[i+2],group.world[i+3]);}return{path,dash:group.dash};});}
      ctx.setTransform(ratio*view.scale,0,0,ratio*view.scale,ratio*(view.width/2-view.centerX*view.scale),ratio*(view.height/2-view.centerY*view.scale));ctx.strokeStyle=focused?'#b0b8b3':'#b26918';ctx.fillStyle=focused?'#b0b8b3':'#b26918';ctx.globalAlpha=focused?.6:.8;ctx.lineWidth=1.5/view.scale;
      for(const group of scene.paths){ctx.setLineDash(group.dash?[5/view.scale,5/view.scale]:[]);ctx.stroke(group.path);}
      ctx.setLineDash([]);ctx.beginPath();for(let i=0;i<(scene.presence?.length||0);i+=2){const x=scene.presence[i],y=scene.presence[i+1],r=1.2/view.scale;ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,Math.PI*2);}ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  // Frequency-coloured network: a worker bitmap for dense views, vector
  // strokes for small ones. Selection greys it without another request.
  drawNetwork(ctx,view,ratio){
    const scene=this.network;if(!scene)return;
    const focused=!!this.selected||this.focus?.kind==='route';
    if(scene.bitmap){
      const old=scene.camera,scale=view.scale/old.scale,x=(old.centerX-view.centerX)*view.scale+(view.width-old.width*scale)/2,y=(old.centerY-view.centerY)*view.scale+(view.height-old.height*scale)/2;
      ctx.setTransform(ratio,0,0,ratio,0,0);ctx.filter=focused?'grayscale(1) brightness(1.35)':'none';ctx.globalAlpha=focused?.5:1;
      ctx.drawImage(scene.bitmap,x,y,old.width*scale,old.height*scale);ctx.filter='none';ctx.globalAlpha=1;return;
    }
    scene.paths??=busNetworkPaths(scene.bands);
    paintBusNetwork(ctx,scene.paths,view,ratio,{focused,members:scene.members});
  }
  draw(){
    if(this.moving||this.zoomAnimating)return;const started=performance.now(),view=this.view(),ratio=Math.min(globalThis.devicePixelRatio||1,2),ctx=this.ctx;if(!ctx)return;
    const width=Math.ceil(view.width*ratio),height=Math.ceil(view.height*ratio);if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;this.canvas.style.width=view.width+'px';this.canvas.style.height=view.height+'px';}
    this.camera=view;this.canvas.style.transform='';ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);this.drawAggregate(ctx,view,ratio);this.drawNetwork(ctx,view,ratio);this.prepare(view.zoom);
    ctx.setTransform(ratio*view.scale,0,0,ratio*view.scale,ratio*(view.width/2-view.centerX*view.scale),ratio*(view.height/2-view.centerY*view.scale));ctx.lineJoin='round';
    for(const group of this.groups){if(group.selected&&this.network){ctx.strokeStyle='#ffffff';ctx.lineWidth=9/view.scale;ctx.globalAlpha=.95;ctx.setLineDash([]);ctx.stroke(group.path);}ctx.strokeStyle=group.selected?(this.network?'#14262b':'#8a3f0d'):group.focused?'#b26918':'#b0b8b3';ctx.lineWidth=(group.selected?5:this.membership.active&&group.focused?3.4:this.overview?1.5:2.8)/view.scale;ctx.globalAlpha=group.selected?1:group.focused?.8:.6;ctx.setLineDash(group.dash?[5/view.scale,5/view.scale]:[]);ctx.stroke(group.path);}
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.globalAlpha=1;ctx.setLineDash([]);
    const selectedIds=this.membership.stopIds,calls=this.selected?.calls||[],boarding=calls.filter(c=>c.passengerCall!==false&&(c.pickupType!==1||c.dropOffType!==1)&&Number.isFinite(c.lat)&&Number.isFinite(c.lon)),ends=boarding.length?[boarding[0],boarding.at(-1)]:[],focusStops=[...(this.focus?.kind==='stop'?[this.focus.stop]:[]),...this.stops.filter(stop=>selectedIds.has(stop.id))],candidates=this.overview?[...ends,...focusStops]:calls.length?[...ends,...calls,...focusStops,...this.stops]:[...focusStops,...this.stops],seen=new Set(),occupied=new Set(),dots=[new Path2D(),new Path2D()];let stopCount=0;this.paintedStops=[];
    for(const stop of candidates){if(!stop||seen.has(stop.id)||(view.zoom<BUS_LIMITS.minimumZoom&&!selectedIds.has(stop.id)))continue;seen.add(stop.id);if(!Number.isFinite(stop.lat)||!Number.isFinite(stop.lon))continue;const[wx,wy]=worldPoint(stop.lon,stop.lat),x=(wx-view.centerX)*view.scale+view.width/2,y=(wy-view.centerY)*view.scale+view.height/2;if(x<0||y<0||x>view.width||y>view.height)continue;if(stopCount>=BUS_LIMITS.stops)break;const chosen=selectedIds.has(stop.id),cell=Math.floor(x/18)+','+Math.floor(y/18);if(view.zoom<9&&!chosen&&occupied.has(cell))continue;occupied.add(cell);const normal=!this.membership.active||chosen,r=chosen?3.5:2.2,path=dots[+normal];path.moveTo(x+r,y);path.arc(x,y,r,0,Math.PI*2);this.paintedStops.push({stop,x,y,r,chosen});stopCount++;}
    ctx.lineWidth=1.3;for(const[i,path]of dots.entries()){ctx.fillStyle=i?'#fff8e9':'#e2e6e3';ctx.strokeStyle=i?'#925012':'#a7b0aa';ctx.fill(path);ctx.stroke(path);}
    const picking=this.overview?{edges:this.painted,segments:this.painted.reduce((n,row)=>n+row._world.length/2-1,0)}:busPickEdges([...this.painted].reverse(),view);this.index=new RouteIndex(picking.edges);
    const aggregateVertices=this.aggregate?.vertices||0,totalVertices=this.vertexCount+aggregateVertices;
    Object.assign(this.canvas.dataset,{mode:this.network?'network':this.aggregate?'aggregate':this.overview?'overview':'local',networkSegments:String(this.network?.segments||0),networkRaster:String(!!this.network?.bitmap),networkTileZoom:String(this.network?.tileZoom??''),focus:this.membership.kind,matchingRoutes:String(this.painted.filter(row=>this.membership.routeIds.has(row.id)).length),contextRoutes:String(this.membership.active?this.painted.filter(row=>!this.membership.routeIds.has(row.id)).length:0),vertices:String(totalVertices),aggregateVertices:String(aggregateVertices),aggregateReferenceZoom:String(this.aggregate?.referenceZoom||0),aggregateRaster:String(!!this.aggregate?.bitmap),renderedVertices:String(this.renderedVertices+aggregateVertices),routes:String(this.painted.length),stops:String(stopCount),pickSegments:String(picking.segments),pending:'false',frame:String((Number(this.canvas.dataset.frame)||0)+1)});
    this.canvas.dispatchEvent(new CustomEvent('busdraw',{detail:{routes:this.painted.length,vertices:totalVertices,aggregate:!!this.aggregate,renderedVertices:this.renderedVertices+aggregateVertices,stops:stopCount,pickSegments:picking.segments,renderMs:performance.now()-started}}));
  }
  pick(x,y){if(this.moving||this.zoomAnimating||!this.camera||!this.index)return null;const view=this.view();let stopHit=null,best=10**2;for(const entry of this.paintedStops||[]){const[wx,wy]=worldPoint(entry.stop.lon,entry.stop.lat),sx=(wx-view.centerX)*view.scale+view.width/2,sy=(wy-view.centerY)*view.scale+view.height/2,distance=(x-sx)**2+(y-sy)**2;if(distance<best){best=distance;stopHit=entry.stop;}}if(stopHit)return{...stopHit,stop:true};const native=this.index.pick(x,y,view,8,()=>true,busPaintOrder)?.row;if(native)return native;if(this.network)return{network:true,sceneId:this.network.sceneId,x:view.centerX+(x-view.width/2)/view.scale,y:view.centerY+(y-view.height/2)/view.scale,radius:BUS_NETWORK_LIMITS.hitPixels/view.scale};const scene=this.aggregate;if(!scene)return null;const wx=view.centerX+(x-view.width/2)/view.scale,wy=view.centerY+(y-view.height/2)/view.scale,sx=(wx-scene.camera.centerX)*scene.camera.scale+scene.camera.width/2,sy=(wy-scene.camera.centerY)*scene.camera.scale+scene.camera.height/2,cx=Math.floor(sx/scene.cell),cy=Math.floor(sy/scene.cell);if(sx<0||sy<0||sx>=scene.camera.width||sy>=scene.camera.height||!scene.occupancy[cy*scene.gridWidth+cx])return null;return{aggregate:true,sceneId:scene.sceneId,x:sx,y:sy};}
  destroy(){cancelAnimationFrame(this.frame);this.network?.bitmap?.close();this.network=null;this.aggregate?.bitmap?.close();this.aggregate=null;this.map.off('move',this.move);this.map.off('moveend zoomend resize wheelzoomend',this.end);this.map.off('zoomstart dragstart wheelzoomstart',this.start);this.map.off('zoomanim',this.zoom);this.map.off('click',this.click);this.canvas.remove();this.index=null;this.rows=[];this.stops=[];this.focus=null;this.paintedStops=[];this.groups=null;this.painted=[];this.geometry.clear();}
}
