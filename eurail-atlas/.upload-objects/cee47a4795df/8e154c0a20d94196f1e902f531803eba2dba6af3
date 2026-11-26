// "Plan a trip": the route finder panel. Loaded on demand when the panel
// first opens; its timetable (assets/route-finder/, rail_data/route_finder.py)
// is read and searched in route-finder-worker.js. The panel says what it
// did not search: a held week, sources without times, replacement buses
// without times, trains a pass filter leaves out, the end of the week.
// See docs/RAIL_ROUTE_FINDER.md.

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const pad=n=>String(n).padStart(2,'0');
// One journey: its departure, arrival and trains (to merge earlier and later pages).
const key=j=>j.dep+'|'+j.arr+'|'+j.legs.map(l=>l.walk?'w':l.day+':'+l.trip).join(',');
const duration=minutes=>{const h=Math.floor(minutes/60),m=minutes%60;return h?h+' h '+pad(m):m+' min';};
const WEEKDAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const dayLabel=iso=>{const d=new Date(iso+'T12:00:00Z');return WEEKDAYS[d.getUTCDay()]+' '+d.getUTCDate()+' '+d.toLocaleDateString('en-GB',{month:'short',timeZone:'UTC'});};
const INCLUSION={included:'Eurail: included',conditional:'Eurail: conditional',not_included:'Eurail: not included',unknown:'Eurail: unknown'};
const RESERVATION={required:'reservation required',conditional:'reservation sometimes required',recommended:'reservation recommended',optional:'reservation optional'};
const SUPPLEMENT={required_on_named_corridor:'supplement on some routes',conditional_station_access:'station access fee may apply'};

// The worker, created on first use, with a promise per request.
let worker=null,sequence=0,progressListener=null;const waiting=new Map();
function call(method,...args){
  if(!worker){
    const url=new URL('./route-finder-worker.js?v=558576e12f906d69',import.meta.url);url.search=new URL(import.meta.url).search;
    worker=new Worker(url,{type:'module',name:'route-finder'});
    worker.onmessage=({data})=>{if(data.progress){progressListener?.(data.progress);return;}const job=waiting.get(data.id);if(!job)return;waiting.delete(data.id);data.error?job.reject(new Error(data.error)):job.resolve(data.result);};
    worker.onerror=event=>{for(const job of waiting.values())job.reject(new Error(event.message||'route_finder_worker_failed'));waiting.clear();worker=null;};
    const base=new URL('./route-finder/',import.meta.url).href;
    waiting.set(0,{resolve(){},reject(){}});worker.postMessage({id:0,method:'init',args:[base]});
  }
  const id=++sequence;return new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});worker.postMessage({id,method,args});});
}

// The minutes on the shared clock for a local time at a station's country on date index d.
const toShared=(summary,country,d,minutes)=>minutes-((summary.clock.countryOffsets||{})[country]?.[d]??0);

