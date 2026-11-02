import{approximateAlignment,sumDays}from'./atlas-core.js?v=c01c2da84bdcd979';

export function connectionFrequencyInformation(edge,{day='all',dates=[],detail=null}={}){
  const rows=edge._directionEdges||[edge];
  const movement=rows.reduce((n,row)=>n+sumDays(row,day,dates),0);
  const hasBoarding=row=>Array.isArray(row.boardableDaily)||(day==='all'&&Number.isFinite(row.boardableWeekly));
  let boardingRows=rows,knownBoarding=rows.every(hasBoarding);
  if(!knownBoarding&&detail?.otherLines===0&&detail.lines?.length&&detail.lines.every(hasBoarding)
    &&detail.lines.reduce((n,row)=>n+sumDays(row,day,dates),0)===movement){boardingRows=detail.lines;knownBoarding=true;}
  const boardable=knownBoarding?boardingRows.reduce((n,row)=>n+sumDays(row,day,dates,'boardableDaily','boardableWeekly'),0):null;
  return{
    scope:'This count covers one source and services with these consecutive recorded calls. Other trains between these stations may call at intermediate stops and appear on separate lines. Overlapping lines are not a total for the railway corridor.',
    boardingRestricted:movement>0&&boardable===0,
    boardingNote:movement>0&&boardable===0?'These trains run between the stations, but this source does not allow a passenger journey between them. They are counted as train movements, not permitted passenger trips.':''
  };
}

export function lineInformation(edge,{uncertain=false}={}){
  const notes=[];
  if(edge.geometryStatus==='train_ferry')notes.push({
    title:'Why this crossing is dashed',
    text:'The train is carried by ferry here. The dashed line shows an approximate crossing, rather than railway tracks over the water. Its color shows the recorded scheduled train frequency.'
  });
  else if(approximateAlignment(edge))notes.push({
    title:'Why this line is dashed',
    text:'These services are in the timetable, but the available data does not establish their exact railway route. The dashed line joins recorded stops and may cut across land or water. Its color still shows scheduled frequency; the line does not trace the tracks used.'
  });
  if(approximateAlignment(edge))notes.at(-1).text+=' To hide these lines, turn off “Show approximate service alignments” in Filters.';
  if(uncertain)notes.push({
    title:'Why there are amber dashes',
    text:'Amber dashes show scheduled services with conditional or unknown Eurail pass eligibility. They are excluded from the included-train count. This is separate from whether the railway alignment is approximate.'
  });
  return notes;
}
