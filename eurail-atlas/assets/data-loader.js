import{prepareLoadedData,readJSON,queryJourneys,queryEdgeJourneys}from'./data-worker.js?v=6d01324ad8527f21';
import{decodeJSONBytes}from'./data-codec.js?v=6d01324ad8527f21';

function aborted(){return new DOMException('Data request cancelled','AbortError');}
export class AtlasDataLoader{
  constructor({workerFactory}={}){
    this.workerFactory=workerFactory||(()=>{
      const url=new URL('./data-worker.js?v=6d01324ad8527f21',import.meta.url);
      url.search=new URL(import.meta.url).search;
      return new Worker(url,{type:'module',name:'rail-atlas-data'});
    });
    this.pending=new Map();this.sequence=0;this.started=false;this.worker=null;
  }
  start(){
    if(this.started)return;this.started=true;
    try{
      this.worker=this.workerFactory();
      this.worker.onmessage=event=>{
        const response=event.data,job=this.pending.get(response?.id);if(!job)return;
        this.pending.delete(response.id);job.cleanup();
        if(response.error){const error=new Error(response.error.message);error.name=response.error.name||'Error';job.reject(error);}
        else job.resolve(response.result);
      };
      // Unsupported/blocked module workers retain the same functional loader.
      this.worker.onerror=event=>{event.preventDefault?.();this.failWorker();};
    }catch{this.worker=null;}
  }
  failWorker(){
    this.worker?.terminate();this.worker=null;
    const jobs=[...this.pending.values()];this.pending.clear();
    for(const job of jobs){job.cleanup();this.fallback(job.message,job.signal).then(job.resolve,job.reject);}
  }
  fallback(message,signal){
    if(signal?.aborted)return Promise.reject(aborted());
    if(message.op==='journeys')return queryJourneys(message.urls,message.from,message.to,{signal});
    if(message.op==='edgeJourneys')return queryEdgeJourneys(message.urls,message.directions,{signal});
    if(message.op==='decode')return decodeJSONBytes(message.bytes).then(data=>prepareLoadedData(data).data);
    return readJSON(message.url,{fresh:message.fresh,signal}).then(data=>prepareLoadedData(data).data);
  }
  request(message,{signal}={}){
    if(signal?.aborted)return Promise.reject(aborted());
    this.start();if(!this.worker)return this.fallback(message,signal);
    return new Promise((resolve,reject)=>{
      const id=++this.sequence;
      const abort=()=>{if(!this.pending.delete(id))return;this.worker?.postMessage({op:'cancel',id});cleanup();reject(aborted());};
      const cleanup=()=>signal?.removeEventListener('abort',abort);
      this.pending.set(id,{message,signal,resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true});
      try{this.worker.postMessage({...message,id});}catch{this.failWorker();}
    });
  }
  load(url,{fresh=false,signal}={}){return this.request({op:'load',url,fresh},{signal});}
  decode(bytes,options={}){return this.request({op:'decode',bytes},options);}
  findJourneys(urls,from,to,options={}){return this.request({op:'journeys',urls,from:[...from],to:[...to]},options);}
  findEdgeJourneys(urls,directions,options={}){return this.request({op:'edgeJourneys',urls,directions},options);}
}
