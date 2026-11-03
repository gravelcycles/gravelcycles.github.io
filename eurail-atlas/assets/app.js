import{MODES,PASS_MODES,EUROPE_BOUNDS,ITALY_BOUNDS,FREQUENCY_COLORS,FREQUENCY_LABELS,normalize,escapeHTML as esc,selectedDays,sumDays,effectivePass,usesHubConnections,qualifiesEdge,edgeCount,perDay,threshold,readState,serializeState,formatNumber as fmt,dateLabel,searchStations,publicTrainLabels,journeyPublicTrainLines,prepareEdge,isItaly,aggregateMapPairs,MapPairIndex,indexedJourneyFiles,reviewedCount,conditionalCount,validMapLocation,stationMapPoint,nearbyStationLocations,CHARGE_BITS,normalizeCharge,chargeFiltered,chargeDescription,serviceVisible,isTemporaryReplacement,inferredRailPath,inferredAlignment}from'./atlas-core.js?v=d5c7f826e6e0fec4';
import{lineInformation,connectionFrequencyInformation}from'./line-information.js?v=d5c7f826e6e0fec4';
import{replacementHTML,serviceBreakdownHTML,replacementRailCorridor}from'./replacement-service.js?v=d5c7f826e6e0fec4';
import{needsSourceRefresh,reconcileSourceSelection,sameManifestAsset}from'./source-selection.js?v=d5c7f826e6e0fec4';
import{decodePassPolicies}from'./pass-policies.js?v=d5c7f826e6e0fec4';
import{RailRenderer}from'./map-renderer.js?v=d5c7f826e6e0fec4';
import{resolveAssetURL}from'./data-codec.js?v=d5c7f826e6e0fec4';
import{AtlasDataLoader}from'./data-loader.js?v=d5c7f826e6e0fec4';
import{setupCoverage}from'./coverage-panel.js?v=d5c7f826e6e0fec4';
import{mergeCompletePairs}from'./network-view.js?v=d5c7f826e6e0fec4';
import{setupServiceContext}from'./service-context.js?v=d5c7f826e6e0fec4';
import{setupInfrastructureContext}from'./infrastructure-context.js?v=d5c7f826e6e0fec4';
import{setupOperatingTransfers}from'./operating-transfers.js?v=d5c7f826e6e0fec4';
import{mergeSleepServices,serviceSleepHTML,publicTrainSleepNote}from'./sleep-service.js?v=d5c7f826e6e0fec4';
import{setupTrainInspector}from'./train-inspector.js?v=d5c7f826e6e0fec4';
import{routeFocusIds,callId,groupStationRoutes}from'./train-services.js?v=d5c7f826e6e0fec4';
import{matchesFocus}from'./route-focus.js?v=d5c7f826e6e0fec4';
import{setupStationSearch,nearbyStationRecords}from'./station-search.js?v=d5c7f826e6e0fec4';
import{StationMarkers,STATION_ZOOM}from'./station-markers.js?v=d5c7f826e6e0fec4';

const $=id=>document.getElementById(id),state=readState(location.search),cache=new Map(),edges=new Map(),stationMap=new Map(),chunkLoaded=new Set(),detailData=new Map(),hubMap=new Map();
let manifest=null,dates=['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07'],stationList=[],hubEdges=[],hubCities=[],selected=null,map,renderer,markers,baseLayer,chunkTimer=0,toastTimer=0,detailSequence=0,legResult=null,booting=false,edgeVersion=0,hubVersion=0,pairVersion=-1,hubPairVersion=-1,pairEdges=[],hubPairEdges=[],journeyHighlights=new Set(),stationLoadPromise=null,bootstrapStationPromise=null,fullStationsLoaded=false,hubLoadPromise=null,searchList=[],chunkRun=0;
let feeCustom=state.charge!=='all'&&state.charge!=='free';
const mapPairIndex=new MapPairIndex(),dataLoader=new AtlasDataLoader(),chunkRequests=new Map(),pauseWork=()=>globalThis.scheduler?.yield?globalThis.scheduler.yield():new Promise(resolve=>setTimeout(resolve,0));
let chunkPaintTimer=0;
let selectedStation=null,stationMarkers=null,stationMarkerLoad=null,stationSearch=null,stationFocus=null,stationFocusGeneration=0;
const stationErrors=new Set();
let italyNetworkPromise=null;
let displayPairs=[],overviewMetadataPromise=null,fullManifestPromise=null,hubCitiesPromise=null,filterSaveTimer=0;
let completeNetworkPromise=null,completeNetworkLoaded=false,completeNetworkGeneration=0;
let passPolicies=null,passPoliciesPromise=null,passPoliciesFailed=false;
function attachPassPolicy(edge){if(!passPolicies)return edge;return{...edge,_passPolicy:passPolicies.get(edge.id),...(edge._directionEdges?{_directionEdges:edge._directionEdges.map(e=>({...e,_passPolicy:passPolicies.get(e.id)}))}:{})};}
async function ensurePassPolicies(){
  if(state.mode!=='eurail'||!hasServices())return;
  if(!passPoliciesPromise)passPoliciesPromise=(async()=>{await ensureManifest();if(!manifest.files.passPolicies)throw new Error('Pass conditions unavailable');passPolicies=decodePassPolicies(await json(dataURL(manifest.files.passPolicies)));passPoliciesFailed=false;edgeVersion++;pairVersion=-1;if(selected)selected=attachPassPolicy(selected);refresh();})().catch(error=>{passPoliciesPromise=null;passPoliciesFailed=true;applyControls();toast('Pass conditions could not load. Re-select the filter to retry.');throw error;});
  return passPoliciesPromise;
}
const hydratedNetworkPairs=new Set();
const edgePublicNumbers=new Map(),publicNumberRequests=new Map();
const edgeServiceErrors=new Set();
let trainFocus=null,trainFocusGroup=null,trainFocusView=null,trainFocusGeneration=0;
const coverage=setupCoverage({getManifest:()=>manifest,getState:()=>state,getView:()=>map?{bounds:[map.getBounds().getWest(),map.getBounds().getSouth(),map.getBounds().getEast(),map.getBounds().getNorth()]}:null,load:path=>json(dataURL(path)),onShowSources:ids=>{state.sources=new Set([...(state.sources||[]),...ids]);alternativeSources();setupSources();refresh();}});
const serviceContext=setupServiceContext({getManifest:()=>manifest,getState:()=>state,getDates:()=>dates,getMap:()=>map,onChange:()=>refresh({details:false}),onOpen:()=>{closeOtherContextPanels('serviceContextPanel');setControlsOpen(false);},getView:()=>map?{zoom:map.getZoom(),bounds:[map.getBounds().getWest(),map.getBounds().getSouth(),map.getBounds().getEast(),map.getBounds().getNorth()]}:null,load:path=>json(dataURL(path))});
const trainInspector=setupTrainInspector({getState:()=>state,getDates:()=>dates,getJourneys:id=>edgePublicNumbers.get(id)?.journeys,station,sourceName,loadTimetables:loadRouteTimetables,onFocus:focusTrainRoute,onBack:()=>clearTrainFocus(true),onRetry:()=>{if(selectedStation)pickStation(selectedStation,{inspect:true,restore:true});else if(selected)pickEdge(selected,false);},onStation:id=>{const s=stationMap.get(id);if(s)pickStation(s,{inspect:true});}});
async function loadRouteTimetables(group){
  await ensureManifest();const journeys=new Map();if(!manifest.files.timetables)return{journeys,status:{}};
  const index=await json(dataURL(manifest.files.timetables)),paths=[...new Set(group.journeys.map(j=>index.journeys?.[j.id]).filter(Boolean))];
  const pages=await Promise.all(paths.map(path=>json(dataURL(path))));
  for(const page of pages)for(const journey of page.journeys||[])if(journey.source===group.source)journeys.set(journey.id,journey);
  return{journeys,status:index.sources?.[group.source]||{}};
}
function clearTrainFocus(restore=false){
  trainFocusGeneration++;trainFocus=null;trainFocusGroup=null;journeyHighlights.clear();document.body.classList.remove('train-route-focus');
  const view=trainFocusView;trainFocusView=null;if(restore&&view)map.setView(view.center,view.zoom,{animate:false});
  refreshRouteFocus();if(map)renderHubs();
}
async function focusTrainRoute(group){
  const ticket=++trainFocusGeneration;if(!trainFocusView)trainFocusView={center:map.getCenter(),zoom:map.getZoom()};
  trainFocus=group.key;trainFocusGroup=group;journeyHighlights=new Set(group.edgeIds);document.body.classList.add('train-route-focus');renderHubs();refreshRouteFocus();
  try{
    const[,ids]=await Promise.all([loadCompleteNetwork({forRoute:true}),routeFocusIds([group])]);if(ticket!==trainFocusGeneration)return;
    journeyHighlights=ids;const rows=currentEdges().filter(edge=>matchesFocus(edge,ids));renderer.schedule();
    const points=group.stops.map(call=>station(callId(call))).filter(s=>validMapLocation(s.lon,s.lat)).map(s=>[s.lat,s.lon]);
    if(points.length){const phone=matchMedia('(max-width:600px)').matches;map.fitBounds(points,{paddingTopLeft:[24,phone?Math.min(mapFocusTop()+45,map.getSize().y*.34):130],paddingBottomRight:[phone?24:440,phone?Math.round(map.getSize().y*.52)+36:75],maxZoom:10,animate:false});}
    await Promise.all(rows.filter(edge=>edge._displayOnly).map(edge=>hydrateDisplayEdge(edge)));
    if(ticket===trainFocusGeneration)renderer.schedule();
  }catch{if(ticket===trainFocusGeneration)toast('Some route geometry could not load. Its recorded stops are still available.');}
}
function clearStationFocus(){stationFocusGeneration++;stationFocus=null;document.body.classList.remove('station-route-focus');refreshRouteFocus();}
function focusStationRoutes(s,groups,loaded){
  const key=JSON.stringify([s.id,loaded,groups.map(group=>group.key).sort()]);if(stationFocus?.key===key)return;
  const ticket=++stationFocusGeneration,focus={key,stationId:s.id,ids:new Set(groups.flatMap(group=>[...group.edgeIds]))};stationFocus=focus;
  document.body.classList.add('station-route-focus');refreshRouteFocus();
  if(!groups.length)return;
  Promise.all([loadCompleteNetwork({forRoute:true}),routeFocusIds(groups)]).then(([,ids])=>{
    if(ticket!==stationFocusGeneration||selectedStation?.id!==s.id)return;
    focus.ids=ids;renderer.schedule();
  }).catch(()=>{if(ticket===stationFocusGeneration&&selectedStation?.id===s.id)toast('Some route geometry could not load. The station’s recorded services are still available.');});
}
function activeFocusIds(){return trainFocus?journeyHighlights:selectedStation&&stationFocus?.stationId===selectedStation.id?stationFocus.ids:null;}
function refreshRouteFocus(){renderer?.schedule();operatingTransfers.refresh();}
function mapFocusTop(){
  const origin=map.getContainer().getBoundingClientRect().top;
  let top=document.querySelector('.site-header').getBoundingClientRect().bottom+70;
  for(const notice of document.querySelectorAll('.map-notices > :not([hidden])')){const box=notice.getBoundingClientRect();if(box.height)top=Math.max(top,box.bottom+14);}
  return top-origin;
}
const infrastructureContext=setupInfrastructureContext({onOpen:()=>closeOtherContextPanels('infrastructureContextPanel'),getManifest:()=>manifest,getState:()=>state,getDates:()=>dates,getMap:()=>map,getView:()=>map?{zoom:map.getZoom(),bounds:[map.getBounds().getWest(),map.getBounds().getSouth(),map.getBounds().getEast(),map.getBounds().getNorth()]}:null,load:path=>json(dataURL(path))});
const operatingTransfers=setupOperatingTransfers({isFocused:()=>activeFocusIds()!==null,onOpen:()=>closeOtherContextPanels('operatingTransfersPanel'),getManifest:()=>manifest,getState:()=>state,getDates:()=>dates,getMap:()=>map,getView:()=>map?{zoom:map.getZoom(),bounds:[map.getBounds().getWest(),map.getBounds().getSouth(),map.getBounds().getEast(),map.getBounds().getNorth()]}:null,load:path=>json(dataURL(path))});

