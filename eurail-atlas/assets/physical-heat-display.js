/* The Traffic view's compact display packet (rail_data/physical_heat_display.py).
 * It holds exactly the sections of the delivery's physical heat product: the
 * same cohort profiles and sets, atomic counts and integer-microdegree
 * geometry, in spatial order. Section ids live in 256 small shards keyed by
 * two id characters; a section carries a provisional "#<display index>" id
 * until it is picked or deep linked and its real id is read from one shard. */
import{worldPoint}from'./atlas-core.js?v=9950f30ee93e8b21';
import{PHYSICAL_HEAT_FORMAT,validateCohorts}from'./physical-heat.js?v=9950f30ee93e8b21';
import{PHYSICAL_TRANSFER_FORMAT}from'./physical-transfer.js?v=9950f30ee93e8b21';
import{fetchWithTransientRetry}from'./transient-fetch.js?v=9950f30ee93e8b21';

export const PHYSICAL_DISPLAY_FORMAT='rail-atlas-physical-heat-display-v2';
export const PHYSICAL_DISPLAY_INDEX='assets/physical-heat/manifest.json';
const HEX='0123456789abcdef';
const invalid=message=>{throw new Error('Invalid Traffic display packet'+(message?': '+message:''));};
export const isProvisionalSectionId=id=>typeof id==='string'&&/^#\d+$/.test(id);
export const provisionalIndex=id=>isProvisionalSectionId(id)?Number(id.slice(1)):null;

