import{effectivePass,selectedDays,journeyMatchesEdge,publicTrainLabels,normalizeCharge,serviceVisible,usesHubConnections}from'./atlas-core.js?v=7dc9e8c1b12684fe';
import{mergeSleepServices}from'./sleep-service.js?v=7dc9e8c1b12684fe';

export const callId=call=>Array.isArray(call)?call[0]:call.id;
export const journeyIdentity=journey=>JSON.stringify([journey.source,journey.snapshot,journey.id,journey.agencyPrimary!==false]);
// A public number identifies a run, not a route. Preserve source, provider,
// direction, repeated calls and every intermediate station in route identity.
export const routeIdentity=journey=>JSON.stringify([journey.source,journey.snapshot,(journey.operator||'').trim()||['unknown-provider',journey.id],journey.agencyPrimary!==false,journey.serviceMode||'rail',(journey.stops||[]).map(callId)]);

function chargeMatches(journey,charge,match='any'){
  let reservation=journey.reservation,supplement=journey.supplement;
  const rules=new Set(journey.reviewedRuleIds||[]),countries=new Set(journey.countries||[]);
  if(rules.has('eurostar-ns-known-core-corridors-2026-11'))reservation='required';
  if(rules.has('db-ice-international-2026-11')&&countries.has('France')){reservation='required';supplement='passholder_fare_required';}
  if(rules.has('oebb-railjet-non-italy-international-2026-11')&&countries.has('Hungary'))reservation='required';
  charge=normalizeCharge(charge);if(charge==='all')return true;if(charge==='none')return false;
  const noReservation=['none','optional','not_required'].includes(reservation),noSupplement=['none','not_required','no_listed_additional_train_supplement'].includes(supplement),requiredSupplement=['required','passholder_fare_required'].includes(supplement);
  const flags={reservation:reservation==='required',supplement:requiredSupplement,free:noReservation&&noSupplement,chargeUnknown:!noReservation&&reservation!=='required'||!noSupplement&&!requiredSupplement};
  return charge.split(',')[match==='all'?'every':'some'](kind=>flags[kind]);
}
export function journeyDaily(journey,state,dates){
  if(!serviceVisible(journey,state))return dates.map(()=>0);
  if(state.sources&&!state.sources.has(journey.source))return dates.map(()=>0);
  if(journey.agencyPrimary===false&&!state.alternatives&&!state.altSourceIds?.has(journey.source))return dates.map(()=>0);
  const pass=effectivePass(state),charge=state.mode==='eurail'?state.charge:'all';
  if(pass&&!chargeMatches(journey,charge,state.chargeMatch))return dates.map(()=>0);
  return dates.map((_,i)=>{
    if(!pass)return Number(journey.daily?.[i])||0;
    const supported=(Number(journey.eurailDaily?.[i])||0)+(Number(journey.reviewedEurailDaily?.[i])||0),included=state.mode==='eurail'&&state.included===false?0:supported;
    const uncertain=state.review&&(!charge||charge==='all')&&['unknown','conditional','conflicting_reference'].includes(journey.inclusion)?Math.max(0,(Number(journey.daily?.[i])||0)-supported):0;
    return included+uncertain;
  });
}
export function groupSegmentRoutes(journeys,edge,state,dates){
  const directions=(edge._directionEdges||[edge]).map(direction=>usesHubConnections(state)?{...direction,isHub:true}:direction),days=selectedDays(state.day,dates),seen=new Set(),groups=new Map();
  const stationIds=edge._stationIds?new Set(edge._stationIds):null;
  for(const journey of journeys||[]){
    const identity=journeyIdentity(journey);if(seen.has(identity)||(stationIds?!(journey.stops||[]).some(call=>stationIds.has(callId(call))):!directions.some(direction=>journeyMatchesEdge(journey,direction))))continue;seen.add(identity);
    const daily=journeyDaily(journey,state,dates),count=days.reduce((sum,i)=>sum+daily[i],0);if(!count)continue;
    const key=routeIdentity(journey);
    if(!groups.has(key))groups.set(key,{key,source:journey.source,operator:journey.operator||'Recorded operator',serviceMode:journey.serviceMode||'rail',stops:journey.stops,daily:dates.map(()=>0),count:0,journeys:[],labels:[],sleepServices:[],edgeIds:new Set()});
    const group=groups.get(key);group.count+=count;group.journeys.push(journey);daily.forEach((n,i)=>group.daily[i]+=n);
    for(const id of journey.edgeIds||[])if(id)group.edgeIds.add(id);
    group.labels.push(...publicTrainLabels(journey.publicTrains,{day:state.day,dates,limit:Infinity}));
    group.sleepServices=mergeSleepServices(group.sleepServices,journey.sleepServices);
  }
  return[...groups.values()].map(group=>({...group,labels:publicTrainLabels(group.labels,{day:state.day,dates,limit:Infinity}).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}))})).sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key));
}
export function groupStationRoutes(journeys,stationIds,state,dates){return groupSegmentRoutes(journeys,{_stationIds:[...stationIds],_directionEdges:[]},state,dates);}

export function formatClock(seconds){
  if(!Number.isSafeInteger(seconds)||seconds<0)return'—';
  const days=Math.floor(seconds/86400),hour=Math.floor(seconds/3600)%24,minute=Math.floor(seconds/60)%60;
  return String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')+(days?' +'+days:'');
}
export function serviceDates(daily,state,dates){return selectedDays(state.day,dates).filter(i=>Number(daily?.[i])>0).map(i=>dates[i]);}

export async function routeMapPairs(group){
  const first=group.journeys[0],stops=group.stops.map(callId),values=[];
  for(let i=1;i<stops.length;i++)if(stops[i-1]!==stops[i]){
    const pair=[stops[i-1],stops[i]].sort();
    if(group.serviceMode==='temporary_replacement_bus'){
      values.push(['mode-map-pair',first.source,first.snapshot,group.serviceMode,...pair],['temporary-replacement-map-pair',first.source,first.snapshot,...pair,group.serviceMode]);
    }else values.push(['map-pair',first.source,...pair,first.agencyPrimary!==false]);
  }
  return new Set(await Promise.all(values.map(async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,18))));
}

// Timetable pages refer to exact journey identities. A date belongs to the
// source service day, including 24:xx/25:xx calls; never modulo it for joins.
export function routeRuns(group,pages,state,dates){
  const result=[],seen=new Set();
  for(const journey of group.journeys){
    const daily=journeyDaily(journey,state,dates),entry=pages.get(journey.id);
    if(!entry||entry.source!==journey.source||entry.snapshot!==journey.snapshot)continue;
    for(const run of entry.runs||[]){
      const active=serviceDates(run.daily,state,dates).filter(date=>daily[dates.indexOf(date)]>0);if(!active.length)continue;
      if(!Array.isArray(run.callTimes)||run.callTimes.length!==journey.stops.length)continue;
      const key=JSON.stringify([journeyIdentity(journey),run.id]);if(seen.has(key))continue;seen.add(key);
      result.push({...run,journey,dates:active});
    }
  }
  return result.sort((a,b)=>(a.callTimes[0]?.[1]??a.callTimes[0]?.[0]??Infinity)-(b.callTimes[0]?.[1]??b.callTimes[0]?.[0]??Infinity)||String(a.label||'').localeCompare(String(b.label||''),undefined,{numeric:true}));
}
