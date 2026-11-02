export const MODES = {
  frequency:{title:'Service frequency',kicker:'FREQUENCY',subtitle:'Trains and temporary replacement buses between recorded station calls.'},
  leg:{title:'Compare a journey leg',kicker:'JOURNEY',subtitle:'Choose two stations to compare recorded through services.'},
  eurail:{title:'Eurail network',kicker:'EURAIL',subtitle:'Included services; reservations and supplements are shown separately.'},
  hubs:{title:'Major hub connections',kicker:'HUBS',subtitle:'Through recorded services between major city catchments.'},
  italy:{title:'Eurail in Italy',kicker:'ITALY',subtitle:'Included Italian station pairs in the available public sources.'}
};
export const PASS_MODES=new Set(['eurail','hubs','italy']);
export const EUROPE_BOUNDS=[[35.1,-11.5],[61.7,33.5]], ITALY_BOUNDS=[[36.2,6.4],[47.4,19.2]];
export function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
export function escapeHTML(s){return String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
const daySelections=new WeakMap();
export function selectedDays(day,dates){let selections=daySelections.get(dates);if(!selections){selections=new Map();daySelections.set(dates,selections);}if(selections.has(day))return selections.get(day);const result=computeSelectedDays(day,dates);selections.set(day,result);return result;}
function computeSelectedDays(day,dates){if(/^day-\d$/.test(day))return[Number(day.slice(4))].filter(i=>i<dates.length);return dates.map((d,i)=>[new Date(d+'T12:00:00Z').getUTCDay(),i]).filter(([w])=>day==='weekdays'?w>0&&w<6:day==='weekend'?w===0||w===6:true).map(x=>x[1]);}
export function sumDays(row,day,dates,field='daily',weekly='weekly'){const days=selectedDays(day,dates),array=row[field];if(Array.isArray(array))return days.reduce((sum,i)=>sum+(Number(array[i])||0),0);return day==='all'?(Number(row[weekly])||0):0;}
export function effectivePass(state){return PASS_MODES.has(state.mode)||state.pass;}
export function isTemporaryReplacement(row){return row?.serviceMode==='temporary_replacement_bus';}
export function serviceVisible(row,state){return row?.serviceMode!=='coach'&&(!isTemporaryReplacement(row)||state.replacements!==false);}
export function reviewedCount(edge,state,dates,boarding=state.mode==='hubs'){if(!serviceVisible(edge,state))return 0;return boarding?sumDays(edge,state.day,dates,'reviewedEurailBoardableDaily','reviewedEurailBoardableWeekly'):sumDays(edge,state.day,dates,'reviewedEurailDaily','reviewedEurailWeekly');}
export function conditionalCount(edge,state,dates){if(!serviceVisible(edge,state))return 0;if(state.mode==='eurail'&&state.charge&&state.charge!=='all')return 0;const unknown=state.mode==='eurail'?sumDays(edge._passPolicy||{},state.day,dates,'unknownDaily'):0;const boarding=state.mode==='hubs',raw=boarding?sumDays(edge,state.day,dates,'conditionalBoardableDaily','conditionalBoardableWeekly'):sumDays(edge,state.day,dates,'conditionalDaily','conditionalWeekly'),reviewedIntersection=boarding?sumDays(edge,state.day,dates,'reviewedConditionalBoardableDaily','reviewedConditionalBoardableWeekly'):sumDays(edge,state.day,dates,'reviewedConditionalDaily','reviewedConditionalWeekly');return Math.max(0,raw-reviewedIntersection)+unknown;}
export function edgeCount(edge,state,dates){if(!serviceVisible(edge,state))return 0;if(state.mode==='eurail'&&['reservation','supplement','free'].includes(state.charge))return sumDays(edge._passPolicy||{},state.day,dates,state.charge+'Daily');const boarding=state.mode==='hubs';return effectivePass(state)?sumDays(edge,state.day,dates,boarding?'eurailBoardableDaily':'eurailDaily',boarding?'eurailBoardableWeekly':'eurailWeekly')+reviewedCount(edge,state,dates):sumDays(edge,state.day,dates,boarding?'boardableDaily':'daily',boarding?'boardableWeekly':'weekly');}
export function perDay(edge,state,dates){return edgeCount(edge,state,dates)/Math.max(1,selectedDays(state.day,dates).length);}
export function threshold(value){return Math.round(Math.exp(Number(value)/100*Math.log(151))-1);}
export function isItaly(country){return ['it','italy','italia'].includes(String(country||'').toLowerCase());}
export function readState(search){const p=new URLSearchParams(search),mode=p.get('view');const lat=Number(p.get('lat')),lon=Number(p.get('lon')),zoom=Number(p.get('z'));return{mode:MODES[mode]?mode:'frequency',day:/^(all|weekdays|weekend|day-[0-6])$/.test(p.get('day')||'')?p.get('day'):'all',pass:p.get('pass')==='1',review:p.get('review')==='1',charge:['reservation','supplement','free'].includes(p.get('charge'))?p.get('charge'):'all',alternatives:p.get('alt')==='1',replacements:p.get('replacements')!=='0',hubs:p.get('hubs')!=='0',schematic:p.get('schematic')!=='0',legend:p.get('key')!=='0',closedCorridors:p.get('works')!=='0',min:Math.max(0,Math.min(100,Number(p.get('min'))||0)),sources:p.has('src')?new Set((p.get('src')||'').split(',').filter(Boolean)):null,from:p.get('from')||'',to:p.get('to')||'',edge:p.get('edge')||'',center:p.has('lat')&&Number.isFinite(lat)&&Math.abs(lat)<=85&&Number.isFinite(lon)&&Math.abs(lon)<=180&&zoom>=2&&zoom<=19?[lat,lon,zoom]:null};}
export function serializeState(state,map){const p=new URLSearchParams();p.set('view',state.mode);if(state.day!=='all')p.set('day',state.day);if(state.pass)p.set('pass','1');if(state.review)p.set('review','1');if(['reservation','supplement','free'].includes(state.charge))p.set('charge',state.charge);if(state.alternatives)p.set('alt','1');if(state.replacements===false)p.set('replacements','0');if(!state.hubs)p.set('hubs','0');if(!state.schematic)p.set('schematic','0');if(state.legend===false)p.set('key','0');if(state.closedCorridors===false)p.set('works','0');if(state.min)p.set('min',state.min);if(state.sources&&(!state.defaultSources||state.sources.size!==state.defaultSources.size||[...state.sources].some(id=>!state.defaultSources.has(id))))p.set('src',[...state.sources].sort().join(','));if(state.from)p.set('from',state.from);if(state.to)p.set('to',state.to);if(state.edge)p.set('edge',state.edge);if(map){const c=map.getCenter();p.set('lat',c.lat.toFixed(3));p.set('lon',c.lng.toFixed(3));p.set('z',map.getZoom().toFixed(2));}return'?'+p.toString();}
export function formatNumber(n){return new Intl.NumberFormat('en-GB',{maximumFractionDigits:n<10?1:0}).format(Number(n)||0);}
export function dateLabel(day,dates){if(day==='all')return'all 7 service dates';if(day==='weekdays')return'weekdays';if(day==='weekend')return'the weekend';const d=dates[Number(day.slice(4))];return d?new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}):'selected dates';}
// Fixed doubling bands make the same frequency comparable across views and
// zooms. The former scale saturated near94/day; busy corridors exceed1000/day.
export const FREQUENCY_BREAKS=Object.freeze([0,4,8,16,32,64,128,256,512]);
export const FREQUENCY_COLORS=Object.freeze(['#7053a6','#505da8','#3278a5','#16858b','#458b59','#a28b25','#d57b24','#cf512d','#a62736']);
export const FREQUENCY_LABELS=Object.freeze(['<4','4','8','16','32','64','128','256','512+']);
export function frequencyBand(value){const n=Number(value)||0;let index=0;while(index<FREQUENCY_BREAKS.length-1&&n>=FREQUENCY_BREAKS[index+1])index++;return index;}
export function colorFor(value){return FREQUENCY_COLORS[frequencyBand(value)];}
export function searchStations(stations,query,limit=8){const q=normalize(query);if(q.length<2||limit<1)return[];const terms=q.split(' '),best=[],rank=s=>s._name.startsWith(q)?0:1;for(const station of stations){if(!terms.every(term=>station._name.includes(term)))continue;let i=0;while(i<best.length&&(rank(best[i])<rank(station)||(rank(best[i])===rank(station)&&(best[i].weekly||0)>=(station.weekly||0))))i++;if(i<limit){best.splice(i,0,station);if(best.length>limit)best.pop();}}return best;}
export function publicTrainLabels(values,{day='all',dates,limit=8}={}){
  const unique=new Map();
  for(const value of values||[]){
    if(!value?.label||/internal|retail|opaque/i.test(value.kind||''))continue;
    const key=String(value.label),previous=unique.get(key);
    if(!previous)unique.set(key,{...value,...(Array.isArray(value.daily)?{daily:value.daily.slice()}:{} )});
    else if(Array.isArray(value.daily)){if(!Array.isArray(previous.daily))previous.daily=Array(value.daily.length).fill(0);for(let i=0;i<value.daily.length;i++)previous.daily[i]=Math.max(Number(previous.daily[i])||0,Number(value.daily[i])||0);}
  }
  // These vectors describe identifier presence, never additional train counts.
  return[...unique.values()].filter(value=>!dates||!Array.isArray(value.daily)||sumDays(value,day,dates)>0).slice(0,Math.max(0,limit));
}
export function journeyMatchesEdge(journey,edge){
  if(!journey?.id||journey.source!==edge?.source||(journey.agencyPrimary!==false)!==(edge.primary!==false))return false;
  const calls=journey.stops||[],id=call=>Array.isArray(call)?call[0]:call?.id;
  return(journey.edgeIds||[]).some((identity,i)=>identity===edge.id&&id(calls[i])===edge.a&&id(calls[i+1])===edge.b);
}
export function journeyPublicTrainLines(journeys,edge,{fields=['daily']}={}){
  const directions=edge?._directionEdges||[edge],groups=new Map(),seen=new Set();
  for(const journey of journeys||[]){
    const identity=JSON.stringify([journey.source,journey.id,journey.agencyPrimary!==false]);
    if(seen.has(identity)||!directions.some(direction=>journeyMatchesEdge(journey,direction)))continue;seen.add(identity);
    const key=JSON.stringify([journey.source,journey.operator||'',journey.line||'']);
    if(!groups.has(key))groups.set(key,{source:journey.source,operator:journey.operator||'',label:journey.line||'',publicTrains:[]});
    for(const train of journey.publicTrains||[]){
      if(!Array.isArray(train.daily))continue;
      const daily=train.daily.map((value,i)=>fields.some(field=>Number(journey[field]?.[i])>0)?Math.max(0,Number(value)||0):0);
      if(daily.some(value=>value>0))groups.get(key).publicTrains.push({...train,daily});
    }
  }
  return[...groups.values()].map(group=>({...group,publicTrains:publicTrainLabels(group.publicTrains,{limit:Infinity})}));
}
export function worldPoint(lon,lat){const sin=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180);return[(lon+180)/360*256,(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*256];}
// (0,0) is a missing-location sentinel in retained European rail feeds. Keep
// those timetable records, but never turn that placeholder into a map path.
export function validMapLocation(lon,lat){return Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lon)<=180&&Math.abs(lat)<=85&&!(lon===0&&lat===0);}
export function approximateAlignment(edge){return /schematic|unresolved|train_ferry/.test(edge.geometryStatus||'');}
export function edgePointCount(edge){return Number.isInteger(edge?._pointCount)?edge._pointCount:edge?.coords?.length||0;}
export function prepareEdge(edge){if(!edge?.id||!Array.isArray(edge.coords)||edge.coords.length<2||edge.coords.some(p=>!Array.isArray(p)||!validMapLocation(p[0],p[1])))return null;if(edge._world instanceof Float64Array&&edge._world.length>=4&&edge._world.length%2===0&&edge._pointCount===edge._world.length/2&&Array.isArray(edge._bbox)&&edge._bbox.length===4&&edge._bbox.every(Number.isFinite))return edge;const world=[];let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const point of edge.coords){if(!Array.isArray(point)||!Number.isFinite(point[0])||!Number.isFinite(point[1]))return null;const[x,y]=worldPoint(point[0],point[1]);world.push(x,y);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}return{...edge,_world:new Float64Array(world),_pointCount:edge.coords.length,_bbox:[minX,minY,maxX,maxY]};}
export function segmentDistanceSquared(x,y,ax,ay,bx,by){let dx=bx-ax,dy=by-ay;if(dx||dy){const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));ax+=t*dx;ay+=t*dy;}return(x-ax)**2+(y-ay)**2;}
export function qualifiesEdge(edge,state,dates,stations){if(!serviceVisible(edge,state))return false;if(state.sources&&!state.sources.has(edge.source))return false;if(edge.primary===false&&!state.alternatives&&!state.altSourceIds?.has(edge.source))return false;if(!state.schematic&&approximateAlignment(edge))return false;if(state.mode==='italy'){const a=stations.get(edge.a),b=stations.get(edge.b);if(a&&b){if(!isItaly(a.country)||!isItaly(b.country))return false;}else if(!isItaly(edge.country))return false;}const normal=edgeCount(edge,state,dates),review=effectivePass(state)&&state.review?conditionalCount(edge,state,dates):0;return(normal>0&&normal/Math.max(1,selectedDays(state.day,dates).length)>=threshold(state.min))||(review>0&&review/Math.max(1,selectedDays(state.day,dates).length)>=threshold(state.min));}
export function aggregateMapPairs(input){
  const groups=new Map(),fields=['daily','eurailDaily','boardableDaily','eurailBoardableDaily','conditionalDaily','conditionalBoardableDaily','reviewedEurailDaily','reviewedEurailBoardableDaily','reviewedConditionalDaily','reviewedConditionalBoardableDaily'],weeks=['weekly','eurailWeekly','boardableWeekly','eurailBoardableWeekly','conditionalWeekly','conditionalBoardableWeekly','reviewedEurailWeekly','reviewedEurailBoardableWeekly','reviewedConditionalWeekly','reviewedConditionalBoardableWeekly'];
  for(const edge of input){
    const key=JSON.stringify([edge.source,edge.mapPairId||[edge.a,edge.b].sort(),edge.primary!==false,edge.geometryStatus]);let group=groups.get(key);
    if(!group){group={...edge,id:'pair:'+key,_directionEdges:[edge],reviewedRuleIds:[...edge.reviewedRuleIds||[]],_combined:false};groups.set(key,group);continue;}
    if(!group._combined){for(const field of fields){const values=group[field];group[field]=Array.isArray(values)&&values.some(value=>Number(value)>0)?values.slice():null;}group._combined=true;}
    group._directionEdges.push(edge);
    for(const field of weeks)group[field]=(Number(group[field])||0)+(Number(edge[field])||0);
    for(const field of fields){const values=edge[field];if(!Array.isArray(values))continue;if(!group[field]&&!values.some(value=>Number(value)>0))continue;if(!group[field])group[field]=Array(7).fill(0);for(let i=0;i<7;i++)group[field][i]+=Number(values[i])||0;}
    for(const id of edge.reviewedRuleIds||[])if(!group.reviewedRuleIds.includes(id))group.reviewedRuleIds.push(id);
  }
  return[...groups.values()];
}

