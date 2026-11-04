// Leaflet 1.9 camera-only wheel frames. Expensive geometry/data work observes
// one settled moveend, while tiles and existing paths transform every frame.
export function wheelZoomDelta(event, height=800) {
  const pixels=Number(event.deltaY)*(event.deltaMode===1?20:event.deltaMode===2?height:1);
  return Math.max(-1.5,Math.min(1.5,-pixels/240));
}
export function installSmoothWheelZoom(map) {
  if(!map.scrollWheelZoom||!map._move||!map._moveStart||!map._moveEnd)return null;
  const nativeEnabled=map.scrollWheelZoom.enabled();map.scrollWheelZoom.disable();
  const container=map.getContainer();let frame=0,timer=0,target=map.getZoom(),anchor=null,point=null,last=0,disposed=false,starting=false;
  const limit=zoom=>Math.max(map.getMinZoom(),Math.min(map.getMaxZoom(),zoom));
  const centerAt=zoom=>{
    const offset=point.subtract(map.getSize().divideBy(2)),center=map.unproject(map.project(anchor,zoom).subtract(offset),zoom);
    return map._limitCenter?map._limitCenter(center,zoom,map.options.maxBounds):center;
  };
  const finish=()=>{
    clearTimeout(timer);timer=0;if(frame)cancelAnimationFrame(frame);frame=0;
    if(!map._atlasWheelZooming)return;
    const zoom=limit(target),center=centerAt(zoom);
    map._move(center,zoom,{pinch:true,round:false});map._atlasWheelZooming=false;
    // A non-pinch zoom lets the tile grid choose its final native level once.
    map.fire('zoom');map._moveEnd(true);map.fire('wheelzoomend');
  };
  const draw=now=>{
    frame=0;if(!map._atlasWheelZooming||disposed)return;
    const dt=Math.min(64,Math.max(1,now-last||16));last=now;
    const current=map.getZoom(),zoom=current+(target-current)*(1-Math.exp(-dt/45));
    map._move(centerAt(zoom),zoom,{pinch:true,round:false});
    if(Math.abs(target-zoom)>.001)frame=requestAnimationFrame(draw);
  };
  const wheel=event=>{
    if(event.target?.closest?.('button,input,select,textarea,a,.leaflet-control')||!nativeEnabled)return;
    const delta=wheelZoomDelta(event,container.clientHeight);if(!delta)return;
    event.preventDefault();event.stopPropagation();
    if(map._animatingZoom)return;
    const next=limit((map._atlasWheelZooming?target:map.getZoom())+delta);
    if(!map._atlasWheelZooming&&next===map.getZoom())return;
    // Re-anchor at the current cursor without moving the existing camera.
    point=map.mouseEventToContainerPoint(event);anchor=map.containerPointToLatLng(point);target=next;
    if(!map._atlasWheelZooming){map._stop();map._atlasWheelZooming=true;map.fire('wheelzoomstart');starting=true;try{map._moveStart(true);}finally{starting=false;}last=performance.now();}
    clearTimeout(timer);timer=setTimeout(finish,140);if(!frame)frame=requestAnimationFrame(draw);
  };
  const interrupt=()=>finish(),externalMove=()=>{if(!starting)finish();},inputTarget=container.ownerDocument||container;
  map.on('movestart',externalMove);
  container.addEventListener('wheel',wheel,{passive:false});
  for(const type of ['pointerdown','keydown'])inputTarget.addEventListener(type,interrupt,true);
  const unload=()=>dispose(false);
  const dispose=(restoreNative=true)=>{
    if(disposed)return;
    if(restoreNative)finish();else{clearTimeout(timer);if(frame)cancelAnimationFrame(frame);timer=0;frame=0;map._atlasWheelZooming=false;}
    disposed=true;container.removeEventListener('wheel',wheel);
    for(const type of ['pointerdown','keydown'])inputTarget.removeEventListener(type,interrupt,true);
    map.off?.('movestart',externalMove);map.off?.('unload',unload);
    if(restoreNative&&nativeEnabled)map.scrollWheelZoom.enable();
  };
  map.on('unload',unload);return{finish,dispose};
}
