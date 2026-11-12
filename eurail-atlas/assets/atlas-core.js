import{isPhysicalSection,sectionCount}from'./physical-heat.js?v=eb01a6b303604e81';
import{edgeInScope}from'./project-scope.js?v=eb01a6b303604e81';
import{continuationMetrics}from'./through-continuations.js?v=eb01a6b303604e81';

export const MODES = {
  frequency:{title:'Service frequency',kicker:'FREQUENCY',subtitle:'Same-service availability between recorded calls, including intermediate stops.'},
  traffic:{title:'Physical rail traffic',kicker:'RAIL TRAFFIC',subtitle:'Estimated scheduled train traversals over shared sections of railway.'},
  eurail:{title:'Eurail network',kicker:'EURAIL',subtitle:'Included services; reservations and supplements are shown separately.'},
  hubs:{title:'City connections',kicker:'HUBS',subtitle:'Direct trains between major cities, including services calling at intermediate cities.'},
  countries:{title:'Explore a country',kicker:'COUNTRIES',subtitle:'Choose a country to explore its available railway data.'}
};
export const PASS_MODES=new Set(['eurail','italy']);
export const EUROPE_BOUNDS=[[35.1,-11.5],[61.7,45.5]], ITALY_BOUNDS=[[36.2,6.4],[47.4,19.2]];
// capFramePadding lives in its own small module so the Explore page can use
// it without loading the atlas core.
export{MAX_FRAME_PADDING_SHARE,capFramePadding}from'./frame-padding.js?v=eb01a6b303604e81';
// Station, city and country names are folded repeatedly (catalogue, hub ranking,
// search). Remember results; the bound keeps free-text queries from growing it.
const normalized=new Map();
export function normalize(s){
  const text=String(s||'');let value=normalized.get(text);
  if(value===undefined){value=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();if(normalized.size<120000)normalized.set(text,value);}
  return value;
}
export function escapeHTML(s){return String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
const daySelections=new WeakMap();
export function selectedDays(day,dates){let selections=daySelections.get(dates);if(!selections){selections=new Map();daySelections.set(dates,selections);}if(selections.has(day))return selections.get(day);const result=computeSelectedDays(day,dates);selections.set(day,result);return result;}
function computeSelectedDays(day,dates){if(/^day-\d$/.test(day))return[Number(day.slice(4))].filter(i=>i<dates.length);return dates.map((d,i)=>[new Date(d+'T12:00:00Z').getUTCDay(),i]).filter(([w])=>day==='weekdays'?w>0&&w<6:day==='weekend'?w===0||w===6:true).map(x=>x[1]);}
export function sumDays(row,day,dates,field='daily',weekly='weekly'){const days=selectedDays(day,dates),array=row[field];if(Array.isArray(array))return days.reduce((sum,i)=>sum+(Number(array[i])||0),0);return day==='all'?(Number(row[weekly])||0):0;}
export function effectivePass(state){return PASS_MODES.has(state.mode)||state.pass;}
export function usesHubConnections(state){return state.mode==='hubs';}
export const CHARGE_BITS=Object.freeze({reservation:1,supplement:2,free:4,chargeUnknown:8});
export const CHARGE_MASKS=Object.freeze([1,2,3,4,8,9,10]);
export function normalizeCharge(value){if(value==='none')return'none';const kinds=String(value||'').split(',');return kinds.length&&kinds.every(kind=>Object.hasOwn(CHARGE_BITS,kind))?[...new Set(kinds)].sort((a,b)=>CHARGE_BITS[a]-CHARGE_BITS[b]).join(','):'all';}
export function chargeFiltered(state){return state.mode==='eurail'&&normalizeCharge(state.charge)!=='all';}
export function chargeDescription(state){if(state.charge==='none')return'no fee conditions selected';return(state.charge||'all').split(',').map(kind=>({reservation:'reservation required',supplement:'supplement required',free:'no mandatory extras',chargeUnknown:'fees unresolved'}[kind]||'all fee conditions')).join(state.chargeMatch==='all'?' AND ':' OR ');}
export function inferredRailPath(edge){return edge.geometryStatus==='inferred_shortest_rail_path';}
// Geometry categories describe evidence, not the date a projection was added.
// Older graph paths and supported partial clips are inferred alignments too.
export function inferredAlignment(edge){return /^inferred(?:_|$)/.test(edge.geometryStatus||'');}
export function matchesGeometry(edge,state){return inferredAlignment(edge)?state.inferred!==false:approximateAlignment(edge)?state.schematic!==false:state.aligned!==false;}
export function chargeCount(policy,state,dates){
  const charge=normalizeCharge(state.charge);if(charge==='none')return 0;
  const kinds=charge.split(','),mask=kinds.reduce((bits,kind)=>bits|(CHARGE_BITS[kind]||0),0);
  if(CHARGE_MASKS.every(value=>Array.isArray(policy?.['chargeMask'+value+'Daily'])))return CHARGE_MASKS.reduce((count,value)=>count+((state.chargeMatch==='all'?(value&mask)===mask:!!(value&mask))?sumDays(policy,state.day,dates,'chargeMask'+value+'Daily'):0),0);
  // Older cached projections can still answer single-condition links. Never
  // sum overlapping marginal counts to guess a composite selection.
  return kinds.length===1?sumDays(policy||{},state.day,dates,kinds[0]+'Daily'):0;
}
export function isTemporaryReplacement(row){return row?.serviceMode==='temporary_replacement_bus';}
// Canonical booleans are authoritative. The fallback accepts manually-created
// legacy states; URL migration happens once in readState below.
function serviceLayerSelected(state,key){
  if(typeof state[key]==='boolean')return state[key];
  return key==='trains'?!['replacement','works'].includes(state.service):!['trains','works'].includes(state.service);
}
export function serviceLayers(state){return{trains:serviceLayerSelected(state,'trains'),replacements:serviceLayerSelected(state,'replacements')};}
export function serviceVisible(row,state){return row?.serviceMode!=='coach'&&!(state.mode==='hubs'&&isTemporaryReplacement(row))&&serviceLayerSelected(state,isTemporaryReplacement(row)?'replacements':'trains');}
// Published counters of a connection, less the trains another selected feed
// also publishes (rail-duplicates.js). Without that packet: the published ones.
const countedOnce=(edge,metrics,state)=>metrics&&state?.duplicates?state.duplicates.metrics(edge.id,metrics):metrics;
export const throughMetrics=(edge,state)=>countedOnce(edge,edge._throughServices,state);
export const passPolicyMetrics=(edge,state)=>countedOnce(edge,edge._passPolicy,state);
export const edgeMetrics=(edge,state,dates)=>continuationMetrics(edge,state,dates)||throughMetrics(edge,state)||edge;
export function reviewedCount(edge,state,dates,boarding=usesHubConnections(state)){if(!serviceVisible(edge,state))return 0;const metric=edgeMetrics(edge,state,dates);return boarding?sumDays(metric,state.day,dates,'reviewedEurailBoardableDaily','reviewedEurailBoardableWeekly'):sumDays(metric,state.day,dates,'reviewedEurailDaily','reviewedEurailWeekly');}
export function conditionalCount(edge,state,dates){if(!serviceVisible(edge,state)||chargeFiltered(state))return 0;if(isPhysicalSection(edge))return sectionCount(edge,{...state,pass:true},selectedDays(state.day,dates),{conditional:true});const context=continuationMetrics(edge,state,dates);if(context)return sumDays(context,state.day,dates,'uncertainDaily');if(edge._throughServices)return sumDays(throughMetrics(edge,state),state.day,dates,'uncertainDaily');const unknown=state.mode==='eurail'?sumDays(passPolicyMetrics(edge,state)||{},state.day,dates,'unknownDaily'):0;const boarding=usesHubConnections(state),raw=boarding?sumDays(edge,state.day,dates,'conditionalBoardableDaily','conditionalBoardableWeekly'):sumDays(edge,state.day,dates,'conditionalDaily','conditionalWeekly'),reviewedIntersection=boarding?sumDays(edge,state.day,dates,'reviewedConditionalBoardableDaily','reviewedConditionalBoardableWeekly'):sumDays(edge,state.day,dates,'reviewedConditionalDaily','reviewedConditionalWeekly');return Math.max(0,raw-reviewedIntersection)+unknown;}
export function edgeCount(edge,state,dates){if(!serviceVisible(edge,state)||state.mode==='eurail'&&state.included===false)return 0;if(isPhysicalSection(edge))return state.mode==='traffic'?sectionCount(edge,{...state,pass:effectivePass(state)},selectedDays(state.day,dates)):0;if(state.mode==='traffic')return 0;const metric=edgeMetrics(edge,state,dates);if(chargeFiltered(state))return chargeCount(continuationMetrics(edge,state,dates)||throughMetrics(edge,state)||passPolicyMetrics(edge,state),state,dates);const boarding=usesHubConnections(state);return effectivePass(state)?sumDays(metric,state.day,dates,boarding?'eurailBoardableDaily':'eurailDaily',boarding?'eurailBoardableWeekly':'eurailWeekly')+reviewedCount(edge,state,dates):sumDays(metric,state.day,dates,boarding?'boardableDaily':'daily',boarding?'boardableWeekly':'weekly');}
export function perDay(edge,state,dates){return edgeCount(edge,state,dates)/Math.max(1,selectedDays(state.day,dates).length);}
export function threshold(value){return Math.round(Math.exp(Number(value)/100*Math.log(151))-1);}
// Keep the original scalar scale so every existing renderer/context caller
// uses the same minimum. New exact bands have an explicit URL encoding.
export function frequencyStateForMinimum(value){
  const n=Number(value);return FREQUENCY_BREAKS.includes(n)?Math.log(n+1)/Math.log(151)*100:0;
}
export function exactFrequencyMinimum(value){
  const n=Number(value);if(!Number.isFinite(n))return null;
  return FREQUENCY_BREAKS.find(minimum=>Math.abs(frequencyStateForMinimum(minimum)-n)<1e-9)??null;
}

export function isItaly(country){return ['it','italy','italia'].includes(String(country||'').toLowerCase());}
export function stationDisplayMode(state){return state.stations===false||state.stationDisplay==='hidden'?'hidden':state.stationDisplay==='always'?'always':'auto';}
export function readState(search){const p=new URLSearchParams(search),requested=p.get('view'),mode=requested==='leg'?'frequency':requested==='italy'?'countries':requested;
  const legacy=p.get('service'),trains=p.has('trains')?p.get('trains')!=='0':!['replacement','works'].includes(legacy),
    replacements=p.has('replacements')?p.get('replacements')!=='0':!['trains','works'].includes(legacy),
    closedCorridors=p.has('works')?p.get('works')==='1':legacy==='works';
  const requestedMinimum=Number(p.get('minfreq')),minimum=p.has('minfreq')&&FREQUENCY_BREAKS.includes(requestedMinimum)?frequencyStateForMinimum(requestedMinimum):Math.max(0,Math.min(100,Number(p.get('min'))||0));
  const lat=Number(p.get('lat')),lon=Number(p.get('lon')),zoom=Number(p.get('z'));return{mode:MODES[mode]?mode:'frequency',day:/^(all|weekdays|weekend|day-[0-6])$/.test(p.get('day')||'')?p.get('day'):'all',pass:p.get('pass')==='1'||requested==='italy',review:p.get('review')==='1',charge:normalizeCharge(p.get('charge')),chargeMatch:p.get('match')==='all'?'all':'any',included:p.get('included')!=='0',trains,replacements,aligned:p.get('aligned')!=='0',inferred:p.get('inferred')!=='0',alternatives:p.get('alt')==='1',hubs:p.get('hubs')!=='0',schematic:p.get('schematic')!=='0',legend:p.get('key')!=='0',closedCorridors,physicalRailways:p.get('physical')==='1',min:minimum,sources:p.has('src')?new Set((p.get('src')||'').split(',').filter(Boolean)):null,from:p.get('from')||'',to:p.get('to')||'',edge:p.get('edge')||'',station:p.get('station')||(requested==='leg'?p.get('from')||'':''),country:(p.get('country')||(requested==='italy'?'Italy':'')).slice(0,100),hubCount:[50,100,250,500].includes(Number(p.get('cities')))?Number(p.get('cities')):100,hubExamples:['fast','overnight'].includes(p.get('examples'))?p.get('examples'):'all',hubCity:p.get('city')||'',stations:!['0','hidden'].includes(p.get('stations')),stationDisplay:['0','hidden'].includes(p.get('stations'))?'hidden':p.get('stations')==='always'?'always':'auto',center:p.has('lat')&&Number.isFinite(lat)&&Math.abs(lat)<=85&&Number.isFinite(lon)&&Math.abs(lon)<=180&&zoom>=2&&zoom<=19?[lat,lon,zoom]:null};}
export function serializeState(state,map){const p=new URLSearchParams(),layers=serviceLayers(state),closedCorridors=typeof state.closedCorridors==='boolean'?state.closedCorridors:state.service==='works';p.set('view',state.mode);if(state.country)p.set('country',state.country);if(state.hubCount&&state.hubCount!==100)p.set('cities',state.hubCount);if(state.hubExamples&&state.hubExamples!=='all')p.set('examples',state.hubExamples);if(state.hubCity)p.set('city',state.hubCity);if(state.day!=='all')p.set('day',state.day);if(state.pass)p.set('pass','1');if(state.review)p.set('review','1');if(normalizeCharge(state.charge)!=='all')p.set('charge',normalizeCharge(state.charge));if(state.chargeMatch==='all')p.set('match','all');if(state.included===false)p.set('included','0');if(!layers.trains)p.set('trains','0');if(!layers.replacements)p.set('replacements','0');if(state.aligned===false)p.set('aligned','0');if(state.inferred===false)p.set('inferred','0');if(state.alternatives)p.set('alt','1');if(!state.hubs)p.set('hubs','0');if(!state.schematic)p.set('schematic','0');if(state.legend===false)p.set('key','0');if(closedCorridors)p.set('works','1');if(state.physicalRailways)p.set('physical','1');if(state.min){const exact=exactFrequencyMinimum(state.min);if(exact===null)p.set('min',state.min);else p.set('minfreq',exact);}if(state.sources&&(!state.defaultSources||state.sources.size!==state.defaultSources.size||[...state.sources].some(id=>!state.defaultSources.has(id))))p.set('src',[...state.sources].sort().join(','));if(state.from)p.set('from',state.from);if(state.to)p.set('to',state.to);if(state.edge)p.set('edge',state.edge);if(state.station)p.set('station',state.station);const stationDisplay=stationDisplayMode(state);if(stationDisplay==='hidden')p.set('stations','0');else if(stationDisplay==='always')p.set('stations','always');if(map){const c=map.getCenter();p.set('lat',c.lat.toFixed(3));p.set('lon',c.lng.toFixed(3));p.set('z',map.getZoom().toFixed(2));}return'?'+p.toString();}
export function formatNumber(n){return new Intl.NumberFormat('en-GB',{maximumFractionDigits:n<10?1:0}).format(Number(n)||0);}
export function dateLabel(day,dates){if(day==='all')return'all 7 service dates';if(day==='weekdays')return'weekdays';if(day==='weekend')return'the weekend';const d=dates[Number(day.slice(4))];return d?new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}):'selected dates';}
// The service week named by its ends. A week inside one month keeps the compact "1–7 Nov" form; a week
// crossing a month or year boundary names both ends, so "29 Nov – 5 Dec" is never shown as "29–5 Nov".
export function dateRangeLabels(dates){
  const first=new Date(dates[0]+'T12:00:00Z'),last=new Date(dates.at(-1)+'T12:00:00Z'),sameYear=first.getUTCFullYear()===last.getUTCFullYear(),sameMonth=sameYear&&first.getUTCMonth()===last.getUTCMonth();
  const end=(date,month,year)=>date.getUTCDate()+' '+date.toLocaleDateString('en-GB',{month,timeZone:'UTC'})+(year?' '+date.getUTCFullYear():'');
  const range=month=>sameMonth?(first.getUTCDate()===last.getUTCDate()?'':first.getUTCDate()+'–')+end(last,month,false):end(first,month,!sameYear)+' – '+end(last,month,!sameYear);
  return{short:range('short'),long:range('long'),snapshot:range('short')+(sameYear?' '+first.getUTCFullYear():'')};
}
// Fixed doubling bands make the same frequency comparable across views and
// zooms. The former scale saturated near94/day; busy corridors exceed1000/day.
export const FREQUENCY_BREAKS=Object.freeze([0,4,8,16,32,64,128,256,512]);
export const FREQUENCY_COLORS=Object.freeze(['#7053a6','#505da8','#3278a5','#16858b','#458b59','#a28b25','#d57b24','#cf512d','#a62736']);
export const FREQUENCY_LABELS=Object.freeze(['<4','4','8','16','32','64','128','256','512+']);
export function frequencyBand(value){const n=Number(value)||0;let index=0;while(index<FREQUENCY_BREAKS.length-1&&n>=FREQUENCY_BREAKS[index+1])index++;return index;}
export function colorFor(value){return FREQUENCY_COLORS[frequencyBand(value)];}
export function searchStations(stations,query,limit=8){const q=normalize(query);if(q.length<2||limit<1)return[];const terms=q.split(' '),best=[],names=s=>[s._name||normalize(s.name),...(s.aliases||[]).map(normalize)],rank=s=>names(s).some(name=>name.startsWith(q))?0:1;for(const station of stations){const text=names(station).join(' ')+' '+normalize(station.country);if(!terms.every(term=>text.includes(term)))continue;let i=0;while(i<best.length&&(rank(best[i])<rank(station)||(rank(best[i])===rank(station)&&(best[i].weekly||0)>=(station.weekly||0))))i++;if(i<limit){best.splice(i,0,station);if(best.length>limit)best.pop();}}return best;}
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
export function journeyThroughMatch(journey,edge){
  if(edge?.a===edge?.b)return null;
  if(!journey?.id||journey.source!==edge?.source||(journey.agencyPrimary!==false)!==(edge.primary!==false))return null;
  const mode=row=>['rail','train',undefined,null].includes(row.serviceMode)?'rail':row.serviceMode;
  if(mode(journey)!==mode(edge))return null;
  const calls=journey.stops||[];let from=-1;
  for(let i=0;i<calls.length;i++){
    const call=calls[i],identity=edge.isHub?journey.hubIds?.[i]:Array.isArray(call)?call[0]:call?.id,
      pickup=String((Array.isArray(call)?call[1]:call?.pickup)??'0'),dropoff=String((Array.isArray(call)?call[2]:call?.dropoff)??'0');
    if(from>=0&&identity===edge.b&&dropoff!=='1')return{from,to:i,conditional:String((Array.isArray(calls[from])?calls[from][1]:calls[from]?.pickup)??'0')!=='0'||dropoff!=='0'};
    if(from<0&&identity===edge.a&&pickup!=='1')from=i;
  }
  return null;
}
export function journeyMatchesEdge(journey,edge){
  if(edge?.throughConnection)return!!journeyThroughMatch(journey,edge);
  if(!journey?.id||journey.source!==edge?.source||(journey.agencyPrimary!==false)!==(edge.primary!==false))return false;
  const calls=journey.stops||[],id=call=>Array.isArray(call)?call[0]:call?.id;
  if(edge.isHub){
    let previous=null;
    for(let i=0;i<calls.length;i++){
      if(journey.unmappedCallIndices?.includes(i)){previous=null;continue;}
      const hub=journey.hubIds?.[i];if(!hub)continue;
      if(previous&&previous.hub!==hub&&previous.hub===edge.a&&hub===edge.b){
        const from=calls[previous.index],to=calls[i],pickup=Array.isArray(from)?from[1]:from.pickup,dropoff=Array.isArray(to)?to[2]:to.dropoff;
        if(String(pickup??'0')!=='1'&&String(dropoff??'0')!=='1')return true;
      }
      previous={hub,index:i};
    }
    return false;
  }
  return(journey.edgeIds||[]).some((identity,i)=>identity===edge.id&&id(calls[i])===edge.a&&id(calls[i+1])===edge.b);
}
export function journeyPublicTrainLines(journeys,edge,{fields=['daily']}={}){
  const directions=(edge?._directionEdges||[edge]).map(direction=>edge?.throughConnection?{...direction,throughConnection:true}:direction),groups=new Map(),seen=new Set();
  for(const journey of journeys||[]){
    const identity=JSON.stringify([journey.source,journey.snapshot,journey.id,journey.agencyPrimary!==false]);
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
export function stationMapPoint(station){return station&&validMapLocation(station.lon,station.lat)?[station.lat,station.lon]:null;}
export function nearbyStationLocations(a,b){return!!stationMapPoint(a)&&!!stationMapPoint(b)&&Math.abs(a.lat-b.lat)<.006&&Math.abs(a.lon-b.lon)<.008;}
// A path that leaps this far between two vertices is not following track there,
// whatever its source label says. Draw the line dashed and say so, instead of
// presenting a chord across the map as a railway alignment.
export const STRAIGHT_JUMP_KM=25;
export function longestJumpKm(coords){let best=0;for(let i=1;i<coords.length;i++){const a=coords[i-1],b=coords[i],lat=b[1]-a[1],lon=b[0]-a[0];
  // 0.15° is under 17 km on either axis (under 24 km diagonally): ordinary track
  // vertices cannot reach the threshold, so skip the trigonometry for them.
  if(lat<.15&&lat>-.15&&lon<.15&&lon>-.15)continue;const dy=lat*111.32,dx=lon*111.32*Math.cos((a[1]+b[1])*Math.PI/360);if(dx*dx+dy*dy>best*best)best=Math.hypot(dx,dy);}return best;}
export function straightJump(edge){return Number(edge.straightJumpKm)>=STRAIGHT_JUMP_KM;}
export function approximateAlignment(edge){return /schematic|unresolved|train_ferry/.test(edge.geometryStatus||'');}
// Stroke style only: geometry filters keep following the published status.
export function dashedAlignment(edge){return approximateAlignment(edge)||straightJump(edge);}
export function edgePointCount(edge){return Number.isInteger(edge?._pointCount)?edge._pointCount:edge?.coords?.length||0;}
export function prepareEdge(edge){if(!edge?.id||!Array.isArray(edge.coords)||edge.coords.length<2||edge.coords.some(p=>!Array.isArray(p)||!validMapLocation(p[0],p[1])))return null;if(edge._world instanceof Float64Array&&edge._world.length>=4&&edge._world.length%2===0&&edge._pointCount===edge._world.length/2&&Array.isArray(edge._bbox)&&edge._bbox.length===4&&edge._bbox.every(Number.isFinite))return edge;const world=[];let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const point of edge.coords){if(!Array.isArray(point)||!Number.isFinite(point[0])||!Number.isFinite(point[1]))return null;const[x,y]=worldPoint(point[0],point[1]);world.push(x,y);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}const jump=isPhysicalSection(edge)?0:longestJumpKm(edge.coords);return{...edge,_world:new Float64Array(world),_pointCount:edge.coords.length,_bbox:[minX,minY,maxX,maxY],...(jump>=STRAIGHT_JUMP_KM?{straightJumpKm:Math.round(jump)}:{})};}
export function segmentDistanceSquared(x,y,ax,ay,bx,by){let dx=bx-ax,dy=by-ay;if(dx||dy){const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));ax+=t*dx;ay+=t*dy;}return(x-ax)**2+(y-ay)**2;}
export function qualifiesEdge(edge,state,dates,stations){if(!edgeInScope(edge,state))return false;const physical=isPhysicalSection(edge);if((state.mode==='traffic')!==physical)return false;if(!physical&&state.sources&&!state.sources.has(edge.source))return false;if(!physical&&edge.primary===false&&!state.alternatives&&!state.altSourceIds?.has(edge.source))return false;if(!serviceVisible(edge,state)||!edge._cityConnection&&!matchesGeometry(edge,state))return false;if(state.mode==='italy'){const a=stations.get(edge.a),b=stations.get(edge.b);if(a&&b){if(!isItaly(a.country)||!isItaly(b.country))return false;}else if(!isItaly(edge.country))return false;}const normal=edgeCount(edge,state,dates),review=effectivePass(state)&&state.review?conditionalCount(edge,state,dates):0;return(normal>0&&normal/Math.max(1,selectedDays(state.day,dates).length)>=threshold(state.min))||(review>0&&review/Math.max(1,selectedDays(state.day,dates).length)>=threshold(state.min));}
// What a connection shows in the current view and date selection: its
// included services (all services outside the pass views) and, in a pass view
// with uncertain coverage shown, the services whose pass inclusion is
// uncertain. A connection is drawn, picked and listed for either
// (qualifiesEdge), so every place that puts a number beside one uses both.
export function shownCounts(edge,state,dates){
  const included=edgeCount(edge,state,dates),uncertain=effectivePass(state)&&state.review?conditionalCount(edge,state,dates):0;
  return{included,uncertain,total:included+uncertain};
}
// "36 included + 10 uncertain through services / day"; a single number when only one kind is shown.
export function shownCountText({included=0,uncertain=0}={},days=1,unit='services',format=formatNumber){
  const perDay=n=>format(n/Math.max(1,days));
  if(!uncertain)return`${perDay(included)} ${unit} / day`;
  if(!included)return`${perDay(uncertain)} uncertain ${unit} / day`;
  return`${perDay(included)} included + ${perDay(uncertain)} uncertain ${unit} / day`;
}
// Rows of the "connections on this track" chooser, busiest first: one row per
// station pair (and per feed when each train is counted on one feed's line
// only, `perFeed`), dated variants within a feed added up. A pair with
// nothing to show in the current view and dates has no row.
export function overlapRows(edges,state,dates,{label,qualifies=()=>true,perFeed=false}={}){
  const groups=new Map();
  for(const row of edges||[]){
    if(!qualifies(row))continue;
    const counts=shownCounts(row,state,dates);if(!(counts.total>0))continue;
    const text=label(row),key=JSON.stringify([text,isTemporaryReplacement(row),perFeed?row.source:null]);
    let group=groups.get(key);if(!group)groups.set(key,group={label:text,sources:new Map()});
    const source=group.sources.get(row.source);
    if(!source)group.sources.set(row.source,{row,...counts,best:counts.total,variants:1});
    else{source.included+=counts.included;source.uncertain+=counts.uncertain;source.total+=counts.total;source.variants++;if(counts.total>source.best){source.best=counts.total;source.row=row;}}
  }
  return[...groups.values()].map(group=>{const ranked=[...group.sources.values()].sort((a,b)=>b.total-a.total);return{...ranked[0],label:group.label,feeds:ranked.length};}).sort((a,b)=>b.total-a.total);
}
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

// SILENT licence class (publisher states no licence). Takedown requests go to
// the public Pages repository's issue tracker (coordinator decision, 11 Nov 2026).
export const SILENT_TAKEDOWN_CONTACT='https://github.com/gravelcycles/gravelcycles.github.io/issues';
export function silentLicenceNotice(notice){if(!notice||typeof notice!=='object'||notice.class!=='SILENT'||notice.takedown!==true)return null;return{label:'licence: none stated',takedown:`Publisher wants this removed? Open an issue at ${SILENT_TAKEDOWN_CONTACT}`};}
