import{selectedDays,escapeHTML as esc}from'./atlas-core.js?v=5b93a3430fea6c94';

export function relevantInfrastructure(summary,{zoom,bounds,dates,day='all'}){
  if(summary?.schemaVersion!==1||zoom<(summary.minimumZoom||7)||!Array.isArray(bounds)||bounds.length!==4)return[];
  const selected=selectedDays(day,dates).map(index=>dates[index]);
  return(summary.corridors||[]).filter(row=>{
    const b=row.bounds;
    return row.effect==='physical_railway_no_verified_passenger_service'&&Array.isArray(b)&&b.length===4&&
      b[2]>=bounds[0]&&b[0]<=bounds[2]&&b[3]>=bounds[1]&&b[1]<=bounds[3]&&
      selected.some(date=>date>=row.observedFrom&&date<=row.observedThrough);
  });
}

export function infrastructureHTML(row){
  const sources=(row.serviceEvidence||[]).map(source=>{
    try{const url=new URL(source.url);return url.protocol==='https:'?`<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(source.publisher)} ↗</a>`:'';}catch{return'';}
  }).join('');
  return`<article class="service-notice"><h4>${esc(row.title)}</h4><p><strong>Physical railway · no verified passenger service</strong></p><p>${esc(row.explanation)}</p><p>${esc(row.geometryMeaning)}</p><p class="service-notice-dates">Observation covers ${esc(row.observedFrom)}–${esc(row.observedThrough)}.</p><div class="service-notice-links">${sources}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors · ODbL ↗</a></div></article>`;
}

export function setupInfrastructureContext({getManifest,getState,getDates,getView,getMap,load}){
  const host=document.querySelector('.map-notices');if(!host)return{refresh(){}};
  const chip=document.createElement('button');chip.type='button';chip.id='infrastructureContextToggle';chip.className='service-context-chip';chip.hidden=true;
  chip.setAttribute('aria-controls','infrastructureContextPanel');chip.setAttribute('aria-expanded','false');chip.innerHTML='<span>Physical railway context</span><b aria-hidden="true">i</b>';
  const panel=document.createElement('section');panel.id='infrastructureContextPanel';panel.className='service-context-panel';panel.hidden=true;
  panel.setAttribute('role','region');panel.setAttribute('aria-labelledby','infrastructureContextTitle');panel.innerHTML='<button class="close-button" aria-label="Close physical railway information">×</button><h3 id="infrastructureContextTitle">Physical railway context</h3><p>Grey dotted railway paths have no verified passenger timetable for these dates. They add no trains to this map.</p><label class="closed-corridor-toggle"><input id="showPhysicalRailways" type="checkbox" checked><span>Show these physical railway paths</span></label><div id="infrastructureContextContent" aria-live="polite"></div>';
  host.append(chip,panel);
  const key=document.createElement('div');key.className='closure-key';key.id='physicalRailwayKey';key.hidden=true;key.innerHTML='<i style="border-top-style:dotted;border-top-color:#526979"></i>Grey dotted · physical rail, passenger service unverified';document.getElementById('mapLegend')?.appendChild(key);
  const content=panel.querySelector('#infrastructureContextContent'),toggle=panel.querySelector('input'),close=panel.querySelector('button');
  let active=[],path=null,revision=null,documentData=null,promise=null,layer=null,enabled=true,shown=null;
  function hide(focus=false){panel.hidden=true;chip.setAttribute('aria-expanded','false');if(focus&&!chip.hidden)chip.focus();}
  function render(){
    if(!documentData)return;
    const ids=new Set(active.map(row=>row.id));content.innerHTML=documentData.corridors.filter(row=>ids.has(row.id)).map(infrastructureHTML).join('');panel.setAttribute('aria-busy','false');
  }
  function clearGeometry(){layer?.clearLayers();shown=null;key.hidden=true;}
  function updateGeometry(){
    const map=getMap?.();if(!map||!enabled||!active.length||!documentData){clearGeometry();return;}
    const ids=new Set(active.map(row=>row.id)),next=[...ids].sort().join('|');if(next===shown)return;
    if(!layer){
      const L=globalThis.L;if(!L)return;
      if(!map.getPane('physicalRailContext'))map.createPane('physicalRailContext').style.zIndex=355;
      layer=L.geoJSON(null,{pane:'physicalRailContext',renderer:L.svg({pane:'physicalRailContext'}),
        style:{color:'#526979',weight:3,opacity:.95,dashArray:'2 5',lineCap:'round'},bubblingMouseEvents:false,
        onEachFeature:(feature,line)=>{
          line.on('click',event=>{if(event.originalEvent)L.DomEvent.stopPropagation(event.originalEvent);open();});
          line.on('add',()=>{const element=line.getElement?.();if(!element)return;element.setAttribute('role','button');element.setAttribute('tabindex','0');element.setAttribute('aria-label','Physical railway · no verified passenger service');element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();open();}});});
        }}).addTo(map);
    }
    layer.clearLayers();layer.addData({type:'FeatureCollection',features:documentData.corridors.filter(row=>ids.has(row.id)).map(row=>({type:'Feature',properties:{id:row.id,infrastructureOnly:true},geometry:row.geometry}))});shown=next;key.hidden=!layer.getLayers().length;
  }
  async function ensureData(){
    if(!promise){const expected=revision;promise=load(path).then(data=>{
      if(data.schemaVersion!==1||data.kind!=='reviewed_physical_rail_context'||!Array.isArray(data.corridors)||data.corridors.some(row=>row.infrastructureOnly!==true||row.effect!=='physical_railway_no_verified_passenger_service'))throw new Error('Invalid physical railway context');
      if(expected===revision){documentData=data;render();updateGeometry();}return data;
    }).catch(error=>{if(expected===revision){promise=null;clearGeometry();}throw error;});}
    return promise;
  }
  function refresh(){
    const manifest=getManifest(),next=manifest?.files?.infrastructureContext,
      nextRevision=manifest?.assets?.[manifest?.assetPaths?.[next]||next]?.sha256;
    if(path!==next||revision!==nextRevision){path=next;revision=nextRevision;documentData=null;promise=null;clearGeometry();hide();}
    const view=getView();active=view?relevantInfrastructure(manifest?.infrastructureContext,{...view,dates:getDates(),day:getState().day}):[];
    chip.hidden=!path||!active.length;
    if(chip.hidden){hide();clearGeometry();return;}
    if(documentData){if(!panel.hidden)render();updateGeometry();}else if(enabled)ensureData().catch(()=>{});
  }
  async function open(){
    refresh();if(chip.hidden)return;
    panel.hidden=false;chip.setAttribute('aria-expanded','true');panel.setAttribute('aria-busy','true');content.textContent='Reading the evidence for this physical railway…';close.focus();
    try{await ensureData();if(!panel.hidden)render();}catch{if(!panel.hidden){panel.setAttribute('aria-busy','false');content.textContent='The evidence could not load. Close and reopen to retry. No passenger-service conclusion has been added.';}}
  }
  chip.onclick=()=>panel.hidden?open():hide(true);close.onclick=()=>hide(true);toggle.onchange=()=>{enabled=toggle.checked;updateGeometry();if(enabled&&!documentData)ensureData().catch(()=>{});};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden&&(panel.contains(document.activeElement)||chip===document.activeElement)){event.stopPropagation();event.preventDefault();hide(true);}},true);
  return{refresh};
}
