// Complete-network counts remain authoritative when a viewport supplies only
// one direction or a more detailed path. Rich direction metadata loads on pick.
const metrics=['daily','eurailDaily','reviewedEurailDaily','conditionalDaily','reviewedConditionalDaily'];
function mergePair(base,detail,hydrated){
  const edge={...base,...detail,_displayOnly:!hydrated,_displayCatalog:'network',_startupIndex:base._startupIndex};
  for(const field of metrics)edge[field]=base[field];
  return edge;
}
export function mergeCompletePairs(complete,details,hydrated=new Set()){
  const byId=new Map(details.map(edge=>[edge.id,edge])),seen=new Set();
  const result=complete.map(base=>{
    seen.add(base.id);const detail=byId.get(base.id);if(!detail)return base;
    return mergePair(base,detail,hydrated.has(base.id));
  });
  for(const edge of details)if(!seen.has(edge.id))result.push(edge);
  return result;
}

// The complete continent is immutable; local packets replace only their own
// rows. Reuse every other merged row (and the whole array when unchanged), so
// policy/geometry caches do not rebuild for hundreds of thousands of pairs.
export function createCompletePairMerger(){
  let bases=null,index=null,known=new Map(),output=[];
  return(complete,details,hydrated=new Set())=>{
    if(bases!==complete){bases=complete;index=new Map(complete.map((edge,i)=>[edge.id,i]));known=new Map();output=complete;}
    let next=output;const seen=new Set(),extras=[];
    const writable=()=>{if(next===output)next=output.slice();};
    for(const detail of details){
      const position=index.get(detail.id);if(position===undefined){extras.push(detail);continue;}
      seen.add(detail.id);const loaded=hydrated.has(detail.id),previous=known.get(detail.id);
      if(previous?.detail===detail&&previous.hydrated===loaded)continue;
      writable();next[position]=mergePair(complete[position],detail,loaded);known.set(detail.id,{detail,hydrated:loaded});
    }
    for(const id of known.keys())if(!seen.has(id)){writable();next[index.get(id)]=complete[index.get(id)];known.delete(id);}
    if(next.length!==complete.length+extras.length||extras.some((edge,i)=>next[complete.length+i]!==edge)){
      writable();next.length=complete.length;for(const edge of extras)next.push(edge);
    }
    output=next;return output;
  };
}
