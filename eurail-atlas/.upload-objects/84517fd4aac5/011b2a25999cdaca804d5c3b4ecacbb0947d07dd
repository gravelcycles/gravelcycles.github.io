import{selectedDays,escapeHTML as esc,formatNumber as fmt,serviceVisible,effectivePass}from'./atlas-core.js?v=654e053d9fab5bcf';
import{contextCountryVisible}from'./context-scope.js?v=654e053d9fab5bcf';

// Reviewed links between adjacent border stations. Each national timetable
// ends the train at its own border station and neither publishes the leg in
// between, so these straight dashed lines come from a separate reviewed packet.
// They add no call or train and carry no pass or fee evidence. The packet is
// matched against one published data release and is drawn only beside it: the
// delivery's own copy when it has one, otherwise the copy shipped with the map.
export function shippedBorderLinksURL(){const url=new URL('./border-links.json',import.meta.url);url.search=new URL(import.meta.url).search;return url.href;}
export const BORDER_LINK_LABEL='Approximate border link · leg not published by either timetable';
const EVIDENCE={train_number:'same public train number',train_number_and_clock:'same public train number and timetable handoff',clock:'timetable handoff only'};

export function validBorderLinks(data){
  return data?.schemaVersion===1&&data.format==='rail-atlas-border-links-v1'&&typeof data.releaseId==='string'&&data.releaseId!==''&&data.geometryStatus==='schematic_border_link'&&data.callsAdded===0&&data.sourceFrequencyContribution===0&&data.passStatusInferred===false&&data.inSeatThroughRideAsserted===false&&Array.isArray(data.dates)&&Array.isArray(data.links)&&data.links.every(link=>typeof link?.id==='string'&&typeof link.pairId==='string'&&Array.isArray(link.coords)&&link.coords.length===2&&link.coords.every(point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=85)&&Array.isArray(link.daily)&&link.daily.length===data.dates.length&&link.daily.every(value=>Number.isInteger(value)&&value>=0)&&Array.isArray(link.sources)&&link.sources.length===2&&Array.isArray(link.matches)&&link.matches.length>0&&typeof link.a?.name==='string'&&typeof link.b?.name==='string');
}

export function visibleBorderLinks(data,view){
  const{zoom,bounds,dates,day='all',sources=null,mode='frequency',schematic=true,releaseId}=view;
  // No pass or fee evidence exists for the unpublished leg, and a straight line
  // is not a railway section: an inclusion filter, the physical-traffic view,
  // hidden approximate geometry or a hidden train layer all remove it.
  if(!validBorderLinks(data)||effectivePass(view)||mode==='traffic'||mode==='hubs'||schematic===false||!serviceVisible({},view)||zoom<(data.minimumZoom||6)||!Array.isArray(bounds)||bounds.length!==4||JSON.stringify(dates)!==JSON.stringify(data.dates)||releaseId!==data.releaseId)return[];
  const selected=selectedDays(day,dates);
  return data.links.filter(link=>{
    const west=Math.min(link.coords[0][0],link.coords[1][0]),east=Math.max(link.coords[0][0],link.coords[1][0]),south=Math.min(link.coords[0][1],link.coords[1][1]),north=Math.max(link.coords[0][1],link.coords[1][1]);
    // The link joins two publishers; hiding either one hides the link.
    return contextCountryVisible(link,view)&&(!sources||link.sources.every(source=>sources.has(source)))&&east>=bounds[0]&&west<=bounds[2]&&north>=bounds[1]&&south<=bounds[3]&&selected.some(index=>link.daily[index]>0);
  });
}

export function borderLinkGroups(links,day,dates){
  const days=selectedDays(day,dates),groups=new Map();
  for(const link of links){
    let group=groups.get(link.pairId);
    if(!group){group={id:link.pairId,coords:link.coords,throughService:link.throughService,references:link.references||[],km:link.km,directions:[],count:0,selectedDates:days.length};groups.set(link.pairId,group);}
    const count=days.reduce((sum,index)=>sum+link.daily[index],0);if(!count)continue;
    group.directions.push({from:link.a.name,to:link.b.name,count,matches:link.matches.map(match=>({...match,count:days.reduce((sum,index)=>sum+match.daily[index],0)})).filter(match=>match.count>0)});group.count+=count;
  }
  return[...groups.values()].filter(group=>group.count>0);
}

