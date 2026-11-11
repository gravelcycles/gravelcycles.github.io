/* One synchronous style calculation owns this cache. Source/date/pass choices
 * are snapshotted, and the decoded contribution objects remain immutable for
 * its lifetime. Shared profiles and shared cohort arrays are counted once;
 * duplicate references in an array retain their additive multiplicity. */
import{cohortSelected}from'./physical-heat.js?v=627060c35bf1a7ca';

const EMPTY=Object.freeze([]);
const fieldFor=direction=>direction==='forward'?'forwardDaily':direction==='reverse'?'reverseDaily':'daily';

export function createPhysicalCountCache(state,indices){
  const selected=Array.from(indices),snapshot={...state,
    sources:state.sources instanceof Set?new Set(state.sources):state.sources,
    altSourceIds:state.altSourceIds instanceof Set?new Set(state.altSourceIds):state.altSourceIds},
    caches=new Map(),metrics={countCalls:0,dailyCalls:0,profileComputations:0,profileCacheHits:0,
      setComputations:0,setCacheHits:0,dailyProfileComputations:0,dailySetComputations:0};
  function cacheFor(conditional,direction){
    const field=fieldFor(direction),key=(conditional?'conditional:':'normal:')+field;
    let cache=caches.get(key);
    if(!cache){cache={field,conditional,profiles:new WeakMap(),sets:new WeakMap(),
      dailyProfiles:new WeakMap(),dailySets:new WeakMap()};caches.set(key,cache);}
    return cache;
  }
  function profileWeight(profile,cache){
    const previous=cache.profiles.get(profile);
    if(previous!==undefined){metrics.profileCacheHits++;return previous;}
    let value=0;
    if(cohortSelected(profile,snapshot,{conditional:cache.conditional}))
      for(const index of selected)value+=Number(profile[cache.field]?.[index])||0;
    cache.profiles.set(profile,value);metrics.profileComputations++;return value;
  }
  function count(section,{conditional=false,direction=null}={}){
    metrics.countCalls++;if(snapshot.trains===false)return 0;
    const cache=cacheFor(conditional,direction),cohorts=section.cohorts||EMPTY;
    const previous=cache.sets.get(cohorts);
    if(previous!==undefined){metrics.setCacheHits++;return previous;}
    let value=0;for(const profile of cohorts)value+=profileWeight(profile,cache);
    cache.sets.set(cohorts,value);metrics.setComputations++;return value;
  }
  function profileDaily(profile,cache){
    const previous=cache.dailyProfiles.get(profile);
    if(previous!==undefined)return previous;
    const value=Array(7).fill(0);
    if(cohortSelected(profile,snapshot,{conditional:cache.conditional}))
      for(let index=0;index<7;index++)value[index]=Number(profile[cache.field]?.[index])||0;
    cache.dailyProfiles.set(profile,value);metrics.dailyProfileComputations++;return value;
  }
  function daily(section,{conditional=false,direction=null}={}){
    metrics.dailyCalls++;if(snapshot.trains===false)return Array(7).fill(0);
    const cache=cacheFor(conditional,direction),cohorts=section.cohorts||EMPTY;
    let result=cache.dailySets.get(cohorts);
    if(result===undefined){
      const value=Array(7).fill(0);
      for(const profile of cohorts){const contribution=profileDaily(profile,cache);
        for(let index=0;index<7;index++)value[index]+=contribution[index];}
      cache.dailySets.set(cohorts,value);metrics.dailySetComputations++;result=value;
    }
    // Match sectionDaily's independent return value; callers cannot mutate the
    // cached vector used by another physical section sharing this cohort set.
    return result.slice();
  }
  return{count,daily,stats:()=>({...metrics})};
}
