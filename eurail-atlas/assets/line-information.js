import{approximateAlignment}from'./atlas-core.js?v=c09a9e213777d88e';

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
