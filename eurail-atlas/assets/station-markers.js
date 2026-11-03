import{validMapLocation,isItaly}from'./atlas-core.js?v=5908c601d2f8d54f';
import{stationMemberIds,stationSourceSelected}from'./station-identity.js?v=5908c601d2f8d54f';
import{stationInScope}from'./project-scope.js?v=5908c601d2f8d54f';
import{countryMatches}from'./explorer-core.js?v=5908c601d2f8d54f';

export const STATION_ZOOM=9;
export function visibleStations(stations,bounds,state,zoom,selected=null){
  const rows=state.stations!==false&&zoom>=STATION_ZOOM?stations.filter(s=>stationInScope(s,state)&&stationSourceSelected(s,state)&&validMapLocation(s.lon,s.lat)&&s.lon>=bounds[0]&&s.lat>=bounds[1]&&s.lon<=bounds[2]&&s.lat<=bounds[3]&&(state.mode!=='italy'||isItaly(s.country))&&(state.mode!=='countries'||countryMatches(s.country,state.country))):[];
  if(stationInScope(selected,state)&&validMapLocation(selected.lon,selected.lat)&&!rows.some(s=>s.id===selected.id))rows.push(selected);
  return rows.sort((a,b)=>Number(a.id===selected?.id)-Number(b.id===selected?.id)||(a.weekly||0)-(b.weekly||0)||a.id.localeCompare(b.id));
}
export class StationMarkers{
  constructor(map,{getStations,getState,getSelected,getFocus=()=>null,onPick}){
    this.map=map;this.getStations=getStations;this.getState=getState;this.getSelected=getSelected;this.getFocus=getFocus;this.onPick=onPick;this.key='';
    // Rail canvases are siblings of Leaflet's transformed map pane. Put the
    // stops above those canvases and mirror the map pane's pan translation;
    // a higher z-index inside the original pane cannot escape its stacking
    // context. Leaflet still handles path layout and zoom transforms.
    const pane=map.createPane('stationNodes',map.getContainer());pane.style.zIndex=490;pane.style.pointerEvents='none';
    const sync=()=>{pane.style.transform=map.getPane('mapPane').style.transform;};map.on('move zoomanim zoomend resize',sync);sync();
    this.renderer=L.canvas({pane:'stationNodes',tolerance:5,padding:.15});this.layer=L.layerGroup().addTo(map);
    // A transparent Canvas still intercepts DOM events across its entire
    // rectangle. Keep it out of DOM hit testing and forward only actual stop
    // hits into Leaflet's existing Canvas event dispatcher. This also covers
    // connection endpoints and train stops added to this renderer elsewhere.
    const container=map.getContainer(),eligible=event=>!map._animatingZoom&&!map.dragging?.moving?.()&&!event.target?.closest?.('.leaflet-control,.leaflet-popup,a,button,input,select,textarea');
    let lastTouch=null,pointerPinch=false,touchPinch=false;const touchPointers=new Set();
    const rememberTouch=(point,target)=>{lastTouch={clientX:point.clientX,clientY:point.clientY,target,at:performance.now()};};
    const pointer=event=>{
      if(event.type==='pointerdown'){
        lastTouch=null;if(event.pointerType!=='touch')return;
        touchPointers.add(event.pointerId);if(touchPointers.size>1)pointerPinch=true;
      }else if(event.pointerType==='touch'){
        if(event.type==='pointerup'&&touchPointers.size===1&&!pointerPinch)rememberTouch(event,event.target);else lastTouch=null;
        touchPointers.delete(event.pointerId);if(!touchPointers.size)pointerPinch=false;
      }
    };
    const touch=event=>{
      if(event.type==='touchstart'){lastTouch=null;if(event.touches.length>1)touchPinch=true;}
      else if(event.type==='touchend'){
        if(!event.touches.length&&!touchPinch&&event.changedTouches.length===1)rememberTouch(event.changedTouches[0],event.target);else lastTouch=null;
        if(!event.touches.length)touchPinch=false;
      }else{lastTouch=null;touchPinch=false;}
    };
    const hit=event=>{
      if(!eligible(event))return null;
      // Mobile browsers may shift a synthesized click toward a nearby SVG
      // stroke. Use the original tap for station priority, so that adjustment
      // cannot move an otherwise clear line tap inside a station dot.
      const rawTouch=event.type==='click'&&lastTouch&&performance.now()-lastTouch.at<1000&&(event.pointerType==='touch'||event.sourceCapabilities?.firesTouchEvents||!('pointerType'in event)&&!event.sourceCapabilities)?lastTouch:null;
      const point=map.mouseEventToLayerPoint(rawTouch||event),path=(rawTouch?.target||event.target)?.closest?.('path.leaflet-interactive');let found=null;
      for(let order=this.renderer._drawFirst;order;order=order.next){
        const layer=order.layer;if(!layer.options.interactive||!layer._containsPoint(point)||event.type==='click'&&map._draggableMoved(layer))continue;
        // A visible context stroke under an unpainted station tolerance halo
        // keeps its own click. Painted station pixels still take precedence.
        // Background taps retain Leaflet's larger station hit target.
        if(path&&Number.isFinite(layer._radius)&&layer._point){const radius=layer._radius+(layer.options.stroke===false?0:(Number(layer.options.weight)||0)/2);if(Math.hypot(point.x-layer._point.x,point.y-layer._point.y)>radius)continue;}
        found=layer;
      }
      return found;
    };
    const click=event=>{const layer=hit(event);lastTouch=null;if(!layer)return;event.stopImmediatePropagation();this.renderer._fireEvent([layer],event);};
    const move=event=>{
      if(hit(event)){event.stopImmediatePropagation();this.renderer._onMouseMove(event);container.style.cursor='pointer';this.stationHover=true;}
      else if(this.stationHover){this.renderer._handleMouseOut(event);container.style.cursor='';this.stationHover=false;}
    };
    const leave=event=>{if(this.stationHover){this.renderer._handleMouseOut(event);container.style.cursor='';this.stationHover=false;}};
    for(const type of['click','dblclick','contextmenu'])container.addEventListener(type,click,true);
    for(const type of['pointerdown','pointerup','pointercancel'])container.addEventListener(type,pointer,true);
    for(const type of['touchstart','touchend','touchcancel'])container.addEventListener(type,touch,true);
    container.addEventListener('mousemove',move,true);container.addEventListener('mouseleave',leave,true);
    map.on('unload',()=>{for(const type of['click','dblclick','contextmenu'])container.removeEventListener(type,click,true);for(const type of['pointerdown','pointerup','pointercancel'])container.removeEventListener(type,pointer,true);for(const type of['touchstart','touchend','touchcancel'])container.removeEventListener(type,touch,true);container.removeEventListener('mousemove',move,true);container.removeEventListener('mouseleave',leave,true);});
  }
  render(){
    const bounds=this.map.getBounds().pad(.05),selected=this.getSelected(),focus=this.getFocus(),rows=visibleStations(this.getStations(),[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()],this.getState(),this.map.getZoom(),selected);
    const key=(selected?.id||'')+'|'+(focus?[...focus].sort().join(','):'all')+'|'+rows.map(s=>s.id).join(',');if(key===this.key)return;this.key=key;this.layer.clearLayers();this.selectedHalo=null;this.selectedMarker=null;
    for(const station of rows){const active=station.id===selected?.id,dimmed=!active&&focus!==null&&!stationMemberIds(station).some(id=>focus.has(id));
      if(active)this.selectedHalo=L.circleMarker([station.lat,station.lon],{renderer:this.renderer,radius:9,weight:5,color:'#fbfaf6',fill:false,interactive:false}).addTo(this.layer);
      const marker=L.circleMarker([station.lat,station.lon],{renderer:this.renderer,radius:active?6.5:2.8,weight:active?3:1,color:active?'#006f92':dimmed?'#a6b0a9':'#3d615d',opacity:dimmed?.6:1,fillColor:dimmed?'#d3d9d3':'#fbfaf6',fillOpacity:dimmed?.7:1,interactive:true,bubblingMouseEvents:false}).addTo(this.layer).on('click',()=>this.onPick(station));
      if(active)this.selectedMarker=marker;
    }
    this.map.getContainer().dataset.stationMarkers=String(rows.length);
  }
  bringSelectedToFront(){this.selectedHalo?.bringToFront();this.selectedMarker?.bringToFront();}
}
