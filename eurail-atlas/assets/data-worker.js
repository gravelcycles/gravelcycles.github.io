import{decodeJSONResponse,decodeJSONBytes}from'./data-codec.js?v=0c2f14c2bb7ee3cb';
import{decodeDisplay}from'./display-codec.js?v=0c2f14c2bb7ee3cb';
import{prepareEdge,normalize,journeyMatchesEdge}from'./atlas-core.js?v=0c2f14c2bb7ee3cb';

// Keep geometry as transferable numeric buffers. Sending the original nested
// coordinate arrays as well would make structured cloning stall the UI thread.
export function prepareLoadedData(data){
  data=decodeDisplay(data);
  const transfer=[],transferred=new Set();
  const prepare=rows=>rows.map(row=>{
    const edge=prepareEdge(row);if(!edge)return null;
    edge._pointCount=edge._world.length/2;
    edge.coords=[edge.coords[0],edge.coords[edge.coords.length-1]];
    if(!transferred.has(edge._world.buffer)){transferred.add(edge._world.buffer);transfer.push(edge._world.buffer);}return edge;
  }).filter(Boolean);
  if(Array.isArray(data?.edges))data.edges=prepare(data.edges);
  else if(Array.isArray(data)&&data[0]?.coords)data=prepare(data);
  for(const rows of[data?.stations,data?.hubs])if(Array.isArray(rows))for(const row of rows)if(row&&typeof row==='object'&&typeof row.name==='string')row._name=normalize(row.name);
  return{data,transfer};
}

// This is the same direct-ride test as the UI: exact ordered passenger calls,
// source pickup/drop-off permissions, and no inferred connecting itinerary.
export function findMatchingJourneys(parts,fromValues,toValues){
  const from=new Set(fromValues),to=new Set(toValues),unique=new Map(),matches=[];
  for(const part of parts)for(const journey of part.journeys||[])unique.set(journey.id,journey);
  for(const journey of unique.values()){
    if(!Array.isArray(journey.stops))continue;let match=null;
    for(let i=0;i<journey.stops.length&&!match;i++){
      const call=journey.stops[i],id=Array.isArray(call)?call[0]:call.id;
      if(!from.has(id))continue;
      const pickup=Array.isArray(call)?String(call[1]??'0'):String(call.pickup??'0');
      if(pickup==='1')continue;
      for(let k=i+1;k<journey.stops.length;k++){
        const end=journey.stops[k],id=Array.isArray(end)?end[0]:end.id;
        const drop=Array.isArray(end)?String(end[2]??'0'):String(end.dropoff??'0');
        if(to.has(id)&&drop!=='1'){match={from:i,to:k,conditional:['2','3'].includes(pickup)||['2','3'].includes(drop)};break;}
      }
    }
    if(match)matches.push({...journey,_match:match});
  }
  return{matches,loaded:unique.size};
}

