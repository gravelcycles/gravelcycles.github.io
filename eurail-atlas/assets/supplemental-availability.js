import{selectedDays,colorFor,matchesGeometry,approximateAlignment}from'./atlas-core.js?v=b9b3fd287d8ce04b';
import{journeyDaily,groupSegmentRoutes,sourceTrainLabelKey}from'./train-services.js?v=b9b3fd287d8ce04b';
import{matchesFocus}from'./route-focus.js?v=b9b3fd287d8ce04b';
import{edgeInScope}from'./project-scope.js?v=b9b3fd287d8ce04b';

const FORMAT='rail-atlas-supplemental-availability-v1';
const aborted=()=>new DOMException('Additional route request cancelled','AbortError');
const vector=(values,dates)=>Array.isArray(values)&&values.length===dates.length&&values.every(value=>Number.isSafeInteger(value)&&value>=0);

export function validateSupplementalAvailability(value,dates){
  if(!value||value.format!==FORMAT||value.schemaVersion!==1||JSON.stringify(value.dates)!==JSON.stringify(dates)||value.sourceFrequencyContribution!==0||value.physicalFrequencyContribution!==0||value.passPolicyUnchanged!==true||!value.journeys||Array.isArray(value.journeys)||!Array.isArray(value.exclusionReviews))throw new Error('Unsupported supplemental route availability');
  const reviews=new Map();
  for(const rule of value.exclusionReviews){if(!rule||typeof rule.id!=='string'||reviews.has(rule.id)||rule.decision!=='withhold_supplemental_whole_ride'||!Array.isArray(rule.dates)||rule.dates.some(day=>typeof day!=='string'))throw new Error('Invalid supplemental exclusion review');reviews.set(rule.id,rule);}
  for(const[id,row]of Object.entries(value.journeys)){
    if(!id||typeof row.source!=='string'||typeof row.snapshot!=='string'||row.sourceFrequencyContribution!==0||row.physicalFrequencyContribution!==0||row.passPolicyUnchanged!==true||row.agencyPrimaryChanged!==false||!Array.isArray(row.buckets))throw new Error('Invalid supplemental native binding');
    for(const bucket of row.buckets){
      if(typeof bucket.label!=='string'||!vector(bucket.nativeDaily,dates)||!vector(bucket.fallbackDaily,dates)||!vector(bucket.withheldDaily,dates)||bucket.withheldDaily.some((n,i)=>n!==0&&n!==bucket.nativeDaily[i])||bucket.fallbackDaily.some((n,i)=>n>bucket.nativeDaily[i]-bucket.withheldDaily[i])||!Array.isArray(bucket.withheldByReviewIds)||!Array.isArray(bucket.primaryWholeRidePeers))throw new Error('Invalid supplemental label scope');
      const applied=bucket.withheldByReviewIds.map(id=>reviews.get(id));
      if(applied.some(rule=>!rule||rule.journeyId!==id||rule.source!==row.source||rule.snapshot!==row.snapshot||rule.journeySha256!==row.journeySha256||rule.label!==bucket.label||rule.labelKind!==bucket.kind)||bucket.withheldDaily.some((n,i)=>n>0&&!applied.some(rule=>rule.dates.includes(dates[i]))))throw new Error('Supplemental exclusion exceeds its native/date/label review');
      for(const peer of bucket.primaryWholeRidePeers){
        if(typeof peer.journeyId!=='string'||typeof peer.source!=='string'||typeof peer.snapshot!=='string'||!vector(peer.coverageDaily,dates)||peer.coverageDaily.some((n,i)=>n!==0&&n!==bucket.nativeDaily[i])||!Array.isArray(peer.callRange)||peer.callRange.length!==2||!peer.callRange.every(n=>Number.isSafeInteger(n)&&n>=0)||peer.callRange[0]>=peer.callRange[1]||!Array.isArray(peer.sourceServiceDatesByDate)||peer.sourceServiceDatesByDate.length!==dates.length||peer.sourceServiceDatesByDate.some(rows=>!Array.isArray(rows)||rows.some(date=>!dates.includes(date))||new Set(rows).size!==rows.length))throw new Error('Invalid preferred whole-ride witness');
      }
    }
  }
  return value;
}

// Shared immutable transport, independently cancellable readers. Only the last
// departing reader aborts the underlying worker request.
export function createSupplementalAvailabilityLoader({getDescriptor,getDates,load}){
  let key=null,document=null,pending=null;
  function loadFor({signal}={}){
    if(signal?.aborted)return Promise.reject(aborted());
    const next=getDescriptor();
    if(next!==key){pending?.controller.abort();key=next;document=null;pending=null;}
    if(!key)return Promise.resolve(null);
    if(document)return Promise.resolve(document);
    if(!pending||pending.controller.signal.aborted){
      const request={controller:new AbortController(),readers:new Set(),promise:null};
      pending=request;const descriptor=key;
      request.promise=Promise.resolve().then(()=>load(descriptor,{signal:request.controller.signal})).then(value=>{
        const result=validateSupplementalAvailability(value,getDates());
        if(key===descriptor&&pending===request)document=result;
        return result;
      }).finally(()=>{if(pending===request)pending=null;});
    }
    const request=pending;
    return new Promise((resolve,reject)=>{
      const reader={};request.readers.add(reader);let done=false;
      const finish=(callback,value)=>{if(done)return;done=true;signal?.removeEventListener('abort',cancel);request.readers.delete(reader);callback(value);};
      const cancel=()=>{finish(reject,aborted());if(!request.readers.size&&pending===request)request.controller.abort();};
      signal?.addEventListener('abort',cancel,{once:true});
      request.promise.then(value=>finish(resolve,value),error=>finish(reject,error));
      if(signal?.aborted)cancel();
    });
  }
  return{load:loadFor,reset(){pending?.controller.abort();pending=null;document=null;key=null;}};
}

