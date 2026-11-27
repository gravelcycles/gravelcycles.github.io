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
    const url=new URL('./route-finder-worker.js?v=bd769551cdd0b233',import.meta.url);url.search=new URL(import.meta.url).search;
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
  if(!document.querySelector('link[data-trip-planner]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./route-finder.css?v=bd769551cdd0b233',import.meta.url).href;link.dataset.tripPlanner='';document.head.append(link);}
  const root=api.body;let summary=null,opening=null,last=null,shown=[],selected=-1,pendingPrefill=null;
  const $=id=>root.querySelector('#'+id);
  const fields={from:null,to:null};
  // Stops on the way (owner, 27 Nov: "multiple via intermediate stops? a la sbb
  // app"): up to MAX_VIAS, in order, each a city or station with an optional
  // stay; fields['v' + id] holds the place, `vias` the ids in travel order.
  const MAX_VIAS=4,STAYS=[[0,'no stop'],[30,'30 min'],[60,'1 h'],[120,'2 h'],[240,'4 h'],[480,'8 h'],[1440,'1 day']];
  let vias=[],viaSeq=0;

  function shell(){
    root.innerHTML=`<h3 id="tripTitle">Plan a trip</h3>
<p class="helper trip-week" id="tripWeek">Loading the timetable…</p>
<div class="trip-loading" id="tripLoading" hidden><span class="loading-track"><i id="tripLoadingBar"></i></span><span id="tripLoadingText" aria-hidden="true"></span></div>
<form id="tripForm" class="trip-form" autocomplete="off" novalidate>
 ${stationField('from','From')}
 <ol class="trip-vias" id="tripVias" aria-label="Stops on the way"></ol>
 <div class="trip-between"><button type="button" class="text-button trip-add-via" id="tripAddVia">+ Add a stop on the way</button><button type="button" class="text-button trip-swap" id="tripSwap" aria-label="Swap From and To">⇅ Swap</button></div>
 ${stationField('to','To')}
 <div class="trip-when"><label for="tripWhen">When</label><select id="tripWhen"><option value="now">Leave now</option><option value="depart">Depart at</option><option value="arrive">Arrive by</option></select>
  <select id="tripDate" aria-label="Date" hidden></select><input id="tripTime" type="time" aria-label="Time, local to the station" hidden></div>
 <label class="trip-check"><input type="checkbox" id="tripDirect"> Direct trains only</label>
 <details class="trip-more" id="tripMore"><summary>More options<span id="tripMoreSummary"></span></summary>
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
    // Swapping reverses the journey: From and To, and the stops on the way.
    $('tripSwap').onclick=()=>{const a=fields.from,b=fields.to;setStation('from',b);setStation('to',a);
      vias.reverse();for(const id of vias)$('tripVias').append(viaItem(id));viaChanged();};
    $('tripAddVia').onclick=()=>{const key=addVia();if(key)$('trip-'+key).focus();};
    $('tripVias').addEventListener('click',event=>{const button=event.target.closest('button[data-act]');if(!button)return;
      const li=button.closest('li'),id=Number(li.dataset.via),i=vias.indexOf(id);
      if(button.dataset.act==='remove'){removeVia(id);const next=$('tripVias').children[Math.min(i,vias.length-1)];(next?.querySelector('input')||$('tripAddVia')).focus();return;}
      const j=i+(button.dataset.act==='up'?-1:1);if(j<0||j>=vias.length)return;
      [vias[i],vias[j]]=[vias[j],vias[i]];for(const v of vias)$('tripVias').append(viaItem(v));viaChanged();
      // Keep the focus on the moved stop's button (or its other one at the ends).
      const same=li.querySelector(`button[data-act="${button.dataset.act}"]`);(same.disabled?li.querySelector('button[data-act="'+(button.dataset.act==='up'?'down':'up')+'"]'):same).focus();});
    $('tripWhen').onchange=()=>{const now=$('tripWhen').value==='now';$('tripDate').hidden=now;$('tripTime').hidden=now;};
    $('tripForm').onsubmit=event=>{event.preventDefault();search();};
    $('tripEarlier').onclick=()=>page(-1);$('tripLater').onclick=()=>page(1);
    $('tripSort').onchange=()=>{if(last)render(last);};
    $('tripMore').addEventListener('toggle',moreSummary);root.addEventListener('change',moreSummary);
  }
  const stationField=(key,label)=>`<div class="trip-station"><label for="trip-${key}">${label}</label><input id="trip-${key}" type="search" placeholder="City or station" spellcheck="false" role="combobox" aria-autocomplete="list" aria-controls="trip-${key}-list" aria-expanded="false"><ul class="suggestions" id="trip-${key}-list" role="listbox" hidden></ul></div>`;
  function moreSummary(){
    const parts=[];if($('tripMax').value!=='')parts.push('≤ '+$('tripMax').value+' changes');
    if($('tripChange').value!=='5')parts.push($('tripChange').value+' min changes');
    if($('tripEurail').checked)parts.push('Eurail only');if($('tripNoReservation').checked)parts.push('no reservation');if($('tripNoSupplement').checked)parts.push('no supplement');
    if($('tripSort').value!=='arrival')parts.push('sorted by '+$('tripSort').selectedOptions[0].text);
    $('tripMoreSummary').textContent=parts.length?': '+parts.join(', '):'';
  }
  function setStation(key,s){fields[key]=s||null;const input=$('trip-'+key);if(input)input.value=s?s.name+(s.city?' (all stations)':''):'';moreSummary();}
  // A place is a station or a city (all its stations, searched together).
  const stationsOf=place=>place?(place.city?place.stations:[place.index]):[];
  const viaItem=id=>$('tripVias').querySelector(`li[data-via="${id}"]`);
  function addVia(place=null,stay=0){
    if(vias.length>=MAX_VIAS)return null;
    const id=++viaSeq,key='v'+id;vias.push(id);fields[key]=null;
    const li=document.createElement('li');li.className='trip-via';li.dataset.via=String(id);
    li.innerHTML=stationField(key,'Via')+`<div class="trip-via-tools"><label>Stay <select class="trip-stay" id="trip-${key}-stay">${STAYS.map(([m,t])=>`<option value="${m}"${m===stay?' selected':''}>${t}</option>`).join('')}</select></label>
<span class="trip-via-move"><button type="button" class="icon-button" data-act="up">↑</button><button type="button" class="icon-button" data-act="down">↓</button><button type="button" class="icon-button" data-act="remove">×</button></span></div>`;
    $('tripVias').append(li);wireStation(key);if(place)setStation(key,place);viaChanged();return key;
  }
  function removeVia(id){vias=vias.filter(v=>v!==id);delete fields['v'+id];viaItem(id)?.remove();viaChanged();}
  // Numbers, button states and labels follow the order.
  function viaChanged(){
    vias.forEach((id,n)=>{const li=viaItem(id),k=n+1;li.querySelector('label[for]').textContent=vias.length>1?'Via '+k:'Via';
      const[up,down,remove]=li.querySelectorAll('button[data-act]');up.disabled=n===0;down.disabled=n===vias.length-1;
      up.setAttribute('aria-label',`Move via ${k} earlier`);down.setAttribute('aria-label',`Move via ${k} later`);remove.setAttribute('aria-label',`Remove via ${k}`);
      li.querySelector('.trip-stay').setAttribute('aria-label',`Stay at via ${k}`);});
    $('tripAddVia').hidden=vias.length>=MAX_VIAS;
  }
  // The stops on the way in order: {place, stay, typed} (typed: text not picked from the suggestions).
  const viaList=()=>vias.map(id=>({place:fields['v'+id],stay:Number($('trip-v'+id+'-stay').value),typed:!fields['v'+id]&&!!$('trip-v'+id).value.trim()}));
  function wireStation(key){
    const input=$('trip-'+key),list=$('trip-'+key+'-list');let timer=0,options=[],active=-1;
    const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');active=-1;};
    const show=()=>{list.innerHTML=options.map((s,i)=>`<li role="option" id="trip-${key}-o${i}" aria-selected="${i===active}" data-i="${i}">${s.city?'<span><b>'+esc(s.name)+'</b>'+(s.localName?' ('+esc(s.localName)+')':'')+' · all '+s.count+' stations</span>':esc(s.name)}<small>${esc(s.country)}</small></li>`).join('');
      // Nothing matches: say so (a place may be missing because its trains publish no times), never an empty list.
      const typed=input.value.trim();
      if(!options.length&&typed.length>=3){const n=summary.sourcesWithoutTimes.length;list.innerHTML=`<li class="trip-none" aria-disabled="true">No city or station called “${esc(typed)}” has timed trains in this week's timetable.${n?` ${n} timetable source${n>1?'s':''} publish no times and are not searched (see Coverage).`:''}</li>`;list.hidden=false;input.setAttribute('aria-expanded','false');return;}
      list.hidden=!options.length;input.setAttribute('aria-expanded',String(!!options.length));};
    const pick=i=>{setStation(key,options[i]);close();};
    input.addEventListener('input',()=>{fields[key]=null;clearTimeout(timer);const q=input.value;if(q.trim().length<2){options=[];close();return;}
      timer=setTimeout(async()=>{try{await ready();options=await call('searchPlaces',q,8);active=-1;show();}catch(error){status(error);}},120);});
    input.addEventListener('keydown',event=>{if(list.hidden)return;if(!options.length){if(event.key==='Escape'){event.stopPropagation();close();}return;}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();active=(active+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;show();input.setAttribute('aria-activedescendant','trip-'+key+'-o'+active);}
      else if(event.key==='Enter'&&active>=0){event.preventDefault();pick(active);}else if(event.key==='Escape'){event.stopPropagation();close();}});
    list.addEventListener('mousedown',event=>{const li=event.target.closest('li');if(li&&li.dataset.i!==undefined){event.preventDefault();pick(Number(li.dataset.i));}});
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
    return{date:d,from:stationsOf(fields.from),to:stationsOf(fields.to),via:viaList().filter(v=>v.place).map(v=>({stations:stationsOf(v.place),stopover:v.stay})),
      ...(when==='arrive'?{arriveBy:minutes}:{depart:minutes}),direct:$('tripDirect').checked,maxChanges:max===''?null:Number(max),minChange:Number($('tripChange').value),
      filters:f,_mapped:mapped,_when:when};
  }
  // extend: -1 adds earlier journeys before the list, 1 later ones after it.
  async function search(q=null,extend=0){
    try{await ready();}catch{return;}
    if(summary.state!=='built')return;
    if(!fields.from||!fields.to){status('Choose a From and a To city or station from the suggestions.');return;}
    {const to=new Set(stationsOf(fields.to));if(stationsOf(fields.from).some(i=>to.has(i))){status(fields.from.city||fields.to.city?'From and To share a station: choose a station of the city instead.':'From and To are the same station.');return;}}
    {const list=viaList();if(list.some(v=>v.typed)){status('Choose each stop on the way from the suggestions, or remove it.');return;}
     // A stop on the way is somewhere else: not the From or To, and not the stop before it.
     const places=[fields.from,...list.filter(v=>v.place).map(v=>v.place),fields.to];
     for(let n=1;n<places.length;n++){const a=new Set(stationsOf(places[n-1]));if(stationsOf(places[n]).some(i=>a.has(i))){status(`${places[n-1].name} and ${places[n].name} share a station: a stop on the way must be somewhere else.`);return;}}
     const ends=new Set([...stationsOf(fields.from),...stationsOf(fields.to)]);if(list.some(v=>v.place&&stationsOf(v.place).some(i=>ends.has(i)))){status('A stop on the way cannot be the From or To.');return;}}
    q=q||query();
    status('Searching…');if(!extend){$('tripResults').innerHTML='';$('tripNotices').innerHTML='';$('tripPaging').hidden=true;}selected=-1;api.clearTrip();
    const before=extend&&last?last.journeys:[];
    const started=performance.now();
    try{const result=await call('route',q);
      // A long journey found with more trains than the default: the rest of the day uses the same limit.
      if(result.longer&&!extend)result.query={...q,maxChanges:result.longer.maxChanges};
      const multiDay=result.longer?.days==='multi';
      if(extend){const seen=new Set(before.map(key));let added=result.journeys.filter(j=>!seen.has(key(j)));
        if(q.arriveBy==null&&added.length){added=await call('tightenAll',q,added);added=added.filter(j=>!seen.has(key(j)));}
        result.journeys=extend<0?[...added,...before]:[...before,...added];result.query={...q,_when:last.query._when,_mapped:last.query._mapped};
        if(!added.length)api.toast?.(extend<0?'No earlier journey in this timetable week.':'No later journey on this date.');}
      const current=last={...result,query:result.query||q,ms:Math.round(performance.now()-started)};render(last);if(!extend)saveTrip(q);api.searched?.(last.ms);
      // First answer shown at once; then each journey is refined to leave as late as it can for the same arrival.
      // A journey over several days (dates d + 2 and d + 3) is shown as found: no day list or refinement on date d alone.
      if(q.arriveBy==null&&result.journeys.length&&!extend&&!multiDay){const refined=await call('tightenAll',current.query,result.journeys);
        if(last===current){current.journeys=refined;current.refinedMs=Math.round(performance.now()-started);if(selected<0)render(current);}}
      if(q.arriveBy==null&&!extend&&last===current&&!multiDay)await fillDay(current);}
    catch(error){status(error);}
  }
  // The whole day (owner, 27 Nov: "show all routes for the selected day"):
  // after the first answer, the date's other departures fill in a few at a
  // time, the next ones first, then the earlier ones, which are greyed.
  const dayKey=j=>j.dep+'|'+j.arr+'|'+j.trains;
  function merge(current,journeys){
    const all=[...current.journeys];
    for(const j of journeys){
      // A later departure with the same arrival and no more trains replaces an earlier one.
      const i=all.findIndex(x=>x.arr===j.arr&&x.trains>=j.trains&&x.dep<=j.dep);
      if(i>=0){if(dayKey(all[i])!==dayKey(j))all[i]=j;continue;}
      if(!all.some(x=>x.arr<=j.arr&&x.trains<=j.trains&&x.dep>=j.dep))all.push(j);
    }
    current.journeys=all;
  }
  async function fillDay(current){
    const q=current.query,start=toShared(summary,fields.from.country,q.date,0),end=start+1440,t0=performance.now();
    current.filling=true;delete root.dataset.dayFilledMs;
    for(const[a,b]of[[Math.max(start,q.depart),end],[start,Math.min(end,q.depart)]]){
      let t=a;
      while(t<b){
        let part;try{part=await call('sweep',q,t,b,1);}catch{current.filling=false;return;}
        if(last!==current)return;
        merge(current,part.journeys);t=part.next;
        render(current);
      }
    }
    current.filling=false;if(last===current)render(current);
    root.dataset.dayFilledMs=String(Math.round(performance.now()-t0)); // for the browser checks
  }
  function saveTrip(q){
    // A city is linked by its city id, a station by its canonical id.
    const stops=viaList().filter(v=>v.place),places=[fields.from,fields.to,...stops.map(v=>v.place)];
    call('stationIdsOf',places.map(p=>p.city?0:p.index)).then(found=>places.map((p,i)=>p.city?p.id:found[i])).then(ids=>{
      const local=q._when==='now'?null:summary.dates[q.date]+'T'+($('tripTime').value||'08:00');
      api.saveTrip({from:ids[0],to:ids[1],via:ids.slice(2),viaStay:stops.map(v=>v.stay),at:local,arriveBy:q._when==='arrive',direct:q.direct,maxChanges:$('tripMax').value===''?null:Number($('tripMax').value),
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
    status(shown.length?`${shown.length} journey${shown.length===1?'':'s'} · ${base}${q._mapped?' (the same weekday in the published timetable week)':''}${result.longer?.days==='multi'?' · over several days, waits included':''}${result.filling?' · finding the rest of the day…':''}`:result.filling?'Searching the day…':whyNone(result));
    // Keep what the visitor is looking at in place while earlier journeys are added above it.
    const list=$('tripResults'),scroller=scrollParent(list),anchor=list.querySelector('.trip-next')||list.querySelector('.trip-result');
    const anchorKey=anchor?.dataset.key,anchorTop=anchor?anchor.getBoundingClientRect().top:0;
    const next=q.arriveBy==null?shown.findIndex(j=>j.dep>=q.depart):-1,cities=q.from.length>1||q.to.length>1;
    // Cards are kept by journey (key): new ones are inserted in place and only
    // their past/next state changes, so an open journey stays open and the
    // list does not jump or repaint while the rest of the day fills in.
    const existing=new Map([...list.children].map(li=>[li.dataset.key,li]));
    const openKey=selected>=0?list.children[selected]?.dataset.key:null;
    shown.forEach((j,i)=>{
      const k=key(j);let li=existing.get(k);existing.delete(k);
      if(!li){const t=document.createElement('template');t.innerHTML=card(j,cities);li=t.content.firstElementChild;li.dataset.key=k;
        li.querySelector('.trip-summary').onclick=()=>choose([...list.children].indexOf(li));}
      li.querySelector('.trip-summary').dataset.i=String(i);
      li.classList.toggle('trip-past',q.arriveBy==null&&j.dep<q.depart);li.classList.toggle('trip-next',i===next);
      if(list.children[i]!==li)list.insertBefore(li,list.children[i]||null);
    });
    for(const li of existing.values())li.remove();
    selected=openKey?[...list.children].findIndex(li=>li.dataset.key===openKey):-1;
    // The open journey was replaced (a later departure with the same arrival): clear its drawing too.
    if(openKey&&selected<0)api.clearTrip();
    const same=anchorKey&&list.querySelector(`[data-key="${anchorKey}"]`);
    if(same&&scroller)scroller.scrollTop+=same.getBoundingClientRect().top-anchorTop;
    // Once per search: bring the next departure into view when earlier ones are above it.
    if(next>0&&!result.scrolled){result.scrolled=true;list.children[next].scrollIntoView({block:'center',behavior:'auto'});} // instant: a smooth scroll would be cut short by the anchoring of the next chunk
    $('tripPaging').hidden=!shown.length;
    notices(result);
    // So choosing a journey draws at once: coordinates and ids now, and the first journey's legs looked up ahead.
    if(shown.length&&!result.warmed&&(result.warmed=true))call('warmDrawing').then(()=>call('legIdentities',shown[0].legs)).then(legs=>api.warmTrip?.(legs)).catch(()=>{});
    if(q._mapped&&q._when==='now')$('tripWeek').textContent='Timetable week '+dayLabel(summary.dates[0])+' – '+dayLabel(summary.dates[summary.dates.length-1])+'; showing '+base+' at the current time.';
  }
  function scrollParent(el){for(let e=el.parentElement;e;e=e.parentElement){const y=getComputedStyle(e).overflowY;if((y==='auto'||y==='scroll')&&e.scrollHeight>e.clientHeight)return e;}return document.scrollingElement;}
  function card(j,cities){
    return`<li class="trip-result"><button type="button" class="trip-summary" aria-expanded="false">
      <span class="trip-times"><strong>${j.depLocal.clock}${plus(j.depLocal)}</strong> → <strong>${j.arrLocal.clock}${plus(j.arrLocal)}</strong></span>
      ${cities?`<span class="trip-ends">${esc(j.legs[0].from.name)} → ${esc(j.legs[j.legs.length-1].to.name)}</span>`:''}
      <span class="trip-meta">${duration(j.minutes)} · ${j.changes?j.changes+' change'+(j.changes>1?'s':''):'direct'}${badges(j)}</span>
      <span class="trip-trains">${esc(j.legs.filter(l=>!l.stayOnBoard).map(l=>l.walk?'walk '+l.minutes+' min':l.label||l.line||l.operator).join(' · '))}</span></button>
      <div class="trip-detail" hidden></div></li>`;
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
    // Each leg's calls and times, loaded when first opened.
    detail.querySelectorAll('.trip-stops-toggle').forEach(button=>button.onclick=async event=>{
      event.stopPropagation();const list=button.closest('.trip-leg').querySelector('.trip-calls'),open=list.hidden;
      button.setAttribute('aria-expanded',String(open));list.hidden=!open;if(!open||list.childElementCount)return;
      try{const calls=await call('legStops',j.legs[Number(button.dataset.leg)]);
        list.innerHTML=calls.slice(1,-1).map(c=>`<li><span class="trip-call-time"><b>${c.arrLocal?c.arrLocal.clock+plus(c.arrLocal):''}</b>${c.depLocal&&c.arrLocal&&c.depLocal.clock!==c.arrLocal.clock?`<span class="trip-call-dep">${c.depLocal.clock}</span>`:''}</span><span>${esc(c.station.name)}${!c.pickup&&!c.dropOff?' <small>(no boarding or alighting)</small>':!c.pickup?' <small>(set down only)</small>':!c.dropOff?' <small>(pick up only)</small>':c.request?' <small>(request stop)</small>':''}</span></li>`).join('');}
      catch{list.innerHTML='<li>The stops could not be loaded.</li>';}});
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
        <div class="trip-leg-meta">${l.stops.length-2>0?`<button type="button" class="trip-stops-toggle" data-leg="${j.legs.indexOf(l)}" aria-expanded="false">${l.stops.length-2} stop${l.stops.length-2>1?'s':''} between</button> · `:''}${esc(pass)}</div>
        <ol class="trip-calls" hidden></ol></li>`);
      previous=l;
    }
    return`<ol class="trip-legs">${out.join('')}</ol><button type="button" class="primary-button trip-show-map">Show on map</button>`;
  }
  // Why nothing was found (the service's noJourney, from the week's timetable
  // whatever the times): owner, 27 Nov, "say why instead of showing an empty result".
  function whyNone(result){
    const why=result.noJourney,names=[fields.from,...viaList().filter(v=>v.place).map(v=>v.place),fields.to].map(p=>p?.name||'');
    const list=items=>items.length>1?items.slice(0,-1).join(', ')+' and '+items.at(-1):items[0]||'';
    const notSearched=' Ferries, buses and trains without published times are not searched.';
    if(!why)return'No journey found with these choices.';
    if((why.reason==='not_connected'||why.reason==='via_not_connected')&&why.gap)return gapText(why.gap,names[why.part],names[why.part+1])+notSearched;
    if(why.reason==='not_connected'||why.reason==='via_not_connected'){
      const a=names[why.part],b=names[why.part+1],parts=[`No timed train links ${a} and ${b} in this week's timetable.`];
      if(why.fromCountries.length&&why.fromCountries.length<=3)parts.push(`Trains from ${a} reach only ${list(why.fromCountries)}.`);
      if(why.toCountries.length&&why.toCountries.length<=3)parts.push(`${b} is reached only from ${list(why.toCountries)}.`);
      return parts.join(' ')+notSearched;}
    if(why.reason==='filter')return'Only trains your pass filter leaves out connect these places (status unknown, not included, or with a reservation or supplement). Clear the filter to see them.';
    if(why.reason==='more_changes')return`Journeys whose first train leaves within 24 hours of this time need at least ${why.fewestTrains} trains (${why.fewestTrains-1} change${why.fewestTrains>2?'s':''}): allow more changes${$('tripDirect').checked?' or untick Direct only':''}.`;
    if(why.reason==='not_in_dates')return`This week's trains link these places, but no journey leaving on ${dayLabel(result.dateIso)} arrives by the end of ${dayLabel(why.lastSearchedDate)}${why.lastSearchedDate===summary.dates.at(-1)?', the last date of this timetable week':''}: try another date or time.`;
    return'No journey found with these choices.';
  }
  // The missing stretch (owner, 27 Nov: "tell which chunk of track is missing"):
  // the closest stations on each side, by distance. Worded as a gap in this
  // week's timetable, never as a railway: the distance is as the crow flies.
  function gapText(gap,a,b){
    const F=gap.from.name,T=gap.to.name,reach=[F!==a?`You can reach ${F} from ${a}`:'',T!==b?`${b} from ${T}`:''].filter(Boolean).join(', and ');
    const lead=reach?reach+', but ':'';let text;
    if(gap.separateStations)text=`${lead}${F} and ${T} are listed as separate stations ${Math.round(gap.km*1000)} m apart in this week's timetable, and no reviewed walk or shared station record joins them.`;
    else if(gap.km<=60)text=`${lead}this week's timetable has no train between ${F} and ${T} (${gap.km} km apart as the crow flies).`;
    else text=`${lead}${F} and ${T} are the closest stations on each side, ${Math.round(gap.km)} km apart as the crow flies: no train in this week's timetable links the two networks.`;
    text=text.charAt(0).toUpperCase()+text.slice(1);
    if(gap.replacementBuses.length)text+=` Replacement buses without published times run at one end (${[...new Set(gap.replacementBuses)].slice(0,4).join(', ')}).`;
    if(gap.sourcesWithoutTimes.length)text+=` ${gap.sourcesWithoutTimes.length} timetable source${gap.sourcesWithoutTimes.length>1?'s':''} for ${[...new Set([gap.from.country,gap.to.country])].join(' or ')} publish${gap.sourcesWithoutTimes.length>1?'':'es'} no times this week, so ${gap.sourcesWithoutTimes.length>1?'their':'its'} trains are not searched.`;
    return text;
  }
  function notices(result){
    const n=result.notices,items=[];
    // No journey across a gap: offer to show it, labelled as a gap (never a train or railway).
    const gap=!result.journeys.length&&result.noJourney?.gap;
    const gapButton=gap?`<p class="trip-gap"><button type="button" class="text-button" data-trip-gap>Show the gap on the map</button><small>A red dashed line between ${esc(gap.from.name)} and ${esc(gap.to.name)}: a gap in this week's timetable, not a train or a railway.</small></p>`:'';
    if(result.leftOut?.betterJourneysWithoutFilter)items.push(`${result.leftOut.betterJourneysWithoutFilter} faster or simpler journey${result.leftOut.betterJourneysWithoutFilter>1?'s':''} use trains your pass filter leaves out (status unknown, not included, or with a reservation or supplement). They are not shown.`);
    if(n.replacementBuses.length)items.push(`Replacement buses run at ${esc([...new Set(n.replacementBuses.map(b=>b.line).filter(Boolean))].slice(0,6).join(', ')||'these stations')} on this date (${esc([...new Set(n.replacementBuses.map(b=>b.operator).filter(Boolean))].slice(0,3).join(', '))}). Their times are not published, so they were not searched; a train shown here may be replaced by a bus.`);
    if(n.sourcesWithoutTimes.length)items.push(`${n.sourcesWithoutTimes.length} timetable source${n.sourcesWithoutTimes.length>1?'s':''} publish no times here and were not searched; journeys through those networks are not found. <button type="button" class="text-button" data-trip-coverage>Coverage ↗</button>`);
    if(result.lastDate)items.push('This is the last date of the timetable week: journeys continuing into the next day end at midnight of the week.');
    $('tripNotices').innerHTML=gapButton+(items.length?`<h4>Not included in this search</h4><ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul>`:'');
    $('tripNotices').querySelector('[data-trip-gap]')?.addEventListener('click',()=>{api.drawGap?.({points:gap.points,from:gap.from.name,to:gap.to.name});
      if(matchMedia('(max-width:600px)').matches)api.showMap?.('Gap in this week\'s timetable');});
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
      if(trip.from)setStation('from',by.get(trip.from));if(trip.to)setStation('to',by.get(trip.to));
      // The link's stops on the way replace any typed before (unknown ids are dropped).
      for(const id of[...vias])removeVia(id);(trip.via||[]).forEach((id,n)=>{if(by.get(id))addVia(by.get(id),(trip.viaStay||[])[n]||0);});
      if(trip.at){const[date,time]=trip.at.split('T'),d=summary.dates.indexOf(date);if(d>=0){$('tripWhen').value=trip.arriveBy?'arrive':'depart';$('tripDate').value=String(d);$('tripTime').value=time;$('tripWhen').onchange();}}
      if(trip.direct)$('tripDirect').checked=true;if(Number.isInteger(trip.maxChanges))$('tripMax').value=String(trip.maxChanges);if(trip.minChange)$('tripChange').value=String(trip.minChange);
      const f=trip.filters||{};if(trip.filters){$('tripEurail').checked=!!f.eurailOnly;$('tripNoReservation').checked=!!f.noReservation;$('tripNoSupplement').checked=!!f.noSupplement;}
      if(f.eurailOnly||f.noReservation||f.noSupplement||Number.isInteger(trip.maxChanges)||trip.minChange)$('tripMore').open=true;
      moreSummary();
      if(fields.from&&fields.to&&trip.search!==false)search();else(fields.from?$('trip-to'):input).focus();
    }else if(!fields.from)input?.focus();
  }
  function close(){api.panel.hidden=true;api.clearTrip();api.saveTrip(null);}
  return{open,close,isOpen:()=>!api.panel.hidden,prefill:trip=>{pendingPrefill=trip;}};
}
