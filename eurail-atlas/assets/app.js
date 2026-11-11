import{detailLoadingPolicy,boundedDetailQueue}from'./detail-loading.js?v=cec8b75fa8c21f7e';
import{MODES,PASS_MODES,EUROPE_BOUNDS,ITALY_BOUNDS,normalize,escapeHTML as esc,selectedDays,sumDays,effectivePass,usesHubConnections,qualifiesEdge,edgeCount,perDay,threshold,readState,serializeState,formatNumber as fmt,dateLabel,searchStations,publicTrainLabels,journeyPublicTrainLines,prepareEdge,isItaly,aggregateMapPairs,MapPairIndex,indexedJourneyFiles,reviewedCount,conditionalCount,validMapLocation,stationMapPoint,CHARGE_BITS,edgeMetrics,normalizeCharge,chargeFiltered,chargeDescription,serviceVisible,isTemporaryReplacement,inferredRailPath,inferredAlignment,stationDisplayMode}from'./atlas-core.js?v=cec8b75fa8c21f7e';
import{lineInformation,connectionFrequencyInformation}from'./line-information.js?v=cec8b75fa8c21f7e';
import{replacementHTML,serviceBreakdownHTML,replacementRailCorridor}from'./replacement-service.js?v=cec8b75fa8c21f7e';
import{needsSourceRefresh,reconcileSourceSelection,sameManifestAsset}from'./source-selection.js?v=cec8b75fa8c21f7e';
import{decodePassPolicies,createPassPolicyAttacher}from'./pass-policies.js?v=cec8b75fa8c21f7e';
import{decodeThroughServices}from'./through-services.js?v=cec8b75fa8c21f7e';
import{decodeContinuationGeometry,createContinuationEdgeMerger,stationWithContinuationSources,continuationAvailabilityNote,deduplicateContinuationAvailability,continuationMetrics,continuationPolicyText}from'./through-continuations.js?v=cec8b75fa8c21f7e';
import{RailRenderer}from'./map-renderer.js?v=cec8b75fa8c21f7e';
import{resolveAssetURL}from'./data-codec.js?v=cec8b75fa8c21f7e';
import{startupManifestURL,usableManifest,createManifestPartLoader}from'./manifest-parts.js?v=cec8b75fa8c21f7e';
import{AtlasDataLoader,createPageHydrator}from'./data-loader.js?v=cec8b75fa8c21f7e';
import{setupViewportRefresh}from'./viewport-refresh.js?v=cec8b75fa8c21f7e';
import{installSmoothWheelZoom}from'./wheel-zoom.js?v=cec8b75fa8c21f7e';
import{setupCoverage}from'./coverage-panel.js?v=cec8b75fa8c21f7e';
import{createCompletePairMerger}from'./network-view.js?v=cec8b75fa8c21f7e';
import{setupServiceContext}from'./service-context.js?v=cec8b75fa8c21f7e';
import{setupInfrastructureContext}from'./infrastructure-context.js?v=cec8b75fa8c21f7e';
import{setupOperatingTransfers}from'./operating-transfers.js?v=cec8b75fa8c21f7e';
import{setupBorderLinks}from'./border-links.js?v=cec8b75fa8c21f7e';
import{mergeSleepServices,serviceSleepHTML,publicTrainSleepNote}from'./sleep-service.js?v=cec8b75fa8c21f7e';
import{setupTrainInspector}from'./train-inspector.js?v=cec8b75fa8c21f7e';
import{createSupplementalAvailabilityLoader}from'./supplemental-availability.js?v=cec8b75fa8c21f7e';
import{routeFocusIds,callId,passengerCall,groupStationRoutes,journeyDaily,filteredServiceMetadata,routeStationFocus}from'./train-services.js?v=cec8b75fa8c21f7e';
import{matchesFocus}from'./route-focus.js?v=cec8b75fa8c21f7e';
import{setupStationSearch,nearbyStationRecords}from'./station-search.js?v=cec8b75fa8c21f7e';
import{cityAreaOptions,cityAreaRadius,cityAreaBounds,cityAreaStationIds}from'./city-areas.js?v=cec8b75fa8c21f7e';
import{StationMarkers,stationZoomForViewport}from'./station-markers.js?v=cec8b75fa8c21f7e';
import{mainHubStations}from'./hub-stations.js?v=cec8b75fa8c21f7e';
import{StationCatalog,stationMemberIds,stationSources,stationSourceSelected,stationSourceLabel,stationBoardingAreas}from'./station-identity.js?v=cec8b75fa8c21f7e';
import{createReviewedStationPositionLoader}from'./reviewed-station-positions.js?v=cec8b75fa8c21f7e';
import{isPhysicalSection,decodePhysicalHeat,applyPhysicalSourceAvailability,supportingConnectionMatches,supportingMapPairId,physicalDetailsPath,physicalSectionDetails}from'./physical-heat.js?v=cec8b75fa8c21f7e';
import{physicalSectionInformation,physicalSectionChart,physicalSectionLocation}from'./physical-heat-inspector.js?v=cec8b75fa8c21f7e';
import{applyProjectScope,stationInScope,edgeInScope}from'./project-scope.js?v=cec8b75fa8c21f7e';
import{countryMatches,countryEdge,countryBounds,countryContextBounds,cityConnectionEdges}from'./explorer-core.js?v=cec8b75fa8c21f7e';
import{setupMobileSheets,MOBILE_LAYOUT}from'./mobile-sheets.js?v=cec8b75fa8c21f7e';
import{createCityHubsLoader}from'./city-hubs-loader.js?v=cec8b75fa8c21f7e';
import{setupFrequencyFilter}from'./frequency-filter.js?v=cec8b75fa8c21f7e';
import{createNativePublicNumberLoader,nativePublicTrainLabels}from'./native-public-numbers.js?v=cec8b75fa8c21f7e';

const stationCatalog=new StationCatalog();
const $=id=>document.getElementById(id),state=readState(location.search),cache=new Map(),edges=new Map(),stationMap=stationCatalog.sourceStations,chunkLoaded=new Set(),detailData=new Map(),hubMap=new Map();
// Independent bus services live on assets/buses.html; trains retain their own layers.
const busEnabled=false,busLayer=null,busPicked=false;let lastSummaryVisible=0;
const scheduleBusControlLayout=()=>{},setBusEnabled=()=>{},busViewURL=url=>url;
let manifest=null,dates=['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07'],stationList=[],hubEdges=[],hubCities=[],selected=null,map,renderer,markers,baseLayer,chunkTimer=0,toastTimer=0,detailSequence=0,legResult=null,booting=false,edgeVersion=0,hubVersion=0,pairVersion=-1,hubPairVersion=-1,pairEdges=[],hubPairEdges=[],journeyHighlights=new Set(),stationLoadPromise=null,bootstrapStationPromise=null,fullStationsLoaded=false,hubLoadPromise=null,searchList=[],chunkRun=0;
let feeCustom=state.charge!=='all'&&state.charge!=='free';
const mapPairIndex=new MapPairIndex(),dataLoader=new AtlasDataLoader(),chunkRequests=new Map(),pauseWork=()=>globalThis.scheduler?.yield?globalThis.scheduler.yield():new Promise(resolve=>setTimeout(resolve,0));
const mergeCompletePairs=createCompletePairMerger();
let chunkPaintTimer=0;
let selectedStation=null,stationMarkers=null,stationMarkerLoad=null,stationSearch=null,stationFocus=null,stationFocusGeneration=0;
let mobileSheets=null,cityDocument=null,cityEdges=[],cityEdgesKey='',countryPairs=[],countryPairsKey='',countrySummaryKey='';
let countryContextPromise=null,countryChoiceSequence=0,countryPickerSequence=0;
let countryViewportCleanup=null,countryContextStationPromise=null;
if(matchMedia(MOBILE_LAYOUT).matches&&!new URLSearchParams(location.search).has('key'))state.legend=false;
const stationErrors=new Set();
let italyNetworkPromise=null;
let displayPairs=[],overviewMetadataPromise=null,fullManifestPromise=null,hubCitiesPromise=null,filterSaveTimer=0;
let completeNetworkPromise=null,completeNetworkLoaded=false,completeNetworkGeneration=0;
let passPolicies=null,passPoliciesPromise=null,passPoliciesFailed=false;
let throughServices=null,throughServicesPromise=null;
let continuationEdges=[],continuationGeometryPromise=null,continuationGeometryAsset=null;
const mergeContinuationEdges=createContinuationEdgeMerger(),continuationStationSources=new Map();
const reviewedStationPositions=createReviewedStationPositionLoader({getDescriptor:()=>manifest?.files?.reviewedGeometrySupport?dataURL(manifest.files.reviewedGeometrySupport):null,load:path=>json(path),catalog:stationCatalog,onChange:()=>{stationList=stationCatalog.values();searchList=[...hubCities,...stationList];countryPairsKey='';renderHubs();renderer?.schedule();}});
async function ensureContinuationGeometry(){
  await ensureManifest();const positions=reviewedStationPositions.load().catch(()=>null),logical=manifest?.files?.throughContinuationGeometry;if(!logical)return positions;
  const asset=dataURL(logical);if(continuationGeometryAsset===asset)return positions;
  if(!continuationGeometryPromise)continuationGeometryPromise=(async()=>{
    const document=decodeContinuationGeometry(await json(asset),dates);
    for(const station of[...document.stations,...(document.canonicalStations||[])])if(station.logicalAvailabilitySources?.length){const known=continuationStationSources.get(station.id)||new Set();for(const source of station.logicalAvailabilitySources)known.add(source);continuationStationSources.set(station.id,known);}
    if(document.stations.length)await mergeStations(document,{paint:false});
    continuationEdges=document.edges.map(prepareEdge).filter(Boolean);continuationGeometryAsset=asset;
    renderer?.schedule();
    if(state.edge&&!selected){const edge=findDisplayedEdge(state.edge);if(edge)pickEdge(edge,false);}
  })().catch(error=>{continuationGeometryPromise=null;throw error;});
  return Promise.all([continuationGeometryPromise,positions]).then(([result])=>result);
}
const throughDisplayMetrics=new Map();
function rememberThroughDisplay(rows){let changed=false;for(const edge of rows||[])if(edge._throughServices&&throughDisplayMetrics.get(edge.id)!==edge._throughServices){throughDisplayMetrics.set(edge.id,edge._throughServices);changed=true;}if(changed)resetPassPolicyAttachments();}
const physicalDetailStates=new Map();
let physicalHeatDocument=null,physicalHeatEdges=[],physicalHeatPromise=null,physicalHeatError=null,physicalHeatGeneration=0;
const policyAttacher=createPassPolicyAttacher(),attachPassPolicy=policyAttacher.attach;
function resetPassPolicyAttachments(){policyAttacher.update(throughServices,passPolicies,throughDisplayMetrics);}
resetPassPolicyAttachments();
async function ensureThroughServices(){
  if(throughServices)return throughServices;
  if(!throughServicesPromise)throughServicesPromise=(async()=>{
    await ensureManifest();if(!manifest.files.throughServices)return null;
    throughServices=decodeThroughServices(await json(dataURL(manifest.files.throughServices)),dates);
    resetPassPolicyAttachments();
    edgeVersion++;pairVersion=-1;hubPairVersion=-1;if(selected&&!isPhysicalSection(selected))selected=attachPassPolicy(selected);
    return throughServices;
  })().catch(error=>{throughServicesPromise=null;throw error;});
  return throughServicesPromise;
}
async function ensurePassPolicies(){
  if(state.mode!=='eurail'||!hasServices())return;
  if(manifest?.files?.throughServices){if(chargeFiltered(state)){try{await ensureThroughServices();passPoliciesFailed=false;refresh();}catch(error){passPoliciesFailed=true;applyControls();toast('Pass conditions could not load. Re-select the filter to retry.');throw error;}}return;}
  if(!passPoliciesPromise)passPoliciesPromise=(async()=>{await ensureManifest();if(!manifest.files.passPolicies)throw new Error('Pass conditions unavailable');passPolicies=decodePassPolicies(await json(dataURL(manifest.files.passPolicies)));resetPassPolicyAttachments();passPoliciesFailed=false;edgeVersion++;pairVersion=-1;if(selected)selected=attachPassPolicy(selected);refresh();})().catch(error=>{passPoliciesPromise=null;passPoliciesFailed=true;applyControls();toast('Pass conditions could not load. Re-select the filter to retry.');throw error;});
  return passPoliciesPromise;
}
const hydratedNetworkPairs=new Set();
const edgePublicNumbers=new Map(),publicNumberRequests=new Map();
let inspectorLookupController=null;
function cancelInspectorLookup(){inspectorLookupController?.abort();inspectorLookupController=null;}
function beginInspectorLookup(){cancelInspectorLookup();inspectorLookupController=new AbortController();return inspectorLookupController.signal;}
function sharedPublicNumberRequest(id,signal,load){
  const known=publicNumberRequests.get(id);if(known&&!known.signal?.aborted)return known.promise;
  const request={signal,promise:null};request.promise=load().finally(()=>{if(publicNumberRequests.get(id)===request)publicNumberRequests.delete(id);});
  publicNumberRequests.set(id,request);return request.promise;
}
const edgeServiceErrors=new Set();
let trainFocus=null,trainFocusGroup=null,trainFocusView=null,trainFocusGeneration=0;
const coverage=setupCoverage({getManifest:()=>manifest,getState:()=>state,getView:()=>map?{bounds:[map.getBounds().getWest(),map.getBounds().getSouth(),map.getBounds().getEast(),map.getBounds().getNorth()]}:null,load:path=>json(dataURL(path)),onShowSources:ids=>{state.sources=new Set([...(state.sources||[]),...ids]);alternativeSources();setupSources();refresh();}});
const serviceContext=setupServiceContext({getManifest:()=>manifest,getState:()=>state,getDates:()=>dates,getStations:()=>stationList,getMap:()=>map,onChange:()=>refresh({details:false}),onOpen:()=>openContextPanel('serviceContextPanel'),getView:()=>map?{zoom:map.getZoom(),bounds:[map.getBounds().getWest(),map.getBounds().getSouth(),map.getBounds().getEast(),map.getBounds().getNorth()]}:null,load:path=>json(dataURL(path))});
const supplementalAvailabilityLoader=createSupplementalAvailabilityLoader({getDescriptor:()=>manifest?.files?.supplementalAvailability?dataURL(manifest.files.supplementalAvailability):null,getDates:()=>dates,load:(url,options)=>dataLoader.load(url,options)});
const trainInspector=setupTrainInspector({getNumberMetadataStatus:()=>nativeNumberLoader.status,onRetryNumberMetadata:()=>ensureNativePublicNumbers({retry:true}),getSupplementalKey:()=>manifest?.files?.supplementalAvailability||null,loadSupplementalAvailability:options=>supplementalAvailabilityLoader.load(options),getState:()=>state,getDates:()=>dates,getJourneys:id=>edgePublicNumbers.get(id)?.journeys,station,sourceName,loadTimetables:loadRouteTimetables,onFocus:focusTrainRoute,onBack:()=>clearTrainFocus(true),onRetry:()=>{if(selectedStation)pickStation(selectedStation,{inspect:true,restore:true});else if(selected)pickEdge(selected,false);},onStation:id=>{const s=stationMap.get(id);if(s)pickStation(s,{inspect:true});}});
const nativeNumberLoader=createNativePublicNumberLoader({getDescriptor:()=>manifest?.files?.nativePublicNumbers?dataURL(manifest.files.nativePublicNumbers):null,getDates:()=>dates,load:path=>json(path),onChange:()=>{if(selectedStation)renderStationSelected();else if(selected&&!isPhysicalSection(selected))renderSelected();else if(legResult)renderJourneyResult(legResult);}});
async function ensureNativePublicNumbers(options){await ensureManifest();return nativeNumberLoader.ensure(options);}
async function loadRouteTimetables(group){
  await ensureManifest();ensureNativePublicNumbers();const journeys=new Map();if(!manifest.files.timetables)return{journeys,status:{}};
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
  const ticket=++stationFocusGeneration,focus={key,stationId:s.id,ids:new Set(groups.flatMap(group=>[...group.edgeIds])),...routeStationFocus(groups)};
  if(s.isCityArea)for(const id of s.memberIds)if(focus.stations.has(id))focus.endpoints.add(id);
  stationFocus=focus;
  document.body.classList.add('station-route-focus');refreshRouteFocus();
  if(!groups.length)return;
  Promise.all([loadCompleteNetwork({forRoute:true}),routeFocusIds(groups)]).then(([,ids])=>{
    if(ticket!==stationFocusGeneration||selectedStation?.id!==s.id)return;
    focus.ids=ids;renderer.schedule();
  }).catch(()=>{if(ticket===stationFocusGeneration&&selectedStation?.id===s.id)toast('Some route geometry could not load. The station’s recorded services are still available.');});
}
function activeFocusIds(){return trainFocus?journeyHighlights:selectedStation&&stationFocus?.stationId===selectedStation.id?stationFocus.ids:null;}
function activeFocusStations(){return trainFocusGroup?new Set(trainFocusGroup.stops.map(callId)):selectedStation&&stationFocus?.stationId===selectedStation.id?stationFocus.stations:null;}
function activeFocusEndpoints(){return trainFocusGroup?routeStationFocus([trainFocusGroup]).endpoints:selectedStation&&stationFocus?.stationId===selectedStation.id?stationFocus.endpoints:null;}
function refreshRouteFocus(){renderer?.schedule();stationMarkers?.render();operatingTransfers.refresh();borderLinks.refresh();}
function mapFocusTop(){
  const origin=map.getContainer().getBoundingClientRect().top;
  let top=document.querySelector('.site-header').getBoundingClientRect().bottom+70;
  for(const notice of document.querySelectorAll('.map-notices > :not([hidden])')){const box=notice.getBoundingClientRect();if(box.height)top=Math.max(top,box.bottom+14);}
  return top-origin;
}
const infrastructureContext=setupInfrastructureContext({onOpen:()=>openContextPanel('infrastructureContextPanel'),getManifest:()=>manifest,getState:()=>state,getDates:()=>dates,getStations:()=>stationList,onChange:()=>refresh({details:false}),getMap:()=>map,getView:()=>map?{zoom:map.getZoom(),bounds:[map.getBounds().getWest(),map.getBounds().getSouth(),map.getBounds().getEast(),map.getBounds().getNorth()]}:null,load:path=>json(dataURL(path))});
const operatingTransfers=setupOperatingTransfers({isFocused:()=>activeFocusIds()!==null,onOpen:()=>openContextPanel('operatingTransfersPanel'),getManifest:()=>manifest,getState:()=>state.mode==='traffic'?{...state,replacements:false}:state,getDates:()=>dates,getMap:()=>map,getView:()=>map?{zoom:map.getZoom(),bounds:[map.getBounds().getWest(),map.getBounds().getSouth(),map.getBounds().getEast(),map.getBounds().getNorth()]}:null,load:path=>json(dataURL(path))});
// Reviewed approximate links between adjacent border stations that neither timetable connects.
const borderLinks=setupBorderLinks({onOpen:()=>openContextPanel('borderLinksPanel'),getManifest:()=>manifest,getState:()=>state,getDates:()=>dates,getMap:()=>map,getView:()=>map?{zoom:map.getZoom(),bounds:[map.getBounds().getWest(),map.getBounds().getSouth(),map.getBounds().getEast(),map.getBounds().getNorth()]}:null,load:path=>json(dataURL(path))});
const frequencyFilter=setupFrequencyFilter({getState:()=>state,onPreview:()=>{renderer?.previewThreshold();operatingTransfers.refresh();borderLinks.refresh();if(map)renderHubs();clearTimeout(filterSaveTimer);filterSaveTimer=setTimeout(()=>{saveURL();updateFilterSummary();},180);},onCommit:()=>{clearTimeout(filterSaveTimer);refresh();}});

