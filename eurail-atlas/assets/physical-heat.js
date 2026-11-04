/* Physical sections retain contribution cohorts, never a fabricated source or
 * passenger endpoint. These are estimated scheduled source traversals. */
import{worldPoint}from'./atlas-core.js?v=e1213d59e9553b08';
export const PHYSICAL_HEAT_FORMAT='rail-atlas-physical-heat-v1';
export const isPhysicalSection=row=>row?.kind==='physical_section';

function vector(value){
  return Array.isArray(value)&&value.length===7&&value.every(n=>Number.isSafeInteger(n)&&n>=0);
}
function validateCohorts(cohorts){
  if(!Array.isArray(cohorts))throw new Error('Invalid physical rail contribution set');
  for(const c of cohorts){
    if(typeof c.source!=='string'||!c.source||!['included','conditional','excluded','not_included','unknown','discount','conflicting_reference'].includes(c.inclusion)||c.serviceMode&&!['train','rail'].includes(c.serviceMode)||c.reviewedIncluded!==undefined&&typeof c.reviewedIncluded!=='boolean'||c.conditionalEligible!==undefined&&typeof c.conditionalEligible!=='boolean'||!vector(c.daily)||!vector(c.forwardDaily)||!vector(c.reverseDaily)||c.daily.some((n,i)=>n!==c.forwardDaily[i]+c.reverseDaily[i]))throw new Error('Invalid physical rail contribution dates or directions');
    if(c.observedDateMask!==undefined&&(!Array.isArray(c.observedDateMask)||c.observedDateMask.length!==7||c.observedDateMask.some((known,i)=>typeof known!=='boolean'||!known&&c.daily[i]!==0)))throw new Error('Invalid physical rail observed-date mask');
  }
}
export function decodePhysicalHeat(document){
  const packed=document?.sectionEncoding!==undefined;
  if(document?.format!==PHYSICAL_HEAT_FORMAT||document.schemaVersion!==1||!Array.isArray(document.dates)||document.dates.length!==7||new Set(document.dates).size!==7||document.dates.some(date=>typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))||(!packed&&!Array.isArray(document.sections))||document.cohortSets!==undefined&&!Array.isArray(document.cohortSets))throw new Error('Unsupported physical rail traffic product');
  const seen=new Set(),weights=new WeakMap(),validated=new WeakSet();let cohortSets=document.cohortSets;
  if(document.cohortProfiles!==undefined){
    if(!Array.isArray(document.cohortProfiles)||!Array.isArray(cohortSets))throw new Error('Invalid physical rail contribution profile dictionary');
    validateCohorts(document.cohortProfiles);
    cohortSets=cohortSets.map(references=>{
      if(!Array.isArray(references)||references.some(index=>!Number.isInteger(index)||index<0||index>=document.cohortProfiles.length))throw new Error('Invalid physical rail contribution profile reference');
      // Reuse the exact profile objects across sets; additive references retain
      // their multiplicity, and every profile was validated only once above.
      const cohorts=references.map(index=>document.cohortProfiles[index]);validated.add(cohorts);return cohorts;
    });
  }
  const weight=cohorts=>{if(!weights.has(cohorts)){if(!validated.has(cohorts)){validateCohorts(cohorts);validated.add(cohorts);}weights.set(cohorts,cohorts.reduce((n,c)=>n+c.daily.reduce((a,b)=>a+b,0),0));}return weights.get(cohorts);};
  for(const cohorts of cohortSets||[])weight(cohorts);
  const reference=index=>Number.isInteger(index)&&index>=0?cohortSets?.[index]:null;
  let sections;
  if(packed){
    const{sectionEncoding,coordinateScale,sectionIds,cohortSetIds,geometryOffsets,coordinateDeltas,atomicSectionCounts}=document;
    const invalid=()=>{throw new Error('Invalid compact physical rail section geometry');};
    if(sectionEncoding!=='delta-microdegrees-v1'||coordinateScale!==1000000||document.sections!==undefined||!Array.isArray(sectionIds)||!Array.isArray(cohortSetIds)||cohortSetIds.length!==sectionIds.length||!Array.isArray(atomicSectionCounts)||atomicSectionCounts.length!==sectionIds.length||!Array.isArray(geometryOffsets)||geometryOffsets.length!==sectionIds.length+1||geometryOffsets[0]!==0||!Array.isArray(coordinateDeltas)||coordinateDeltas.length%2||geometryOffsets.at(-1)*2!==coordinateDeltas.length)invalid();
    // Decode directly into the single transferable world buffer. The original
    // microdegree coordinates are lossless; nested per-point arrays never exist.
    const projected=new Float64Array(coordinateDeltas.length);
    sections=sectionIds.map((id,index)=>{
      const start=geometryOffsets[index],end=geometryOffsets[index+1],cohorts=reference(cohortSetIds[index]),atomicSectionCount=atomicSectionCounts[index];
      if(typeof id!=='string'||!id||seen.has(id)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end-start<2||end*2>coordinateDeltas.length||!Array.isArray(cohorts)||!Number.isSafeInteger(atomicSectionCount)||atomicSectionCount<1)invalid();
      let lonInt=0,latInt=0,first,last,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(let point=start;point<end;point++){
        const dx=coordinateDeltas[point*2],dy=coordinateDeltas[point*2+1];if(!Number.isSafeInteger(dx)||!Number.isSafeInteger(dy))invalid();
        lonInt=point===start?dx:lonInt+dx;latInt=point===start?dy:latInt+dy;
        if(!Number.isSafeInteger(lonInt)||!Number.isSafeInteger(latInt)||Math.abs(lonInt)>180000000||Math.abs(latInt)>85000000||lonInt===0&&latInt===0)invalid();
        const lon=lonInt/coordinateScale,lat=latInt/coordinateScale,[x,y]=worldPoint(lon,lat);
        projected[point*2]=x;projected[point*2+1]=y;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        if(point===start)first=[lon,lat];if(point===end-1)last=[lon,lat];
      }
      seen.add(id);return{id,kind:'physical_section',geometryStatus:'inferred_physical_section',cohortSet:cohortSetIds[index],atomicSectionCount,cohorts,weekly:weight(cohorts),coords:[first,last],_world:projected.subarray(start*2,end*2),_pointCount:end-start,_bbox:[minX,minY,maxX,maxY]};
    });
  }else sections=document.sections.map(section=>{
    if(!isPhysicalSection(section)||typeof section.id!=='string'||!section.id||seen.has(section.id))throw new Error('Invalid physical rail section identity');
    const cohorts=section.cohorts??reference(section.cohortSet);
    if(!Array.isArray(cohorts))throw new Error('Invalid physical rail section contribution reference');
    if(!Array.isArray(section.coords)||section.coords.length<2||section.coords.some(p=>!Array.isArray(p)||p.length!==2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>85||p[0]===0&&p[1]===0))throw new Error('Invalid physical rail section geometry');
    seen.add(section.id);
    return{...section,cohorts,geometryStatus:section.geometryStatus||'inferred_physical_section',weekly:weight(cohorts)};
  });
  // Drop the transport-only dictionary field and replace integer reference
  // arrays, so postMessage sends one shared resolved object graph, not both.
  const{cohortProfiles,sectionEncoding,coordinateScale,sectionIds,cohortSetIds,geometryOffsets,coordinateDeltas,atomicSectionCounts,...metadata}=document;
  return{...metadata,...(cohortSets!==undefined?{cohortSets}:{}),sections,edges:sections};
}

