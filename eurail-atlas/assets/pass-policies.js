// All counters are projected from dated service patterns before aggregation.
// Unknown inclusion and unknown charges remain independent evidence gaps.
export function createPassPolicyAttacher(){
  let throughServices=null,passPolicies=null,displayMetrics=null,cache=new WeakMap();
  const attach=edge=>{
    if(cache.has(edge))return cache.get(edge);
    const explicitThrough=throughServices?.get(edge.id),through=explicitThrough||displayMetrics?.get(edge.id)||edge._throughServices,policy=explicitThrough||passPolicies?.get(edge.id)||edge._passPolicy;
    let directions=edge._directionEdges;
    if(directions){const prepared=directions.map(attach);if(prepared.some((row,i)=>row!==directions[i]))directions=prepared;}
    const changed=through&&(edge._throughServices!==through||edge.throughConnection!==true)||policy&&edge._passPolicy!==policy||directions!==edge._directionEdges;
    const result=changed?{...edge,...(through?{_throughServices:through,throughConnection:true}:{}),...(policy?{_passPolicy:policy}:{}),...(directions?{_directionEdges:directions}:{})}:edge;
    cache.set(edge,result);cache.set(result,result);return result;
  };
  return{attach,update(through,policies,display){throughServices=through;passPolicies=policies;displayMetrics=display;cache=new WeakMap();}};
}
export function decodePassPolicies(payload){
  const invalid=()=>{throw new Error('Invalid pass-policy projection');};
  if(payload?.schemaVersion!==1||payload.format!=='rail-atlas-pass-policies-v1'||!Array.isArray(payload.fields)||!Array.isArray(payload.values)||!payload.rows||typeof payload.rows!=='object')invalid();
  if(payload.fields.some(field=>!/^\w+(?:Boardable)?Daily$/.test(field))||new Set(payload.fields).size!==payload.fields.length)invalid();
  for(const daily of payload.values)if(!Array.isArray(daily)||daily.length!==7||daily.some(count=>!Number.isSafeInteger(count)||count<0))invalid();
  const result=new Map();
  for(const[id,row]of Object.entries(payload.rows)){
    if(!id||!Array.isArray(row)||row.length!==payload.fields.length)invalid();
    const policy={};
    for(let i=0;i<row.length;i++){const index=row[i];if(!Number.isInteger(index)||index<0||index>=payload.values.length)invalid();policy[payload.fields[i]]=payload.values[index];}
    result.set(id,policy);
  }
  return result;
}
