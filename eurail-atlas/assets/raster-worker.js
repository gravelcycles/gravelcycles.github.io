// Native Canvas paint and rasterization may take hundreds of milliseconds on
// software graphics. Keeping those operations here leaves input/rAF responsive.
let canvas,context,paths=[],epoch=null;const styleGroups=new Map(),groupPaths=new Map();
function pathFor(world){const path=new Path2D();path.moveTo(world[0],world[1]);for(let i=2;i<world.length;i+=2)path.lineTo(world[i],world[i+1]);return path;}
function groupsFor(message){
  const key=message.styleKey+'|'+message.reviewOn;
  if(message.styleKey&&styleGroups.has(key)){const groups=styleGroups.get(key);styleGroups.delete(key);styleGroups.set(key,groups);return groups;}
  const pixels=message.pixels,groups=new Map();
  for(let i=0;i<paths.length;i++)for(let pass=0;pass<(message.reviewOn?2:1);pass++){
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
    const previous=groupPaths.get(group.style),indices=group.indices;
    if(previous&&previous.indices.length===indices.length&&indices.every((id,i)=>id===previous.indices[i]))group.path=previous.path;
    else{group.path=new Path2D();for(const id of indices)group.path.addPath(paths[id]);}
    groupPaths.delete(group.style);groupPaths.set(group.style,{path:group.path,indices});
    return group;
  }).sort((a,b)=>a.pass-b.pass||a.priority-b.priority);
  while(groupPaths.size>128)groupPaths.delete(groupPaths.keys().next().value);
  if(message.styleKey)styleGroups.set(key,result);while(styleGroups.size>2)styleGroups.delete(styleGroups.keys().next().value);
  return result;
}
function stroke(path,color,width,dash,scale){context.strokeStyle=color;context.lineWidth=width/scale;context.lineCap=dash?'butt':'round';context.setLineDash(dash?[1/scale,5/scale]:[]);context.stroke(path);}
globalThis.onmessage=event=>{
  const message=event.data;
  try{
    if(message.op==='geometry'){
      paths=[];for(let i=0;i<message.offsets.length-1;i++)paths.push(pathFor(message.coordinates.subarray(message.offsets[i],message.offsets[i+1])));
      epoch=message.epoch;styleGroups.clear();groupPaths.clear();return;
    }
    if(message.op!=='paint')return;
    if(message.epoch!==epoch)throw new Error('Raster geometry epoch mismatch');
    if(!(message.pixels instanceof Uint8Array)||message.pixels.length!==paths.length*16)throw new Error('Raster style inventory mismatch');
    const started=performance.now(),view=message.view,dpr=view.dpr||1,width=Math.round(view.width*dpr),height=Math.round(view.height*dpr);
    if(!(width>0&&height>0&&width<=8192&&height<=8192&&width*height<=6010000))throw new Error('Raster size exceeds bitmap budget');
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,width,height);
    const left=view.centerX*view.scale-view.width/2,top=view.centerY*view.scale-view.height/2;
    context.setTransform(dpr*view.scale,0,0,dpr*view.scale,-left*dpr,-top*dpr);context.lineCap='round';context.lineJoin='round';context.globalAlpha=1;
    for(const group of groupsFor(message))stroke(group.path,group.color,group.width,group.dash,view.scale);
    for(const highlight of message.highlights||[])stroke(pathFor(highlight.world),highlight.color,highlight.width,!!highlight.dash,view.scale);
    context.setTransform(1,0,0,1,0,0);
    // A read forces software rasterization before ownership crosses to the UI.
    // Materialize the complete software image here, so deferred native paint
    // cannot be moved back to the UI thread when its bitmap is presented.
    context.getImageData(0,0,width,height);
    const bitmap=canvas.transferToImageBitmap();
    globalThis.postMessage({op:'painted',id:message.id,epoch,paintMs:performance.now()-started,bitmap},[bitmap]);
  }catch(error){globalThis.postMessage({op:'error',message:error.message});}
};
try{
  canvas=new OffscreenCanvas(1,1);context=canvas.getContext('2d',{alpha:true,willReadFrequently:true});
  globalThis.postMessage({op:'ready',supported:!!context&&typeof canvas.transferToImageBitmap==='function'&&typeof Path2D==='function'});
}catch{globalThis.postMessage({op:'ready',supported:false});}
