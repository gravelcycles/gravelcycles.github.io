import{BUS_LIMITS,BUS_OVERVIEW_LIMITS,BusRequests,validBusDocument,busMatches,intersects,searchBusRoutes,clearBusSearchCache,foldBusText}from'./bus-core.js?v=36bcedbe061d63be';
import{worldPoint}from'./atlas-core.js?v=36bcedbe061d63be';
import{BusSearch,BusTileIndex}from'./bus-search.js?v=36bcedbe061d63be';
import{BusAggregate}from'./bus-aggregate.js?v=36bcedbe061d63be';
import{BusGeometryReference}from'./bus-geometry.js?v=36bcedbe061d63be';
import{BusLocalRouting}from'./bus-spatial-routing.js?v=36bcedbe061d63be';

const aborted=()=>new DOMException('Stale bus request','AbortError');
const operators=routes=>{const rows=new Map();for(const route of routes)if(route.operator)rows.set(JSON.stringify([route.sourceId,route.operator]),{sourceId:route.sourceId,name:route.operator});return[...rows.values()];};

// Keep large immutable JSON documents in the worker. Only the bounded visible
// geometry, search matches or selected route cross to the animation thread.
export class BusDataService{
  constructor(base,options={}){this.requests=new BusRequests(base,options);const sharedPool=this.requests.pool;this.overviewDescriptor=options.overview;this.overviewRequests=new BusRequests(options.overviewBaseUrl||new URL('../assets/',base),{...options,sharedPool,detailsBaseUrl:null});this.aggregateRequests=options.busAtlasOverview?new BusRequests(options.busAtlasOverview.assetBaseUrl,{...options,sharedPool,detailsBaseUrl:null,requireHashes:true}):null;this.aggregate=this.aggregateRequests?new BusAggregate(this.aggregateRequests,options.busAtlasOverview):null;this.countryAggregate=options.countryOverview?new BusAggregate(this.overviewRequests,{...options.countryOverview,assetBaseUrl:this.overviewRequests.base.href},{countryFilters:true}):null;this.localRouting=options.localRouting?new BusLocalRouting(this.requests,this.overviewRequests,options.localRouting):null;this.placesDescriptor=options.places;this.placesMetadata=new WeakMap();this.activeAggregate=null;this.geometryRequests=options.busGeometry?new BusRequests(options.busGeometry.assetBaseUrl,{...options,sharedPool,detailsBaseUrl:null,requireHashes:true}):null;this.geometryReference=this.geometryRequests?new BusGeometryReference(this.geometryRequests,options.busGeometry):null;this.epochs=new Map();this.metadata=new WeakMap();this.overviewMetadata=new WeakMap();}
  cancel(reader){this.epochs.set(reader,(this.epochs.get(reader)||0)+1);this.requests.cancel(reader);this.overviewRequests.cancel(reader);this.aggregateRequests?.cancel(reader);}
  cancelAll(){for(const reader of new Set([...this.epochs.keys(),...this.requests.readers.keys()]))this.cancel(reader);this.requests.cancelAll();this.aggregate?.clear();this.countryAggregate?.clear();this.localRouting?.clear();this.placesMetadata=new WeakMap();this.activeAggregate=null;this.metadata=new WeakMap();this.overviewMetadata=new WeakMap();clearBusSearchCache();}
  async overview(manifest,bounds,filters,reader,check){
    const descriptor=this.overviewDescriptor,limits=BUS_OVERVIEW_LIMITS;
    if(descriptor.maximumZoom!==BUS_LIMITS.minimumZoom||descriptor.routeCount>limits.routes||descriptor.vertexCount>limits.vertices||descriptor.uncompressedBytes>limits.decodedBytes)throw new Error('Bus overview exceeds display budget');
    // Verify the derivative against the actual manifest bytes in this session,
    // not merely the route count or a cohort label supplied by the UI.
    const manifestDescriptor=this.manifestDescriptor||'manifest.json';await this.requests.load(manifestDescriptor,{reader,limit:2*1024*1024});check();
    if(this.requests.identity(manifestDescriptor)!==descriptor.busManifestSha256)throw new Error('Bus overview cohort mismatch');
    const data=validBusDocument(await this.overviewRequests.load(descriptor,{reader,limit:limits.bytes}),'bus_atlas_overview');check();
    let metadata=this.overviewMetadata.get(data);
    if(!metadata){
      if(data.busManifestSha256!==descriptor.busManifestSha256||data.maximumZoom!==descriptor.maximumZoom||JSON.stringify(data.dates)!==JSON.stringify(manifest.dates)||!Array.isArray(data.routes)||data.routes.length!==descriptor.routeCount)throw new Error('Bus overview identity mismatch');
      const identities=new Set(),projected=new Map();let total=0;
      for(const route of data.routes){
        const coords=route.coordinates;if(identities.has(route.id)||!Array.isArray(coords)||coords.length<2||!Array.isArray(route.bbox)||route.bbox.length!==4||!route.bbox.every(Number.isFinite))throw new Error('Invalid bus overview geometry');identities.add(route.id);total+=coords.length;if(total>limits.vertices)throw new Error('Bus overview exceeds display budget');
        const world=new Float64Array(coords.length*2);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        for(let i=0;i<coords.length;i++){const[lon,lat]=coords[i];if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>85.051129)throw new Error('Invalid bus overview position');const[x,y]=worldPoint(lon,lat);world[i*2]=x;world[i*2+1]=y;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
        projected.set(route.id,{world,bbox:[minX,minY,maxX,maxY]});
      }
      if(total!==descriptor.vertexCount||total!==data.vertexCount||data.routeCount!==data.routes.length)throw new Error('Bus overview vertex count mismatch');
      metadata={projected,operators:operators(data.routes)};this.overviewMetadata.set(data,metadata);
    }
    const matched=data.routes.filter(route=>busMatches(route,filters,manifest.dates)&&intersects(route.bbox,bounds)),vertices=matched.reduce((n,row)=>n+row.coordinates.length,0),world=new Float64Array(vertices*2),routes=[];let offset=0;
    for(const route of matched){
      const geometry=metadata.projected.get(route.id),length=geometry.world.length;world.set(geometry.world,offset);const{coordinates,endStopNames,...native}=route;
      routes.push({...native,coordinates:[coordinates[0],coordinates.at(-1)],stopNames:endStopNames,_world:world.subarray(offset,offset+length),_bbox:geometry.bbox,_pointCount:length/2,geometryKey:descriptor.sha256+':'+route.id});offset+=length;
    }
    return{overview:true,routes,stops:[],limited:false,vertices,entries:['overview'],operators:metadata.operators};
  }
  async run(message){
    const reader=message.options?.reader||'viewport',epoch=this.epochs.get(reader)||0,check=()=>{if(epoch!==(this.epochs.get(reader)||0))throw aborted();};this.epochs.set(reader,epoch);
    if(message.op==='countryInfo'){if(!this.countryAggregate)return null;const value=validBusDocument(await this.overviewRequests.load(this.countryAggregate.configuration.catalogue,{reader,limit:1024*1024}),'bus_atlas_aggregate_catalogue');check();if(value.busManifestSha256!==this.countryAggregate.configuration.busManifestSha256||value.countryFilters!==true)throw new Error('Country catalogue binding mismatch');return value.countries;}
    if(message.op==='places'){if(!this.placesDescriptor)return{places:[]};const value=validBusDocument(await this.overviewRequests.load(this.placesDescriptor,{reader,limit:1024*1024}),'bus_atlas_places');check();if(!Array.isArray(value.places)||value.places.length>30000)throw new Error('City reference exceeds budget');let normalized=this.placesMetadata.get(value);if(!normalized){normalized=value.places.map(row=>{if(!Array.isArray(row)||row.length!==7||!Number.isFinite(row[3]+row[4])||Math.abs(row[3])>180||Math.abs(row[4])>85||!Array.isArray(row[6]))throw new Error('Invalid city reference');return foldBusText([row[1],...row[6]].join(' '));});this.placesMetadata.set(value,normalized);}const tokens=foldBusText(message.query).trim().split(/\s+/).filter(Boolean),id=message.options?.id;const found=value.places.filter((row,i)=>(!message.country||row[2]===message.country)&&(id?row[0]===id:tokens.length&&tokens.every(t=>normalized[i].includes(t))));check();return{places:found.slice(0,12).map(row=>({id:row[0],name:row[1],country:row[2],lon:row[3],lat:row[4]}))};}
    if(message.op==='geometryReference'){if(!this.geometryReference)return null;const descriptor=this.manifestDescriptor||'manifest.json';await this.requests.load(descriptor,{reader,limit:2*1024*1024});check();return this.geometryReference.lookup(message.manifest,this.requests.identity(descriptor),message.detail,reader,check,message.options?.includeFine===true);}
    if(message.op==='aggregateHit'){const result=this.activeAggregate?.hit(message.sceneId,message.x,message.y);check();return result;}
    if(message.op==='load'){const value=await this.requests.load(message.descriptor,{...message.options,reader});check();if(value?.kind==='bus_atlas_manifest')this.manifestDescriptor=message.descriptor;return value;}
    if(message.op==='search'||message.op==='findRoute'){
      if(message.manifest?.search?.kind==='partitioned'){
        const search=new BusSearch(this.requests,message.manifest);
        if(message.op==='findRoute'){const route=await search.findRoute(message.routeId,{reader});check();return{route,operators:operators(route?[route]:[])};}
        const result=await search.query(message.query,{filters:message.filters,dates:message.dates,...message.options,reader});check();
        const requested=message.options?.limit,limit=Number.isFinite(requested)?Math.max(0,Math.min(41,Math.floor(requested))):41;
        const{rows=[],...metadata}=result,routes=rows.slice(0,limit);
        return{...metadata,routes,operators:operators(routes)};
      }
      const data=validBusDocument(await this.requests.load(message.manifest?.search||message.descriptor,{...message.options,reader,limit:BUS_LIMITS.searchBytes}),'bus_atlas_search');check();
      let metadata=this.metadata.get(data);if(!metadata){metadata=operators(data.routes||[]);this.metadata.set(data,metadata);}
      if(message.op==='findRoute')return{route:(data.routes||[]).find(row=>row.id===message.routeId)||null,operators:metadata};
      const requested=message.options?.limit,limit=Number.isFinite(requested)?Math.max(0,Math.min(41,Math.floor(requested))):41;
      return{routes:searchBusRoutes(data.routes||[],message.query,message.filters,message.dates,limit),operators:metadata};
    }
    if(message.op!=='viewport')throw new Error('Unknown bus data operation');
    const{manifest,zoom,filters}=message,focusCityBounds=message.options?.focusCityBounds;if(focusCityBounds!=null&&(!Array.isArray(focusCityBounds)||focusCityBounds.length!==4||!focusCityBounds.every(Number.isFinite)||focusCityBounds[0]>=focusCityBounds[2]||focusCityBounds[1]>=focusCityBounds[3]))throw new Error('Invalid city focus area');let bounds=message.bounds;if(filters.cityBounds){const c=filters.cityBounds;if(!Array.isArray(c)||c.length!==4||!c.every(Number.isFinite)||c[0]>=c[2]||c[1]>=c[3])throw new Error('Invalid city map area');bounds=[Math.max(bounds[0],c[0]),Math.max(bounds[1],c[1]),Math.min(bounds[2],c[2]),Math.min(bounds[3],c[3])];if(bounds[0]>=bounds[2]||bounds[1]>=bounds[3])return{routes:[],stops:[],entries:[],vertices:0,limited:false,operators:[]};}
    const aggregate=(filters.country||filters.international)?this.countryAggregate:this.aggregate;if((filters.country||filters.international)&&!aggregate)throw new Error('Country overview is unavailable for this cohort');this.activeAggregate=aggregate;if(aggregate&&zoom<BUS_LIMITS.minimumZoom){const descriptor=this.manifestDescriptor||'manifest.json';await this.requests.load(descriptor,{reader,limit:2*1024*1024});check();return aggregate.render(manifest,this.requests.identity(descriptor),bounds,zoom,filters,message.options.camera,Math.min(BUS_LIMITS.vertices,Math.max(0,message.options.selectedVertices||0)),reader,check);}
    if(this.overviewDescriptor&&zoom<BUS_LIMITS.minimumZoom)return this.overview(manifest,bounds,filters,reader,check);
    let plan;if(this.localRouting){const descriptor=this.manifestDescriptor||'manifest.json';await this.requests.load(descriptor,{reader,limit:2*1024*1024});check();plan=await this.localRouting.plan(manifest,this.requests.identity(descriptor),bounds,zoom,filters,{reader,check});}else plan=await new BusTileIndex(this.requests,manifest).plan(bounds,zoom,filters,{reader});const pages=[];check();
    for(let offset=0;offset<plan.entries.length;offset+=3){const batch=await Promise.all(plan.entries.slice(offset,offset+3).map(async descriptor=>{
      const data=validBusDocument(await this.requests.load(descriptor,{reader,limit:4*1024*1024}),'bus_atlas_tile');
      if(descriptor.sourceId&&(data.sourceId!==descriptor.sourceId||!Array.isArray(data.routes)||data.routes.some(route=>route.sourceId!==descriptor.sourceId)))throw new Error('Bus map source mismatch');
      return data;
    }));check();pages.push(...batch);}
    const stopNames=new Map(),stops=[],stopIds=new Set(),cityStopIds=new Set(),allOperators=new Map();
    // Compute membership from every native stop in the already loaded packets.
    // The displayed stop budget and viewport must not hide a retained city call.
    for(const page of pages){for(const stop of page.stops||[]){stopNames.set(stop.id,stop.name);const position=Number.isFinite(stop.lon)&&Number.isFinite(stop.lat);if(focusCityBounds&&position&&stop.lon>=focusCityBounds[0]&&stop.lon<=focusCityBounds[2]&&stop.lat>=focusCityBounds[1]&&stop.lat<=focusCityBounds[3])cityStopIds.add(stop.id);if(stops.length<BUS_LIMITS.stops&&!stopIds.has(stop.id)&&position&&stop.lon>=bounds[0]&&stop.lon<=bounds[2]&&stop.lat>=bounds[1]&&stop.lat<=bounds[3]){stopIds.add(stop.id);stops.push(stop);}}for(const route of page.routes||[])if(route.operator)allOperators.set(JSON.stringify([route.sourceId,route.operator]),{sourceId:route.sourceId,name:route.operator});}
    const routes=[],seen=new Set();let vertices=0,limited=plan.limited;
    for(let i=0;i<pages.length;i++)for(const route of pages[i].routes||[]){
      if(seen.has(route.id)||!busMatches(route,filters,manifest.dates)||route.bbox&&!intersects(route.bbox,bounds))continue;seen.add(route.id);const count=route.coordinates?.length||0;if(count<2)continue;
      if(routes.length>=BUS_LIMITS.routes||vertices+count>BUS_LIMITS.vertices){limited=true;continue;}vertices+=count;
      routes.push({...route,stopNames:[stopNames.get(route.stopIds?.[0]),stopNames.get(route.stopIds?.at(-1))].filter(Boolean),geometryKey:(plan.entries[i].sha256||plan.entries[i].path)+':'+route.id});
    }
    return{routes,stops,...(focusCityBounds?{focusRouteIds:routes.filter(route=>route.stopIds?.some(id=>cityStopIds.has(id))).map(route=>route.id)}:{}),limited,vertices,entries:plan.entries.map(entry=>entry.key),metadataBytes:plan.metadataBytes||0,metadataDecodedBytes:plan.metadataDecodedBytes||0,routingCells:plan.routingCells||[],operators:[...allOperators.values()]};
  }
}

