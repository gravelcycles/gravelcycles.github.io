// Station-panel journey index (rail_data/station_panel.py). A station panel
// reads only the chunks that hold a call at the station, by HTTP range from one
// blob, instead of every journey part that touches it. The index is valid only
// beside the delivery it names; anything else falls back to the journey parts.
import{decodeJSONBytes}from'./data-codec.js?v=cd2b5907bb9e923a';
import{fetchWithTransientRetry}from'./transient-fetch.js?v=cd2b5907bb9e923a';

export const STATION_PANEL_KIND='station_panel_journey_index';
export function stationPanelURL(name='station-panel.json'){const url=new URL('./'+name,import.meta.url);url.search=new URL(import.meta.url).search;return url.href;}
const sameDates=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,i)=>value===b[i]);
export function validStationPanel(index,manifest){
  if(!index||index.kind!==STATION_PANEL_KIND||index.schemaVersion!==1||!manifest)return false;
  const binding=index.binding,blob=index.blob;
  if(!binding||binding.releaseId!==manifest.releaseId||!sameDates(binding.dates,manifest.dates))return false;
  if(!blob||typeof blob.path!=='string'||!/^[\w.-]+$/.test(blob.path)||!Number.isInteger(blob.bytes)||typeof blob.sha256!=='string')return false;
  return Array.isArray(index.ranges)&&!!index.stations&&typeof index.stations==='object';
}
export function stationPanelBlobURL(index){const url=new URL(stationPanelURL(index.blob.path));url.searchParams.set('v',index.blob.sha256.slice(0,16));return url.href;}
// Contiguous chunks become one request; each run keeps its members' lengths so
// the worker can split the bytes back into gzip members.
export function stationPanelRuns(index,stationIds){
  const chunks=new Set();
  for(const id of stationIds){const list=index.stations[id];if(list===undefined)continue;if(!Array.isArray(list))throw new Error('Invalid station panel index');for(const chunk of list){if(!Number.isInteger(chunk)||chunk<0||chunk>=index.ranges.length)throw new Error('Invalid station panel index');chunks.add(chunk);}}
  const runs=[];
  for(const chunk of[...chunks].sort((a,b)=>a-b)){
    const range=index.ranges[chunk];
    if(!Array.isArray(range)||!Number.isInteger(range[0])||!Number.isInteger(range[1])||range[0]<0||range[1]<=0||range[0]+range[1]>index.blob.bytes)throw new Error('Invalid station panel range');
    const last=runs[runs.length-1];
    if(last&&last.offset+last.length===range[0]){last.length+=range[1];last.members.push(range[1]);}
    else runs.push({offset:range[0],length:range[1],members:[range[1]]});
  }
  return runs;
}

const decoded=new Map();let decodedCost=0;const DECODED_BUDGET=48*1024*1024;
function remember(key,journeys,cost){decoded.set(key,{journeys,cost});decodedCost+=cost;for(const[k,v]of decoded){if(decodedCost<=DECODED_BUDGET||k===key)break;decoded.delete(k);decodedCost-=v.cost;}}
async function readRun(url,run,signal,fetcher){
  const response=await fetcher(url,{headers:{Range:`bytes=${run.offset}-${run.offset+run.length-1}`},signal});
  // A host that ignores Range would send the whole blob: refuse it, and let
  // the caller fall back to the journey parts.
  if(response.status!==206)throw new Error('Station panel range not served ('+response.status+')');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length!==run.length)throw new Error('Station panel range has the wrong length');
  const parts=[];let at=0;
  for(const length of run.members){parts.push({offset:run.offset+at,bytes:bytes.subarray(at,at+length)});at+=length;}
  return parts;
}
export async function queryStationPanelJourneys(url,runs,stationIds,{signal,fetcher=fetchWithTransientRetry,onProgress}={}){
  const ids=new Set(stationIds),matches=new Map(),pending=[];
  for(const run of runs){
    let at=run.offset;const missing=run.members.some(length=>{const hit=decoded.has(url+'#'+at);at+=length;return!hit;});
    if(missing)pending.push(run);else{let offset=run.offset;for(const length of run.members){collect(decoded.get(url+'#'+offset).journeys);offset+=length;}}
  }
  function collect(journeys){for(const journey of journeys)if((journey.stops||[]).some(call=>ids.has(Array.isArray(call)?call[0]:call.id)))matches.set(JSON.stringify([journey.source,journey.snapshot,journey.id,journey.agencyPrimary!==false]),journey);}
  const total=runs.reduce((sum,run)=>sum+run.members.length,0);let done=total-pending.reduce((sum,run)=>sum+run.members.length,0);onProgress?.(done,total);
  for(let start=0;start<pending.length;start+=4){
    const batches=await Promise.all(pending.slice(start,start+4).map(run=>readRun(url,run,signal,fetcher)));
    for(const parts of batches)for(const part of parts){
      let cost=0;const data=await decodeJSONBytes(part.bytes,size=>{cost=size*3;});
      const journeys=Array.isArray(data?.journeys)?data.journeys:[];remember(url+'#'+part.offset,journeys,cost);collect(journeys);
      onProgress?.(++done,total);
    }
    if(signal?.aborted)throw new DOMException('Data request cancelled','AbortError');
  }
  // Restore the journey parts' order, so a panel lists tied route groups
  // exactly as it does when it reads the parts.
  return[...matches.values()].sort((a,b)=>(a._panelOrder??0)-(b._panelOrder??0));
}
