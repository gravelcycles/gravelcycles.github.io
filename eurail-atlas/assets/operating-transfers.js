import{selectedDays,escapeHTML as esc,formatNumber as fmt,normalize,serviceVisible,effectivePass,threshold}from'./atlas-core.js?v=be12ace3e364f8ae';
import{contextSelectionKey,contextCountryVisible,restoreContextFocus}from'./context-scope.js?v=be12ace3e364f8ae';

export function relevantTransfers(summary,view){
  const{zoom,bounds,dates,day='all',sources=null,mode='frequency',schematic=true,representedInMainServiceLayer=[]}=view;
  // This endpoint-only projection has no pass eligibility or fee evidence.
  // Showing its paths under an inclusion filter would imply an unsupported
  // match, including when no fee categories or No extras are selected.
  if(effectivePass(view)||summary?.schemaVersion!==1||zoom<(summary.minimumZoom||4)||!Array.isArray(bounds)||bounds.length!==4||!serviceVisible({serviceMode:'temporary_replacement_bus'},view)||schematic===false)return[];
  const selected=selectedDays(day,dates),represented=new Set(representedInMainServiceLayer);
  return(summary.transfers||[]).filter(row=>{
    const b=row.bounds;return contextCountryVisible(row,view)&&row.representedInMainServiceLayer!==true&&!represented.has(row.id)&&row.temporary!==false&&(mode!=='italy'||row.countries?.includes('Italy'))&&(!sources||!row.source||sources.has(row.source))&&Array.isArray(b)&&b.length===4&&b[2]>=bounds[0]&&b[0]<=bounds[2]&&b[3]>=bounds[1]&&b[1]<=bounds[3]&&
      selected.some(index=>dates[index]>=row.startDate&&dates[index]<=row.endDate&&(row.frequencyKnown===false?row.activeDates?.includes(dates[index]):(Number(row.daily?.[index])||0)>0));
  });
}

export function transferConnections(rows,day,dates,{min=0}={}){
  const days=selectedDays(day,dates),groups=new Map();
  for(const row of rows){
    if(row.mode!=='replacement_bus'||row.temporary===false||row.railFrequencyContribution!==0||row.geometry!==null||!Array.isArray(row.stops)||row.stops.length<2)continue;
    const unknown=row.frequencyKnown===false;if(!days.some(index=>unknown?row.activeDates?.includes(dates[index]):(Number(row.daily?.[index])||0)>0))continue;
    for(let index=1;index<row.stops.length;index++){
      const a=row.stops[index-1],b=row.stops[index],valid=point=>Number.isFinite(point.lon)&&Number.isFinite(point.lat)&&Math.abs(point.lon)<=180&&Math.abs(point.lat)<=85&&!(point.lon===0&&point.lat===0);
      if(!valid(a)||!valid(b))continue;
      const ap=JSON.stringify([a.name,a.lon,a.lat]),bp=JSON.stringify([b.name,b.lon,b.lat]);if(ap===bp)continue;
      const key=JSON.stringify([row.source,[ap,bp].sort()]),direction=JSON.stringify([ap,bp]);let group=groups.get(key);
      if(!group){group={id:key,stops:[a,b],daily:dates.map(()=>0),directions:new Map(),transferIds:new Set(),temporary:true,schematic:true,frequencyKnown:true};groups.set(key,group);}
      if(!group.directions.has(direction))group.directions.set(direction,{from:a.name,to:b.name,daily:dates.map(()=>0),frequencyKnown:true});
      const directed=group.directions.get(direction);if(unknown){group.frequencyKnown=false;directed.frequencyKnown=false;}
      for(let i=0;i<dates.length;i++){const weight=Number(row.daily?.[i])||0;group.daily[i]+=weight;directed.daily[i]+=weight;}
      group.transferIds.add(row.id);
    }
  }
  const minimum=threshold(min);
  return[...groups.values()].map(group=>({...group,count:group.frequencyKnown?days.reduce((count,index)=>count+group.daily[index],0):null,selectedDates:days.length,directions:[...group.directions.values()].map(row=>({...row,count:row.frequencyKnown?days.reduce((count,index)=>count+row.daily[index],0):null})),transferIds:[...group.transferIds]})).filter(group=>!minimum||group.frequencyKnown&&group.count/Math.max(1,days.length)>=minimum);
}