const journeyParts=new Map(),decodedSizes=new WeakMap();
const JOURNEY_CACHE_BYTES=64*1024*1024;let journeyCacheBytes=0;
let fetching=0;const fetchQueue=[];
function pump(){while(fetching<3&&fetchQueue.length){const task=fetchQueue.shift();if(task.signal?.aborted){task.reject(abortError());continue;}fetching++;task.run().then(task.resolve,task.reject).finally(()=>{fetching--;pump();});}}
function abortError(){return new DOMException('Data request cancelled','AbortError');}
export function readJSON(url,{fresh=false,signal}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(abortError());return;}
    const task={signal,resolve,reject,run:async()=>{
      const response=await fetch(url,{cache:fresh?'no-cache':'default',signal});
      if(!response.ok)throw new Error('HTTP '+response.status+' for '+new URL(url).pathname);
      let decoded=0;const data=await decodeJSONResponse(response,size=>{decoded=size;});
      if(data&&typeof data==='object')decodedSizes.set(data,decoded);return data;
    }};
    const abort=()=>{const i=fetchQueue.indexOf(task);if(i>=0){fetchQueue.splice(i,1);reject(abortError());}};
    signal?.addEventListener('abort',abort,{once:true});
    task.resolve=value=>{signal?.removeEventListener('abort',abort);resolve(value);};
    task.reject=error=>{signal?.removeEventListener('abort',abort);reject(error);};
    fetchQueue.push(task);pump();
  });
}
async function journeyPart(url,signal){
  if(journeyParts.has(url)){const cached=journeyParts.get(url);journeyParts.delete(url);journeyParts.set(url,cached);return cached.promise;}
  const cached={cost:0,promise:null};
  cached.promise=readJSON(url,{signal}).then(data=>{
    // A conservative estimate covers text plus parsed arrays/objects. Large
    // parts still answer this lookup but are not retained after it completes.
    cached.cost=(decodedSizes.get(data)||0)*3;
    if(journeyParts.get(url)===cached){journeyCacheBytes+=cached.cost;trimJourneyCache();}
    return data;
  }).catch(error=>{removeJourneyPart(url,cached);throw error;});
  journeyParts.set(url,cached);
  // Two decoded country parts are enough for an ordinary cross-border lookup.
  // Other files can be fetched again; visited regions must not accumulate forever.
  trimJourneyCache();return cached.promise;
}
function removeJourneyPart(url,expected){const found=journeyParts.get(url);if(found&&(!expected||found===expected)){journeyParts.delete(url);journeyCacheBytes-=found.cost;}}
function trimJourneyCache(){while(journeyParts.size>2||journeyCacheBytes>JOURNEY_CACHE_BYTES)removeJourneyPart(journeyParts.keys().next().value);}
export async function queryJourneys(urls,from,to,{signal}={}){
  const parts=await Promise.all(urls.map(url=>journeyPart(url,signal)));
  if(signal?.aborted)throw abortError();
  return findMatchingJourneys(parts,from,to);
}
export function findEdgeJourneys(parts,directions){
  const matches=new Map();
  for(const part of parts)for(const journey of part.journeys||[]){
    if(directions.some(edge=>journeyMatchesEdge(journey,edge)))matches.set(JSON.stringify([journey.source,journey.id,journey.agencyPrimary!==false]),journey);
  }
  return[...matches.values()];
}
export async function queryEdgeJourneys(urls,directions,{signal}={}){
  const parts=await Promise.all(urls.map(url=>journeyPart(url,signal)));
  if(signal?.aborted)throw abortError();
  return findEdgeJourneys(parts,directions);
}
export function findStationJourneys(parts,stationIds){
  const ids=new Set(stationIds),matches=new Map();
  for(const part of parts)for(const journey of part.journeys||[]){
    if((journey.stops||[]).some(call=>ids.has(Array.isArray(call)?call[0]:call.id)))matches.set(JSON.stringify([journey.source,journey.snapshot,journey.id,journey.agencyPrimary!==false]),journey);
  }
  return[...matches.values()];
}
export async function queryStationJourneys(urls,stationIds,{signal}={}){
  const parts=await Promise.all(urls.map(url=>journeyPart(url,signal)));
  if(signal?.aborted)throw abortError();
  return findStationJourneys(parts,stationIds);
}

if(typeof WorkerGlobalScope!=='undefined'&&globalThis instanceof WorkerGlobalScope){
  const controllers=new Map();
  globalThis.addEventListener('message',async event=>{
    const message=event.data;
    if(message?.op==='cancel'){controllers.get(message.id)?.abort();return;}
    if(!Number.isInteger(message?.id))return;
    const controller=new AbortController();controllers.set(message.id,controller);
    try{
      if(message.op==='load'||message.op==='decode'){
        const result=prepareLoadedData(message.op==='decode'?await decodeJSONBytes(message.bytes):await readJSON(message.url,{fresh:message.fresh,signal:controller.signal}));
        if(!controller.signal.aborted)globalThis.postMessage({id:message.id,result:result.data},result.transfer);
      }else if(message.op==='journeys'){
        const result=await queryJourneys(message.urls,message.from,message.to,{signal:controller.signal});
        if(!controller.signal.aborted)globalThis.postMessage({id:message.id,result});
      }else if(message.op==='edgeJourneys'){
        const result=await queryEdgeJourneys(message.urls,message.directions,{signal:controller.signal});
        if(!controller.signal.aborted)globalThis.postMessage({id:message.id,result});
      }else if(message.op==='stationJourneys'){
        const result=await queryStationJourneys(message.urls,message.stationIds,{signal:controller.signal});
        if(!controller.signal.aborted)globalThis.postMessage({id:message.id,result});
      }else throw new Error('Unsupported data-worker request');
    }catch(error){globalThis.postMessage({id:message.id,error:{name:error.name,message:error.message}});}
    finally{controllers.delete(message.id);}
  });
}
