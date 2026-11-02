// Index individual visible segments, rather than a long route's entire box.
// Segment-cell traversal is linear in the screen distance, not its box area.
import{segmentDistanceSquared}from'./atlas-core.js?v=6d01324ad8527f21';

// Building a vertex grid on every arriving geometry chunk creates millions of
// allocations. Bboxes are already prepared in the data worker. Hover first
// rejects distant routes, then checks the full vertices of nearby candidates.
export class RouteIndex{
  constructor(edges){this.edges=edges;}
  pick(x,y,view,radius=7.5,qualifies=()=>true,paintOrder=null){
    const wx=(x-view.width/2)/view.scale+view.centerX,wy=(y-view.height/2)/view.scale+view.centerY,padding=radius/view.scale;
    let winner=null,best=padding*padding,winnerPaint=null,winnerHit=false;
    const above=(a,b)=>a&&(!b||a.pass>b.pass||a.pass===b.pass&&(a.priority>b.priority||a.priority===b.priority&&a.order>b.order));
    for(const edge of this.edges){
      const b=edge._bbox;if(wx<b[0]-padding||wx>b[2]+padding||wy<b[1]-padding||wy>b[3]+padding||!qualifies(edge))continue;
      const p=edge._world;let distance=padding*padding;
      for(let i=2;i<p.length;i+=2){if(p[i]===p[i-2]&&p[i+1]===p[i-1])continue;distance=Math.min(distance,segmentDistanceSquared(wx,wy,p[i-2],p[i-1],p[i],p[i+1]));}
      if(distance>=padding*padding)continue;
      const paint=paintOrder?.(edge),hit=!!paint&&distance<=((paint.width/2+.65)/view.scale)**2;
      if(!winner||(hit&&!winnerHit)||(hit&&winnerHit&&above(paint,winnerPaint))||(!hit&&!winnerHit&&(distance<best||distance===best&&above(paint,winnerPaint)))){
        best=distance;winner=edge;winnerPaint=paint;winnerHit=hit;
      }
    }
    return winner;
  }
}

function clip(ax,ay,bx,by,minX,minY,maxX,maxY){
  const dx=bx-ax,dy=by-ay;let low=0,high=1;
  for(let side=0;side<4;side++){
    const p=side===0?-dx:side===1?dx:side===2?-dy:dy,q=side===0?ax-minX:side===1?maxX-ax:side===2?ay-minY:maxY-ay;
    if(p===0){if(q<0)return null;continue;}
    const r=q/p;if(p<0)low=Math.max(low,r);else high=Math.min(high,r);if(low>high)return null;
  }
  return[ax+low*dx,ay+low*dy,ax+high*dx,ay+high*dy];
}

export class SegmentIndex{
  constructor(edges,view,cell=48,padding=8){
    this.view=view;this.cell=cell;this.padding=padding;this.columns=Math.ceil((view.width+padding*2)/cell);this.rows=Math.ceil((view.height+padding*2)/cell);this.cells=Array(this.columns*this.rows);this.segments=[];
    for(const edge of edges){
      const points=edge._world;
      for(let i=2;i<points.length;i+=2){
        if(points[i]===points[i-2]&&points[i+1]===points[i-1])continue;
        const ax=(points[i-2]-view.centerX)*view.scale+view.width/2,ay=(points[i-1]-view.centerY)*view.scale+view.height/2,bx=(points[i]-view.centerX)*view.scale+view.width/2,by=(points[i+1]-view.centerY)*view.scale+view.height/2;
        const bounds=clip(ax,ay,bx,by,-padding,-padding,view.width+padding,view.height+padding);if(!bounds)continue;
        const id=this.segments.length;this.segments.push({edge,index:i});this.insert(bounds,id);
      }
    }
  }
  insert([ax,ay,bx,by],id){
    const p=this.padding,c=this.cell;ax+=p;ay+=p;bx+=p;by+=p;
    let x=Math.min(this.columns-1,Math.max(0,Math.floor(ax/c))),y=Math.min(this.rows-1,Math.max(0,Math.floor(ay/c)));
    const endX=Math.min(this.columns-1,Math.max(0,Math.floor(bx/c))),endY=Math.min(this.rows-1,Math.max(0,Math.floor(by/c))),dx=bx-ax,dy=by-ay,sx=dx>0?1:-1,sy=dy>0?1:-1;
    let tx=dx?((dx>0?(x+1)*c:x*c)-ax)/dx:Infinity,ty=dy?((dy>0?(y+1)*c:y*c)-ay)/dy:Infinity;
    const stepX=dx?c/Math.abs(dx):Infinity,stepY=dy?c/Math.abs(dy):Infinity;
    for(let n=0;n<this.columns+this.rows+4;n++){
      const key=x+y*this.columns,bucket=this.cells[key]||(this.cells[key]=[]);if(bucket[bucket.length-1]!==id)bucket.push(id);
      if(x===endX&&y===endY)break;
      if(tx<ty){x+=sx;tx+=stepX;}else{y+=sy;ty+=stepY;}
      if(x<0||y<0||x>=this.columns||y>=this.rows)break;
    }
  }
  pick(x,y,currentView=this.view,radius=7.5,qualifies=()=>true){
    // The settled grid moves with the map during a drag; exact segment tests
    // remain in geographic world coordinates at the current viewport.
    const view=this.view,wx=(x-currentView.width/2)/currentView.scale+currentView.centerX,wy=(y-currentView.height/2)/currentView.scale+currentView.centerY;
    x=(wx-view.centerX)*view.scale+view.width/2;y=(wy-view.centerY)*view.scale+view.height/2;
    const radiusIndex=radius*view.scale/currentView.scale,minX=Math.max(0,Math.floor((x-radiusIndex+this.padding)/this.cell)),maxX=Math.min(this.columns-1,Math.floor((x+radiusIndex+this.padding)/this.cell)),minY=Math.max(0,Math.floor((y-radiusIndex+this.padding)/this.cell)),maxY=Math.min(this.rows-1,Math.floor((y+radiusIndex+this.padding)/this.cell));
    let winner=null,best=(radius/currentView.scale)**2;const seen=new Set(),allowed=new Map();
    for(let cx=minX;cx<=maxX;cx++)for(let cy=minY;cy<=maxY;cy++)for(const id of this.cells[cx+cy*this.columns]||[]){
      if(seen.has(id))continue;seen.add(id);const{edge,index:i}=this.segments[id];if(!allowed.has(edge))allowed.set(edge,qualifies(edge));if(!allowed.get(edge))continue;
      const p=edge._world,d=segmentDistanceSquared(wx,wy,p[i-2],p[i-1],p[i],p[i+1]);if(d<best){best=d;winner=edge;}
    }
    return winner;
  }
}