export function applyPhysicalSourceAvailability(document,sources){
  // Calendar absence is source metadata, not a numeric zero. Annotate each
  // shared contribution object once; never alter counts or extrapolate dates.
  const sourceById=new Map((sources||[]).map(source=>[source.id,source])),seen=new WeakSet();
  const annotate=cohorts=>{
    if(!Array.isArray(cohorts)||seen.has(cohorts))return;seen.add(cohorts);
    for(const cohort of cohorts){
      const source=sourceById.get(cohort.source),unavailable=new Set(source?.unavailableServiceDates||[]);
      if(cohort.observedDateMask===undefined&&document.dates.some(date=>unavailable.has(date))){
        const mask=document.dates.map(date=>!unavailable.has(date));
        if(mask.some((known,i)=>!known&&cohort.daily[i]!==0))throw new Error('Unavailable source date contains physical contributions');
        cohort.observedDateMask=mask;
      }
      if(cohort.observedDateMask?.some(known=>!known)&&typeof source?.scopeNote==='string')cohort._sourceScopeNote=source.scopeNote;
    }
  };
  for(const cohorts of document.cohortSets||[])annotate(cohorts);
  for(const section of document.edges||document.sections||[])if(section.cohortSet===undefined||!document.cohortSets)annotate(section.cohorts);
  return document;
}
export function cohortSelected(cohort,state,{conditional=false}={}){
  if(state.sources instanceof Set&&!state.sources.has(cohort.source))return false;
  if(cohort.primary===false&&!state.alternatives&&!state.altSourceIds?.has(cohort.source))return false;
  if(!state.pass)return !conditional;
  if(conditional)return cohort.reviewedIncluded!==true&&cohort.inclusion!=='included'&&(cohort.conditionalEligible===true||cohort.conditionalEligible===undefined&&(cohort.inclusion==='conditional'||cohort.inclusion==='unknown'));
  return cohort.inclusion==='included'||cohort.reviewedIncluded===true;
}
export function sectionDaily(section,state,{conditional=false,direction=null}={}){
  const result=Array(7).fill(0);
  if(state.trains===false)return result;
  const field=direction==='forward'?'forwardDaily':direction==='reverse'?'reverseDaily':'daily';
  for(const cohort of section.cohorts||[])if(cohortSelected(cohort,state,{conditional}))for(let i=0;i<7;i++)result[i]+=Number(cohort[field]?.[i])||0;
  return result;
}
export function sectionCount(section,state,indices,{conditional=false,direction=null}={}){
  if(state.trains===false)return 0;
  const field=direction==='forward'?'forwardDaily':direction==='reverse'?'reverseDaily':'daily';let count=0;
  for(const cohort of section.cohorts||[])if(cohortSelected(cohort,state,{conditional}))for(const i of indices)count+=Number(cohort[field]?.[i])||0;
  return count;
}
export function sectionSourceBreakdown(section,state,indices){
  const groups=new Map();
  if(state.trains===false)return[];
  for(const cohort of section.cohorts||[])if(cohortSelected(cohort,state)){
    const n=indices.reduce((sum,i)=>sum+(Number(cohort.daily[i])||0),0);if(!n)continue;
    const entry=groups.get(cohort.source)||{source:cohort.source,count:0,daily:Array(7).fill(0)};
    entry.count+=n;for(let i=0;i<7;i++)entry.daily[i]+=Number(cohort.daily[i])||0;groups.set(cohort.source,entry);
  }
  return[...groups.values()].sort((a,b)=>b.count-a.count||a.source.localeCompare(b.source));
}
export function sectionCohortBreakdown(section,state,indices){
  if(state.trains===false)return[];
  return(section.cohorts||[]).flatMap(cohort=>{
    const confirmed=cohortSelected(cohort,state),uncertain=!confirmed&&state.pass&&state.review&&cohortSelected(cohort,state,{conditional:true});if(!confirmed&&!uncertain)return[];
    const count=indices.reduce((sum,i)=>sum+cohort.daily[i],0);if(!count&&!indices.some(i=>cohort.observedDateMask?.[i]===false))return[];
    return[{...cohort,count,uncertain,forward:indices.reduce((sum,i)=>sum+cohort.forwardDaily[i],0),reverse:indices.reduce((sum,i)=>sum+cohort.reverseDaily[i],0)}];
  });
}
export function supportingConnectionMatches(edge,support,pairId=support.mapPairId){
  if(!edge||!support||edge.source!==support.source)return false;
  if(edge.id===support.edgeId||edge._directionEdges?.some(row=>row.id===support.edgeId))return true;
  if((edge.primary!==false)!==(support.primary!==false))return false;
  return!!(pairId!==undefined&&JSON.stringify(edge.mapPairId)===JSON.stringify(pairId)||support.a&&support.b&&(edge.a===support.a&&edge.b===support.b||edge.a===support.b&&edge.b===support.a));
}
export async function supportingMapPairId(support){
  if(support.mapPairId!==undefined)return support.mapPairId;
  if(!support.source||!support.a||!support.b)return null;
  const pair=[support.a,support.b].sort(),value=['map-pair',support.source,...pair,support.primary!==false];
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))));
  return[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,18);
}

