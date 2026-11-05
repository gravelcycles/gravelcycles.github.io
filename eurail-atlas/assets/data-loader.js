import{prepareLoadedData,readJSON,queryJourneys,queryEdgeJourneys,queryStationJourneys}from'./data-worker.js?v=78cd4ddea0382b77';
import{decodeJSONBytes}from'./data-codec.js?v=78cd4ddea0382b77';
import{isPhysicalTransfer,unpackPhysicalTransfer}from'./physical-transfer.js?v=78cd4ddea0382b77';

function aborted(){return new DOMException('Data request cancelled','AbortError');}
let loaderSequence=0;
function transportWork(id,active){if(typeof globalThis.document?.dispatchEvent==='function'&&typeof CustomEvent==='function')document.dispatchEvent(new CustomEvent('atlasdatawork',{detail:{id,active}}));}
// Display edges share metadata pages. Process a page once, even when a full
// route requests many of its edges at the same time; failed pages remain retryable.
export function createPageHydrator(load,process){
  const pages=new Map();
  return(url,context)=>{
    if(!pages.has(url)){
      const pending=Promise.resolve().then(()=>load(url)).then(data=>process(data,context,url)).catch(error=>{if(pages.get(url)===pending)pages.delete(url);throw error;});
      pages.set(url,pending);
    }
    return pages.get(url);
  };
}
export class AtlasDataLoader{
  constructor({workerFactory}={}){
    this.workerFactory=workerFactory||(()=>{
      const url=new URL('./data-worker.js?v=78cd4ddea0382b77',import.meta.url);
      url.search=new URL(import.meta.url).search;
      return new Worker(url,{type:'module',name:'rail-atlas-data'});
    });
    this.pending=new Map();this.sequence=0;this.loaderId=++loaderSequence;this.started=false;this.worker=null;
  }
  start(){
    if(this.started)return;this.started=true;
    try{
      this.worker=this.workerFactory();
      this.worker.onmessage=event=>{
        const response=event.data,job=this.pending.get(response?.id);if(!job)return;
        const settle=(method,value)=>{if(this.pending.get(response.id)!==job)return;this.pending.delete(response.id);job.transportWorkEnd?.();job.cleanup();job[method](value);};
        if(response.error){const error=new Error(response.error.message);error.name=response.error.name||'Error';settle('reject',error);}
        else if(isPhysicalTransfer(response.result)){
          // Receiving the buffers is cheap. Reconstruct the large object graph
          // in bounded tasks, retaining cancellation until the final row exists.
          if(job.transportController)return;
          const workId=this.loaderId+':'+response.id;let active=true;transportWork(workId,true);
          job.transportWorkEnd=()=>{if(active){active=false;transportWork(workId,false);}};
          job.transportController=new AbortController();
          unpackPhysicalTransfer(response.result,{signal:job.transportController.signal}).then(data=>settle('resolve',data),error=>settle('reject',error));
        }else settle('resolve',response.result);
      };
      // Unsupported/blocked module workers retain the same functional loader.
      this.worker.onerror=event=>{event.preventDefault?.();this.failWorker();};
    }catch{this.worker=null;}
  }
  failWorker(){
    this.worker?.terminate();this.worker=null;
    const jobs=[...this.pending.values()];this.pending.clear();
    for(const job of jobs){job.transportController?.abort();job.transportWorkEnd?.();job.cleanup();this.fallback(job.message,job.signal).then(job.resolve,job.reject);}
  }
  fallback(message,signal){
    if(signal?.aborted)return Promise.reject(aborted());
    if(message.op==='journeys')return queryJourneys(message.urls,message.from,message.to,{signal});
    if(message.op==='edgeJourneys')return queryEdgeJourneys(message.urls,message.directions,{signal});
    if(message.op==='stationJourneys')return queryStationJourneys(message.urls,message.stationIds,{signal});
    if(message.op==='decode')return decodeJSONBytes(message.bytes).then(data=>prepareLoadedData(data).data);
    return readJSON(message.url,{fresh:message.fresh,signal}).then(data=>prepareLoadedData(data).data);
  }
  request(message,{signal}={}){
    if(signal?.aborted)return Promise.reject(aborted());
    this.start();if(!this.worker)return this.fallback(message,signal);
    return new Promise((resolve,reject)=>{
      const id=++this.sequence;
      const abort=()=>{const job=this.pending.get(id);if(!job)return;this.pending.delete(id);job.transportController?.abort();job.transportWorkEnd?.();this.worker?.postMessage({op:'cancel',id});cleanup();reject(aborted());};
      const cleanup=()=>signal?.removeEventListener('abort',abort);
      this.pending.set(id,{message,signal,resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true});
      try{this.worker.postMessage({...message,id});}catch{this.failWorker();}
    });
  }
  load(url,{fresh=false,signal}={}){return this.request({op:'load',url,fresh},{signal});}
  decode(bytes,options={}){return this.request({op:'decode',bytes},options);}
  findJourneys(urls,from,to,options={}){return this.request({op:'journeys',urls,from:[...from],to:[...to]},options);}
  findEdgeJourneys(urls,directions,options={}){return this.request({op:'edgeJourneys',urls,directions},options);}
  findStationJourneys(urls,stationIds,options={}){return this.request({op:'stationJourneys',urls,stationIds:[...stationIds]},options);}
}