// Why an index cannot be used (null when it can): the viewer then reads the
// complete JSON product, says so in the console and records the reason.
export function displayIndexProblem(index,manifest,dates){
  if(!index)return'no Traffic display index for this delivery';
  if(index.format!==PHYSICAL_DISPLAY_FORMAT||index.schemaVersion!==1)return'unsupported Traffic display index format';
  const logical=manifest?.files?.physicalRailHeat,sha=manifest?.assets?.[manifest?.assetPaths?.[logical]]?.sha256;
  if(index.heat?.sha256!==sha||index.heat?.logicalPath!==logical)return'index for another heat asset';
  if(!Array.isArray(index.dates)||!Array.isArray(dates)||index.dates.length!==dates.length||index.dates.some((date,i)=>date!==dates[i]))return'index for other service dates';
  return displayIndexMatches(index,manifest,dates)?null:'incomplete Traffic display index';
}
// The index must name the very heat asset this manifest publishes; anything
// else (a stale copy, another week) is ignored and the JSON product is read.
export function displayIndexMatches(index,manifest,dates){
  const logical=manifest?.files?.physicalRailHeat,physical=manifest?.assetPaths?.[logical],sha=manifest?.assets?.[physical]?.sha256;
  return!!(index&&index.format===PHYSICAL_DISPLAY_FORMAT&&index.schemaVersion===1&&typeof sha==='string'&&index.heat?.sha256===sha&&index.heat?.logicalPath===logical
    &&Array.isArray(index.dates)&&Array.isArray(dates)&&index.dates.length===dates.length&&index.dates.every((date,i)=>date===dates[i])
    &&Number.isSafeInteger(index.sections)&&Array.isArray(index.tiles?.list)&&index.tiles.list.length>0&&index.ids&&typeof index.ids.shards==='object'
    &&index.tiles.list.every((tile,k,list)=>typeof tile?.path==='string'&&/^[0-9a-f]{64}$/.test(tile.sha256||'')&&Number.isSafeInteger(tile.first)&&Number.isSafeInteger(tile.sections)&&tile.sections>0
      &&tile.first===(k?list[k-1].first+list[k-1].sections:0)&&Array.isArray(tile.bbox)&&tile.bbox.length===4&&tile.bbox.every(Number.isSafeInteger))
    &&index.tiles.list.at(-1).first+index.tiles.list.at(-1).sections===index.sections);
}
export function displayAssetURL(path,sha){const url=new URL('./'+path.replace(/^assets\//,''),import.meta.url);if(/^[0-9a-f]{64}$/.test(sha||''))url.searchParams.set('v',sha);return url.href;}
export function displayTilePath(tile){return'assets/physical-heat/'+tile.path;}
// Tiles whose section extent meets [west, south, east, north] (degrees), the
// ones nearest the given centre first.
export function tilesForBounds(index,[west,south,east,north],[lon,lat]=[(west+east)/2,(south+north)/2]){
  const scale=1e6,rows=[];
  index.tiles.list.forEach((tile,k)=>{const[a,b,c,d]=tile.bbox.map(v=>v/scale);if(c<west||a>east||d<south||b>north)return;
    const dx=Math.max(a-lon,0,lon-c),dy=Math.max(b-lat,0,lat-d);rows.push([dx*dx+dy*dy,k]);});
  return rows.sort((x,y)=>x[0]-y[0]||x[1]-y[1]).map(row=>row[1]);
}
// Decoded tiles to drop so at most `budget` stay loaded: never a kept tile
// (the view, a pending tap, the selection), the least recently viewed first.
export function tilesToEvict(loaded,{keep=new Set(),used=[],budget=Infinity}={}){
  const excess=loaded.length-budget;if(!(excess>0))return[];
  return loaded.filter(k=>!keep.has(k)).sort((a,b)=>(used[a]||0)-(used[b]||0)||a-b).slice(0,excess);
}
export function tileForDisplayIndex(index,at){
  const list=index?.tiles?.list||[];let lo=0,hi=list.length-1;
  while(lo<=hi){const mid=(lo+hi)>>1,tile=list[mid];if(at<tile.first)hi=mid-1;else if(at>=tile.first+tile.sections)lo=mid+1;else return mid;}
  return-1;
}
export function sectionIdKey(id,index){const offset=index?.ids?.keyOffset??13,length=index?.ids?.keyLength??2;return typeof id==='string'?id.slice(offset,offset+length):'';}
export function displayShardPath(index,key){
  const shard=index?.ids?.shards?.[key];if(!shard||!/^[0-9a-f]{2}$/.test(key))return null;
  return{path:'assets/physical-heat/'+index.ids.directory+'/'+key+'.json.gz',sha256:shard.sha256};
}
export function keyForDisplayIndex(keys,displayIndex){
  if(!(keys instanceof Uint8Array)||!Number.isInteger(displayIndex)||displayIndex<0||displayIndex>=keys.length)return null;
  const value=keys[displayIndex];return HEX[value>>4]+HEX[value&15];
}
export function shardLookup(shard,key){
  if(shard?.format!==PHYSICAL_DISPLAY_FORMAT+'-ids'||shard.key!==key||!Array.isArray(shard.sections))invalid('id shard');
  const byId=new Map(),byIndex=new Map();
  for(const row of shard.sections){if(!Array.isArray(row)||typeof row[0]!=='string'||!Number.isSafeInteger(row[1]))invalid('id shard row');byId.set(row[0],row[1]);byIndex.set(row[1],row[0]);}
  return{byId,byIndex};
}

function column(view,buffer,base,[name,dtype,offset,length]){
  const types={uint8:Uint8Array,uint16:Uint16Array,uint32:Uint32Array},Type=types[dtype];
  if(!Type||!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset%Type.BYTES_PER_ELEMENT)invalid(name);
  const start=base+offset,end=start+length*Type.BYTES_PER_ELEMENT;if(end>buffer.byteLength)invalid(name);
  // Little-endian on every platform the atlas supports; copy when unaligned.
  return start%Type.BYTES_PER_ELEMENT===0?new Type(buffer,start,length):new Type(buffer.slice(start,end));
}

// Decode the binary packet (after gunzip) straight into the worker transport of
// physical-transfer.js: typed columns, one projected buffer, the shared profile
// objects. No per-section object exists until the UI thread unpacks it.
// Sections are ordered by weekly weight (stable), the renderer's paint order.
export function packPhysicalDisplay(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input),buffer=bytes.byteOffset===0&&bytes.byteLength===bytes.buffer.byteLength?bytes.buffer:Uint8Array.prototype.slice.call(bytes).buffer,view=new DataView(buffer);
  if(view.byteLength<12||view.getUint8(0)!==82||view.getUint8(1)!==80||view.getUint8(2)!==72||view.getUint8(3)!==68||view.getUint32(4,true)!==1)invalid('header');
  const headLength=view.getUint32(8,true);if(12+headLength>view.byteLength)invalid('header length');
  const head=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,12,headLength))),base=12+headLength;
  const heat=head?.heat;
  if(head?.format!==PHYSICAL_DISPLAY_FORMAT||head.schemaVersion!==1||heat?.format!==PHYSICAL_HEAT_FORMAT||heat.schemaVersion!==1||!Array.isArray(heat.dates)||heat.dates.length!==7||!Number.isSafeInteger(head.sections)||head.sections<1||!Array.isArray(head.layout)||!Array.isArray(head.cohortProfiles))invalid('metadata');
  const columns={};for(const entry of head.layout){if(!Array.isArray(entry)||typeof entry[0]!=='string'||columns[entry[0]])invalid('layout');columns[entry[0]]=column(view,buffer,base,entry);}
  const{setOffsets,setRefs,sectionSets,atomic,pointCounts,shared,idKeys,coordinates}=columns,n=head.sections,profiles=head.cohortProfiles,firstIndex=head.firstIndex??0;
  if(!Number.isSafeInteger(firstIndex)||firstIndex<0)invalid('first index');
  if(!setOffsets||!setRefs||!coordinates||[sectionSets,atomic,pointCounts,shared,idKeys].some(c=>!c||c.length!==n)||setOffsets[0]!==0||setOffsets[setOffsets.length-1]!==setRefs.length)invalid('columns');
  validateCohorts(profiles);
  const weights=profiles.map(c=>c.daily.reduce((a,b)=>a+b,0)),setCount=setOffsets.length-1,setWeights=new Float64Array(setCount);
  for(let index=0;index<setCount;index++){
    const start=setOffsets[index],end=setOffsets[index+1];if(end<start)invalid('cohort set');
    let weight=0;for(let at=start;at<end;at++){const ref=setRefs[at];if(ref>=profiles.length)invalid('cohort reference');weight+=weights[ref];}
    setWeights[index]=weight;
  }
  let total=0;for(let index=0;index<n;index++){total+=pointCounts[index];if(pointCounts[index]<2||sectionSets[index]>=setCount||atomic[index]<1||shared[index]>1||index===0&&shared[index])invalid('section');}
  // Geometry in display order: world coordinates, bounding boxes, endpoints.
  const world=new Float64Array(total*2),starts=new Uint32Array(n),boxes=new Float64Array(n*8);
  let point=0,cursor=0,x=0,y=0;
  const readValue=()=>{let result=0,shift=0,byte;do{if(cursor>=coordinates.length)invalid('coordinates');byte=coordinates[cursor++];result+=(byte&127)*2**shift;shift+=7;}while(byte&128);return result%2?-(result+1)/2:result/2;};
  for(let index=0;index<n;index++){
    const count=pointCounts[index],at0=index*8;starts[index]=point*2;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(let at=0;at<count;at++){
      if(at===0&&shared[index]){world[point*2]=world[point*2-2];world[point*2+1]=world[point*2-1];boxes[at0+4]=x/1e6;boxes[at0+5]=y/1e6;}
      else{
        x+=readValue();y+=readValue();if(Math.abs(x)>180000000||Math.abs(y)>85000000||x===0&&y===0)invalid('coordinate');
        const[wx,wy]=worldPoint(x/1e6,y/1e6);world[point*2]=wx;world[point*2+1]=wy;
        if(at===0){boxes[at0+4]=x/1e6;boxes[at0+5]=y/1e6;}
      }
      const wx=world[point*2],wy=world[point*2+1];point++;
      if(wx<minX)minX=wx;if(wx>maxX)maxX=wx;if(wy<minY)minY=wy;if(wy>maxY)maxY=wy;
    }
    boxes[at0]=minX;boxes[at0+1]=minY;boxes[at0+2]=maxX;boxes[at0+3]=maxY;boxes[at0+6]=x/1e6;boxes[at0+7]=y/1e6;
  }
  if(cursor!==coordinates.length)invalid('coordinate stream');
  // Stable ascending weekly order, as prepareLoadedData sorts decoded rows.
  const order=new Uint32Array(n);for(let index=0;index<n;index++)order[index]=index;
  order.sort((a,b)=>setWeights[sectionSets[a]]-setWeights[sectionSets[b]]||a-b);
  let idLength=0;for(let index=0;index<n;index++)idLength+=1+String(firstIndex+index).length;
  const ids=new Uint16Array(idLength),idOffsets=new Uint32Array(n+1),spans=new Uint32Array(n*2),values=new Float64Array(n*10),cohortIndices=new Uint32Array(n);
  let idOffset=0;
  for(let row=0;row<n;row++){
    const index=order[row],label='#'+(firstIndex+index),offset=row*10,at0=index*8;idOffsets[row]=idOffset;
    for(let at=0;at<label.length;at++)ids[idOffset++]=label.charCodeAt(at);
    spans[row*2]=starts[index];spans[row*2+1]=pointCounts[index]*2;
    values.set(boxes.subarray(at0,at0+8),offset);values[offset+8]=setWeights[sectionSets[index]];values[offset+9]=atomic[index];cohortIndices[row]=sectionSets[index];
  }
  idOffsets[n]=idOffset;
  const cohortSetIndices=new Uint32Array(setCount);for(let index=0;index<setCount;index++)cohortSetIndices[index]=index;
  const cohortOffsets=new Uint32Array(setOffsets),cohortReferences=new Uint32Array(setRefs);
  const{format,schemaVersion,dates,coverage,method,summary}=heat;
  const metadata={format,schemaVersion,dates,...(coverage!==undefined?{coverage}:{}),...(method!==undefined?{method}:{}),...(summary!==undefined?{summary}:{}),display:{firstIndex,idKeys:new Uint8Array(idKeys)}};
  const data={format:PHYSICAL_TRANSFER_FORMAT,schemaVersion:1,metadata,count:n,ids,idOffsets,spans,values,cohortIndices,world,profiles,cohortSetIndices,cohortOffsets,cohortReferences};
  return{data,transfer:[ids.buffer,idOffsets.buffer,spans.buffer,values.buffer,cohortIndices.buffer,world.buffer,cohortSetIndices.buffer,cohortOffsets.buffer,cohortReferences.buffer,metadata.display.idKeys.buffer]};
}

export async function gunzipBytes(bytes){
  if(!(bytes.length>=2&&bytes[0]===0x1f&&bytes[1]===0x8b))return bytes;
  if(typeof DecompressionStream==='function')return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const{gunzip}=await import('./gunzip.js?v=9950f30ee93e8b21');return gunzip(bytes);
}
export async function fetchPhysicalDisplay(url,{signal}={}){
  const response=await fetchWithTransientRetry(url,{signal});if(!response.ok)throw new Error('Traffic display packet unavailable');
  return packPhysicalDisplay(await gunzipBytes(new Uint8Array(await response.arrayBuffer())));
}
