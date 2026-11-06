import{selectedDays}from'./atlas-core.js?v=1feafcec58b2ffae';

// A wrapper can cover only exact dates. Presence alone does not mean the
// selected trains have clocks; native frequencies and operating dates persist.
export function hasClockCoverageGaps(journeys,pages,day,dates){
  const selected=selectedDays(day,dates);
  return journeys.some(journey=>{
    const active=selected.filter(i=>Number(journey.daily?.[i])>0);
    if(!active.length)return false;
    const wrapper=pages?.get(journey.id);
    if(!wrapper||wrapper.source!==journey.source||wrapper.snapshot!==journey.snapshot)return true;
    if(!Object.hasOwn(wrapper,'clockCoverage'))return false; // legacy full match
    const c=wrapper.clockCoverage;
    if(!c||c.schemaVersion!==1||c.kind!=='exact_per_date_native_match'||!Array.isArray(c.dates)||JSON.stringify(c.dates)!==JSON.stringify(dates)||!Array.isArray(c.coveredDaily)||c.coveredDaily.length!==dates.length||!Array.isArray(c.dispositions)||c.dispositions.length!==dates.length)return true;
    return active.some(i=>c.dispositions[i]!=='accepted'||!Number.isSafeInteger(c.coveredDaily[i])||c.coveredDaily[i]<=0);
  });
}
