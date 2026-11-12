import{escapeHTML as esc}from'./atlas-core.js?v=ade479ba8cd5edfe';

// Explains withheld clock times for a source whose reviewed publication scope
// does not include its individual timetable. `status` is the source's entry in
// the delivery's timetable index (`restricted: true` means no clock is
// published). The wording comes from `clock-notices.json`, which the build
// derives for each delivery from its manifest and reviewed publication policy
// (rail_data/clock_notice.py) and the Pages publisher binds to that delivery:
// the reviewed reason, what that source actually publishes (an endpoint-only
// source is never said to show a stopping pattern) and the operator's own
// timetable link. Without a packet entry the note is a neutral sentence that
// claims no licence reason and nothing about what is shown.
export const GENERIC_WITHHELD_CLOCK_NOTE='Times are not shown because this source’s published edition does not include individual clock times.';

export function clockNoticesURL(){const url=new URL('./clock-notices.json',import.meta.url);url.search=new URL(import.meta.url).search;return url.href;}

export function validClockNotices(data){
  return data?.schemaVersion===1&&data.format==='rail-atlas-clock-notices-v1'&&typeof data.releaseId==='string'&&data.releaseId!==''
    &&data.clockTimesPublished===false&&data.sources!==null&&typeof data.sources==='object'&&!Array.isArray(data.sources);
}

let notices=null,pending=null;
export function currentClockNotices(){return notices||null;}
export function loadClockNotices(load=()=>fetch(clockNoticesURL()).then(response=>response.ok?response.json():null)){
  if(!pending)pending=Promise.resolve().then(load).then(data=>{notices=validClockNotices(data)?data:false;return notices||null;},()=>{notices=false;return null;});
  return pending;
}
export function clockNoticesSettled(){return notices!==null;}
export function resetClockNotices(){notices=null;pending=null;}

export function withheldClockNotice(status,source,packet=currentClockNotices(),releaseId=null){
  if(!status?.restricted)return null;
  const entry=validClockNotices(packet)&&(!releaseId||packet.releaseId===releaseId)&&Object.hasOwn(packet.sources,source)?packet.sources[source]:null;
  const note=typeof entry?.note==='string'&&entry.note.trim()?entry.note.trim():GENERIC_WITHHELD_CLOCK_NOTE;
  const url=typeof entry?.timetableUrl==='string'&&/^https:\/\//.test(entry.timetableUrl)?entry.timetableUrl:null;
  const label=url?(typeof entry.timetableLabel==='string'&&entry.timetableLabel.trim()?entry.timetableLabel.trim():'Operator timetable'):null;
  return{note,url,label};
}

export function withheldClockNoticeHTML(status,source,packet=currentClockNotices(),releaseId=null){
  const notice=withheldClockNotice(status,source,packet,releaseId);
  if(!notice)return'';
  const link=notice.url?` <a class="withheld-clock-link" href="${esc(notice.url)}" target="_blank" rel="noopener noreferrer">${esc(notice.label)} ↗</a>`:'';
  return`<p class="helper withheld-clock-note" role="note">${esc(notice.note)}${link}</p>`;
}
