import{selectedDays,escapeHTML as esc}from'./atlas-core.js?v=2f8afe3c193b9e7c';

export function noticeDates(notice,dates){
  const confirmed=dates.filter(day=>day>=notice.closedFrom&&day<=notice.closedThrough),
    uncertain=dates.filter(day=>(notice.uncertainBoundaryDates||[]).includes(day));
  return{confirmed,uncertain};
}

export function relevantNotices(summary,{zoom,bounds,dates,day='all'}){
  if(summary?.schemaVersion!==1||zoom<(summary.minimumZoom||7)||!Array.isArray(bounds)||bounds.length!==4)return[];
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

const pretty=day=>new Date(day+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});

export function noticeHTML(notice,sources,selected){
  const status=noticeDates(notice,selected),boundary=notice.uncertainBoundaryDates||[],
    links=(notice.evidenceSourceIds||[]).map(id=>sources.find(source=>source.id===id)).filter(Boolean).flatMap(source=>{
      try{const url=new URL(source.url);return url.protocol==='https:'?[`<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(source.publisher)} · operator notice ↗</a>`]:[];}catch{return[];}
    }).join(''),section=notice.endpoints.map(point=>point.name).join('–');
  return`<article class="service-notice"><h4>${esc(section)}</h4><p class="service-notice-dates">${esc(pretty(notice.closedFrom))}–${esc(pretty(notice.closedThrough))} · ${esc(notice.operator)}</p>${status.confirmed.length?'<p>Train services are suspended over this section during the confirmed closure. The operator provides replacement buses; they are not counted as trains on this map.</p>':''}${notice.intermediateStopNames?.length?`<p>Section includes ${esc(notice.intermediateStopNames.join(', '))}.</p>`:''}${notice.unaffectedContext?`<p>${esc(notice.unaffectedContext)}</p>`:''}${notice.diversionContext?`<p>${esc(notice.diversionContext)}</p>`:''}${boundary.length?`<p class="service-notice-uncertain">The operator notice also mentions ${esc(boundary.map(pretty).join(', '))}. Resumption on that boundary date is uncertain; check the operator before travel.${status.uncertain.length&&!status.confirmed.length?' The selected date is on this uncertain boundary.':''}</p>`:''}<div class="service-notice-links">${links}</div></article>`;
}

export function setupServiceContext({getManifest,getState,getDates,getView,getMap,load,onChange=()=>{}}){
  const chip=document.getElementById('serviceContextToggle'),panel=document.getElementById('serviceContextPanel'),
    content=document.getElementById('serviceContextContent'),close=document.getElementById('closeServiceContext'),
    toggle=document.getElementById('showClosedCorridors'),toggleRow=document.getElementById('closedCorridorToggleRow'),explanation=document.getElementById('closedCorridorExplanation'),key=document.getElementById('closedCorridorKey');
  if(!chip||!panel||!content||!close)return{refresh(){}};
  let documentData=null,promise=null,path=null,active=[],request=0,version=null,
    geometryData=null,geometryPromise=null,geometryVersion=null,geometryPath=null,layer=null,shownKey=null;
  function hide(focus=false){request++;panel.hidden=true;chip.setAttribute('aria-expanded','false');if(focus&&!chip.hidden)chip.focus();}
  function candidates(){const view=getView(),manifest=getManifest();return view?relevantNotices(manifest?.serviceContext,{...view,dates:getDates(),day:getState().day}):[];}
  function render(){
    if(!documentData)return;
    const selected=selectedDays(getState().day,getDates()).map(index=>getDates()[index]),ids=new Set(active.map(notice=>notice.id));
    content.innerHTML=documentData.closures.filter(notice=>ids.has(notice.id)).map(notice=>noticeHTML(notice,documentData.sources,selected)).join('')+`<p class="service-context-updated">Notices checked ${esc(pretty(documentData.checkedAt))}.</p>`;
    panel.setAttribute('aria-busy','false');
  }
  function clearGeometry(){if(layer){layer.clearLayers();shownKey=null;}if(key)key.hidden=true;}
  function updateGeometry(){
    const manifest=getManifest(),map=getMap?.(),view=getView(),enabled=getState().closedCorridors!==false;
    if(toggle)toggle.checked=enabled;
    if(toggleRow)toggleRow.hidden=!manifest?.serviceContext?.geometryAvailable;if(explanation)explanation.hidden=!manifest?.serviceContext?.geometryAvailable;
    if(!map||!view||!enabled||!active.length||!geometryPath){clearGeometry();return;}
    const ids=new Set(confirmedCorridorIds(manifest.serviceContext,{...view,dates:getDates(),day:getState().day}));
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
      layer=L.geoJSON(null,{pane:'closedRailContext',renderer:L.svg({pane:'closedRailContext'}),
        style:{color:'#686f7c',weight:2.3,opacity:.9,dashArray:'6 5',lineCap:'round'},
        bubblingMouseEvents:false,onEachFeature:(feature,path)=>{
          path.bindTooltip('Temporarily closed rail corridor · inferred infrastructure',{sticky:true});
          path.on('click',event=>{if(event.originalEvent)L.DomEvent.stopPropagation(event.originalEvent);if(panel.hidden)open();else close.focus();});
        }}).addTo(map);
    }
    layer.clearLayers();layer.addData({...geometryData,features:geometryData.features.filter(feature=>ids.has(feature.properties?.notice_id))});shownKey=next;
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
    chip.querySelector('span').textContent=active.length>1?`Rail works in this area · ${active.length}`:'Rail works in this area';
    if(!active.length)hide();else if(!panel.hidden)render();updateGeometry();
  }
  async function open(){
    refresh();if(chip.hidden)return;
    if(!panel.hidden){hide(true);return;}
    const ticket=++request;panel.hidden=false;chip.setAttribute('aria-expanded','true');panel.setAttribute('aria-busy','true');
    content.innerHTML='<p>Reading the dated operator notices…</p>';close.focus();
    try{
      if(!promise){const expected=version;promise=load(path).then(data=>{if(data.schemaVersion!==1||!Array.isArray(data.closures)||!Array.isArray(data.sources))throw new Error('Invalid service context');if(expected===version)documentData=data;return data;}).catch(error=>{if(expected===version)promise=null;throw error;});}
      await promise;if(ticket===request&&!panel.hidden){active=candidates();if(active.length)render();else hide();}
    }catch{if(ticket===request&&!panel.hidden){panel.setAttribute('aria-busy','false');content.innerHTML='<p>The operator notices could not load. Close and reopen this panel to retry. No service conclusion has been made.</p>';}}
  }
  chip.onclick=open;close.onclick=()=>hide(true);
  if(toggle)toggle.onchange=()=>{getState().closedCorridors=toggle.checked;updateGeometry();onChange();};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden&&(panel.contains(document.activeElement)||chip===document.activeElement)){event.stopPropagation();event.preventDefault();hide(true);}},true);
  return{refresh};
}
