import{BUS_LIMITS,BusRequests,validBusDocument,viewportTiles,busMatches,intersects,searchBusRoutes,clearBusSearchCache}from'./bus-core.js?v=b9b3fd287d8ce04b';

const aborted=()=>new DOMException('Stale bus request','AbortError');
const operators=routes=>{const rows=new Map();for(const route of routes)if(route.operator)rows.set(JSON.stringify([route.sourceId,route.operator]),{sourceId:route.sourceId,name:route.operator});return[...rows.values()];};

// Keep large immutable JSON documents in the worker. Only the bounded visible
// geometry, search matches or selected route cross to the animation thread.
export class BusDataService{
  constructor(base,options={}){this.requests=new BusRequests(base,options);this.epochs=new Map();this.metadata=new WeakMap();}
  cancel(reader){this.epochs.set(reader,(this.epochs.get(reader)||0)+1);this.requests.cancel(reader);}
  cancelAll(){for(const reader of new Set([...this.epochs.keys(),...this.requests.readers.keys()]))this.cancel(reader);this.requests.cancelAll();this.metadata=new WeakMap();clearBusSearchCache();}
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
    const{manifest,bounds,zoom,filters}=message,plan=viewportTiles(manifest,bounds,zoom),pages=[];
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
    if(message?.op==='init'){service?.cancelAll();service=new BusDataService(message.base,{maximumBytes:message.maximumBytes});return;}
    if(message?.op==='cancel'){service?.cancel(message.reader);return;}
    if(message?.op==='cancelAll'){service?.cancelAll();return;}
    try{if(!service)throw new Error('Bus worker has not initialized');globalThis.postMessage({id:message.id,result:await service.run(message)});}
    catch(error){globalThis.postMessage({id:message?.id,error:{name:error.name||'Error',message:error.message||'Bus data unavailable'}});}
  };
}