function paintChunks(flush=false){if(flush){clearTimeout(chunkPaintTimer);chunkPaintTimer=0;renderer.schedule();}else if(!chunkPaintTimer)chunkPaintTimer=setTimeout(()=>{chunkPaintTimer=0;renderer.schedule();},300);}
const manifestURL=new URL('data/manifest.json',location.href),dataURL=path=>resolveAssetURL(path,manifest,manifestURL);
// A composed site names a slim start-up projection of the complete manifest.
// Older publications, and any unreadable projection, use the complete manifest.
// Credits and policy evidence read these provenance keys; the composer keeps
// them inline, so the deferred part is fetched only when a release lacks them.
const METHOD_PROVENANCE=['countryReference','borderPolicyReference'];
let startupManifestHref=null;
const ensureManifestPart=createManifestPartLoader({load:url=>json(url),complete:()=>json(manifestURL.href,{fresh:true})});
function loadManifestDocument(){
  const startup=startupManifestURL(manifest,location.href),complete=()=>{startupManifestHref=null;return json(manifestURL.href,{fresh:true});};
  if(!startup)return complete();
  return json(startup,{fresh:true}).then(value=>{if(!usableManifest(value))throw new Error('Unusable start-up manifest');startupManifestHref=startup;return value;}).catch(complete);
}
function json(url,{fresh=false,signal}={}){if(!cache.has(url)){const promise=dataLoader.load(url,{fresh,signal}).catch(error=>{if(cache.get(url)===promise)cache.delete(url);throw error;});cache.set(url,promise);}return cache.get(url);}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function status(message){$('screenReaderStatus').textContent=message;}
function sourceById(id){return manifest?.sources?.find(s=>s.id===id)||{id,name:id};}
function station(id){return stationMap.get(id)||stationCatalog.resolve(id)||hubMap.get(id)||{id,name:'Recorded station',country:''};}
function resolvedStation(id){return stationCatalog.resolve(id)||hubMap.get(id);}
function stationSourceText(s){return stationSourceLabel(s,sourceName);}
// "S+U Berlin Hauptbahnhof" must not shorten to "S+U Berlin".
function shortName(s){return String(s?.name||'Recorded station').replace(/^(?:S\+U|S|U)\s+(?=\S.*\sHauptbahnhof$)/,'').replace(/\s+(Hauptbahnhof|Central Station|railway station)$/i,'');}
function sourceName(id){const s=sourceById(id);return s.name||s.publisher||id;}
async function addEdges(rows){let count=0,started=performance.now();for(const row of rows||[]){const previous=edges.get(row.id),points=row._pointCount||row.coords?.length||0;if(!previous||points>(previous._pointCount||previous.coords?.length||0)){const edge=prepareEdge(row);if(edge){edges.set(edge.id,edge);mapPairIndex.set(edge);edgeVersion++;}}if(++count%24===0&&performance.now()-started>=4){await pauseWork();started=performance.now();}}}
function selectedDayCount(){return Math.max(1,selectedDays(state.day,dates).length);}
function lineCount(line,boarding=usesHubConnections(state)){if(!serviceVisible(line,state))return 0;const pass=effectivePass(state),field=boarding?(pass?'eurailBoardableDaily':'boardableDaily'):(pass?'eurailDaily':'daily'),weekly=boarding?(pass?'eurailBoardableWeekly':'boardableWeekly'):(pass?'eurailWeekly':'weekly');return sumDays(line,state.day,dates,field,weekly)+(pass?reviewedCount(line,state,dates,boarding):0);}
function bothDirections(edge){const rows=edge._directionEdges||[edge];return rows.some(a=>rows.some(b=>a.a===b.b&&a.b===b.a));}
function directionLabel(edge){return bothDirections(edge)?'both recorded directions':'recorded direction';}