function trainLabel(side){return String(side.train||side.line||'').replace(/^0+(?=\d)/,'');}

export function borderLinkSummary(group){
  const ends=group.directions[0];
  return`${BORDER_LINK_LABEL} · ${ends.from} ↔ ${ends.to} · ${fmt(group.count)} matched train ${group.count===1?'pair':'pairs'} across ${group.selectedDates} selected ${group.selectedDates===1?'date':'dates'}`;
}

export function borderLinkHTML(group){
  const directions=group.directions.map(direction=>`<p><strong>${esc(direction.from)} → ${esc(direction.to)}</strong>: ${esc(fmt(direction.count))} matched train ${direction.count===1?'pair':'pairs'}</p><ul>${direction.matches.map(match=>`<li>${esc(trainLabel(match.arrival))} (${esc(match.arrival.operator||match.arrival.source)}) then ${esc(trainLabel(match.departure))} (${esc(match.departure.operator||match.departure.source)}) · ${esc(EVIDENCE[match.evidence]||'reviewed evidence')}${Array.isArray(match.handoffMinutes)?` · ${esc(fmt(match.handoffMinutes[0]))}${match.handoffMinutes[1]!==match.handoffMinutes[0]?'–'+esc(fmt(match.handoffMinutes[1])):''} min between the two timetables`:''} · ${esc(fmt(match.count))} ${match.count===1?'date':'dates'}</li>`).join('')}</ul>`).join('');
  const links=group.references.map(reference=>{try{const url=new URL(reference.url);return url.protocol==='https:'?`<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(reference.publisher||'Operator reference')} ↗</a>`:'';}catch{return'';}}).join(' ');
  return`<article class="service-notice border-link-notice"><h4>${esc(group.directions[0].from)} ↔ ${esc(group.directions[0].to)}</h4><p><strong>${esc(BORDER_LINK_LABEL)}</strong></p><p>${esc(group.throughService||'')}${Number.isFinite(group.km)?` · about ${esc(fmt(group.km))} km in a straight line`:''}</p><p>Neither national timetable supplies this leg: one ends the train at its border station and the other starts it at theirs. The dashed straight line is not the track alignment. It adds no stop and no extra train, and it shows only the dated train pairs below. A change of train at the border may still be needed, and no pass or fee condition is recorded for this leg.</p>${directions}<div class="service-notice-links">${links}</div></article>`;
}

