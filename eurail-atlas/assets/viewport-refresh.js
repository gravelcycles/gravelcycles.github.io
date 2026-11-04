// Leaflet emits both zoomend and moveend for one settled zoom. Share one latest
// camera update across them; continent-scale data/context work belongs after
// the gesture, while the renderers handle the intermediate camera frames.
export function setupViewportRefresh(map,refresh,{requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id)}={}){
  let frame=null,previous='';
  function update(){
    frame=null;if(map._atlasWheelZooming)return;
    const center=map.getCenter(),size=map.getSize(),camera=[center.lat,center.lng,map.getZoom(),size.x,size.y].join(',');
    if(camera===previous)return;previous=camera;refresh();
  }
  function schedule(){if(frame===null)frame=requestFrame(update);}
  map.on('moveend zoomend resize',schedule);
  return{schedule,remove(){map.off('moveend zoomend resize',schedule);if(frame!==null)cancelFrame(frame);frame=null;}};
}