// api (from app.js): {panel, body, drawTrip(legs, journey), clearTrip(), saveTrip(trip|null), toast(text), coverage()}
export function createTripPlanner(api){
  if(!document.querySelector('link[data-trip-planner]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./route-finder.css?v=558576e12f906d69',import.meta.url).href;link.dataset.tripPlanner='';document.head.append(link);}
  const root=api.body;let summary=null,opening=null,last=null,shown=[],selected=-1,pendingPrefill=null;
  const $=id=>root.querySelector('#'+id);
  const fields={from:null,to:null,via:null};

  function shell(){
    root.innerHTML=`<h3 id="tripTitle">Plan a trip</h3>
<p class="helper trip-week" id="tripWeek">Loading the timetable…</p>
<div class="trip-loading" id="tripLoading" hidden><span class="loading-track"><i id="tripLoadingBar"></i></span><span id="tripLoadingText" aria-hidden="true"></span></div>
<form id="tripForm" class="trip-form" autocomplete="off" novalidate>
 ${stationField('from','From')}
 <button type="button" class="text-button trip-swap" id="tripSwap" aria-label="Swap From and To">⇅ Swap</button>
 ${stationField('to','To')}
 <div class="trip-when"><label for="tripWhen">When</label><select id="tripWhen"><option value="now">Leave now</option><option value="depart">Depart at</option><option value="arrive">Arrive by</option></select>
  <select id="tripDate" aria-label="Date" hidden></select><input id="tripTime" type="time" aria-label="Time, local to the station" hidden></div>
 <label class="trip-check"><input type="checkbox" id="tripDirect"> Direct trains only</label>
 <details class="trip-more" id="tripMore"><summary>More options<span id="tripMoreSummary"></span></summary>
  ${stationField('via','Via (optional)')}
  <label class="trip-inline">Stop at the via for <select id="tripStopover"><option value="0">no stop (pass through)</option><option value="30">30 min</option><option value="60">1 h</option><option value="120">2 h</option><option value="240">4 h</option></select></label>
  <label class="trip-inline">Changes at most <select id="tripMax"><option value="">any</option><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>
  <label class="trip-inline">Minimum change time <select id="tripChange"><option value="2">2 min</option><option value="5" selected>5 min</option><option value="10">10 min</option><option value="15">15 min</option><option value="20">20 min</option><option value="30">30 min</option></select></label>
  <fieldset class="trip-pass"><legend>Eurail pass</legend>
   <label class="trip-check"><input type="checkbox" id="tripEurail"> Only trains confirmed as included</label>
   <label class="trip-check"><input type="checkbox" id="tripNoReservation"> No reservation needed</label>
   <label class="trip-check"><input type="checkbox" id="tripNoSupplement"> No supplement listed</label>
   <p class="helper">Unknown pass status counts as not included here.</p></fieldset>
  <label class="trip-inline">Sort by <select id="tripSort"><option value="arrival">earliest arrival</option><option value="changes">fewest changes</option><option value="duration">shortest time</option></select></label>
 </details>
 <button type="submit" class="primary-button trip-search" id="tripSearch">Find trains</button>
</form>
<p class="helper trip-status" id="tripStatus" role="status" aria-live="polite"></p>
<ol class="trip-results" id="tripResults" aria-label="Journeys"></ol>
<div class="trip-paging" id="tripPaging" hidden><button type="button" class="text-button" id="tripEarlier">← Earlier</button><button type="button" class="text-button" id="tripLater">Later →</button></div>
<div class="trip-notices" id="tripNotices"></div>
<p class="helper trip-scope">Trains with published times, each counted once. Changes only within one station, where a reviewed through-train continues, or over a reviewed footpath between stations; walks are never guessed from distance. Platforms are not published. Check with the operator before you travel.</p>`;
    for(const key of Object.keys(fields))wireStation(key);
    $('tripSwap').onclick=()=>{const a=fields.from,b=fields.to;setStation('from',b);setStation('to',a);};
    $('tripWhen').onchange=()=>{const now=$('tripWhen').value==='now';$('tripDate').hidden=now;$('tripTime').hidden=now;};
    $('tripForm').onsubmit=event=>{event.preventDefault();search();};
    $('tripEarlier').onclick=()=>page(-1);$('tripLater').onclick=()=>page(1);
    $('tripSort').onchange=()=>{if(last)render(last);};
    $('tripMore').addEventListener('toggle',moreSummary);root.addEventListener('change',moreSummary);
  }
  const stationField=(key,label)=>`<div class="trip-station"><label for="trip-${key}">${label}</label><input id="trip-${key}" type="search" placeholder="Station" spellcheck="false" role="combobox" aria-autocomplete="list" aria-controls="trip-${key}-list" aria-expanded="false"><ul class="suggestions" id="trip-${key}-list" role="listbox" hidden></ul></div>`;
  function moreSummary(){
    const parts=[];if(fields.via)parts.push('via '+fields.via.name);if($('tripMax').value!=='')parts.push('≤ '+$('tripMax').value+' changes');
    if($('tripChange').value!=='5')parts.push($('tripChange').value+' min changes');
    if($('tripEurail').checked)parts.push('Eurail only');if($('tripNoReservation').checked)parts.push('no reservation');if($('tripNoSupplement').checked)parts.push('no supplement');
    if($('tripSort').value!=='arrival')parts.push('sorted by '+$('tripSort').selectedOptions[0].text);
    $('tripMoreSummary').textContent=parts.length?': '+parts.join(', '):'';
  }
  function setStation(key,s){fields[key]=s||null;const input=$('trip-'+key);if(input)input.value=s?s.name:'';moreSummary();}
  function wireStation(key){
    const input=$('trip-'+key),list=$('trip-'+key+'-list');let timer=0,options=[],active=-1;
    const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');active=-1;};
    const show=()=>{list.innerHTML=options.map((s,i)=>`<li role="option" id="trip-${key}-o${i}" aria-selected="${i===active}" data-i="${i}">${esc(s.name)}<small>${esc(s.country)}</small></li>`).join('');list.hidden=!options.length;input.setAttribute('aria-expanded',String(!!options.length));};
    const pick=i=>{setStation(key,options[i]);close();};
    input.addEventListener('input',()=>{fields[key]=null;clearTimeout(timer);const q=input.value;if(q.trim().length<2){options=[];close();return;}
      timer=setTimeout(async()=>{try{await ready();options=await call('searchStations',q,8);active=-1;show();}catch(error){status(error);}},120);});
    input.addEventListener('keydown',event=>{if(list.hidden)return;if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();active=(active+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;show();input.setAttribute('aria-activedescendant','trip-'+key+'-o'+active);}
      else if(event.key==='Enter'&&active>=0){event.preventDefault();pick(active);}else if(event.key==='Escape'){event.stopPropagation();close();}});
    list.addEventListener('mousedown',event=>{const li=event.target.closest('li');if(li){event.preventDefault();pick(Number(li.dataset.i));}});
    input.addEventListener('blur',()=>setTimeout(close,150));
  }
  const status=value=>{const el=$('tripStatus');if(!el)return;el.textContent=value instanceof Error?friendly(value):value||'';el.classList.toggle('trip-error',value instanceof Error);};
  const friendly=error=>/route_finder_held:(.*)/.exec(error.message)?.[1]?.trim()?'The route finder is not available for this timetable week: '+/route_finder_held:(.*)/.exec(error.message)[1].trim():
    /fetch_failed|Failed to fetch|NetworkError/i.test(error.message)?'The timetable could not be loaded. Check your connection and try again.':'The search could not be completed ('+error.message+').';

  function ready(){
    if(summary)return Promise.resolve(summary);
    if(!opening){const started=performance.now();
      // The same form as the atlas loading cards (#521): MB of the total and seconds.
      let total=0,bytes=0;const mb=n=>(n/1e6).toFixed(1);
      const show=()=>{const el=$('tripLoading');if(!el)return;el.hidden=false;const s=Math.round((performance.now()-started)/1000);
        $('tripLoadingText').textContent=(total?mb(bytes)+' of '+mb(total)+' MB':mb(bytes)+' MB')+' · '+s+' s';
        $('tripLoadingBar').style.width=total?Math.min(100,100*bytes/total)+'%':'15%';
        el.setAttribute('role','progressbar');el.setAttribute('aria-valuetext',$('tripLoadingText').textContent);};
      const ticker=setInterval(show,500);
      progressListener=p=>{if(p.total)total=p.total;if(p.bytes!=null)bytes=p.bytes;show();};
      const done=()=>{clearInterval(ticker);progressListener=null;const el=$('tripLoading');if(el)el.hidden=true;};
      opening=call('open').finally(done).then(result=>{
      summary=result;const dates=result.dates||[];
      if(result.state!=='built'){$('tripWeek').textContent='The route finder is not available for this timetable week'+(result.reason?': '+result.reason:'.');$('tripSearch').disabled=true;return summary;}
      $('tripWeek').textContent='Timetable week '+dayLabel(dates[0])+' – '+dayLabel(dates[dates.length-1])+'. Times are local to each station.';
      $('tripDate').innerHTML=dates.map((iso,i)=>`<option value="${i}">${esc(dayLabel(iso))}</option>`).join('');
      const now=sharedNow();if(now.index>=0)$('tripDate').value=String(now.index);
      // Load the likely date while the form is filled in, and again when the date changes.
      call('prepare',now.index).catch(()=>{});
      $('tripDate').addEventListener('change',()=>call('prepare',Number($('tripDate').value)).catch(()=>{}));
      api.loaded?.(Math.round(performance.now()-started));
      return summary;}).catch(error=>{opening=null;status(error);throw error;});}
    return opening;
  }
  // Now on the shared clock; outside the week, the same weekday in the published week.
  function sharedNow(){
    const dates=summary.dates,minutes=Date.now()/60000+summary.clock.offsetMinutes,iso=new Date(minutes*60000).toISOString().slice(0,10);
    const exact=dates.indexOf(iso),weekday=new Date(iso+'T12:00:00Z').getUTCDay();
    const index=exact>=0?exact:dates.findIndex(d=>new Date(d+'T12:00:00Z').getUTCDay()===weekday);
    return{index,minute:Math.floor(minutes%1440),mapped:exact<0};
  }

  function query(){
    const when=$('tripWhen').value,f={eurailOnly:$('tripEurail').checked,noReservation:$('tripNoReservation').checked,noSupplement:$('tripNoSupplement').checked};
    let d,minutes,mapped=false;
    if(when==='now'){const now=sharedNow();d=now.index;minutes=now.minute;mapped=now.mapped;}
    else{d=Number($('tripDate').value);const[h,m]=($('tripTime').value||'08:00').split(':').map(Number);minutes=toShared(summary,(when==='arrive'?fields.to:fields.from).country,d,h*60+m);}
    const max=$('tripMax').value;
    return{date:d,from:[fields.from.index],to:[fields.to.index],via:fields.via?[{stations:[fields.via.index],stopover:Number($('tripStopover').value)}]:[],
      ...(when==='arrive'?{arriveBy:minutes}:{depart:minutes}),direct:$('tripDirect').checked,maxChanges:max===''?5:Number(max),minChange:Number($('tripChange').value),
      filters:f,_mapped:mapped,_when:when};
  }
  // extend: -1 adds earlier journeys before the list, 1 later ones after it.
  async function search(q=null,extend=0){
    try{await ready();}catch{return;}
    if(summary.state!=='built')return;
    if(!fields.from||!fields.to){status('Choose a From and a To station from the suggestions.');return;}
    if(fields.from.index===fields.to.index){status('From and To are the same station.');return;}
    q=q||query();
    status('Searching…');if(!extend){$('tripResults').innerHTML='';$('tripNotices').innerHTML='';$('tripPaging').hidden=true;}selected=-1;api.clearTrip();
    const before=extend&&last?last.journeys:[];
    const started=performance.now();
    try{const result=await call('route',q);
      if(extend){const seen=new Set(before.map(key));let added=result.journeys.filter(j=>!seen.has(key(j)));
        if(q.arriveBy==null&&added.length){added=await call('tightenAll',q,added);added=added.filter(j=>!seen.has(key(j)));}
        result.journeys=extend<0?[...added,...before]:[...before,...added];result.query={...q,_when:last.query._when,_mapped:last.query._mapped};
        if(!added.length)api.toast?.(extend<0?'No earlier journey in this timetable week.':'No later journey on this date.');}
      const current=last={...result,query:result.query||q,ms:Math.round(performance.now()-started)};render(last);if(!extend)saveTrip(q);api.searched?.(last.ms);
      // First answer shown at once; then each journey is refined to leave as late as it can for the same arrival.
      if(q.arriveBy==null&&result.journeys.length&&!extend){const refined=await call('tightenAll',q,result.journeys);
        if(last===current){current.journeys=refined;current.refinedMs=Math.round(performance.now()-started);if(selected<0)render(current);}}}
    catch(error){status(error);}
  }
  function saveTrip(q){
    Promise.all([call('stationIdsOf',[fields.from.index,fields.to.index,...(fields.via?[fields.via.index]:[])])]).then(([ids])=>{
      const local=q._when==='now'?null:summary.dates[q.date]+'T'+($('tripTime').value||'08:00');
      api.saveTrip({from:ids[0],to:ids[1],via:ids.slice(2),at:local,arriveBy:q._when==='arrive',direct:q.direct,maxChanges:$('tripMax').value===''?null:Number($('tripMax').value),
        minChange:q.minChange===5?null:q.minChange,filters:q.filters});
    }).catch(()=>{});
  }
  function sorted(journeys){
    const key=$('tripSort').value,list=[...journeys];
    if(key==='changes')list.sort((a,b)=>a.changes-b.changes||a.arr-b.arr);else if(key==='duration')list.sort((a,b)=>a.minutes-b.minutes||a.arr-b.arr);else list.sort((a,b)=>a.arr-b.arr||a.changes-b.changes);
    return list;
  }
  function render(result){
    shown=sorted(result.journeys);const q=result.query;
    const date=result.dateIso,base=dayLabel(date);
    status(shown.length?`${shown.length} journey${shown.length===1?'':'s'} · ${base}${q._mapped?' (the same weekday in the published timetable week)':''}`:'No journey found with these choices.');
    $('tripResults').innerHTML=shown.map((j,i)=>`<li class="trip-result"><button type="button" class="trip-summary" data-i="${i}" aria-expanded="false">
      <span class="trip-times"><strong>${j.depLocal.clock}${plus(j.depLocal)}</strong> → <strong>${j.arrLocal.clock}${plus(j.arrLocal)}</strong></span>
      <span class="trip-meta">${duration(j.minutes)} · ${j.changes?j.changes+' change'+(j.changes>1?'s':''):'direct'}${badges(j)}</span>
      <span class="trip-trains">${esc(j.legs.filter(l=>!l.stayOnBoard).map(l=>l.walk?'walk '+l.minutes+' min':l.label||l.line||l.operator).join(' · '))}</span></button>
      <div class="trip-detail" hidden></div></li>`).join('');
    $('tripResults').querySelectorAll('.trip-summary').forEach(button=>button.onclick=()=>choose(Number(button.dataset.i)));
    $('tripPaging').hidden=!shown.length;
    notices(result);
    // So choosing a journey draws at once: coordinates and ids now, and the first journey's legs looked up ahead.
    if(shown.length)call('warmDrawing').then(()=>call('legIdentities',shown[0].legs)).then(legs=>api.warmTrip?.(legs)).catch(()=>{});
    if(q._mapped&&q._when==='now')$('tripWeek').textContent='Timetable week '+dayLabel(summary.dates[0])+' – '+dayLabel(summary.dates[summary.dates.length-1])+'; showing '+base+' at the current time.';
  }
  const plus=t=>t.dayOffset>0?`<sup>+${t.dayOffset}</sup>`:t.dayOffset<0?`<sup>${t.dayOffset}</sup>`:'';
  function badges(j){
    const legs=j.legs.filter(l=>!l.walk),b=[];
    if(legs.some(l=>l.inclusion!=='included'))b.push(legs.some(l=>l.inclusion==='not_included')?'not all on Eurail':'Eurail status partly unknown');
    if(legs.some(l=>l.reservation==='required'))b.push('reservation');
    if(legs.some(l=>l.category==='night'))b.push('night train');
    return b.map(x=>` · <span class="trip-badge">${esc(x)}</span>`).join('');
  }
  async function choose(i){
    const items=$('tripResults').querySelectorAll('.trip-result');
    items.forEach((li,k)=>{const open=k===i&&selected!==i;li.querySelector('.trip-detail').hidden=!open;li.querySelector('.trip-summary').setAttribute('aria-expanded',String(open));li.classList.toggle('active',open);});
    if(selected===i){selected=-1;api.clearTrip();return;}
    selected=i;const j=shown[i],detail=items[i].querySelector('.trip-detail');detail.innerHTML=legsHTML(j);
    detail.querySelector('.trip-show-map').onclick=()=>api.showMap?.(j.legs[0].from.name+' → '+j.legs[j.legs.length-1].to.name);
    const note=document.createElement('p');note.className='helper trip-drawing';note.textContent='Preview: straight lines through the stops. Drawing the rail route…';detail.append(note);
    try{
      // At once: a preview through the stops; then the atlas's own geometry replaces it.
      const t0=performance.now(),points=await call('legPoints',j.legs);if(selected!==i)return;api.previewTrip?.(points);
      const t1=performance.now(),legs=await call('legIdentities',j.legs);if(selected===i)await api.drawTrip(legs,j);
      // Timings for the browser checks (docs/RAIL_ROUTE_FINDER.md).
      root.dataset.drawPreviewMs=String(Math.round(t1-t0));root.dataset.drawMapMs=String(Math.round(performance.now()-t0));}
    catch{api.toast?.('The journey could not be drawn on the map. Its times and stops are listed.');}
    finally{note.remove();}
  }
  function legsHTML(j){
    const out=[];let previous=null;
    for(const l of j.legs){
      if(l.walk){out.push(`<li class="trip-change trip-walk">Walk to ${esc(l.to.name)} · ${duration(l.minutes)} (reviewed footpath)</li>`);previous=l;continue;}
      if(previous&&!previous.walk&&!l.stayOnBoard)out.push(`<li class="trip-change">Change at ${esc(l.from.name)} · ${duration(l.dep-previous.arr)}</li>`);
      if(l.stayOnBoard)out.push(`<li class="trip-change trip-stay">Stay on board at ${esc(l.from.name)}: the train continues as ${esc(l.label||l.line)} (reviewed through-service)</li>`);
      const pass=[INCLUSION[l.inclusion],RESERVATION[l.reservation],SUPPLEMENT[l.supplement]].filter(Boolean).join(' · ');
      out.push(`<li class="trip-leg"><div class="trip-leg-head"><strong>${esc(l.label||l.line||'Train')}</strong> <span>${esc(l.operator)}</span></div>
        <div class="trip-leg-row"><b>${l.depLocal.clock}${plus(l.depLocal)}</b> ${esc(l.from.name)}${l.boardingNote?' <small>(request stop)</small>':''}</div>
        <div class="trip-leg-row"><b>${l.arrLocal.clock}${plus(l.arrLocal)}</b> ${esc(l.to.name)}${l.alightingNote?' <small>(request stop)</small>':''}</div>
        <div class="trip-leg-meta">${l.stops.length-2>0?(l.stops.length-2)+' stops between · ':''}${esc(pass)}</div></li>`);
      previous=l;
    }
    return`<ol class="trip-legs">${out.join('')}</ol><button type="button" class="primary-button trip-show-map">Show on map</button>`;
  }
  function notices(result){
    const n=result.notices,items=[];
    if(result.leftOut?.betterJourneysWithoutFilter)items.push(`${result.leftOut.betterJourneysWithoutFilter} faster or simpler journey${result.leftOut.betterJourneysWithoutFilter>1?'s':''} use trains your pass filter leaves out (status unknown, not included, or with a reservation or supplement). They are not shown.`);
    if(n.replacementBuses.length)items.push(`Replacement buses run at ${esc([...new Set(n.replacementBuses.map(b=>b.line).filter(Boolean))].slice(0,6).join(', ')||'these stations')} on this date (${esc([...new Set(n.replacementBuses.map(b=>b.operator).filter(Boolean))].slice(0,3).join(', '))}). Their times are not published, so they were not searched; a train shown here may be replaced by a bus.`);
    if(n.sourcesWithoutTimes.length)items.push(`${n.sourcesWithoutTimes.length} timetable source${n.sourcesWithoutTimes.length>1?'s':''} publish no times here and were not searched; journeys through those networks are not found. <button type="button" class="text-button" data-trip-coverage>Coverage ↗</button>`);
    if(result.lastDate)items.push('This is the last date of the timetable week: journeys continuing into the next day end at midnight of the week.');
    $('tripNotices').innerHTML=items.length?`<h4>Not included in this search</h4><ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul>`:'';
    $('tripNotices').querySelector('[data-trip-coverage]')?.addEventListener('click',()=>api.coverage?.());
  }
  function page(direction){
    if(!last||!shown.length)return;const q={...last.query};
    if(direction>0){delete q.arriveBy;q.depart=Math.max(...shown.map(j=>j.dep))+1;}
    else{delete q.depart;q.arriveBy=Math.min(...shown.map(j=>j.arr))-1;}
    search(q,direction);
  }

  async function open(prefill=null){
    if(!root.firstChild)shell();
    api.panel.hidden=false;
    const input=$('trip-from');
    try{await ready();}catch{return;}
    const trip=prefill||pendingPrefill;pendingPrefill=null;
    if(trip&&summary.state==='built'){
      const ids=[trip.from,trip.to,...(trip.via||[])].filter(Boolean),found=await call('resolveIds',ids);
      const by=new Map(ids.map((id,i)=>[id,found[i]]));
      if(trip.from)setStation('from',by.get(trip.from));if(trip.to)setStation('to',by.get(trip.to));if(trip.via?.[0])setStation('via',by.get(trip.via[0]));
      if(trip.at){const[date,time]=trip.at.split('T'),d=summary.dates.indexOf(date);if(d>=0){$('tripWhen').value=trip.arriveBy?'arrive':'depart';$('tripDate').value=String(d);$('tripTime').value=time;$('tripWhen').onchange();}}
      if(trip.direct)$('tripDirect').checked=true;if(Number.isInteger(trip.maxChanges))$('tripMax').value=String(trip.maxChanges);if(trip.minChange)$('tripChange').value=String(trip.minChange);
      const f=trip.filters||{};if(trip.filters){$('tripEurail').checked=!!f.eurailOnly;$('tripNoReservation').checked=!!f.noReservation;$('tripNoSupplement').checked=!!f.noSupplement;}
      if(trip.via?.length||f.eurailOnly||f.noReservation||f.noSupplement||Number.isInteger(trip.maxChanges)||trip.minChange)$('tripMore').open=true;
      moreSummary();
      if(fields.from&&fields.to&&trip.search!==false)search();else(fields.from?$('trip-to'):input).focus();
    }else if(!fields.from)input?.focus();
  }
  function close(){api.panel.hidden=true;api.clearTrip();api.saveTrip(null);}
  return{open,close,isOpen:()=>!api.panel.hidden,prefill:trip=>{pendingPrefill=trip;}};
}
