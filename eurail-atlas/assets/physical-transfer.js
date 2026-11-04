// A lossless worker transport for the reviewed decoded physical-section schema.
// Geometry and scalar columns transfer without cloning 650k rich row objects.
// Unrecognized fields retain the original object transport rather than disappear.
export const PHYSICAL_TRANSFER_FORMAT='rail-atlas-physical-transfer-v1';
const ROW_KEYS=new Set(['id','kind','geometryStatus','cohortSet','atomicSectionCount','cohorts','weekly','coords','_world','_pointCount','_bbox']);
const DOCUMENT_KEYS=new Set(['coverage','dates','format','method','schemaVersion','summary','cohortSets','sections','edges']);
const MAX_INDEX=0xffffffff;
const finiteRow=value=>Array.isArray(value)&&value.every(Number.isFinite);
const aborted=()=>new DOMException('Data request cancelled','AbortError');
const yieldWork=()=>globalThis.scheduler?.yield?globalThis.scheduler.yield():new Promise(resolve=>setTimeout(resolve,0));

export function packPhysicalTransfer(data){
  if(data?.format!=='rail-atlas-physical-heat-v1'||data.schemaVersion!==1||!Array.isArray(data.edges)||!data.edges.length||data.sections!==data.edges||!Array.isArray(data.cohortSets)||Object.keys(data).some(key=>!DOCUMENT_KEYS.has(key)))return null;
  const rows=data.edges,count=rows.length,buffer=rows[0]?._world?.buffer;
  if(!(buffer instanceof ArrayBuffer)||count>MAX_INDEX||data.cohortSets.length>MAX_INDEX)return null;
  let idLength=0;
  for(const row of rows){
    if(!row||Object.keys(row).length!==ROW_KEYS.size||Object.keys(row).some(key=>!ROW_KEYS.has(key))||typeof row.id!=='string'||row.kind!=='physical_section'||row.geometryStatus!=='inferred_physical_section'||!Number.isSafeInteger(row.cohortSet)||row.cohortSet<0||row.cohortSet>MAX_INDEX||data.cohortSets[row.cohortSet]!==row.cohorts||!Number.isSafeInteger(row.atomicSectionCount)||row.atomicSectionCount<1||!Number.isFinite(row.weekly)||!(row._world instanceof Float64Array)||row._world.buffer!==buffer||row._world.length<4||row._world.length%2||row._pointCount!==row._world.length/2||row._world.byteOffset/8+row._world.length>MAX_INDEX||!finiteRow(row._bbox)||row._bbox.length!==4||!Array.isArray(row.coords)||row.coords.length!==2||row.coords.some(point=>!finiteRow(point)||point.length!==2))return null;
    idLength+=row.id.length;if(idLength>MAX_INDEX)return null;
  }
  // Preserve set/profile aliases and repeated additive profile references.
  const sets=[],setIds=new Map(),profiles=[],profileIds=new Map(),cohortSetIndices=new Uint32Array(data.cohortSets.length);
  let references=0;
  for(let index=0;index<data.cohortSets.length;index++){
    const set=data.cohortSets[index];if(!Array.isArray(set))return null;
    let id=setIds.get(set);
    if(id===undefined){id=sets.length;setIds.set(set,id);sets.push(set);references+=set.length;if(references>MAX_INDEX)return null;}
    cohortSetIndices[index]=id;
  }
  const cohortOffsets=new Uint32Array(sets.length+1),cohortReferences=new Uint32Array(references);let referenceOffset=0;
  for(let index=0;index<sets.length;index++){
    cohortOffsets[index]=referenceOffset;
    for(const profile of sets[index]){
      if(!profile||typeof profile!=='object')return null;
      let id=profileIds.get(profile);
      if(id===undefined){id=profiles.length;if(id>MAX_INDEX)return null;profileIds.set(profile,id);profiles.push(profile);}
      cohortReferences[referenceOffset++]=id;
    }
  }
  cohortOffsets[sets.length]=referenceOffset;
  const ids=new Uint16Array(idLength),idOffsets=new Uint32Array(count+1),spans=new Uint32Array(count*2),values=new Float64Array(count*10),cohortIndices=new Uint32Array(count);
  let idOffset=0;
  for(let index=0;index<count;index++){
    const row=rows[index],offset=index*10;idOffsets[index]=idOffset;
    // UTF-16 code units retain even an unpaired surrogate exactly; UTF-8
    // TextEncoder would silently replace that otherwise valid JS string.
    for(let at=0;at<row.id.length;at++)ids[idOffset++]=row.id.charCodeAt(at);
    spans[index*2]=row._world.byteOffset/8;spans[index*2+1]=row._world.length;
    values.set(row._bbox,offset);values.set(row.coords[0],offset+4);values.set(row.coords[1],offset+6);
    values[offset+8]=row.weekly;values[offset+9]=row.atomicSectionCount;cohortIndices[index]=row.cohortSet;
  }
  idOffsets[count]=idOffset;
  const{edges,sections,cohortSets,...metadata}=data;
  const result={format:PHYSICAL_TRANSFER_FORMAT,schemaVersion:1,metadata,count,ids,idOffsets,spans,values,cohortIndices,world:new Float64Array(buffer),profiles,cohortSetIndices,cohortOffsets,cohortReferences};
  const transfer=[ids.buffer,idOffsets.buffer,spans.buffer,values.buffer,cohortIndices.buffer,buffer,cohortSetIndices.buffer,cohortOffsets.buffer,cohortReferences.buffer];
  return{data:result,transfer};
}

