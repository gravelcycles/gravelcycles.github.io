import{perDay,colorFor,qualifiesEdge,segmentDistanceSquared,effectivePass,selectedDays,threshold,conditionalCount}from'./atlas-core.js?v=93165b59b2a7dd02';
export class RailRenderer{
  constructor(map,getData,onPick,onHover){
    this.map=map;this.getData=getData;this.onPick=onPick;this.onHover=onHover;
    this.canvas=document.createElement('canvas');this.canvas.className='atlas-canvas';this.canvas.setAttribute('aria-hidden','true');map.getContainer().appendChild(this.canvas);
    this.ctx=this.canvas.getContext('2d');this.grid=new Map();this.paths=new WeakMap();this.frame=0;this.hoverFrame=0;this.dragging=false;
    map.on('move',()=>this.pan());map.on('moveend zoomend resize',()=>this.schedule());
    map.on('click',event=>{const edge=this.pick(event.containerPoint.x,event.containerPoint.y);if(edge)this.onPick(edge);});
    map.on('mousemove',event=>{this.hoverPoint=event.containerPoint;if(this.dragging||this.hoverFrame)return;this.hoverFrame=requestAnimationFrame(()=>{this.hoverFrame=0;if(this.dragging)return;const point=this.hoverPoint,edge=this.pick(point.x,point.y);map.getContainer().style.cursor=edge?'pointer':'';this.onHover(edge,point);});});
    map.on('mouseout',()=>this.clearHover());map.on('dragstart',()=>{this.dragging=true;this.clearHover();});map.on('dragend',()=>{this.dragging=false;});
  }
  clearHover(){if(this.hoverFrame)cancelAnimationFrame(this.hoverFrame);this.hoverFrame=0;this.map.getContainer().style.cursor='';this.onHover(null);}
  pan(){if(!this.paintCenter||this.paintZoom!==this.map.getZoom()){this.schedule();return;}const center=this.map.project(this.map.getCenter(),this.paintZoom);this.panX=this.paintCenter.x-center.x;this.panY=this.paintCenter.y-center.y;this.canvas.style.transform=`translate3d(${this.panX}px,${this.panY}px,0)`;this.clearHover();}
  schedule(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});}
  pathFor(edge){let path=this.paths.get(edge._world);if(path)return path;path=new Path2D();const p=edge._world;path.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)path.lineTo(p[i],p[i+1]);this.paths.set(p,path);return path;}
  draw(){
    const started=performance.now(),{edges,state,dates,stations,selected,highlightIds}=this.getData(),size=this.map.getSize(),dpr=Math.min(2,devicePixelRatio||1);
    if(this.canvas.width!==Math.round(size.x*dpr)||this.canvas.height!==Math.round(size.y*dpr)){this.canvas.width=Math.round(size.x*dpr);this.canvas.height=Math.round(size.y*dpr);this.canvas.style.width=size.x+'px';this.canvas.style.height=size.y+'px';}
    const ctx=this.ctx;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,size.x,size.y);this.grid.clear();
    const z=this.map.getZoom(),scale=2**z,center=this.map.project(this.map.getCenter(),z);this.paintCenter=center;this.paintZoom=z;this.panX=0;this.panY=0;this.canvas.style.transform='';this.left=center.x-size.x/2;this.top=center.y-size.y/2;this.scale=scale;
    const groups=new Map(),minimum=threshold(state.min),days=Math.max(1,selectedDays(state.day,dates).length),pass=effectivePass(state);let visible=0;
    for(const edge of edges){
      const b=edge._bbox;if(b[2]*scale<this.left-12||b[0]*scale>this.left+size.x+12||b[3]*scale<this.top-12||b[1]*scale>this.top+size.y+12)continue;
      if(!qualifiesEdge(edge,state,dates,stations))continue;visible++;
      const value=perDay(edge,state,dates),review=pass&&state.review?conditionalCount(edge,state,dates)/days:0,styles=[];
      if(value>0&&value>=minimum)styles.push({value,color:colorFor(value),width:Math.min(4.4,.42+Math.log1p(value)*.47)*(z<5?.8:1),dash:/schematic/.test(edge.geometryStatus||''),review:false});
      if(review>0&&review>=minimum)styles.push({value:review,color:'#b99453',width:Math.min(3.3,.85+Math.log1p(review)*.32),dash:true,review:true});
      for(const style of styles){const key=style.color+':'+Math.round(style.width*3)+':'+style.dash;let group=groups.get(key);if(!group){group={path:new Path2D(),...style};groups.set(key,group);}group.path.addPath(this.pathFor(edge));}
      const x0=Math.max(0,Math.floor((b[0]*scale-this.left-7)/48)),x1=Math.min(Math.ceil(size.x/48),Math.floor((b[2]*scale-this.left+7)/48)),y0=Math.max(0,Math.floor((b[1]*scale-this.top-7)/48)),y1=Math.min(Math.ceil(size.y/48),Math.floor((b[3]*scale-this.top+7)/48));
      for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=x+','+y;if(!this.grid.has(key))this.grid.set(key,[]);this.grid.get(key).push(edge);}
    }
    // Paths stay in projected world coordinates. Panning/filters reuse their
    // native geometry instead of reprojecting every vertex on the main thread.
    ctx.setTransform(dpr*scale,0,0,dpr*scale,-this.left*dpr,-this.top*dpr);ctx.lineCap='round';ctx.lineJoin='round';
    for(const group of [...groups.values()].sort((a,b)=>Number(a.review)-Number(b.review)||a.value-b.value)){ctx.strokeStyle=group.color;ctx.lineWidth=group.width/scale;ctx.globalAlpha=1;ctx.setLineDash(group.dash?[4/scale,4/scale]:[]);ctx.stroke(group.path);}
    ctx.globalAlpha=1;ctx.setLineDash([]);
    if(highlightIds?.size)for(const edge of edges)if((edge._directionEdges||[edge]).some(row=>highlightIds.has(row.id)))this.highlight(edge,2.5);
    if(selected?._world)this.highlight(selected);this.visible=visible;
    this.canvas.dispatchEvent(new CustomEvent('atlasdraw',{detail:{visible,renderMs:performance.now()-started}}));
  }
  highlight(edge,width=3.2){const ctx=this.ctx,path=this.pathFor(edge);ctx.globalAlpha=1;ctx.strokeStyle='#fffcf1';ctx.lineWidth=(width+4)/this.scale;ctx.stroke(path);ctx.strokeStyle='#c95b32';ctx.lineWidth=width/this.scale;ctx.stroke(path);}
  pick(x,y){x-=this.panX||0;y-=this.panY||0;const candidates=this.grid.get(Math.floor(x/48)+','+Math.floor(y/48))||[],padding=7.5/this.scale;let winner=null,best=padding**2;const wx=(x+this.left)/this.scale,wy=(y+this.top)/this.scale;for(const edge of candidates){const b=edge._bbox;if(wx<b[0]-padding||wx>b[2]+padding||wy<b[1]-padding||wy>b[3]+padding)continue;const p=edge._world;for(let i=2;i<p.length;i+=2){const d=segmentDistanceSquared(wx,wy,p[i-2],p[i-1],p[i],p[i+1]);if(d<best){best=d;winner=edge;}}}return winner;}
}