// Updating a local geometry chunk must not regroup the entire continent.
// A direction replacement only rebuilds its own source-specific map pair.
export class MapPairIndex{
  constructor(){this.groups=new Map();this.memberKeys=new Map();this.dirty=true;this.cached=[];}
  set(edge){const key=JSON.stringify([edge.source,edge.mapPairId||[edge.a,edge.b].sort(),edge.primary!==false,edge.geometryStatus]),old=this.memberKeys.get(edge.id);if(old&&old!==key){const group=this.groups.get(old);group.members.delete(edge.id);if(group.members.size)group.value=aggregateMapPairs(group.members.values())[0];else this.groups.delete(old);}let group=this.groups.get(key);if(!group){group={members:new Map(),value:null};this.groups.set(key,group);}group.members.set(edge.id,edge);group.value=aggregateMapPairs(group.members.values())[0];this.memberKeys.set(edge.id,key);this.dirty=true;}
  values(){if(this.dirty){this.cached=[...this.groups.values()].map(group=>group.value);this.dirty=false;}return this.cached;}
}

// The index contains file membership, not an inferred journey. Ordered calls
// and pickup/drop-off permissions are still checked in the loaded patterns.
export function indexedJourneyFiles(index,fromIds,toIds){if(!Array.isArray(index?.files)||!index.stations||typeof index.stations!=='object')throw new Error('Invalid journey lookup');const collect=ids=>{const result=new Set();for(const id of ids){const entries=index.stations[id]||[];if(!Array.isArray(entries))throw new Error('Invalid station lookup');for(const i of entries){if(!Number.isInteger(i)||i<0||i>=index.files.length||typeof index.files[i]!=='string')throw new Error('Invalid journey file membership');result.add(i);}}return result;},from=collect(fromIds),to=collect(toIds);return[...from].filter(i=>to.has(i)).sort((a,b)=>a-b).map(i=>({url:index.files[i]}));}