export function sectionDateCoverage(section,state){
  const known=Array(7).fill(0),unknown=Array(7).fill(0);
  if(state.trains===false)return{known,unknown};
  for(const cohort of section.cohorts||[])if(cohortSelected(cohort,state)||state.pass&&state.review&&cohortSelected(cohort,state,{conditional:true}))for(let i=0;i<7;i++)(cohort.observedDateMask?.[i]===false?unknown:known)[i]++;
  return{known,unknown};
}
export function physicalDetailsPath(index,sectionId){
  if(!index)return null;
  const length=index.prefixLength??2,offset=index.prefixOffset??(sectionId.startsWith('rail-section-')?13:0);
  if(!Number.isInteger(length)||length<1||length>4||!Number.isInteger(offset)||offset<0||offset>128||typeof index.parts!=='object')throw new Error('Invalid physical rail detail index');
  const path=index.parts[sectionId.slice(offset,offset+length)];return typeof path==='string'&&path?path:null;
}
export function physicalSectionDetails(document,sectionId){
  if(document?.format!=='rail-atlas-physical-heat-details-v1'||!document.sections||typeof document.sections!=='object'||Array.isArray(document.sections))throw new Error('Invalid physical rail section details');
  const row=Object.hasOwn(document.sections,sectionId)?document.sections[sectionId]:null;
  if(row&&!Array.isArray(row.supportingLegs))throw new Error('Invalid physical rail supporting connections');
  return row?.supportingLegs||[];
}
