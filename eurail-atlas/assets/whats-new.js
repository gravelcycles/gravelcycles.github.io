// "What's new" in About: one plain line per release, newest first, with the
// time it went live and a "Show me" link. Nothing here is typed text: the
// list is `whats-new.json`, which the build generates for every release from
// the release entries (rail_data/whats_new.py, reports/releases/) and the
// publisher binds to them. It is requested only when About opens.
import{escapeHTML as esc}from'./atlas-core.js?v=f8cc78f67d7df99a';

export const WHATS_NEW_FORMAT='euro-rail-whats-new-v1';
// The direct link is ?about=new: the About parameter and this element id are
// the ones the shared-link work defines (ABOUT_SECTIONS.new in atlas-core.js
// once that is merged). Any other value opens About at its top.
export const ABOUT_ANCHOR='aboutWhatsNew';
export const KIND_LABELS={ui:'Map',transit:'City transit',bus:'Buses',rail:'Trains',explore:'Explore'};
const PAGES=new Set(['assets/explore.html','assets/buses.html']);

export function whatsNewURL(){const url=new URL('./whats-new.json',import.meta.url);url.search=new URL(import.meta.url).search;return url.href;}

// A link may only stay inside the atlas: a query on the map, or one of its own pages.
export function safeHref(href){return typeof href==='string'&&(PAGES.has(href)||/^\?[A-Za-z0-9_.,:~=&%\-]+$/.test(href))?href:null;}

function validEntry(entry){
  return entry!==null&&typeof entry==='object'&&typeof entry.id==='string'&&typeof entry.line==='string'&&entry.line.trim()!==''
    &&typeof entry.time==='string'&&Number.isFinite(Date.parse(entry.time));
}
export function validWhatsNew(data){
  return data?.schemaVersion===1&&data.format===WHATS_NEW_FORMAT&&Array.isArray(data.entries)&&data.entries.length>0&&data.entries.every(validEntry);
}

let packet=null,pending=null;
export function loadWhatsNew(load=()=>fetch(whatsNewURL()).then(response=>response.ok?response.json():null)){
  if(!pending)pending=Promise.resolve().then(load).then(data=>{packet=validWhatsNew(data)?data:false;return packet||null;},()=>{packet=false;return null;});
  return pending;
}
export function resetWhatsNew(){packet=null;pending=null;}

// The visitor's own locale and time zone; the exact UTC time is the tooltip.
export function whenLabel(time,locale,timeZone){
  const date=new Date(time),options={day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',...(timeZone?{timeZone}:{})};
  try{return new Intl.DateTimeFormat(locale,options).format(date);}catch(error){return utcLabel(time);}
}
export function utcLabel(time){
  const date=new Date(time),two=value=>String(value).padStart(2,'0');
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return`${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
}

export function entryHTML(entry,{locale,timeZone}={}){
  const href=safeHref(entry.showMe?.href),press=typeof entry.showMe?.press==='string'?entry.showMe.press.trim():'';
  const more=safeHref(entry.more?.href)&&typeof entry.more.label==='string'&&entry.more.label.trim()?entry.more:null;
  const kind=Object.hasOwn(KIND_LABELS,entry.kind)?`<span class="whats-new-kind">${esc(KIND_LABELS[entry.kind])}</span> `:'';
  const title=utcLabel(entry.time)+(entry.timeIs==='prepared'?' (when this release was prepared)':'');
  const links=[href?`<a class="whats-new-show" href="${esc(href)}">Show me ↗</a>`:'',more?`<a class="whats-new-more" href="${esc(more.href)}">${esc(more.label.trim())} ↗</a>`:''].filter(Boolean).join(' ');
  const how=press?`<span class="whats-new-press">${href?'':'To see it: '}${esc(press)}</span>`:'';
  return`<li class="whats-new-entry"><p class="whats-new-when">${kind}<time datetime="${esc(entry.time)}" title="${esc(title)}">${esc(whenLabel(entry.time,locale,timeZone))}</time></p><p class="whats-new-line">${esc(entry.line.trim())}</p>${links||how?`<p class="whats-new-links">${[links,how].filter(Boolean).join(' ')}</p>`:''}</li>`;
}

// Newest first, as generated. The box scrolls; "Show all" (a button that is
// already in the page, outside the box) opens it to its full length.
export function whatsNewHTML(data,options={}){
  if(!validWhatsNew(data))return'<p class="helper whats-new-empty">No recent changes are listed for this edition.</p>';
  const omitted=Number.isInteger(data.omitted)&&data.omitted>0?data.omitted:0;
  return`<ol class="whats-new-list">${data.entries.map(entry=>entryHTML(entry,options)).join('')}</ol>`
    +(omitted?`<p class="helper whats-new-omitted">${omitted} older ${omitted===1?'update is':'updates are'} not listed.</p>`:'');
}

// Fill the reserved box in About. The box and the button's line keep their
// height until the visitor asks for the whole list, so nothing below moves
// when the list arrives.
export function showWhatsNew(doc,load){
  const box=doc.getElementById('whatsNewBody');
  if(!box||box.dataset.state)return Promise.resolve(null);
  box.dataset.state='loading';
  return loadWhatsNew(load).then(data=>{
    box.innerHTML=whatsNewHTML(data);box.dataset.state=data?'listed':'empty';
    const button=doc.getElementById('whatsNewAll');
    if(button&&data&&data.entries.length>1){
      button.textContent=`Show all ${data.entries.length} updates`;button.classList.add('whats-new-ready');
      button.onclick=()=>{box.classList.add('whats-new-open');button.classList.remove('whats-new-ready');};
    }
    return data;
  });
}
