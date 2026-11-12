// Picking a highlighted route on the map while a station (or city area) is
// selected. The station panel already lists that station's route groups; a
// click on a highlighted stroke chooses among those groups only. A click on a
// greyed line, empty map or a physical Traffic section keeps the normal
// behaviour (the caller decides that before asking here).
import{matchesFocus}from'./route-focus.js?v=18e7ea9f6c5b7ed8';

// The painted winner decides whether the click is a station-route pick: it must
// itself be highlighted. Other highlighted rows under the pointer widen the
// candidate set, so a click on a shared stretch finds every route there.
export function highlightedStack(winner,stack,focusIds){
  if(!winner||!focusIds?.size||!matchesFocus(winner,focusIds))return[];
  const rows=[winner];
  for(const edge of stack||[])if(edge&&edge!==winner&&matchesFocus(edge,focusIds))rows.push(edge);
  return rows;
}

// groups: the station's route groups in panel order. idsFor(group) returns the
// focus identity set for that one group (its edge IDs plus source-scoped map
// pair IDs, as routeFocusIds([group]) builds them). Returns the matching
// groups in panel order, each once.
export function stationRouteHits(groups,edges,idsFor){
  if(!groups?.length||!edges?.length)return[];
  return groups.filter(group=>{const ids=idsFor(group);return!!ids?.size&&edges.some(edge=>matchesFocus(edge,ids));});
}

// Per-group focus identities are hashed once per station focus and reused for
// later clicks. computeIds is routeFocusIds from train-services.js.
export function createGroupIdCache(computeIds){
  let owner=null,cache=new Map();
  return{
    async idsFor(key,groups){
      if(owner!==key){owner=key;cache=new Map();}
      const missing=groups.filter(group=>!cache.has(group.key));
      await Promise.all(missing.map(async group=>{const ids=await computeIds([group]);if(owner===key)cache.set(group.key,ids);}));
      return group=>cache.get(group.key)||null;
    },
    clear(){owner=null;cache=new Map();}
  };
}
