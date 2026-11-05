// Dated public labels are views over exact immutable native run identities.
let active=null,byJourney=new Map(),byRunDate=new Map(),metadataCache=new WeakMap();
const runDateKey=(journey,run,date)=>JSON.stringify([journey,run,date]);
export function contextualTrenordNumber(source,label,line,{numberRole,labelKind}={}){
  const roles=new Set([undefined,null,'public_train_number','public_train_number_candidate','documented_route_train_number']),kinds=new Set([undefined,null,'source_train_name_or_number','source_run_public_number','gtfs_trip_short_name','reviewed_public_train_designation','documented_route_train_number']);
  if(source!=='it_trenord'||typeof label!=='string'||label.length>256||typeof line!=='string'||!line||line.length>128||line.includes('_')||!roles.has(numberRole)||!kinds.has(labelKind))return null;
  const match=label.match(/^(.+) - ([0-9]{1,6})$/);if(!match)return null;
  if(match[1]===line)return match[2];
  const re=match[1].match(/^RE_([0-9]+)$/);return re&&line==='RE'+re[1]?match[2]:null;
}
export function installNativePublicNumbers(document,dates){
  active=null;byJourney=new Map();byRunDate=new Map();metadataCache=new WeakMap();
  if(!document)return;
  const allowed=new Set(['format','schemaVersion','dates','nativeManifestSha256','nativeSource','nativeSnapshot','donorBinding','stationBindingsSha256','sourceReview','sourceReviewAccepted','physicalFrequencyAdded','passPolicyChanged','nativeParentsChanged','labelUpdates','summary']);
  const rowFields=new Set(['journeyId','runId','serviceDate','source','snapshot','timetableSnapshot','label','kind','nativeLabelUnchanged','donorSource','donorJourneyId','donorTrainNumberField','comparison','nativeEndpointProjection']);
  if(Object.keys(document).some(key=>!allowed.has(key))||document.format!=='rail-atlas-native-public-number-supplement-v1'||document.schemaVersion!==1||document.sourceReviewAccepted!==true||document.physicalFrequencyAdded!==0||document.nativeParentsChanged!==false||document.passPolicyChanged!==false||JSON.stringify(document.dates)!==JSON.stringify(dates)||!Array.isArray(document.labelUpdates))throw Error('Invalid native public-number metadata');
  for(const row of document.labelUpdates){
    const key=runDateKey(row.journeyId,row.runId,row.serviceDate);
    if(Object.keys(row).some(key=>!rowFields.has(key))||['journeyId','runId','serviceDate','source','snapshot','timetableSnapshot','label'].some(key=>typeof row[key]!=='string'||!row[key])||byRunDate.has(key)||!dates.includes(row.serviceDate)||row.source!==document.nativeSource||row.snapshot!==document.nativeSnapshot||row.nativeLabelUnchanged!==''||row.kind!=='source_train_name_or_number'||!/^\d{1,6}[A-Za-z]?$/.test(row.label))throw Error('Invalid dated native public number');
    byRunDate.set(key,row);const rows=byJourney.get(row.journeyId)||[];rows.push(row);byJourney.set(row.journeyId,rows);
  }
  active=document;
}
export function nativePublicTrainLabels(journey){
  if(metadataCache.has(journey))return metadataCache.get(journey);
  const nativeRows=(journey.publicTrains||[]).map(row=>{const number=contextualTrenordNumber(journey.source,row.label,journey.line,{numberRole:row.numberRole,labelKind:row.kind});return number?{...row,daily:Array.isArray(row.daily)?[...row.daily]:row.daily,label:number,sourceDisplayLabel:row.label,sourceNumberDerivation:'Trenord exact native line/train display'}:row;});
  if(!active||journey.source!==active.nativeSource||journey.snapshot!==active.nativeSnapshot||!byJourney.has(journey.id)){if(journey.source==='it_trenord')metadataCache.set(journey,nativeRows);return nativeRows;}
  const labels=new Map(nativeRows.map(row=>[row.label,{...row,daily:Array.isArray(row.daily)?[...row.daily]:row.daily}]));
  const extra=new Map();
  for(const row of byJourney.get(journey.id)){
    if(row.source!==journey.source||row.snapshot!==journey.snapshot)continue;
    const day=active.dates.indexOf(row.serviceDate);if(!(journey.daily?.[day]>0))continue;
    const daily=extra.get(row.label)||active.dates.map(()=>0);daily[day]++;extra.set(row.label,daily);
  }
  for(const[label,daily]of extra){
    const previous=labels.get(label),values=daily.map((n,i)=>Math.max(n,Number(previous?.daily?.[i])||0));
    labels.set(label,{...previous,label,kind:'source_train_name_or_number',daily:values,weekly:values.reduce((a,b)=>a+b,0),supplementalNumberSource:'fr_sncf_netex'});
  }
  const result=[...labels.values()];metadataCache.set(journey,result);return result;
}
export function numberedRunViews(journey,wrapper,run,dates){
  const contextual=contextualTrenordNumber(journey.source,run.label,journey.line,{numberRole:run.numberRole,labelKind:run.labelKind});
  if(contextual)return[{...run,label:contextual,dates,_nativePublicLabel:run.label,_contextualPublicNumberSource:'Trenord'}];
  if(!active||run.label||wrapper.source!==active.nativeSource||wrapper.snapshot!==active.nativeSnapshot)return[{...run,dates}];
  const buckets=new Map();
  for(const date of dates){
    const row=byRunDate.get(runDateKey(journey.id,run.id,date));
    const valid=row&&row.source===wrapper.source&&row.snapshot===wrapper.snapshot&&row.timetableSnapshot===wrapper.timetableSnapshot;
    const label=valid?row.label:run.label||'',bucket=buckets.get(label)||{dates:[],supplemented:!!valid};bucket.dates.push(date);buckets.set(label,bucket);
  }
  return[...buckets].map(([label,bucket])=>({...run,label,dates:bucket.dates,
    _publicNumberDisplayId:JSON.stringify([journey.id,run.id,label,bucket.dates]),
    ...(bucket.supplemented?{_publicNumberSource:'SNCF Voyageurs NeTEx',_nativePublicLabel:run.label||''}:{})}));
}
export const runSelectionId=run=>run?._publicNumberDisplayId||run?.id;
export function createNativePublicNumberLoader({getDescriptor,getDates,load,onChange=()=>{}}){
  let key=null,promise=null,error=false,loaded=false,generation=0;
  return{
    get status(){return{failed:error,loading:!!promise&&!loaded,loaded};},
    ensure({retry=false}={}){
      const next=getDescriptor()||null;
      if(next!==key){generation++;key=next;promise=null;error=false;loaded=false;installNativePublicNumbers(null,getDates());}
      if(!key)return Promise.resolve(false);
      if(error&&!retry)return Promise.resolve(false);
      if(retry){promise=null;error=false;}
      if(!promise){const ticket=++generation;promise=Promise.resolve().then(()=>load(key)).then(document=>{
        if(ticket!==generation)return false;installNativePublicNumbers(document,getDates());loaded=true;error=false;onChange();return true;
      }).catch(()=>{if(ticket===generation){installNativePublicNumbers(null,getDates());error=true;loaded=false;promise=null;onChange();}return false;});}
      return promise;
    }
  };
}