function paintChunks(flush=false){if(flush){clearTimeout(chunkPaintTimer);chunkPaintTimer=0;renderer.schedule();}else if(!chunkPaintTimer)chunkPaintTimer=setTimeout(()=>{chunkPaintTimer=0;renderer.schedule();},300);}
const manifestURL=new URL('data/manifest.json',location.href),dataURL=path=>resolveAssetURL(path,manifest,manifestURL);
function json(url,{fresh=false,signal}={}){if(!cache.has(url)){const promise=dataLoader.load(url,{fresh,signal}).catch(error=>{if(cache.get(url)===promise)cache.delete(url);throw error;});cache.set(url,promise);}return cache.get(url);}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function status(message){$('screenReaderStatus').textContent=message;}
function sourceById(id){return manifest?.sources?.find(s=>s.id===id)||{id,name:id};}
function station(id){return stationMap.get(id)||hubMap.get(id)||{id,name:'Recorded station',country:''};}
function shortName(s){return String(s?.name||'Recorded station').replace(/\s+(Hauptbahnhof|Central Station|railway station)$/i,'');}
function sourceName(id){const s=sourceById(id);return s.name||s.publisher||id;}
async function addEdges(rows){let count=0,started=performance.now();for(const row of rows||[]){const previous=edges.get(row.id),points=row._pointCount||row.coords?.length||0;if(!previous||points>(previous._pointCount||previous.coords?.length||0)){const edge=prepareEdge(row);if(edge){edges.set(edge.id,edge);mapPairIndex.set(edge);edgeVersion++;}}if(++count%24===0&&performance.now()-started>=4){await pauseWork();started=performance.now();}}}
function selectedDayCount(){return Math.max(1,selectedDays(state.day,dates).length);}
function lineCount(line,boarding=usesHubConnections(state)){if(!serviceVisible(line,state))return 0;const pass=effectivePass(state),field=boarding?(pass?'eurailBoardableDaily':'boardableDaily'):(pass?'eurailDaily':'daily'),weekly=boarding?(pass?'eurailBoardableWeekly':'boardableWeekly'):(pass?'eurailWeekly':'weekly');return sumDays(line,state.day,dates,field,weekly)+(pass?reviewedCount(line,state,dates,boarding):0);}
function bothDirections(edge){const rows=edge._directionEdges||[edge];return rows.some(a=>rows.some(b=>a.a===b.b&&a.b===b.a));}
function directionLabel(edge){return bothDirections(edge)?'both recorded directions':'recorded direction';}

function currentEdges(){if(usesHubConnections(state)&&!trainFocus&&!selectedStation){if(hubPairVersion!==hubVersion){hubPairEdges=aggregateMapPairs(hubEdges);hubPairVersion=hubVersion;}return hubPairEdges;}if(pairVersion!==edgeVersion){const real=mapPairIndex.values();if(completeNetworkLoaded)pairEdges=mergeCompletePairs(displayPairs,real,hydratedNetworkPairs);else{const ids=new Set(real.map(e=>e.id));pairEdges=[...displayPairs.filter(e=>!ids.has(e.id)),...real];}pairEdges=pairEdges.map(attachPassPolicy);pairVersion=edgeVersion;}return pairEdges;}
function findDisplayedEdge(id){return currentEdges().find(edge=>edge.id===id)||edges.get(id);}
function alternativeSources(){state.altSourceIds=new Set([...state.sources||[]].filter(id=>sourceById(id).defaultVisible===false));}
function saveURL(){if(map&&!booting)history.replaceState(null,'',serializeState(state,map));}
function method(){const d=$('methodDialog');if(!d.open)d.showModal();ensureManifest().then(()=>{updateMethod();loadPublicDownloads().catch(()=>{});}).catch(()=>toast('Source details could not load. Please retry.'));}
function reconcileSources(){
  const selection=reconcileSourceSelection(manifest.sources,state.sources,{previousDefaults:state.defaultSources,authoritative:!manifest._bootstrap});
  state.defaultSources=selection.defaults;state.sources=selection.sources;alternativeSources();
  if(selection.fallback)toast('This saved source selection is unavailable. Showing recommended sources.');
}
async function ensureManifest(){
  if(!manifest?._bootstrap)return manifest;
  if(!fullManifestPromise)fullManifestPromise=json(manifestURL.href,{fresh:true}).then(value=>{
    const previous=manifest,networkChanged=!sameManifestAsset(previous,value,'displayNetwork');
    if(!sameManifestAsset(previous,value,'displayOverview'))window.atlasDisplayPromise=null;
    if(networkChanged){window.atlasCompletePromise=null;completeNetworkPromise=null;completeNetworkLoaded=false;completeNetworkGeneration++;}
    manifest=value;
    if(state.defaultSources){reconcileSources();setupSources();refresh({details:false});}
    coverage.refresh();serviceContext.refresh();infrastructureContext.refresh();operatingTransfers.refresh();
    if(networkChanged&&!booting)loadCompleteNetwork().catch(()=>{});
    return manifest;
  }).catch(error=>{fullManifestPromise=null;throw error;});
  return fullManifestPromise;
}
async function ensureOverviewMetadata(){
  if(manifest?.files?.displayNetwork){await loadCompleteNetwork();return;}
  if(!displayPairs.length)return;
  if(!overviewMetadataPromise)overviewMetadataPromise=(async()=>{const data=await json(dataURL(manifest.files.displayOverviewMetadata||manifest.files.overview));await addEdges(data.edges||data);displayPairs=[];edgeVersion++;renderer.schedule();})().catch(error=>{overviewMetadataPromise=null;throw error;});
  return overviewMetadataPromise;
}
async function hydrateDisplayEdge(edge){
  if(!edge?._displayOnly)return edge;
  await ensureManifest();
  const network=edge._displayCatalog==='network',catalog=network?manifest.files.displayNetworkMetadata:manifest.files.displayMetadata,page=catalog?.files?.[Math.floor(edge._startupIndex/(catalog?.pairsPerPage||128))];
  if(page){const data=await json(dataURL(page));if(data.stations)await mergeStations(data,{paint:false});await addEdges(data.edges||[]);if(network){for(const pair of aggregateMapPairs(data.edges||[]))hydratedNetworkPairs.add(pair.id);edgeVersion++;}}
  else await ensureOverviewMetadata();
  const upgraded=findDisplayedEdge(edge.id)||edge;
  if(!network&&completeNetworkLoaded&&upgraded._displayCatalog==='network')return hydrateDisplayEdge(upgraded);
  return upgraded;
}
async function loadCompleteNetwork({forRoute=false}={}){
  if(completeNetworkLoaded||!manifest?.files?.displayNetwork||!forRoute&&(usesHubConnections(state)||state.mode==='italy'&&!busesOnly()))return;
  const generation=completeNetworkGeneration;
  if(!completeNetworkPromise)completeNetworkPromise=(async()=>{
    const data=window.atlasCompletePromise?await dataLoader.decode(await window.atlasCompletePromise):await json(dataURL(manifest.files.displayNetwork));
    if(generation!==completeNetworkGeneration)return loadCompleteNetwork({forRoute});
    displayPairs=data.edges||[];completeNetworkLoaded=true;edgeVersion++;$('map').dataset.network='complete';renderer.schedule();
    status('All available network connections loaded. Zoom changes geometry detail, not service coverage.');
    if(state.edge&&!selected){const edge=findDisplayedEdge(state.edge);if(edge)pickEdge(edge,false);}
  })().catch(error=>{if(generation!==completeNetworkGeneration)return loadCompleteNetwork({forRoute});completeNetworkPromise=null;toast('The complete network could not load. Pan or zoom to retry.');throw error;});
  return completeNetworkPromise;
}
async function loadPublicDownloads(){
  if(!manifest?.files?.sourceRegister||$('publicDownloads'))return;
  const register=await json(dataURL(manifest.files.sourceRegister));if(!Array.isArray(register.publicDownloads)||!register.publicDownloads.length)return;
  const section=document.createElement('section');section.id='publicDownloads';const heading=document.createElement('h3');heading.className='detail-heading';heading.textContent='SOURCE DOWNLOADS';section.appendChild(heading);
  for(const item of register.publicDownloads){try{const url=new URL(item.url,manifestURL);if(url.protocol!=='https:'&&url.origin!==location.origin)continue;if(/^[0-9a-f]{64}$/.test(item.sha256||''))url.searchParams.set('v',item.sha256);const row=document.createElement('p'),link=document.createElement('a');link.href=url.href;link.download=url.pathname.split('/').at(-1);link.textContent=(sourceName(item.sourceId)||item.sourceId)+' · original source ZIP ↗';row.appendChild(link);const note=document.createElement('span');note.textContent=' · '+[item.licence,item.attribution].filter(Boolean).join(' · ');row.appendChild(note);section.appendChild(row);}catch{}}
  $('methodContent').appendChild(section);
}
function closeMethod(){$('methodDialog').close();}

function setControlsOpen(open){
  if(open)stationSearch?.close();
  $('mapControls').hidden=!open;$('controlsToggle').setAttribute('aria-expanded',String(open));
}
function mapFramePadding(){
  const phone=matchMedia('(max-width:600px)').matches,compact=matchMedia('(max-width:900px)').matches;
  const top=document.body.classList.contains('map-focus')?56:compact?112:64;
  return{paddingTopLeft:[18,top+76],paddingBottomRight:[phone?18:72,phone?165:110]};
}
let controlsBeforeFullscreen=false;
function syncMapFullscreen(active){
  const previous=document.body.classList.contains('map-focus');
  if(active&&!previous){controlsBeforeFullscreen=!$('mapControls').hidden;setControlsOpen(false);}
  document.body.classList.toggle('map-focus',active);
  $('fullscreenMap').setAttribute('aria-pressed',String(active));
  $('fullscreenMap').setAttribute('aria-label',active?'Exit fullscreen map':'Enter fullscreen map');
  $('fullscreenMap').title=active?'Exit fullscreen map':'Fullscreen map';
  if(!active&&previous&&controlsBeforeFullscreen)setControlsOpen(true);
  requestAnimationFrame(()=>{map.invalidateSize({pan:false});renderer.schedule();});
}
async function toggleMapFullscreen(){
  if(document.fullscreenElement){try{await document.exitFullscreen();}catch{syncMapFullscreen(false);}return;}
  if(document.body.classList.contains('map-focus')){syncMapFullscreen(false);return;}
  syncMapFullscreen(true);
  if(document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen();}catch{/* The map focus layout also works where browser fullscreen is unavailable. */}}
}
function setupMapControls(){
  $('controlsToggle').onclick=()=>setControlsOpen($('mapControls').hidden);
  $('closeControls').onclick=()=>{setControlsOpen(false);$('controlsToggle').focus();};
  $('coverageMethod').onclick=()=>coverage.open();$('italyCoverage').onclick=()=>coverage.open('Italy');$('fullscreenMap').onclick=toggleMapFullscreen;
  document.addEventListener('fullscreenchange',()=>syncMapFullscreen(Boolean(document.fullscreenElement)));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.fullscreenElement&&document.body.classList.contains('map-focus'))syncMapFullscreen(false);});
  setControlsOpen(false);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('mapControls').hidden&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();setControlsOpen(false);$('controlsToggle').focus();}},true);
}

