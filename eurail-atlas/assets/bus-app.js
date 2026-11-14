import{createBusLayer}from'./bus-layer.js?v=a613641732ab9825';
import{installSmoothWheelZoom}from'./wheel-zoom.js?v=a613641732ab9825';
import{bindBusDisplay,busExplorerProducts}from'./bus-delivery.js?v=a613641732ab9825';

const params=new URLSearchParams(location.search),initial={busDay:'all',...Object.fromEntries(params)},$=id=>document.getElementById(id);
const map=L.map('map',{zoomControl:false,zoomSnap:.25,minZoom:3,maxZoom:19,preferCanvas:true});
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,maxNativeZoom:19,updateWhenIdle:true,updateWhenZooming:false,keepBuffer:0,detectRetina:false,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
installSmoothWheelZoom(map);
const europe=[[35.1,-11.5],[64.5,35.5]],lat=Number(params.get('lat')),lon=Number(params.get('lon')),z=Number(params.get('z'));
if(params.has('lat')&&Number.isFinite(lat+lon+z)&&Math.abs(lat)<=85&&Math.abs(lon)<=180&&z>=3&&z<=19)map.setView([lat,lon],z);else map.fitBounds(europe,{padding:[30,30]});
// busNetwork=0 keeps the earlier packet loading path for comparison and tests. The duplicate list still
// applies there: a trip two sources publish is shown once on either path.
const legacyNetwork=params.get('busNetwork')==='0';
// The network tiles, country overview and local routing index of the delivered cohort, composed by the release.
// Without the file the packet view is used and the explorer runs without its country and city controls.
async function busDisplay(){try{const response=await fetch(new URL('./bus-display.json',import.meta.url),{cache:'no-cache',credentials:'omit',redirect:'error'});if(!response.ok)return null;const raw=await response.text();return raw.length>16*1024?null:JSON.parse(raw);}catch{return null;}}
let layer,ready=false,delivery=null,explorer=null;
function save(){if(!ready||!layer)return;const state=layer.state(),p=new URLSearchParams(state),c=map.getCenter();$('busClearHighlight').hidden=!(state.busRoute||state.busStop||state.busCity);p.delete('bus');if(legacyNetwork)p.set('busNetwork','0');p.set('lat',c.lat.toFixed(5));p.set('lon',c.lng.toFixed(5));p.set('z',String(map.getZoom()));history.replaceState(null,'',location.pathname+'?'+p);}
function summary({country,international,city}){$('busMapTitle').textContent=city?city.name:country||'Explore by bus';$('busMapSummary').textContent=[international?'International routes':'All bus routes',city?'City area':country?'Recorded calls in '+country:'Partial scheduled coverage','Pass inclusion unknown'].join(' · ');}
async function start(){
  $('controlsToggle').disabled=true;
  try{
    if(!delivery){const display=busDisplay(),response=await fetch(new URL('../bus-external/config.json',import.meta.url),{cache:'no-cache',credentials:'omit',redirect:'error'});if(!response.ok)throw new Error('Bus delivery configuration unavailable');const raw=await response.text();if(raw.length>64*1024)throw new Error('Bus delivery configuration exceeds budget');const configuration=JSON.parse(raw),bound=await display;delivery=bindBusDisplay(configuration,bound);explorer=busExplorerProducts(configuration,bound);if(legacyNetwork)delete delivery.busNetwork;}
    if(!layer)layer=createBusLayer({map,delivery,initial,...explorer,onGeography:summary,onChange:save});
    await layer.enable({open:true});ready=true;save();
  }catch{$('busPageStatus').hidden=false;$('busPageStatus').textContent='The bus map could not load. Use Bus filters to retry.';}
  $('controlsToggle').disabled=false;
}
$('controlsToggle').onclick=()=>layer?.enabled()?layer.open():start();
$('busClearHighlight').onclick=()=>layer?.clearFocus();
$('busResetView').onclick=()=>{layer?.resetGeography();map.fitBounds(europe,{padding:[30,30]});};
$('busShare').onclick=async()=>{save();try{await navigator.clipboard.writeText(location.href);$('busPageStatus').hidden=false;$('busPageStatus').textContent='View link copied.';}catch{$('busPageStatus').hidden=false;$('busPageStatus').textContent='Copy the current address to share this view.';}};
$('busFullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{document.body.classList.toggle('bus-fullscreen');map.invalidateSize();}};
map.on('moveend zoomend',save);map.on('click',event=>layer?.pick(event.containerPoint.x,event.containerPoint.y));
window.addEventListener('pagehide',event=>{if(!event.persisted)layer?.destroy();});
start();
