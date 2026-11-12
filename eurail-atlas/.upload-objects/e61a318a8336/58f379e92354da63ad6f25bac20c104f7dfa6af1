// Logical through availability is independent of source-frequency and physical
// traffic assets. This module never joins neighbouring services or public IDs.
import{logicalCommonOdDeductions}from'./logical-common-od.js?v=2c9bcc6123743fe4';
const callId=call=>Array.isArray(call)?call[0]:call?.id;
const validVector=(value,days,binary=false)=>Array.isArray(value)&&value.length===days&&value.every(n=>Number.isSafeInteger(n)&&n>=0&&(!binary||n<=1));
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

// Stable array identity lets renderer geometry caches survive unchanged frames.
export function stationWithContinuationSources(station,knownSources){
  const logical=new Set(station.logicalAvailabilitySources||[]);
  for(const identity of[station.id,...(station.memberIds||[])])for(const source of knownSources.get(identity)||[])logical.add(source);
  if(!logical.size)return station;
  return{...station,logicalAvailabilitySources:[...logical],sources:[...new Set([...(station.sources||[]),...(station.source?[station.source]:[]),...logical])]};
}

export function createContinuationEdgeMerger(){
  const cache=new WeakMap();
  return(base,logical)=>{if(!logical.length)return base;const previous=cache.get(base);if(previous?.logical===logical)return previous.edges;const edges=[...base,...logical];cache.set(base,{logical,edges});return edges;};
}

export function decodeContinuationGeometry(document,dates){
  if(document?.format!=='rail-atlas-through-continuation-geometry-v1'||document.schemaVersion!==1||JSON.stringify(document.dates)!==JSON.stringify(dates)||!Array.isArray(document.edges)||!Array.isArray(document.stations||[]))throw new Error('Unsupported logical through geometry');
  const seen=new Set();
  for(const edge of document.edges){
    if(!edge?.id||seen.has(edge.id)||typeof edge.source!=='string'||!edge.a||!edge.b||edge.availabilityOnly!==true||edge.throughConnection!==true||edge.physicalFrequencyContribution!==0||edge.addsSourceFrequency!==false||!validVector(edge.daily,dates.length)||!Array.isArray(edge.coords)||edge.coords.length<2)throw new Error('Invalid logical through geometry');
    seen.add(edge.id);
    for(const key of['eurailDaily','reviewedEurailDaily'])if(!validVector(edge[key]||dates.map(()=>0),dates.length))throw new Error('Invalid logical through policy vector');
  }
  return document;
}

export const continuationAvailabilityNote=row=>{
  const rows=Array.isArray(row)?row:[row],logical=rows.filter(item=>item?.availabilityOnly===true);
  if(!logical.length)return'';
  const reviews=logical.map(item=>item.callValidationReview||item.continuation?.callValidationReview).filter(Boolean);
  const clockReviews=logical.map(item=>item.clockValidationReview||item.continuation?.clockValidationReview).filter(Boolean);
  const warnings=[...new Set([...reviews,...clockReviews].map(review=>typeof review.publicWarning==='string'?review.publicWarning.trim():'').filter(Boolean))];
  return'Dated through-service observations supported by native timetable evidence. Coverage is partial; counts are a lower bound for the selected dates.'+(reviews.length?' Recorded source pattern; intermediate-call changes unresolved. Clocks describe the retained source plan.':'')+(warnings.length?' '+warnings.join(' '):'');
};

export function continuationFocusEdgeIds(journey){return[...new Set([...(journey?.edgeIds||[]),...(journey?.additionalFocusEdgeIds||[])].filter(id=>typeof id==='string'&&id))];}
export function callPermissionUnknown(journey,index,field){
  if(!['pickup','dropoff'].includes(field))return false;
  if(Array.isArray(journey?.continuation?.unverifiedCallPermissions))return journey.continuation.unverifiedCallPermissions.some(row=>Array.isArray(row)&&row[0]===index&&row[1]===field);
  if(journey?.continuation?.boardingPermissionsReviewed===true)return false;
  return(journey?.continuation?.unknownSourceCallPermissions||[]).some(row=>Array.isArray(row)&&row[0]===index&&row[1]===field);
}
export function callPermissionNote(journey,index,field){
  if(callPermissionUnknown(journey,index,field))return field==='pickup'?'Boarding permission unverified':'Alighting permission unverified';
  const call=journey?.stops?.[index],value=Array.isArray(call)?call[field==='pickup'?1:2]:call?.[field];
  return String(value)==='1'?(field==='pickup'?'No boarding':'No alighting'):'';
}