function currentEdges(){
  if(state.mode==='traffic')return physicalHeatEdges;
  if(usesHubConnections(state)&&!trainFocus&&!selectedStation){
    const key=JSON.stringify([state.hubCount,state.hubExamples,state.hubCity,state.day,effectivePass(state),state.alternatives,state.accommodation,state.review,state.charge,state.chargeMatch,state.included,state.trains,[...(state.sources||[])].sort(),!!cityDocument]);
    if(key!==cityEdgesKey){cityEdgesKey=key;cityEdges=cityConnectionEdges(cityDocument,state,dates);}
    return cityEdges;
  }
  if(pairVersion!==edgeVersion){const real=mapPairIndex.values();if(completeNetworkLoaded)pairEdges=mergeCompletePairs(displayPairs,real,hydratedNetworkPairs);else{const ids=new Set(real.map(e=>e.id));pairEdges=[...displayPairs.filter(e=>!ids.has(e.id)),...real];}pairEdges=pairEdges.map(attachPassPolicy);pairVersion=edgeVersion;}
  const available=mergeContinuationEdges(pairEdges,continuationEdges);
  if(state.mode!=='countries'||trainFocus||selectedStation)return available;
  const key=JSON.stringify([pairVersion,state.country,stationList.length,continuationEdges.length]);
  if(countryPairsKey!==key){countryPairsKey=key;countryPairs=state.country?available.filter(edge=>countryEdge(edge,state.country,stationMap)):[];}
  return countryPairs;
}
function findDisplayedEdge(id){return currentEdges().find(edge=>edge.id===id)||edges.get(id);}
function alternativeSources(){state.altSourceIds=new Set([...state.sources||[]].filter(id=>sourceById(id).defaultVisible===false));}
function saveURL(){if(map&&!booting)history.replaceState(null,'',busViewURL(serializeState(state,map)));}
function method(){const d=$('methodDialog');if(!d.open)d.showModal();ensureManifest().then(()=>{updateMethod();loadPublicDownloads().catch(()=>{});
  return ensureManifestPart(manifest,'provenance',{keys:METHOD_PROVENANCE,startupURL:startupManifestHref}).then(loaded=>{if(!loaded)return;const downloads=$('publicDownloads');updateMethod();if(downloads)$('methodContent').appendChild(downloads);});
}).catch(()=>toast('Source details could not load. Please retry.'));}
function reconcileSources(){
  const selection=reconcileSourceSelection(manifest.sources,state.sources,{previousDefaults:state.defaultSources,authoritative:!manifest._bootstrap});
  state.defaultSources=selection.defaults;state.sources=selection.sources;alternativeSources();
  if(selection.fallback)toast('This saved source selection is unavailable. Showing recommended sources.');
}
async function ensureManifest(){
  if(!manifest?._bootstrap)return manifest;
  if(!fullManifestPromise)fullManifestPromise=loadManifestDocument().then(value=>{
    const previous=manifest,networkChanged=!sameManifestAsset(previous,value,'displayNetwork'),physicalChanged=!sameManifestAsset(previous,value,'physicalRailHeat'),continuationChanged=!sameManifestAsset(previous,value,'throughContinuationGeometry'),positionsChanged=!sameManifestAsset(previous,value,'reviewedGeometrySupport');
    if(!sameManifestAsset(previous,value,'displayOverview'))window.atlasDisplayPromise=null;
    if(networkChanged){window.atlasCompletePromise=null;completeNetworkPromise=null;completeNetworkLoaded=false;completeNetworkGeneration++;}
    if(physicalChanged){physicalHeatDocument=null;physicalHeatEdges=[];physicalHeatPromise=null;physicalHeatError=null;physicalHeatGeneration++;physicalDetailStates.clear();if(isPhysicalSection(selected)){const id=selected.id;closeInspector();state.edge=id;}}
    manifest=value;if(continuationChanged){continuationEdges=[];continuationGeometryAsset=null;continuationGeometryPromise=null;}if(positionsChanged)reviewedStationPositions.reset();applyProjectScope(state,manifest.projectScope);
    if(state.defaultSources){reconcileSources();setupSources();refresh({details:false});}
    coverage.refresh();serviceContext.refresh();infrastructureContext.refresh();operatingTransfers.refresh();borderLinks.refresh();
    if((continuationChanged||positionsChanged)&&!booting)ensureContinuationGeometry().catch(()=>toast('Some reviewed international services could not load. Reopen this map to retry.'));if(networkChanged&&!booting)loadCompleteNetwork().catch(()=>{});if(physicalChanged&&!booting&&state.mode==='traffic')ensurePhysicalHeat().catch(()=>{});
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
  if(page)await hydrateMetadataPage(dataURL(page),network);
  else await ensureOverviewMetadata();
  const upgraded=findDisplayedEdge(edge.id)||edge;
  if(!network&&completeNetworkLoaded&&upgraded._displayCatalog==='network')return hydrateDisplayEdge(upgraded);
  return upgraded;
}
const hydrateMetadataPage=createPageHydrator(url=>json(url),async(data,network,url)=>{
  if(data.stations)await mergeStations(data,{paint:false});await addEdges(data.edges||[]);
  if(network){for(const pair of aggregateMapPairs(data.edges||[]))hydratedNetworkPairs.add(pair.id);edgeVersion++;}
  cache.delete(url);
});
async function loadCompleteNetwork({forRoute=false}={}){
  ensureContinuationGeometry().catch(()=>{});
  if(completeNetworkLoaded||!manifest?.files?.displayNetwork||!forRoute&&(state.mode==='traffic'||usesHubConnections(state)||state.mode==='italy'&&!busesOnly()))return;
  const generation=completeNetworkGeneration;
  if(!completeNetworkPromise)completeNetworkPromise=(async()=>{
    const data=window.atlasCompletePromise?await dataLoader.decode(await window.atlasCompletePromise):await json(dataURL(manifest.files.displayNetwork));
    if(generation!==completeNetworkGeneration)return loadCompleteNetwork({forRoute});
    displayPairs=data.edges||[];rememberThroughDisplay(displayPairs);completeNetworkLoaded=true;edgeVersion++;$('map').dataset.network='complete';renderer.schedule();
    status('All available network connections loaded. Zoom changes geometry detail, not service coverage.');
    if(state.edge&&!selected){const edge=findDisplayedEdge(state.edge);if(edge)pickEdge(edge,false);}
  })().catch(error=>{if(generation!==completeNetworkGeneration)return loadCompleteNetwork({forRoute});completeNetworkPromise=null;toast('The complete network could not load. Pan or zoom to retry.');throw error;});
  return completeNetworkPromise;
}
async function ensurePhysicalHeat(){
  if(physicalHeatDocument)return physicalHeatDocument;
  if(!physicalHeatPromise)physicalHeatPromise=(async()=>{
    if(!manifest?.files?.physicalRailHeat)await ensureManifest();
    if(!manifest?.files?.physicalRailHeat)throw new Error('Physical rail traffic is unavailable in this release');
    const generation=physicalHeatGeneration,loaded=await json(dataURL(manifest.files.physicalRailHeat)),data=loaded.edges?loaded:decodePhysicalHeat(loaded);
    if(generation!==physicalHeatGeneration)return ensurePhysicalHeat();
    if(data.format!=='rail-atlas-physical-heat-v1'||data.schemaVersion!==1)throw new Error('Unsupported physical rail traffic product');
    if(data.dates.some((date,i)=>date!==dates[i]))throw new Error('Physical rail traffic dates do not match this atlas');
    applyPhysicalSourceAvailability(data,manifest.sources);
    physicalHeatEdges=(data.edges||[]).map(prepareEdge).filter(Boolean);physicalHeatDocument=data;physicalHeatError=null;
    renderer.schedule();if(state.mode==='traffic'){applyControls();status('Estimated physical rail traffic loaded. Counts are scheduled source traversals, with inferred paths.');if(state.edge&&!selected){const section=physicalHeatEdges.find(row=>row.id===state.edge);if(section)pickTrafficSection(section,false);}}
    return data;
  })().catch(error=>{physicalHeatPromise=null;physicalHeatError=error;renderer.schedule();if(state.mode==='traffic'){applyControls();toast('Physical rail traffic could not load. Select Traffic again to retry.');}throw error;});
  return physicalHeatPromise;
}
function pickTrafficSection(section,animate=true){
  if(!qualifiesEdge(section,state,dates,stationMap))return;
  cancelInspectorLookup();
  detailSequence++;selectedStation=null;state.station='';clearStationFocus();trainInspector.reset();clearTrainFocus(false);document.body.classList.remove('station-inspector-open');
  selected=section;state.edge=section.id;legResult=null;journeyHighlights.clear();showInspector();renderTrafficSection();ensurePhysicalSectionDetails(section).catch(()=>{});renderer.schedule();saveURL();
  ensureStations().then(()=>{if(state.mode==='traffic'&&selected?.id===section.id)renderTrafficSection();}).catch(()=>{});
  if(animate&&map.getZoom()<6){const point=section.coords?.[0];if(point)map.panTo([point[1],point[0]],{animate:true});}
}
async function ensurePhysicalSectionDetails(section){
  const path=physicalDetailsPath(manifest?.files?.physicalRailHeatDetails,section.id);if(!path||section.supportingLegs||physicalDetailStates.get(section.id)==='loading')return;
  const generation=physicalHeatGeneration;physicalDetailStates.set(section.id,'loading');
  try{const page=await json(dataURL(path));if(generation!==physicalHeatGeneration)return;section.supportingLegs=physicalSectionDetails(page,section.id);physicalDetailStates.set(section.id,'complete');}
  catch(error){if(generation!==physicalHeatGeneration)return;physicalDetailStates.set(section.id,'error');throw error;}
  finally{if(generation===physicalHeatGeneration&&state.mode==='traffic'&&selected?.id===section.id)renderTrafficSection();}
}
function renderTrafficSection(){
  if(!isPhysicalSection(selected))return;
  $('inspectorContent').innerHTML=physicalSectionInformation(selected,state,dates,sourceName,{chart:physicalSectionChart(selected,state,dates),nearbyStations:physicalSectionLocation(selected,stationList),supportingStatus:physicalDetailStates.get(selected.id)||(!selected.supportingLegs&&physicalDetailsPath(manifest?.files?.physicalRailHeatDetails,selected.id)?'loading':null)});bindChart();
  $('retrySectionDetails')?.addEventListener('click',()=>{physicalDetailStates.delete(selected.id);ensurePhysicalSectionDetails(selected).catch(()=>{});renderTrafficSection();});
  document.querySelectorAll('[data-section-leg]').forEach(button=>button.onclick=async()=>{
    const id=button.dataset.sectionLeg,support=selected?.supportingLegs?.find(row=>row.edgeId===id);setMode('frequency');
    // Inspect the chosen connection first; avoid hydrating every local source
    // packet in this viewport merely because a section example was opened.
    clearTimeout(chunkTimer);chunkRun++;for(const request of chunkRequests.values())request.controller.abort();state.edge=id;saveURL();
    try{await loadCompleteNetwork();let edge=findDisplayedEdge(id);if(!edge&&support){const pairId=await supportingMapPairId(support);edge=currentEdges().find(row=>supportingConnectionMatches(row,support,pairId));}if(edge){if(qualifiesEdge(edge,state,dates,stationMap))await pickEdge(edge);else toast('This supporting connection is hidden by current filters. Lower the minimum or broaden the source selection.');}else toast('This supporting connection is unavailable in the current release.');}catch{toast('Supporting services could not load. Please retry.');}
  });
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
  if(open){stationSearch?.close();closeOtherContextPanels();}
  const controls=$('mapControls');controls.hidden=!open;$('controlsToggle').setAttribute('aria-expanded',String(open));
  if(open){controls.scrollTop=0;controls.querySelector('.sidebar-scroll').scrollTop=0;requestAnimationFrame(()=>{if(!controls.hidden){controls.querySelector('.sidebar-scroll').scrollTop=0;$('controlsTitle').focus({preventScroll:true});}});}
}
const cityLoader=createCityHubsLoader({
  loadIndex:async()=>{await ensureManifest();if(!manifest.files.cityHubs)throw new Error('City connections are unavailable in this release');return json(dataURL(manifest.files.cityHubs));},
  loadPart:path=>json(dataURL(path)),
  onChange:document=>{cityDocument=document;for(const city of document.cities)hubMap.set(city.id,city);cityEdgesKey='';renderCityOptions();renderHubs();renderer?.schedule();refreshViewTools();}
});
async function loadCityHubs({connections=true}={}){
  try{
    const document=await(connections?cityLoader.through(state.hubCount):cityLoader.index());
    if(state.mode==='hubs'){applyControls();if(connections)ensureStations().then(()=>{if(state.mode==='hubs')renderHubs();}).catch(()=>toast('Main stations could not load. Reopen Hubs to retry.'));if(state.edge&&!selected){const edge=findDisplayedEdge(state.edge);if(edge)pickEdge(edge,false);}}
    return document;
  }catch(error){toast('City connections could not load. Select Hubs to retry.');throw error;}
}
function renderCityOptions(){
  if(!cityDocument)return;
  const cities=cityDocument.cities.filter(city=>city.rank<=state.hubCount),select=$('hubCity');
  if(state.hubCity&&!cities.some(city=>city.id===state.hubCity))state.hubCity='';
  select.replaceChildren(new Option('All cities',''));
  for(const city of cities)select.appendChild(new Option(city.name+' · '+city.country,city.id));
  select.value=state.hubCity;
  $('hubCityPickerToggle').textContent=(cities.find(city=>city.id===state.hubCity)?.name||'All cities')+' ⌄';
}
function refreshViewTools(){
  $('hubsTools').hidden=state.mode!=='hubs';$('hubCount').value=String(state.hubCount);$('hubExamples').value=state.hubExamples;
  $('hubOptionsToggle').hidden=state.mode!=='hubs';$('hubOptionsLabel').textContent='Top '+state.hubCount+' cities';
  $('countryPickerToggle').hidden=state.mode!=='countries';$('countryPickerLabel').textContent=state.country||'Choose a country';
  $('viewTools').hidden=!['hubs','countries'].includes(state.mode);
  $('viewToolsNote').hidden=state.mode!=='hubs';
  $('viewCoverageLink').hidden=state.mode!=='countries'||!state.country;
  if(state.mode==='hubs'){
    const city=hubMap.get(state.hubCity);
    $('viewToolsNote').textContent=!cityLoader.has(state.hubCount)?'Loading railway paths for the selected cities…':
      `${city?'Direct trains to/from '+city.name+'. ':''}${Math.min(state.hubCount,cityDocument.cities.length)} population-ranked cities. ${state.hubExamples==='all'?'Colors count direct services on each retained railway path.':'Examples select connections; colors count direct services on each retained railway path.'} Inferred tracks; gaps and coverage vary.`;
    if(matchMedia(MOBILE_LAYOUT).matches&&cityLoader.has(state.hubCount))$('viewToolsNote').textContent=state.hubExamples==='all'?'Direct services on railway paths; coverage varies.':'Connections with '+(state.hubExamples==='fast'?'fast / intercity':'overnight')+' examples. Railway paths; coverage varies.';
  }else if(state.mode==='countries'){
    if(!state.country){$('countrySummary').textContent='Choose a country to frame its available network and inspect its data.';return;}
    const key=state.country+'|'+(manifest?.releaseId||'');
    if(countrySummaryKey!==key){countrySummaryKey=key;$('countrySummary').textContent='Loading country coverage…';coverage.getCountrySummary(state.country).then(summary=>{if(countrySummaryKey===key)$('countrySummary').textContent=summary.shortText||summary.label;});}
  }
}
function loadCountryContext(){
  if(!countryContextPromise){const url=manifest?.files?.context?dataURL(manifest.files.context):new URL('assets/countries.geojson',location.href).href;countryContextPromise=json(url).catch(error=>{countryContextPromise=null;throw error;});}
  return countryContextPromise;
}
function ensureCountryContextStations(){
  const needed=()=>state.mode==='countries'&&(state.closedCorridors===true||state.physicalRailways===true);
  if(!needed()||fullStationsLoaded||countryContextStationPromise)return;
  // Notice geography is resolved from recorded stations, independently of the
  // fast basemap frame. Load that catalogue only when its overlays are enabled.
  countryContextStationPromise=ensureStations().then(()=>{if(needed()){serviceContext.refresh();infrastructureContext.refresh();}}).catch(()=>{if(needed())toast('Railway context geography could not load. Toggle the overlay to retry.');}).finally(()=>{countryContextStationPromise=null;});
}
function cancelCountryViewportFrame(){countryViewportCleanup?.();countryViewportCleanup=null;}
function watchCountryViewport(country,sequence){
  cancelCountryViewportFrame();
  if(!matchMedia(MOBILE_LAYOUT).matches||!$('countryDialog').open)return;
  const height=()=>visualViewport?.height||innerHeight,initialHeight=height();
  const current=()=>sequence===countryChoiceSequence&&state.mode==='countries'&&state.country===country;
  let timer=0;
  const mapElement=map.getContainer();
  function cleanup(){visualViewport?.removeEventListener('resize',resize);window.removeEventListener('resize',resize);mapElement.removeEventListener('pointerdown',cleanup);mapElement.removeEventListener('wheel',cleanup);clearTimeout(timer);if(countryViewportCleanup===cleanup)countryViewportCleanup=null;}
  function resize(){
    if(!current()){cleanup();return;}
    if(height()<=initialHeight+40)return;
    cleanup();
    // The keyboard closes after Enter/tap has selected the country. Wait for
    // the new sheet/map layout before calculating its final country padding.
    requestAnimationFrame(()=>{if(!current())return;map.invalidateSize({pan:false});requestAnimationFrame(()=>{if(current())frameCountry(country,sequence).catch(()=>toast('Country data could not load. Please retry.'));});});
  }
  countryViewportCleanup=cleanup;visualViewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);mapElement.addEventListener('pointerdown',cleanup,{once:true});mapElement.addEventListener('wheel',cleanup,{once:true,passive:true});timer=setTimeout(cleanup,5000);
}
async function frameCountry(country,sequence){
  const current=()=>sequence===countryChoiceSequence&&state.mode==='countries'&&state.country===country;
  try{
  let bounds=null;
  try{bounds=countryContextBounds(country,await loadCountryContext());}catch{}
  if(!current())return;
  if(!bounds)bounds=countryBounds(country,stationList);
  if(!bounds){await loadBootstrapStations();if(!current())return;bounds=countryBounds(country,stationList);}
  if(!bounds){await ensureStations();if(!current())return;bounds=countryBounds(country,stationList);}
  if(bounds){map.fitBounds(bounds,{...mapFramePadding(),maxZoom:10,animate:false});saveURL();status('Exploring '+country+'.');}
  else toast('No mapped stations are available for this country in the current snapshot.');
  }catch(error){if(current())throw error;}
}
function chooseCountry(country){
  const sequence=++countryChoiceSequence;countryPickerSequence++;
  state.country=country;state.mode='countries';watchCountryViewport(country,sequence);closeInspector();$('countryDialog').close();
  // A tap acknowledges the selection before any catalogue or framing request.
  refresh();$('countryPickerToggle').focus({preventScroll:true});saveURL();
  return frameCountry(country,sequence);
}
async function openCountryPicker(){
  const sequence=++countryPickerSequence;closeOtherContextPanels();setControlsOpen(false);stationSearch?.close();
  if(!manifest?.countryNames?.length){await ensureManifest();if(sequence!==countryPickerSequence||state.mode!=='countries')return;}
  const dialog=$('countryDialog'),input=$('countrySearchInput');$('countryCurrentDetails').hidden=false;refreshViewTools();$('countryDialogTitle').textContent='Explore a country';input.placeholder='Find a country';input.setAttribute('aria-label','Find a country');
  const countries=(manifest.countryNames||[]).filter(country=>!['Russia','Ukraine'].includes(country));
  function paint(){
    const query=normalize(input.value),matches=countries.filter(name=>normalize(name).includes(query));$('countryChoices').replaceChildren();
    for(const country of matches){
      const button=document.createElement('button');button.className='country-choice';button.type='button';button.setAttribute('aria-pressed',String(country===state.country));
      const name=document.createElement('span');name.textContent=country;const action=document.createElement('small');action.textContent='Explore network →';button.append(name,action);
      button.onclick=()=>chooseCountry(country).catch(()=>toast('Country data could not load. Please retry.'));$('countryChoices').appendChild(button);
    }
    if(!matches.length){const message=document.createElement('p');message.className='country-search-status';message.setAttribute('role','status');message.textContent='No country matches “'+input.value+'”. Try another spelling.';$('countryChoices').appendChild(message);}
  }
  input.value='';input.oninput=paint;input.onkeydown=event=>{if(event.key!=='Enter'||event.isComposing)return;const query=normalize(input.value);if(!query)return;const match=countries.find(country=>normalize(country)===query)||countries.find(country=>normalize(country).includes(query));if(match){event.preventDefault();chooseCountry(match).catch(()=>toast('Country data could not load. Please retry.'));}};
  paint();if(!dialog.open)dialog.showModal();if(!matchMedia(MOBILE_LAYOUT).matches)input.focus();
  loadCountryContext().catch(()=>{});
  if(manifest._bootstrap)ensureManifest().catch(()=>{});
}
async function openCityPicker(){
  countryPickerSequence++;closeOtherContextPanels();await loadCityHubs({connections:false});setControlsOpen(false);
  const dialog=$('countryDialog'),input=$('countrySearchInput');$('countryCurrentDetails').hidden=true;$('countryDialogTitle').textContent='Explore a city';input.placeholder='Find a city';input.setAttribute('aria-label','Find a city');
  const cities=cityDocument.cities.filter(city=>city.rank<=state.hubCount);
  function paint(){
    const query=normalize(input.value);$('countryChoices').replaceChildren();
    for(const city of[{id:'',name:'All cities',country:'Show every direct connection'},...cities].filter(city=>normalize(city.name+' '+city.country+' '+(city.aliases||[]).join(' ')).includes(query))){
      const button=document.createElement('button');button.className='country-choice';button.type='button';button.setAttribute('aria-pressed',String(city.id===state.hubCity));
      const name=document.createElement('span');name.textContent=city.name;const country=document.createElement('small');country.textContent=city.country;button.append(name,country);
      button.onclick=()=>{$('hubCity').value=city.id;$('hubCity').dispatchEvent(new Event('change'));dialog.close();};$('countryChoices').appendChild(button);
    }
  }
  input.value='';input.oninput=paint;input.onkeydown=null;$('countryChoices').removeAttribute('aria-live');paint();if(!dialog.open)dialog.showModal();if(!matchMedia(MOBILE_LAYOUT).matches)input.focus();
}
function setupExplorerControls(){
  $('hubOptionsToggle').onclick=()=>setControlsOpen(true);
  $('hubCityPickerToggle').onclick=()=>openCityPicker().catch(()=>toast('City choices could not load. Please retry.'));
  $('countryPickerToggle').onclick=()=>openCountryPicker().catch(()=>toast('Country choices could not load. Please retry.'));
  $('closeCountryDialog').onclick=()=>{countryPickerSequence++;$('countryDialog').close();};
  $('viewCoverageLink').onclick=()=>{$('countryDialog').close();coverage.open(state.country);};
  for(const id of['hubCount','hubExamples','hubCity'])$(id).onchange=()=>{
    state.hubCount=Number($('hubCount').value);state.hubExamples=$('hubExamples').value;state.hubCity=$('hubCity').value;
    closeInspector();renderCityOptions();refresh();saveURL();
    const city=state.hubCity,rank=state.hubCount;
    loadCityHubs().then(()=>{if(state.mode!=='hubs'||state.hubCity!==city||state.hubCount!==rank)return;refresh();if(city){const rows=currentEdges().filter(edge=>qualifiesEdge(edge,state,dates,stationMap));const points=rows.flatMap(edge=>edge.coords).map(([lon,lat])=>[lat,lon]);if(points.length)map.fitBounds(points,{...mapFramePadding(),maxZoom:9,animate:false});}}).catch(()=>{});
  };
}
function mapFramePadding(){
  const phone=matchMedia(MOBILE_LAYOUT).matches,compact=matchMedia('(max-width:900px)').matches;
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
  markers=L.layerGroup().addTo(map);stationMarkers=new StationMarkers(map,{getStations:()=>stationList,getState:()=>state.mode==='hubs'?{...state,stations:false}:state.mode==='countries'&&activeFocusIds()!==null?{...state,mode:'frequency'}:state,getSelected:()=>selectedStation?.isCityArea?null:selectedStation,getFocus:activeFocusStations,getFocusEndpoints:activeFocusEndpoints,onPick:s=>pickStation(s,{inspect:true})});renderer=new RailRenderer(map,()=>{const focusIds=activeFocusIds();return{edges:currentEdges(),state,dates,stations:stationMap,selected:trainFocus?null:selected,highlightIds:focusIds||journeyHighlights,focusIds,supplementalFocusGroup:trainFocusGroup?.supplementalAvailability?trainFocusGroup:null};},edge=>{if(!busPicked)pickEdge(edge);});
  renderer.canvas.addEventListener('atlasdraw',event=>updateMapSummary(event.detail.visible));setupViewportRefresh(map,()=>{saveURL();scheduleChunks();renderHubs();coverage.refreshViewport();serviceContext.refresh();infrastructureContext.refresh();operatingTransfers.refresh();borderLinks.refresh();});installSmoothWheelZoom(map);

  $('zoomIn').onclick=()=>map.zoomIn();$('zoomOut').onclick=()=>map.zoomOut();$('fitMap').onclick=()=>fitRegion();
}
function drawCountries(geo){if(baseLayer)map.removeLayer(baseLayer);baseLayer=L.geoJSON(geo,{pane:'countryFallback',interactive:false,style:{fillColor:'#f3f3ed',fillOpacity:1,color:'#bdcbc5',weight:.8,opacity:.9}}).addTo(map);}
function loadCountryFallback(){if(manifest&&!baseLayer)loadCountryContext().then(drawCountries).catch(()=>{});}
function fitRegion(){cancelCountryViewportFrame();if(state.mode==='countries'&&state.country){frameCountry(state.country,++countryChoiceSequence).catch(()=>toast('Country data could not load. Please retry.'));return;}map.fitBounds(EUROPE_BOUNDS,{...mapFramePadding(),animate:true});}
function closeOtherContextPanels(id){for(const panel of document.querySelectorAll('.service-context-panel'))if(panel.id!==id&&!panel.hidden)panel.querySelector('.close-button')?.click();}
function openContextPanel(id){closeOtherContextPanels(id);stationSearch?.close();setControlsOpen(false);if(selected||selectedStation)closeInspector();}
function hasServices(){return ['traffic','hubs'].includes(state.mode)?state.trains:state.trains||state.replacements;}
function busesOnly(){return !['traffic','hubs'].includes(state.mode)&&!state.trains&&state.replacements;}
function hasServicePaths(){return state.mode==='hubs'||(state.mode==='traffic'?state.inferred!==false:state.aligned!==false||state.inferred!==false||state.schematic!==false);}
function remainingContext(){return[state.closedCorridors!==false?'affected railways':null,state.physicalRailways?'physical railways':null].filter(Boolean);}
function updateMapSummary(visible=lastSummaryVisible){
  lastSummaryVisible=visible;
  const summary=$('mapSummary'),date=state.day==='all'?'All week':state.day==='weekdays'?'Weekdays':state.day==='weekend'?'Weekend':dateLabel(state.day,dates);
  if(busEnabled&&(!hasServices()||!hasServicePaths())){summary.lastElementChild.textContent='Buses & coaches · partial coverage';summary.title='Scheduled buses use their own dates, sources and filters. Coverage is partial; bus counts stay separate from trains.';$('overviewNote').hidden=true;return;}
  if(state.mode==='countries'&&!state.country){summary.lastElementChild.textContent='Choose a country to explore';$('overviewNote').hidden=true;return;}
  if(!hasServices()||!hasServicePaths()){
    const context=remainingContext();summary.lastElementChild.textContent=(!hasServices()?'Services hidden':'Service paths hidden')+(context.length?' · context overlays on':'');
    summary.title=context.length?'Still enabled: '+context.join(', ')+'. Use Context overlays or Hide all overlays in Filters.':'No service paths or railway context enabled.';$('overviewNote').hidden=true;return;
  }
  if(state.mode==='traffic'){summary.lastElementChild.textContent=physicalHeatError?'Rail traffic unavailable · select Traffic to retry':!physicalHeatDocument?'Loading estimated rail traffic…':`${fmt(visible||0)} railway sections · ${date}`;summary.title='Estimated scheduled source traversals over shared physical railway sections. Both directions; replacement buses excluded; coverage and source overlap vary.';$('overviewNote').hidden=true;return;}
  const label=usesHubConnections(state)?'city railway paths':'connections',loading=manifest?.files?.displayNetwork&&!completeNetworkLoaded&&!usesHubConnections(state)&&state.mode!=='italy';
  summary.lastElementChild.textContent=`${fmt(visible||0)} ${label} · ${date}${loading?' · loading…':''}`;
  summary.title=`${fmt(visible||0)} source-defined ${label} in view · ${dateLabel(state.day,dates)}`;
  $('overviewNote').hidden=usesHubConnections(state)||state.mode==='italy'||completeNetworkLoaded;
  $('overviewNote').textContent=manifest?.files?.displayNetwork?'Loading all available network connections…':'Partial overview; zoom in for detail';
  if(visible===0&&manifest&&$('mapLoading').hidden){summary.lastElementChild.textContent='No matching services here · adjust filters';summary.title='The current date, sources and service filters have no matches in view. This does not establish that no services operate.';}
}
function applyLegend(){const visible=state.legend!==false;$('mapLegend').hidden=!visible;$('mapKey').dataset.collapsed=String(!visible);$('legendToggle').setAttribute('aria-expanded',String(visible));$('legendToggle').setAttribute('aria-label',visible?'Hide map key':'Show map key');$('legendToggle').title=visible?'Hide map key':'Show map key';$('legendToggleIcon').textContent=visible?'−':'+';}
function setupLegend(){$('legendToggle').onclick=()=>{state.legend=state.legend===false;applyLegend();saveURL();};applyLegend();}
function applyControls(){
  const filtered=chargeFiltered(state),pass=effectivePass(state),services=hasServices(),bus=busesOnly(),independentBuses=busEnabled&&(!services||!hasServicePaths());
  $('emptySourceSelection').hidden=!services||!manifest||state.sources?.size!==0;
  applyLegend();serviceContext.refresh();infrastructureContext.refresh();operatingTransfers.refresh();borderLinks.refresh();document.body.dataset.view=state.mode;refreshViewTools();document.querySelector('.geometry-filter').hidden=state.mode==='hubs';
  $('showTrains').checked=state.trains;$('showReplacements').checked=['traffic','hubs'].includes(state.mode)?false:state.replacements;$('showReplacements').disabled=['traffic','hubs'].includes(state.mode);$('showReplacements').title=state.mode==='traffic'?'Physical rail traffic counts trains only. Replacement buses remain available in Frequency.':'';document.querySelectorAll('[data-service-only]').forEach(button=>{button.disabled=state.mode==='traffic'||state.mode==='hubs'&&button.dataset.serviceOnly==='replacements';});
  $('showClosedCorridors').checked=state.closedCorridors!==false;$('showPhysicalRailways').checked=state.physicalRailways===true;
  const remaining=remainingContext();$('serviceLayerHelp').textContent=state.mode==='traffic'?'Physical rail traffic counts trains only. Replacement buses remain available in Frequency. More map layers are in Advanced controls.':!services&&remaining.length?'Services hidden. Still on: '+remaining.join(', ')+'. Turn them off in Advanced controls, or choose Hide all overlays.':'More map layers are in Advanced controls.';
  $('findReplacementServices').hidden=['traffic','hubs'].includes(state.mode)||!state.replacements;if(state.mode==='hubs')$('serviceLayerHelp').textContent='City connections count trains only. Replacement buses remain in Frequency.';
  if(independentBuses)$('serviceLayerHelp').textContent='Buses & coaches use their own dates and filters. Coverage is partial. Train layers are controlled separately.';
  const context=serviceContext.summary?.();
  $('contextLayerHelp').textContent=context?.available?`${context.available} affected sections for these dates. These overlays stay independent of service and geometry filters.`:'These overlays stay independent of service and geometry filters. Coverage is partial.';
  $('fitReplacementSections').disabled=!context?.available||state.closedCorridors===false;
  $('italyCoverage').hidden=!services||state.mode!=='italy'||manifest?.publication?.audience!=='public';
  if(state.mode==='italy')$('italyCoverage').textContent=manifest?.sources?.some(source=>source.id==='it_trenitalia_nap')?'National Trenitalia services included; regional coverage remains partial. Coverage ↗':'Italian timetable coverage is partial. Coverage ↗';
  $('controlsTitle').textContent='Map filters';$('controlsToggleLabel').textContent='Filters';
  document.querySelectorAll('[data-mode]').forEach(button=>{const active=button.dataset.mode===state.mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  $('legForm').hidden=true;
  $('mapTitle').textContent=independentBuses?'Buses & coaches':!services?(remaining.length?'Context view':'Services hidden'):bus?'Replacement bus services':MODES[state.mode].title;
  if(state.mode==='countries'&&state.country&&!independentBuses)$('mapTitle').textContent=state.country;
  $('mapKicker').textContent=independentBuses?'OPTIONAL BUS LAYER':!services?'MAP CONTEXT':bus?'TEMPORARY REPLACEMENTS':MODES[state.mode].kicker;
  $('mapSubtitle').textContent=independentBuses?'Scheduled buses from partial source coverage. Bus dates and filters are separate from trains.':!services?(remaining.length?'Service layers are hidden; context overlays remain enabled in Filters.':'Enable services or context overlays in Filters.'):bus?'Timetabled replacement buses. Railway paths show orientation, not bus roads.':MODES[state.mode].subtitle;
  $('stationDisplay').value=stationDisplayMode(state);$('stationDisplayControl').hidden=state.mode==='hubs';$('hubMarkersLabel').textContent=state.mode==='hubs'?'Main stations':'City labels';$('showHubs').checked=state.hubs;$('showSchematic').checked=state.schematic;$('showAligned').checked=state.aligned!==false;$('showInferred').checked=state.inferred!==false;
  document.querySelector('.geometry-filter').hidden=state.mode==='hubs';
  for(const id of ['showAligned','showSchematic'])$(id).closest('label').hidden=state.mode==='traffic';document.querySelector('.geometry-filter .filter-actions').hidden=state.mode==='traffic';document.querySelector('.geometry-filter .helper').textContent=state.mode==='traffic'?'Physical traffic sections use inferred shared railway alignments. Exact track assignment is unverified. More map layers are in Advanced controls.':'Applies to selected services. Dotted links have unresolved geometry; they can be very short or densely clustered. More map layers are in Advanced controls.';
  $('passToggleRow').hidden=PASS_MODES.has(state.mode);$('eurailOnly').checked=pass;$('eurailOnly').disabled=false;
  $('passCoverageGroup').hidden=!pass||state.mode==='hubs';$('includedToggleRow').hidden=state.mode!=='eurail';
  $('showIncluded').checked=state.included!==false;$('showReview').checked=state.review;$('showReview').disabled=filtered;
  $('reviewKey').hidden=!(services&&pass&&state.review&&!filtered);
  $('uncertaintyHelp').textContent=state.mode==='eurail'?(filtered?'Choose All fee conditions to include uncertain coverage. Fees filter confirmed included services only.':'Uncertain inclusion is shown in amber, separately from confirmed inclusion. Known exclusions stay excluded.'):'Conditional pass coverage is shown separately from confirmed included services.';
  $('passConditionRow').hidden=state.mode!=='eurail';
  $('feePreset').value=feeCustom?'custom':state.charge==='free'?'free':'all';
  const advancedWasHidden=$('feeAdvanced').hidden;$('feeAdvanced').hidden=!feeCustom;if(feeCustom&&advancedWasHidden)$('feeAdvanced').open=true;
  const charges=state.charge==='all'||!state.charge?Object.keys(CHARGE_BITS):state.charge.split(',');
  document.querySelectorAll('[data-charge]').forEach(input=>{input.checked=charges.includes(input.dataset.charge);});$('chargeMatch').value=state.chargeMatch||'any';
  $('passConditionHelp').textContent=!passPolicies&&!throughServices&&(chargeFiltered(state)||!manifest?.files?.throughServices)?(passPoliciesFailed?'Pass conditions unavailable. Change a choice to retry.':'Loading recorded pass conditions…'):state.charge==='none'?'No fee conditions selected: no included services match.':state.charge==='free'?'Explicitly no mandatory reservation or listed train supplement. Optional reservations, upgrades and accommodation may cost extra.':(state.chargeMatch==='all'?'Every checked condition must apply.':'Matches any checked condition; each service is counted once.')+' Unknown fees never qualify as free.';
  frequencyFilter.sync();$('dateSelect').value=state.day;
  document.querySelectorAll('[data-day]').forEach(button=>{button.classList.toggle('active',button.dataset.day===state.day);button.setAttribute('aria-pressed',String(button.dataset.day===state.day));});
  $('legendTitle').textContent=state.mode==='traffic'?'EST. TRAIN TRAVERSALS / DAY':bus?'RECORDED REPLACEMENT BUSES / DAY':pass?'RECORDED EURAIL SERVICES / DAY':!state.replacements?'RECORDED TRAINS / DAY':'RECORDED SERVICES / DAY';
  for(const id of ['legendGradient','legendLabels'])$(id).hidden=!services;
  for(const selector of ['.legend-heading','.frequency-scope','.alignment-key'])document.querySelector(selector).hidden=!services;
  document.querySelector('.frequency-scope').textContent=state.mode==='traffic'?'Estimated · both directions · coverage varies':'Doubling bands · coverage varies';if(state.mode==='traffic')document.querySelector('.alignment-key').hidden=true;
  $('legendNote').textContent=state.mode==='traffic'?'Representative inferred railway paths. Feeds can overlap; buses excluded. Tap a section for contribution evidence.':!services||!hasServicePaths()?(remaining.length?'Grey context paths remain enabled, independently of service geometry.':'Service paths and railway context are hidden.'):usesHubConnections(state)?(pass?'Included direct services on retained railway paths. Inferred tracks; gaps and feed overlap remain.':'Direct train services on each retained railway path. Inferred tracks; gaps and feed overlap remain.'):pass?'Confirmed inclusion and uncertainty are counted separately; conditions apply.':'Frequencies in available data; coverage varies. Dashed paths carry an alignment explanation.';
  if(independentBuses)$('legendNote').textContent='Buses & coaches use their own dates and filters. Coverage is partial; pass inclusion is unknown.';
  updateSourceCount();updateFilterSummary();scheduleBusControlLayout();
}
function updateFilterSummary(){
  const chips=[];
  if(state.mode==='traffic'){if(!state.trains)chips.push(['services','Rail traffic hidden']);}else if(!state.trains||!state.replacements)chips.push(['services',!hasServices()?(busEnabled?'Train layers hidden':'Services hidden'):state.trains?'Trains only':'Replacement buses only']);
  if(state.mode==='traffic'){if(state.inferred===false)chips.push(['geometry','Railway sections hidden']);}else if(state.mode!=='hubs'&&(state.aligned===false||!state.schematic||state.inferred===false)){const choices=[state.aligned!==false,state.inferred!==false,state.schematic!==false];chips.push(['geometry',choices.every(value=>!value)?'Service paths hidden':choices[1]&&!choices[0]&&!choices[2]?'Inferred rail paths only':choices[2]&&!choices[0]&&!choices[1]?'Dotted paths only':!choices[2]?'Railway alignments only':!choices[1]?'Inferred rail paths hidden':'Retained alignments hidden']);}
  if(state.closedCorridors===true)chips.push(['context','Affected railways']);
  if(state.physicalRailways)chips.push(['physical','Physical railway context']);
  if(!state.hubs)chips.push(['stations',state.mode==='hubs'?'Main stations hidden':'City labels hidden']);const stationDisplay=stationDisplayMode(state);if(stationDisplay!=='auto')chips.push(['localStations',stationDisplay==='always'?'Station dots always on':'Station dots hidden']);
  if(state.pass&&!PASS_MODES.has(state.mode))chips.push(['pass','Eurail coverage']);
  if(state.mode==='eurail'&&(state.included===false||state.review))chips.push(['inclusion',state.included===false?(state.review?'Uncertain inclusion only':'No inclusion selected'):'Confirmed + uncertain inclusion']);
  if(chargeFiltered(state))chips.push(['fees',state.charge==='free'?'No mandatory extras':chargeDescription(state)]);
  if(state.day!=='all')chips.push(['day',dateLabel(state.day,dates)]);
  if(threshold(state.min)>0)chips.push(['frequency','At least '+threshold(state.min)+' / day']);
  if(state.sources&&state.defaultSources&&(state.sources.size!==state.defaultSources.size||[...state.sources].some(id=>!state.defaultSources.has(id))))chips.push(['sources',state.sources.size+' timetable sources']);
  const advanced=chips.filter(([key])=>['geometry','context','physical','sources'].includes(key));
  $('advancedControlCount').hidden=!advanced.length;$('advancedControlCount').textContent=advanced.length+' active';
  $('advancedControlSummary').textContent=advanced.length?advanced.map(([,label])=>label).join(' · '):'Sources, geometry and railway context';
  $('filterCount').hidden=!chips.length;$('filterCount').textContent=String(chips.length);
  $('controlsToggle').title=chips.length?'Filters: '+chips.map(chip=>chip[1]).join('; '):'Open map filters';
  const host=$('filterSummary');host.hidden=!chips.length;host.replaceChildren();
  for(const[key,label]of chips){const button=document.createElement('button');button.className='filter-chip';button.dataset.clearFilter=key;button.type='button';button.textContent=label+' ×';button.setAttribute('aria-label','Clear filter: '+label);button.onclick=()=>{clearFilter(key);($('filterSummary').querySelector('button')||$('closeControls')).focus();};host.appendChild(button);}
}
function clearFilter(key){
  if(key==='services'){state.trains=true;state.replacements=true;}
  if(key==='geometry'){state.aligned=true;state.schematic=true;state.inferred=true;}
  if(key==='context')state.closedCorridors=false;
  if(key==='physical')state.physicalRailways=false;
  if(key==='stations')state.hubs=true;if(key==='localStations'){state.stations=true;state.stationDisplay='auto';}
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

function refresh({details=true}={}){if(selected?._cityConnection){const updated=cityConnectionEdges(cityDocument,state,dates).find(edge=>edge.id===selected.id);if(updated)selected=updated;else closeInspector();}if(selectedStation&&!stationInScope(selectedStation,state))closeInspector();if(selected&&!qualifiesEdge(selected,state,dates,stationMap))closeInspector();applyControls();renderer.schedule();renderHubs();coverage.refreshViewport();saveURL();if(details&&selected&&!$('inspector').hidden){if(isPhysicalSection(selected))renderTrafficSection();else renderSelected();}if(details&&selectedStation&&!$('inspector').hidden)renderStationSelected();if(legResult&&state.mode==='leg'&&details)renderJourneyResult(legResult);ensureCountryContextStations();}
function setMode(mode){
  if(mode==='leg')mode='frequency';if(mode==='italy'){mode='countries';state.country='Italy';}
  if(!MODES[mode])return;
  countryChoiceSequence++;countryPickerSequence++;cancelCountryViewportFrame();
  closeOtherContextPanels();state.mode=mode;setControlsOpen(false);stationSearch?.close();closeInspector();refresh();
  if(mode==='hubs')loadCityHubs().catch(()=>{});
  if(mode==='countries'){if(state.country)chooseCountry(state.country).catch(()=>toast('Country data could not load.'));else openCountryPicker().catch(()=>toast('Country choices could not load.'));}
  scheduleChunks();ensurePassPolicies().catch(()=>{});status(MODES[mode].title);
}
function setDay(day){state.day=day;refresh();status('Showing '+dateLabel(day,dates));}
function setupDates(){const select=$('dateSelect'),range=dateRangeLabels(dates);$('snapshotLabel').textContent=range.snapshot.toUpperCase();$('dateRange').textContent=range.long.toUpperCase();select.replaceChildren();for(const[value,label]of[['all','Full week · '+range.short],['weekdays','Weekdays only'],['weekend','Weekend only'],...dates.map((d,i)=>['day-'+i,new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'})])]){const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);}select.value=state.day;select.onchange=()=>setDay(select.value);}
function updateSourceCount(){if(!manifest)return;$('sourceCount').textContent=(state.sources?.size||0)+' / '+manifest.sources.length;$('swissCredit').hidden=!state.sources?.has('ch_gtfs_2026');}
function setupSources(){const list=$('sourceList');list.replaceChildren();for(const source of manifest.sources||[]){const label=document.createElement('label'),input=document.createElement('input'),span=document.createElement('span');input.type='checkbox';input.checked=state.sources.has(source.id);input.value=source.id;span.textContent=source.name||source.id;const small=document.createElement('small');small.textContent=[source.country,source.defaultVisible===false?'alternative / overlapping feed':'recommended coverage'].filter(Boolean).join(' · ');span.appendChild(small);label.append(input,span);list.appendChild(label);input.onchange=()=>{input.checked?state.sources.add(source.id):state.sources.delete(source.id);alternativeSources();refresh();};}updateSourceCount();}
function chooseSources(all){state.sources=new Set(manifest.sources.filter(s=>all||s.defaultVisible!==false).map(s=>s.id));state.alternatives=all;alternativeSources();setupSources();refresh();}
function localDetailPolicy(){return detailLoadingPolicy(manifest,{legacyItaly:!busesOnly()&&state.mode==='italy'&&!!manifest?.files?.italyNetwork});}
function detailZoomThreshold(){return localDetailPolicy().minZoom;}
function scheduleChunks(){clearTimeout(chunkTimer);chunkRun++;if(state.mode==='traffic'){for(const request of chunkRequests.values())request.controller.abort();if(hasServices())ensurePhysicalHeat().catch(()=>{});return;}if(!hasServices()){for(const request of chunkRequests.values())request.controller.abort();return;}if(busesOnly()||state.mode!=='italy'&&!usesHubConnections(state))loadCompleteNetwork().catch(()=>{});if(state.mode==='italy')loadItalyNetwork().catch(()=>{});if(map){const view=map.getBounds().pad(.15);for(const request of chunkRequests.values())if(map.getZoom()<detailZoomThreshold()||usesHubConnections(state)||!boundsIntersect(request.chunk.bounds,view))request.controller.abort();}chunkTimer=setTimeout(loadVisibleChunks,100);}
async function loadItalyNetwork(){
  if(!manifest?.files?.italyNetwork)return;
  if(!italyNetworkPromise)italyNetworkPromise=(async()=>{
    await ensureThroughServices();const url=dataURL(manifest.files.italyNetwork),data=await json(url);
    await mergeStations(data);await addEdges(data.edges||[]);cache.delete(url);
    renderer.schedule();renderHubs();
  })().catch(error=>{italyNetworkPromise=null;toast('Italian timetable layer could not load. Pan or zoom to retry.');throw error;});
  return italyNetworkPromise;
}
function boundsIntersect(bounds,view){if(!Array.isArray(bounds)||bounds.length!==4)return true;const[w,s,e,n]=bounds;return e>=view.getWest()&&w<=view.getEast()&&n>=view.getSouth()&&s<=view.getNorth();}
async function loadVisibleChunks(){
  if(state.mode==='traffic'||!manifest||map.getZoom()<detailZoomThreshold()||usesHubConnections(state)||!hasServices())return;
  await ensureManifest();await ensureOverviewMetadata();await ensureThroughServices();
  if(state.mode==='traffic'||map.getZoom()<detailZoomThreshold()||usesHubConnections(state)||!hasServices())return;
  const run=++chunkRun,view=map.getBounds().pad(.15),candidates=(manifest.chunks||[]).filter(chunk=>(!busesOnly()||chunk.serviceMode==='temporary_replacement_bus')&&boundsIntersect(chunk.bounds,view)),queue=boundedDetailQueue(candidates,chunkLoaded,localDetailPolicy());
  if(!queue.length)return;
  if(!manifest.provenance?.spatialProjection)ensureStations().catch(()=>{});let failed=false;
  async function worker(){while(queue.length){if(run!==chunkRun)return;const chunk=queue.shift(),request={chunk,controller:new AbortController()};chunkLoaded.add(chunk.id);chunkRequests.set(chunk.id,request);try{const url=dataURL(chunk.url),data=await json(url,{signal:request.controller.signal});if(request.controller.signal.aborted)throw new DOMException('Data request cancelled','AbortError');if(data.stations)await mergeStations(data,{paint:false});await addEdges(data.edges||data);cache.delete(url);paintChunks();}catch(error){if(chunkRequests.get(chunk.id)===request)chunkLoaded.delete(chunk.id);if(error.name!=='AbortError'){failed=true;console.warn('Euro Rail chunk unavailable:',chunk.id);}}finally{if(chunkRequests.get(chunk.id)===request)chunkRequests.delete(chunk.id);}}}
  await Promise.all(Array.from({length:Math.min(3,queue.length)},worker));
  if(run===chunkRun)paintChunks(true);
  if(failed)toast('Some local lines could not load. Pan or zoom to retry.');
  if(state.edge&&!selected&&findDisplayedEdge(state.edge))pickEdge(findDisplayedEdge(state.edge),false);
}
async function loadHubsData(){ensureContinuationGeometry().catch(()=>{});if(hubEdges.length||!manifest?.files?.hubConnections){renderer.schedule();return;}try{await ensureThroughServices();const data=await json(dataURL(manifest.files.hubConnections));hubCities=(data.hubs||[]).map(h=>({...h,_name:normalize(h.name)}));for(const h of hubCities)hubMap.set(h.id,h);hubEdges=(data.edges||[]).map(prepareEdge).filter(Boolean);hubVersion++;searchList=[...hubCities,...stationList];renderer.schedule();renderHubs();if(state.mode==='leg'&&stationList.length&&resolvedStation(state.from)&&resolvedStation(state.to)){for(const field of ['from','to'])$(field==='from'?'fromStation':'toStation').value=resolvedStation(state[field]).name;compareStations();}if(state.edge&&!selected){const edge=findDisplayedEdge(state.edge);if(edge)pickEdge(edge,false);}}catch(error){toast('City connections could not load. Please retry this view.');}}
async function mergeStations(data,{full=false,paint=true}={}){
  let count=0;const hubs=new Set(data.hubs||[]);
  for(const station of data.stations||data){if(hubs.has(station.id))station.hub=true;stationCatalog.addSource(stationWithContinuationSources(station,continuationStationSources));if(++count%250===0)await pauseWork();}
  for(const station of data.canonicalStations||[]){stationCatalog.addCanonical(stationWithContinuationSources(station,continuationStationSources));if(++count%250===0)await pauseWork();}
  stationList=stationCatalog.values();countryPairsKey='';searchList=[...hubCities,...stationList];if(full)fullStationsLoaded=true;
  // Country context is withheld until actual station geography is available.
  // Reconcile it when the asynchronous catalogue arrives, even with no pan.
  if(state.mode==='countries')applyControls();
  for(const field of ['from','to'])if(state[field]&&resolvedStation(state[field])){const s=resolvedStation(state[field]);state[field]=s.id;$(field==='from'?'fromStation':'toStation').value=s.name;}
  if(paint){renderHubs();renderer.schedule();}return stationList;
}
function loadBootstrapStations(){if(!bootstrapStationPromise){const path=manifest.files.overviewStations||manifest.files.stations;bootstrapStationPromise=json(dataURL(path)).then(data=>mergeStations(data,{full:!manifest.files.overviewStations})).catch(error=>{bootstrapStationPromise=null;throw error;});}return bootstrapStationPromise;}
async function ensureStations(){if(fullStationsLoaded)return stationList;if(!stationLoadPromise)stationLoadPromise=(async()=>{await ensureManifest();await loadBootstrapStations();if(!fullStationsLoaded){const url=dataURL(manifest.files.stations),data=await json(url);await mergeStations(data,{full:true});cache.delete(url);}return stationList;})().catch(error=>{stationLoadPromise=null;throw error;});return stationLoadPromise;}
function loadHubs(){return loadCityHubs();}
function loadHubCities(){
  if(!manifest?.files?.hubCities)return loadHubs();
  if(!hubCitiesPromise)hubCitiesPromise=json(dataURL(manifest.files.hubCities)).then(data=>{hubCities=data.hubs||[];for(const h of hubCities){h._name=normalize(h.name);hubMap.set(h.id,h);}searchList=[...hubCities,...stationList];renderHubs();}).catch(()=>{hubCitiesPromise=null;});
  return hubCitiesPromise;
}
function cityConnections(id){const neighbors=new Set();for(const edge of hubEdges){if(!edgeInScope(edge,state)||edge.a!==id&&edge.b!==id)continue;if(state.sources&&!state.sources.has(edge.source))continue;if(edge.primary===false&&!state.alternatives&&!state.altSourceIds?.has(edge.source))continue;if(edgeCount(edge,state,dates)>0)neighbors.add(edge.a===id?edge.b:edge.a);}return neighbors.size;}
function renderHubs(){
  if(!map||!markers)return;
  map.getContainer().dataset.hubStationMarkers='0';
  renderStationMarkers();markers.clearLayers();
  if(trainFocusGroup){renderTrainStops();return;}
  if(selectedStation||!state.hubs)return;
  const bounds=map.getBounds(),zoom=map.getZoom();
  if(state.mode==='hubs'){
    const stations=cityDocument?mainHubStations(stationList,cityDocument.cities,currentEdges(),state,dates).filter(s=>bounds.contains([s.lat,s.lon])):[];
    for(const s of stations)L.circleMarker([s.lat,s.lon],{renderer:stationMarkers.renderer,radius:zoom<6?4.2:4.8,color:'#173f3b',weight:1.5,fillColor:'#fbfaf6',fillOpacity:1,interactive:true,bubblingMouseEvents:false,className:'hub-main-station'}).addTo(markers).on('click',()=>{setMode('frequency');pickStation(s,{inspect:true});});
    map.getContainer().dataset.hubStationMarkers=String(stations.length);return;
  }
  let candidates=hubCities.length?hubCities:stationList.filter(s=>s.hub);
  candidates=candidates.filter(s=>stationInScope(s,state)&&(!stationSources(s).length||stationSourceSelected(s,state))&&(!effectivePass(state)||!Number.isFinite(s.eurailWeekly)||s.eurailWeekly>0)&&validMapLocation(s.lon,s.lat)&&bounds.contains([s.lat,s.lon])&&(state.mode!=='italy'||isItaly(s.country))).sort((a,b)=>(b.weekly||b.degree||0)-(a.weekly||a.degree||0));
  const positions=[];let shown=0;
  for(const s of candidates){
    const point=map.latLngToContainerPoint([s.lat,s.lon]);
    if(positions.some(p=>Math.hypot(p.x-point.x,p.y-point.y)<(zoom<5?80:zoom<6?65:50)))continue;
    positions.push(point);
    // City catchment centres provide labels, not station locations. Only
    // recorded stations and route stops draw dots on the map.
    const name=shortName(s).replace(/\s*(Hbf|Centrale|Central|Termini|HB|Centraal|Centrální|Hlavní nádraží)$/i,'').trim();
    L.marker([s.lat,s.lon],{interactive:false,icon:L.divIcon({className:'city-label'+(shown<7?' strong':''),html:esc(name),iconSize:[120,20],iconAnchor:[0,-2]})}).addTo(markers);
    if(++shown>=(zoom<5?17:35))break;
  }
}
function renderTrainStops(){
  const calls=trainFocusGroup.stops.map(call=>station(callId(call)));
  calls.forEach((s,i)=>{
    if(!stationInScope(s,state)||!validMapLocation(s.lon,s.lat))return;const end=i===0||i===calls.length-1;
    if(!stationMemberIds(selectedStation).includes(s.id))L.circleMarker([s.lat,s.lon],{renderer:stationMarkers.renderer,radius:end?4.5:3.7,color:'#173f3b',weight:1.5,fillColor:'#fbfaf6',fillOpacity:1,interactive:true,bubblingMouseEvents:false}).addTo(markers).on('click',()=>pickStation(s,{inspect:true}));
    if(end&&!stationMemberIds(selectedStation).includes(s.id)){
      const point=map.latLngToContainerPoint([s.lat,s.lon]);
      // Declutter labels near the selected pin without merging station IDs.
      if(selectedStation&&validMapLocation(selectedStation.lon,selectedStation.lat)&&point.distanceTo(map.latLngToContainerPoint([selectedStation.lat,selectedStation.lon]))<28)return;
      const left=point.x>(map.getSize().x-(matchMedia('(max-width:600px)').matches?24:440))/2;L.marker([s.lat,s.lon],{pane:'stationNodes',interactive:false,icon:L.divIcon({className:'city-label strong route-stop-label',html:`<span${left?' class="route-label-left"':''}>${esc(shortName(s))}</span>`,iconSize:[180,28],iconAnchor:[0,-3]})}).addTo(markers);
    }
  });
  stationMarkers.bringSelectedToFront();
}
async function pickHubStation(s){
  // Migrate an old city-catchment link into the current city explorer.
  try{await loadCityHubs();const city=cityDocument.cities.find(city=>normalize(city.name)===normalize(s.name)&&city.country===s.country);
    setMode('hubs');state.hubCity=city?.id||'';if(city&&city.rank>state.hubCount)state.hubCount=[50,100,250,500].find(n=>n>=city.rank);
    renderCityOptions();refresh();await loadCityHubs();if(validMapLocation(s.lon,s.lat))map.setView([s.lat,s.lon],7,{animate:false});
  }catch{toast('City connections could not load. Please retry.');}
}
function renderStationMarkers(){
  if(!stationMarkers)return;stationMarkers.render();
  if(manifest&&state.mode!=='hubs'&&stationDisplayMode(state)!=='hidden'&&(stationDisplayMode(state)==='always'||map.getZoom()>=stationZoomForViewport(map.getSize()))&&!fullStationsLoaded&&!stationMarkerLoad){
    stationMarkerLoad=ensureStations().then(()=>stationMarkers.render()).catch(()=>{}).finally(()=>{stationMarkerLoad=null;});
  }
}
function loadCityAreas(){
  const app=new URL(import.meta.url),url=new URL('./rail-city-areas.json.gz',app);url.search=app.search;
  return json(url.href).then(data=>data.cities);
}
function stationReference(s){return{id:'station:'+s.id,_stationIds:s.isCityArea?s.memberIds:stationMemberIds(s),a:s.id,b:s.id,source:s.source};}
async function ensureStationServices(s,{signal}={}){
  const ref=stationReference(s);if(edgePublicNumbers.has(ref.id))return;
  return sharedPublicNumberRequest(ref.id,signal,async()=>{
    await ensureManifest();ensureNativePublicNumbers();await ensureStations();const ids=new Set(ref._stationIds),index=await json(dataURL(manifest.files.journeyLookup)),files=indexedJourneyFiles(index,ids,ids);
    const journeys=await dataLoader.findStationJourneys(files.map(file=>dataURL(file.url)),ids,{signal});
    if(s.isCityArea)for(const key of edgePublicNumbers.keys())if(key.startsWith('station:city:')&&key!==ref.id)edgePublicNumbers.delete(key);
    const matching=s.isCityArea?journeys.filter(journey=>journey.stops.some(call=>ids.has(callId(call))&&passengerCall(call))):journeys;
    edgePublicNumbers.set(ref.id,{journeys:matching});stationErrors.delete(s.id);while(edgePublicNumbers.size>16)edgePublicNumbers.delete(edgePublicNumbers.keys().next().value);
  });
}
function pickStation(s,{inspect=false,center=false,restore=false}={}){
  s=resolvedStation(s.id)||s;
  if(!stationInScope(s,state))return;
  if(s.isCityArea)s={...s,memberIds:cityAreaStationIds(s,stationMap.values()).filter(id=>stationInScope(stationMap.get(id),state))};
  if(state.mode==='traffic')setMode('frequency');
  cancelInspectorLookup();detailSequence++;selectedStation=null;clearStationFocus();trainInspector.reset();clearTrainFocus(false);state.station='';document.body.classList.remove('station-inspector-open');
  if(s.memberStationCount)return pickHubStation(s);
  if(state.mode==='leg'&&!inspect&&!center){setStationField(state.from?'to':'from',s);return;}
  const signal=beginInspectorLookup();
  selected=null;legResult=null;selectedStation=s;stationErrors.delete(s.id);state.edge='';state.station=s.id;document.body.classList.add('station-inspector-open');showInspector();
  const phone=matchMedia(MOBILE_LAYOUT).matches;
  if(s.isCityArea){if(center)map.fitBounds(cityAreaBounds(s),{...mapFramePadding(),maxZoom:11,animate:false});}
  else if(validMapLocation(s.lon,s.lat)&&(center||phone&&!restore)){
    map.setView([s.lat,s.lon],center?Math.max(11,map.getZoom()):map.getZoom(),{animate:false});
  }
  renderStationSelected();$('inspector').scrollTop=0;
  renderHubs();renderer.schedule();saveURL();const ticket=detailSequence;
  ensureStationServices(s,{signal}).then(()=>{if(ticket===detailSequence&&selectedStation?.id===s.id)renderStationSelected();}).catch(error=>{if(error.name==='AbortError')return;stationErrors.add(s.id);if(ticket===detailSequence&&selectedStation?.id===s.id)renderStationSelected();});
  status('Selected '+s.name);
}
function renderStationSelected(){
  const s=selectedStation;if(!s)return;
  const ref=stationReference(s),journeys=edgePublicNumbers.get(ref.id)?.journeys,groups=groupStationRoutes(journeys,new Set(ref._stationIds),state,dates);
  focusStationRoutes(s,groups,!!journeys);
  if(s.isCityArea)return renderCityArea(s,ref,journeys,groups);
  const count=groups.reduce((n,g)=>n+g.count,0),daily=dates.map((_,i)=>groups.reduce((n,g)=>n+g.daily[i],0)),nearby=nearbyStationRecords(s,stationList.filter(row=>stationInScope(row,state))),inactive=!stationSourceSelected(s,state);
  $('inspectorContent').innerHTML=`<p class="eyebrow">RECORDED STATION</p><h3>${esc(s.name)}</h3><p class="subline">${esc(s.country||'Country unresolved')} · ${esc(dateLabel(state.day,dates))}</p><p class="station-source">${esc(stationSourceText(s))}</p>${journeys?`<div class="detail-stat"><strong>${fmt(count/selectedDayCount())}</strong><span>scheduled services calling here / day</span></div>${weeklyChart({daily},false,daily)}`:`<p class="helper" role="status">${stationErrors.has(s.id)?'Station services could not load. Retry below.':'Loading services at this station…'}</p>`}${inactive?'<p class="helper">This station’s sources are outside your current selection. <button class="text-button" id="includeStationSource">Include station sources →</button></p>':''}${validMapLocation(s.lon,s.lat)?'':'<p class="helper">This source has no usable map location. Its station, recorded dates and available timetables remain searchable.</p>'}<div class="station-actions"><button class="primary-button" id="stationFrom">Show on map →</button><button class="primary-button" id="stationTo">Clear selection</button></div><div id="segmentTrains"></div>${nearby.length?`<details class="nearby-stations"><summary>Nearby station records</summary><p class="helper">Separate source records or platforms. No interchange or duplicate-service merger is assumed.</p>${nearby.map(item=>`<button class="nearby-station" data-nearby-station="${esc(item.id)}"><strong>${esc(item.name)}</strong><small>${esc(stationSourceText(item))}</small></button>`).join('')}</details>`:''}<p class="detail-note">Counts use your selected date, sources and service/pass filters. Each recorded service is counted once here, even if it visits this station twice. Source feeds can overlap. Boarding restrictions are shown on the selected departure’s stop list.</p>`;
  const boardingAreas=stationBoardingAreas(s);
  if(boardingAreas.length>1){
    const details=document.createElement('details');details.className='station-boarding-areas nearby-stations';
    const summary=document.createElement('summary');summary.textContent='Boarding areas';details.appendChild(summary);
    const note=document.createElement('p');note.className='helper';note.textContent='See each service’s stop list for its recorded boarding stop and restrictions.';details.appendChild(note);
    const list=document.createElement('ul');for(const area of boardingAreas){const item=document.createElement('li');item.textContent=area.name+(area.category?' · '+area.category:'');list.appendChild(item);}details.appendChild(list);$('segmentTrains').before(details);
  }
  const showStationMap=()=>{if(validMapLocation(s.lon,s.lat))map.panTo([s.lat,s.lon],{animate:false});if(mobileSheets?.mobile)mobileSheets.collapse();};
  const focusNote=document.createElement('div');focusNote.className='route-focus-note station-focus-note';focusNote.innerHTML=`<span>${journeys?(groups.length?'Routes through this station highlighted':'No routes match the current filters'):stationErrors.has(s.id)?'Station routes unavailable':'Finding routes through this station…'}</span><button class="text-button" id="restoreStationMap">Restore map</button>`;$('segmentTrains').before(focusNote);$('restoreStationMap').onclick=closeInspector;
  $('stationFrom').onclick=showStationMap;$('stationTo').onclick=closeInspector;
  $('includeStationSource')?.addEventListener('click',()=>{for(const source of stationSources(s))state.sources.add(source);alternativeSources();setupSources();refresh();});
  document.querySelectorAll('[data-nearby-station]').forEach(button=>button.onclick=()=>pickStation(station(button.dataset.nearbyStation),{inspect:true}));
  trainInspector.render(ref,stationErrors.has(s.id));bindChart();
}
function renderCityArea(city,ref,journeys,groups){
  const stations=city.memberIds.filter(id=>stationFocus.stations.has(id)).map(station)
    .sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  const failed=stationErrors.has(city.id);
  $('inspectorContent').innerHTML=`<p class="eyebrow">CITY STATIONS</p><h3>${esc(city.name)}</h3><p class="subline">${esc(city.country)} · Within ${cityAreaRadius(city)} km · ${esc(dateLabel(state.day,dates))}</p><p class="station-source">Routes with a permitted call at a recorded station in this approximate city area.</p>${journeys?`<div class="detail-stat"><strong>${fmt(groups.length)}</strong><span>route groups · ${fmt(stations.length)} matching source station records</span></div>`:`<p class="helper" role="status">${failed?'City services could not load. Retry below.':'Finding services through this city…'}</p>`}<div class="station-actions city-area-actions"><button class="primary-button" id="cityFitRoutes"${groups.length?'':' disabled'}>Fit all routes</button><button class="primary-button" id="cityShowStations">Show city stations</button><button class="text-button" id="cityClear">Clear selection</button></div>${stations.length?`<details class="nearby-stations"><summary>Stations and platforms (${fmt(stations.length)})</summary>${stations.map(s=>`<button class="nearby-station" data-city-station="${esc(s.id)}"><strong>${esc(s.name)}</strong><small>${esc(stationSourceText(s))}</small></button>`).join('')}</details>`:journeys?'<p class="helper">No permitted city-area calls match the current filters.</p>':''}<div id="segmentTrains"></div><p class="detail-note">City names and centres adapted from <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.</p>`;
  function fit(points,maxZoom){
    if(!points.length)return;
    if(mobileSheets?.mobile)mobileSheets.collapse();
    map.fitBounds(points,{...mapFramePadding(),maxZoom,animate:false});
  }
  $('cityFitRoutes').onclick=()=>fit([...stationFocus.stations].map(station).filter(s=>validMapLocation(s.lon,s.lat)).map(s=>[s.lat,s.lon]),10);
  $('cityShowStations').onclick=()=>fit(cityAreaBounds(city),11);
  $('cityClear').onclick=closeInspector;
  $('inspectorContent').querySelectorAll('[data-city-station]').forEach(button=>button.onclick=()=>pickStation(station(button.dataset.cityStation),{inspect:true,center:true}));
  trainInspector.render({...ref,_cityArea:true,cityGroups:groups},failed);
}
function showInspector(){closeOtherContextPanels();if(mobileSheets?.mobile)setControlsOpen(false);$('inspector').hidden=false;$('inspector').scrollTop=0;$('inspectorScroll').scrollTop=0;if(mobileSheets?.mobile)mobileSheets.expand();}
function closeInspector(){overlapChoice=null;cancelInspectorLookup();selectedStation=null;clearStationFocus();state.station='';document.body.classList.remove('station-inspector-open');trainInspector.reset();clearTrainFocus(true);detailSequence++;selected=null;legResult=null;journeyHighlights.clear();state.edge='';$('inspector').hidden=true;renderer?.schedule();saveURL();}
function policyStatuses(rows,field){const values=new Set();for(const row of rows){const raw=row?.[field];if(typeof raw==='string')values.add(raw);else if(raw&&typeof raw==='object')for(const [key,count]of Object.entries(raw))if(Number(count)>0)values.add(key);}return[...values].join(' · ').replaceAll('_',' ');}
async function ensureEdgePublicNumbers(edge,{signal}={}){
  if(edgePublicNumbers.has(edge.id))return;
  return sharedPublicNumberRequest(edge.id,signal,async()=>{
    await ensureManifest();ensureNativePublicNumbers();if(!manifest.files.journeyLookup)return;
    if(edge._cityConnection){
      await ensureStations();const ids=new Set(edge._stationIds),wanted=new Set((edge._directionEdges||[edge]).flatMap(row=>(row.journeyIds||[]).map(id=>JSON.stringify([row.source,row.snapshot,id,row.primary!==false]))));
      const index=await json(dataURL(manifest.files.journeyLookup)),choices=indexedJourneyFiles(index,ids,ids);
      const rows=await dataLoader.findStationJourneys(choices.map(choice=>dataURL(choice.url)),ids,{signal});
      const journeys=rows.filter(journey=>wanted.has(JSON.stringify([journey.source,journey.snapshot,journey.id,journey.agencyPrimary!==false])));
      edgeServiceErrors.delete(edge.id);edgePublicNumbers.set(edge.id,{journeys,all:[],included:[],conditional:[]});return;
    }
    const isHub=usesHubConnections(state)&&!edge.availabilityOnly,directions=(edge._directionEdges||[edge]).map(({id,source,a,b,primary,serviceMode})=>({id,source,a,b,primary,serviceMode,isHub,throughConnection:!!edge.throughConnection}));
    if(isHub)await ensureStations();
    const members=id=>isHub?[...stationMap.values()].filter(station=>station.hubId===id).map(station=>station.id):[id];
    const index=await json(dataURL(manifest.files.journeyLookup)),choices=indexedJourneyFiles(index,new Set(directions.flatMap(e=>members(e.a))),new Set(directions.flatMap(e=>members(e.b))));
    const journeys=choices.length?await dataLoader.findEdgeJourneys(choices.map(choice=>dataURL(choice.url)),directions,{signal}):[];
    await ensureStations();edgeServiceErrors.delete(edge.id);
    const labeledJourneys=journeys.map(journey=>({...journey,publicTrains:nativePublicTrainLabels(journey)}));
    edgePublicNumbers.set(edge.id,{journeys,all:journeyPublicTrainLines(labeledJourneys,edge),
      included:journeyPublicTrainLines(labeledJourneys,edge,{fields:['eurailDaily','reviewedEurailDaily']}),
      conditional:journeyPublicTrainLines(labeledJourneys,edge,{fields:['conditionalDaily']})});
    while(edgePublicNumbers.size>16)edgePublicNumbers.delete(edgePublicNumbers.keys().next().value);
  });
}
async function detailsFor(edge){if(edge._cityConnection)return null;await ensureManifest();if(edge._directionEdges){const details=await Promise.all(edge._directionEdges.map(detailsFor));const grouped=new Map();for(let i=0;i<details.length;i++){for(const line of details[i]?.lines||[]){const key=JSON.stringify([line.label,line.operator,line.source||edge.source,line.serviceMode||'rail']);if(!grouped.has(key)){const row={...line,source:line.source||edge.source,publicTrains:[],sleepServices:[]};for(const f of ['daily','eurailDaily','boardableDaily','eurailBoardableDaily','conditionalDaily','conditionalBoardableDaily','reviewedEurailDaily','reviewedEurailBoardableDaily','reviewedConditionalDaily','reviewedConditionalBoardableDaily'])row[f]=Array(7).fill(0);for(const f of ['weekly','eurailWeekly','boardableWeekly','eurailBoardableWeekly','conditionalWeekly','conditionalBoardableWeekly','reviewedEurailWeekly','reviewedEurailBoardableWeekly','reviewedConditionalWeekly','reviewedConditionalBoardableWeekly'])row[f]=0;grouped.set(key,row);}const row=grouped.get(key);for(const f of ['daily','eurailDaily','boardableDaily','eurailBoardableDaily','conditionalDaily','conditionalBoardableDaily','reviewedEurailDaily','reviewedEurailBoardableDaily','reviewedConditionalDaily','reviewedConditionalBoardableDaily'])for(let d=0;d<7;d++)row[f][d]+=Number(line[f]?.[d])||0;for(const f of ['weekly','eurailWeekly','boardableWeekly','eurailBoardableWeekly','conditionalWeekly','conditionalBoardableWeekly','reviewedEurailWeekly','reviewedEurailBoardableWeekly','reviewedConditionalWeekly','reviewedConditionalBoardableWeekly'])row[f]+=Number(line[f])||0;row.publicTrains.push(...(line.publicTrains||[]));row.sleepServices=mergeSleepServices(row.sleepServices,line.sleepServices);}}const result={lines:[...grouped.values()],otherLines:details.reduce((sum,row)=>sum+(Number(row?.otherLines)||0),0),reviewedRuleIds:[...new Set(details.flatMap(row=>row?.reviewedRuleIds||[]))],reservation:policyStatuses(details,'reservation'),supplement:policyStatuses(details,'supplement'),directions:edge._directionEdges.map((e,i)=>({from:e.a,to:e.b,count:edgeCount(e,state,dates),calledFromStation:details[i]?.calledFromStation||e.calledFromStation,calledToStation:details[i]?.calledToStation||e.calledToStation}))};detailData.set(edge.id,result);return result;}if(detailData.has(edge.id))return detailData.get(edge.id);const chunk=edge.detailChunk;if(!chunk)return null;let path=typeof chunk==='string'?chunk:chunk.url;if(manifest.detailChunks&&typeof chunk==='string'){const found=manifest.detailChunks.find(c=>c.id===chunk);if(found)path=found.url;}const data=await json(dataURL(path));const rows=data.legs||data.edges||data.details||data;if(Array.isArray(rows)){for(const r of rows)if(r.id)detailData.set(r.id,r);}else if(rows&&typeof rows==='object'){for(const[id,row]of Object.entries(rows))detailData.set(id,{id,...row});}return detailData.get(edge.id)||null;}
// Station pairs of one service are drawn along the same rails, so a stretch of
// track usually carries several of them (Basel–Olten, Basel–Bern, Basel–Domodossola…).
// A click offers every pair drawn there, busiest first, rather than opening
// whichever happened to be painted on top.
let overlapChoice=null;
const OVERLAP_LIMIT=14;
async function pickAt(edge,stack=[]){
  const rows=(stack||[]).filter(row=>!isPhysicalSection(row)&&!row._cityConnection);
  if(isPhysicalSection(edge)||edge._cityConnection||rows.length<2||state.mode==='traffic'||usesHubConnections(state))return pickEdge(edge);
  cancelInspectorLookup();selectedStation=null;clearStationFocus();state.station='';document.body.classList.remove('station-inspector-open');trainInspector.reset();clearTrainFocus(false);
  const ticket=++detailSequence;selected=null;legResult=null;journeyHighlights.clear();state.edge='';overlapChoice=null;
  showInspector();$('inspectorContent').innerHTML='<p class="detail-note">Loading the connections on this track…</p>';renderer.schedule();
  const ranked=rows.map(row=>({row,count:edgeCount(row,state,dates)})).sort((a,b)=>b.count-a.count).slice(0,OVERLAP_LIMIT);
  let hydrated;
  try{if(manifest.files.throughServices)await ensureThroughServices();hydrated=await Promise.all(ranked.map(({row})=>row._displayOnly?hydrateDisplayEdge(row):row));}
  catch{if(ticket===detailSequence)return pickEdge(edge);return;}
  if(ticket!==detailSequence)return;
  const seen=new Set(),edges=hydrated.map(attachPassPolicy).filter(row=>row&&!seen.has(row.id)&&seen.add(row.id)&&qualifiesEdge(row,state,dates,stationMap));
  if(edges.length<2)return pickEdge(edges[0]||edge);
  overlapChoice={edges,total:Math.max(rows.length,edges.length)};renderOverlapChoice();saveURL();
}
function renderOverlapChoice(){
  const choice=overlapChoice;if(!choice)return;
  const days=selectedDayCount(),groups=new Map();
  // One row per station pair. Dated variants within a source add up; the same
  // pair published by several feeds is usually the same trains twice, so the
  // row shows the largest feed rather than a sum, and opens that feed's pair.
  for(const row of choice.edges){
    if(!qualifiesEdge(row,state,dates,stationMap))continue;
    const count=edgeCount(row,state,dates)/days,label=`${shortName(station(row.a))} ${bothDirections(row)?'↔':'→'} ${shortName(station(row.b))}`,key=JSON.stringify([label,isTemporaryReplacement(row)]);
    let group=groups.get(key);if(!group)groups.set(key,group={label,sources:new Map()});
    const source=group.sources.get(row.source);
    if(!source)group.sources.set(row.source,{row,count,best:count,variants:1});
    else{source.count+=count;source.variants++;if(count>source.best){source.best=count;source.row=row;}}
  }
  const list=[...groups.values()].map(group=>{const ranked=[...group.sources.values()].sort((a,b)=>b.count-a.count);return{...ranked[0],label:group.label,feeds:ranked.length};}).sort((a,b)=>b.count-a.count);
  selected=null;state.edge='';showInspector();
  $('inspectorContent').innerHTML=`<p class="eyebrow">CONNECTIONS ON THIS TRACK</p><h3>${fmt(choice.total)} station pairs share this stretch</h3><p class="detail-note">Each line joins two recorded stops of the same service, so local and long-distance pairs are drawn along the same rails. Choose a pair for its services; busiest first. Rail traffic shows totals for the shared track.</p><div class="overlap-list">${list.map(({row,label,count,variants,feeds},i)=>`<button type="button" class="overlap-row" data-overlap="${i}"><i style="background:${FREQUENCY_COLORS[frequencyBand(count)]}"></i><strong>${esc(label)}</strong><span>${fmt(count)} ${row.throughConnection?'through services':'services'} / day · ${esc(sourceName(row.source))}${isTemporaryReplacement(row)?' · replacement bus':''}${variants>1?` · ${variants} dated variants`:''}${feeds>1?` · also in ${feeds-1} other ${feeds===2?'feed':'feeds'}`:''}</span></button>`).join('')}</div>${choice.total>choice.edges.length?`<p class="detail-note">Busiest ${choice.edges.length} of ${fmt(choice.total)} pairs listed. Zoom in to separate nearby lines.</p>`:''}`;
  document.querySelectorAll('[data-overlap]').forEach(button=>button.onclick=()=>pickEdge(list[Number(button.dataset.overlap)].row,false,true));
  renderer.schedule();
}
function renderOverlapBack(){
  if(!overlapChoice||!selected||!overlapChoice.edges.some(row=>row.id===selected.id)||document.getElementById('overlapBack'))return;
  const back=document.createElement('button');back.type='button';back.id='overlapBack';back.className='overlap-back';back.textContent=`← ${fmt(overlapChoice.total)} connections on this track`;
  back.onclick=()=>{detailSequence++;cancelInspectorLookup();renderOverlapChoice();saveURL();};$('inspectorContent').prepend(back);
}
async function pickEdge(edge,animate=true,keepOverlap=false){if(!keepOverlap)overlapChoice=null;if(isPhysicalSection(edge))return pickTrafficSection(edge,animate);const signal=beginInspectorLookup();selectedStation=null;clearStationFocus();state.station='';document.body.classList.remove('station-inspector-open');trainInspector.reset();clearTrainFocus(false);const selection=++detailSequence;if(manifest.files.throughServices){try{await ensureThroughServices();}catch{toast('Connection availability could not load. Please retry.');return;}}if(edge?._displayOnly){status('Loading this connection’s stops and services.');try{edge=await hydrateDisplayEdge(edge);}catch{toast('Connection details could not load. Please retry.');return;}}if(selection!==detailSequence)return;edge=attachPassPolicy(edge);if(!qualifiesEdge(edge,state,dates,stationMap))return;selected=edge;legResult=null;journeyHighlights.clear();state.edge=edge.id;showInspector();renderSelected();renderer.schedule();saveURL();if(animate&&map.getZoom()<6){const point=stationMapPoint(station(edge.a))||edge.coords?.find(p=>validMapLocation(p[0],p[1]))?.slice().reverse();if(point)map.panTo(point,{animate:true});}const ticket=++detailSequence;ensureEdgePublicNumbers(edge,{signal}).then(()=>{if(ticket===detailSequence&&selected?.id===edge.id)renderSelected();}).catch(error=>{if(error.name==='AbortError')return;edgeServiceErrors.add(edge.id);if(ticket===detailSequence&&selected?.id===edge.id)renderSelected();});try{await detailsFor(edge);if(ticket===detailSequence&&selected?.id===edge.id)renderSelected();}catch(error){if(ticket===detailSequence)$('inspectorContent').insertAdjacentHTML('beforeend','<p class="detail-note">Detailed service mix could not load. The route and recorded frequency remain available.</p>');}}
function weeklyChart(row,pass=effectivePass(state),override=null){const counts=row;row=edgeMetrics(row,state,dates);const boarding=usesHubConnections(state),base=boarding?'eurailBoardableDaily':'eurailDaily',reviewed=boarding?'reviewedEurailBoardableDaily':'reviewedEurailDaily',daily=override||(chargeFiltered(state)?dates.map((_,i)=>edgeCount(counts,{...state,day:'day-'+i},dates)):pass?dates.map((_,i)=>(Number(row[base]?.[i])||0)+(Number(row[reviewed]?.[i])||0)):(row.daily||[])),max=Math.max(1,...daily);return`<div class="weekly-chart" aria-label="Scheduled services by service date">${dates.map((date,i)=>`<button data-chart-day="day-${i}" class="${selectedDays(state.day,dates).includes(i)?'active':''}" style="height:${Math.max(3,((daily[i]||0)/max)*42)}px" title="${esc(date)}: ${fmt(daily[i]||0)} services" aria-label="Show ${esc(date)}, ${fmt(daily[i]||0)} services"><span>${['S','M','T','W','T','F','S'][i]}</span></button>`).join('')}</div>`;}
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
function renderCitySelected(){
  const edge=selected,a=station(edge.a),b=station(edge.b),pass=effectivePass(state),count=edgeCount(edge,state,dates);
  $('inspectorContent').innerHTML=`<p class="eyebrow">DIRECT CITY CONNECTION</p><h3>${esc(a.name)} <span class="connection-arrow">${bothDirections(edge)?'↔':'→'}</span> ${esc(b.name)}</h3><p class="subline">${esc(dateLabel(state.day,dates))} · ${esc(directionLabel(edge))}</p><div class="detail-stat"><strong>${fmt(count/selectedDayCount())}</strong><span>${pass?'included ':''}direct train services / day</span></div>${weeklyChart(edge,pass)}${continuationAvailabilityNote(edge)?'<p class="helper">'+esc(continuationAvailabilityNote(edge))+'</p>':''}<p class="helper">One recorded train calls in both cities; it may stop in other cities in between. Colors count services using this retained railway path. Routes can differ between the same cities; exact operating tracks remain unverified.${edge.railGeometryMissingLegs?' '+fmt(edge.railGeometryMissingLegs)+' unsupported rail leg'+(edge.railGeometryMissingLegs===1?' is':'s are')+' left as gaps.':''}</p><div class="station-actions"><button class="primary-button" id="cityFrom">More from ${esc(a.name)}</button><button class="primary-button" id="cityTo">More from ${esc(b.name)}</button></div><div id="segmentTrains"></div><p class="detail-note">${esc(sourceName(edge.source))}. Source feeds can overlap. Counts retain boarding and alighting restrictions. City catchments group geographic areas for this view; they do not merge station identities or promise a transfer.</p>`;
  for(const[id,city]of[['cityFrom',a],['cityTo',b]])$(id).onclick=()=>{state.hubCity=city.id;renderCityOptions();closeInspector();refresh();};
  trainInspector.render(edge,edgeServiceErrors.has(edge.id));bindChart();
}
function renderSelected(){
  if(!selected)return;
  if(selected._cityConnection){renderCitySelected();return;}
  const edge=selected,detail=detailData.get(edge.id),a=station(edge.a),b=station(edge.b),pass=effectivePass(state),count=edgeCount(edge,state,dates),review=pass&&state.review?conditionalCount(edge,state,dates):0,reviewed=pass?reviewedCount(edge,state,dates):0,canonical=pass?sumDays(edgeMetrics(edge,state,dates),state.day,dates,usesHubConnections(state)?'eurailBoardableDaily':'eurailDaily',usesHubConnections(state)?'eurailBoardableWeekly':'eurailWeekly'):0;
  const lines=detail?.lines||[],duration=edge.throughConnection?null:detail?.durationMin,source=sourceById(edge.source),onlyReview=!count&&review>0,directions=edge._directionEdges||[edge];
  const alignmentHTML=lineInformation(edge,{uncertain:review>0}).map(note=>`<section class="line-explanation"><h4>${esc(note.title)}</h4><p>${esc(note.text)}</p></section>`).join('');
  const frequencyInfo=connectionFrequencyInformation(edge,{day:state.day,dates,detail}),frequencyHTML=usesHubConnections(state)?'':`<section class="frequency-explanation line-explanation"><h4>What this count includes</h4><p>${esc(frequencyInfo.scope)}</p>${frequencyInfo.boardingRestricted?`<p class="boarding-restriction">${esc(frequencyInfo.boardingNote)}</p>`:''}</section>`;
  const directionHTML=directions.length>1?`<div class="direction-summary">${directions.map(e=>`<div><span>${esc(shortName(station(e.a)))} → ${esc(shortName(station(e.b)))}</span><strong>${fmt(edgeCount(e,state,dates)/selectedDayCount())} / day</strong></div>`).join('')}</div>`:'';
  const conditionFiltered=chargeFiltered(state),unknown=state.mode==='eurail'?sumDays(continuationMetrics(edge,state,dates)||edge._passPolicy||{},state.day,dates,'unknownDaily'):0,feeUnknown=state.mode==='eurail'?sumDays(continuationMetrics(edge,state,dates)||edge._passPolicy||{},state.day,dates,'chargeUnknownDaily'):0;
  const policyBreakdown=!conditionFiltered&&pass&&reviewed?`<p class="helper">${fmt(canonical/selectedDayCount())} / day canonical included · ${fmt(reviewed/selectedDayCount())} / day map-reviewed included</p>`:'';
  const calls=(detail?.directions||[]).filter(d=>d.calledFromStation||d.calledToStation).map(d=>`<div>${esc(d.calledFromStation||shortName(station(d.from)))} → ${esc(d.calledToStation||shortName(station(d.to)))}</div>`).join('');
  $('inspectorContent').innerHTML=`<p class="eyebrow">${usesHubConnections(state)?'EURAIL CITY CONNECTION':'RECORDED STATION PAIR'}</p><h3><button class="station-link" data-endpoint-station="${esc(a.id)}">${esc(shortName(a))}</button><span class="connection-arrow">${bothDirections(edge)?'↕':'↓'}</span><button class="station-link" data-endpoint-station="${esc(b.id)}">${esc(shortName(b))}</button></h3><p class="subline">${esc(edge.country||a.country||'Europe')} · ${esc(dateLabel(state.day,dates))}${Number.isFinite(duration)?' · '+fmt(duration)+' min median':''}</p>${alignmentHTML}${continuationAvailabilityNote(edge)?'<p class="helper">'+esc(continuationAvailabilityNote(edge))+'</p>':''}${continuationPolicyText(edge,state,dates)?'<p class="helper">'+esc(continuationPolicyText(edge,state,dates))+'</p>':''}${replacementHTML(edge)}<div class="detail-stat"><strong>${fmt((onlyReview?review:count)/selectedDayCount())}</strong><span>${onlyReview?'uncertain services / day · pass inclusion unconfirmed':(edge.throughConnection?(pass?'included through services / day':'through services / day'):(pass?'included scheduled services / day':'scheduled services / day'))+' · '+directionLabel(edge)}</span></div>${conditionFiltered?'<p class="helper">Matching included services only · '+esc(chargeDescription(state))+'.</p>':policyBreakdown}${!conditionFiltered&&feeUnknown?'<p class="helper">'+fmt(feeUnknown/selectedDayCount())+' included services / day have unresolved fee rules and do not qualify as free.</p>':''}${weeklyChart(edge,pass,onlyReview?dates.map((_,i)=>conditionalCount(edge,{...state,day:'day-'+i},dates)):null)}${directionHTML}${frequencyHTML}<div id="segmentTrains"></div>${review>0?`<h4 class="detail-heading">UNCERTAIN PASS COVERAGE</h4><p class="helper">${fmt(review/selectedDayCount())} scheduled services / day have conditional or unknown pass eligibility. They are excluded from the included count. Known exclusions are not included in this overlay.${unknown?' '+fmt(unknown/selectedDayCount())+' / day have unknown inclusion; the remainder have conditional inclusion.':''}</p>`:''}<div class="detail-badges">${canonical?'<span class="badge pass">Canonical Eurail included</span>':!pass?'<span class="badge">All selected pass states</span>':''}${reviewed?'<span class="badge reviewed">Map-reviewed included</span>':''}${review?'<span class="badge conditional">Pass inclusion uncertain</span>':''}<span class="badge">${esc(geometryText(edge))}</span></div>${reviewed?reviewedPolicyHTML({...edge,reviewedRuleIds:[...new Set([...(edge.reviewedRuleIds||[]),...(detail?.reviewedRuleIds||[])])]}):''}${calls?'<div class="detail-data"><strong>Actual calls retained in this connection</strong>'+calls+'</div>':''}<div class="detail-data"><strong>Source</strong><br>${esc(source.name||edge.source)}${!edge.throughConnection&&detail?.reservation?'<br><strong>Reservation status retained for the week</strong><br>'+esc(policyStatuses([detail],'reservation')):''}${!edge.throughConnection&&detail?.supplement?'<br><strong>Supplement status retained for the week</strong><br>'+esc(policyStatuses([detail],'supplement')):''}${!edge.throughConnection&&detail?.conditionalPickup?'<br>Includes '+fmt(detail.conditionalPickup)+' conditional/request boarding records.':''}</div><p class="detail-note">${usesHubConnections(state)?'Connectors represent the same recorded service calling in both city catchments; nearby terminals are not assumed interchangeable. Some calls can have boarding restrictions. ':''}Counts are scheduled source records, not ridership or verified actual operations. Counts retain the recorded direction; reverse directions are summed only when available within this source and geometry group. National feeds can overlap. ${pass?'Reservation, supplement and seat-availability conditions still apply.':''}</p>`;
  document.querySelectorAll('[data-endpoint-station]').forEach(button=>button.onclick=()=>pickStation(station(button.dataset.endpointStation),{inspect:true}));
  trainInspector.render(edge,edgeServiceErrors.has(edge.id));bindChart();renderOverlapBack();
}

function setStationField(field,s){s=resolvedStation(s.id)||s;if(!stationInScope(s,state))return;state[field]=s.id;$(field==='from'?'fromStation':'toStation').value=s.name;if(!stationMapPoint(s))toast(s.name+': location unavailable; timetable calls are retained.');saveURL();}
function setupAutocomplete(field){
  const input=$(field==='from'?'fromStation':'toStation'),list=$(field==='from'?'fromSuggestions':'toSuggestions');let choices=[],active=-1,timer=0,sequence=0;
  function hide(){list.hidden=true;input.setAttribute('aria-expanded','false');active=-1;}
  function show(){choices=searchStations(searchList.filter(s=>stationInScope(s,state)),input.value);list.replaceChildren();choices.forEach((s,i)=>{const item=document.createElement('li');item.id=field+'-option-'+i;item.setAttribute('role','option');item.innerHTML=esc(s.name)+'<small>'+esc([s.country,s.memberStationCount?'city catchment · multiple terminals':stationSourceText(s),!stationMapPoint(s)?'location unavailable · timetable retained':''].filter(Boolean).join(' · '))+'</small>';item.onmousedown=event=>{event.preventDefault();setStationField(field,s);hide();};list.appendChild(item);});list.hidden=!choices.length;input.setAttribute('aria-expanded',String(!!choices.length));active=-1;}
  async function search(){const ticket=++sequence;try{await ensureStations();if(ticket===sequence&&document.activeElement===input)show();}catch{if(ticket===sequence)toast('Station search could not load. Please retry.');}}
  input.oninput=()=>{state[field]='';choices=[];hide();clearTimeout(timer);timer=setTimeout(search,80);};input.onfocus=()=>{ensureStations().then(()=>{if(input.value.length>=2&&document.activeElement===input)show();}).catch(()=>{});};input.onblur=()=>setTimeout(hide,120);
  input.onkeydown=event=>{if(event.key==='Escape'){hide();return;}if(event.key==='ArrowDown'||event.key==='ArrowUp'){if(!choices.length)return;event.preventDefault();active=(active+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;[...list.children].forEach((x,i)=>{x.classList.toggle('active',i===active);x.setAttribute('aria-selected',String(i===active));});input.setAttribute('aria-activedescendant',field+'-option-'+active);}if(event.key==='Enter'&&choices.length&&!list.hidden){event.preventDefault();setStationField(field,choices[Math.max(0,active)]);hide();}};
}
function equivalentStationIds(s){if(hubMap.has(s.id)||s.memberStationCount)return new Set([s.id,...[...stationMap.values()].filter(item=>item.hubId===s.id).map(item=>item.id)]);return new Set(stationMemberIds(s).filter(id=>stationInScope({id},state)));}
async function compareStations(){const from=resolvedStation(state.from),to=resolvedStation(state.to);if(!stationInScope(from,state)||!stationInScope(to,state)){toast('Choose a departure and an arrival from the station suggestions.');return;}if(from.id===to.id){toast('Choose two different recorded stations.');return;}$('compareButton').disabled=true;$('legHelper').textContent='Reading the recorded calling patterns…';const ticket=++detailSequence;trainInspector.reset();clearTrainFocus(false);selectedStation=null;clearStationFocus();state.station='';document.body.classList.remove('station-inspector-open');try{const result=await findJourneyServices(from,to);if(ticket!==detailSequence)return;legResult=result;selected=null;state.edge='';showInspector();renderJourneyResult(result);const located=[from,to].filter(s=>validMapLocation(s.lon,s.lat));if(located.length)map.fitBounds(located.map(s=>[s.lat,s.lon]),{paddingTopLeft:[35,100],paddingBottomRight:[window.innerWidth>760?350:35,window.innerWidth>760?75:260],maxZoom:8});renderer.schedule();saveURL();}catch(error){toast('The journey data could not load. Please try again.');$('legHelper').textContent='The lookup failed; no service conclusion has been made.';console.warn('Euro Rail journey lookup unavailable');}finally{$('compareButton').disabled=false;}}
async function findJourneyServices(from,to){await ensureManifest();ensureNativePublicNumbers();const fromIds=equivalentStationIds(from),toIds=equivalentStationIds(to),countries=new Set([from.country,from.passCountry].filter(Boolean)),files=manifest.files?.journeysByCountry||[];let choices=Array.isArray(files)?files.filter(f=>countries.has(f.country)):Object.entries(files).filter(([k])=>countries.has(k)).map(([country,url])=>({country,url}));if(manifest.files.journeyLookup)choices=indexedJourneyFiles(await json(dataURL(manifest.files.journeyLookup)),fromIds,toIds);else if(!choices.length&&Array.isArray(files))choices=files.filter(f=>isItaly(from.country)&&isItaly(f.country));const {matches,loaded}=await dataLoader.findJourneys(choices.map(choice=>dataURL(choice.url)),fromIds,toIds);
    if(!choices.length||(!loaded&&edges.size)){const exact=[...edges.values()].filter(e=>fromIds.has(e.a)&&toIds.has(e.b)&&Array.isArray(e.boardableDaily));const lines=[];for(const edge of exact){const detail=await detailsFor(edge);for(const line of detail?.lines||[])lines.push({...line,source:edge.source});}return{from,to,journeys:[],fallbackEdges:exact,fallbackLines:lines,adjacentOnly:true};}return{from,to,journeys:matches,adjacentOnly:false};}
function renderJourneyResult(result){
  if(!result)return;
  const grouped=new Map(),operators=new Map(),active=[];let total=0,conditional=0,reviewed=0,replacementTotal=0;const daily=Array(7).fill(0),ruleIds=new Set();journeyHighlights.clear();
  const availableJourneys=deduplicateContinuationAvailability(result.journeys,{dates,selectedDayIndices:selectedDays(state.day,dates),dailyFor:j=>journeyDaily(j,state,dates)});
  for(const j of availableJourneys){
    if(state.sources&&!state.sources.has(j.source))continue;
    if(j.agencyPrimary===false&&!state.alternatives&&!state.altSourceIds?.has(j.source))continue;
    const filteredDaily=journeyDaily(j,state,dates),n=selectedDays(state.day,dates).reduce((sum,i)=>sum+filteredDaily[i],0);if(!n)continue;active.push([j,n]);total+=n;if(isTemporaryReplacement(j))replacementTotal+=n;reviewed+=effectivePass(state)?reviewedCount(j,state,dates):0;
    if(j._match.conditional)conditional+=n;
    const key=JSON.stringify([j.source,j.operator,j.line,j.serviceMode||'rail']);
    if(!grouped.has(key))grouped.set(key,{label:j.line,name:j.lineName,operator:j.operator,source:j.source,serviceMode:j.serviceMode,replacement:j.replacement,daily:Array(7).fill(0),eurailDaily:Array(7).fill(0),reviewedEurailDaily:Array(7).fill(0),publicTrains:[],sleepServices:[]});
    const g=grouped.get(key);
    const context=continuationMetrics(j,state,dates)||j;
    for(let i=0;i<7;i++){g.daily[i]+=filteredDaily[i];const canonical=Math.min(filteredDaily[i],Number(context.eurailDaily?.[i])||0),reviewed=Math.min(Math.max(0,filteredDaily[i]-canonical),Number(context.reviewedEurailDaily?.[i])||0);g.eurailDaily[i]+=canonical;g.reviewedEurailDaily[i]+=reviewed;daily[i]+=filteredDaily[i];}
    const metadata=filteredServiceMetadata(j,filteredDaily);
    g.publicTrains.push(...metadata.publicTrains);
    g.sleepServices=mergeSleepServices(g.sleepServices,metadata.sleepServices);
    for(const id of j.reviewedRuleIds||[])ruleIds.add(id);
    for(const id of[...(j.edgeIds||[]).slice(j._match.from,j._match.to),...(j.additionalFocusEdgeIds||[])])if(id)journeyHighlights.add(id);
    const operator=j.operator||'Recorded operator',operatorKey=JSON.stringify([j.source,operator]);const previous=operators.get(operatorKey);operators.set(operatorKey,{name:operator,source:j.source,count:(previous?.count||0)+n});
  }
  if(result.adjacentOnly){
    for(const e of result.fallbackEdges){if(!serviceVisible(e,state))continue;if(state.sources&&!state.sources.has(e.source))continue;if(e.primary===false&&!state.alternatives&&!state.altSourceIds?.has(e.source))continue;const n=lineCount(e,true);total+=n;if(isTemporaryReplacement(e))replacementTotal+=n;journeyHighlights.add(e.id);for(let i=0;i<7;i++)daily[i]+=effectivePass(state)?(Number(e.eurailBoardableDaily?.[i])||0)+(Number(e.reviewedEurailBoardableDaily?.[i])||0):Number(e.boardableDaily?.[i])||0;}
    for(const l of result.fallbackLines)if(serviceVisible(l,state)&&(!state.sources||state.sources.has(l.source)))grouped.set((l.source||'')+':'+l.label+':'+l.operator,l);
  }
  const lines=[...grouped.values()],sorted=lines.map(l=>[l,lineCount(l)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]),topOperator=[...operators.values()].sort((a,b)=>b.count-a.count)[0],example=active.sort((a,b)=>b[1]-a[1])[0]?.[0];
  let callingPattern='';if(example){const calls=example.stops.slice(example._match.from,example._match.to+1).map((call,index)=>example.sourceStopNames?.[example._match.from+index]||station(Array.isArray(call)?call[0]:call.id).name);const kept=calls.length>10?[...calls.slice(0,5),'… '+(calls.length-10)+' intermediate calls …',...calls.slice(-5)]:calls;callingPattern=`<h4 class="detail-heading">ONE RECORDED STOPPING PATTERN</h4><ol class="calling-pattern">${kept.map(name=>`<li>${esc(name)}</li>`).join('')}</ol>`;}
  $('legHelper').textContent=result.adjacentOnly?'This lookup covers consecutive recorded station calls only.':'A through service calls at both stations; intermediate stops are allowed. Any required vehicle change remains separate.';
  $('inspectorContent').innerHTML=`<p class="eyebrow">${result.adjacentOnly?'CONSECUTIVE CALL COMPARISON':'SAME-SERVICE JOURNEY COMPARISON'}</p><h3>${esc(shortName(result.from))}<span class="connection-arrow">↓</span>${esc(shortName(result.to))}</h3><p class="subline">${esc(dateLabel(state.day,dates))} · ${effectivePass(state)?'Eurail-included services':'selected timetable sources'}</p>${total?`<div class="detail-stat"><strong>${fmt(total/selectedDayCount())}</strong><span>recorded through services / day</span></div>${serviceBreakdownHTML({trains:total-replacementTotal,replacements:replacementTotal},selectedDayCount())}${weeklyChart({daily,eurailDaily:daily,reviewedEurailDaily:[]})}<h4 class="detail-heading">MOST SCHEDULED OPERATOR / SERVICE</h4>${topOperator?`<div class="leading-product"><strong>${esc(topOperator.name)}</strong><span>${fmt(topOperator.count/selectedDayCount())} / day · ${esc(sourceName(topOperator.source))}</span></div>`:sorted[0]?`<div class="leading-product"><strong>${esc(sorted[0][0].operator||sorted[0][0].label||'Recorded service')}</strong></div>`:''}${serviceRows(lines,result.adjacentOnly)}${active.some(([journey])=>journey.availabilityOnly)?'<p class="helper">'+esc(continuationAvailabilityNote(active.map(([journey])=>journey)))+'</p>':''}${callingPattern}${[result.from,result.to].some(s=>!validMapLocation(s.lon,s.lat))||active.some(([journey])=>journey.unmappedCallIndices?.some(i=>i>=journey._match.from&&i<=journey._match.to))?'<p class="detail-note">A station location is unavailable in the source. Its timetable is retained, but connections using that missing location are not drawn on the map.</p>':''}`:`<div class="empty-state"><strong>No matching service in this selection.</strong>Try another source, date or station record. This result does not establish that the journey is unavailable.${result.adjacentOnly?' This data slice covers consecutive calls, not every through journey.':''}</div>`}<div class="detail-badges">${effectivePass(state)&&total-reviewed?'<span class="badge pass">Canonical Eurail included</span>':''}${reviewed?'<span class="badge reviewed">Map-reviewed included</span>':''}<span class="badge">${result.adjacentOnly?'Consecutive recorded calls':'Same recorded service'}</span>${conditional?'<span class="badge conditional">Request/conditional boarding included</span>':''}</div>${reviewed?reviewedPolicyHTML({reviewedRuleIds:[...ruleIds]}):''}<p class="detail-note">Station identities and counts remain source-specific. Equivalent spelling and close coordinates are lookup candidates, not an authoritative station merger. Overlapping feeds can repeat the same train. Boarding rules are taken from each feed and can disagree; confirm ticket conditions with the operator. No real-time running or pass-holder seat availability is inferred.</p>`;
  const nativeDetails=document.createElement('div');nativeDetails.id='segmentTrains';$('inspectorContent').appendChild(nativeDetails);
  const nativeRef={id:'direct-native:'+result.from.id+':'+result.to.id,_directLookup:true,_supplementalOnly:true,_stationIds:[...equivalentStationIds(result.from),...equivalentStationIds(result.to)],a:result.from.id,b:result.to.id};
  edgePublicNumbers.set(nativeRef.id,{journeys:result.journeys||[]});while(edgePublicNumbers.size>16)edgePublicNumbers.delete(edgePublicNumbers.keys().next().value);trainInspector.render(nativeRef);
  bindChart();renderer.schedule();status(total?fmt(total)+' scheduled services match this leg.':'No matching service in the selected data.');
}

function setupEvents(){setupMapControls();setupLegend();stationSearch=setupStationSearch({getStations:()=>stationList,getState:()=>state,ensureStations,getCities:query=>normalize(query).length<2?[]:loadCityAreas().then(cities=>cityAreaOptions(cities,query)).catch(()=>[]),sourceName,onPick:s=>{if(state.mode==='hubs')setMode('frequency');pickStation(s,{inspect:true,center:true});},onOpen:()=>{closeOtherContextPanels();setControlsOpen(false);}});mobileSheets=setupMobileSheets({closeControls:()=>setControlsOpen(false),closeSearch:()=>stationSearch.close(),closeInspector,getMap:()=>map});setupExplorerControls();$('stationDisplay').onchange=event=>{state.stationDisplay=event.target.value;state.stations=state.stationDisplay!=='hidden';renderHubs();refresh({details:false});};$('emptySourceSelection')?.addEventListener('click',()=>chooseSources(false));document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>setDay(b.dataset.day));$('showHubs').onchange=event=>{state.hubs=event.target.checked;if(state.hubs)loadHubCities();refresh({details:false});};
$('showTrains').onchange=event=>{state.trains=event.target.checked;layersChanged();};$('showReplacements').onchange=event=>{state.replacements=event.target.checked;layersChanged();};
document.querySelectorAll('[data-service-only]').forEach(button=>button.onclick=()=>{setBusEnabled(false);state.trains=button.dataset.serviceOnly==='trains';state.replacements=button.dataset.serviceOnly==='replacements';layersChanged();});
document.querySelectorAll('[data-service-preset]').forEach(button=>button.onclick=()=>{if(button.dataset.servicePreset==='none')setBusEnabled(false);state.trains=button.dataset.servicePreset==='all';if(state.mode!=='traffic')state.replacements=button.dataset.servicePreset==='all';layersChanged();});
document.querySelector('[data-context-only]').onclick=()=>{setBusEnabled(false);state.trains=false;state.replacements=false;state.closedCorridors=true;state.physicalRailways=false;layersChanged();};
$('showPhysicalRailways').onchange=event=>{state.physicalRailways=event.target.checked;refresh();};
document.querySelectorAll('[data-context-preset]').forEach(button=>button.onclick=()=>{const enabled=button.dataset.contextPreset==='all';state.closedCorridors=enabled;state.physicalRailways=enabled;state.hubs=enabled;state.stations=enabled;state.stationDisplay=enabled?'auto':'hidden';if(enabled)loadHubCities();refresh();});
$('hideMapOverlays').onclick=()=>{setBusEnabled(false);closeInspector();state.trains=false;state.replacements=false;state.closedCorridors=false;state.physicalRailways=false;state.hubs=false;state.stations=false;state.stationDisplay='hidden';layersChanged();};
$('fitReplacementSections').onclick=()=>ensureManifest().then(()=>{if(!serviceContext.fitAll())toast('No affected railway sections are recorded for these dates.');}).catch(()=>toast('Recorded notices could not load. Please retry.'));
$('findReplacementServices').onclick=()=>ensureManifest().then(async()=>{await loadCompleteNetwork({forRoute:true});const bounds=currentEdges().filter(edge=>isTemporaryReplacement(edge)&&qualifiesEdge(edge,state,dates,stationMap)).flatMap(edge=>edge.coords.map(([lon,lat])=>[lat,lon]));if(bounds.length)map.fitBounds(bounds,{...mapFramePadding(),maxZoom:10});else toast('No recorded replacement buses match these filters.');}).catch(()=>toast('Replacement services could not load. Please retry.'));
$('eurailOnly').onchange=event=>{state.pass=event.target.checked;refresh();};
$('feePreset').onchange=event=>{feeCustom=event.target.value==='custom';if(!feeCustom){state.charge=event.target.value;state.chargeMatch='any';}refresh();ensurePassPolicies().catch(()=>{});};
document.querySelectorAll('[data-charge]').forEach(input=>input.onchange=updateCharges);$('chargeMatch').onchange=updateCharges;
document.querySelectorAll('[data-charge-preset]').forEach(button=>button.onclick=()=>{feeCustom=true;state.charge=button.dataset.chargePreset;state.chargeMatch='any';refresh();ensurePassPolicies().catch(()=>{});});
$('showIncluded').onchange=event=>{state.included=event.target.checked;refresh();};$('showReview').onchange=event=>{state.review=event.target.checked;refresh();};
$('showInferred').onchange=event=>{state.inferred=event.target.checked;refresh();};$('showAligned').onchange=event=>{state.aligned=event.target.checked;refresh();};$('showSchematic').onchange=event=>{state.schematic=event.target.checked;refresh();};
document.querySelectorAll('[data-geometry-preset]').forEach(button=>button.onclick=()=>{state.aligned=button.dataset.geometryPreset==='all';state.inferred=['all','inferred'].includes(button.dataset.geometryPreset);state.schematic=['all','approximate'].includes(button.dataset.geometryPreset);refresh();});
$('resetFilters').onclick=()=>{setBusEnabled(false,{reset:true});state.day='all';state.pass=false;state.stations=true;state.stationDisplay='auto';state.min=0;state.hubs=true;state.schematic=true;state.aligned=true;state.inferred=true;state.trains=true;state.replacements=true;feeCustom=false;state.closedCorridors=false;state.physicalRailways=false;state.included=true;state.review=false;state.charge='all';state.chargeMatch='any';state.hubCount=100;state.hubExamples='all';state.hubCity='';renderCityOptions();chooseSources(false);scheduleChunks();ensurePassPolicies().catch(()=>{});toast('Recommended sources and default filters restored.');};$('recommendedSources').onclick=()=>chooseSources(false);$('allSources').onclick=()=>chooseSources(true);$('closeInspector').onclick=closeInspector;$('methodButton').onclick=method;$('closeMethod').onclick=closeMethod;$('backToMap').onclick=closeMethod;$('methodDialog').onclick=event=>{if(event.target===$('methodDialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeMethod();}};document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){if(!trainInspector.back())closeInspector();}});$('retryButton').onclick=boot;$('compareButton').onclick=compareStations;$('swapStations').onclick=()=>{const from=state.from;state.from=state.to;state.to=from;$('fromStation').value=state.from?(resolvedStation(state.from)||station(state.from)).name:'';$('toStation').value=state.to?(resolvedStation(state.to)||station(state.to)).name:'';saveURL();};$('shareButton').onclick=async()=>{saveURL();try{await navigator.clipboard.writeText(location.href);toast('View link copied. Site access is unchanged.');}catch(error){const input=document.createElement('input');input.value=location.href;document.body.appendChild(input);input.select();const copied=document.execCommand('copy');input.remove();toast(copied?'View link copied. Site access is unchanged.':'The current view link is ready in your address bar.');}};setupAutocomplete('from');setupAutocomplete('to');}
function updateMethod(){
  if(!manifest)return;
  document.getElementById('generatedMethods')?.remove();const extra=document.createElement('div');extra.id='generatedMethods';
  const p=document.createElement('p');p.textContent=`This release retains ${fmt(manifest.sources?.length||0)} timetable sources. ${manifest.methodology?.summary||''}`;extra.appendChild(p);
  if(manifest.files?.physicalRailHeat){const section=document.createElement('section'),heading=document.createElement('h3'),note=document.createElement('p');heading.className='detail-heading';heading.textContent='PHYSICAL RAIL TRAFFIC';note.textContent='The Traffic view estimates scheduled source traversals over inferred shared railway sections. Both directions are combined; replacement buses are excluded. Feeds and route variants can overlap, so these are not guaranteed unique physical trains or measured movements. Tap a section for source, cohort and direction evidence.';section.append(heading,note);extra.appendChild(section);}
  if(manifest.cityHubReference){const reference=manifest.cityHubReference,section=document.createElement('section'),heading=document.createElement('h3'),note=document.createElement('p'),link=document.createElement('a');heading.textContent='City connections';heading.className='detail-heading';note.textContent=reference.attribution+' Population ranks use source-reported figures, not harmonized census totals. City links count dated same-service connections; feeds may overlap. Fast/intercity and overnight choices select links with examples, while the displayed frequency counts every direct service on those links.';link.href=reference.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='GeoNames · '+reference.licence+' ↗';section.append(heading,note,link);extra.appendChild(section);}
  const stationReference=manifest.stationNameReference;
  if(stationReference&&typeof stationReference.dataset==='string'){
    const section=document.createElement('section');section.id='stationNameReference';section.className='station-name-reference';
    const heading=document.createElement('h3');heading.className='detail-heading';heading.textContent='STATION NAMES';section.appendChild(heading);
    const credit=document.createElement('p');credit.textContent='Station names and aliases use '+stationReference.dataset+'. '+String(manifest.attribution?.stationNames||stationReference.attribution||'');section.appendChild(credit);
    const links=document.createElement('div');links.className='evidence-links';
    for(const[field,label,kind]of[['sourceUrl','Original station reference ↗','source'],['licenceUrl','ODbL licence ↗','license']]){try{const url=new URL(stationReference[field]);if(url.protocol!=='https:'&&url.protocol!=='http:')continue;const link=document.createElement('a');link.className='station-reference-'+kind;link.href=url.href;link.textContent=label;link.target='_blank';link.rel='noopener noreferrer';links.appendChild(link);}catch{}}
    const download=stationReference.modifiedDatabaseDownload||manifest.files.stationNameReference;
    if(typeof download==='string'&&download===manifest.files.stationNameReference){const link=document.createElement('a');link.className='station-reference-download';link.href=dataURL(download);link.download=new URL(link.href).pathname.split('/').at(-1);link.textContent='Download modified station database ↗';links.appendChild(link);}
    section.appendChild(links);
    for(const source of stationReference.supplementalSources||[]){
      if(typeof source?.dataset!=='string'||!source.dataset.trim())continue;
      const supplement=document.createElement('div');supplement.className='station-reference-supplement';
      const credit=document.createElement('p'),title=document.createElement('strong');title.textContent=source.dataset;credit.appendChild(title);
      const attribution=(Array.isArray(source.attribution)?source.attribution:[source.attribution]).filter(value=>typeof value==='string'&&value.trim()).join(' · ');
      if(attribution)credit.appendChild(document.createTextNode('. '+attribution));supplement.appendChild(credit);
      const sourceLinks=document.createElement('div');sourceLinks.className='evidence-links';
      for(const[field,label,kind]of[['url','Dataset source ↗','source'],['licenceUrl','Licence terms ↗','license']]){try{const url=new URL(source[field]);if(url.protocol!=='https:'&&url.protocol!=='http:'||url.username||url.password)continue;const link=document.createElement('a');link.className='station-reference-supplement-'+kind;link.href=url.href;link.textContent=label;link.target='_blank';link.rel='noopener noreferrer';sourceLinks.appendChild(link);}catch{}}
      supplement.appendChild(sourceLinks);section.appendChild(supplement);
    }
    extra.appendChild(section);
  }
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
  if(manifest.files.nativePublicNumbers){
    const section=document.createElement('section'),heading=document.createElement('h3');heading.className='detail-heading';heading.textContent='ADDITIONAL PUBLIC TRAIN NUMBERS';section.appendChild(heading);
    const credit=document.createElement('p');credit.textContent='SNCF Voyageurs NeTEx public train numbers, matched to complete native calls, clocks and dates. Published under ODbL and the French National Access Point particular conditions. Timetable frequencies and pass conditions retain their original sources.';section.appendChild(credit);
    for(const[label,path]of[['Download the complete dated number component',manifest.files.nativePublicNumbers],['Download the selected-week native source evidence',manifest.files.nativePublicNumberDonor],['Download the source and rights review',manifest.files.nativePublicNumberGrant]])if(path){const row=document.createElement('p'),link=document.createElement('a');link.href=dataURL(path);link.download=path.split('/').at(-1)+'.gz';link.textContent=label+' ↗';row.appendChild(link);section.appendChild(row);}
    const terms=document.createElement('a');terms.href='https://doc.transport.data.gouv.fr/presentation-et-mode-demploi-du-pan/conditions-dutilisation-des-donnees/licence-odbl';terms.textContent='ODbL and particular conditions ↗';terms.target='_blank';terms.rel='noopener noreferrer';section.appendChild(terms);extra.appendChild(section);
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
    applyProjectScope(state,manifest.projectScope);
    if(manifest._bootstrap&&needsSourceRefresh(manifest.sources,state.sources))await ensureManifest();
    dates=manifest.dates;if(manifest.files.throughServices&&!manifest.files.displayOverview)await ensureThroughServices();reconcileSources();setupDates();setupSources();applyControls();coverage.refresh();
    if(map.getContainer().dataset.basemap==='fallback')loadCountryFallback();
    if(state.mode==='traffic')await ensurePhysicalHeat();else{const overview=window.atlasDisplayPromise&&manifest.files.displayOverview?await dataLoader.decode(await window.atlasDisplayPromise):await json(dataURL(manifest.files.displayOverview||manifest.files.overview));if(overview.edges?.[0]?._displayOnly){displayPairs=overview.edges;rememberThroughDisplay(displayPairs);edgeVersion++;}else await addEdges(overview.edges||overview);}
    if(state.mode==='countries'){if(state.country&&!state.center)frameCountry(state.country,++countryChoiceSequence).catch(()=>toast('Country data could not load. Please retry.'));ensureCountryContextStations();}
    $('mapLoading').hidden=true;renderer.schedule();ensurePassPolicies().catch(()=>{});ensureContinuationGeometry().catch(()=>toast('Some reviewed international services could not load. Reopen this map to retry.'));
    if(!manifest.files.displayOverview||state.mode==='leg')loadBootstrapStations().then(async()=>{if(state.mode==='leg'){await ensureStations();if(resolvedStation(state.from)&&resolvedStation(state.to))compareStations();}}).catch(()=>toast('Station search could not load. Reload to retry.'));
    if(usesHubConnections(state))loadCityHubs().catch(()=>{});else if(state.hubs)loadHubCities();if(state.mode==='countries'&&!state.country)openCountryPicker().catch(()=>{});scheduleChunks();
    if(state.edge&&findDisplayedEdge(state.edge))pickEdge(findDisplayedEdge(state.edge),false);
    if(state.station){const id=state.station;
      Promise.all([ensureStations(),id.startsWith('city:')?loadCityAreas():[]]).then(([,cities])=>{
        if(state.station!==id||selected||selectedStation)return;
        const city=cities.find(row=>row.id===id),s=city?{...city,isCityArea:true}:resolvedStation(id);
        if(s)pickStation(s,{inspect:true,center:!state.center,restore:!!state.center});
        else toast('This selection is unavailable in the current release.');
      }).catch(()=>toast('Selection details could not load. Please retry search.'));
    }
    status(state.mode==='traffic'?'Estimated physical rail traffic loaded. Both directions; buses excluded.':manifest.files.displayNetwork?'Atlas ready. Loading the complete network at every zoom.':'Atlas loaded. Zoom in for local lines.');
  }catch(error){$('mapLoading').hidden=true;$('mapError').hidden=false;console.error('Euro Rail data load failed:',error.message);}
  finally{booting=false;saveURL();}
}

if(!window.busPageRedirect&&!window.atlasUnsupportedBrowser){initMap();setupEvents();applyControls();boot();}