export const isPhysicalTransfer=data=>data?.format===PHYSICAL_TRANSFER_FORMAT;

export async function unpackPhysicalTransfer(packet,{signal,yield:pause=yieldWork,now=()=>performance.now(),budgetMs=6,batchSize=4096}={}){
  const invalid=()=>{throw new Error('Invalid physical rail worker transport');};
  if(signal?.aborted)throw aborted();
  const{count,ids,idOffsets,spans,values,cohortIndices,world,profiles,cohortSetIndices,cohortOffsets,cohortReferences,metadata}=packet||{};
  if(!isPhysicalTransfer(packet)||packet.schemaVersion!==1||metadata?.format!=='rail-atlas-physical-heat-v1'||metadata.schemaVersion!==1||!Number.isSafeInteger(count)||count<1||count>MAX_INDEX||!(ids instanceof Uint16Array)||!(idOffsets instanceof Uint32Array)||idOffsets.length!==count+1||idOffsets[0]!==0||idOffsets[count]!==ids.length||!(spans instanceof Uint32Array)||spans.length!==count*2||!(values instanceof Float64Array)||values.length!==count*10||!(cohortIndices instanceof Uint32Array)||cohortIndices.length!==count||!(world instanceof Float64Array)||!Array.isArray(profiles)||!(cohortSetIndices instanceof Uint32Array)||!(cohortOffsets instanceof Uint32Array)||cohortOffsets.length<1||cohortOffsets[0]!==0||!(cohortReferences instanceof Uint32Array)||cohortOffsets.at(-1)!==cohortReferences.length)invalid();
  let started=now(),work=0;
  function checkpoint(amount=1){
    work+=amount;
    if(work>=batchSize||(work%128===0&&now()-started>=budgetMs)){
      if(signal?.aborted)throw aborted();return Promise.resolve(pause()).then(()=>{if(signal?.aborted)throw aborted();work=0;started=now();});
    }
    return null;
  }
  const sets=new Array(cohortOffsets.length-1);
  for(let index=0;index<sets.length;index++){
    const start=cohortOffsets[index],end=cohortOffsets[index+1];if(end<start||end>cohortReferences.length)invalid();
    const set=new Array(end-start);
    for(let at=start;at<end;at++){
      const profile=cohortReferences[at];if(profile>=profiles.length||!profiles[profile]||typeof profiles[profile]!=='object')invalid();set[at-start]=profiles[profile];
      if((at-start)%128===127){const pending=checkpoint(128);if(pending)await pending;}
    }
    sets[index]=set;const pending=checkpoint(Math.max(1,(end-start)%128));if(pending)await pending;
  }
  const cohortSets=new Array(cohortSetIndices.length);
  for(let index=0;index<cohortSets.length;index++){
    if(cohortSetIndices[index]>=sets.length)invalid();cohortSets[index]=sets[cohortSetIndices[index]];const pending=checkpoint();if(pending)await pending;
  }
  const rows=new Array(count);
  for(let index=0;index<count;index++){
    const start=idOffsets[index],end=idOffsets[index+1],worldStart=spans[index*2],length=spans[index*2+1],offset=index*10,cohortSet=cohortIndices[index];
    if(end<start||end>ids.length||length<4||length%2||worldStart+length>world.length||cohortSet>=cohortSets.length)invalid();
    let id='';for(let at=start;at<end;at+=8192)id+=String.fromCharCode(...ids.subarray(at,Math.min(end,at+8192)));
    const bbox=[values[offset],values[offset+1],values[offset+2],values[offset+3]],first=[values[offset+4],values[offset+5]],last=[values[offset+6],values[offset+7]],weekly=values[offset+8],atomicSectionCount=values[offset+9];
    if(!bbox.every(Number.isFinite)||!first.every(Number.isFinite)||!last.every(Number.isFinite)||!Number.isFinite(weekly)||!Number.isSafeInteger(atomicSectionCount)||atomicSectionCount<1)invalid();
    rows[index]={id,kind:'physical_section',geometryStatus:'inferred_physical_section',cohortSet,atomicSectionCount,cohorts:cohortSets[cohortSet],weekly,coords:[first,last],_world:world.subarray(worldStart,worldStart+length),_pointCount:length/2,_bbox:bbox};
    const pending=checkpoint();if(pending)await pending;
  }
  if(signal?.aborted)throw aborted();
  return{...metadata,cohortSets,sections:rows,edges:rows};
}
