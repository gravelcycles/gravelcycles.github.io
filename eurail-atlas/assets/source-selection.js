// Inline startup metadata can be older than the linked source selection.
// Only the full manifest is authoritative enough to discard unavailable IDs.
export function needsSourceRefresh(catalog, selected){
  const known=new Set(catalog.map(source=>source.id));
  return selected instanceof Set&&[...selected].some(id=>!known.has(id));
}

export function reconcileSourceSelection(catalog, selected, {previousDefaults=null,authoritative=true}={}){
  const known=new Set(catalog.map(source=>source.id));
  const defaults=new Set(catalog.filter(source=>source.defaultVisible!==false).map(source=>source.id));
  const followedDefaults=selected==null||(previousDefaults?.size>0&&selected.size===previousDefaults.size&&[...selected].every(id=>previousDefaults.has(id)));
  const requested=followedDefaults?defaults:new Set(selected);
  const unavailable=[...requested].filter(id=>!known.has(id));
  let sources=authoritative?new Set([...requested].filter(id=>known.has(id))):requested;
  const fallback=authoritative&&requested.size>0&&sources.size===0;
  if(fallback)sources=new Set(defaults);
  return{sources,defaults,unavailable,fallback};
}

export function sameManifestAsset(before, after, key){
  const descriptor=manifest=>{
    const logical=manifest?.files?.[key],physical=manifest?.assetPaths?.[logical]||logical;
    const sha256=manifest?.assets?.[physical]?.sha256;
    return typeof logical==='string'&&typeof sha256==='string'?{logical,physical,sha256}:null;
  };
  const left=descriptor(before),right=descriptor(after);
  return left!==null&&right!==null&&left.logical===right.logical&&left.physical===right.physical&&left.sha256===right.sha256;
}
