// Compact and hydrated geometry must keep the same source-specific selection.
// Directed IDs alone are absent from compact rows; pair hashes alone do not
// express their source boundary when matching another record.
export const mapPairFocusId=(source,pairId)=>JSON.stringify(['map-pair',source,pairId]);
export const matchesFocus=(edge,ids)=>!!ids&&(ids.has(edge.id)||!!edge.mapPairId&&ids.has(mapPairFocusId(edge.source,edge.mapPairId))||(edge._directionEdges||[]).some(row=>ids.has(row.id)));
