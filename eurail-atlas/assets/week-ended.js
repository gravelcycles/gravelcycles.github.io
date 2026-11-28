// After the last service date of the week on the map, while no newer week is
// published, say so in one neutral line (docs/WEEK_FLIPPING.md, "Week ended").
// The dates come from the delivery on the map; nothing here names a week.
// "Ended" means the last service date is over everywhere in scope: the UTC
// calendar date is past it (Europe's westernmost clocks are at UTC), so the
// line never appears while that day is still running somewhere.
import{dateRangeLabels}from'./atlas-core.js?v=14a270392708fc8e';

const DATE=/^\d{4}-\d{2}-\d{2}$/;
export function todayUTC(now=new Date()){return now.toISOString().slice(0,10);}
export function weekEndedText(dates,today){
  if(!Array.isArray(dates)||!dates.length||!dates.every(date=>DATE.test(String(date)))||!DATE.test(String(today)))return'';
  if(today<=dates.at(-1))return'';
  return`Timetable for ${dateRangeLabels(dates).snapshot}. The next week is not published yet.`;
}
// One persistent line among the map notices; replaced, never duplicated.
export function showWeekEnded(doc,dates,now=new Date()){
  const text=weekEndedText(dates,todayUTC(now));
  doc.getElementById('weekEnded')?.remove();
  if(!text)return'';
  const line=doc.createElement('p');
  line.id='weekEnded';line.className='basemap-status week-ended';line.setAttribute('role','status');line.textContent=text;
  doc.querySelector('.map-notices')?.prepend(line);
  return text;
}
