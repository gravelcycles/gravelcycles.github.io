import{approximateAlignment,sumDays,isTemporaryReplacement}from'./atlas-core.js?v=5b93a3430fea6c94';
import{replacementRailCorridor}from'./replacement-service.js?v=5b93a3430fea6c94';

export function connectionFrequencyInformation(edge,{day='all',dates=[],detail=null}={}){
  const rows=edge._directionEdges||[edge];
  const movement=rows.reduce((n,row)=>n+sumDays(row,day,dates),0);
  const hasBoarding=row=>Array.isArray(row.boardableDaily)||(day==='all'&&Number.isFinite(row.boardableWeekly));
  let boardingRows=rows,knownBoarding=rows.every(hasBoarding);
  if(!knownBoarding&&detail?.otherLines===0&&detail.lines?.length&&detail.lines.every(hasBoarding)
    &&detail.lines.reduce((n,row)=>n+sumDays(row,day,dates),0)===movement){boardingRows=detail.lines;knownBoarding=true;}
  const boardable=knownBoarding?boardingRows.reduce((n,row)=>n+sumDays(row,day,dates,'boardableDaily','boardableWeekly'),0):null;
  return{
    scope:'This count covers one source and services with these consecutive recorded calls. Other services between these stations may call at intermediate stops and appear on separate lines. Overlapping lines are not a total for the railway corridor.',
    boardingRestricted:movement>0&&boardable===0,
    boardingNote:movement>0&&boardable===0?'These services run between the stations, but this source does not allow a passenger journey between them. They are counted as service movements, not permitted passenger trips.':''
  };
}

export function lineInformation(edge,{uncertain=false}={}){
  const notes=[];
  if(replacementRailCorridor(edge))notes.push({
    title:'Temporary replacement on this rail corridor',
    text:'This replacement service is drawn along the railway corridor for orientation. The actual vehicle is a bus; boarding may be at a nearby stop rather than the station platform. This line does not show the road route driven. Its color counts scheduled replacement services.'
  });
  else if(isTemporaryReplacement(edge)&&approximateAlignment(edge))notes.push({
    title:'Why this replacement connection is dashed',
    text:'The timetable confirms a temporary replacement bus, but its exact road route is not available. This approximate line joins recorded boarding stops; it does not trace the road driven or indicate a train on the tracks. Its color shows scheduled service frequency.'
  });
  else if(edge.geometryStatus==='train_ferry')notes.push({
    title:'Why this crossing is dashed',
    text:'The train is carried by ferry here. The dashed line shows an approximate crossing, rather than railway tracks over the water. Its color shows the recorded scheduled train frequency.'
  });
  else if(approximateAlignment(edge))notes.push({
    title:'Why this line is dashed',
    text:'These services are in the timetable, but the available data does not establish their exact railway route. The dashed line joins recorded stops and may cut across land or water. Its color still shows scheduled frequency; the line does not trace the tracks used.'
  });
  if(approximateAlignment(edge))notes.at(-1).text+=' To hide these lines, turn off “Approximate paths · dotted” in Filters.';
  if(uncertain)notes.push({
    title:'Why there are amber dashes',
    text:'Amber dashes show scheduled services with conditional or unknown Eurail pass eligibility. They are excluded from the included-train count. This is separate from whether the railway alignment is approximate.'
  });
  return notes;
}
