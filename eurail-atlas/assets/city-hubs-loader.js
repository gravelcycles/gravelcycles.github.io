// Load rank ranges independently. Filters reuse the retained data; increasing
// the city limit fetches only the additional immutable ranges.
export function createCityHubsLoader({loadIndex,loadPart,onChange=()=>{}}){
  let document=null,indexPromise=null;
  const loaded=new Set(),pending=new Map();
  async function index(){
    if(document)return document;
    if(!indexPromise)indexPromise=(async()=>{
      const value=await loadIndex();
      if(value.schemaVersion!==3||!Array.isArray(value.cities)||!Array.isArray(value.connectionParts))throw new Error('Unsupported city connections');
      document={...value,connections:[],railGeometry:{}};onChange(document);return document;
    })().catch(error=>{indexPromise=null;throw error;});
    return indexPromise;
  }
  async function through(rank){
    const value=await index();
    await Promise.all(value.connectionParts.filter(part=>part.minRank<=rank).map(part=>{
      if(loaded.has(part.url))return;
      if(!pending.has(part.url))pending.set(part.url,(async()=>{
        const page=await loadPart(part.url);
        if(page.schemaVersion!==3||page.kind!=='dated_direct_city_connection_part'||page.minRank!==part.minRank||page.maxRank!==part.maxRank||!Array.isArray(page.connections)||!page.railGeometry)throw new Error('Unsupported city connection range');
        const seen=new Set(value.connections.map(row=>row.id));
        for(const[id,rail]of Object.entries(page.railGeometry))if(value.railGeometry[id]&&JSON.stringify(value.railGeometry[id])!==JSON.stringify(rail))throw new Error('Conflicting city railway geometry');
        for(const row of page.connections)if(seen.has(row.id))throw new Error('Duplicate city connection');else seen.add(row.id);
        Object.assign(value.railGeometry,page.railGeometry);value.connections.push(...page.connections);loaded.add(part.url);onChange(value);
      })().finally(()=>pending.delete(part.url)));
      return pending.get(part.url);
    }));
    return value;
  }
  return{index,through,has:rank=>!!document&&document.connectionParts.filter(part=>part.minRank<=rank).every(part=>loaded.has(part.url))};
}
