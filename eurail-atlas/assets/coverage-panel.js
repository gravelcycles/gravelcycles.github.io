/* Snapshot coverage is separate from services running or pass validity. */
const $=id=>document.getElementById(id);
const number=value=>Number.isFinite(Number(value))?Number(value).toLocaleString('en-GB'):'—';
const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};

export function countrySourceVisibility(row,manifest,state){
  const available=new Set((manifest?.sources||[]).map(source=>source.id));
  const sources=[...new Set(row?.publicDomesticSources||[])].filter(id=>available.has(id));
  const hidden=state?.sources instanceof Set?sources.filter(id=>!state.sources.has(id)):[];
  return{sources,hidden,allHidden:sources.length>0&&hidden.length===sources.length};
}

function observationDate(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):String(value||'unknown date');}
function observationDetails(source,manifest){
  const observation=source.timetableObservation||{},observed=observationDate(observation.observedAt||observation.observed_at),dates=manifest?.dates||[];
  return 'Baseline timetable observed '+observed+'.'+(dates.length?' Source calendars cover '+observationDate(dates[0])+' to '+observationDate(dates.at(-1))+'.':'')+((observation.laterAmendmentsIncluded??observation.later_amendments_included)===false?' Later amendments are not included.':'')+' These historical counts do not establish the current timetable.';
}
export function historicalTimetableWarnings(manifest,state,bounds){
  if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite))return[];
  return(manifest?.sources||[]).filter(source=>{
    if(source.timetableObservation?.kind!=='historical_base_snapshot'||state?.sources instanceof Set&&!state.sources.has(source.id))return false;
    const extent=source.timetableObservation.viewportBounds;
    return Array.isArray(extent)&&extent.length===4&&extent.every(Number.isFinite)&&extent[0]<=extent[2]&&extent[1]<=extent[3]&&extent[0]<=bounds[2]&&extent[2]>=bounds[0]&&extent[1]<=bounds[3]&&extent[3]>=bounds[1];
  }).map(source=>({id:source.id,country:source.country,label:(source.country==='Great Britain'?'Britain':source.country||source.name)+' · '+observationDate(source.timetableObservation.observedAt||source.timetableObservation.observed_at)+' baseline',detail:observationDetails(source,manifest)}));
}

/* Carried holds: a published source the weekly plan could not renew keeps its
   original dated evidence from an earlier week. None of its trains are counted
   or drawn for this week; the drawer names it with its last verified week. */
export function carriedSources(manifest,country){
  const dates=new Set(manifest?.dates||[]);
  return(manifest?.carriedSources||[]).filter(source=>{
    const carry=source?.weeklyCarry;
    return carry?.state==='carried'&&Array.isArray(carry.lastVerifiedDates)&&carry.lastVerifiedDates.length>0&&!carry.lastVerifiedDates.some(date=>dates.has(date))&&(!country||source.country===country);
  }).map(source=>({id:source.id,name:source.name||source.id,country:source.country||'',label:String(source.weeklyCarry.label||'Last verified in an earlier week'),reason:String(source.weeklyCarry.reason||'')}));
}
/* "<country> (<short name>): not shown this week · last verified <dates>".
   The short name is the source name up to its first dash (" - ", " – ",
   " — "), " (" or ";" qualifier;
   a country view leaves the country out. */
