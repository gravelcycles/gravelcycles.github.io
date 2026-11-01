/* Public snapshot coverage is separate from services running or pass validity. */
const $=id=>document.getElementById(id);
const number=value=>Number.isFinite(Number(value))?Number(value).toLocaleString('en-GB'):'—';
const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};

export function countryCoverageSummary(row){
  if(!row)return{label:'Coverage not certified',detail:'A country inventory is unavailable for this snapshot. Missing lines do not establish that no trains run.',tone:'unknown'};
  const statuses={
    domestic_inventory_not_acquired:['National inventory not acquired','A national timetable inventory has not been acquired. Any published foreign-feed excerpts do not establish national coverage.','gap'],
    domestic_inventory_withheld:['National feeds withheld','Acquired domestic feeds are excluded by this public release’s redistribution policy. Published excerpts do not fill national coverage.','held'],
    major_sources_withheld:['Some timetable feeds withheld','Some acquired feeds are excluded by this public release’s redistribution policy. Retained regional and foreign-feed records provide partial coverage.','held'],
    allowed_sources_not_exported:['Acquired feeds awaiting publication','Some acquired feeds permitted by the publication policy are not yet in this map snapshot.','gap'],
    partial_not_certified:['Partial timetable coverage','Published feeds cover part of the network. A complete operator and line inventory has not been independently established.','partial']
  };
  const [label,detail,tone]=statuses[row.status]||['Coverage not certified','This snapshot does not establish complete country coverage.','unknown'];
  return{label,detail,tone,policyGap:row.passEligibilityCoverageNeedsReview===true};
}

let hooks,controller,census=null,censusKey=null,pending=null;
export function setupCoverage(options){
  hooks=options||{};
  if(controller)return controller;
  const dialog=$('coverageDialog'),button=$('coverageButton'),select=$('coverageCountry');
  if(!dialog||!button||!select)return{open:async()=>{},refresh:async()=>{},getCountrySummary:async country=>({country,...countryCoverageSummary(null)})};
  async function ensure(){
    const manifest=hooks.getManifest?.(),path=manifest?.files?.coverage;
    const key=path?String(path)+'|'+String(manifest.createdAt||manifest.releaseId||''):null;
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
  function renderCountry(row){
    const body=$('coverageBody'),summary=countryCoverageSummary(row);body.replaceChildren();
    const title=node('div','coverage-country-heading');title.append(node('h3','',row.country),node('span','coverage-chip '+summary.tone,summary.label));body.appendChild(title);
    paragraph(body,summary.detail);
    const metrics=node('dl','coverage-metrics');
    for(const[label,value]of[['Published station records',row.publicStationRecords],['Frequency connections',row.publicPrimaryFrequencyPairs],['Eurail connections',row.publicPrimaryIncludedPairs]]){const item=node('div');item.append(node('dt','',label),node('dd','',number(value)));metrics.appendChild(item);}body.appendChild(metrics);
    paragraph(body,'Snapshot totals before map filters. Connections are source-defined station pairs, not distinct trains or physical lines.','coverage-small');
    if(summary.policyGap)section(body,'Eurail policy gap','Pass inclusion needs review. Zero included map connections does not establish that Eurail excludes this country or its trains.');
    if(row.heldHomeSourceCount>0){const area=section(body,'Acquired but withheld from this public edition','These timetable feeds are acquired, but their inclusion is restricted by the current publication policy. This is a dataset publication gap, not a statement that their trains are unavailable.');const list=node('ul');for(const name of row.omittedFeedNames||[])list.appendChild(node('li','',String(name)));area.appendChild(list);}
    if(row.allowedHomeSourcesNotExported>0)section(body,'Awaiting map publication',number(row.allowedHomeSourcesNotExported)+' acquired feed(s) permitted by the publication policy have not been exported into this snapshot.');
    const names=new Map((hooks.getManifest?.()?.sources||[]).map(source=>[source.id,source.name||source.publisher||'Published timetable source']));
    const published=(row.publicDomesticSources||[]).map(id=>names.get(id)).filter(Boolean);
    if(published.length){const area=section(body,'Published sources with domestic calls');const list=node('ul');for(const name of [...new Set(published)])list.appendChild(node('li','',name));area.appendChild(list);}
    if(row.knownAcquisitionGaps){const details=node('details','coverage-section');details.appendChild(node('summary','','Remaining acquisition and source gaps'));paragraph(details,row.knownAcquisitionGaps);body.appendChild(details);}
    if(row.publicSchematicOrUnresolvedDomesticRows>0)paragraph(body,number(row.publicSchematicOrUnresolvedDomesticRows)+' source rows have schematic or unresolved geometry and may be hidden by map filters.','coverage-small');
  }
  function render(){
    const rows=selectedRows(),body=$('coverageBody'),manifest=hooks.getManifest?.();
    const dates=census?.dates||manifest?.dates||[];
    $('coverageDates').textContent=dates.length?dates[0]+' to '+dates.at(-1):'Dated timetable snapshot';
    $('coverageSummary').textContent=census?number(census.publishedSources)+' published sources · '+number(census.heldSources)+' held sources · '+number(rows.length)+' countries in scope. '+(census.completeCountryCount>0?number(census.completeCountryCount)+' countries certified complete by this audit.':'No country is certified complete.'):'Country-by-country coverage is unavailable for this snapshot. Treat the published network as partial.';
    const previous=select.value;select.replaceChildren(new Option('All countries',''));
    for(const row of rows)select.appendChild(new Option(row.country,row.country));
    select.disabled=!rows.length;if(rows.some(row=>row.country===previous))select.value=previous;
    const selected=rows.find(row=>row.country===select.value);if(selected){renderCountry(selected);return;}
    body.replaceChildren();
    if(!rows.length){paragraph(body,'Missing public data does not mean there is no train service. Check an operator timetable before planning a journey.');return;}
    const grid=node('div','coverage-country-list');
    for(const row of rows){const summary=countryCoverageSummary(row),item=node('button','coverage-country-card');item.type='button';item.append(node('strong','',row.country),node('span','',summary.label+(summary.policyGap?' · Eurail review':'')));item.onclick=()=>{select.value=row.country;renderCountry(row);};grid.appendChild(item);}body.appendChild(grid);
  }
  async function open(country){
    if(!dialog.open)dialog.showModal();$('coverageBody').replaceChildren(node('p','','Reading snapshot coverage…'));
    await ensure();render();if(country&&selectedRows().some(row=>row.country===country)){select.value=country;render();}
  }
  select.onchange=render;button.onclick=()=>open();$('closeCoverage').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  controller={open,refresh:async()=>{census=null;censusKey=null;pending=null;if(dialog.open){await ensure();render();}},getCountrySummary:async country=>{await ensure();const row=selectedRows().find(row=>row.country===country);return{country,...countryCoverageSummary(row),row,shortText:country+': '+countryCoverageSummary(row).label.toLowerCase()+'.'};}};
  return controller;
}
