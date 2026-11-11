// Native Canvas paint and rasterization may take hundreds of milliseconds on
// software graphics. Keeping those operations here leaves input/rAF responsive.
import{quantizedRailPrimitives}from'./rail-primitives.js?v=5365ea7a3816698f';
import{RasterBitmapCache,thresholdRasterPixels}from'./raster-bitmap-cache.js?v=5365ea7a3816698f';
let canvas,context,paths=[],epoch=null,geometry=null,routeCount=0,basePixels=null,baseFrequencies=null,baseKey=null,baselineGroups=null,scratch,scratchContext;
const styleGroups=new Map(),groupPaths=new Map(),bitmapCache=new RasterBitmapCache();
function pathFor(world){const path=new Path2D();path.moveTo(world[0],world[1]);for(let i=2;i<world.length;i+=2)path.lineTo(world[i],world[i+1]);return path;}
function groupsFor(message){
  const key=message.styleKey+'|'+message.reviewOn+'|'+(geometry?.compact?message.view.scale:'');
  if(message.styleKey&&styleGroups.has(key)){const groups=styleGroups.get(key);styleGroups.delete(key);styleGroups.set(key,groups);return groups;}
  const pixels=message.pixels,groups=new Map();
  const compact=geometry?.compact&&Number.isFinite(message.view.zoom)&&message.view.zoom<=8,bucket=Math.ceil(message.view.zoom||0);
  for(let i=0;i<routeCount;i++)for(let pass=0;pass<(message.reviewOn?2:1);pass++){
    const offset=i*16+pass*8;if(!pixels[offset+4])continue;
    const color=`rgb(${pixels[offset]},${pixels[offset+1]},${pixels[offset+2]})`,width=Math.round(pixels[offset+3]/255*16*4)/4,dash=!!pixels[offset+5];
    const style=pass+':'+color+':'+width+':'+dash;let group=groups.get(style);
    if(!group){group={style,indices:[],color,width,dash,pass,priority:pixels[offset+7]};groups.set(style,group);}
    group.indices.push(i);
  }
  const result=[...groups.values()].map(group=>{
    // A slider boundary changes only a few frequency/style groups. Reuse every
    // other native path after proving identical route membership, including
    // source/day/pass filters. No hash or approximate threshold is involved.
    const cacheKey=group.style+':compact:'+compact+':zoom:'+bucket+(compact?':scale:'+message.view.scale:''),previous=groupPaths.get(cacheKey),indices=group.indices;
    if(previous&&previous.indices.length===indices.length&&indices.every((id,i)=>id===previous.indices[i])){group.path=previous.path;group.dots=previous.dots;}
    else{
      group.path=new Path2D();
      if(compact&&!group.dash){
        const primitives=quantizedRailPrimitives(geometry.coordinates,geometry.offsets,indices,message.view.zoom);
        for(let i=0;i<primitives.lines.length;i+=4){group.path.moveTo(primitives.lines[i],primitives.lines[i+1]);group.path.lineTo(primitives.lines[i+2],primitives.lines[i+3]);}
        group.dots=new Path2D();const radius=group.width/2/message.view.scale;
        for(let i=0;i<primitives.points.length;i+=2){const x=primitives.points[i],y=primitives.points[i+1];group.dots.moveTo(x+radius,y);group.dots.arc(x,y,radius,0,Math.PI*2);}
      }else for(const id of indices){if(!paths[id])paths[id]=pathFor(geometry.coordinates.subarray(geometry.offsets[id],geometry.offsets[id+1]));group.path.addPath(paths[id]);}
    }
    groupPaths.delete(cacheKey);groupPaths.set(cacheKey,{path:group.path,dots:group.dots,indices});
    return group;
  }).sort((a,b)=>a.pass-b.pass||a.priority-b.priority);
  while(groupPaths.size>128)groupPaths.delete(groupPaths.keys().next().value);
  if(message.styleKey)styleGroups.set(key,result);while(styleGroups.size>2)styleGroups.delete(styleGroups.keys().next().value);
  return result;
}
function stroke(path,color,width,dash,scale){context.strokeStyle=color;context.lineWidth=width/scale;context.lineCap=dash?'butt':'round';context.setLineDash(dash?[1/scale,5/scale]:[]);context.stroke(path);}
function drawGroup(group,view,target=context){
  target.strokeStyle=group.color;target.lineWidth=group.width/view.scale;target.lineCap=group.dash?'butt':'round';target.lineJoin='round';target.setLineDash(group.dash?[1/view.scale,5/view.scale]:[]);target.stroke(group.path);
  if(group.dots){target.fillStyle=group.color;target.fill(group.dots);}
}
function groupBitmap(group,view){
  const dpr=view.dpr||1,left=view.centerX*view.scale-view.width/2,top=view.centerY*view.scale-view.height/2,pad=group.width*dpr/2+3;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const id of group.indices)for(let i=geometry.offsets[id];i<geometry.offsets[id+1];i+=2){const x=(geometry.coordinates[i]*view.scale-left)*dpr,y=(geometry.coordinates[i+1]*view.scale-top)*dpr;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  const x=Math.max(0,Math.floor(minX-pad)),y=Math.max(0,Math.floor(minY-pad)),right=Math.min(Math.round(view.width*dpr),Math.ceil(maxX+pad)),bottom=Math.min(Math.round(view.height*dpr),Math.ceil(maxY+pad)),width=right-x,height=bottom-y;
  if(width<=0||height<=0)return null;
  if(!scratch){scratch=new OffscreenCanvas(1,1);scratchContext=scratch.getContext('2d',{alpha:true,willReadFrequently:true});}
  scratch.width=width;scratch.height=height;scratchContext.setTransform(dpr*view.scale,0,0,dpr*view.scale,-left*dpr-x,-top*dpr-y);drawGroup(group,view,scratchContext);
  scratchContext.getImageData(0,0,width,height);
  return{bitmap:scratch.transferToImageBitmap(),x,y,width,height};
}
globalThis.onmessage=event=>{
  let message=event.data;
  try{
    if(message.op==='geometry'){
      geometry={coordinates:message.coordinates,offsets:message.offsets,compact:message.compactPrimitives===true};routeCount=message.offsets.length-1;
      paths=Array(routeCount);if(!geometry.compact)for(let i=0;i<routeCount;i++)paths[i]=pathFor(message.coordinates.subarray(message.offsets[i],message.offsets[i+1]));
      epoch=message.epoch;basePixels=null;baseFrequencies=null;baseKey=null;baselineGroups=null;bitmapCache.clear();styleGroups.clear();groupPaths.clear();return;
    }
    if(message.op!=='paint')return;
    if(message.epoch!==epoch)throw new Error('Raster geometry epoch mismatch');
    if(message.basePixels){
      if(!(message.basePixels instanceof Uint8Array)||message.basePixels.length!==routeCount*16||!message.baseKey)throw new Error('Raster baseline style inventory mismatch');
      basePixels=message.basePixels;baseKey=message.baseKey;baselineGroups=null;baseFrequencies=message.baseFrequencies??null;
      if(baseFrequencies!==null&&(!(baseFrequencies instanceof Float64Array)||baseFrequencies.length!==routeCount*2||baseFrequencies.some(value=>!Number.isFinite(value)||value<0)))throw new Error('Raster baseline frequency inventory mismatch');
    }
    if(message.localThreshold){
      if(!geometry.compact||!basePixels||!baseFrequencies||baseKey!==message.baseKey||!Number.isFinite(message.minimum)||message.minimum<0)throw new Error('Raster local threshold baseline mismatch');
      message={...message,pixels:thresholdRasterPixels(basePixels,baseFrequencies,message.minimum)};
    }
    if(!(message.pixels instanceof Uint8Array)||message.pixels.length!==routeCount*16)throw new Error('Raster style inventory mismatch');
    const started=performance.now(),view=message.view,dpr=view.dpr||1,width=Math.round(view.width*dpr),height=Math.round(view.height*dpr);let bitmapHits=0,bitmapMisses=0,baselineRasters=0;
    if(!(width>0&&height>0&&width<=8192&&height<=8192&&width*height<=6010000))throw new Error('Raster size exceeds bitmap budget');
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,width,height);
    const left=view.centerX*view.scale-view.width/2,top=view.centerY*view.scale-view.height/2;
    context.setTransform(dpr*view.scale,0,0,dpr*view.scale,-left*dpr,-top*dpr);context.lineCap='round';context.lineJoin='round';context.globalAlpha=1;
    const cached=geometry.compact&&routeCount>5000&&Number.isFinite(view.zoom)&&view.zoom<=8&&basePixels&&baseKey===message.baseKey;
    if(cached){
      const camera=JSON.stringify([epoch,baseKey,view.width,view.height,view.scale,view.centerX,view.centerY,dpr,message.reviewOn]);
      const changed=bitmapCache.key!==camera;bitmapCache.reset(camera);
      if(changed)baselineGroups=null;
      if(!baselineGroups)baselineGroups=groupsFor({...message,pixels:basePixels,styleKey:'baseline:'+baseKey});
      if(changed)for(const group of baselineGroups){const image=groupBitmap(group,view);baselineRasters++;if(image&&!bitmapCache.put(group.style,group.indices,image,image.width*image.height*4,{baseline:true}))image.bitmap.close();}
      context.setTransform(1,0,0,1,0,0);
      for(const group of groupsFor(message)){
        let image=bitmapCache.get(group.style,group.indices),owned=false;
        if(image)bitmapHits++;else{bitmapMisses++;image=groupBitmap(group,view);if(image)owned=!bitmapCache.put(group.style,group.indices,image,image.width*image.height*4);}
        if(image){context.drawImage(image.bitmap,image.x,image.y);if(owned)image.bitmap.close();}
      }
      context.setTransform(dpr*view.scale,0,0,dpr*view.scale,-left*dpr,-top*dpr);
    }else for(const group of groupsFor(message))drawGroup(group,view);
    for(const highlight of message.highlights||[])stroke(pathFor(highlight.world),highlight.color,highlight.width,!!highlight.dash,view.scale);
    context.setTransform(1,0,0,1,0,0);
    // A read forces software rasterization before ownership crosses to the UI.
    // Materialize the complete software image here, so deferred native paint
    // cannot be moved back to the UI thread when its bitmap is presented.
    context.getImageData(0,0,width,height);
    const bitmap=canvas.transferToImageBitmap();
    globalThis.postMessage({op:'painted',id:message.id,epoch,paintMs:performance.now()-started,bitmap,profile:{bitmapHits,bitmapMisses,baselineRasters,bitmapCacheBytes:bitmapCache.bytes,compactPrimitives:!!geometry.compact&&Number.isFinite(view.zoom)&&view.zoom<=8}},[bitmap]);
  }catch(error){globalThis.postMessage({op:'error',message:error.message});}
};
try{
  canvas=new OffscreenCanvas(1,1);context=canvas.getContext('2d',{alpha:true,willReadFrequently:true});
  globalThis.postMessage({op:'ready',supported:!!context&&typeof canvas.transferToImageBitmap==='function'&&typeof Path2D==='function'});
}catch{globalThis.postMessage({op:'ready',supported:false});}
