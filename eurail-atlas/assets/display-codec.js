import{worldPoint,validMapLocation}from'./atlas-core.js?v=1e666867170d77aa';

export const DISPLAY_FORMAT='rail-atlas-display-v1';
const metrics=['daily','eurailDaily','reviewedEurailDaily','conditionalDaily','reviewedConditionalDaily'];
const invalid=()=>{throw new Error('Invalid compact atlas display payload');};
const dictionary=(values)=>{if(!Array.isArray(values)||values.some(value=>typeof value!=='string'))invalid();return values;};
const at=(values,index)=>{if(!Number.isInteger(index)||index<0||index>=values.length)invalid();return values[index];};

// The compact file is an aggregate display layer, never a direction record.
// Its full source-specific identity allows an atomic metadata/detail upgrade.
export function decodeDisplay(data){
  if(data?.format!==DISPLAY_FORMAT)return data;
  if(data.schemaVersion!==1)invalid();
  const sources=dictionary(data.sources),countries=dictionary(data.countries),geometry=dictionary(data.geometryStatuses);
  const {rows,daily,pairIds,offsets,coordinates}=data;
  if(!Array.isArray(rows)||!Array.isArray(daily)||!Array.isArray(pairIds)||pairIds.length!==rows.length||
    !Array.isArray(offsets)||offsets.length!==rows.length+1||offsets[0]!==0||!Array.isArray(coordinates)||coordinates.length%2||
    offsets.at(-1)*2!==coordinates.length)invalid();
  for(const values of daily)if(!Array.isArray(values)||values.length!==7||values.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))invalid();
  const modes=new Map();
  for(const [field,mode]of[['temporaryReplacementRows','temporary_replacement_bus'],['coachRows','coach']]){
    const indexes=data[field]??[];
    if(!Array.isArray(indexes))invalid();
    for(const index of indexes){if(!Number.isInteger(index)||index<0||index>=rows.length||modes.has(index))invalid();modes.set(index,mode);}
  }
  const edges=[],identities=new Set(),projected=new Float64Array(coordinates.length);
  for(let index=0;index<rows.length;index++){
    const row=rows[index],pair=pairIds[index],start=offsets[index],end=offsets[index+1];
    if(!Array.isArray(row)||row.length!==9||(row[3]!==0&&row[3]!==1)||
      !(typeof pair==='string'&&pair||Array.isArray(pair)&&pair.length===2&&pair.every(p=>typeof p==='string'))||
      !Number.isInteger(start)||!Number.isInteger(end)||start<0||end-start<2||end*2>coordinates.length)invalid();
    const source=at(sources,row[0]),country=at(countries,row[1]),geometryStatus=at(geometry,row[2]),primary=Boolean(row[3]);
    const id='pair:'+JSON.stringify([source,pair,primary,geometryStatus]);
    if(identities.has(id))invalid();identities.add(id);
    const world=projected.subarray(start*2,end*2);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,missingLocation=false;
    for(let i=start;i<end;i++){
      const lon=coordinates[i*2],lat=coordinates[i*2+1];
      if(typeof lon!=='number'||typeof lat!=='number'||!Number.isFinite(lon)||!Number.isFinite(lat)||lon< -180||lon>180||lat< -85||lat>85)invalid();
      if(!validMapLocation(lon,lat))missingLocation=true;
      const[x,y]=worldPoint(lon,lat),offset=(i-start)*2;world[offset]=x;world[offset+1]=y;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
    const edge={id,source,country,mapPairId:pair,primary,geometryStatus,_displayOnly:true,_startupIndex:index,_displayCatalog:data.catalog==='network'?'network':'overview',
      _world:world,_pointCount:end-start,_bbox:[minX,minY,maxX,maxY],
      coords:[[coordinates[start*2],coordinates[start*2+1]],[coordinates[(end-1)*2],coordinates[(end-1)*2+1]]]};
    if(modes.has(index))edge.serviceMode=modes.get(index);
    for(let field=0;field<metrics.length;field++)edge[metrics[field]]=at(daily,row[field+4]);
    // Preserve original row indexes: metadata pages use _startupIndex.
    if(!missingLocation)edges.push(edge);
  }
  return{edges,displayOnly:true,format:DISPLAY_FORMAT};
}
