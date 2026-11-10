// Evidence labels are separate from train counts and pass/reservation decisions.
import {escapeHTML} from './atlas-core.js?v=36bcedbe061d63be';
const kinds = new Set(['sleeper','night_train']);
export function mergeSleepServices(...groups) {
  const merged = new Map();
  for (const group of groups) for (const item of group || []) {
    if (!kinds.has(item.kind)) continue;
    if (!merged.has(item.kind)) merged.set(item.kind, {...item,ruleIds:[],evidenceUrls:[]});
    const row = merged.get(item.kind);
    for (const key of ['ruleIds','evidenceUrls']) row[key]=[...new Set([...row[key],...(item[key]||[])])];
    for (const [key,value] of Object.entries(item)) {
      if (key==='daily' || key.endsWith('Daily')) {
        if (!Array.isArray(value)) continue;
        // Initialize a zero array once rather than reusing the first item's counts.
        const marker='_merged_'+key;
        if (!row[marker]) {row[key]=Array(value.length).fill(0);row[marker]=true;}
        if (row[key].length!==value.length) throw new Error('Sleep metadata date windows differ');
        value.forEach((n,i)=>row[key][i]+=Number(n)||0);
      }
    }
  }
  return [...merged.values()].map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!key.startsWith('_merged_'))));
}
export function activeSleepServices(row,count) {
  return (row?.sleepServices||[]).filter(item=>kinds.has(item.kind)&&count(item)>0);
}
export function publicTrainSleepNote(train,count) {
  const active=activeSleepServices(train,count);
  if(active.some(item=>item.kind==='sleeper'))return ' (sleeper)';
  if(active.some(item=>item.kind==='night_train'))return ' (night train; sleeping accommodation unconfirmed)';
  return '';
}
export function serviceSleepHTML(row,count) {
  return activeSleepServices(row,count).map(item=>{
    const sleeper=item.kind==='sleeper';
    const title=sleeper?'Published sleeper product. Accommodation choice, reservations and availability remain separate.':'Published night-train category; sleeping accommodation has not been established.';
    const link=(item.evidenceUrls||[]).find(url=>/^https:\/\//.test(url));
    return `<span class="badge ${sleeper?'sleeper':'night-train'}" title="${escapeHTML(title)}">${sleeper?'Includes sleeper trains':'Night train · sleeping accommodation unconfirmed'}</span>${link?` <a class="sleep-evidence" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">Source ↗</a>`:''}`;
  }).join(' ');
}
