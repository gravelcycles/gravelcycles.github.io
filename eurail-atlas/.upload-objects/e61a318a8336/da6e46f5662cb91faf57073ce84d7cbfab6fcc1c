import{validBusDocument}from'./bus-core.js?v=2c9bcc6123743fe4';

// Trips that two feeds of one published cohort both carry are shown once. The
// list is a display derivative of the immutable cohort, built by
// scripts/build_bus_duplicates.py: patterns with nothing left (`removed`) and
// patterns that keep some trips (`patterns`: adjusted daily counts and the
// trips to hide per date). No timetable, call or clock is changed.
const invalid=()=>{throw new Error('Invalid bus duplicate list');};

export function busDuplicateIndex(document){
  const dates=document.dates,sourceIds=document.sourceIds,patterns=document.patterns,removed=document.removed,days=dates?.length;
  if(!Array.isArray(dates)||!days||days>31||!Array.isArray(sourceIds)||!patterns||typeof patterns!=='object'||Array.isArray(patterns)||!removed||typeof removed!=='object'||Array.isArray(removed))invalid();
  const sources=row=>{if(!Array.isArray(row?.kept)||!row.kept.length||row.kept.some(k=>!Array.isArray(k)||!Number.isSafeInteger(k[0])||k[0]<0||k[0]>=sourceIds.length))invalid();return row.kept.map(k=>sourceIds[k[0]]);};
  const target=row=>typeof row.to==='string'&&row.to.length<=160&&!/[\s\u0000-\u001f]/.test(row.to)?row.to:'';
  const adjustedRoutes=new WeakMap(),adjustedDetails=new WeakMap();
  const entry=id=>Object.hasOwn(patterns,id)?patterns[id]:null;
  const counts=row=>{if(!Array.isArray(row.dates)||row.dates.length!==days||row.dates.some(v=>!Number.isSafeInteger(v)||v<0))invalid();return row.dates;};
  return{
    size:Object.keys(patterns).length+Object.keys(removed).length,
    // A pattern whose every trip is shown by another source: where its copy is.
    removed(id){if(!Object.hasOwn(removed,id))return null;const row=removed[id];return{to:target(row),sources:sources(row)};},
    // A search or map row: null when nothing is left, otherwise its remaining daily counts.
    route(row){
      if(!row||typeof row.id!=='string')return row;
      if(Object.hasOwn(removed,row.id))return null;
      const found=entry(row.id);if(!found)return row;
      let value=adjustedRoutes.get(row);if(!value){value={...row,dates:[...counts(found)]};adjustedRoutes.set(row,value);}
      return value;
    },
    // A pattern detail without the trips and dates another source shows.
    detail(detail){
      if(!detail||typeof detail.id!=='string')return detail;
      const gone=this.removed(detail.id);
      if(gone)return{...detail,duplicates:{removed:true,...gone}};
      const found=entry(detail.id);if(!found)return detail;
      let value=adjustedDetails.get(detail);if(value)return value;
      if(!Array.isArray(found.trips))invalid();
      const masks=new Map(),hidden=new Array(days).fill(0),limit=2**days;
      for(const group of found.trips){
        if(!Array.isArray(group)||!Number.isSafeInteger(group[0])||group[0]<1||group[0]>=limit||!Array.isArray(group[1]))invalid();
        for(const index of group[1]){if(!Number.isSafeInteger(index)||index<0)invalid();masks.set(index,(masks.get(index)||0)|group[0]);}
      }
      const trips=[];
      (detail.trips||[]).forEach((trip,index)=>{
        const mask=masks.get(index);if(!mask){trips.push(trip);return;}
        const serviceDates=(trip.serviceDates||[]).filter(date=>{const day=dates.indexOf(date),hide=day>=0&&(mask&(1<<day))!==0;if(hide)hidden[day]++;return!hide;});
        if(serviceDates.length)trips.push({...trip,serviceDates});
      });
      value={...detail,dates:[...counts(found)],trips,duplicates:{removed:false,to:target(found),sources:sources(found),hiddenDates:hidden}};
      adjustedDetails.set(detail,value);return value;
    },
  };
}

export class BusDuplicates{
  constructor(requests,configuration){this.requests=requests;this.configuration=configuration;this.index=null;this.retryAt=0;}
  clear(){this.index=null;this.retryAt=0;}
  // The index for this exact cohort, or null: an absent, unreachable or foreign
  // list leaves every record as published and is tried again later.
  async ready(manifestSha,reader){
    const c=this.configuration;
    if(!c?.duplicates||manifestSha!==c.busManifestSha256)return null;
    if(this.index)return this.index;
    if(Date.now()<this.retryAt)return null;
    try{
      const value=validBusDocument(await this.requests.load(c.duplicates,{reader,limit:3*1024*1024}),'bus_atlas_duplicates');
      if(value.busManifestSha256!==manifestSha)throw new Error('Bus duplicate list cohort mismatch');
      this.index=busDuplicateIndex(value);
    }catch(error){if(error.name==='AbortError')throw error;this.retryAt=Date.now()+30000;return null;}
    return this.index;
  }
}
