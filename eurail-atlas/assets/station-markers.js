import{validMapLocation,isItaly,worldPoint}from'./atlas-core.js?v=3b98ad05f89f72bf';
import{stationMemberIds,stationSourceSelected}from'./station-identity.js?v=3b98ad05f89f72bf';
import{stationInScope}from'./project-scope.js?v=3b98ad05f89f72bf';
import{countryMatches}from'./explorer-core.js?v=3b98ad05f89f72bf';

export const STATION_ZOOM=9;
function viewportSize(viewport){return{width:Number(viewport?.width??viewport?.x)||0,height:Number(viewport?.height??viewport?.y)||0};}
export function stationZoomForViewport(viewport){
  const{width,height}=viewportSize(viewport),area=width*height;
  return width>=1100&&area>=1100000?7:width>=700&&area>=500000?8:STATION_ZOOM;
}
function earlyStationDensity(rows,viewport,zoom,focus){
  const{width,height}=viewportSize(viewport);
  if(zoom>=STATION_ZOOM||!width||!height)return rows;
  const limit=Math.max(300,Math.min(2500,Math.floor(width*height/800))),cells=new Set(),result=[];
  const focused=station=>focus!==null&&stationMemberIds(station).some(id=>focus.has(id));
  const candidates=[...rows].sort((a,b)=>Number(focused(b))-Number(focused(a))||(b.weekly||0)-(a.weekly||0)||a.id.localeCompare(b.id));
  for(const station of candidates){
    const[x,y]=worldPoint(station.lon,station.lat),cell=Math.floor(x*2**zoom/14)+','+Math.floor(y*2**zoom/14),active=focused(station);
    // Earlier wide-screen dots use a stable world grid. Focused actual calls
    // bypass decluttering, preserving the complete highlighted stop pattern.
    if(!active&&(result.length>=limit||cells.has(cell)))continue;
    cells.add(cell);result.push(station);
  }
  return result;
}
export function visibleStations(stations,bounds,state,zoom,selected=null,viewport=null,focus=null){
  const candidates=state.stations!==false&&zoom>=stationZoomForViewport(viewport)?stations.filter(s=>stationInScope(s,state)&&stationSourceSelected(s,state)&&validMapLocation(s.lon,s.lat)&&s.lon>=bounds[0]&&s.lat>=bounds[1]&&s.lon<=bounds[2]&&s.lat<=bounds[3]&&(state.mode!=='italy'||isItaly(s.country))&&(state.mode!=='countries'||countryMatches(s.country,state.country))):[];
  const rows=earlyStationDensity(candidates,viewport,zoom,focus);
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
    const container=map.getContainer(),eligible=event=>!map._animatingZoom&&!map._atlasWheelZooming&&!map.dragging?.moving?.()&&!event.target?.closest?.('.leaflet-control,.leaflet-popup,a,button,input,select,textarea');
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
  candidates(bounds){
    const stations=this.getStations();
    if(this.stationReference!==stations||this.stationCount!==stations.length){
      this.stationReference=stations;this.stationCount=stations.length;
      this.longitudeStations=stations.filter(s=>validMapLocation(s.lon,s.lat)).sort((a,b)=>a.lon-b.lon);
    }
    const rows=this.longitudeStations,west=bounds.getWest(),east=bounds.getEast(),south=bounds.getSouth(),north=bounds.getNorth();
    let low=0,high=rows.length;while(low<high){const mid=(low+high)>>>1;if(rows[mid].lon<west)low=mid+1;else high=mid;}
    const result=[];for(let i=low;i<rows.length&&rows[i].lon<=east;i++)if(rows[i].lat>=south&&rows[i].lat<=north)result.push(rows[i]);return result;
  }
  render(){
    const bounds=this.map.getBounds().pad(.05),selected=this.getSelected(),focus=this.getFocus(),rows=visibleStations(this.candidates(bounds),[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()],this.getState(),this.map.getZoom(),selected,this.map.getSize(),focus);
    const key=(selected?.id||'')+'|'+(focus?[...focus].sort().join(','):'all')+'|'+rows.map(s=>s.id).join(',');if(key===this.key)return;this.key=key;
    if(!this.nodes)this.nodes=new Map();
    const ids=new Set(rows.map(s=>s.id));for(const[id,node]of this.nodes)if(!ids.has(id)){this.layer.removeLayer(node.marker);this.nodes.delete(id);}
    if(this.haloStation!==selected?.id){if(this.selectedHalo)this.layer.removeLayer(this.selectedHalo);this.selectedHalo=null;this.haloStation=selected?.id;}
    this.selectedMarker=null;
    for(const station of rows){const active=station.id===selected?.id,dimmed=!active&&focus!==null&&!stationMemberIds(station).some(id=>focus.has(id));
      if(active&&!this.selectedHalo)this.selectedHalo=L.circleMarker([station.lat,station.lon],{renderer:this.renderer,radius:9,weight:5,color:'#fbfaf6',fill:false,interactive:false}).addTo(this.layer);
      const signature=active?'selected':dimmed?'dimmed':'ordinary',style={radius:active?6.5:2.8,weight:active?3:1,color:active?'#006f92':dimmed?'#a6b0a9':'#3d615d',opacity:dimmed?.6:1,fillColor:dimmed?'#d3d9d3':'#fbfaf6',fillOpacity:dimmed?.7:1};
      let node=this.nodes.get(station.id);
      if(!node){node={station,signature,marker:L.circleMarker([station.lat,station.lon],{renderer:this.renderer,...style,interactive:true,bubblingMouseEvents:false}).addTo(this.layer)};node.marker.on('click',()=>this.onPick(node.station));this.nodes.set(station.id,node);}
      else{if(node.station.lat!==station.lat||node.station.lon!==station.lon)node.marker.setLatLng([station.lat,station.lon]);if(node.signature!==signature)node.marker.setStyle(style);node.station=station;node.signature=signature;}
      node.marker.bringToFront();if(active)this.selectedMarker=node.marker;
    }
    this.bringSelectedToFront();
    this.map.getContainer().dataset.stationMarkers=String(rows.length);
  }
  bringSelectedToFront(){this.selectedHalo?.bringToFront();this.selectedMarker?.bringToFront();}
}