function initMap(){
  map=L.map('map',{zoomControl:false,attributionControl:false,zoomSnap:.25,zoomDelta:1,minZoom:3,maxZoom:19,touchZoom:true,maxBounds:[[-5,-55],[85,90]],maxBoundsViscosity:.6,preferCanvas:true});
  // The compact country layer is an offline fallback beneath the detailed map.
  map.createPane('countryFallback').style.zIndex=150;
  if(state.center)map.setView(state.center.slice(0,2),state.center[2]);else map.fitBounds(state.mode==='italy'?ITALY_BOUNDS:EUROPE_BOUNDS,mapFramePadding());
  let loadedTiles=0;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,maxNativeZoom:19,updateWhenIdle:true,updateWhenZooming:false,
    keepBuffer:0,detectRetina:false,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }).on('loading',()=>{loadedTiles=0;}).on('tileload',()=>{loadedTiles++;$('basemapStatus').hidden=true;map.getContainer().dataset.basemap='available';})
    .on('tileerror',event=>{event.tile.style.visibility='hidden';})
    .on('load',()=>{$('basemapStatus').hidden=loadedTiles>0;if(!loadedTiles){map.getContainer().dataset.basemap='fallback';loadCountryFallback();}}).addTo(map);
  markers=L.layerGroup().addTo(map);stationMarkers=new StationMarkers(map,{getStations:()=>stationList,getState:()=>state,getSelected:()=>selectedStation,isFocused:()=>!!trainFocus,onPick:s=>pickStation(s,{inspect:true})});renderer=new RailRenderer(map,()=>{const focusIds=activeFocusIds();return{edges:currentEdges(),state,dates,stations:stationMap,selected:trainFocus?null:selected,highlightIds:focusIds||journeyHighlights,focusIds};},pickEdge);
  renderer.canvas.addEventListener('atlasdraw',event=>updateMapSummary(event.detail.visible));map.on('moveend zoomend',()=>{saveURL();scheduleChunks();renderHubs();coverage.refreshViewport();serviceContext.refresh();infrastructureContext.refresh();operatingTransfers.refresh();});

  $('zoomIn').onclick=()=>map.zoomIn();$('zoomOut').onclick=()=>map.zoomOut();$('fitMap').onclick=()=>fitRegion();
}
function drawCountries(geo){if(baseLayer)map.removeLayer(baseLayer);baseLayer=L.geoJSON(geo,{pane:'countryFallback',interactive:false,style:{fillColor:'#f3f3ed',fillOpacity:1,color:'#bdcbc5',weight:.8,opacity:.9}}).addTo(map);}
function loadCountryFallback(){if(manifest&&!baseLayer)json(manifest.files.context?dataURL(manifest.files.context):new URL('assets/countries.geojson',location.href).href).then(drawCountries).catch(()=>{});}
function fitRegion(){map.fitBounds(state.mode==='italy'?ITALY_BOUNDS:EUROPE_BOUNDS,{...mapFramePadding(),animate:true});}
function closeOtherContextPanels(id){for(const panel of document.querySelectorAll('.service-context-panel'))if(panel.id!==id&&!panel.hidden)panel.querySelector('.close-button')?.click();}
function hasServices(){return state.trains||state.replacements;}
function busesOnly(){return !state.trains&&state.replacements;}
function hasServicePaths(){return state.aligned!==false||state.inferred!==false||state.schematic!==false;}
function remainingContext(){return[state.closedCorridors!==false?'affected railways':null,state.physicalRailways?'physical railways':null].filter(Boolean);}
function updateMapSummary(visible){
  const summary=$('mapSummary'),date=state.day==='all'?'All week':state.day==='weekdays'?'Weekdays':state.day==='weekend'?'Weekend':dateLabel(state.day,dates);
  if(!hasServices()||!hasServicePaths()){
    const context=remainingContext();summary.lastElementChild.textContent=(!hasServices()?'Services hidden':'Service paths hidden')+(context.length?' · context overlays on':'');
    summary.title=context.length?'Still enabled: '+context.join(', ')+'. Use Context overlays or Hide all overlays in Filters.':'No service paths or railway context enabled.';$('overviewNote').hidden=true;return;
  }
  const label=usesHubConnections(state)?'city links':'connections',loading=manifest?.files?.displayNetwork&&!completeNetworkLoaded&&!usesHubConnections(state)&&state.mode!=='italy';
  summary.lastElementChild.textContent=`${fmt(visible||0)} ${label} · ${date}${loading?' · loading…':''}`;
  summary.title=`${fmt(visible||0)} source-defined ${label} in view · ${dateLabel(state.day,dates)}`;
  $('overviewNote').hidden=usesHubConnections(state)||state.mode==='italy'||completeNetworkLoaded;
  $('overviewNote').textContent=manifest?.files?.displayNetwork?'Loading all available network connections…':'Partial overview; zoom in for detail';
  if(visible===0&&manifest&&$('mapLoading').hidden){summary.lastElementChild.textContent='No matching services here · adjust filters';summary.title='The current date, sources and service filters have no matches in view. This does not establish that no services operate.';}
}
function applyLegend(){const visible=state.legend!==false;$('mapLegend').hidden=!visible;$('mapKey').dataset.collapsed=String(!visible);$('legendToggle').setAttribute('aria-expanded',String(visible));$('legendToggle').setAttribute('aria-label',visible?'Hide map key':'Show map key');$('legendToggle').title=visible?'Hide map key':'Show map key';$('legendToggleIcon').textContent=visible?'−':'+';}
function setupLegend(){for(let i=0;i<FREQUENCY_COLORS.length;i++){const swatch=document.createElement('span');swatch.style.backgroundColor=FREQUENCY_COLORS[i];$('legendGradient').appendChild(swatch);const label=document.createElement('span');label.textContent=FREQUENCY_LABELS[i];$('legendLabels').appendChild(label);}$('legendToggle').onclick=()=>{state.legend=state.legend===false;applyLegend();saveURL();};applyLegend();}
function applyControls(){
  const filtered=chargeFiltered(state),pass=effectivePass(state),services=hasServices(),bus=busesOnly();
  $('emptySourceSelection').hidden=!services||!manifest||state.sources?.size!==0;
  applyLegend();serviceContext.refresh();infrastructureContext.refresh();operatingTransfers.refresh();document.body.dataset.view=state.mode;
  $('showTrains').checked=state.trains;$('showReplacements').checked=state.replacements;
  $('showClosedCorridors').checked=state.closedCorridors!==false;$('showPhysicalRailways').checked=state.physicalRailways===true;
  const remaining=remainingContext();$('serviceLayerHelp').textContent=!services&&remaining.length?'Services hidden. Still on: '+remaining.join(', ')+'. Turn them off below, or choose Hide all overlays.':'Context overlays have separate switches below.';
  $('findReplacementServices').hidden=!state.replacements;
  const context=serviceContext.summary?.();
  $('contextLayerHelp').textContent=context?.available?`${context.available} affected sections for these dates. These overlays stay independent of service and geometry filters.`:'These overlays stay independent of service and geometry filters. Coverage is partial.';
  $('fitReplacementSections').disabled=!context?.available||state.closedCorridors===false;
  $('italyCoverage').hidden=!services||state.mode!=='italy'||manifest?.publication?.audience!=='public';
  if(state.mode==='italy')$('italyCoverage').textContent=manifest?.sources?.some(source=>source.id==='it_trenitalia_nap')?'National Trenitalia services included; regional coverage remains partial. Coverage ↗':'Italian timetable coverage is partial. Coverage ↗';
  $('controlsTitle').textContent=state.mode==='leg'?'Your journey':'Map filters';$('controlsToggleLabel').textContent=state.mode==='leg'?'Journey':'Filters';
  document.querySelectorAll('[data-mode]').forEach(button=>{const active=button.dataset.mode===state.mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  $('legForm').hidden=state.mode!=='leg';
  $('mapTitle').textContent=!services?(remaining.length?'Context view':'Services hidden'):bus?'Replacement bus services':MODES[state.mode].title;
  $('mapKicker').textContent=!services?'MAP CONTEXT':bus?'TEMPORARY REPLACEMENTS':MODES[state.mode].kicker;
  $('mapSubtitle').textContent=!services?(remaining.length?'Service layers are hidden; context overlays remain enabled in Filters.':'Enable services or context overlays in Filters.'):bus?'Timetabled replacement buses. Railway paths show orientation, not bus roads.':MODES[state.mode].subtitle;
  $('showStations').checked=state.stations!==false;$('showHubs').checked=state.hubs;$('showSchematic').checked=state.schematic;$('showAligned').checked=state.aligned!==false;$('showInferred').checked=state.inferred!==false;
  $('passToggleRow').hidden=PASS_MODES.has(state.mode);$('eurailOnly').checked=pass;$('eurailOnly').disabled=false;
  $('passCoverageGroup').hidden=!pass;$('includedToggleRow').hidden=state.mode!=='eurail';
  $('showIncluded').checked=state.included!==false;$('showReview').checked=state.review;$('showReview').disabled=filtered;
  $('reviewKey').hidden=!(services&&pass&&state.review&&!filtered);
  $('uncertaintyHelp').textContent=state.mode==='eurail'?(filtered?'Choose All fee conditions to include uncertain coverage. Fees filter confirmed included services only.':'Uncertain inclusion is shown in amber, separately from confirmed inclusion. Known exclusions stay excluded.'):'Conditional pass coverage is shown separately from confirmed included services.';
  $('passConditionRow').hidden=state.mode!=='eurail';
  $('feePreset').value=feeCustom?'custom':state.charge==='free'?'free':'all';
  const advancedWasHidden=$('feeAdvanced').hidden;$('feeAdvanced').hidden=!feeCustom;if(feeCustom&&advancedWasHidden)$('feeAdvanced').open=true;
  const charges=state.charge==='all'||!state.charge?Object.keys(CHARGE_BITS):state.charge.split(',');
  document.querySelectorAll('[data-charge]').forEach(input=>{input.checked=charges.includes(input.dataset.charge);});$('chargeMatch').value=state.chargeMatch||'any';
  $('passConditionHelp').textContent=!passPolicies?(passPoliciesFailed?'Pass conditions unavailable. Change a choice to retry.':'Loading recorded pass conditions…'):state.charge==='none'?'No fee conditions selected: no included services match.':state.charge==='free'?'Explicitly no mandatory reservation or listed train supplement. Optional reservations, upgrades and accommodation may cost extra.':(state.chargeMatch==='all'?'Every checked condition must apply.':'Matches any checked condition; each service is counted once.')+' Unknown fees never qualify as free.';
  $('minFrequency').value=state.min;$('frequencyValue').textContent=state.min?threshold(state.min)+' / day':'Any';$('dateSelect').value=state.day;
  document.querySelectorAll('[data-day]').forEach(button=>{button.classList.toggle('active',button.dataset.day===state.day);button.setAttribute('aria-pressed',String(button.dataset.day===state.day));});
  $('legendTitle').textContent=bus?'RECORDED REPLACEMENT BUSES / DAY':pass?'RECORDED EURAIL SERVICES / DAY':!state.replacements?'RECORDED TRAINS / DAY':'RECORDED SERVICES / DAY';
  for(const id of ['legendGradient','legendLabels'])$(id).hidden=!services;
  for(const selector of ['.legend-heading','.frequency-scope','.alignment-key'])document.querySelector(selector).hidden=!services;
  $('legendNote').textContent=!services||!hasServicePaths()?(remaining.length?'Grey context paths remain enabled, independently of service geometry.':'Service paths and railway context are hidden.'):usesHubConnections(state)?'Same-service city connections. Canonical + reviewed inclusion.':pass?'Confirmed inclusion and uncertainty are counted separately; conditions apply.':'Frequencies in available data; coverage varies. Dashed paths carry an alignment explanation.';
  updateSourceCount();updateFilterSummary();
}
function updateFilterSummary(){
  const chips=[];
  if(!state.trains||!state.replacements)chips.push(['services',!hasServices()?'Services hidden':state.trains?'Trains only':'Replacement buses only']);
  if(state.aligned===false||!state.schematic||state.inferred===false){const choices=[state.aligned!==false,state.inferred!==false,state.schematic!==false];chips.push(['geometry',choices.every(value=>!value)?'Service paths hidden':choices[1]&&!choices[0]&&!choices[2]?'Inferred rail paths only':choices[2]&&!choices[0]&&!choices[1]?'Dotted paths only':!choices[2]?'Railway alignments only':!choices[1]?'Inferred rail paths hidden':'Retained alignments hidden']);}
  if(state.closedCorridors===false)chips.push(['context','Affected railways hidden']);
  if(state.physicalRailways)chips.push(['physical','Physical railway context']);
  if(!state.hubs)chips.push(['stations','Major stations hidden']);if(state.stations===false)chips.push(['localStations','Local stops hidden']);
  if(state.pass&&!PASS_MODES.has(state.mode))chips.push(['pass','Eurail coverage']);
  if(state.mode==='eurail'&&(state.included===false||state.review))chips.push(['inclusion',state.included===false?(state.review?'Uncertain inclusion only':'No inclusion selected'):'Confirmed + uncertain inclusion']);
  if(chargeFiltered(state))chips.push(['fees',state.charge==='free'?'No mandatory extras':chargeDescription(state)]);
  if(state.day!=='all')chips.push(['day',dateLabel(state.day,dates)]);
  if(state.min)chips.push(['frequency','At least '+threshold(state.min)+' / day']);
  if(state.sources&&state.defaultSources&&(state.sources.size!==state.defaultSources.size||[...state.sources].some(id=>!state.defaultSources.has(id))))chips.push(['sources',state.sources.size+' timetable sources']);
  $('filterCount').hidden=!chips.length;$('filterCount').textContent=String(chips.length);
  $('controlsToggle').title=chips.length?'Filters: '+chips.map(chip=>chip[1]).join('; '):'Open map filters';
  const host=$('filterSummary');host.hidden=!chips.length;host.replaceChildren();
  for(const[key,label]of chips){const button=document.createElement('button');button.className='filter-chip';button.dataset.clearFilter=key;button.type='button';button.textContent=label+' ×';button.setAttribute('aria-label','Clear filter: '+label);button.onclick=()=>{clearFilter(key);($('filterSummary').querySelector('button')||$('closeControls')).focus();};host.appendChild(button);}
}
function clearFilter(key){
  if(key==='services'){state.trains=true;state.replacements=true;}
  if(key==='geometry'){state.aligned=true;state.schematic=true;state.inferred=true;}
  if(key==='context')state.closedCorridors=true;
  if(key==='physical')state.physicalRailways=false;
  if(key==='stations')state.hubs=true;if(key==='localStations')state.stations=true;
  if(key==='pass')state.pass=false;
  if(key==='inclusion'){state.included=true;state.review=false;}
  if(key==='fees'){state.charge='all';state.chargeMatch='any';feeCustom=false;}
  if(key==='day')state.day='all';if(key==='frequency')state.min=0;
  if(key==='sources'){chooseSources(false);return;}
  layersChanged();
}
function layersChanged(){
  if(selected&&!serviceVisible(selected,state))closeInspector();
  if(trainFocusGroup&&!serviceVisible(trainFocusGroup,state))closeInspector();
  refresh();scheduleChunks();ensurePassPolicies().catch(()=>{});
}
function updateCharges(){
  feeCustom=true;
  const kinds=[...document.querySelectorAll('[data-charge]:checked')].map(input=>input.dataset.charge);
  state.chargeMatch=$('chargeMatch').value;
  state.charge=!kinds.length?'none':kinds.length===4&&state.chargeMatch==='any'?'all':normalizeCharge(kinds.join(','));
  refresh();ensurePassPolicies().catch(()=>{});
}

function refresh({details=true}={}){if(selected&&!qualifiesEdge(selected,state,dates,stationMap))closeInspector();applyControls();renderer.schedule();renderHubs();coverage.refreshViewport();saveURL();if(details&&selected&&!$('inspector').hidden)renderSelected();if(details&&selectedStation&&!$('inspector').hidden)renderStationSelected();if(legResult&&state.mode==='leg'&&details)renderJourneyResult(legResult);}
function setMode(mode){if(!MODES[mode])return;state.mode=mode;setControlsOpen(mode==='leg');closeInspector();refresh();if(mode==='italy')fitRegion();if(mode==='hubs')loadHubs();if(mode==='leg'||(mode==='italy'&&!manifest?.files?.italyNetwork))ensureStations().then(()=>{if(state.mode===mode){refresh({details:false});if(mode==='leg'&&state.from&&state.to)compareStations();}}).catch(()=>toast('Station search could not load. Please retry.'));scheduleChunks();ensurePassPolicies().catch(()=>{});status(MODES[mode].title);}
function setDay(day){state.day=day;refresh();status('Showing '+dateLabel(day,dates));}
function setupDates(){const select=$('dateSelect'),first=new Date(dates[0]+'T12:00:00Z'),last=new Date(dates.at(-1)+'T12:00:00Z');const month=first.toLocaleDateString('en-GB',{month:'short',timeZone:'UTC'}),longMonth=first.toLocaleDateString('en-GB',{month:'long',timeZone:'UTC'}),range=first.getUTCDate()+'–'+last.getUTCDate()+' '+month;$('snapshotLabel').textContent=(range+' '+first.getUTCFullYear()).toUpperCase();$('dateRange').textContent=(first.getUTCDate()+'–'+last.getUTCDate()+' '+longMonth).toUpperCase();select.replaceChildren();for(const[value,label]of[['all','Full week · '+range],['weekdays','Weekdays only'],['weekend','Weekend only'],...dates.map((d,i)=>['day-'+i,new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'})])]){const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);}select.value=state.day;select.onchange=()=>setDay(select.value);}
function updateSourceCount(){if(!manifest)return;$('sourceCount').textContent=(state.sources?.size||0)+' / '+manifest.sources.length;$('swissCredit').hidden=!state.sources?.has('ch_gtfs_2026');}
function setupSources(){const list=$('sourceList');list.replaceChildren();for(const source of manifest.sources||[]){const label=document.createElement('label'),input=document.createElement('input'),span=document.createElement('span');input.type='checkbox';input.checked=state.sources.has(source.id);input.value=source.id;span.textContent=source.name||source.id;const small=document.createElement('small');small.textContent=[source.country,source.defaultVisible===false?'alternative / overlapping feed':'recommended coverage'].filter(Boolean).join(' · ');span.appendChild(small);label.append(input,span);list.appendChild(label);input.onchange=()=>{input.checked?state.sources.add(source.id):state.sources.delete(source.id);alternativeSources();refresh();};}updateSourceCount();}
function chooseSources(all){state.sources=new Set(manifest.sources.filter(s=>all||s.defaultVisible!==false).map(s=>s.id));state.alternatives=all;alternativeSources();setupSources();refresh();}
function detailZoomThreshold(){return !busesOnly()&&state.mode==='italy'&&manifest?.files?.italyNetwork?7:5.5;}
function scheduleChunks(){clearTimeout(chunkTimer);chunkRun++;if(!hasServices()){for(const request of chunkRequests.values())request.controller.abort();return;}if(busesOnly()||state.mode!=='italy'&&!usesHubConnections(state))loadCompleteNetwork().catch(()=>{});if(state.mode==='italy')loadItalyNetwork().catch(()=>{});if(map){const view=map.getBounds().pad(.15);for(const request of chunkRequests.values())if(map.getZoom()<detailZoomThreshold()||usesHubConnections(state)||!boundsIntersect(request.chunk.bounds,view))request.controller.abort();}chunkTimer=setTimeout(loadVisibleChunks,100);}
async function loadItalyNetwork(){
  if(!manifest?.files?.italyNetwork)return;
  if(!italyNetworkPromise)italyNetworkPromise=(async()=>{
    const url=dataURL(manifest.files.italyNetwork),data=await json(url);
    await mergeStations(data);await addEdges(data.edges||[]);cache.delete(url);
    renderer.schedule();renderHubs();
  })().catch(error=>{italyNetworkPromise=null;toast('Italian timetable layer could not load. Pan or zoom to retry.');throw error;});
  return italyNetworkPromise;
}
function boundsIntersect(bounds,view){if(!Array.isArray(bounds)||bounds.length!==4)return true;const[w,s,e,n]=bounds;return e>=view.getWest()&&w<=view.getEast()&&n>=view.getSouth()&&s<=view.getNorth();}
async function loadVisibleChunks(){
  if(!manifest||map.getZoom()<detailZoomThreshold()||usesHubConnections(state)||!hasServices())return;
  await ensureManifest();await ensureOverviewMetadata();
  if(map.getZoom()<detailZoomThreshold()||usesHubConnections(state)||!hasServices())return;
  const run=++chunkRun,view=map.getBounds().pad(.15),queue=(manifest.chunks||[]).filter(chunk=>(!busesOnly()||chunk.serviceMode==='temporary_replacement_bus')&&boundsIntersect(chunk.bounds,view)&&!chunkLoaded.has(chunk.id));
  if(!queue.length)return;
  if(!manifest.provenance?.spatialProjection)ensureStations().catch(()=>{});let failed=false;
  async function worker(){while(queue.length){if(run!==chunkRun)return;const chunk=queue.shift(),request={chunk,controller:new AbortController()};chunkLoaded.add(chunk.id);chunkRequests.set(chunk.id,request);try{const url=dataURL(chunk.url),data=await json(url,{signal:request.controller.signal});if(request.controller.signal.aborted)throw new DOMException('Data request cancelled','AbortError');if(data.stations)await mergeStations(data,{paint:false});await addEdges(data.edges||data);cache.delete(url);paintChunks();}catch(error){if(chunkRequests.get(chunk.id)===request)chunkLoaded.delete(chunk.id);if(error.name!=='AbortError'){failed=true;console.warn('Rail Atlas chunk unavailable:',chunk.id);}}finally{if(chunkRequests.get(chunk.id)===request)chunkRequests.delete(chunk.id);}}}
  await Promise.all(Array.from({length:Math.min(3,queue.length)},worker));
  if(run===chunkRun)paintChunks(true);
  if(failed)toast('Some local lines could not load. Pan or zoom to retry.');
  if(state.edge&&!selected&&findDisplayedEdge(state.edge))pickEdge(findDisplayedEdge(state.edge),false);
}
async function loadHubsData(){if(hubEdges.length||!manifest?.files?.hubConnections){renderer.schedule();return;}try{const data=await json(dataURL(manifest.files.hubConnections));hubCities=(data.hubs||[]).map(h=>({...h,_name:normalize(h.name)}));for(const h of hubCities)hubMap.set(h.id,h);hubEdges=(data.edges||[]).map(prepareEdge).filter(Boolean);hubVersion++;searchList=[...hubCities,...stationList];renderer.schedule();renderHubs();if(state.mode==='leg'&&stationList.length&&(stationMap.has(state.from)||hubMap.has(state.from))&&(stationMap.has(state.to)||hubMap.has(state.to))){for(const field of ['from','to'])$(field==='from'?'fromStation':'toStation').value=station(state[field]).name;compareStations();}if(state.edge&&!selected){const edge=findDisplayedEdge(state.edge);if(edge)pickEdge(edge,false);}}catch(error){toast('City connections could not load. Please retry this view.');}}
async function mergeStations(data,{full=false,paint=true}={}){
  let count=0;const hubs=new Set(data.hubs||[]);
  for(const station of data.stations||data){station._name=station._name||normalize(station.name);if(hubs.has(station.id))station.hub=true;stationMap.set(station.id,station);if(++count%250===0)await pauseWork();}
  stationList=[...stationMap.values()];searchList=[...hubCities,...stationList];if(full)fullStationsLoaded=true;
  for(const field of ['from','to'])if(state[field]&&stationMap.has(state[field]))$(field==='from'?'fromStation':'toStation').value=stationMap.get(state[field]).name;
  if(paint){renderHubs();renderer.schedule();}return stationList;
}
function loadBootstrapStations(){if(!bootstrapStationPromise){const path=manifest.files.overviewStations||manifest.files.stations;bootstrapStationPromise=json(dataURL(path)).then(data=>mergeStations(data,{full:!manifest.files.overviewStations})).catch(error=>{bootstrapStationPromise=null;throw error;});}return bootstrapStationPromise;}
async function ensureStations(){if(fullStationsLoaded)return stationList;if(!stationLoadPromise)stationLoadPromise=(async()=>{await ensureManifest();await loadBootstrapStations();if(!fullStationsLoaded){const url=dataURL(manifest.files.stations),data=await json(url);await mergeStations(data,{full:true});cache.delete(url);}return stationList;})().catch(error=>{stationLoadPromise=null;throw error;});return stationLoadPromise;}
function loadHubs(){if(!hubLoadPromise)hubLoadPromise=loadHubsData().finally(()=>{hubLoadPromise=null;});return hubLoadPromise;}
function loadHubCities(){
  if(!manifest?.files?.hubCities)return loadHubs();
  if(!hubCitiesPromise)hubCitiesPromise=json(dataURL(manifest.files.hubCities)).then(data=>{hubCities=data.hubs||[];for(const h of hubCities){h._name=normalize(h.name);hubMap.set(h.id,h);}searchList=[...hubCities,...stationList];renderHubs();}).catch(()=>{hubCitiesPromise=null;});
  return hubCitiesPromise;
}
function cityConnections(id){const neighbors=new Set();for(const edge of hubEdges){if(edge.a!==id&&edge.b!==id)continue;if(state.sources&&!state.sources.has(edge.source))continue;if(edge.primary===false&&!state.alternatives&&!state.altSourceIds?.has(edge.source))continue;if(edgeCount(edge,state,dates)>0)neighbors.add(edge.a===id?edge.b:edge.a);}return neighbors.size;}
function renderHubs(){if(!map||!markers)return;renderStationMarkers();markers.clearLayers();if(trainFocusGroup){renderTrainStops();return;}if(selectedStation||!state.hubs)return;const bounds=map.getBounds(),zoom=map.getZoom();let candidates=hubCities.length?hubCities:stationList.filter(s=>s.hub);candidates=candidates.filter(s=>(!s.source||!state.sources||state.sources.has(s.source))&&(!effectivePass(state)||!Number.isFinite(s.eurailWeekly)||s.eurailWeekly>0)&&validMapLocation(s.lon,s.lat)&&bounds.contains([s.lat,s.lon])&&(state.mode!=='italy'||isItaly(s.country))).sort((a,b)=>(b.weekly||b.degree||0)-(a.weekly||a.degree||0));const positions=[];let shown=0;for(const s of candidates){const point=map.latLngToContainerPoint([s.lat,s.lon]);if(positions.some(p=>Math.hypot(p.x-point.x,p.y-point.y)<(zoom<5?80:zoom<6?65:50)))continue;positions.push(point);const count=s.memberStationCount?cityConnections(s.id):(effectivePass(state)?s.eurailWeekly:s.weekly);const radius=s.memberStationCount?Math.min(5.3,2.1+Math.sqrt(count)*.5):Math.min(5,2.2+Math.log1p(count||1)/8);L.circleMarker([s.lat,s.lon],{renderer:stationMarkers.renderer,radius,color:'#fbfaf6',weight:1.3,fillColor:'#006f92',fillOpacity:.9,interactive:true,bubblingMouseEvents:false}).addTo(markers).on('click',()=>pickStation(s));const name=shortName(s).replace(/\s*(Hbf|Centrale|Central|Termini|HB|Centraal|Centrální|Hlavní nádraží)$/i,'').trim();L.marker([s.lat,s.lon],{interactive:false,icon:L.divIcon({className:'city-label'+(shown<7?' strong':''),html:esc(name),iconSize:[120,20],iconAnchor:[0,-2]})}).addTo(markers);if(++shown>=(zoom<5?17:35))break;}}
function renderTrainStops(){
  const calls=trainFocusGroup.stops.map(call=>station(callId(call)));
  calls.forEach((s,i)=>{
    if(!validMapLocation(s.lon,s.lat))return;const end=i===0||i===calls.length-1;
    if(s.id!==selectedStation?.id)L.circleMarker([s.lat,s.lon],{renderer:stationMarkers.renderer,radius:end?4.5:3.7,color:'#173f3b',weight:1.5,fillColor:'#fbfaf6',fillOpacity:1,interactive:true,bubblingMouseEvents:false}).addTo(markers).bindTooltip(esc(s.name),{pane:'stationNodes',direction:'top'}).on('click',()=>pickStation(s,{inspect:true}));
    if(end&&s.id!==selectedStation?.id){
      const point=map.latLngToContainerPoint([s.lat,s.lon]);
      // Declutter labels near the selected pin without merging station IDs.
      if(selectedStation&&validMapLocation(selectedStation.lon,selectedStation.lat)&&point.distanceTo(map.latLngToContainerPoint([selectedStation.lat,selectedStation.lon]))<28)return;
      const left=point.x>(map.getSize().x-(matchMedia('(max-width:600px)').matches?24:440))/2;L.marker([s.lat,s.lon],{pane:'stationNodes',interactive:false,icon:L.divIcon({className:'city-label strong route-stop-label',html:`<span${left?' class="route-label-left"':''}>${esc(shortName(s))}</span>`,iconSize:[180,28],iconAnchor:[0,-3]})}).addTo(markers);
    }
  });
  stationMarkers.bringSelectedToFront();
}
function pickHubStation(s){trainInspector.reset();clearTrainFocus(false);if(state.mode==='leg'){const field=state.from?'to':'from';setStationField(field,s);return;}showInspector();selected=null;state.edge='';const prefix=usesHubConnections(state)?'CITY CATCHMENT':'RECORDED STATION',metric=s.memberStationCount?cityConnections(s.id):(effectivePass(state)?s.eurailWeekly:s.weekly);$('inspectorContent').innerHTML=`<p class="eyebrow">${prefix}</p><h3>${esc(s.name)}</h3><p class="subline">${esc(s.country||'European rail network')}</p>${Number.isFinite(metric)?`<div class="detail-stat"><strong>${fmt(s.memberStationCount?metric:metric/7)}</strong><span>${s.memberStationCount?'other city catchments reached by a recorded service':'recorded weekly-average source calls / day'}</span></div>`:''}<h4 class="detail-heading">EXPLORE A JOURNEY</h4><p class="helper">Use this recorded station as the departure or arrival for a service comparison.</p><button class="primary-button" id="stationFrom">Start here <span>→</span></button><p class="detail-note">${s.memberStationCount?'This city catchment groups '+fmt(s.memberStationCount)+' nearby station records for display. It does not imply a free transfer.':'Station names and identities remain source-specific. Counts can overlap with neighbouring feeds.'}</p>`;$('stationFrom').onclick=()=>{setMode('leg');setStationField('from',s);$('toStation').focus();};renderer.schedule();saveURL();}
function renderStationMarkers(){
  if(!stationMarkers)return;stationMarkers.render();
  if(manifest&&state.stations!==false&&map.getZoom()>=STATION_ZOOM&&!fullStationsLoaded&&!stationMarkerLoad){
    stationMarkerLoad=ensureStations().then(()=>stationMarkers.render()).catch(()=>{}).finally(()=>{stationMarkerLoad=null;});
  }
}
function stationReference(s){return{id:'station:'+s.id,_stationIds:[s.id],a:s.id,b:s.id,source:s.source};}
async function ensureStationServices(s){
  const ref=stationReference(s);if(edgePublicNumbers.has(ref.id))return;
  if(publicNumberRequests.has(ref.id))return publicNumberRequests.get(ref.id);
  const promise=(async()=>{
    await ensureManifest();const ids=new Set([s.id]),index=await json(dataURL(manifest.files.journeyLookup)),files=indexedJourneyFiles(index,ids,ids);
    const journeys=await dataLoader.findStationJourneys(files.map(file=>dataURL(file.url)),ids);
    edgePublicNumbers.set(ref.id,{journeys});stationErrors.delete(s.id);while(edgePublicNumbers.size>16)edgePublicNumbers.delete(edgePublicNumbers.keys().next().value);
  })().finally(()=>publicNumberRequests.delete(ref.id));publicNumberRequests.set(ref.id,promise);return promise;
}
function pickStation(s,{inspect=false,center=false,restore=false}={}){
  detailSequence++;selectedStation=null;clearStationFocus();trainInspector.reset();clearTrainFocus(false);state.station='';document.body.classList.remove('station-inspector-open');
  if(s.memberStationCount)return pickHubStation(s);
  if(state.mode==='leg'&&!inspect&&!center){setStationField(state.from?'to':'from',s);return;}
  selected=null;legResult=null;selectedStation=s;stationErrors.delete(s.id);state.edge='';state.station=s.id;document.body.classList.add('station-inspector-open');showInspector();
  const phone=matchMedia('(max-width:600px)').matches;
  if(validMapLocation(s.lon,s.lat)&&(center||phone&&!restore)){
    map.setView([s.lat,s.lon],center?Math.max(11,map.getZoom()):map.getZoom(),{animate:false});
  }
  renderStationSelected();$('inspector').scrollTop=0;
  if(phone&&!restore&&validMapLocation(s.lon,s.lat)){
    const bottom=$('inspector').getBoundingClientRect().top-map.getContainer().getBoundingClientRect().top-20,top=Math.min(mapFocusTop()+45,bottom-30);
    map.panBy([0,Math.round(map.getSize().y/2-(top+bottom)/2)],{animate:false});
  }
  renderHubs();renderer.schedule();saveURL();const ticket=detailSequence;
  ensureStationServices(s).then(()=>{if(ticket===detailSequence&&selectedStation?.id===s.id)renderStationSelected();}).catch(()=>{stationErrors.add(s.id);if(ticket===detailSequence&&selectedStation?.id===s.id)renderStationSelected();});
  status('Selected '+s.name);
}
function renderStationSelected(){
  const s=selectedStation;if(!s)return;
  const ref=stationReference(s),journeys=edgePublicNumbers.get(ref.id)?.journeys,groups=groupStationRoutes(journeys,new Set([s.id]),state,dates),count=groups.reduce((n,g)=>n+g.count,0),daily=dates.map((_,i)=>groups.reduce((n,g)=>n+g.daily[i],0)),nearby=nearbyStationRecords(s,stationList),inactive=state.sources&&!state.sources.has(s.source);
  focusStationRoutes(s,groups,!!journeys);
  $('inspectorContent').innerHTML=`<p class="eyebrow">RECORDED STATION</p><h3>${esc(s.name)}</h3><p class="subline">${esc(s.country||'Country unresolved')} · ${esc(dateLabel(state.day,dates))}</p><p class="station-source">${esc(sourceName(s.source))}</p>${journeys?`<div class="detail-stat"><strong>${fmt(count/selectedDayCount())}</strong><span>scheduled services calling here / day</span></div>${weeklyChart({daily},false,daily)}`:`<p class="helper" role="status">${stationErrors.has(s.id)?'Station services could not load. Retry below.':'Loading services at this station…'}</p>`}${inactive?'<p class="helper">This source is outside your current selection. <button class="text-button" id="includeStationSource">Include this source →</button></p>':''}${validMapLocation(s.lon,s.lat)?'':'<p class="helper">This source has no usable map location. Its station, recorded dates and available timetables remain searchable.</p>'}<div class="station-actions"><button class="primary-button" id="stationFrom">Start here →</button><button class="primary-button" id="stationTo">Go here →</button></div><div id="segmentTrains"></div>${nearby.length?`<details class="nearby-stations"><summary>Nearby station records</summary><p class="helper">Separate source records or platforms. No interchange or duplicate-service merger is assumed.</p>${nearby.map(item=>`<button class="nearby-station" data-nearby-station="${esc(item.id)}"><strong>${esc(item.name)}</strong><small>${esc(sourceName(item.source))}</small></button>`).join('')}</details>`:''}<p class="detail-note">Counts use your selected date, sources and service/pass filters. Each recorded service is counted once here, even if it visits this station twice. Source feeds can overlap. Boarding restrictions are shown on the selected departure’s stop list.</p>`;
  const journeyAction=field=>{setMode('leg');setStationField(field,s);$(field==='from'?'toStation':'fromStation').focus();};
  const focusNote=document.createElement('div');focusNote.className='route-focus-note station-focus-note';focusNote.innerHTML=`<span>${journeys?(groups.length?'Routes through this station highlighted':'No routes match the current filters'):stationErrors.has(s.id)?'Station routes unavailable':'Finding routes through this station…'}</span><button class="text-button" id="restoreStationMap">Restore map</button>`;$('segmentTrains').before(focusNote);$('restoreStationMap').onclick=closeInspector;
  $('stationFrom').onclick=()=>journeyAction('from');$('stationTo').onclick=()=>journeyAction('to');
  $('includeStationSource')?.addEventListener('click',()=>{state.sources.add(s.source);alternativeSources();setupSources();refresh();});
  document.querySelectorAll('[data-nearby-station]').forEach(button=>button.onclick=()=>pickStation(station(button.dataset.nearbyStation),{inspect:true}));
  trainInspector.render(ref,stationErrors.has(s.id));bindChart();
}
function showInspector(){if(matchMedia('(max-width:600px)').matches)setControlsOpen(false);$('inspector').hidden=false;}
function closeInspector(){selectedStation=null;clearStationFocus();state.station='';document.body.classList.remove('station-inspector-open');trainInspector.reset();clearTrainFocus(true);detailSequence++;selected=null;legResult=null;journeyHighlights.clear();state.edge='';$('inspector').hidden=true;renderer?.schedule();saveURL();}
function policyStatuses(rows,field){const values=new Set();for(const row of rows){const raw=row?.[field];if(typeof raw==='string')values.add(raw);else if(raw&&typeof raw==='object')for(const [key,count]of Object.entries(raw))if(Number(count)>0)values.add(key);}return[...values].join(' · ').replaceAll('_',' ');}
async function ensureEdgePublicNumbers(edge){
  if(edgePublicNumbers.has(edge.id))return;
  if(publicNumberRequests.has(edge.id))return publicNumberRequests.get(edge.id);
  const pending=(async()=>{
    await ensureManifest();if(!manifest.files.journeyLookup)return;
    const isHub=usesHubConnections(state),directions=(edge._directionEdges||[edge]).map(({id,source,a,b,primary})=>({id,source,a,b,primary,isHub}));
    if(isHub)await ensureStations();
    const members=id=>isHub?stationList.filter(station=>station.hubId===id).map(station=>station.id):[id];
    const index=await json(dataURL(manifest.files.journeyLookup)),choices=indexedJourneyFiles(index,new Set(directions.flatMap(e=>members(e.a))),new Set(directions.flatMap(e=>members(e.b))));
    const journeys=choices.length?await dataLoader.findEdgeJourneys(choices.map(choice=>dataURL(choice.url)),directions):[];
    await ensureStations();edgeServiceErrors.delete(edge.id);
    edgePublicNumbers.set(edge.id,{journeys,all:journeyPublicTrainLines(journeys,edge),
      included:journeyPublicTrainLines(journeys,edge,{fields:['eurailDaily','reviewedEurailDaily']}),
      conditional:journeyPublicTrainLines(journeys,edge,{fields:['conditionalDaily']})});
    while(edgePublicNumbers.size>16)edgePublicNumbers.delete(edgePublicNumbers.keys().next().value);
  })().finally(()=>publicNumberRequests.delete(edge.id));publicNumberRequests.set(edge.id,pending);return pending;
}
async function detailsFor(edge){await ensureManifest();if(edge._directionEdges){const details=await Promise.all(edge._directionEdges.map(detailsFor));const grouped=new Map();for(let i=0;i<details.length;i++){for(const line of details[i]?.lines||[]){const key=JSON.stringify([line.label,line.operator,line.source||edge.source,line.serviceMode||'rail']);if(!grouped.has(key)){const row={...line,source:line.source||edge.source,publicTrains:[],sleepServices:[]};for(const f of ['daily','eurailDaily','boardableDaily','eurailBoardableDaily','conditionalDaily','conditionalBoardableDaily','reviewedEurailDaily','reviewedEurailBoardableDaily','reviewedConditionalDaily','reviewedConditionalBoardableDaily'])row[f]=Array(7).fill(0);for(const f of ['weekly','eurailWeekly','boardableWeekly','eurailBoardableWeekly','conditionalWeekly','conditionalBoardableWeekly','reviewedEurailWeekly','reviewedEurailBoardableWeekly','reviewedConditionalWeekly','reviewedConditionalBoardableWeekly'])row[f]=0;grouped.set(key,row);}const row=grouped.get(key);for(const f of ['daily','eurailDaily','boardableDaily','eurailBoardableDaily','conditionalDaily','conditionalBoardableDaily','reviewedEurailDaily','reviewedEurailBoardableDaily','reviewedConditionalDaily','reviewedConditionalBoardableDaily'])for(let d=0;d<7;d++)row[f][d]+=Number(line[f]?.[d])||0;for(const f of ['weekly','eurailWeekly','boardableWeekly','eurailBoardableWeekly','conditionalWeekly','conditionalBoardableWeekly','reviewedEurailWeekly','reviewedEurailBoardableWeekly','reviewedConditionalWeekly','reviewedConditionalBoardableWeekly'])row[f]+=Number(line[f])||0;row.publicTrains.push(...(line.publicTrains||[]));row.sleepServices=mergeSleepServices(row.sleepServices,line.sleepServices);}}const result={lines:[...grouped.values()],otherLines:details.reduce((sum,row)=>sum+(Number(row?.otherLines)||0),0),reviewedRuleIds:[...new Set(details.flatMap(row=>row?.reviewedRuleIds||[]))],reservation:policyStatuses(details,'reservation'),supplement:policyStatuses(details,'supplement'),directions:edge._directionEdges.map((e,i)=>({from:e.a,to:e.b,count:edgeCount(e,state,dates),calledFromStation:details[i]?.calledFromStation||e.calledFromStation,calledToStation:details[i]?.calledToStation||e.calledToStation}))};detailData.set(edge.id,result);return result;}if(detailData.has(edge.id))return detailData.get(edge.id);const chunk=edge.detailChunk;if(!chunk)return null;let path=typeof chunk==='string'?chunk:chunk.url;if(manifest.detailChunks&&typeof chunk==='string'){const found=manifest.detailChunks.find(c=>c.id===chunk);if(found)path=found.url;}const data=await json(dataURL(path));const rows=data.legs||data.edges||data.details||data;if(Array.isArray(rows)){for(const r of rows)if(r.id)detailData.set(r.id,r);}else if(rows&&typeof rows==='object'){for(const[id,row]of Object.entries(rows))detailData.set(id,{id,...row});}return detailData.get(edge.id)||null;}
async function pickEdge(edge,animate=true){selectedStation=null;clearStationFocus();state.station='';document.body.classList.remove('station-inspector-open');trainInspector.reset();clearTrainFocus(false);const selection=++detailSequence;if(edge?._displayOnly){status('Loading this connection’s stops and services.');try{edge=await hydrateDisplayEdge(edge);}catch{toast('Connection details could not load. Please retry.');return;}}if(selection!==detailSequence)return;edge=attachPassPolicy(edge);if(!qualifiesEdge(edge,state,dates,stationMap))return;selected=edge;legResult=null;journeyHighlights.clear();state.edge=edge.id;showInspector();renderSelected();renderer.schedule();saveURL();if(animate&&map.getZoom()<6){const point=stationMapPoint(station(edge.a))||edge.coords?.find(p=>validMapLocation(p[0],p[1]))?.slice().reverse();if(point)map.panTo(point,{animate:true});}const ticket=++detailSequence;ensureEdgePublicNumbers(edge).then(()=>{if(ticket===detailSequence&&selected?.id===edge.id)renderSelected();}).catch(()=>{edgeServiceErrors.add(edge.id);if(ticket===detailSequence&&selected?.id===edge.id)renderSelected();});try{await detailsFor(edge);if(ticket===detailSequence&&selected?.id===edge.id)renderSelected();}catch(error){if(ticket===detailSequence)$('inspectorContent').insertAdjacentHTML('beforeend','<p class="detail-note">Detailed service mix could not load. The route and recorded frequency remain available.</p>');}}
function weeklyChart(row,pass=effectivePass(state),override=null){const boarding=usesHubConnections(state),base=boarding?'eurailBoardableDaily':'eurailDaily',reviewed=boarding?'reviewedEurailBoardableDaily':'reviewedEurailDaily',daily=override||(chargeFiltered(state)?dates.map((_,i)=>edgeCount(row,{...state,day:'day-'+i},dates)):pass?dates.map((_,i)=>(Number(row[base]?.[i])||0)+(Number(row[reviewed]?.[i])||0)):(row.daily||[])),max=Math.max(1,...daily);return`<div class="weekly-chart" aria-label="Scheduled services by service date">${dates.map((date,i)=>`<button data-chart-day="day-${i}" class="${selectedDays(state.day,dates).includes(i)?'active':''}" style="height:${Math.max(3,((daily[i]||0)/max)*42)}px" title="${esc(date)}: ${fmt(daily[i]||0)} services" aria-label="Show ${esc(date)}, ${fmt(daily[i]||0)} services"><span>${['S','M','T','W','T','F','S'][i]}</span></button>`).join('')}</div>`;}
function bindChart(){document.querySelectorAll('[data-chart-day]').forEach(button=>button.onclick=()=>setDay(button.dataset.chartDay));}
function servicePublicNumbers(line,review){
  const cached=edgePublicNumbers.get(selected?.id),groups=(review?cached?.conditional:effectivePass(state)?cached?.included:cached?.all)||[];
  const matching=groups.filter(group=>group.source===(line.source||selected?.source)&&group.operator===(line.operator||'')&&group.label===(line.label||line.line||''));
  return[...(line.publicTrains||[]),...matching.flatMap(group=>group.publicTrains)];
}
function serviceRows(lines,boarding=usesHubConnections(state),review=false){const rows=(lines||[]).map(line=>({line,count:review?conditionalCount(line,state,dates):lineCount(line,boarding)})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count),max=Math.max(1,...rows.map(x=>x.count));if(!rows.length)return'<p class="helper">No product-level breakdown is available for these filters.</p>';return rows.slice(0,8).map(({line,count})=>{const nums=publicTrainLabels(servicePublicNumbers(line,review),{day:state.day,dates,limit:5}).map(t=>t.label+publicTrainSleepNote(t,s=>review?conditionalCount(s,state,dates):lineCount(s,boarding))),label=line.name||line.lineName||line.label||line.line||line.publicLine||'Recorded rail service';return`<div class="service-line"><strong>${esc(label)}</strong><b>${fmt(count/selectedDayCount())} / day</b><small>${esc(line.operator||'Recorded operator')}${line.source?'<br>Source: '+esc(sourceName(line.source)):''}${line.label&&line.label!==label?'<br>Source designation: '+esc(line.label):''}${replacementHTML(line,{compact:true})?'<br>'+replacementHTML(line,{compact:true}):''}${nums.length?'<br>Retained public labels: '+esc(nums.join(', ')):''}${serviceSleepHTML(line,s=>review?conditionalCount(s,state,dates):lineCount(s,boarding))?'<br>'+serviceSleepHTML(line,s=>review?conditionalCount(s,state,dates):lineCount(s,boarding)):''}</small>${isTemporaryReplacement(line)?replacementHTML(line):''}<div class="service-track"><i style="width:${Math.max(2,100*count/max)}%"></i></div></div>`;}).join('');}
function geometryText(edge){if(inferredRailPath(edge))return'Inferred shortest railway path';if(replacementRailCorridor(edge))return'Temporary replacement · rail corridor';if(isTemporaryReplacement(edge))return /schematic|unresolved/.test(edge.geometryStatus||'')?'Approximate replacement-bus connection':'Replacement-bus route';if(inferredAlignment(edge))return'Inferred railway corridor';if(edge.geometryStatus==='train_ferry')return'Train carried by ferry · approximate crossing';if(/schematic/.test(edge.geometryStatus||''))return'Schematic alignment';if(/provider/.test(edge.geometryStatus||''))return'Provider geometry · unverified track';return'Retained railway alignment';}
function reviewedPolicyHTML(row){
  const ids=[...new Set(row.reviewedRuleIds||[])];
  if(!ids.length)return'';
  const rules=manifest?.reviewedInclusionRules||[],sources=manifest?.reviewedInclusionSources||[];
  return`<div class="reviewed-policy"><h4 class="detail-heading">MAP-REVIEWED GLOBAL PASS COVERAGE</h4><p class="helper">These services are separate from the canonical included rules. Review applies to ordinary second class in this dated snapshot.</p>${ids.map(id=>{const rule=rules.find(r=>r.id===id);if(!rule)return`<p class="detail-note">Review rule: ${esc(id)}</p>`;const links=(rule.evidence_source_ids||[]).map(key=>sources.find(source=>source.id===key)).filter(Boolean).filter(source=>/^https:\/\//.test(source.url||''));return`<div class="reviewed-rule"><strong>${esc(rule.reviewed_reservation||'Reservation conditions apply')}</strong><p>${esc((rule.reviewed_conditions||[]).join(' '))}</p>${rule.reviewed_supplement?`<p>${esc(rule.reviewed_supplement)}</p>`:''}<div class="evidence-links">${links.map((source,i)=>`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer" title="${esc(source.evidence_summary||'Primary source')}">Primary source ${i+1} ↗</a>`).join('')}</div><small>Rule ${esc(id)}</small></div>`;}).join('')}</div>`;
}
function renderSelected(){
  if(!selected)return;
  const edge=selected,detail=detailData.get(edge.id),a=station(edge.a),b=station(edge.b),pass=effectivePass(state),count=edgeCount(edge,state,dates),review=pass&&state.review?conditionalCount(edge,state,dates):0,reviewed=pass?reviewedCount(edge,state,dates):0,canonical=pass?sumDays(edge,state.day,dates,usesHubConnections(state)?'eurailBoardableDaily':'eurailDaily',usesHubConnections(state)?'eurailBoardableWeekly':'eurailWeekly'):0;
  const lines=detail?.lines||[],duration=detail?.durationMin,source=sourceById(edge.source),onlyReview=!count&&review>0,directions=edge._directionEdges||[edge];
  const alignmentHTML=lineInformation(edge,{uncertain:review>0}).map(note=>`<section class="line-explanation"><h4>${esc(note.title)}</h4><p>${esc(note.text)}</p></section>`).join('');
  const frequencyInfo=connectionFrequencyInformation(edge,{day:state.day,dates,detail}),frequencyHTML=usesHubConnections(state)?'':`<section class="frequency-explanation line-explanation"><h4>What this count includes</h4><p>${esc(frequencyInfo.scope)}</p>${frequencyInfo.boardingRestricted?`<p class="boarding-restriction">${esc(frequencyInfo.boardingNote)}</p>`:''}<button class="primary-button" id="compareDirectTrains">Compare through services →</button><p>Uses your selected sources, date and Eurail inclusion. Through services may have intermediate stops.</p></section>`;
  const directionHTML=directions.length>1?`<div class="direction-summary">${directions.map(e=>`<div><span>${esc(shortName(station(e.a)))} → ${esc(shortName(station(e.b)))}</span><strong>${fmt(edgeCount(e,state,dates)/selectedDayCount())} / day</strong></div>`).join('')}</div>`:'';
  const conditionFiltered=chargeFiltered(state),unknown=state.mode==='eurail'?sumDays(edge._passPolicy||{},state.day,dates,'unknownDaily'):0,feeUnknown=state.mode==='eurail'?sumDays(edge._passPolicy||{},state.day,dates,'chargeUnknownDaily'):0;
  const policyBreakdown=!conditionFiltered&&pass&&reviewed?`<p class="helper">${fmt(canonical/selectedDayCount())} / day canonical included · ${fmt(reviewed/selectedDayCount())} / day map-reviewed included</p>`:'';
  const calls=(detail?.directions||[]).filter(d=>d.calledFromStation||d.calledToStation).map(d=>`<div>${esc(d.calledFromStation||shortName(station(d.from)))} → ${esc(d.calledToStation||shortName(station(d.to)))}</div>`).join('');
  $('inspectorContent').innerHTML=`<p class="eyebrow">${usesHubConnections(state)?'EURAIL CITY CONNECTION':'RECORDED STATION PAIR'}</p><h3><button class="station-link" data-endpoint-station="${esc(a.id)}">${esc(shortName(a))}</button><span class="connection-arrow">${bothDirections(edge)?'↕':'↓'}</span><button class="station-link" data-endpoint-station="${esc(b.id)}">${esc(shortName(b))}</button></h3><p class="subline">${esc(edge.country||a.country||'Europe')} · ${esc(dateLabel(state.day,dates))}${Number.isFinite(duration)?' · '+fmt(duration)+' min median':''}</p>${alignmentHTML}${replacementHTML(edge)}<div class="detail-stat"><strong>${fmt((onlyReview?review:count)/selectedDayCount())}</strong><span>${onlyReview?'uncertain services / day · pass inclusion unconfirmed':(pass?'included scheduled services / day':'scheduled services / day')+' · '+directionLabel(edge)}</span></div>${conditionFiltered?'<p class="helper">Matching included services only · '+esc(chargeDescription(state))+'.</p>':policyBreakdown}${!conditionFiltered&&feeUnknown?'<p class="helper">'+fmt(feeUnknown/selectedDayCount())+' included services / day have unresolved fee rules and do not qualify as free.</p>':''}${weeklyChart(edge,pass,onlyReview?dates.map((_,i)=>conditionalCount(edge,{...state,day:'day-'+i},dates)):null)}${directionHTML}${frequencyHTML}<div id="segmentTrains"></div>${review>0?`<h4 class="detail-heading">UNCERTAIN PASS COVERAGE</h4><p class="helper">${fmt(review/selectedDayCount())} scheduled services / day have conditional or unknown pass eligibility. They are excluded from the included count. Known exclusions are not included in this overlay.${unknown?' '+fmt(unknown/selectedDayCount())+' / day have unknown inclusion; the remainder have conditional inclusion.':''}</p>`:''}<div class="detail-badges">${canonical?'<span class="badge pass">Canonical Eurail included</span>':!pass?'<span class="badge">All selected pass states</span>':''}${reviewed?'<span class="badge reviewed">Map-reviewed included</span>':''}${review?'<span class="badge conditional">Pass inclusion uncertain</span>':''}<span class="badge">${esc(geometryText(edge))}</span></div>${reviewed?reviewedPolicyHTML({...edge,reviewedRuleIds:[...new Set([...(edge.reviewedRuleIds||[]),...(detail?.reviewedRuleIds||[])])]}):''}${calls?'<div class="detail-data"><strong>Actual calls retained in this connection</strong>'+calls+'</div>':''}<div class="detail-data"><strong>Source</strong><br>${esc(source.name||edge.source)}${detail?.reservation?'<br><strong>Reservation status retained for the week</strong><br>'+esc(policyStatuses([detail],'reservation')):''}${detail?.supplement?'<br><strong>Supplement status retained for the week</strong><br>'+esc(policyStatuses([detail],'supplement')):''}${detail?.conditionalPickup?'<br>Includes '+fmt(detail.conditionalPickup)+' conditional/request boarding records.':''}</div><p class="detail-note">${usesHubConnections(state)?'Connectors represent the same recorded service calling in both city catchments; nearby terminals are not assumed interchangeable. Some calls can have boarding restrictions. ':''}Counts are scheduled source records, not ridership or verified actual operations. Counts retain the recorded direction; reverse directions are summed only when available within this source and geometry group. National feeds can overlap. ${pass?'Reservation, supplement and seat-availability conditions still apply.':''}</p>`;
  document.querySelectorAll('[data-endpoint-station]').forEach(button=>button.onclick=()=>pickStation(station(button.dataset.endpointStation),{inspect:true}));
  trainInspector.render(edge,edgeServiceErrors.has(edge.id));bindChart();
  $('compareDirectTrains')?.addEventListener('click',()=>{const pass=effectivePass(state);setStationField('from',a);setStationField('to',b);state.pass=pass;setMode('leg');});
}

function setStationField(field,s){state[field]=s.id;$(field==='from'?'fromStation':'toStation').value=s.name;if(!stationMapPoint(s))toast(s.name+': location unavailable; timetable calls are retained.');saveURL();}
function setupAutocomplete(field){
  const input=$(field==='from'?'fromStation':'toStation'),list=$(field==='from'?'fromSuggestions':'toSuggestions');let choices=[],active=-1,timer=0,sequence=0;
  function hide(){list.hidden=true;input.setAttribute('aria-expanded','false');active=-1;}
  function show(){choices=searchStations(searchList,input.value);list.replaceChildren();choices.forEach((s,i)=>{const item=document.createElement('li');item.id=field+'-option-'+i;item.setAttribute('role','option');item.innerHTML=esc(s.name)+'<small>'+esc([s.country,s.memberStationCount?'city catchment · multiple terminals':sourceName(s.source),!stationMapPoint(s)?'location unavailable · timetable retained':''].filter(Boolean).join(' · '))+'</small>';item.onmousedown=event=>{event.preventDefault();setStationField(field,s);hide();};list.appendChild(item);});list.hidden=!choices.length;input.setAttribute('aria-expanded',String(!!choices.length));active=-1;}
  async function search(){const ticket=++sequence;try{await ensureStations();if(ticket===sequence&&document.activeElement===input)show();}catch{if(ticket===sequence)toast('Station search could not load. Please retry.');}}
  input.oninput=()=>{state[field]='';choices=[];hide();clearTimeout(timer);timer=setTimeout(search,80);};input.onfocus=()=>{ensureStations().then(()=>{if(input.value.length>=2&&document.activeElement===input)show();}).catch(()=>{});};input.onblur=()=>setTimeout(hide,120);
  input.onkeydown=event=>{if(event.key==='Escape'){hide();return;}if(event.key==='ArrowDown'||event.key==='ArrowUp'){if(!choices.length)return;event.preventDefault();active=(active+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;[...list.children].forEach((x,i)=>{x.classList.toggle('active',i===active);x.setAttribute('aria-selected',String(i===active));});input.setAttribute('aria-activedescendant',field+'-option-'+active);}if(event.key==='Enter'&&choices.length&&!list.hidden){event.preventDefault();setStationField(field,choices[Math.max(0,active)]);hide();}};
}
function equivalentStationIds(s){const result=new Set([s.id]);if(hubMap.has(s.id)||s.memberStationCount){for(const item of stationList)if(item.hubId===s.id)result.add(item.id);return result;}for(const item of stationList){if(item.id===s.id)continue;const sameName=item._name===s._name,close=nearbyStationLocations(item,s);if(sameName&&close)result.add(item.id);}return result;}
async function compareStations(){const from=stationMap.get(state.from)||hubMap.get(state.from),to=stationMap.get(state.to)||hubMap.get(state.to);if(!from||!to){toast('Choose a departure and an arrival from the station suggestions.');return;}if(from.id===to.id){toast('Choose two different recorded stations.');return;}$('compareButton').disabled=true;$('legHelper').textContent='Reading the recorded calling patterns…';const ticket=++detailSequence;trainInspector.reset();clearTrainFocus(false);selectedStation=null;clearStationFocus();state.station='';document.body.classList.remove('station-inspector-open');try{const result=await findJourneyServices(from,to);if(ticket!==detailSequence)return;legResult=result;selected=null;state.edge='';showInspector();renderJourneyResult(result);const located=[from,to].filter(s=>validMapLocation(s.lon,s.lat));if(located.length)map.fitBounds(located.map(s=>[s.lat,s.lon]),{paddingTopLeft:[35,100],paddingBottomRight:[window.innerWidth>760?350:35,window.innerWidth>760?75:260],maxZoom:8});renderer.schedule();saveURL();}catch(error){toast('The journey data could not load. Please try again.');$('legHelper').textContent='The lookup failed; no service conclusion has been made.';console.warn('Rail Atlas journey lookup unavailable');}finally{$('compareButton').disabled=false;}}
async function findJourneyServices(from,to){await ensureManifest();const fromIds=equivalentStationIds(from),toIds=equivalentStationIds(to),countries=new Set([from.country,from.passCountry].filter(Boolean)),files=manifest.files?.journeysByCountry||[];let choices=Array.isArray(files)?files.filter(f=>countries.has(f.country)):Object.entries(files).filter(([k])=>countries.has(k)).map(([country,url])=>({country,url}));if(manifest.files.journeyLookup)choices=indexedJourneyFiles(await json(dataURL(manifest.files.journeyLookup)),fromIds,toIds);else if(!choices.length&&Array.isArray(files))choices=files.filter(f=>isItaly(from.country)&&isItaly(f.country));const {matches,loaded}=await dataLoader.findJourneys(choices.map(choice=>dataURL(choice.url)),fromIds,toIds);
    if(!choices.length||(!loaded&&edges.size)){const exact=[...edges.values()].filter(e=>fromIds.has(e.a)&&toIds.has(e.b)&&Array.isArray(e.boardableDaily));const lines=[];for(const edge of exact){const detail=await detailsFor(edge);for(const line of detail?.lines||[])lines.push({...line,source:edge.source});}return{from,to,journeys:[],fallbackEdges:exact,fallbackLines:lines,adjacentOnly:true};}return{from,to,journeys:matches,adjacentOnly:false};}
function renderJourneyResult(result){
  if(!result)return;
  const grouped=new Map(),operators=new Map(),active=[];let total=0,conditional=0,reviewed=0,replacementTotal=0;const daily=Array(7).fill(0),ruleIds=new Set();journeyHighlights.clear();
  for(const j of result.journeys){
    if(state.sources&&!state.sources.has(j.source))continue;
    if(j.agencyPrimary===false&&!state.alternatives&&!state.altSourceIds?.has(j.source))continue;
    const n=lineCount(j);if(!n)continue;active.push([j,n]);total+=n;if(isTemporaryReplacement(j))replacementTotal+=n;reviewed+=effectivePass(state)?reviewedCount(j,state,dates):0;
    if(j._match.conditional)conditional+=n;
    const key=JSON.stringify([j.source,j.operator,j.line,j.serviceMode||'rail']);
    if(!grouped.has(key))grouped.set(key,{label:j.line,name:j.lineName,operator:j.operator,source:j.source,serviceMode:j.serviceMode,replacement:j.replacement,daily:Array(7).fill(0),eurailDaily:Array(7).fill(0),reviewedEurailDaily:Array(7).fill(0),publicTrains:[],sleepServices:[]});
    const g=grouped.get(key);
    for(let i=0;i<7;i++){g.daily[i]+=Number(j.daily?.[i])||0;g.eurailDaily[i]+=Number(j.eurailDaily?.[i])||0;g.reviewedEurailDaily[i]+=Number(j.reviewedEurailDaily?.[i])||0;daily[i]+=effectivePass(state)?(Number(j.eurailDaily?.[i])||0)+(Number(j.reviewedEurailDaily?.[i])||0):Number(j.daily?.[i])||0;}
    g.publicTrains.push(...(j.publicTrains||[]));
    g.sleepServices=mergeSleepServices(g.sleepServices,j.sleepServices);
    for(const id of j.reviewedRuleIds||[])ruleIds.add(id);
    for(const id of(j.edgeIds||[]).slice(j._match.from,j._match.to))if(id)journeyHighlights.add(id);
    const operator=j.operator||'Recorded operator',operatorKey=JSON.stringify([j.source,operator]);const previous=operators.get(operatorKey);operators.set(operatorKey,{name:operator,source:j.source,count:(previous?.count||0)+n});
  }
  if(result.adjacentOnly){
    for(const e of result.fallbackEdges){if(!serviceVisible(e,state))continue;if(state.sources&&!state.sources.has(e.source))continue;if(e.primary===false&&!state.alternatives&&!state.altSourceIds?.has(e.source))continue;const n=lineCount(e,true);total+=n;if(isTemporaryReplacement(e))replacementTotal+=n;journeyHighlights.add(e.id);for(let i=0;i<7;i++)daily[i]+=effectivePass(state)?(Number(e.eurailBoardableDaily?.[i])||0)+(Number(e.reviewedEurailBoardableDaily?.[i])||0):Number(e.boardableDaily?.[i])||0;}
    for(const l of result.fallbackLines)if(serviceVisible(l,state)&&(!state.sources||state.sources.has(l.source)))grouped.set((l.source||'')+':'+l.label+':'+l.operator,l);
  }
  const lines=[...grouped.values()],sorted=lines.map(l=>[l,lineCount(l)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]),topOperator=[...operators.values()].sort((a,b)=>b.count-a.count)[0],example=active.sort((a,b)=>b[1]-a[1])[0]?.[0];
  let callingPattern='';if(example){const calls=example.stops.slice(example._match.from,example._match.to+1).map(call=>station(Array.isArray(call)?call[0]:call.id)).map(s=>s.name);const kept=calls.length>10?[...calls.slice(0,5),'… '+(calls.length-10)+' intermediate calls …',...calls.slice(-5)]:calls;callingPattern=`<h4 class="detail-heading">ONE RECORDED STOPPING PATTERN</h4><ol class="calling-pattern">${kept.map(name=>`<li>${esc(name)}</li>`).join('')}</ol>`;}
  $('legHelper').textContent=result.adjacentOnly?'This lookup covers consecutive recorded station calls only.':'A through service calls at both stations; intermediate stops are allowed. Any required vehicle change remains separate.';
  $('inspectorContent').innerHTML=`<p class="eyebrow">${result.adjacentOnly?'CONSECUTIVE CALL COMPARISON':'SAME-SERVICE JOURNEY COMPARISON'}</p><h3>${esc(shortName(result.from))}<span class="connection-arrow">↓</span>${esc(shortName(result.to))}</h3><p class="subline">${esc(dateLabel(state.day,dates))} · ${effectivePass(state)?'Eurail-included services':'selected timetable sources'}</p>${total?`<div class="detail-stat"><strong>${fmt(total/selectedDayCount())}</strong><span>recorded through services / day</span></div>${serviceBreakdownHTML({trains:total-replacementTotal,replacements:replacementTotal},selectedDayCount())}${weeklyChart({daily,eurailDaily:daily,reviewedEurailDaily:[]})}<h4 class="detail-heading">MOST SCHEDULED OPERATOR / SERVICE</h4>${topOperator?`<div class="leading-product"><strong>${esc(topOperator.name)}</strong><span>${fmt(topOperator.count/selectedDayCount())} / day · ${esc(sourceName(topOperator.source))}</span></div>`:sorted[0]?`<div class="leading-product"><strong>${esc(sorted[0][0].operator||sorted[0][0].label||'Recorded service')}</strong></div>`:''}${serviceRows(lines,result.adjacentOnly)}${callingPattern}${[result.from,result.to].some(s=>!validMapLocation(s.lon,s.lat))||active.some(([journey])=>journey.unmappedCallIndices?.some(i=>i>=journey._match.from&&i<=journey._match.to))?'<p class="detail-note">A station location is unavailable in the source. Its timetable is retained, but connections using that missing location are not drawn on the map.</p>':''}`:`<div class="empty-state"><strong>No matching service in this selection.</strong>Try another source, date or station record. This result does not establish that the journey is unavailable.${result.adjacentOnly?' This data slice covers consecutive calls, not every through journey.':''}</div>`}<div class="detail-badges">${effectivePass(state)&&total-reviewed?'<span class="badge pass">Canonical Eurail included</span>':''}${reviewed?'<span class="badge reviewed">Map-reviewed included</span>':''}<span class="badge">${result.adjacentOnly?'Consecutive recorded calls':'Same recorded service'}</span>${conditional?'<span class="badge conditional">Request/conditional boarding included</span>':''}</div>${reviewed?reviewedPolicyHTML({reviewedRuleIds:[...ruleIds]}):''}<p class="detail-note">Station identities and counts remain source-specific. Equivalent spelling and close coordinates are lookup candidates, not an authoritative station merger. Overlapping feeds can repeat the same train. Boarding rules are taken from each feed and can disagree; confirm ticket conditions with the operator. No real-time running or pass-holder seat availability is inferred.</p>`;
  bindChart();renderer.schedule();status(total?fmt(total)+' scheduled services match this leg.':'No matching service in the selected data.');
}

function setupEvents(){setupMapControls();setupLegend();stationSearch=setupStationSearch({getStations:()=>stationList,getState:()=>state,ensureStations,sourceName,onPick:s=>pickStation(s,{inspect:true,center:true}),onOpen:()=>setControlsOpen(false)});$('showStations').onchange=event=>{state.stations=event.target.checked;renderHubs();refresh({details:false});};$('emptySourceSelection')?.addEventListener('click',()=>chooseSources(false));document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>setDay(b.dataset.day));$('showHubs').onchange=event=>{state.hubs=event.target.checked;if(state.hubs)loadHubCities();refresh({details:false});};
$('showTrains').onchange=event=>{state.trains=event.target.checked;layersChanged();};$('showReplacements').onchange=event=>{state.replacements=event.target.checked;layersChanged();};
document.querySelectorAll('[data-service-only]').forEach(button=>button.onclick=()=>{state.trains=button.dataset.serviceOnly==='trains';state.replacements=button.dataset.serviceOnly==='replacements';layersChanged();});
document.querySelectorAll('[data-service-preset]').forEach(button=>button.onclick=()=>{state.trains=state.replacements=button.dataset.servicePreset==='all';layersChanged();});
document.querySelector('[data-context-only]').onclick=()=>{state.trains=false;state.replacements=false;state.closedCorridors=true;state.physicalRailways=false;layersChanged();};
$('showPhysicalRailways').onchange=event=>{state.physicalRailways=event.target.checked;refresh();};
document.querySelectorAll('[data-context-preset]').forEach(button=>button.onclick=()=>{const enabled=button.dataset.contextPreset==='all';state.closedCorridors=enabled;state.physicalRailways=enabled;state.hubs=enabled;state.stations=enabled;if(enabled)loadHubCities();refresh();});
$('hideMapOverlays').onclick=()=>{closeInspector();state.trains=false;state.replacements=false;state.closedCorridors=false;state.physicalRailways=false;state.hubs=false;state.stations=false;layersChanged();};
$('fitReplacementSections').onclick=()=>ensureManifest().then(()=>{if(!serviceContext.fitAll())toast('No affected railway sections are recorded for these dates.');}).catch(()=>toast('Recorded notices could not load. Please retry.'));
$('findReplacementServices').onclick=()=>ensureManifest().then(async()=>{await loadCompleteNetwork({forRoute:true});const bounds=currentEdges().filter(edge=>isTemporaryReplacement(edge)&&qualifiesEdge(edge,state,dates,stationMap)).flatMap(edge=>edge.coords.map(([lon,lat])=>[lat,lon]));if(bounds.length)map.fitBounds(bounds,{...mapFramePadding(),maxZoom:10});else toast('No recorded replacement buses match these filters.');}).catch(()=>toast('Replacement services could not load. Please retry.'));
$('eurailOnly').onchange=event=>{state.pass=event.target.checked;refresh();};
$('feePreset').onchange=event=>{feeCustom=event.target.value==='custom';if(!feeCustom){state.charge=event.target.value;state.chargeMatch='any';}refresh();ensurePassPolicies().catch(()=>{});};
document.querySelectorAll('[data-charge]').forEach(input=>input.onchange=updateCharges);$('chargeMatch').onchange=updateCharges;
document.querySelectorAll('[data-charge-preset]').forEach(button=>button.onclick=()=>{feeCustom=true;state.charge=button.dataset.chargePreset;state.chargeMatch='any';refresh();ensurePassPolicies().catch(()=>{});});
$('showIncluded').onchange=event=>{state.included=event.target.checked;refresh();};$('showReview').onchange=event=>{state.review=event.target.checked;refresh();};
$('showInferred').onchange=event=>{state.inferred=event.target.checked;refresh();};$('showAligned').onchange=event=>{state.aligned=event.target.checked;refresh();};$('showSchematic').onchange=event=>{state.schematic=event.target.checked;refresh();};
document.querySelectorAll('[data-geometry-preset]').forEach(button=>button.onclick=()=>{state.aligned=button.dataset.geometryPreset==='all';state.inferred=['all','inferred'].includes(button.dataset.geometryPreset);state.schematic=['all','approximate'].includes(button.dataset.geometryPreset);refresh();});
$('minFrequency').oninput=event=>{const previous=threshold(state.min);state.min=Number(event.target.value);$('frequencyValue').textContent=state.min?threshold(state.min)+' / day':'Any';if(previous!==threshold(state.min))renderer.previewThreshold();operatingTransfers.refresh();clearTimeout(filterSaveTimer);filterSaveTimer=setTimeout(()=>{saveURL();updateFilterSummary();},180);};$('minFrequency').onchange=()=>{clearTimeout(filterSaveTimer);refresh();};$('resetFilters').onclick=()=>{state.day='all';state.pass=false;state.stations=true;state.min=0;state.hubs=true;state.schematic=true;state.aligned=true;state.inferred=true;state.trains=true;state.replacements=true;feeCustom=false;state.closedCorridors=true;state.physicalRailways=false;state.included=true;state.review=false;state.charge='all';state.chargeMatch='any';chooseSources(false);scheduleChunks();ensurePassPolicies().catch(()=>{});toast('Recommended sources and default filters restored.');};$('recommendedSources').onclick=()=>chooseSources(false);$('allSources').onclick=()=>chooseSources(true);$('closeInspector').onclick=closeInspector;$('methodButton').onclick=method;$('closeMethod').onclick=closeMethod;$('backToMap').onclick=closeMethod;$('methodDialog').onclick=event=>{if(event.target===$('methodDialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeMethod();}};document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('methodDialog').open){if(!trainInspector.back())closeInspector();}});$('retryButton').onclick=boot;$('compareButton').onclick=compareStations;$('swapStations').onclick=()=>{const from=state.from;state.from=state.to;state.to=from;$('fromStation').value=state.from?station(state.from).name:'';$('toStation').value=state.to?station(state.to).name:'';saveURL();};$('shareButton').onclick=async()=>{saveURL();try{await navigator.clipboard.writeText(location.href);toast('View link copied. Site access is unchanged.');}catch(error){const input=document.createElement('input');input.value=location.href;document.body.appendChild(input);input.select();const copied=document.execCommand('copy');input.remove();toast(copied?'View link copied. Site access is unchanged.':'The current view link is ready in your address bar.');}};setupAutocomplete('from');setupAutocomplete('to');}
function updateMethod(){
  if(!manifest)return;
  document.getElementById('generatedMethods')?.remove();const extra=document.createElement('div');extra.id='generatedMethods';
  const p=document.createElement('p');p.textContent=`This release retains ${fmt(manifest.sources?.length||0)} timetable sources. ${manifest.methodology?.summary||''}`;extra.appendChild(p);
  if(typeof manifest.attribution?.countryEvidence==='string'&&manifest.attribution.countryEvidence.trim()){
    const section=document.createElement('section');section.id='countryEvidence';const heading=document.createElement('h3');heading.className='detail-heading';heading.textContent='COUNTRY EVIDENCE';section.appendChild(heading);
    const attribution=document.createElement('p');attribution.textContent=manifest.attribution.countryEvidence;section.appendChild(attribution);
    const note=document.createElement('p');note.textContent='Stations with unresolved close-border evidence keep uncertainty flags. Pass coverage is checked separately for the operator, product and journey segment.';section.appendChild(note);
    const reference=manifest.provenance?.countryReference,links=document.createElement('div');links.className='evidence-links';
    for(const[field,label]of[['source_url','Country-reference source ↗'],['licence_url','Reference terms ↗']]){try{if(typeof reference?.[field]!=='string')continue;const url=new URL(reference[field]);if(url.protocol!=='https:'&&url.protocol!=='http:')continue;const link=document.createElement('a');link.href=url.href;link.textContent=label;link.target='_blank';link.rel='noopener noreferrer';links.appendChild(link);}catch{}}
    if(links.childElementCount)section.appendChild(links);extra.appendChild(section);
  }
  const borderReference=manifest.provenance?.borderPolicyReference;
  if(borderReference&&Array.isArray(borderReference.sources)){
    const entries=[];for(const source of borderReference.sources){try{if(typeof source?.url!=='string')continue;const url=new URL(source.url);if(url.protocol==='https:')entries.push({source,url:url.href});}catch{}}
    if(entries.length){const details=document.createElement('details');details.id='borderPolicyEvidence';details.className='method-sources';const summary=document.createElement('summary');summary.textContent='Cross-border pass evidence ('+entries.length+' sources)';details.appendChild(summary);
      if(typeof borderReference.scope==='string'){const scope=document.createElement('p');scope.textContent=borderReference.scope;details.appendChild(scope);}
      const validity=borderReference.dates;if(validity){const dateParagraph=document.createElement('p'),serviceDates=Array.isArray(validity.serviceDates)?validity.serviceDates:[];dateParagraph.textContent='Evidence window: '+String(validity.validFrom||'unspecified')+' to '+String(validity.validThrough||'unspecified')+(serviceDates.length?'. Materialized service dates: '+String(serviceDates[0])+' to '+String(serviceDates.at(-1)):'')+'.';details.appendChild(dateParagraph);}
      for(const{source,url}of entries){const row=document.createElement('p'),link=document.createElement('a');link.href=url;link.textContent=[source.publisher,source.id].filter(value=>typeof value==='string').join(' · ')||'Primary source';link.target='_blank';link.rel='noopener noreferrer';row.appendChild(link);if(typeof source.evidence_summary==='string'){const text=document.createElement('span');text.textContent=' · '+source.evidence_summary;row.appendChild(text);}details.appendChild(row);}extra.appendChild(details);
    }
  }
  if(Array.isArray(manifest.methodology))for(const note of manifest.methodology){const paragraph=document.createElement('p');paragraph.textContent=typeof note==='string'?note:note.text||JSON.stringify(note);extra.appendChild(paragraph);}
  if(manifest.publication?.audience==='public'){
    const section=document.createElement('section');section.id='publicCoverage';const heading=document.createElement('h3');heading.className='detail-heading';heading.textContent='PUBLIC EDITION';section.appendChild(heading);
    const published=document.createElement('p');published.textContent='Analysis published by '+(manifest.publication.publisher||'gravelcycles')+' · built '+String(manifest.createdAt||dates[0]).slice(0,10)+'.';section.appendChild(published);
    const coverage=document.createElement('p'),omitted=manifest.publication.omittedSources?.length||manifest.publication.blockedSourceIds?.length||0;coverage.textContent=`This public edition retains ${fmt(manifest.sources.length)} timetable sources for ${dates[0]} to ${dates.at(-1)}. Coverage is partial.`+(omitted?` ${fmt(omitted)} other source feeds are omitted because public redistribution terms have not been established.`:'');section.appendChild(coverage);
    if(manifest.files.sourceRegister){const link=document.createElement('a');link.href=dataURL(manifest.files.sourceRegister);link.textContent='Download source, licence and omission register ↗';link.download='rail-atlas-source-register.json.gz';section.appendChild(link);}extra.appendChild(section);
  }
  const sourceList=document.createElement('details');sourceList.className='method-sources';const summary=document.createElement('summary');summary.textContent='Source attribution and retained terms ('+manifest.sources.length+')';sourceList.appendChild(summary);
  for(const source of manifest.sources){const row=document.createElement('p'),link=document.createElement(/^https:\/\//.test(source.sourcePage||'')?'a':'strong');link.textContent=source.name||source.id;if(link.tagName==='A'){link.href=source.sourcePage;link.target='_blank';link.rel='noopener noreferrer';}row.appendChild(link);const text=document.createElement('span');text.textContent=' · '+[source.country,source.publicationRights?.attribution||source.attribution||source.publisher,source.licence].filter(Boolean).join(' · ');row.appendChild(text);const licenceURL=source.publicationRights?.licenceUrl||source.licenceUrl;try{const url=new URL(licenceURL);if(url.protocol==='https:'){const terms=document.createElement('a');terms.href=url.href;terms.textContent=' · Licence terms ↗';terms.target='_blank';terms.rel='noopener noreferrer';row.appendChild(terms);}}catch{}for(const record of source.publicationRights?.attributionRecords||[]){if(typeof record.organization_name!=='string')continue;row.appendChild(document.createElement('br'));let credit=document.createElement('span');credit.textContent=record.organization_name;try{const url=new URL(record.attribution_url);if(url.protocol==='https:'||url.protocol==='http:'){credit=document.createElement('a');credit.href=url.href;credit.textContent=record.organization_name;credit.target='_blank';credit.rel='noopener noreferrer';}}catch{}row.appendChild(credit);}if(source.scopeNote){const note=document.createElement('small');note.textContent=source.scopeNote;row.appendChild(document.createElement('br'));row.appendChild(note);}sourceList.appendChild(row);}
  extra.appendChild(sourceList);$('methodContent').appendChild(extra);$('methodRelease').textContent=manifest.releaseId||manifest.release_id||'Service dates 1–7 November 2026';
}

async function boot(){
  if(booting)return;booting=true;$('mapError').hidden=true;$('mapLoading').hidden=false;
  try{
    const embedded=$('atlasBootstrap');manifest=embedded?JSON.parse(embedded.textContent):await json(manifestURL.href,{fresh:true});
    if(manifest.schemaVersion!==1||!manifest.files?.overview||!Array.isArray(manifest.dates)||manifest.dates.length!==7)throw new Error('Unsupported atlas data manifest');
    if(manifest._bootstrap&&needsSourceRefresh(manifest.sources,state.sources))await ensureManifest();
    dates=manifest.dates;reconcileSources();setupDates();setupSources();applyControls();coverage.refresh();
    if(map.getContainer().dataset.basemap==='fallback')loadCountryFallback();
    const overview=window.atlasDisplayPromise&&manifest.files.displayOverview?await dataLoader.decode(await window.atlasDisplayPromise):await json(dataURL(manifest.files.displayOverview||manifest.files.overview));if(overview.edges?.[0]?._displayOnly){displayPairs=overview.edges;edgeVersion++;}else await addEdges(overview.edges||overview);
    if(state.mode==='italy'){if(manifest.files.italyNetwork)await loadItalyNetwork().catch(()=>{});else await ensureStations();}
    $('mapLoading').hidden=true;renderer.schedule();ensurePassPolicies().catch(()=>{});
    if(!manifest.files.displayOverview||state.mode==='leg')loadBootstrapStations().then(async()=>{if(state.mode==='leg'){await ensureStations();if((stationMap.has(state.from)||hubMap.has(state.from))&&(stationMap.has(state.to)||hubMap.has(state.to)))compareStations();}}).catch(()=>toast('Station search could not load. Reload to retry.'));
    if(usesHubConnections(state)||state.mode==='leg')loadHubs();else if(state.hubs)loadHubCities();scheduleChunks();
    if(state.edge&&findDisplayedEdge(state.edge))pickEdge(findDisplayedEdge(state.edge),false);
    if(state.station){const id=state.station;ensureStations().then(()=>{if(state.station!==id||selected||selectedStation)return;const s=stationMap.get(id);if(s)pickStation(s,{inspect:true,center:!state.center,restore:!!state.center});else toast('This station is unavailable in the current release.');}).catch(()=>toast('Station details could not load. Please retry search.'));}
    status(manifest.files.displayNetwork?'Atlas ready. Loading the complete network at every zoom.':'Atlas loaded. Zoom in for local lines.');
  }catch(error){$('mapLoading').hidden=true;$('mapError').hidden=false;console.error('Rail Atlas data load failed:',error.message);}
  finally{booting=false;saveURL();}
}

initMap();setupEvents();applyControls();boot();
