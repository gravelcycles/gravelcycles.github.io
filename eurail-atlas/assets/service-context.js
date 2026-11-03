import{selectedDays,escapeHTML as esc}from'./atlas-core.js?v=276a13428c88e502';

export function contextVisible(state){return state.closedCorridors!==false;}

export function noticeDates(notice,dates){
  const confirmed=dates.filter(day=>day>=notice.closedFrom&&day<=notice.closedThrough),
    uncertain=dates.filter(day=>(notice.uncertainBoundaryDates||[]).includes(day));
  return{confirmed,uncertain};
}

export function relevantNotices(summary,{zoom,bounds,dates,day='all',inspect=false}){
  if(summary?.schemaVersion!==1||!inspect&&zoom<(summary.minimumZoom||7)||!Array.isArray(bounds)||bounds.length!==4)return[];
  const selected=selectedDays(day,dates).map(index=>dates[index]);
  return(summary.notices||[]).filter(notice=>{
    const b=notice.bounds,overlap=Array.isArray(b)&&b.length===4&&b[2]>=bounds[0]&&b[0]<=bounds[2]&&b[3]>=bounds[1]&&b[1]<=bounds[3],
      status=noticeDates(notice,selected);
    return overlap&&(status.confirmed.length||status.uncertain.length);
  });
}

export function confirmedCorridorIds(summary,view){
  const selected=selectedDays(view.day||'all',view.dates).map(index=>view.dates[index]);
  return relevantNotices(summary,view).filter(notice=>noticeDates(notice,selected).confirmed.length).map(notice=>notice.id);
}

// Operator notices are an independent overlay. Service, fee, geometry and
// source filters cannot establish or remove a documented railway closure.
export function contextNotices(summary,state,view){
  return view&&contextVisible(state)?relevantNotices(summary,{...view,day:state.day,inspect:true}):[];
}

export function contextSummary(summary,state,view){
  const selected=view?selectedDays(state.day||'all',view.dates).map(index=>view.dates[index]):[],
    active=contextNotices(summary,state,view),
    available=view?relevantNotices(summary,{...view,bounds:[-180,-85,180,85],day:state.day,inspect:true}):[];
  return{enabled:contextVisible(state),available:available.length,inView:active.length,
    confirmed:active.filter(notice=>noticeDates(notice,selected).confirmed.length).length,
    uncertain:active.filter(notice=>{const status=noticeDates(notice,selected);return!status.confirmed.length&&status.uncertain.length;}).length,
    geometryAvailable:summary?.geometryAvailable===true};
}

const pretty=day=>new Date(day+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});

export function noticeHTML(notice,sources,selected){
  const status=noticeDates(notice,selected),boundary=notice.uncertainBoundaryDates||[],
    links=(notice.evidenceSourceIds||[]).map(id=>sources.find(source=>source.id===id)).filter(Boolean).flatMap(source=>{
      try{const url=new URL(source.url);return url.protocol==='https:'?[`<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(source.publisher)} · operator notice ↗</a>`]:[];}catch{return[];}
    }).join(''),section=notice.endpoints.map(point=>point.name).join('–');
  return`<article class="service-notice"><h4>${esc(section)}</h4><p class="service-notice-dates">${esc(pretty(notice.closedFrom))}–${esc(pretty(notice.closedThrough))} · ${esc(notice.operator)}</p>${status.confirmed.length?'<p>Train services are suspended over this section during the confirmed closure. The operator provides replacement buses; they are not counted as trains on this map.</p>':''}${notice.intermediateStopNames?.length?`<p>Section includes ${esc(notice.intermediateStopNames.join(', '))}.</p>`:''}${notice.unaffectedContext?`<p>${esc(notice.unaffectedContext)}</p>`:''}${notice.diversionContext?`<p>${esc(notice.diversionContext)}</p>`:''}${boundary.length?`<p class="service-notice-uncertain">The operator notice also mentions ${esc(boundary.map(pretty).join(', '))}. Resumption on that boundary date is uncertain; check the operator before travel.${status.uncertain.length&&!status.confirmed.length?' The selected date is on this uncertain boundary.':''}</p>`:''}<div class="service-notice-links">${links}</div></article>`;
}