export function supplementalJourneys(journeys,state,dates,document){
  if(!document)return[];
  validateSupplementalAvailability(document,dates);
  const rows=journeys||[],byId=new Map(rows.map(row=>[row.id,row])),days=new Set(selectedDays(state.day,dates)),scopedState={...state,alternatives:true},result=[];
  for(const original of rows){
    const annotation=document.journeys[original.id];
    if(!annotation||annotation.source!==original.source||annotation.snapshot!==original.snapshot)continue;
    if(journeyDaily(original,state,dates).some((n,i)=>days.has(i)&&n>0))continue;
    const scoped=journeyDaily(original,scopedState,dates),sum=dates.map((_,i)=>annotation.buckets.reduce((n,b)=>n+b.nativeDaily[i],0));
    if(sum.some((n,i)=>n!==Number(original.daily?.[i]||0)))throw new Error('Supplemental native date totals differ');
    const buckets=[];
    for(const bucket of annotation.buckets){
      const daily=bucket.nativeDaily.map((n,i)=>{
        if(!n||bucket.withheldDaily[i]||!scoped[i]||scoped[i]<Number(original.daily?.[i]||0))return 0;
        const covered=bucket.primaryWholeRidePeers.some(witness=>{
          if(witness.coverageDaily[i]!==n)return false;
          const peer=byId.get(witness.journeyId);if(!peer||peer.source!==witness.source||peer.snapshot!==witness.snapshot)return false;
          const span=witness.callRange,context={...peer,_contextSpan:span,_contextSpansByDate:undefined,_match:{from:span[0],to:span[1]}},available=journeyDaily(context,state,dates),required=witness.sourceServiceDatesByDate[i];
          return required.length>0&&required.every(day=>{const index=dates.indexOf(day);return days.has(index)&&available[index]>0;});
        });
        return covered?0:n;
      });
      if(daily.some(Boolean))buckets.push({...bucket,daily});
    }
    const daily=dates.map((_,i)=>buckets.reduce((n,b)=>n+b.daily[i],0));
    if(!daily.some((n,i)=>days.has(i)&&n>0))continue;
    const labelDaily={};for(const bucket of buckets){const key=sourceTrainLabelKey(bucket.label);if(labelDaily[key])throw new Error('Ambiguous supplemental label buckets');labelDaily[key]=bucket.daily;}
    const copy={...original,daily,weekly:daily.reduce((a,b)=>a+b,0),
      publicTrains:buckets.filter(bucket=>bucket.label).map(bucket=>({label:bucket.label,kind:bucket.kind,daily:bucket.daily,weekly:bucket.daily.reduce((a,b)=>a+b,0)})),
      _supplementalLabelDaily:labelDaily,_supplementalAvailability:true};
    for(const[field,value]of Object.entries(original))if(field.endsWith('Daily')&&Array.isArray(value)){
      copy[field]=value.map((n,i)=>n===original.daily[i]?daily[i]:0);
      const weekly=field.slice(0,-5)+'Weekly';if(weekly in original)copy[weekly]=copy[field].reduce((a,b)=>a+b,0);
    }
    result.push(copy);
  }
  return result;
}

export function supplementalRouteGroups(journeys,edge,state,dates,document){
  const rows=supplementalJourneys(journeys,state,dates,document);
  return groupSegmentRoutes(rows,edge,{...state,alternatives:true},dates).map(group=>({...group,
    key:'supplemental:'+group.key,supplementalAvailability:true,
    sourceFrequencyContribution:0,physicalFrequencyContribution:0}));
}

// Explicit selection paints only retained native alignments. It is a highlight
// layer, never an extra network edge, frequency, picking target or movement.
// The complete native ride's own dated policy controls this layer; aggregate
// edge totals cannot certify its train labels or pass eligibility.
export function supplementalFocusItems(edges,group,state,dates,focusIds,zoom=8){
  if(!group?.supplementalAvailability||!focusIds?.size||state.mode==='traffic')return[];
  const days=selectedDays(state.day,dates),scoped={...state,alternatives:true},daily=dates.map((_,i)=>(group.journeys||[]).reduce((sum,j)=>sum+journeyDaily(j,scoped,dates)[i],0)),count=days.reduce((sum,i)=>sum+daily[i],0);
  if(!count)return[];
  const selected=(edges||[]).filter(edge=>edge.source===group.source&&matchesFocus(edge,focusIds)&&edgeInScope(edge,state)&&matchesGeometry(edge,state)&&edge._world?.length>=4),items=[],width=3.2+Math.max(0,Math.min(7,Math.floor(zoom)-11))*2.2/7;
  for(const[color,extra]of[['#fbfaf6',4],['#173f3b',2],[colorFor(count/Math.max(1,days.length)),0]])for(const edge of selected)items.push({world:edge._world,color,width:width+extra,dash:approximateAlignment(edge)});
  return items;
}
