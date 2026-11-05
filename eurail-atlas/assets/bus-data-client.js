import{BUS_LIMITS}from'./bus-core.js?v=7cc2de32b432a06f';
import{BusDataService}from'./bus-data-worker.js?v=7cc2de32b432a06f';

const aborted=()=>new DOMException('Stale bus request','AbortError');
let sequence=0;
function work(id,active){if(typeof globalThis.document?.dispatchEvent==='function'&&typeof CustomEvent==='function')document.dispatchEvent(new CustomEvent('atlasdatawork',{detail:{id:'bus:'+id,active}}));}

export class BusDataClient{
  constructor(base,{workerFactory,fetcher,maximumBytes=BUS_LIMITS.cacheBytes,overview=null}={}){
    this.base=new URL(base).href;this.options={maximumBytes,overview,...(fetcher?{fetcher}:{})};this.workerFactory=workerFactory||(()=>{const url=new URL('./bus-data-worker.js?v=7cc2de32b432a06f',import.meta.url);url.search=new URL(import.meta.url).search;return new Worker(url,{type:'module',name:'bus-atlas-data'});});this.worker=null;this.started=false;this.pending=new Map();this.fallback=null;
  }
  start(){
    if(this.started)return;this.started=true;
    try{this.worker=this.workerFactory();this.worker.onmessage=event=>{const response=event.data,job=this.pending.get(response?.id);if(!job)return;if(response.error){const error=new Error(response.error.message);error.name=response.error.name||'Error';this.settle(response.id,error);}else this.settle(response.id,null,response.result);};this.worker.onerror=event=>{event.preventDefault?.();this.failWorker();};this.worker.postMessage({op:'init',base:this.base,maximumBytes:this.options.maximumBytes,overview:this.options.overview});}
    catch{this.worker?.terminate();this.worker=null;}
  }
  service(){return this.fallback??=new BusDataService(this.base,this.options);}
  settle(id,error,result){const job=this.pending.get(id);if(!job)return;this.pending.delete(id);work(id,false);if(error)job.reject(error);else job.resolve(result);}
  local(id,job){this.service().run(job.message).then(result=>this.settle(id,null,result),error=>this.settle(id,error));}
  failWorker(){if(!this.worker)return;this.worker.terminate();this.worker=null;for(const[id,job]of this.pending)this.local(id,job);}
  request(message){
    this.start();return new Promise((resolve,reject)=>{const id=++sequence,job={message,resolve,reject};this.pending.set(id,job);work(id,true);if(!this.worker){this.local(id,job);return;}try{this.worker.postMessage({...message,id});}catch{this.failWorker();}});
  }
  load(descriptor,options={}){return this.request({op:'load',descriptor,options:{reader:'viewport',...options}});}
  search(descriptor,query,filters,dates,options={}){return this.request({op:'search',descriptor,query,filters:{...filters},dates,options:{reader:'search',...options}});}
  findRoute(descriptor,routeId,options={}){return this.request({op:'findRoute',descriptor,routeId,options:{reader:'search',...options}});}
  viewport(manifest,bounds,zoom,filters,options={}){return this.request({op:'viewport',manifest,bounds,zoom,filters:{...filters},options:{reader:'viewport',...options}});}
  cancel(reader){for(const[id,job]of [...this.pending])if(job.message.options.reader===reader)this.settle(id,aborted());this.worker?.postMessage({op:'cancel',reader});this.fallback?.cancel(reader);}
  cancelAll(){for(const id of [...this.pending.keys()])this.settle(id,aborted());this.worker?.terminate();this.worker=null;this.started=false;this.fallback?.cancelAll();this.fallback=null;}
}