export function setupServiceContext({getManifest,getState,getDates,getView,getMap,load,onChange=()=>{},onOpen=()=>{}}){
  const chip=document.getElementById('serviceContextToggle'),panel=document.getElementById('serviceContextPanel'),
    content=document.getElementById('serviceContextContent'),close=document.getElementById('closeServiceContext'),
    toggle=document.getElementById('showClosedCorridors'),explanation=document.getElementById('closedCorridorExplanation'),key=document.getElementById('closedCorridorKey');
  if(!chip||!panel||!content||!close)return{refresh(){},visibleCount(){return 0;},fitAll(){return false;},summary(){return contextSummary(getManifest()?.serviceContext,getState(),null);}};
  let documentData=null,promise=null,path=null,active=[],request=0,version=null,
    geometryData=null,geometryPromise=null,geometryVersion=null,geometryPath=null,layer=null,hitLayer=null,shownKey=null;
  function hide(focus=false){request++;panel.hidden=true;chip.setAttribute('aria-expanded','false');if(focus)(chip.getClientRects?.().length?chip:document.getElementById('controlsToggle'))?.focus();}
  function candidates(){const view=getView();return contextNotices(getManifest()?.serviceContext,getState(),view?{...view,dates:getDates()}:null);}
  function render(){
    if(!documentData)return;
    const selected=selectedDays(getState().day,getDates()).map(index=>getDates()[index]),ids=new Set(active.map(notice=>notice.id));
    content.innerHTML=documentData.closures.filter(notice=>ids.has(notice.id)).map(notice=>noticeHTML(notice,documentData.sources,selected)).join('')+`<p class="service-context-updated">Notices checked ${esc(pretty(documentData.checkedAt))}.</p>`;
    panel.setAttribute('aria-busy','false');
  }
  function clearGeometry(){if(layer){layer.clearLayers();hitLayer?.clearLayers();shownKey=null;}if(key)key.hidden=true;}
  function updateGeometry(){
    const manifest=getManifest(),map=getMap?.(),view=getView(),enabled=getState().closedCorridors!==false;
    if(toggle)toggle.checked=enabled;
    if(explanation)explanation.hidden=!manifest?.serviceContext?.geometryAvailable;
    if(!map||!view||!enabled||!active.length||!geometryPath){clearGeometry();return;}
    const ids=new Set(confirmedCorridorIds(manifest.serviceContext,{...view,dates:getDates(),day:getState().day,inspect:true}));
    if(!ids.size){clearGeometry();return;}
    if(!geometryData){
      if(!geometryPromise){const expected=geometryVersion;geometryPromise=load(geometryPath).then(data=>{
        if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw new Error('Invalid context geometry');
        if(expected===geometryVersion){geometryData=data;updateGeometry();}
      }).catch(()=>{if(expected===geometryVersion){geometryPromise=null;clearGeometry();}});}
      return;
    }
    const next=[...ids].sort().join('|');if(next===shownKey)return;
    if(!layer){
      const L=globalThis.L;if(!L)return;
      if(!map.getPane('closedRailContext'))map.createPane('closedRailContext').style.zIndex=360;
      // Leaflet's retained station-marker canvas occupies pane 400 even after
      // its markers are cleared. Put click targets above it and the rail canvas.
      if(!map.getPane('closedRailContextHits'))map.createPane('closedRailContextHits').style.zIndex=450;
      const onEachFeature=(feature,path)=>{
        path.bindTooltip('Temporarily closed rail corridor · inferred infrastructure',{sticky:true});
        path.on('click',event=>{if(event.originalEvent)L.DomEvent.stopPropagation(event.originalEvent);if(panel.hidden)open();else close.focus();});
      };
      layer=L.geoJSON(null,{pane:'closedRailContext',renderer:L.svg({pane:'closedRailContext'}),
        style:{color:'#686f7c',weight:2.8,opacity:.9,dashArray:'6 5',lineCap:'round'},
        interactive:false}).addTo(map);
      // A continuous invisible stroke makes dash gaps and thin sections easy
      // to click/tap without changing the visible railway geometry.
      hitLayer=L.geoJSON(null,{pane:'closedRailContextHits',renderer:L.svg({pane:'closedRailContextHits'}),
        style:{color:'#686f7c',weight:14,opacity:0,dashArray:null},
        bubblingMouseEvents:false,onEachFeature}).addTo(map);
    }
    const data={...geometryData,features:geometryData.features.filter(feature=>ids.has(feature.properties?.notice_id))};
    layer.clearLayers();hitLayer.clearLayers();layer.addData(data);hitLayer.addData(data);shownKey=next;
    if(key)key.hidden=!layer.getLayers().length;
  }
  function refresh(){
    const manifest=getManifest(),next=manifest?.files?.serviceContext;
    const revision=manifest?.assets?.[manifest?.assetPaths?.[next]||next]?.sha256;
    if(next!==path||revision!==version){path=next;version=revision;documentData=null;promise=null;hide();}
    const nextGeometry=manifest?.files?.serviceContextGeometry,
      nextVersion=manifest?.assets?.[manifest?.assetPaths?.[nextGeometry]||nextGeometry]?.sha256;
    if(nextGeometry!==geometryPath||nextVersion!==geometryVersion){geometryPath=nextGeometry;geometryVersion=nextVersion;geometryData=null;geometryPromise=null;clearGeometry();}
    active=candidates();chip.hidden=!active.length;
    const title='Affected railways in this area';
    chip.querySelector('span').textContent=active.length>1?`${title} · ${active.length}`:title;
    const heading=document.getElementById('serviceContextTitle');if(heading)heading.textContent=title;
    if(!active.length)hide();else if(!panel.hidden)render();updateGeometry();
  }
  async function open(){
    refresh();if(chip.hidden)return;
    if(!panel.hidden){hide(true);return;}
    onOpen();
    const ticket=++request;panel.hidden=false;chip.setAttribute('aria-expanded','true');panel.setAttribute('aria-busy','true');
    content.innerHTML='<p>Reading the dated operator notices…</p>';close.focus();
    try{
      if(!promise){const expected=version;promise=load(path).then(data=>{if(data.schemaVersion!==1||!Array.isArray(data.closures)||!Array.isArray(data.sources))throw new Error('Invalid service context');if(expected===version)documentData=data;return data;}).catch(error=>{if(expected===version)promise=null;throw error;});}
      await promise;if(ticket===request&&!panel.hidden){active=candidates();if(active.length)render();else hide();}
    }catch{if(ticket===request&&!panel.hidden){panel.setAttribute('aria-busy','false');content.innerHTML='<p>The operator notices could not load. Close and reopen this panel to retry. No service conclusion has been made.</p>';}}
  }
  chip.onclick=open;close.onclick=()=>hide(true);
  if(toggle)toggle.onchange=()=>{getState().closedCorridors=toggle.checked;refresh();onChange();};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden&&(panel.contains(document.activeElement)||chip===document.activeElement)){event.stopPropagation();event.preventDefault();hide(true);}},true);
  function summary(){const view=getView();return contextSummary(getManifest()?.serviceContext,getState(),view?{...view,dates:getDates()}:null);}
  function visibleCount(){const current=summary();return current.geometryAvailable?current.confirmed:0;}
  function fitAll(){
    const state=getState(),selected=selectedDays(state.day,getDates()).map(index=>getDates()[index]),notices=(getManifest()?.serviceContext?.notices||[]).filter(notice=>noticeDates(notice,selected).confirmed.length&&Array.isArray(notice.bounds)&&notice.bounds.length===4&&notice.bounds.every(Number.isFinite)),bounds=notices.flatMap(notice=>[[notice.bounds[1],notice.bounds[0]],[notice.bounds[3],notice.bounds[2]]]);
    if(!bounds.length)return false;
    getMap()?.fitBounds(bounds,{padding:[45,130],maxZoom:10});return true;
  }
  return{refresh,visibleCount,fitAll,summary};
}