export function setupBorderLinks({getManifest,getState,getDates,getView,getMap,load,loadShipped=()=>fetch(shippedBorderLinksURL()).then(response=>{if(!response.ok)throw new Error('No shipped border links');return response.json();}),onOpen=()=>{}}){
  let path=null,revision=null,data=null,promise=null,layer=null,renderer=null,shown=null,key=null,panel=null,content=null,opened=null,opener=null;
  const lines=new Map();
  function hide(focus=false){if(!panel||panel.hidden)return;panel.hidden=true;opened=null;if(focus)opener?.focus?.({preventScroll:true});opener=null;}
  function clear(){layer?.clearLayers();lines.clear();shown=null;if(key)key.hidden=true;}
  function chrome(){
    // The details use the app's own context panel: the rail canvas is drawn
    // above Leaflet's popup pane.
    if(key||!globalThis.document)return;const legend=document.getElementById('mapLegend'),host=document.querySelector('.map-notices');
    if(legend){key=document.createElement('div');key.className='closure-key';key.id='borderLinkKey';key.hidden=true;key.innerHTML='<i style="border-top:3px dashed #6a4c93"></i>'+esc(BORDER_LINK_LABEL);legend.appendChild(key);}
    if(!host)return;
    panel=document.createElement('section');panel.id='borderLinksPanel';panel.className='service-context-panel';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-labelledby','borderLinksTitle');
    panel.innerHTML='<button class="close-button" aria-label="Close border link information">×</button><h3 id="borderLinksTitle">Approximate border link</h3><div id="borderLinksContent" aria-live="polite"></div>';
    host.append(panel);content=panel.querySelector('#borderLinksContent');panel.querySelector('button').onclick=()=>hide(true);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden&&panel.contains(document.activeElement)){event.stopPropagation();event.preventDefault();hide(true);}},true);
  }
  function open(id,element=null){
    const entry=lines.get(id);if(!entry||!panel)return;
    onOpen();content.innerHTML=borderLinkHTML(entry.group);opened=id;opener=element;panel.hidden=false;panel.querySelector('button').focus?.({preventScroll:true});
  }
  function draw(){
    const map=getMap?.(),view=getView?.(),state=getState(),L=globalThis.L;if(!map||!view||!L||!data){clear();hide();return;}
    const dates=getDates(),groups=borderLinkGroups(visibleBorderLinks(data,{...state,...view,dates,releaseId:getManifest()?.releaseId}),state.day,dates),next=JSON.stringify(groups.map(group=>[group.id,group.count]));
    chrome();if(next===shown)return;
    // A handful of lines: an SVG renderer keeps each one a focusable element.
    if(!layer){if(!map.getPane('borderLinkContext'))map.createPane('borderLinkContext').style.zIndex=372;renderer=L.svg({pane:'borderLinkContext'});layer=L.layerGroup().addTo(map);}
    clear();
    for(const group of groups){
      const points=group.coords.map(point=>[point[1],point[0]]),label=borderLinkSummary(group);
      const halo=L.polyline(points,{pane:'borderLinkContext',renderer,className:'border-link-halo',weight:6.2,color:'#fffaf0',opacity:.9,dashArray:'2 7',lineCap:'round',interactive:false}).addTo(layer);
      const line=L.polyline(points,{pane:'borderLinkContext',renderer,className:'border-link',weight:3.4,color:'#6a4c93',opacity:1,dashArray:'2 7',lineCap:'round',bubblingMouseEvents:false});
      line.bindTooltip(label,{sticky:true});
      line.on('click',event=>{if(event?.originalEvent)L.DomEvent?.stopPropagation(event.originalEvent);open(group.id,line.getElement?.());});
      line.on('add',()=>{const element=line.getElement?.();if(!element)return;element.setAttribute('role','button');element.setAttribute('tabindex','0');element.setAttribute('aria-label',label);element.setAttribute('aria-controls','borderLinksPanel');element.dataset.borderLink=group.id;element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();open(group.id,element);}});});
      line.addTo(layer);lines.set(group.id,{halo,line,group});
    }
    if(key)key.hidden=!groups.length;shown=next;
    // An open panel follows the current selection, or closes with its link.
    if(opened){if(lines.has(opened))content.innerHTML=borderLinkHTML(lines.get(opened).group);else hide();}
  }
  function refresh(){
    // A delivery's own packet wins; otherwise the copy shipped with the map is
    // used, and drawn only if it names this release and these dates.
    const manifest=getManifest(),own=manifest?.files?.borderLinks,next=own||(manifest?.releaseId?'shipped':null),nextRevision=own?manifest?.assets?.[manifest?.assetPaths?.[own]||own]?.sha256:next;
    if(path!==next||revision!==nextRevision){path=next;revision=nextRevision;data=null;promise=null;clear();hide();}
    if(!path){clear();hide();return;}
    if(data){draw();return;}
    if(!promise){const expected=revision;promise=(own?load(path):loadShipped()).then(value=>{if(!validBorderLinks(value))throw new Error('Invalid border link packet');if(expected===revision){data=value;draw();}return value;}).catch(()=>{if(expected===revision){promise=null;clear();}});}
  }
  return{refresh,lines,open,hide};
}
