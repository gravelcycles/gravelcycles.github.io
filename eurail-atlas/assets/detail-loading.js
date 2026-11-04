// The complete display catalogue retains all available links and exact metrics.
// Fine spatial packets refine geometry/metadata; a wide desktop viewport must
// not download the continent again merely because it crosses a zoom boundary.
export function detailLoadingPolicy(manifest,{legacyItaly=false}={}){
  return manifest?.files?.displayNetwork?{minZoom:8,maxPackets:96}:{minZoom:legacyItaly?7:5.5,maxPackets:Infinity};
}
export function boundedDetailQueue(chunks,loaded,policy){
  // Count the entire viewport, not only the remaining requests, so arrivals or
  // aborts cannot gradually trigger a near-global packet sweep.
  if(chunks.length>policy.maxPackets)return [];
  return chunks.filter(chunk=>!loaded.has(chunk.id));
}
