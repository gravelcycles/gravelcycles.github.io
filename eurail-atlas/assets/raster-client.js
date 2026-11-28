// Software rasterization stays off the input/animation thread. The main thread
// presents a completed bitmap; it retains the original geometry for picking.
export class RasterClient{
  constructor(canvas,{onFrame=()=>{},onBitmap=null,onError=()=>{},canPresent=()=>true,allowIntermediate=()=>false,workerFactory}={}){
    this.canvas=canvas;this.onFrame=onFrame;this.onBitmap=onBitmap;this.onError=onError;this.canPresent=canPresent;this.allowIntermediate=allowIntermediate;this.pending=null;this.active=null;this.sequence=0;this.ready=false;this.destroyed=false;this.sentEpoch=null;this.staticSent=new Map();
    const create=workerFactory||(()=>{const url=new URL('./raster-worker.js?v=14a270392708fc8e',import.meta.url);url.search=new URL(import.meta.url).search;return new Worker(url,{type:'module',name:'rail-atlas-raster'});});
    this.worker=create();
    try{this.context=canvas.getContext('bitmaprenderer');}catch{}
    if(!this.context){this.context=canvas.getContext('2d');this.drawImage=true;}
    if(!this.context){this.worker.terminate();throw new Error('No bitmap presentation context');}
    this.worker.onmessage=event=>this.receive(event.data);
    this.worker.onerror=event=>{event.preventDefault?.();this.fail(new Error('Raster worker unavailable'));};
    this.readyTimer=setTimeout(()=>this.fail(new Error('Raster worker initialization timed out')),5000);
  }
  geometry(epoch,worlds,{compactPrimitives=false}={}){if(this.destroyed)return;this.scene={epoch,worlds,compactPrimitives};}
  paint(view,pixels,{styleKey='',baseKey='',basePixels=null,baseFrequencies=null,localThreshold=false,minimum=0,reviewOn=false,highlights=[],metadata=null,staticLayer=null,edges=true}={}){
    if(this.destroyed||!this.scene)return null;
    if(!(view.width>0&&view.height>0&&Number.isFinite(view.width)&&Number.isFinite(view.height)))return null;
    const id=++this.sequence,dpr=Math.min(view.dpr||1,Math.sqrt(6000000/(view.width*view.height)),8192/view.width,8192/view.height);
    this.pending={id,view:{...view,dpr},pixels,styleKey,baseKey,basePixels,baseFrequencies,localThreshold,minimum,reviewOn,highlights,metadata,staticLayer,edges,scene:this.scene,requestedAt:performance.now()};
    this.pump();return id;
  }
  pump(){
    if(this.destroyed||!this.ready||this.active||!this.pending)return;
    const job=this.pending;this.pending=null;this.active=job;
    try{
      // A static-only paint (edges:false) needs no edge geometry, styles or baseline: none is sent for it.
      const staticOnly=job.edges===false;
      if(!staticOnly&&this.sentEpoch!==job.scene.epoch){
        const uploadStarted=performance.now();
        const offsets=new Uint32Array(job.scene.worlds.length+1);let count=0;
        for(let i=0;i<job.scene.worlds.length;i++){offsets[i]=count;count+=job.scene.worlds[i].length;}
        offsets[offsets.length-1]=count;if(count>16000000)throw new Error('Raster geometry exceeds buffer budget');
        const coordinates=new Float64Array(count);
        for(let i=0;i<job.scene.worlds.length;i++)coordinates.set(job.scene.worlds[i],offsets[i]);
        // Thousands of separately transferred buffers create a long main-thread
        // serialization task. Two packed buffers retain every original vertex.
        this.worker.postMessage({op:'geometry',epoch:job.scene.epoch,coordinates,offsets,...(job.scene.compactPrimitives?{compactPrimitives:true}:{})},[coordinates.buffer,offsets.buffer]);
        this.lastGeometryUploadMs=performance.now()-uploadStarted;this.sentEpoch=job.scene.epoch;this.sentBaseKey=null;
      }
      // The static layer's groups go once per key; the worker keeps the two most recent, as this map mirrors.
      const staticKey=job.staticLayer?.key??null;
      if(staticKey!==null&&!this.staticSent.has(staticKey)){
        this.worker.postMessage({op:'overviewData',key:staticKey,groups:job.staticLayer.groups.map(g=>({color:g.color,width:g.width,lines:g.lines,dots:g.dots}))});
        this.staticSent.set(staticKey,true);while(this.staticSent.size>2)this.staticSent.delete(this.staticSent.keys().next().value);
      }
      const pixels=job.localThreshold||staticOnly?null:job.pixels.slice(),highlights=job.highlights.map(h=>({...h,world:new Float64Array(h.world)}));
      const baseline=!staticOnly&&job.scene.compactPrimitives&&job.basePixels&&this.sentBaseKey!==job.baseKey?job.basePixels.slice():null;
      const frequencies=baseline&&job.baseFrequencies?job.baseFrequencies.slice():null;
      this.worker.postMessage({op:'paint',id:job.id,epoch:job.scene.epoch,view:job.view,...(pixels?{pixels}:{}),styleKey:job.styleKey,baseKey:job.baseKey,...(baseline?{basePixels:baseline}:{}),...(frequencies?{baseFrequencies:frequencies}:{}),...(job.localThreshold&&!staticOnly?{localThreshold:true,minimum:job.minimum}:{}),reviewOn:job.reviewOn,highlights,...(staticKey!==null?{staticKey}:{}),...(job.edges===false?{edges:false}:{})},[...(pixels?[pixels.buffer]:[]),...(baseline?[baseline.buffer]:[]),...(frequencies?[frequencies.buffer]:[]),...highlights.map(h=>h.world.buffer)]);
      if(baseline)this.sentBaseKey=job.baseKey;
    }catch(error){this.fail(error);}
  }
  receive(message){
    if(message?.op==='ready'){
      clearTimeout(this.readyTimer);if(this.destroyed)return;
      if(!message.supported){this.fail(new Error('OffscreenCanvas 2D unavailable'));return;}
      this.ready=true;this.pump();return;
    }
    if(message?.op==='error'){this.fail(new Error(message.message||'Raster worker failed'));return;}
    if(message?.op!=='painted')return;
    if(this.destroyed){message.bitmap?.close();return;}
    const job=this.active;
    if(!job||message.id!==job.id){message.bitmap?.close();return;}
    this.active=null;
    if((job.id===this.sequence||this.allowIntermediate(job))&&(job.edges===false||message.epoch===this.scene?.epoch)&&this.canPresent(job)){
      try{
        const dpr=job.view.dpr||1,width=Math.round(job.view.width*dpr),height=Math.round(job.view.height*dpr);
        if(this.canvas.width!==width)this.canvas.width=width;if(this.canvas.height!==height)this.canvas.height=height;
        this.canvas.style.width=job.view.width+'px';this.canvas.style.height=job.view.height+'px';
        // A copy for the caller (map-renderer.js keeps frames holding the static layer) before the bitmap is consumed.
        this.onBitmap?.(message.bitmap,job);
        if(this.drawImage){this.context.clearRect(0,0,width,height);this.context.drawImage(message.bitmap,0,0);message.bitmap.close();}
        else this.context.transferFromImageBitmap(message.bitmap);
        this.onFrame({id:job.id,view:job.view,metadata:job.metadata,geometryEpoch:job.scene.epoch,geometryUploadMainMs:this.lastGeometryUploadMs||0,workerPaintMs:message.paintMs,latencyMs:performance.now()-job.requestedAt,profile:message.profile});
      }catch(error){message.bitmap?.close();this.fail(error);return;}
    }else message.bitmap?.close();
    this.pump();
  }
  fail(error){if(this.destroyed)return;this.destroy();this.onError(error);}
  destroy(){
    if(this.destroyed)return;this.destroyed=true;clearTimeout(this.readyTimer);this.pending=null;this.active=null;this.scene=null;this.worker?.terminate();
  }
}
