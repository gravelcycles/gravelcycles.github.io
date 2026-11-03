// Compact aggregate-only projection; full public journey records remain lazy.
export function decodeThroughServices(document,dates){
  if(document?.format!=='rail-atlas-through-services-v1'||document.schemaVersion!==1||!Array.isArray(document.fields)||!Array.isArray(document.values)||!document.rows||JSON.stringify(document.dates)!==JSON.stringify(dates))throw new Error('Unsupported through-service counts');
  const fields=document.fields,values=document.values;
  for(const required of ['daily','eurailDaily','reviewedEurailDaily','uncertainDaily','unknownDaily','conditionalDaily'])if(!fields.includes(required))throw new Error('Incomplete through-service metrics');
  if(new Set(fields).size!==fields.length)throw new Error('Duplicate through-service metric');
  for(const value of values)if(!Array.isArray(value)||value.length!==dates.length||value.some(n=>!Number.isSafeInteger(n)||n<0))throw new Error('Invalid through-service date vector');
  const profiles=document.profiles;
  if(!Array.isArray(profiles))throw new Error('Missing through-service profiles');
  for(const row of profiles)if(!Array.isArray(row)||row.length!==fields.length||row.some(n=>!Number.isSafeInteger(n)||n<0||n>=values.length))throw new Error('Invalid through-service vector reference');
  for(const index of Object.values(document.rows))if(!Number.isSafeInteger(index)||index<0||index>=profiles.length)throw new Error('Invalid through-service profile reference');
  const cache=new Map();
  return{size:Object.keys(document.rows).length,get(identity){
    if(cache.has(identity))return cache.get(identity);
    const index=document.rows[identity];if(index===undefined)return undefined;const encoded=profiles[index];
    const row=Object.fromEntries(fields.map((field,i)=>[field,values[encoded[i]]]));
    row.boardableDaily=row.daily;row.eurailBoardableDaily=row.eurailDaily;row.reviewedEurailBoardableDaily=row.reviewedEurailDaily;
    cache.set(identity,row);return row;
  }};
}