if(typeof WorkerGlobalScope==='function'&&globalThis instanceof WorkerGlobalScope){
  let service=null;
  globalThis.onmessage=async event=>{
    const message=event.data;
    if(message?.op==='init'){service?.cancelAll();service=new BusDataService(message.base,{maximumBytes:message.maximumBytes,requireHashes:message.requireHashes,overview:message.overview,busAtlasOverview:message.busAtlasOverview,busGeometry:message.busGeometry,countryOverview:message.countryOverview,places:message.places,localRouting:message.localRouting,detailsBaseUrl:message.detailsBaseUrl??null,overviewBaseUrl:message.overviewBaseUrl});return;}
    if(message?.op==='cancel'){service?.cancel(message.reader);return;}
    if(message?.op==='cancelAll'){service?.cancelAll();return;}
    try{if(!service)throw new Error('Bus worker has not initialized');const result=await service.run(message),buffers=result?.aggregate?(result.bitmap?[result.bitmap]:[...result.aggregateGroups.map(group=>group.world.buffer),result.presence.buffer,result.occupancy.buffer]):result?.overview&&result.routes.length?[result.routes[0]._world.buffer]:[];globalThis.postMessage({id:message.id,result},buffers);}
    catch(error){globalThis.postMessage({id:message?.id,error:{name:error.name||'Error',message:error.message||'Bus data unavailable'}});}
  };
}
