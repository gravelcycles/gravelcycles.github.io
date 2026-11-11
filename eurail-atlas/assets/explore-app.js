import{loadExplore,makeStationSearch}from'./explore-data.js?v=1b22fdb3ed27b6b9';
import{css,fmt,esc}from'./explore-ui.js?v=1b22fdb3ed27b6b9';

const $=id=>document.getElementById(id);
const VIEWS=['motion','reach','speed','more'];
const TITLES={motion:'Europe in motion',reach:'Reach',speed:'Speed'};
// The atlas serves explore-data/ beside assets/; a host page may point elsewhere.
const DATA_URL=window.EXPLORE_DATA_URL?new URL(window.EXPLORE_DATA_URL,location.href).href:new URL('../explore-data/',import.meta.url).href;

function waitForLeaflet(){return new Promise(resolve=>{if(window.L)return resolve(window.L);const timer=setInterval(()=>{if(window.L){clearInterval(timer);resolve(window.L);}},20);});}

function makeMap(L){
  const map=L.map('map',{zoomControl:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,minZoom:3,maxZoom:13,worldCopyJump:false,attributionControl:true,zoomSnap:0.25,wheelPxPerZoomLevel:90}).setView([50.5,10],4.5);
  L.control.zoom({position:'topright'}).addTo(map);
  map.attributionControl.setPrefix(false).addAttribution('Timetables: individual source licences, see the <a href="../">atlas</a> · Borders: Natural Earth');
  let outlines=null;
  const style=()=>({color:css('--coast'),weight:0.8,fillColor:css('--land'),fillOpacity:1,interactive:false});
  fetch(new URL('countries.geojson',import.meta.url)).then(r=>r.json()).then(geo=>{outlines=L.geoJSON(geo,{style,interactive:false}).addTo(map);outlines.bringToBack();}).catch(()=>{});
  return{map,restyle(){outlines?.setStyle(style());}};
}

// Canvas overlay in container pixels, redrawn on demand.
function makeLayer(map){
  const canvas=$('layer'),ctx=canvas.getContext('2d');let dpr=1,w=0,h=0;
  function resize(){const size=map.getSize();dpr=Math.min(2,window.devicePixelRatio||1);w=size.x;h=size.y;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';}
  resize();
  return{canvas,ctx,resize,
    begin(){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);return ctx;},
    get width(){return w;},get height(){return h;},
    transform(){const z=map.getZoom(),o=map.project(map.containerPointToLatLng([0,0]),z);return{z,scale:2**z,ox:o.x,oy:o.y};}};
}

async function main(){
  const L=await waitForLeaflet(),{map,restyle}=makeMap(L),layer=makeLayer(map),tooltip=$('tooltip');
  const ctx={map,L,layer,css,fmt,esc,
    tooltip(html,x,y){tooltip.innerHTML=html;tooltip.hidden=false;const box=$('mapView').getBoundingClientRect(),tw=tooltip.offsetWidth,th=tooltip.offsetHeight;tooltip.style.left=Math.max(6,Math.min(box.width-tw-6,x+14))+'px';tooltip.style.top=Math.max(6,y-th-12<6?y+16:y-th-12)+'px';},
    hideTooltip(){tooltip.hidden=true;},
    requestDraw:()=>{dirty=true;}};
  let dirty=true,current=null,views={},data=null;

  $('panelToggle').addEventListener('click',()=>{const panel=$('panel'),open=panel.classList.toggle('collapsed');$('panelToggle').setAttribute('aria-expanded',String(!open));$('panelToggle').textContent=open?'+':'–';$('panelToggle').setAttribute('aria-label',open?'Show controls':'Hide controls');});
  map.on('move zoom',()=>{ctx.hideTooltip();dirty=true;});
  map.on('resize',()=>{layer.resize();dirty=true;});
  map.on('mousemove',e=>current?.onMove?.(e.containerPoint));
  map.on('mouseout',()=>ctx.hideTooltip());
  map.on('click',e=>current?.onClick?.(e.containerPoint));
  const themeChanged=()=>{restyle();Object.values(views).forEach(v=>v.onTheme?.());dirty=true;};
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',themeChanged);
  new MutationObserver(themeChanged).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

  function frame(time){
    if(current&&data&&(dirty||current.animating?.())){dirty=false;current.draw(time);}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  try{
    data=await loadExplore(DATA_URL,(done,total)=>{if(total){$('loadingBar').style.width=Math.round(done/total*100)+'%';$('loadingDetail').textContent=`${(done/1e6).toFixed(1)} of ${(total/1e6).toFixed(1)} MB`;}});
  }catch(error){$('loading').hidden=true;$('error').hidden=false;$('errorDetail').textContent=error.message.includes('HTTP')?'The Explore data is not published at this address yet.':'Check your connection and reload the page.';console.error('Explore data failed:',error);return;}
  $('loading').hidden=true;
  ctx.data=data;ctx.search=makeStationSearch(data);

  async function view(name){
    if(views[name])return views[name];
    const module=await import(name==='motion'?'./explore-motion.js?v=1b22fdb3ed27b6b9':name==='reach'?'./explore-reach.js?v=1b22fdb3ed27b6b9':name==='speed'?'./explore-speed.js?v=1b22fdb3ed27b6b9':'./explore-more.js?v=1b22fdb3ed27b6b9');
    return views[name]=module.create(ctx);
  }
  async function route(){
    const name=VIEWS.includes(location.hash.slice(1))?location.hash.slice(1):'motion';
    document.querySelectorAll('.x-tab').forEach(a=>{if(a.dataset.view===name)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    current?.deactivate?.();ctx.hideTooltip();
    const isMap=name!=='more';$('mapView').hidden=!isMap;$('moreView').hidden=isMap;
    if(isMap){$('panelTitle').textContent=TITLES[name];document.querySelectorAll('.x-view-panel').forEach(p=>p.hidden=p.dataset.for!==name);map.invalidateSize();layer.resize();}
    current=await view(name);current.activate?.();dirty=true;
    document.title=`Euro Rail — ${name==='more'?'More views':TITLES[name]}`;
  }
  window.addEventListener('hashchange',route);
  route();
}
main();