export function carriedShortName(name){const text=String(name||'').trim();const cut=text.search(/\s[-–—]\s|\s\(|;/);return cut>0?text.slice(0,cut):text;}
export function carriedRowText(row,country){
  const short=carriedShortName(row.name),place=country||!row.country?short:row.country+' ('+short+')';
  const verified=String(row.label||'').replace(/^Last verified\b/,'last verified');
  return place+': not shown this week'+(verified?' · '+verified:'');
}
function carriedSection(parent,manifest,country){
  const rows=carriedSources(manifest,country);if(!rows.length)return;
  const area=node('section','coverage-section coverage-carried');area.appendChild(node('h3','','Carried from an earlier week'));
  area.appendChild(node('p','',(rows.length===1?'This source':'These sources')+' could not be renewed for this week. Their trains are not drawn or counted here, because their evidence covers another week; nothing is relabelled to these dates.'));
  parent.appendChild(area);
  const list=node('ul','coverage-carried-list');
  // Plain words first: the country, the source's short name, that its trains
  // are not shown, and the week it was last verified for, all from the
  // delivery's own record. The recorded reason is the pipeline's wording, kept
  // behind a closed, keyboard- and tap-accessible disclosure.
  for(const row of rows){const item=node('li','');item.appendChild(node('span','',carriedRowText(row,country)));if(row.reason){const details=node('details','coverage-small coverage-technical');details.append(node('summary','','Technical detail'),node('p','',row.reason));item.appendChild(details);}list.appendChild(item);}
  area.appendChild(list);
}

/* Last good snapshot: a source whose download failed this week and that has a
   reviewed opt-in is drawn from its last good snapshot, at most the reviewed
   number of days old. The drawer says so with the snapshot's real retrieval
   date (manifest.sources[].retainedAfterFetchFailure); nothing claims freshness. */
export function retainedSources(manifest,country){
  return(manifest?.sources||[]).filter(source=>source?.retainedAfterFetchFailure?.retrievedAt&&(!country||source.country===country))
    .map(source=>({id:source.id,name:source.name||source.id,country:source.country||'',retrievedAt:source.retainedAfterFetchFailure.retrievedAt}));
}
export function retainedRowText(row,country){
  const short=carriedShortName(row.name),place=country||!row.country?short:row.country+' ('+short+')';
  return place+': last retrieved '+observationDate(row.retrievedAt)+' (upstream download failing)';
}
function retainedSection(parent,manifest,country){
  const rows=retainedSources(manifest,country);if(!rows.length)return;
  const area=node('section','coverage-section coverage-retained');area.appendChild(node('h3','','Last good download'));
  area.appendChild(node('p','',(rows.length===1?'This source':'These sources')+' could not be downloaded this week. '+(rows.length===1?'Its':'Their')+' trains are drawn from the last good download, shown with its date.'));
  const list=node('ul','coverage-retained-list');
  for(const row of rows)list.appendChild(node('li','',retainedRowText(row,country)));
  area.appendChild(list);parent.appendChild(area);
}

/* Dated service changes: a reviewed date-level operation of this delivery (for
   example CP's strike minimum services and held dates) is stated in the plain
   words of its review (manifest.sources[].operatingDates.notice). */
export function operatingDateSources(manifest,country){
  return(manifest?.sources||[]).filter(source=>typeof source?.operatingDates?.notice==='string'&&source.operatingDates.notice&&(!country||source.country===country))
    .map(source=>({id:source.id,name:source.name||source.id,country:source.country||'',notice:source.operatingDates.notice,
      heldServiceDates:Array.isArray(source.operatingDates.heldServiceDates)?source.operatingDates.heldServiceDates:[],
      minimumServiceDates:Array.isArray(source.operatingDates.minimumServiceDates)?source.operatingDates.minimumServiceDates:[]}));
}
function operatingDatesSection(parent,manifest,country){
  const rows=operatingDateSources(manifest,country);if(!rows.length)return;
  const area=node('section','coverage-section coverage-operating-dates');area.appendChild(node('h3','','Service changes this week'));
  const list=node('ul','coverage-operating-dates-list');
  for(const row of rows)list.appendChild(node('li','',row.notice));
  area.appendChild(list);parent.appendChild(area);
}

/* Replacement-bus holds: a reviewed replacement-bus context that does not
   cover this week is recorded in manifest.operatingTransfers.holds. Its buses
   are not drawn; the drawer says so in plain words, built only from the hold's
   own fields. A hold for another delivery's dates is never shown here, and an
   unrecognised kind is shown generically rather than dropped. */
function isoDay(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?observationDate(value+'T00:00:00Z'):'';}
function dayRange(values){const days=(Array.isArray(values)?values:[]).filter(value=>isoDay(value));return days.length?(days.length===1?isoDay(days[0]):isoDay(days[0])+' to '+isoDay(days.at(-1))):'';}
function nameList(names){const shown=names.slice(0,12);return shown.join(', ')+(names.length>12?' and '+number(names.length-12)+' more':'');}
/* The wording of a partial hold names only what it holds, from the delivery's
   own record (manifest.operatingTransfers.weekReplacement), and says that the
   source's other replacement buses are drawn. Nothing is hard-coded per source
   or week; a kind this interface does not know still reads as partial. */
function partialHoldText(manifest,hold,subject,partKind,label){
  const record=manifest?.operatingTransfers?.weekReplacement?.sources?.[subject],index=manifest?.operatingTransfers?.transfers;
  /* A row suppressed as a copy of another source's bus is drawn once, as that source's row, never as this one. */
  const own=Array.isArray(index)?index.filter(row=>row&&row.source===subject&&row.sourceSuppressionApplied!==true):null;
  const drawn=own?own.length:Number.isFinite(Number(record?.patterns))?Number(record.patterns):null,optional=own&&own.length>0&&own.every(row=>row.alternateSource===true)?' when this alternate source is switched on':'';
  const rest=drawn===null?'; its other replacement buses are drawn':drawn>0?'; its other '+number(drawn)+' replacement-bus pattern'+(drawn===1?' is':'s are')+' drawn'+optional:'; no other replacement bus from this source is shown this week';
  const dates=Number(hold.heldServiceDates),datesText=hold.heldServiceDates!==null&&hold.heldServiceDates!==undefined&&Number.isFinite(dates)?' ('+number(dates)+' bus service-date'+(dates===1?'':'s')+')':'';
  if(partKind==='unseen_route_identity'||partKind==='required_label_missing'){
    const items=(Array.isArray(record?.unseenRouteIdentities)?record.unseenRouteIdentities:[]).filter(item=>item&&item.holdKind===partKind);
    const names=items.map(item=>String(item.lineName||item.line||item.identity||'').trim()).filter(Boolean);
    const count=items.length||(Number.isFinite(Number(hold.heldRoutes))?Number(hold.heldRoutes):null);
    const routes=count===null?'Some routes':number(count)+' route'+(count===1?'':'s');
    const why=partKind==='unseen_route_identity'?(count===1?' has':' have')+' not been reviewed for replacement buses':(count===1?' lacks':' lack')+' the publisher’s replacement label or a train number';
    const unknown=hold.heldServiceDates===null&&items.length&&items.every(item=>item.serviceDates===null||item.serviceDates===undefined);
    return'Replacement buses: '+label+' is partly held this week. '+routes+datesText+why+', so '+(count===1?'it is':'they are')+' not shown'+(unknown?' (their buses, if any, were not extracted)':'')+(names.length?': '+nameList(names):'')+rest+'.';
  }
  if(partKind==='overlap_unresolved'){
    const ambiguous=record?.overlap?.ambiguous,names=Array.isArray(ambiguous)?ambiguous.map(item=>String(item?.line||item?.id||'').trim()).filter(Boolean):[];
    return'Replacement buses: '+label+' is partly held this week. '+(names.length?number(names.length)+' bus pattern'+(names.length===1?'':'s'):'Some buses')+datesText+' could not be matched to exactly one bus of the recommended source, so '+(names.length===1?'it is':'they are')+' not shown'+(names.length?': '+nameList(names):'')+rest+'.';
  }
  return'Replacement buses: '+label+' is partly held this week'+datesText+rest+'.';
}
/* Main-layer holds (replacement_main_layer:<source>[:no_public_number]) are about
   counting a source's replacement buses with trains in services/day, one plain
   sentence per recorded kind (rail_data/replacement_week.py MAIN_LAYER_HOLDS). */
const MAIN_LAYER_PART='no_public_number';
const MAIN_LAYER_TEXT={
  counting_not_wired:'its replacement buses this week are drawn but not yet counted with trains',
  review_expired:'its replacement-bus review has expired, so its buses are not counted with trains this week',
  scope_ended:'the reviewed replacement period has ended, so its buses are not counted with trains this week',
  no_week_evidence:'no verified replacement-bus timetable covers this week, so none are counted with trains',
  unregistered_source:'it has not been reviewed for replacement buses, so none are counted with trains this week',
  source_carried:'its timetable is carried from an earlier week, so its replacement buses are not counted this week',
  alternate_source:'its buses are counted once in the unified Polish source',
  no_public_number:'its buses are drawn but not counted: no public train number'
};
function mainLayerHoldText(hold,partKind,label){
  if(partKind===MAIN_LAYER_PART){const dates=Number(hold.heldServiceDates),known=hold.heldServiceDates!==null&&hold.heldServiceDates!==undefined&&Number.isFinite(dates);
    return'Replacement buses: '+label+' · some buses drawn but not counted: no public train number'+(known?' ('+number(dates)+' bus service-date'+(dates===1?'':'s')+')':'')+'; the rest are counted with trains.';}
  const words=MAIN_LAYER_TEXT[hold.holdKind];
  return'Replacement buses: '+label+' · '+(words||'its replacement buses are not counted with trains this week')+'.';
}
export function transferHolds(manifest,country){
  const holds=manifest?.operatingTransfers?.holds;if(!Array.isArray(holds))return[];
  const dates=Array.isArray(manifest?.dates)?manifest.dates:[],sources=new Map((manifest?.sources||[]).map(source=>[source.id,source]));
  return holds.filter(hold=>hold&&typeof hold==='object'&&(!Array.isArray(hold.deliveryDates)||!dates.length||hold.deliveryDates.length===dates.length&&hold.deliveryDates.every((date,index)=>date===dates[index]))).map(hold=>{
    const context=typeof hold.context==='string'?hold.context:'',prefix=['replacement_backfill:','replacement_week:','replacement_main_layer:'].find(value=>context.startsWith(value)),rest=prefix?context.slice(prefix.length):context;
    /* replacement_week:<source>:<kind> is a partial hold of one kind inside a source whose other rows are drawn. */
    const cut=prefix==='replacement_week:'||prefix==='replacement_main_layer:'?rest.indexOf(':'):-1,subject=cut>0?rest.slice(0,cut):rest,partKind=cut>0?rest.slice(cut+1):'';
    const source=sources.get(subject),label=source?.name||subject||'an unnamed replacement-bus review',holdCountry=source?.country||'';
    const lastVerified=typeof hold.lastVerified==='string'&&hold.lastVerified?(isoDay(hold.lastVerified)||hold.lastVerified):'',reviewed=dayRange(hold.reviewedDates),transfers=Array.isArray(hold.transferIds)?hold.transferIds.length:null;
    const since=lastVerified?'; last verified '+lastVerified:reviewed?'; last reviewed for '+reviewed:'',queued=Number(hold.heldServiceDates);
    let kind,text;
    if(prefix==='replacement_main_layer:'){kind='main_layer_'+(partKind?'part_'+partKind:typeof hold.holdKind==='string'&&hold.holdKind?hold.holdKind:'held');text=mainLayerHoldText(hold,partKind,label);}
    else if(partKind){kind='part_'+partKind;text=partialHoldText(manifest,hold,subject,partKind,label);}
    else if(hold.decision==='recorded_carry'){kind='recorded_carry';text='Replacement buses: no verified data this week for '+label+(lastVerified?'; last verified '+lastVerified:'')+'.';}
    else if(hold.status==='partly_held'&&Number.isFinite(queued)&&queued>0){kind='partly_held';text='Replacement buses: '+number(queued)+' bus service-date'+(queued===1?'':'s')+' for '+label+' this week '+(queued===1?'is':'are')+' awaiting review and not shown; the rest are drawn.';}
    else if(hold.holdKind==='unregistered_source'){kind='unregistered_source';text='Replacement buses: '+label+' has not been reviewed for replacement buses, so none are shown from it this week.';}
    else if(!hold.decision&&typeof hold.holdKind==='string'&&hold.holdKind&&transfers>0&&hold.status!=='partly_held'){
      /* A hold that names its rows holds those rows only: other rows of the same source can still be drawn. */
      const held=new Set(hold.transferIds.map(String)),index=manifest?.operatingTransfers?.transfers,scopeEnd=isoDay(hold.recordedScopeEndDate);
      const others=subject&&Array.isArray(index)?index.filter(row=>row&&row.source===subject&&!held.has(String(row.id))).length:null;
      kind='named_rows';text='Replacement buses: '+number(transfers)+' replacement'+(transfers===1?'':'s')+' for '+label+(reviewed?' reviewed for '+reviewed:scopeEnd?' reviewed up to '+scopeEnd:'')+' await'+(transfers===1?'s':'')+' a review for this week, so '+(transfers===1?'it is':'they are')+' not shown'+(lastVerified?'; last verified '+lastVerified:'')
        +(others===null?'':others>0?'; '+number(others)+' other replacement'+(others===1?'':'s')+' from this source '+(others===1?'is':'are')+' drawn':'; no other replacement from this source is shown this week')+'.';
    }
    else if(typeof hold.holdKind==='string'&&hold.holdKind&&hold.status!=='partly_held'){kind='week_held';text='Replacement buses: no verified data this week for '+label+since+'.';}
    else if(!hold.decision&&transfers!==null){kind='renewal';text='Replacement buses: '+number(transfers)+' replacement'+(transfers===1?'':'s')+' for '+label+(reviewed?' reviewed for '+reviewed:'')+' await'+(transfers===1?'s':'')+' a review for this week, so '+(transfers===1?'it is':'they are')+' not shown'+(lastVerified?'; last verified '+lastVerified:'')+'.';}
    else if(!hold.decision&&!hold.holdKind&&reviewed){kind='week_bound';text='Replacement buses: the review for '+label+' covers '+reviewed+' only, so its replacement buses are not shown this week'+(lastVerified?'; last verified '+lastVerified:'')+'.';}
    else{kind='other';text='Replacement buses: held this week for '+label+since+'.';}
    return{context,kind,label,country:holdCountry,text,reason:typeof hold.reason==='string'?hold.reason:''};
  }).filter(row=>!country||row.country===country);
}
/* Reviewed through joins carried into this week by rule (owner decision of
   12 November 2026), not by exact station id. The delivery records them in
   manifest.provenance.throughContinuations.weeklyRenewal.carriedByRule, with
   the notice text written by the composer for that week; nothing is static. */
export function carriedJoins(manifest){
  const renewal=manifest?.provenance?.throughContinuations?.weeklyRenewal,carried=renewal?.carriedByRule;
  const count=carried?.count;
  if(!Number.isInteger(count)||count<1||typeof carried.notice!=='string'||!carried.notice.trim())return null;
  return{count,notice:carried.notice.trim(),meaning:typeof carried.meaning==='string'?carried.meaning:''};
}
function carriedJoinsSection(parent,manifest){
  const joins=carriedJoins(manifest);if(!joins)return;
  const area=node('section','coverage-section coverage-carried-joins');area.appendChild(node('h3','','Through trains carried by rule'));
  area.appendChild(node('p','',joins.notice));
  parent.appendChild(area);
}
function transferHoldSection(parent,manifest,country){
  const rows=transferHolds(manifest,country);if(!rows.length)return;
  const area=node('section','coverage-section coverage-transfer-holds');area.appendChild(node('h3','','Replacement buses held this week'));
  area.appendChild(node('p','','The replacement buses each line names are not drawn, or not counted with trains in services/day, as each line says; a partly held source draws its other replacement buses. This does not establish that the railway is open or that no buses run; check the operator.'));
  const list=node('ul','coverage-carried-list');
  for(const row of rows){const item=node('li','');item.append(node('span','',row.text+(country||!row.country?'':' · '+row.country)));if(row.reason){const details=node('details','coverage-small');details.append(node('summary','','Recorded reason'),node('p','',row.reason));item.appendChild(details);}list.appendChild(item);}
  area.appendChild(list);parent.appendChild(area);
}

export function countryCoverageSummary(row,audience='public'){
  if(!row)return{label:'Coverage not certified',detail:'A country inventory is unavailable for this snapshot. Missing lines do not establish that no trains run.',tone:'unknown'};
  const statuses={
    domestic_inventory_not_acquired:['National inventory not acquired','A national timetable inventory has not been acquired. Any published foreign-feed excerpts do not establish national coverage.','gap'],
    domestic_inventory_withheld:['National feeds withheld','Acquired domestic feeds are excluded by this public release’s redistribution policy. Published excerpts do not fill national coverage.','held'],
    major_sources_withheld:['Some timetable feeds withheld','Some acquired feeds are excluded by this public release’s redistribution policy. Retained regional and foreign-feed records provide partial coverage.','held'],
    allowed_sources_not_exported:['Acquired feeds awaiting publication','Some acquired feeds permitted by the publication policy are not yet in this map snapshot.','gap'],
    partial_not_certified:['Partial timetable coverage','Published feeds cover part of the network. A complete operator and line inventory has not been independently established.','partial']
  };
  if(audience==='private')Object.assign(statuses,{
    domestic_inventory_not_acquired:['National inventory not acquired','A national timetable inventory has not been acquired. Available foreign-feed excerpts do not establish national coverage.','gap'],
    domestic_inventory_withheld:['National feeds not in this snapshot','Acquired domestic feeds are not part of this personal snapshot. Available excerpts do not establish national coverage.','held'],
    major_sources_withheld:['Some feeds not in this snapshot','Some acquired feeds are not part of this personal snapshot. Available regional and foreign-feed records provide partial coverage.','held'],
    allowed_sources_not_exported:['Acquired feeds awaiting inclusion','Some acquired feeds are not yet in this personal snapshot.','gap'],
    partial_not_certified:['Partial timetable coverage','Available feeds cover part of the network. A complete operator and line inventory has not been independently established.','partial']
  });
  const [label,detail,tone]=statuses[row.status]||['Coverage not certified','This snapshot does not establish complete country coverage.','unknown'];
  return{label,detail,tone,policyGap:row.passEligibilityCoverageNeedsReview===true};
}

let hooks,controller,census=null,censusKey=null,pending=null;
export function setupCoverage(options){
  hooks=options||{};
  if(controller)return controller;
  const dialog=$('coverageDialog'),button=$('coverageButton'),select=$('coverageCountry');
  if(!dialog||!button||!select)return{open:async()=>{},openCountry:async()=>false,refresh:async()=>{},refreshViewport:()=>{},getCountrySummary:async country=>({country,...countryCoverageSummary(null)})};
  const eyebrow=dialog.querySelector('.eyebrow'),intro=dialog.querySelector('.coverage-intro'),publicEyebrow=eyebrow?.textContent,publicIntro=intro?.textContent;
  function audience(){const declared=hooks.getManifest?.()?.publication?.audience;return declared==='private'||(!declared&&(census?.audience==='private'||census?.kind==='private_personal_rail_coverage'))?'private':'public';}
  async function ensure(){
    const manifest=hooks.getManifest?.(),path=manifest?.files?.coverage;
    const key=path?String(path)+'|'+String(manifest.createdAt||manifest.releaseId||'')+'|'+String(manifest.publication?.audience||''):null;
    if(!path||typeof hooks.load!=='function'){census=null;return null;}
    if(censusKey===key&&census)return census;
    if(censusKey===key&&pending)return pending;
    censusKey=key;
    pending=Promise.resolve().then(()=>hooks.load(path)).then(value=>{
      if(censusKey===key)census=value&&Array.isArray(value.countries)?value:null;
      return census;
    }).catch(()=>{if(censusKey===key)census=null;return null;}).finally(()=>{if(censusKey===key)pending=null;});
    return pending;
  }
  function selectedRows(){return(census?.countries||[]).filter(row=>typeof row.country==='string').sort((a,b)=>a.country.localeCompare(b.country));}
  function paragraph(parent,text,className){parent.appendChild(node('p',className,text));}
  function section(parent,title,text){const area=node('section','coverage-section');area.appendChild(node('h3','',title));if(text)paragraph(area,text);parent.appendChild(area);return area;}
  function refreshViewport(){
    // Historical observations belong in About and remain discoverable after
    // panning away from their source country or hiding that source on the map.
    const warning=$('timetableObservationWarning');if(!warning)return;
    const manifest=hooks.getManifest?.(),state=hooks.getState?.(),rows=historicalTimetableWarnings(manifest,{},[-180,-90,180,90]);
    const key=JSON.stringify(rows.map(row=>[row.id,row.label,row.detail,state?.sources instanceof Set&&!state.sources.has(row.id)]));
    if(warning.dataset.observations===key)return;warning.dataset.observations=key;
    warning.hidden=!rows.length;warning.replaceChildren();if(!rows.length)return;
    warning.appendChild(node('h3','detail-heading','TIMETABLE OBSERVATIONS'));
    for(const row of rows){
      const area=node('section','timetable-observation'),button=node('button','timetable-observation-warning',row.label+' · source details ↗');
      button.type='button';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','coverageDialog');button.onclick=()=>open(row.country);button.title=row.detail;
      area.append(button,node('p','',row.detail));
      if(state?.sources instanceof Set&&!state.sources.has(row.id))area.appendChild(node('small','','This source is currently hidden by map filters.'));
      warning.appendChild(area);
    }
  }
  function renderCountry(row){
    const body=$('coverageBody'),privateEdition=audience()==='private',summary=countryCoverageSummary(row,audience());body.replaceChildren();
    const title=node('div','coverage-country-heading');title.append(node('h3','',row.country),node('span','coverage-chip '+summary.tone,summary.label));body.appendChild(title);
    paragraph(body,summary.detail);
    const metrics=node('dl','coverage-metrics');
    for(const[label,value]of[[privateEdition?'Available station records':'Published station records',row.publicStationRecords],['Frequency connections',row.publicPrimaryFrequencyPairs],['Eurail connections',row.publicPrimaryIncludedPairs]]){const item=node('div');item.append(node('dt','',label),node('dd','',number(value)));metrics.appendChild(item);}body.appendChild(metrics);
    paragraph(body,'Snapshot totals before map filters. Connections are source-defined station pairs, not distinct trains or physical lines.','coverage-small');
    const visibility=countrySourceVisibility(row,hooks.getManifest?.(),hooks.getState?.());
    if(visibility.hidden.length){
      const area=section(body,visibility.allHidden?'Hidden by source filters':'Some sources are hidden',visibility.allHidden?'All published timetable sources serving '+row.country+' are switched off in this view.':number(visibility.hidden.length)+' published timetable source(s) serving '+row.country+' are switched off in this view.');
      if(typeof hooks.onShowSources==='function'){const show=node('button','coverage-country-card','Show '+row.country+' sources');show.type='button';show.onclick=()=>{hooks.onShowSources(visibility.hidden);renderCountry(row);};area.appendChild(show);}
    }
    carriedSection(body,hooks.getManifest?.(),row.country);
    operatingDatesSection(body,hooks.getManifest?.(),row.country);
    retainedSection(body,hooks.getManifest?.(),row.country);
    transferHoldSection(body,hooks.getManifest?.(),row.country);
    for(const source of hooks.getManifest?.()?.sources||[])if(source.timetableObservation?.kind==='historical_base_snapshot'&&(source.country===row.country||row.publicDomesticSources?.includes(source.id)))section(body,'Historical base timetable',observationDetails(source,hooks.getManifest?.()));
    if(summary.policyGap)section(body,'Eurail policy gap','Pass inclusion needs review. Zero included map connections does not establish that Eurail excludes this country or its trains.');
    if(row.heldHomeSourceCount>0){const area=section(body,privateEdition?'Acquired but not in this personal snapshot':'Acquired but withheld from this public edition',privateEdition?'These timetable feeds were acquired but are not included in this personal snapshot. Their absence does not establish that their trains are unavailable.':'These timetable feeds are acquired, but their inclusion is restricted by the current publication policy. This is a dataset publication gap, not a statement that their trains are unavailable.');const list=node('ul');for(const name of row.omittedFeedNames||[])list.appendChild(node('li','',String(name)));area.appendChild(list);}
    if(row.allowedHomeSourcesNotExported>0)section(body,privateEdition?'Awaiting snapshot inclusion':'Awaiting map publication',number(row.allowedHomeSourcesNotExported)+(privateEdition?' acquired feed(s) are not yet included in this personal snapshot.':' acquired feed(s) permitted by the publication policy have not been exported into this snapshot.'));
    const names=new Map((hooks.getManifest?.()?.sources||[]).map(source=>[source.id,source.name||source.publisher||(privateEdition?'Available timetable source':'Published timetable source')]));
    const published=(row.publicDomesticSources||[]).map(id=>names.get(id)).filter(Boolean);
    if(published.length){const area=section(body,privateEdition?'Available in your atlas':'Published sources with domestic calls');const list=node('ul');for(const name of [...new Set(published)])list.appendChild(node('li','',name));area.appendChild(list);}
    if(row.knownAcquisitionGaps){const details=node('details','coverage-section');details.appendChild(node('summary','','Remaining acquisition and source gaps'));paragraph(details,row.knownAcquisitionGaps);body.appendChild(details);}
    if(row.publicSchematicOrUnresolvedDomesticRows>0)paragraph(body,number(row.publicSchematicOrUnresolvedDomesticRows)+' source rows have schematic or unresolved geometry and may be hidden by map filters.','coverage-small');
  }
  function render(){
    const rows=selectedRows(),body=$('coverageBody'),manifest=hooks.getManifest?.(),privateEdition=audience()==='private';
    if(eyebrow)eyebrow.textContent=privateEdition?'PERSONAL TIMETABLE COVERAGE':publicEyebrow;
    if(intro)intro.textContent=privateEdition?'Missing lines do not mean there are no trains. This panel describes the data in your personal snapshot, not which trains run or where a Eurail pass is valid.':publicIntro;
    const dates=census?.dates||manifest?.dates||[];
    $('coverageDates').textContent=dates.length?dates[0]+' to '+dates.at(-1):'Dated timetable snapshot';
    $('coverageSummary').textContent=census?number(census.publishedSources)+(privateEdition?' sources available in your atlas · ':' published sources · ')+number(census.heldSources)+(privateEdition?' acquired sources not in this personal snapshot · ':' held sources · ')+number(rows.length)+' countries in scope. '+(census.completeCountryCount>0?number(census.completeCountryCount)+' countries certified complete by this audit.':'No country is certified complete.'):privateEdition?'Country-by-country coverage is unavailable for this snapshot. Treat your atlas network as partial.':'Country-by-country coverage is unavailable for this snapshot. Treat the published network as partial.';
    const previous=select.value;select.replaceChildren(new Option('All countries',''));
    for(const row of rows)select.appendChild(new Option(row.country,row.country));
    select.disabled=!rows.length;if(rows.some(row=>row.country===previous))select.value=previous;
    const selected=rows.find(row=>row.country===select.value);if(selected){renderCountry(selected);return;}
    body.replaceChildren();
    if(!rows.length){paragraph(body,privateEdition?'Missing snapshot data does not mean there is no train service. Check an operator timetable before planning a journey.':'Missing public data does not mean there is no train service. Check an operator timetable before planning a journey.');return;}
    carriedSection(body,manifest,'');
    operatingDatesSection(body,manifest,'');
    retainedSection(body,manifest,'');
    carriedJoinsSection(body,manifest);
    transferHoldSection(body,manifest,'');
    const grid=node('div','coverage-country-list');
    for(const row of rows){const summary=countryCoverageSummary(row,audience()),item=node('button','coverage-country-card');item.type='button';item.append(node('strong','',row.country),node('span','',summary.label+(summary.policyGap?' · Eurail review':'')));item.onclick=()=>{select.value=row.country;renderCountry(row);};grid.appendChild(item);}body.appendChild(grid);
  }
  // The carried-joins record lives in the deferred provenance part of a slim
  // start-up manifest. It is read only once the dialog opens, after the first
  // render, and the panel redraws when it arrives; a failed read shows nothing.
  async function withProvenance(){
    const manifest=hooks.getManifest?.();
    if(!manifest||carriedJoins(manifest)||typeof hooks.loadProvenance!=='function')return;
    try{if(await hooks.loadProvenance(manifest)&&dialog.open&&carriedJoins(hooks.getManifest?.()))render();}catch{}
  }
  async function open(country){
    if(!dialog.open)dialog.showModal();$('coverageBody').replaceChildren(node('p','','Reading snapshot coverage…'));
    await ensure();render();if(country&&selectedRows().some(row=>row.country===country)){select.value=country;render();}
    await withProvenance();
  }
  // coverage=<name> from a link: open at that country only when it is listed; an unknown
  // name opens nothing (resolves false) so the caller can drop it. With no census rows
  // to check against, behave as open().
  async function openCountry(country){
    if(!country)return open().then(()=>true);
    await ensure();const rows=selectedRows();
    if(rows.length&&!rows.some(row=>row.country===country))return false;
    await open(country);return true;
  }
  select.onchange=render;button.onclick=()=>open();$('closeCoverage').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  controller={open,openCountry,refreshViewport,refresh:async()=>{refreshViewport();census=null;censusKey=null;pending=null;if(dialog.open){await ensure();render();}},getCountrySummary:async country=>{await ensure();const row=selectedRows().find(row=>row.country===country),summary=countryCoverageSummary(row,audience());return{country,...summary,row,shortText:country+': '+summary.label.toLowerCase()+'.'};}};
  return controller;
}
