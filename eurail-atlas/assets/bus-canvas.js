import{BUS_LIMITS}from'./bus-core.js?v=b9b3fd287d8ce04b';
import{worldPoint}from'./atlas-core.js?v=b9b3fd287d8ce04b';
import{renderWorld}from'./rail-lod.js?v=b9b3fd287d8ce04b';
import{RouteIndex}from'./rail-picking.js?v=b9b3fd287d8ce04b';

// Reuse the train renderer's world coordinates, half-pixel display LOD and
// geographic route index. Original vertices remain the picking authority.
export class BusGeometryCache{
  constructor(maximumVertices=BUS_LIMITS.vertices*3){this.maximumVertices=maximumVertices;this.entries=new Map();this.vertices=0;}
  get(row){
    const coordinates=row.coordinates||[],key=row.geometryKey||coordinates,old=this.entries.get(key);
    if(old){this.entries.delete(key);this.entries.set(key,old);return old;}
    const world=new Float64Array(coordinates.length*2);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,valid=true;
    for(let i=0;i<coordinates.length;i++){
      const[lon,lat]=coordinates[i];
      if(!Number.isFinite(lon)||!Number.isFinite(lat)){world[i*2]=world[i*2+1]=NaN;valid=false;continue;}
      const[x,y]=worldPoint(lon,lat);world[i*2]=x;world[i*2+1]=y;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
    const entry={_world:world,_bbox:[minX,minY,maxX,maxY],valid,paths:new Map()};
    if(coordinates.length<=this.maximumVertices){this.entries.set(key,entry);this.vertices+=coordinates.length;while(this.vertices>this.maximumVertices){const first=this.entries.keys().next().value;this.vertices-=this.entries.get(first)._world.length/2;this.entries.delete(first);}}
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

export const busPaintOrder=edge=>({pass:edge.selectedPaint?1:0,priority:0,width:edge.selectedPaint?5:2.8,order:edge.paintOrder||0});

export class BusCanvas{
  constructor(map,onPick){
    this.map=map;this.onPick=onPick;this.rows=[];this.stops=[];this.selected=null;this.frame=0;this.moving=false;this.geometry=new BusGeometryCache();this.groups=null;
    this.canvas=document.createElement('canvas');this.canvas.className='bus-map-canvas leaflet-zoom-animated';this.canvas.setAttribute('aria-hidden','true');this.ctx=this.canvas.getContext('2d');map.getContainer().append(this.canvas);
    this.move=()=>{if(!this.zoomAnimating)this.align();};this.end=()=>{this.moving=false;this.zoomAnimating=false;this.canvas.style.transition='none';this.schedule();};this.start=()=>{this.moving=true;};
    this.zoom=event=>{if(!this.camera)return;this.zoomAnimating=true;this.canvas.style.transition='transform 250ms cubic-bezier(0.25,0.1,0.25,1)';this.align(this.view(event.center,event.zoom));};
    this.click=event=>{const row=this.pick(event.containerPoint.x,event.containerPoint.y);if(row)this.onPick(row);};
    map.on('move',this.move);map.on('moveend zoomend resize wheelzoomend',this.end);map.on('zoomstart dragstart wheelzoomstart',this.start);map.on('zoomanim',this.zoom);map.on('click',this.click);
  }
  view(center=this.map.getCenter(),zoom=this.map.getZoom()){const size=this.map.getSize(),p=this.map.project(center,0);return{center,zoom,width:size.x,height:size.y,scale:2**zoom,centerX:p.x,centerY:p.y};}
  set(rows,stops,selected){this.rows=rows;this.stops=stops;this.selected=selected;this.groups=null;this.schedule();}
  schedule(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});}
  align(view=this.view()){
    if(!this.camera)return;const old=this.camera,scale=view.scale/old.scale,x=(old.centerX-view.centerX)*view.scale+(view.width-old.width*scale)/2,y=(old.centerY-view.centerY)*view.scale+(view.height-old.height*scale)/2;
    this.canvas.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
  }
  prepare(zoom){
    const bucket=Math.ceil(zoom);if(this.groups&&this.bucket===bucket)return;
    const rows=this.selected?[...this.rows.filter(r=>r.id!==this.selected.id).slice(0,BUS_LIMITS.routes-1),this.selected]:this.rows.slice(0,BUS_LIMITS.routes),groups=[];let remaining=BUS_LIMITS.vertices,rendered=0;
    const reserve=this.selected?Math.min(BUS_LIMITS.vertices,this.selected.coordinates?.length||0):0;this.painted=[];
    for(const row of rows){let coords=row.coordinates||[];const selected=row.id===this.selected?.id,allowed=selected?remaining:remaining-reserve;if(allowed<2||coords.length<2)continue;
      let record=row;if(coords.length>allowed){if(!selected)continue;const stride=Math.ceil((coords.length-1)/(allowed-1)),points=[];for(let i=0;i<coords.length-1;i+=stride)points.push(coords[i]);points.push(coords.at(-1));record={...row,coordinates:points,geometryKey:undefined};coords=points;}
      remaining-=coords.length;const entry=this.geometry.get(record),{path,vertices}=busPath(entry,zoom),style=(selected?'selected:':'normal:')+(row.geometry==='provider_shape'?'solid':'dash');let group=groups.at(-1);
      // Consecutive equal styles share a native stroke without changing order.
      if(!group||group.style!==style){group={style,path:new Path2D(),selected,dash:row.geometry!=='provider_shape'};groups.push(group);}group.path.addPath(path);rendered+=vertices;this.painted.push({...entry,row,id:row.id,selectedPaint:selected,paintOrder:this.painted.length});
    }
    this.vertexCount=BUS_LIMITS.vertices-remaining;this.renderedVertices=rendered;this.groups=groups;this.bucket=bucket;
  }
  draw(){
    if(this.moving||this.zoomAnimating)return;const started=performance.now(),view=this.view(),ratio=Math.min(globalThis.devicePixelRatio||1,2),ctx=this.ctx;if(!ctx)return;
    const width=Math.ceil(view.width*ratio),height=Math.ceil(view.height*ratio);if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;this.canvas.style.width=view.width+'px';this.canvas.style.height=view.height+'px';}
    this.camera=view;this.canvas.style.transform='';ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);this.prepare(view.zoom);
    ctx.setTransform(ratio*view.scale,0,0,ratio*view.scale,ratio*(view.width/2-view.centerX*view.scale),ratio*(view.height/2-view.centerY*view.scale));ctx.lineJoin='round';
    for(const group of this.groups){ctx.strokeStyle=group.selected?'#8a3f0d':'#b26918';ctx.lineWidth=(group.selected?5:2.8)/view.scale;ctx.globalAlpha=group.selected?1:.8;ctx.setLineDash(group.dash?[5/view.scale,5/view.scale]:[]);ctx.stroke(group.path);}
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.globalAlpha=1;ctx.setLineDash([]);
    const selectedIds=new Set(this.selected?.stopIds||this.selected?.calls?.map(c=>c.id)||[]),calls=this.selected?.calls||[],boarding=calls.filter(c=>c.passengerCall!==false&&(c.pickupType!==1||c.dropOffType!==1)&&Number.isFinite(c.lat)&&Number.isFinite(c.lon)),ends=boarding.length?[boarding[0],boarding.at(-1)]:[],candidates=calls.length?[...ends,...calls,...this.stops]:this.stops,seen=new Set(),dots=[new Path2D(),new Path2D()];let stopCount=0;
    for(const stop of candidates){if(seen.has(stop.id)||(view.zoom<9&&!selectedIds.has(stop.id)))continue;seen.add(stop.id);if(!Number.isFinite(stop.lat)||!Number.isFinite(stop.lon))continue;const[wx,wy]=worldPoint(stop.lon,stop.lat),x=(wx-view.centerX)*view.scale+view.width/2,y=(wy-view.centerY)*view.scale+view.height/2;if(x<0||y<0||x>view.width||y>view.height)continue;if(stopCount>=BUS_LIMITS.stops)break;const chosen=selectedIds.has(stop.id),r=chosen?3.5:2.2,path=dots[+chosen];path.moveTo(x+r,y);path.arc(x,y,r,0,Math.PI*2);stopCount++;}
    ctx.fillStyle='#fff8e9';ctx.strokeStyle='#925012';ctx.lineWidth=1.3;for(const path of dots){ctx.fill(path);ctx.stroke(path);}
    const picking=busPickEdges([...this.painted].reverse(),view);this.index=new RouteIndex(picking.edges);
    Object.assign(this.canvas.dataset,{vertices:String(this.vertexCount),renderedVertices:String(this.renderedVertices),routes:String(this.painted.length),stops:String(stopCount),pickSegments:String(picking.segments),pending:'false',frame:String((Number(this.canvas.dataset.frame)||0)+1)});
    this.canvas.dispatchEvent(new CustomEvent('busdraw',{detail:{routes:this.painted.length,vertices:this.vertexCount,renderedVertices:this.renderedVertices,stops:stopCount,pickSegments:picking.segments,renderMs:performance.now()-started}}));
  }
  pick(x,y){if(this.moving||this.zoomAnimating||!this.camera||!this.index)return null;return this.index.pick(x,y,this.view(),8,()=>true,busPaintOrder)?.row||null;}
  destroy(){cancelAnimationFrame(this.frame);this.map.off('move',this.move);this.map.off('moveend zoomend resize wheelzoomend',this.end);this.map.off('zoomstart dragstart wheelzoomstart',this.start);this.map.off('zoomanim',this.zoom);this.map.off('click',this.click);this.canvas.remove();this.index=null;this.rows=[];this.stops=[];this.groups=null;this.painted=[];this.geometry.clear();}
}
