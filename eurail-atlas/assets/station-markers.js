import{validMapLocation,isItaly}from'./atlas-core.js?v=7dc9e8c1b12684fe';

export const STATION_ZOOM=9;
export function visibleStations(stations,bounds,state,zoom,selected=null){
  const rows=state.stations!==false&&zoom>=STATION_ZOOM?stations.filter(s=>(!state.sources||state.sources.has(s.source))&&validMapLocation(s.lon,s.lat)&&s.lon>=bounds[0]&&s.lat>=bounds[1]&&s.lon<=bounds[2]&&s.lat<=bounds[3]&&(state.mode!=='italy'||isItaly(s.country))):[];
  if(selected&&validMapLocation(selected.lon,selected.lat)&&!rows.some(s=>s.id===selected.id))rows.push(selected);
  return rows.sort((a,b)=>Number(a.id===selected?.id)-Number(b.id===selected?.id)||(a.weekly||0)-(b.weekly||0)||a.id.localeCompare(b.id));
}
export class StationMarkers{
  constructor(map,{getStations,getState,getSelected,isFocused,onPick}){
    this.map=map;this.getStations=getStations;this.getState=getState;this.getSelected=getSelected;this.isFocused=isFocused;this.onPick=onPick;this.key='';
    map.createPane('stationNodes').style.zIndex=490;
    this.renderer=L.canvas({pane:'stationNodes',tolerance:5,padding:.15});this.layer=L.layerGroup().addTo(map);
  }
  render(){
    const bounds=this.map.getBounds().pad(.05),selected=this.getSelected(),rows=this.isFocused()?[]:visibleStations(this.getStations(),[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()],this.getState(),this.map.getZoom(),selected);
    const key=(selected?.id||'')+'|'+rows.map(s=>s.id).join(',');if(key===this.key)return;this.key=key;this.layer.clearLayers();
    for(const station of rows){const active=station.id===selected?.id;
      L.circleMarker([station.lat,station.lon],{renderer:this.renderer,radius:active?6:2.8,weight:active?2:1,color:active?'#006f92':'#3d615d',fillColor:'#fbfaf6',fillOpacity:1,interactive:true,bubblingMouseEvents:false}).addTo(this.layer).on('click',()=>this.onPick(station));
    }
    this.map.getContainer().dataset.stationMarkers=String(rows.length);
  }
}
