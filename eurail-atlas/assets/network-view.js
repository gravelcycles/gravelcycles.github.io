// Complete-network counts remain authoritative when a viewport supplies only
// one direction or a more detailed path. Rich direction metadata loads on pick.
const metrics=['daily','eurailDaily','reviewedEurailDaily','conditionalDaily','reviewedConditionalDaily'];
export function mergeCompletePairs(complete,details,hydrated=new Set()){
  const byId=new Map(details.map(edge=>[edge.id,edge])),seen=new Set();
  const result=complete.map(base=>{
    seen.add(base.id);const detail=byId.get(base.id);if(!detail)return base;
    const edge={...base,...detail,_displayOnly:!hydrated.has(base.id),_displayCatalog:'network',_startupIndex:base._startupIndex};
    for(const field of metrics)edge[field]=base[field];
    return edge;
  });
  for(const edge of details)if(!seen.has(edge.id))result.push(edge);
  return result;
}
