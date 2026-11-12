import{BUS_LIMITS}from'./bus-core.js?v=fce68094a07b4a25';
import{BusDataService}from'./bus-data-worker.js?v=fce68094a07b4a25';

const aborted=()=>new DOMException('Stale bus request','AbortError');
let sequence=0;
function work(id,active){if(typeof globalThis.document?.dispatchEvent==='function'&&typeof CustomEvent==='function')document.dispatchEvent(new CustomEvent('atlasdatawork',{detail:{id:'bus:'+id,active}}));}

export class BusDataClient{
  constructor(base,{workerFactory,fetcher,maximumBytes=BUS_LIMITS.cacheBytes,requireHashes=false,overview=null,detailsBaseUrl=null,overviewBaseUrl=null,busAtlasOverview=null,busGeometry=null,busNetwork=null,busDuplicates=null,countryOverview=null,places=null,localRouting=null}={}){
    this.base=new URL(base).href;this.options={maximumBytes,requireHashes:requireHashes||detailsBaseUrl!==null,overview,busAtlasOverview,busGeometry,busNetwork,busDuplicates,countryOverview,places,localRouting,detailsBaseUrl:detailsBaseUrl===null?null:String(detailsBaseUrl),overviewBaseUrl:overviewBaseUrl===null?null:String(overviewBaseUrl),...(fetcher?{fetcher}:{})};this.workerFactory=workerFactory||(()=>{const url=new URL('./bus-data-worker.js?v=fce68094a07b4a25',import.meta.url);url.search=new URL(import.meta.url).search;return new Worker(url,{type:'module',name:'bus-atlas-data'});});this.worker=null;this.started=false;this.pending=new Map();this.fallback=null;this.manifestDescriptor=null;
  }
  start(){
    if(this.started)return;this.started=true;
    try{this.worker=this.workerFactory();this.worker.onmessage=event=>{const response=event.data,job=this.pending.get(response?.id);if(!job){response?.result?.bitmap?.close();return;}if(response.error){const error=new Error(response.error.message);error.name=response.error.name||'Error';this.settle(response.id,error);}else this.settle(response.id,null,response.result);};this.worker.onerror=event=>{event.preventDefault?.();this.failWorker();};this.worker.postMessage({op:'init',base:this.base,maximumBytes:this.options.maximumBytes,requireHashes:this.options.requireHashes,overview:this.options.overview,busAtlasOverview:this.options.busAtlasOverview,busGeometry:this.options.busGeometry,busNetwork:this.options.busNetwork,busDuplicates:this.options.busDuplicates,countryOverview:this.options.countryOverview,places:this.options.places,localRouting:this.options.localRouting,detailsBaseUrl:this.options.detailsBaseUrl,overviewBaseUrl:this.options.overviewBaseUrl});}
    catch{this.worker?.terminate();this.worker=null;}
  }
  service(){if(!this.fallback){this.fallback=new BusDataService(this.base,this.options);if(this.manifestDescriptor)this.fallback.manifestDescriptor=this.manifestDescriptor;}return this.fallback;}
  settle(id,error,result){const job=this.pending.get(id);if(!job){result?.bitmap?.close();return;}this.pending.delete(id);work(id,false);if(error)job.reject(error);else{if(job.message.op==='load'&&result?.kind==='bus_atlas_manifest'){const descriptor=job.message.descriptor;this.manifestDescriptor=typeof descriptor==='string'?descriptor:{...descriptor};if(this.fallback)this.fallback.manifestDescriptor=this.manifestDescriptor;}job.resolve(result);}}
  local(id,job){this.service().run(job.message).then(result=>this.settle(id,null,result),error=>this.settle(id,error));}
  failWorker(){if(!this.worker)return;this.worker.terminate();this.worker=null;for(const[id,job]of this.pending)this.local(id,job);}
  request(message){
    this.start();return new Promise((resolve,reject)=>{const id=++sequence,job={message,resolve,reject};this.pending.set(id,job);work(id,true);if(!this.worker){this.local(id,job);return;}try{this.worker.postMessage({...message,id});}catch{this.failWorker();}});
  }
  load(descriptor,options={}){return this.request({op:'load',descriptor:typeof descriptor==='string'?descriptor:{...descriptor},options:{reader:'viewport',...options}});}
  search(input,query,filters,dates,options={}){return this.request({op:'search',...(input?.search?{manifest:input}:{descriptor:input}),query,filters:{...filters},dates,options:{reader:'search',...options}});}
  findRoute(input,routeId,options={}){return this.request({op:'findRoute',...(input?.search?{manifest:input}:{descriptor:input}),routeId,options:{reader:'detail-index',...options}});}
  viewport(manifest,bounds,zoom,filters,options={}){return this.request({op:'viewport',manifest,bounds,zoom,filters:{...filters},options:{reader:'viewport',...options}});}
  geometryReference(manifest,detail,options={}){return this.request({op:'geometryReference',manifest,detail,options:{reader:'geometry',includeFine:false,...options}});}
  countryInfo(options={}){return this.request({op:'countryInfo',options:{reader:'country',...options}});}
  places(query,country='',options={}){return this.request({op:'places',query,country,options:{reader:'places',...options}});}
  networkSearch(sceneId,query){return this.request({op:'networkSearch',sceneId,query,options:{reader:'network-search'}});}
  networkHit(sceneId,x,y,radius){return this.request({op:'networkHit',sceneId,x,y,radius,options:{reader:'network-hit'}});}
  aggregateHit(sceneId,x,y){return this.request({op:'aggregateHit',sceneId,x,y,options:{reader:'aggregate-hit'}});}
  cancel(reader){for(const[id,job]of [...this.pending])if(job.message.options.reader===reader)this.settle(id,aborted());this.worker?.postMessage({op:'cancel',reader});this.fallback?.cancel(reader);}
  cancelAll(){for(const id of [...this.pending.keys()])this.settle(id,aborted());this.worker?.terminate();this.worker=null;this.started=false;this.fallback?.cancelAll();this.fallback=null;this.manifestDescriptor=null;}
}