export function transferHTML(row,day='all',dates=row.dates||[]){
  const links=[[row.noticePublisher||row.evidencePublisher||(row.source==='pt_cp'?'CP operator notice':row.source==='es_renfe_ld'?'Renfe / CP notice':'Source & replacement information'),row.referenceUrl],['Corroborating source',row.corroboratingUrl]].map(([label,value])=>{
    try{const url=new URL(value);return url.protocol==='https:'?`<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';}catch{return'';}
  }).join('');
  const period=(row.frequencyKnown===false&&row.reopeningDateKnown!==true)||row.reopeningDateKnown===false||row.endDateMeaning==='reviewed_date_scope_limit_not_railway_reopening'?`Temporary replacement verified for ${esc(row.dates?.[0]||row.startDate)}–${esc(row.dates?.at(-1)||row.endDate)}. Railway reopening date is unknown.`:`Operator notice: ${esc(row.startDate)}–${esc(row.endDate)}. Selected dates come from the retained timetable.`;
  const count=selectedDays(day,dates).reduce((sum,index)=>sum+(Number(row.daily?.[index])||0),0),labels=(row.publicServices||row.publicTrains||[]).map(train=>String(train.label).replace(/^0+(?=\d)/,'')),counts=row.frequencyKnown===false?'The temporary replacement connection is documented; its bus frequency is unavailable.':dates.length?`${esc(fmt(count))} recorded replacement services from this source across the selected dates, counted separately from trains. Overlapping sources may describe the same service.`:'';
  const separator=row.directionality==='bidirectional'?' ↔ ':row.directionKnown===false?' — ':' → ';
  return`<article class="service-notice"><h4>${esc(row.stops.map(stop=>stop.name).join(separator))}</h4><p><strong>${esc(row.serviceLabel||'Celta')} connecting replacement bus</strong></p><p><strong>Temporary replacement bus · approximate connection</strong></p><p>${esc(row.meaning)}</p>${row.sourceOverlapStatus==='unresolved_potential_overlap'?'<p>Potential overlap with another source; both source inventories are retained separately.</p>':''}${row.timeScope?`<p>${esc(typeof row.timeScope==='string'?row.timeScope:JSON.stringify(row.timeScope))}</p>`:''}${row.partialResumptionMeaning?`<p>${esc(row.partialResumptionMeaning)}</p>`:''}${counts?`<p>${counts}</p>`:''}${labels.length?`<p>Published service numbers: ${esc(labels.slice(0,20).join(', '))}${labels.length>20?` · ${esc(fmt(labels.length-20))} more labels in the downloadable data`:''}.</p>`:''}<p class="service-notice-dates">${period}</p><div class="service-notice-links">${links}</div></article>`;
}

export function setupOperatingTransfers({getManifest,getState,getDates,getView,getMap,load,onOpen=()=>{},isFocused=()=>false}){
  const host=document.querySelector('.map-notices'),filters=document.querySelector('.inspection-filter');if(!host||!filters)return{refresh(){},hide(){}};
  const chip=document.createElement('button');chip.type='button';chip.id='operatingTransfersToggle';chip.className='inline-button operating-transfers-trigger';chip.hidden=true;chip.setAttribute('aria-controls','operatingTransfersPanel');chip.setAttribute('aria-expanded','false');chip.textContent='Replacement connection details ↗';
  const panel=document.createElement('section');panel.id='operatingTransfersPanel';panel.className='service-context-panel';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-labelledby','operatingTransfersTitle');panel.innerHTML='<button class="close-button" aria-label="Close connecting bus information">×</button><h3 id="operatingTransfersTitle">Connecting replacement buses</h3><p>Dashed lines retain temporary replacement-bus connections between documented calling points. They are schematic; the road route is unknown. No bus is counted as a train. These additional connections have no recorded pass or fee eligibility and are hidden when Eurail inclusion is selected. Check boarding locations, pass acceptance and ticket or reservation requirements with the operator.</p><label for="operatingTransfersFilter">Filter stops, line or operator</label><input id="operatingTransfersFilter" type="search" placeholder="Find a replacement connection" style="width:100%;margin:6px 0;padding:8px"><button id="operatingTransfersAll" type="button" hidden>Show all connections in view</button><p id="operatingTransfersSummary"></p><div id="operatingTransfersContent" aria-live="polite"></div>';
  filters.append(chip);host.append(panel);const close=panel.querySelector('button'),content=panel.querySelector('#operatingTransfersContent'),filter=panel.querySelector('#operatingTransfersFilter'),all=panel.querySelector('#operatingTransfersAll'),summary=panel.querySelector('#operatingTransfersSummary');
  const key=document.createElement('div');key.className='closure-key';key.id='temporaryReplacementBusKey';key.hidden=true;key.innerHTML='<i style="border-top:3px dashed #276b88"></i>Temporary replacement bus · approximate connection';document.getElementById('mapLegend')?.appendChild(key);
  let path=null,revision=null,documentData=null,promise=null,active=[],layer=null,busRenderer=null,rendererKind=null,shown=null,selectedTransferIds=null,filterTimer=null,selectionKey=null,activeKey='',request=0;
  const lineLayers=new Map(),searchText=new WeakMap();
  function hide(focus=false){request++;panel.hidden=true;chip.setAttribute('aria-expanded','false');if(focus)restoreContextFocus(chip);}
  function activate(path,label,ids=()=>null){
    path.on('click',event=>{if(event.originalEvent)globalThis.L.DomEvent.stopPropagation(event.originalEvent);open(ids());});
    path.on('add',()=>{const element=path.getElement?.();if(!element)return;element.setAttribute('role','button');element.setAttribute('tabindex','0');element.setAttribute('aria-label',label);element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();open(ids());}});});
    return path;
  }
  function clearMarkers(){layer?.clearLayers();lineLayers.clear();shown=null;key.hidden=true;}
  function connectionsInView(){
    const ids=new Set(active.map(row=>row.id)),state=getState();
    return transferConnections((documentData?.transfers||[]).filter(row=>ids.has(row.id)),state.day,getDates(),{min:state.min});
  }
  function render(){
    if(!documentData)return;const ids=new Set(connectionsInView().flatMap(row=>row.transferIds)),query=normalize(filter.value),rows=documentData.transfers.filter(row=>{
      if(!ids.has(row.id)||selectedTransferIds&&!selectedTransferIds.has(row.id))return false;
      if(!query)return true;if(!searchText.has(row))searchText.set(row,normalize([row.serviceLabel,row.operator,row.noticePublisher,...row.stops.map(stop=>stop.name),...(row.publicServices||row.publicTrains||[]).map(service=>service.label)].join(' ')));
      return query.split(' ').every(word=>searchText.get(row).includes(word));
    });
    content.innerHTML=rows.slice(0,50).map(row=>transferHTML(row,getState().day,getDates())).join('')||(query?'<p>No replacement connections match this filter.</p>':'<p>No replacement connections apply to the selected dates here.</p>');
    summary.textContent=`Showing ${Math.min(50,rows.length)} of ${rows.length} matching replacement patterns.${rows.length>50?' Filter stops, line or operator to narrow the list.':''}`;all.hidden=!selectedTransferIds;panel.setAttribute('aria-busy','false');
  }
  function updateMarkers(){
    const map=getMap?.(),state=getState();if(!map||effectivePass(state)||!serviceVisible({serviceMode:'temporary_replacement_bus'},state)||state.schematic===false||!active.length||!documentData){clearMarkers();return;}
    const view=getView(),focused=!!isFocused(),next=JSON.stringify([state.day,state.min,active.map(row=>row.id).sort(),view?.zoom,view?.bounds,focused]);
    if(next===shown){chip.hidden=!lineLayers.size;if(chip.hidden)hide();return;}
    const L=globalThis.L;if(!L)return;if(!layer){layer=L.layerGroup().addTo(map);if(!map.getPane('connectingBusContext'))map.createPane('connectingBusContext').style.zIndex=370;}
    const connections=connectionsInView();chip.hidden=!connections.length;if(chip.hidden)hide();
    const nextRenderer=connections.length>100?'canvas':'svg';if(nextRenderer!==rendererKind){clearMarkers();if(busRenderer&&map.hasLayer(busRenderer))map.removeLayer(busRenderer);busRenderer=nextRenderer==='canvas'?L.canvas({pane:'connectingBusContext',padding:.1}):L.svg({pane:'connectingBusContext'});rendererKind=nextRenderer;}
    const connectionIds=new Set(connections.map(connection=>connection.id));for(const[id,entry]of lineLayers)if(!connectionIds.has(id)){layer.removeLayer(entry.halo);layer.removeLayer(entry.line);lineLayers.delete(id);}
    // Unmatched notice connections yield to the currently focused route.
    const lineStyle={color:focused?'#b0b8b3':'#276b88',opacity:focused?.65:1},haloStyle={opacity:focused?.35:.9};
    for(const connection of connections){
      const points=connection.stops.map(stop=>[stop.lat,stop.lon]),directions=connection.directions.filter(row=>row.count===null||row.count>0).length>1?'both recorded directions':'recorded direction',counts=connection.frequencyKnown?`${fmt(connection.count)} recorded bus services across ${connection.selectedDates} selected dates`:'documented temporary replacement · bus frequency unavailable';
      const label=`Temporary replacement bus · approximate connection · ${connection.stops.map(stop=>stop.name).join(' ↔ ')} · ${counts} · ${directions}`;
      let entry=lineLayers.get(connection.id);if(entry){entry.connection=connection;entry.line.setStyle(lineStyle);entry.halo.setStyle(haloStyle);entry.line.getElement?.()?.setAttribute('aria-label',label);continue;}
      entry={connection};entry.halo=L.polyline(points,{pane:'connectingBusContext',renderer:busRenderer,className:'temporary-bus-halo',weight:6.2,color:'#fffaf0',...haloStyle,dashArray:'7 6',lineCap:'round',interactive:false}).addTo(layer);
      entry.line=activate(L.polyline(points,{pane:'connectingBusContext',renderer:busRenderer,className:'temporary-bus-connection',weight:3.4,...lineStyle,dashArray:'7 6',lineCap:'round',bubblingMouseEvents:false}),label,()=>entry.connection.transferIds).addTo(layer);lineLayers.set(connection.id,entry);
    }
    key.hidden=!connections.length;
    shown=next;
  }
  async function ensureData(){
    if(!promise){const expected=revision;promise=load(path).then(data=>{
      if(data.schemaVersion!==1||data.kind!=='reviewed_mixed_mode_transfer_context'||!Array.isArray(data.transfers)||data.transfers.some(row=>row.mode!=='replacement_bus'||row.railFrequencyContribution!==0||row.geometry!==null||row.temporary===false||!Array.isArray(row.stops)||row.stops.length<2))throw new Error('Invalid connecting bus context');
      if(expected===revision){documentData=data;if(!panel.hidden)render();updateMarkers();}return data;
    }).catch(error=>{if(expected===revision){promise=null;clearMarkers();}throw error;});}return promise;
  }
  function refresh(){
    const currentSelection=contextSelectionKey(getState(),getDates());if(selectionKey!==null&&selectionKey!==currentSelection)hide();selectionKey=currentSelection;
    const manifest=getManifest(),next=manifest?.files?.operatingTransfers,nextRevision=manifest?.assets?.[manifest?.assetPaths?.[next]||next]?.sha256;
    if(path!==next||revision!==nextRevision){path=next;revision=nextRevision;documentData=null;promise=null;clearMarkers();hide();}
    const view=getView(),state=getState();active=view?relevantTransfers(manifest?.operatingTransfers,{...view,dates:getDates(),day:state.day,sources:state.sources,mode:state.mode,country:state.country,pass:state.pass,trains:state.trains,replacements:state.replacements,schematic:state.schematic,representedInMainServiceLayer:manifest?.temporaryReplacementServices?.representedInMainServiceLayer||[]}):[];const nextActive=active.map(row=>row.id).sort().join('|');if(nextActive!==activeKey)hide();activeKey=nextActive;chip.hidden=!path||!active.length;
    if(chip.hidden){hide();clearMarkers();return;}if(documentData){if(!panel.hidden)render();updateMarkers();}else ensureData().catch(()=>{});
  }
  async function open(ids=null){
    selectedTransferIds=ids?new Set(ids):null;refresh();if(chip.hidden)return;onOpen();document.getElementById('closeControls')?.click();const ticket=++request;panel.hidden=false;panel.setAttribute('aria-busy','true');chip.setAttribute('aria-expanded','true');content.textContent='Reading the connecting bus evidence…';close.focus();
    try{await ensureData();if(ticket===request&&!panel.hidden)render();}catch{if(ticket===request&&!panel.hidden){panel.setAttribute('aria-busy','false');content.textContent='The connecting bus information could not load. Close and reopen to retry.';}}
  }
  chip.onclick=()=>panel.hidden?open():hide(true);close.onclick=()=>hide(true);
  filter.oninput=()=>{selectedTransferIds=null;clearTimeout(filterTimer);filterTimer=setTimeout(render,100);};all.onclick=()=>{selectedTransferIds=null;render();};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden&&(panel.contains(document.activeElement)||chip===document.activeElement)){event.stopPropagation();event.preventDefault();hide(true);}},true);
  return{refresh,hide};
}
