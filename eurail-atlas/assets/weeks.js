// "Weeks" in About: the rail week on the map and the archived weeks, read at
// runtime from `weeks.json` (rail_data/weeks_archive.py::shipped_packet, bound
// to this delivery by the publisher). Nothing here names a week, a date or a
// manifest hash: it all comes from the file. Only the current week can be
// browsed on the map; past weeks are archived for restore
// (docs/RAIL_WEEKS_ARCHIVE.md). A corrected week (a derived patch,
// docs/RAIL_PATCH_RELEASE.md) is listed after the week it corrects, and the
// original is labelled "original, superseded"; a correction that a later one
// replaced reads "correction of <base>, superseded by ..."; the current week,
// when it is a correction, reads "Current (correction of <base>)".
//
// ?week=<hex prefix of at least 8 characters> names a week. The current week
// needs nothing; any other answer is a dismissable notice that never blocks
// the map. A missing or unreadable weeks.json shows no section and no notice.
import{escapeHTML as esc}from'./atlas-core.js?v=133f74a0e1b8e2bc';

export const WEEKS_KIND='euro_rail_weeks_index';
export const ABOUT_ANCHOR='aboutWeeks';
const HEX=/^[0-9a-f]{64}$/;

export function weeksURL(){const url=new URL('./weeks.json',import.meta.url);url.search=new URL(import.meta.url).search;return url.href;}

function validDates(dates){return dates!==null&&typeof dates==='object'&&typeof dates.first==='string'&&typeof dates.last==='string';}
function validRow(row){return row!==null&&typeof row==='object'&&HEX.test(String(row.manifestSha256))&&validDates(row.dates);}
export function validWeeks(data){
  const rail=data?.layers?.rail;
  return data?.schemaVersion===1&&data.kind===WEEKS_KIND&&rail!==null&&typeof rail==='object'
    &&validRow(rail.current)&&Array.isArray(rail.archived)&&rail.archived.every(validRow);
}

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Calendar dates as written in the file, without a time zone shift.
export function datesLabel(dates){
  const parse=value=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);return m?{y:+m[1],m:+m[2],d:+m[3]}:null;};
  const a=parse(dates.first),b=parse(dates.last);
  if(!a||!b||a.m<1||a.m>12||b.m<1||b.m>12)return`${dates.first} – ${dates.last}`;
  if(a.y===b.y&&a.m===b.m)return a.d===b.d?`${a.d} ${MONTHS[a.m-1]} ${a.y}`:`${a.d}–${b.d} ${MONTHS[b.m-1]} ${b.y}`;
  return a.y===b.y?`${a.d} ${MONTHS[a.m-1]} – ${b.d} ${MONTHS[b.m-1]} ${b.y}`:`${a.d} ${MONTHS[a.m-1]} ${a.y} – ${b.d} ${MONTHS[b.m-1]} ${b.y}`;
}
const short=sha=>sha.slice(0,8);

// Who corrects whom: the corrected week's hash → the week that corrects it.
export function correctionChain(data){
  const rail=data.layers.rail,by=new Map(),rows=[...rail.archived,rail.current];
  for(const row of rows){const target=row.correction?.correctsManifestSha256;if(HEX.test(String(target))&&!by.has(target))by.set(target,row);}
  return by;
}
// The end of a chain: the latest correction, or the week itself.
export function latest(row,chain){
  const seen=new Set();let at=row;
  while(chain.has(at.manifestSha256)&&!seen.has(at.manifestSha256)){seen.add(at.manifestSha256);at=chain.get(at.manifestSha256);}
  return at;
}

