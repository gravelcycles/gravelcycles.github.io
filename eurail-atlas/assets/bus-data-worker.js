import{BUS_LIMITS,BUS_OVERVIEW_LIMITS,BusRequests,validBusDocument,viewportTiles,busMatches,intersects,searchBusRoutes,clearBusSearchCache}from'./bus-core.js?v=7cc2de32b432a06f';
import{worldPoint}from'./atlas-core.js?v=7cc2de32b432a06f';

const aborted=()=>new DOMException('Stale bus request','AbortError');
const operators=routes=>{const rows=new Map();for(const route of routes)if(route.operator)rows.set(JSON.stringify([route.sourceId,route.operator]),{sourceId:route.sourceId,name:route.operator});return[...rows.values()];};

// Keep large immutable JSON documents in the worker. Only the bounded visible
// geometry, search matches or selected route cross to the animation thread.
export class BusDataService{
  constructor(base,options={}){this.requests=new BusRequests(base,options);this.overviewDescriptor=options.overview;this.overviewRequests=new BusRequests(new URL('../assets/',base),{...options,maximumBytes:BUS_OVERVIEW_LIMITS.decodedBytes});this.epochs=new Map();this.metadata=new WeakMap();this.overviewMetadata=new WeakMap();}
  cancel(reader){this.epochs.set(reader,(this.epochs.get(reader)||0)+1);this.requests.cancel(reader);this.overviewRequests.cancel(reader);}
  cancelAll(){for(const reader of new Set([...this.epochs.keys(),...this.requests.readers.keys(),...this.overviewRequests.readers.keys()]))this.cancel(reader);this.requests.cancelAll();this.overviewRequests.cancelAll();this.metadata=new WeakMap();this.overviewMetadata=new WeakMap();clearBusSearchCache();}
  async overview(manifest,bounds,filters,reader,check){
    const descriptor=this.overviewDescriptor,limits=BUS_OVERVIEW_LIMITS;
    if(descriptor.maximumZoom!==BUS_LIMITS.minimumZoom||descriptor.routeCount>limits.routes||descriptor.vertexCount>limits.vertices||descriptor.uncompressedBytes>limits.decodedBytes)throw new Error('Bus overview exceeds display budget');
    // Verify the derivative against the actual manifest bytes in this session,
    // not merely the route count or a cohort label supplied by the UI.
    await this.requests.load('manifest.json',{reader,limit:2*1024*1024});check();
    if(this.requests.identity('manifest.json')!==descriptor.busManifestSha256)throw new Error('Bus overview cohort mismatch');
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
    if(message.op==='load'){const value=await this.requests.load(message.descriptor,{...message.options,reader});check();return value;}
    if(message.op==='search'||message.op==='findRoute'){
      const data=validBusDocument(await this.requests.load(message.descriptor,{...message.options,reader,limit:BUS_LIMITS.searchBytes}),'bus_atlas_search');check();
      let metadata=this.metadata.get(data);if(!metadata){metadata=operators(data.routes||[]);this.metadata.set(data,metadata);}
      if(message.op==='findRoute')return{route:(data.routes||[]).find(row=>row.id===message.routeId)||null,operators:metadata};
      const requested=message.options?.limit,limit=Number.isFinite(requested)?Math.max(0,Math.min(41,Math.floor(requested))):41;
      return{routes:searchBusRoutes(data.routes||[],message.query,message.filters,message.dates,limit),operators:metadata};
    }
    if(message.op!=='viewport')throw new Error('Unknown bus data operation');
    const{manifest,bounds,zoom,filters}=message;if(this.overviewDescriptor&&zoom<BUS_LIMITS.minimumZoom)return this.overview(manifest,bounds,filters,reader,check);
    const plan=viewportTiles(manifest,bounds,zoom),pages=[];
    for(let offset=0;offset<plan.entries.length;offset+=3){const batch=await Promise.all(plan.entries.slice(offset,offset+3).map(descriptor=>this.requests.load(descriptor,{reader,limit:4*1024*1024}).then(data=>validBusDocument(data,'bus_atlas_tile'))));check();pages.push(...batch);}
    const stopNames=new Map(),stops=[],stopIds=new Set(),allOperators=new Map();
    for(const page of pages){for(const stop of page.stops||[]){stopNames.set(stop.id,stop.name);if(stops.length<BUS_LIMITS.stops&&!stopIds.has(stop.id)&&Number.isFinite(stop.lon)&&Number.isFinite(stop.lat)&&stop.lon>=bounds[0]&&stop.lon<=bounds[2]&&stop.lat>=bounds[1]&&stop.lat<=bounds[3]){stopIds.add(stop.id);stops.push(stop);}}for(const route of page.routes||[])if(route.operator)allOperators.set(JSON.stringify([route.sourceId,route.operator]),{sourceId:route.sourceId,name:route.operator});}
    const routes=[],seen=new Set();let vertices=0,limited=plan.limited;
    for(let i=0;i<pages.length;i++)for(const route of pages[i].routes||[]){
      if(seen.has(route.id)||!busMatches(route,filters,manifest.dates)||route.bbox&&!intersects(route.bbox,bounds))continue;seen.add(route.id);const count=route.coordinates?.length||0;if(count<2)continue;
      if(routes.length>=BUS_LIMITS.routes||vertices+count>BUS_LIMITS.vertices){limited=true;continue;}vertices+=count;
      routes.push({...route,stopNames:[stopNames.get(route.stopIds?.[0]),stopNames.get(route.stopIds?.at(-1))].filter(Boolean),geometryKey:(plan.entries[i].sha256||plan.entries[i].path)+':'+route.id});
    }
    return{routes,stops,limited,vertices,entries:plan.entries.map(entry=>entry.key),operators:[...allOperators.values()]};
  }
}

if(typeof WorkerGlobalScope==='function'&&globalThis instanceof WorkerGlobalScope){
  let service=null;
  globalThis.onmessage=async event=>{
    const message=event.data;
    if(message?.op==='init'){service?.cancelAll();service=new BusDataService(message.base,{maximumBytes:message.maximumBytes,overview:message.overview});return;}
    if(message?.op==='cancel'){service?.cancel(message.reader);return;}
    if(message?.op==='cancelAll'){service?.cancelAll();return;}
    try{if(!service)throw new Error('Bus worker has not initialized');const result=await service.run(message),buffers=result?.overview&&result.routes.length?[result.routes[0]._world.buffer]:[];globalThis.postMessage({id:message.id,result},buffers);}
    catch(error){globalThis.postMessage({id:message?.id,error:{name:error.name||'Error',message:error.message||'Bus data unavailable'}});}
  };
}
