import{approximateAlignment,inferredRailPath,inferredAlignment,sumDays,isTemporaryReplacement}from'./atlas-core.js?v=0c0a84033e50767c';
import{replacementRailCorridor}from'./replacement-service.js?v=0c0a84033e50767c';

export function connectionFrequencyInformation(edge,{day='all',dates=[],detail=null}={}){
  if(edge.throughConnection)return{
    scope:'Each recorded service counts once if it calls at both endpoints in order and permits boarding here and alighting there. Intermediate stops are included; changing trains is not. Counts retain this source, direction, service mode and date selection. The drawn alignment represents this station pair, not every train’s exact track path. Use Rail traffic for shared physical-section estimates.',
    boardingRestricted:false,boardingNote:''
  };
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
  if(inferredRailPath(edge))notes.push({
    title:'Inferred railway path',
    text:'The timetable confirms these services. This solid line follows a connected railway path inferred between the recorded stops, using known rail alignments or OpenStreetMap infrastructure. The shortest available rail path may differ from the route used by an individual train. Its color still shows scheduled frequency. To hide just these paths, turn off “Inferred rail paths” in Filters.'
  });
  else if(replacementRailCorridor(edge))notes.push({
    title:'Temporary replacement on this rail corridor',
    text:'This replacement service is drawn along the railway corridor for orientation. The actual vehicle is a bus; boarding may be at a nearby stop rather than the station platform. This line does not show the road route driven. Its color counts scheduled replacement services.'
  });
  else if(isTemporaryReplacement(edge)&&approximateAlignment(edge))notes.push({
    title:'Why this replacement connection is dashed',
    text:'The timetable confirms a temporary replacement bus, but its exact road route is not available. This approximate line joins recorded boarding stops; it does not trace the road driven or indicate a train on the tracks. Its color shows scheduled service frequency.'
  });
  else if(edge.geometryStatus==='train_ferry')notes.push({
    title:'Train carried by ferry',
    text:'The train is carried by ferry here. The line shows an approximate crossing, rather than railway tracks over the water. Its color shows the recorded scheduled train frequency.'
  });
  else if(approximateAlignment(edge))notes.push({
    title:'Why this line is dashed',
    text:'These services are in the timetable, but the available data does not establish their exact railway route. The dashed line joins recorded stops and may cut across land or water. Its color still shows scheduled frequency; the line does not trace the tracks used.'
  });
  else if(inferredAlignment(edge))notes.push({
    title:'Inferred railway corridor',
    text:'This solid line follows a railway corridor inferred from the available rail geometry. It does not certify the exact operating tracks used by these services. To hide these paths, turn off “Inferred rail paths” in Filters.'
  });
  if(approximateAlignment(edge))notes.at(-1).text+=' To hide these lines, turn off “Approximate paths · dotted” in Filters.';
  if(uncertain)notes.push({
    title:'Pass inclusion uncertain',
    text:'Amber lines show scheduled services with conditional or unknown Eurail pass eligibility. They are excluded from the included-train count. This is separate from whether the railway alignment is inferred or unresolved.'
  });
  return notes;
}
