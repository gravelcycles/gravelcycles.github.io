// Exact immutable native call occurrences, never public train numbers or rails.
export const COMMON_OD_DEDUPLICATION=Object.freeze({schemaVersion:1,kind:'dated_native_leg_witness_set_intersection_v1'});
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const bounds=value=>Array.isArray(value)&&value.length===2&&value.every(n=>Number.isSafeInteger(n)&&n>=0)&&value[0]<=value[1];
const dateAfter=(origin,offset)=>{if(typeof origin!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(origin))return null;const value=new Date(origin+'T12:00:00Z');if(!Number.isFinite(value.getTime())||value.toISOString().slice(0,10)!==origin)return null;value.setUTCDate(value.getUTCDate()+offset);const date=value.toISOString().slice(0,10);return/^\d{4}-\d{2}-\d{2}$/.test(date)?date:null;};

export function nativeQueryWitnesses(journey,span,origin,day){
  if(journey?.availabilityOnly!==true||!bounds(span)||span[1]>=(journey.stops?.length||0)||!Number.isSafeInteger(day)||day<0)return[];
  const station=span[0]===span[1],positions=station?[span[0]]:Array.from({length:span[1]-span[0]},(_,i)=>span[0]+i),result=positions.map(()=>new Set());
  for(const proof of Array.isArray(journey.coveredFragments)?journey.coveredFragments:[]){
    const full=proof?.fullCallRange,native=proof?.fragmentCallRange,offset=proof?.serviceDayOffset??0,daily=proof?.daily;
    if(proof?.verifiedSameRun!==true||!['source','journeyId','runId'].every(key=>typeof proof[key]==='string'&&proof[key])||!sha(proof.snapshot)||!sha(proof.evidenceSha256)||!Number.isSafeInteger(offset)||Math.abs(offset)>366||!Array.isArray(daily)||!daily.every(n=>Number.isSafeInteger(n)&&(n===0||n===1))||daily[day]!==1||!bounds(full)||!bounds(native)||full[1]>=journey.stops.length||full[1]-full[0]!==native[1]-native[0])continue;
    const date=dateAfter(origin,offset);if(!date)continue;
    positions.forEach((at,index)=>{if(full[0]<=at&&at+(station?0:1)<=full[1])result[index].add(JSON.stringify([station?'call':'leg',proof.source,proof.snapshot,proof.journeyId,proof.runId,date,native[0]+(at-full[0])]));});
  }
  return result.length&&result.every(values=>values.size)?result:[];
}
export const sameNativeQuery=(left,right)=>!!left.length&&left.length===right.length&&left.every((values,index)=>[...values].some(value=>right[index].has(value)));

// A query-local equivalence union. Every dated contribution must already have
// passed the caller's source, pass, fee, accommodation and actual OD filters.
export function logicalCommonOdDeductions(journeys,{dates,dailyFor,selectedDayIndices,spanFor}){
  const selected=new Set(selectedDayIndices||dates.map((_,i)=>i)),items=[],owners=new Map(),links=[];
  journeys.forEach((journey,row)=>{
    if(journey.availabilityOnly!==true)return;
    const daily=dailyFor(journey);if(!Array.isArray(daily)||daily.length!==dates.length)return;
    dates.forEach((date,day)=>{
      if(!selected.has(day)||daily[day]!==1||journey.daily?.[day]!==1)return;
      const witnesses=nativeQueryWitnesses(journey,spanFor(journey,day),date,day);if(!witnesses.length)return;
      const index=items.length,other=new Set();items.push({row,day,witnesses,root:index});
      for(const key of witnesses[0]){for(const prior of owners.get(key)||[])other.add(prior);if(!owners.has(key))owners.set(key,[]);owners.get(key).push(index);}
      for(const prior of other)if(sameNativeQuery(witnesses,items[prior].witnesses))links.push([index,prior]);
    });
  });
  const find=index=>{while(items[index].root!==index){items[index].root=items[items[index].root].root;index=items[index].root;}return index;};
  for(const[a,b]of links){const x=find(a),y=find(b);if(x!==y)items[x].root=y;}
  const groups=new Map();items.forEach((item,index)=>{const root=find(index);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(item);});
  const deductions=new Map();
  for(const group of groups.values()){
    if(group.length<2)continue;
    group.sort((a,b)=>a.row-b.row||a.day-b.day);
    for(const item of group.slice(1)){
      if(!deductions.has(item.row))deductions.set(item.row,{daily:dates.map(()=>0),journeyIds:new Set()});
      const entry=deductions.get(item.row);entry.daily[item.day]=1;for(const member of group)if(member!==item)entry.journeyIds.add(journeys[member.row].id);
    }
  }
  return deductions;
}
