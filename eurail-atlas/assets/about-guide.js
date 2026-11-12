// The "How it works" opening of About names the service week and the number
// of timetable sources. Both come from the delivery (its dates and manifest),
// never from typed text, so a new week or a new source updates the guide.
import{dateRangeLabels,formatNumber}from'./atlas-core.js?v=7e389cc516b08c39';

// "1–7 November 2026"; a week crossing a year already names both years.
export function aboutWeekLabel(dates){
  if(!Array.isArray(dates)||!dates.length)return'';
  const long=dateRangeLabels(dates).long;
  return /\d{4}$/.test(long)?long:long+' '+new Date(dates[0]+'T12:00:00Z').getUTCFullYear();
}

export function aboutSourceText(manifest){
  const count=Array.isArray(manifest?.sources)?manifest.sources.length:0;
  return count?formatNumber(count)+' published timetable sources':'published timetable sources';
}

// Fill every placeholder that is present; leave the neutral fallback text otherwise.
export function fillAboutGuide(doc,{dates,manifest}={}){
  const week=aboutWeekLabel(dates);
  if(week)for(const node of doc.querySelectorAll('[data-about-week]'))node.textContent=week;
  if(Array.isArray(manifest?.sources))for(const node of doc.querySelectorAll('[data-about-sources]'))node.textContent=aboutSourceText(manifest);
}