const within=(span,bounds)=>Array.isArray(span)&&span.length===2&&Array.isArray(bounds)&&bounds.length===2&&span.every(Number.isSafeInteger)&&bounds.every(Number.isSafeInteger)&&bounds[0]<=span[0]&&span[0]<=span[1]&&span[1]<=bounds[1];
// Only scheduled-service counters may participate in conservation or
// subtraction. City discovery vectors such as fastExampleDaily are Boolean
// presence metadata, even when their suffix resembles a count field.
const availabilityCountFields=['daily',...[
  'boardable','eurail','eurailBoardable','reviewedEurail','reviewedEurailBoardable',
  'conditional','conditionalBoardable','conditionalEurail','reviewedConditional',
  'reviewedConditionalBoardable','uncertain','unknown',
  ...['reservation','supplement','free','chargeUnknown',...[1,2,3,4,8,9,10].map(mask=>'chargeMask'+mask)]
    .flatMap(field=>[field,field+'Boardable'])
].map(field=>field+'Daily')];
// A pattern that rail-duplicates.js already reduced keeps its published row
// as ``_published``: its copies leave the movement and the pass counters by
// different amounts, so "this bucket holds all of the date's runs" is read
// from the published counters, never from the reduced ones.
const wholeBucket=(row,key,day,raw)=>{const published=row._published;return published&&validVector(published[key],raw.length)&&validVector(published.daily,raw.length)?published[key][day]!==0&&published[key][day]===published.daily[day]:row[key][day]===raw[day];};
export function scopeAvailabilityCounts(row,weights,raw=row.daily){
  const result={...row},days=raw?.length;
  if(!validVector(raw,days)||!validVector(weights,days))throw new Error('Invalid scoped service-count vectors');
  for(const key of availabilityCountFields){const value=row[key];if(validVector(value,days)){
    result[key]=value.map((n,i)=>wholeBucket(row,key,i,raw)?Math.max(0,n-weights[i]):n);
    const weekly=key==='daily'?'weekly':key.slice(0,-5)+'Weekly';if(weekly in row)result[weekly]=result[key].reduce((a,b)=>a+b,0);
  }}
  return result;
}
// Deduplication is scoped to this query and current filters. A full pattern with
// no exact source-run proof cannot suppress any original source availability.
// ``spanFor`` returns the exact queried call span, never a city-name match.
// ``leftOut(parent, runId, day)`` is true for a fragment run that the current
// view already leaves out as another feed's copy (rail-duplicates.js): the
// joined service must not take the same run out of its pattern a second time.
export function deduplicateContinuationAvailability(journeys,{dates,dailyFor,selectedDayIndices,spanFor=journey=>journey._match?[journey._match.from,journey._match.to]:null,leftOut=(parent,runId,day)=>!!((parent?._duplicateRunIds?.get(runId)?.[0]||0)>>day&1)}={}){
  if(!Array.isArray(journeys)||!Array.isArray(dates)||typeof dailyFor!=='function')throw new Error('Incomplete logical availability query');
  const selected=new Set(selectedDayIndices||dates.map((_,index)=>index));
  const parents=new Map(journeys.map(row=>[row.id,row])),deductions=new Map(),seen=new Set();
  for(const full of journeys){
    if(full.availabilityOnly!==true)continue;
    const active=dailyFor(full);
    if(!validVector(active,dates.length)||!active.some(Boolean))continue;
    for(const proof of full.coveredFragments||[]){
      const parent=parents.get(proof.journeyId);
      const offset=proof.serviceDayOffset??0;if(!Number.isSafeInteger(offset))continue;
      if(!parent||parent.availabilityOnly===true||proof.verifiedSameRun!==true||!sha(proof.evidenceSha256)||typeof proof.runId!=='string'||!proof.runId||proof.source!==parent.source||proof.snapshot!==parent.snapshot||!validVector(proof.daily,dates.length,true)||!validVector(parent.daily,dates.length))continue;
      // Policy-partition ambiguity must stay visible. The source pattern must
      // assign each relevant dated weight wholly or not at all to every bucket.
      const fields=availabilityCountFields.filter(key=>validVector(parent[key],dates.length));
      for(let day=0;day<dates.length;day++){
        const parentDate=new Date(Date.parse(dates[day]+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10),parentDay=dates.indexOf(parentDate);
        if(parentDay<0||!selected.has(day)||!selected.has(parentDay)||!active[day]||!proof.daily[day]||!dailyFor(parent)[parentDay])continue;
        if(!within(spanFor(full,day),proof.fullCallRange)||!within(spanFor(parent,parentDay),proof.fragmentCallRange))continue;
        const published=parent._published&&fields.every(key=>validVector(parent._published[key],dates.length))?parent._published:parent;
        if(fields.some(key=>published[key][parentDay]!==0&&published[key][parentDay]!==published.daily[parentDay]))continue;
        if(leftOut(parent,proof.runId,parentDay))continue;
        const key=JSON.stringify([parent.source,parent.snapshot,parent.id,proof.runId,parentDate]);if(seen.has(key))continue;seen.add(key);
        if(!deductions.has(parent.id))deductions.set(parent.id,{daily:dates.map(()=>0),labels:new Map(),runs:new Map()});
        const entry=deductions.get(parent.id);entry.daily[parentDay]++;
        if(!entry.runs.has(proof.runId))entry.runs.set(proof.runId,dates.map(()=>0));entry.runs.get(proof.runId)[parentDay]++;
        if(typeof proof.label==='string'&&proof.label){if(!entry.labels.has(proof.label))entry.labels.set(proof.label,dates.map(()=>0));entry.labels.get(proof.label)[parentDay]++;}
      }
    }
  }
  const trim=scopeAvailabilityCounts;
  const logicalDeductions=logicalCommonOdDeductions(journeys,{dates,dailyFor,selectedDayIndices,spanFor});
  return journeys.map((parent,index)=>{
    const logical=logicalDeductions.get(index);
    if(logical){
      const result=trim(parent,logical.daily,parent.daily);
      result._logicalAvailabilityAlternative={daily:logical.daily,journeyIds:[...logical.journeyIds].sort(),originalJourney:parent};
      return result;
    }
    const deductionsFor=deductions.get(parent.id);if(!deductionsFor)return parent;
    const result=trim(parent,deductionsFor.daily,parent.daily);
    const labels=list=>(list||[]).map(label=>{
      const weights=deductionsFor.labels.get(label.label);if(!weights)return label;
      const row=trim(label,weights,label.daily||dates.map(()=>0));
      row.sleepServices=(label.sleepServices||[]).map(sleep=>trim(sleep,weights,label.daily||dates.map(()=>0)));return row;
    });
    result.publicTrains=labels(parent.publicTrains);
    // The pass view of a reduced pattern (rail-duplicates.js) loses the same run.
    if(validVector(parent._passDaily,dates.length)){
      result._passDaily=parent._passDaily.map((n,i)=>Math.max(0,n-deductionsFor.daily[i]));
      if(parent._passJourney)result._passJourney={...parent._passJourney,daily:result._passDaily,publicTrains:labels(parent._passJourney.publicTrains)};
    }
    result.sleepServices=(parent.sleepServices||[]).map(row=>trim(row,deductionsFor.daily,parent.daily));
    result._logicalAvailabilityDeduplicated={daily:deductionsFor.daily,runs:[...deductionsFor.runs].map(([runId,daily])=>({runId,daily})),ordinarySourceRecordPreserved:true};
    return result;
  });
}

const chargeBits={reservation:1,supplement:2,free:4,chargeUnknown:8},chargeMasks=[1,2,3,4,8,9,10];
const noReservation=new Set(['none','optional','not_required']),noSupplement=new Set(['none','not_required','no_listed_additional_train_supplement']),requiredSupplement=new Set(['required','passholder_fare_required']);
export const continuationContextRequired=row=>row?.availabilityOnly===true&&(Array.isArray(row.sourceSupport)||Array.isArray(row.odPolicies));
export function continuationQuerySpan(row){
  const span=row?._contextSpan||(row?._match?[row._match.from,row._match.to]:null)||row?.policyScope;
  return span||[0,Math.max(0,(row?.stops?.length||row?.callCountries?.length||1)-1)];
}
function coversSelectedSupport(row,state,day,span){
  if(state.sources&&!state.sources.has(row.source))return false;
  if(!Array.isArray(row.sourceSupport))return true;
  // A station calling summary is not a ridden OD. Require the complete logical
  // service's source support there, rather than expose an unsupported tail.
  const bounds=span[0]===span[1]?[0,Math.max(0,(row.stops?.length||row.callCountries?.length||1)-1)]:span;
  if(bounds[0]>=bounds[1])return false;
  const intervals=row.sourceSupport.filter(s=>s.publiclyAdmitted===true&&(!state.sources||state.sources.has(s.source))&&s.daily?.[day]>0).map(s=>s.callRange).filter(r=>Array.isArray(r)&&r.length===2).sort((a,b)=>a[0]-b[0]||b[1]-a[1]);
  let cursor=bounds[0];for(const[start,end]of intervals){if(start>cursor)break;if(end>cursor)cursor=end;if(cursor>=bounds[1])return true;}return false;
}
function scopedPolicy(row,span,date,accommodation){
  if(!Array.isArray(row.odPolicies))return null;
  const[from,to]=span,countries=row.callCountries||[],first=countries[from],last=countries[to];
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<=from)return{inclusion:'unknown',reservation:'unknown',supplement:'unknown',reason:'ridden_od_required'};
  const matches=row.odPolicies.filter(rule=>{
    if(!rule.dates?.includes(date)||!within([from,from],rule.fromCallRange)||!within([to,to],rule.toCallRange)||!rule.accommodations?.includes(accommodation))return false;
    if(rule.originCountries&&!rule.originCountries.includes(first)||rule.destinationCountries&&!rule.destinationCountries.includes(last))return false;
    if(typeof rule.international==='boolean'&&(!first||!last||(first!==last)!==rule.international))return false;
    if(rule.domesticCountry&&(first!==rule.domesticCountry||last!==rule.domesticCountry))return false;
    return true;
  });
  if(!matches.length)return{inclusion:'unknown',reservation:'unknown',supplement:'unknown',reason:'od_or_accommodation_policy_unverified'};
  const priority=Math.max(...matches.map(rule=>rule.priority||0)),selected=matches.filter(rule=>(rule.priority||0)===priority),kinds=new Set(selected.map(rule=>JSON.stringify([rule.inclusion,rule.reservation,rule.supplement])));
  return kinds.size===1?{...selected[0],matchedPolicyIds:selected.map(rule=>rule.id)}:{inclusion:'conflicting_reference',reservation:'unknown',supplement:'unknown',reason:'conflicting_ridden_od_policy'};
}
function policyCharges(policy,row){
  const reservation=policy?.reservation||row.reservation,supplement=policy?.supplement||row.supplement;
  return{reservation:reservation==='required',supplement:requiredSupplement.has(supplement),free:noReservation.has(reservation)&&noSupplement.has(supplement),chargeUnknown:!noReservation.has(reservation)&&reservation!=='required'||!noSupplement.has(supplement)&&!requiredSupplement.has(supplement)};
}
function permittedRide(row,span){return span[0]<span[1]&&(!row.stops||(String(row.stops[span[0]]?.[1])!=='1'&&String(row.stops[span[1]]?.[2])!=='1'));}
function stationRide(row,state,day,date,index,accommodation){
  // Station summaries count a train once when at least one real boarding or
  // alighting ride qualifies. A zero-length station span is never a trip.
  const candidates=[],pass=state.pass||['eurail','italy'].includes(state.mode),charge=state.mode==='eurail'?state.charge||'all':'all';
  for(let other=0;other<(row.stops?.length||0);other++){
    if(other===index)continue;const span=other<index?[other,index]:[index,other];
    if(!permittedRide(row,span)||!coversSelectedSupport(row,state,day,span))continue;
    const policy=scopedPolicy(row,span,date,accommodation),status=policy?.inclusion||row.inclusion;
    const included=policy?status==='included':Number(row.eurailDaily?.[day])+Number(row.reviewedEurailDaily?.[day])>0;
    const flags=policyCharges(policy,row),fee=charge==='all'||charge!=='none'&&charge.split(',')[state.chargeMatch==='all'?'every':'some'](kind=>flags[kind]);
    const uncertain=['unknown','conditional','conflicting_reference'].includes(status);
    const visible=!pass||(included&&!(state.mode==='eurail'&&state.included===false)&&fee)||(uncertain&&state.review&&charge==='all');
    candidates.push({span,policy,rank:visible?0:included?1:uncertain?2:3});
  }
  return candidates.sort((a,b)=>a.rank-b.rank||(b.span[1]-b.span[0])-(a.span[1]-a.span[0]))[0];
}
export function continuationMetrics(row,state,dates,span=continuationQuerySpan(row)){
  if(!continuationContextRequired(row))return null;
  const zeros=()=>dates.map(()=>0),result={};
  for(const field of['daily','eurailDaily','reviewedEurailDaily','uncertainDaily','unknownDaily','conditionalDaily',...Object.keys(chargeBits).map(k=>k+'Daily'),...chargeMasks.map(k=>'chargeMask'+k+'Daily')])result[field]=zeros();
  result.policyByDate=[];result.riddenCallRangesByDate=[];result.accommodation=state.accommodation||row.defaultAccommodation||'ordinary_second_class_seat';result.riddenCallRange=span;
  for(let day=0;day<dates.length;day++){
    const raw=Number(row.daily?.[day])||0;if(!raw)continue;
    const selectedSpan=row._contextSpansByDate?.[day]||span;
    const station=selectedSpan[0]===selectedSpan[1]?stationRide(row,state,day,dates[day],selectedSpan[0],result.accommodation):null;
    const ride=station?.span||selectedSpan;
    if(!permittedRide(row,ride)||!coversSelectedSupport(row,state,day,ride))continue;
    result.daily[day]=raw;
    result.riddenCallRangesByDate[day]=ride;
    const policy=station?station.policy:scopedPolicy(row,ride,dates[day],result.accommodation);result.policyByDate[day]=policy;
    if(policy===null){
      result.eurailDaily[day]=Number(row.eurailDaily?.[day])||0;result.reviewedEurailDaily[day]=Number(row.reviewedEurailDaily?.[day])||0;
    }else if(policy.inclusion==='included')result.reviewedEurailDaily[day]=raw;
    const included=result.eurailDaily[day]+result.reviewedEurailDaily[day],status=policy?.inclusion||row.inclusion;
    if(['unknown','conditional','conflicting_reference'].includes(status)){
      result.uncertainDaily[day]=Math.max(0,raw-included);result[status==='conditional'?'conditionalDaily':'unknownDaily'][day]=result.uncertainDaily[day];
    }
    if(included){
      const flags=policyCharges(policy,row);
      let mask=0;for(const[kind,bit]of Object.entries(chargeBits))if(flags[kind]){result[kind+'Daily'][day]=included;mask|=bit;}
      if(chargeMasks.includes(mask))result['chargeMask'+mask+'Daily'][day]=included;
    }
  }
  for(const[field,value]of Object.entries({...result}))if(field.endsWith('Daily'))result[field.slice(0,-5)+'BoardableDaily']=value;
  return result;
}

