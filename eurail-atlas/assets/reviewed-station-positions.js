// A reviewed position is a display-only view over one unchanged native row.
const text=value=>typeof value==='string'&&value.length>0;
const point=value=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)&&Math.abs(value[0])<=180&&Math.abs(value[1])<=85&&(value[0]!==0||value[1]!==0);
const fields=['id','source','name','nativeIdentity','sourceOriginalPosition','displayPosition','referenceNodeId','referenceNodeVersion','referenceName','stationIdentityUnchanged','meaning'];
const identityFields=['source','snapshotId','sourceStationId'];
const fingerprint=row=>JSON.stringify(fields.map(key=>key==='nativeIdentity'?identityFields.map(field=>row[key][field]):row[key]));

export function decodeReviewedStationPositions(document){
  if(document?.format!=='rail-atlas-reviewed-continuation-geometry-v1'||document.schemaVersion!==1||!Array.isArray(document.reviews)||document.sourceFrequencyContribution!==0||document.physicalFrequencyContribution!==0||document.stationIdentitiesUnchanged!==true||document.passPoliciesUnchanged!==true)throw new Error('Unsupported reviewed station positions');
  const positions=new Map();
  for(const review of document.reviews){
    if(!review||!Array.isArray(review.displayStationPositions))throw new Error('Invalid reviewed station position list');
    for(const row of review.displayStationPositions){
      const identity=row?.nativeIdentity;
      if(!row||Object.keys(row).length!==fields.length||fields.some(key=>!Object.hasOwn(row,key))||!['id','source','name','referenceName','meaning'].every(key=>text(row[key]))||!identity||Object.keys(identity).length!==identityFields.length||!identityFields.every(key=>text(identity[key]))||identity.source!==row.source||!point(row.sourceOriginalPosition)||!point(row.displayPosition)||!Number.isSafeInteger(row.referenceNodeId)||row.referenceNodeId<=0||!Number.isSafeInteger(row.referenceNodeVersion)||row.referenceNodeVersion<=0||row.stationIdentityUnchanged!==true)throw new Error('Invalid reviewed station position');
      const previous=positions.get(row.id);
      if(previous&&fingerprint(previous)!==fingerprint(row))throw new Error('Conflicting reviewed station position');
      if(!previous)positions.set(row.id,{...row,nativeIdentity:{...identity},sourceOriginalPosition:[...row.sourceOriginalPosition],displayPosition:[...row.displayPosition]});
    }
  }
  return[...positions.values()];
}

// Optional transport stays independent of through-service geometry. A failed
// request can retry, and an older manifest's response cannot move current pins.
export function createReviewedStationPositionLoader({getDescriptor,load,catalog,onChange=()=>{}}){
  let key=null,pending=null,loaded=false,generation=0;
  function clear(next=null){generation++;key=next;pending=null;loaded=false;if(catalog.setDisplayPositions([]))onChange();}
  return{
    load(){
      const next=getDescriptor()||null;if(next!==key)clear(next);
      if(!key||loaded)return Promise.resolve(null);
      if(!pending){
        const descriptor=key,ticket=generation;
        const request=Promise.resolve().then(()=>load(descriptor)).then(document=>{
          if(ticket!==generation||getDescriptor()!==descriptor)return null;
          const positions=decodeReviewedStationPositions(document);catalog.setDisplayPositions(positions);loaded=true;onChange();return positions;
        }).finally(()=>{if(pending===request)pending=null;});
        pending=request;
      }
      return pending;
    },
    reset(){clear();}
  };
}