// Only an https archive location is linked; anything else is shown as text.
export function archiveHref(row){
  const url=row.archive?.location?.baseUrl;
  return typeof url==='string'&&/^https:\/\/[A-Za-z0-9.-]+\/[^\s"'<>]*$/.test(url)?url:null;
}
function sources(row){return(row.notKeptPublicly||[]).map(item=>typeof item==='string'?item:item?.source).filter(value=>typeof value==='string'&&value);}

export function rowHTML(row,data,chain){
  const rail=data.layers.rail,isCurrent=row===rail.current,next=chain.get(row.manifestSha256),notes=[];
  const base=row.correction?`<code>${esc(short(row.correction.correctsManifestSha256))}</code>`:'';
  const product=row.correction&&typeof row.correction.product==='string'?row.correction.product:'a derived product';
  if(isCurrent){
    if(row.correction){
      notes.push(`<strong>Current</strong> (correction of ${base}): published again with its ${esc(product)} corrected.`);
      notes.push('<a class="weeks-record" href="assets/startup/correction.json">Correction record ↗</a>');
    }else notes.push('<strong>On the map now.</strong>');
  }
  if(next){
    const end=latest(row,chain),by=end===rail.current?'the corrected week on the map':`week <code>${esc(short(end.manifestSha256))}</code>`;
    // A row that is itself a correction is not an original: name what it corrected.
    notes.push(row.correction?`<span class="weeks-superseded">Correction of ${base}, superseded</span> by ${by}.`
      :`<span class="weeks-superseded">Original, superseded</span> by ${by}.`);
  }else if(row.correction&&!isCurrent){
    notes.push(`Correction of ${base}: published again with its ${esc(product)} corrected.`);
  }
  if(!isCurrent){
    if(row.visibility==='private'){
      const names=sources(row);
      // Internal source ids mean nothing to a traveller: count them, and keep
      // the ids in a tooltip for anyone checking the record.
      notes.push(names.length?`<span class="weeks-private" title="${esc('Not kept publicly: '+names.join(', '))}">Archived privately, because ${names.length===1?'one of its sources':`${names.length} of its sources`} may not be republished.</span>`:'Archived privately.');
    }else{
      const href=archiveHref(row);
      notes.push(href?`Archived: <a class="weeks-archive" href="${esc(href)}" rel="noopener noreferrer" target="_blank">download the data ↗</a>.`:'Archived.');
    }
  }
  return`<li class="weeks-row${isCurrent?' weeks-current':''}" data-week="${esc(short(row.manifestSha256))}"><p class="weeks-when"><strong>${esc(datesLabel(row.dates))}</strong> <code>${esc(short(row.manifestSha256))}</code></p><p class="weeks-notes">${notes.join(' ')}</p></li>`;
}

// The current week first, then the archived weeks newest first; a correction
// comes before the week it corrects (the file lists them oldest first, in
// chain order).
export function weeksHTML(data){
  if(!validWeeks(data))return'';
  const rail=data.layers.rail,chain=correctionChain(data);
  const rows=[rail.current,...[...rail.archived].reverse()];
  return`<ol class="weeks-list">${rows.map(row=>rowHTML(row,data,chain)).join('')}</ol>`
    +'<p class="helper weeks-helper">Only the week on the map can be browsed here. Earlier weeks are kept as archives.</p>';
}

// ?week= accepts a lowercase or uppercase hex prefix of at least 8 characters.
export function weekParam(search){
  const value=new URLSearchParams(search).get('week');
  return typeof value==='string'&&/^[0-9a-fA-F]{8,64}$/.test(value)?value.toLowerCase():'';
}
export function findWeek(data,prefix){
  const rail=data.layers.rail,rows=[rail.current,...rail.archived].filter(row=>row.manifestSha256.startsWith(prefix));
  const unique=[...new Map(rows.map(row=>[row.manifestSha256,row])).values()];
  return unique.length===1?unique[0]:null;
}
// The notice for a named week, or '' when none is needed.
export function weekNoticeHTML(data,prefix){
  if(!validWeeks(data)||!prefix)return'';
  const rail=data.layers.rail,row=findWeek(data,prefix),now=esc(datesLabel(rail.current.dates));
  if(!row)return`No listed week matches <code>${esc(prefix.slice(0,16))}</code>. The map shows the week of ${now}.`;
  if(row===rail.current)return'';
  const chain=correctionChain(data);
  if(chain.has(row.manifestSha256)){
    const end=latest(row,chain);
    return end===rail.current
      ?`Week <code>${esc(short(row.manifestSha256))}</code> (${esc(datesLabel(row.dates))}) was corrected. The map shows the corrected delivery. <a href="assets/startup/correction.json">What changed ↗</a>`
      :`Week <code>${esc(short(row.manifestSha256))}</code> (${esc(datesLabel(row.dates))}) was corrected by week <code>${esc(short(end.manifestSha256))}</code>, which is archived. The map shows the week of ${now}.`;
  }
  return`Week <code>${esc(short(row.manifestSha256))}</code> (${esc(datesLabel(row.dates))}) is archived and cannot be browsed here. The map shows the week of ${now}.`;
}

let packet=null,pending=null;
export function loadWeeks(load=()=>fetch(weeksURL()).then(response=>response.ok?response.json():null)){
  if(!pending)pending=Promise.resolve().then(load).then(data=>{packet=validWeeks(data)?data:false;return packet||null;},()=>{packet=false;return null;});
  return pending;
}
export function resetWeeks(){packet=null;pending=null;}

// Fill the section in About; it stays hidden unless weeks.json is readable.
export function showWeeks(doc,load){
  const section=doc.getElementById(ABOUT_ANCHOR),box=doc.getElementById('weeksBody');
  if(!section||!box||box.dataset.state)return Promise.resolve(null);
  box.dataset.state='loading';
  return loadWeeks(load).then(data=>{
    if(!data){box.dataset.state='absent';section.hidden=true;return null;}
    box.innerHTML=weeksHTML(data);box.dataset.state='listed';section.hidden=false;return data;
  });
}

// A dismissable notice above the map for ?week=. It takes no focus and
// blocks nothing: only its own box takes pointer events.
export function showWeekNotice(doc,search,load){
  const prefix=weekParam(search);
  if(!prefix||doc.getElementById('weekNotice'))return Promise.resolve('');
  return loadWeeks(load).then(data=>{
    const html=data?weekNoticeHTML(data,prefix):'';
    if(!html||doc.getElementById('weekNotice'))return'';
    const box=doc.createElement('div');
    box.id='weekNotice';box.className='week-notice';box.setAttribute('role','status');
    box.innerHTML=`<p>${html}</p><button type="button" class="week-notice-close" aria-label="Dismiss">×</button>`;
    box.querySelector('button').addEventListener('click',()=>box.remove());
    doc.body.appendChild(box);
    return html;
  });
}
