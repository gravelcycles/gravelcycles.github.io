import{escapeHTML as esc,formatNumber,isTemporaryReplacement,approximateAlignment}from'./atlas-core.js?v=e1213d59e9553b08';

export function replacementRailCorridor(row){return isTemporaryReplacement(row)&&row.geometryRole==='replacement_rail_corridor'&&!approximateAlignment(row);}

export function replacementEvidence(row){
  const entries=row?._directionEdges?.filter(isTemporaryReplacement)||[row];
  const replacements=entries.map(entry=>entry?.replacement).filter(Boolean);
  const urls=new Set();
  for(const info of replacements)for(const value of info.evidenceUrls||[]){
    try{const url=new URL(value);if(url.protocol==='https:')urls.add(url.href);}catch{}
  }
  return{validFrom:replacements.map(info=>info.validFrom).filter(Boolean).sort()[0]||null,
    validThrough:replacements.some(info=>!info.validThrough)?null:replacements.map(info=>info.validThrough).filter(Boolean).sort().at(-1)||null,
    evidenceUrls:[...urls]};
}

export function replacementHTML(row,{compact=false}={}){
  if(!isTemporaryReplacement(row))return'';
  const info=replacementEvidence(row),date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value:null;
  const from=date(info.validFrom),through=date(info.validThrough);
  const scope=through?(from?'Replacement period: '+from+' to '+through+'.':'Replacement through '+through+'.'):
    (from?'Replacement from '+from+'; end date not supplied.':'Replacement end date not supplied.');
  const links=info.evidenceUrls.map((url,index)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Operator notice${info.evidenceUrls.length>1?' '+(index+1):''} ↗</a>`).join(' · ');
  return compact?`<span class="replacement-label">Temporary replacement bus</span>`:
    `<section class="replacement-information"><span class="badge replacement">Temporary replacement bus</span><p>${esc(scope)}</p><p>Included in the service total. The actual vehicle is a bus; boarding stops and ticket conditions can differ from the train.</p>${replacementRailCorridor(row)?'<p>The line follows the railway corridor for orientation. Bus boarding may be near the station; this is not the road route driven.</p>':''}${links?'<div class="evidence-links">'+links+'</div>':''}</section>`;
}

export function serviceBreakdown(rows,count){
  let trains=0,replacements=0;
  for(const row of rows){const n=count(row);if(!(n>0))continue;if(isTemporaryReplacement(row))replacements+=n;else if(row.serviceMode!=='coach')trains+=n;}
  return{trains,replacements,total:trains+replacements};
}

export function serviceBreakdownHTML(breakdown,days=1){
  if(!(breakdown.replacements>0))return'';
  const divisor=Math.max(1,days);
  return`<p class="service-breakdown">${esc(formatNumber(breakdown.trains/divisor))} trains + ${esc(formatNumber(breakdown.replacements/divisor))} temporary replacement buses / day</p>`;
}