export function continuationPolicyText(rows,state,dates){
  rows=Array.isArray(rows)?rows:[rows];const products=new Map();
  const selected=dates.map((date,index)=>[date,index]).filter(([date,index])=>/^day-\d$/.test(state.day)?index===Number(state.day.slice(4)):state.day==='weekdays'?[1,2,3,4,5].includes(new Date(date+'T12:00:00Z').getUTCDay()):state.day==='weekend'?[0,6].includes(new Date(date+'T12:00:00Z').getUTCDay()):true).map(([,index])=>index);
  for(const row of rows){const metrics=continuationMetrics(row,state,dates);if(!metrics)continue;for(const index of selected){const policy=metrics.policyByDate[index]||{inclusion:row.inclusion||'unknown',reservation:row.reservation||'unknown',supplement:row.supplement||'unknown'};if(!metrics.daily[index])continue;
    if(!products.has(metrics.accommodation))products.set(metrics.accommodation,new Set());
    products.get(metrics.accommodation).add(`${policy.inclusion==='included'?'Eurail included':policy.inclusion==='excluded'?'Eurail excluded':'Eurail eligibility unverified'}; reservation ${String(policy.reservation).replaceAll('_',' ')}; supplement ${String(policy.supplement).replaceAll('_',' ')}`);
  }}
  if(!products.size)return'';
  return[...products].map(([accommodation,decisions])=>`Policy for the selected journey and ${accommodation==='nightjet_accommodation_unselected'?'Nightjet accommodation not selected':accommodation.replaceAll('_',' ')}: ${[...decisions].join(' / ')}.${accommodation==='nightjet_accommodation_unselected'?' Choose accommodation with the operator to check price and availability.':''}`).join(' ');
}
