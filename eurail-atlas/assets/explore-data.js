// Explore-the-data delivery: one week of timed passenger trains, decoded into
// typed arrays shared by every Explore view. Format: scripts/build_explore_data.py.

export const CATEGORY_LABELS=['Regional','Long distance','High speed','Night'];
export const PASS_LABELS=['No reservation needed','Reservation required','Uncertain or conditional','Not included'];
const WEEKDAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

async function inflate(bytes){
  if(!(bytes[0]===0x1f&&bytes[1]===0x8b))return bytes;
  if(typeof DecompressionStream==='function'){
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const{gunzip}=await import('./gunzip.js?v=8eeddc2d0b1f1115');return gunzip(bytes);
}
async function fetchBytes(url,onProgress){
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Explore data HTTP ${response.status}: ${url}`);
  const total=Number(response.headers.get('content-length'))||0;
  if(!response.body?.getReader||!onProgress)return inflate(new Uint8Array(await response.arrayBuffer()));
  const reader=response.body.getReader(),chunks=[];let size=0;
  for(;;){const{done,value}=await reader.read();if(done)break;chunks.push(value);size+=value.byteLength;onProgress(size,total);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return inflate(bytes);
}
async function fetchJSON(url){return JSON.parse(new TextDecoder().decode(await fetchBytes(url)));}

function decodeTimetable(raw){
  // Typed-array views need 4-byte alignment of the underlying buffer.
  const bytes=raw.byteOffset%4?raw.slice():raw,buffer=bytes.buffer,base=bytes.byteOffset;
  if(String.fromCharCode(...bytes.subarray(0,4))!=='RXT2')throw new Error('Unsupported Explore timetable format');
  const head=new Uint32Array(buffer,base+4,5),[P,PS,PR,PC,T]=head;let offset=base+24;
  const take=(Type,count)=>{const view=new Type(buffer,offset,count);offset+=count*Type.BYTES_PER_ELEMENT;return view;};
  const patternStart=take(Uint32Array,P+1),profilePattern=take(Uint32Array,PR),dayStart=take(Uint32Array,8);
  const tripProfileDelta=take(Uint32Array,T),tripLabel=take(Uint32Array,T);
  const patternStation=take(Uint16Array,PS),profileRun=take(Uint16Array,PC),profileDwell=take(Uint16Array,PC),tripStart=take(Int16Array,T);
  if(offset!==base+bytes.byteLength)throw new Error('Explore timetable size mismatch');
  const profileStart=new Uint32Array(PR+1);
  for(let p=0;p<PR;p++){const pattern=profilePattern[p];profileStart[p+1]=profileStart[p]+patternStart[pattern+1]-patternStart[pattern];}
  if(profileStart[PR]!==PC)throw new Error('Explore timing profiles do not match their patterns');
  const profileArr=new Int32Array(PC),profileDep=new Int32Array(PC);
  for(let p=0;p<PR;p++){let clock=0;for(let i=profileStart[p];i<profileStart[p+1];i++){clock+=profileRun[i];profileArr[i]=clock;clock+=profileDwell[i];profileDep[i]=clock;}}
  const tripProfile=new Uint32Array(T),tripEnd=new Int32Array(T);
  for(let d=0;d<7;d++){let previous=0;for(let t=dayStart[d];t<dayStart[d+1];t++){previous=t===dayStart[d]?tripProfileDelta[t]:previous+tripProfileDelta[t];tripProfile[t]=previous;tripEnd[t]=tripStart[t]+profileArr[profileStart[previous+1]-1];}}
  return{patternStart,patternStation,profilePattern,profileStart,profileArr,profileDep,dayStart,tripProfile,tripStart,tripEnd,tripLabel,trips:T};
}

const RAD=Math.PI/180;
export function haversineKm(lat1,lon1,lat2,lon2){const p1=lat1*RAD,p2=lat2*RAD,h=Math.sin((p2-p1)/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin((lon2-lon1)*RAD/2)**2;return 12742*Math.asin(Math.sqrt(h));}

export async function loadExplore(baseURL,onProgress){
  const base=new URL(baseURL,location.href),manifest=await fetchJSON(new URL('manifest.json',base));
  if(manifest.schemaVersion!==1||manifest.kind!=='rail_explore_delivery')throw new Error('Unsupported Explore delivery');
  const asset=name=>{const url=new URL(name,base),sha=manifest.assets?.[name]?.sha256;if(sha)url.searchParams.set('v',sha.slice(0,16));return url;};
  const [stationsDoc,journeysDoc,summary,timetableBytes]=await Promise.all([
    fetchJSON(asset(manifest.files.stations)),fetchJSON(asset(manifest.files.journeys)),fetchJSON(asset(manifest.files.summary)),
    fetchBytes(asset(manifest.files.timetable),onProgress)]);
  const tt=decodeTimetable(timetableBytes);
  const rows=stationsDoc.rows,N=rows.length;
  const lat=new Float64Array(N),lon=new Float64Array(N),mx=new Float64Array(N),my=new Float64Array(N),country=new Uint16Array(N),hub=new Int16Array(N),names=new Array(N);
  for(let i=0;i<N;i++){const r=rows[i];names[i]=r[0];lat[i]=r[1];lon[i]=r[2];country[i]=r[3];hub[i]=r[4];
    mx[i]=(lon[i]+180)/360*256;const s=Math.sin(lat[i]*RAD);my[i]=(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*256;}
  const J=journeysDoc.rows,P=J.length,patternCategory=new Uint8Array(P),patternPass=new Uint8Array(P),patternKm=new Float32Array(P);
  for(let p=0;p<P;p++){patternCategory[p]=J[p][3];patternPass[p]=J[p][4];let km=0;for(let i=tt.patternStart[p]+1;i<tt.patternStart[p+1];i++){const a=tt.patternStation[i-1],b=tt.patternStation[i];km+=haversineKm(lat[a],lon[a],lat[b],lon[b]);}patternKm[p]=km;}
  const dates=manifest.dates.map((date,i)=>{const d=new Date(date+'T12:00:00Z');return{date,index:i,label:`${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${d.toLocaleString('en-GB',{month:'short',timeZone:'UTC'})}`};});
  return{manifest,summary,dates,stations:{N,names,lat,lon,mx,my,country,hub,countries:stationsDoc.countries,hubs:stationsDoc.hubs},
    journeys:{rows:J,operators:journeysDoc.operators,sources:journeysDoc.sources,labels:journeysDoc.labels,patternCategory,patternPass,patternKm},...tt};
}

// Position of each weekday (0 = Sunday) in a week of seven consecutive dates,
// whichever day the delivery starts on.
export function weekdayIndex(dates){const at=new Array(7).fill(-1);dates.forEach((date,i)=>{at[new Date(date+'T12:00:00Z').getUTCDay()]=i;});return at;}

// Name of the delivery's shared clock, read from its manifest sentence
// ("Minutes after 00:00 CEST (UTC+2) on each date"): CET in a winter week.
export function clockName(manifest){return(/00:00 ([A-Z]{2,5}) \(UTC/.exec(manifest?.clock||'')||[])[1]||'CET';}

// Calls of one trip: station rows and minutes on the delivery's shared clock.
export function tripCalls(data,trip){
  const profile=data.tripProfile[trip],pattern=data.profilePattern[profile],start=data.tripStart[trip];
  const from=data.patternStart[pattern],to=data.patternStart[pattern+1],p0=data.profileStart[profile],calls=[];
  for(let i=0;i<to-from;i++)calls.push({station:data.patternStation[from+i],arr:start+data.profileArr[p0+i],dep:start+data.profileDep[p0+i]});
  return calls;
}
export function tripPattern(data,trip){return data.profilePattern[data.tripProfile[trip]];}
export function tripInfo(data,trip){
  const pattern=tripPattern(data,trip),row=data.journeys.rows[pattern],label=data.tripLabel[trip],calls=tripCalls(data,trip);
  const line=row[0]||'',number=label===0xFFFFFFFF?'':data.journeys.labels[label]||'';
  // Run labels often already contain the line ("RJX 160" on line "RJX").
  const title=line&&number?(number.includes(line)?number:line.includes(number)?line:`${line} ${number}`):(line||number||'Train');
  return{pattern,title:title.trim(),operator:data.journeys.operators[row[1]]||'',source:data.journeys.sources[row[2]]||'',category:row[3],pass:row[4],
    from:data.stations.names[calls[0].station],to:data.stations.names[calls[calls.length-1].station],calls};
}
export function clockLabel(minutes){const m=((Math.round(minutes)%1440)+1440)%1440,day=Math.floor(Math.round(minutes)/1440);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')+(day>0?' (+1)':day<0?' (−1)':'');}

// Station search: prefix matches first, then word and substring matches;
// hub cities appear as city entries that select all their stations.
export function makeStationSearch(data){
  const fold=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  const S=data.stations,entries=[],cityStations=new Map();
  for(let i=0;i<S.N;i++){if(S.hub[i]>=0){const h=S.hubs[S.hub[i]];if(!cityStations.has(h))cityStations.set(h,[]);cityStations.get(h).push(i);}}
  const pretty=h=>h.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
  for(const [h,list] of cityStations)entries.push({kind:'city',name:pretty(h),key:fold(pretty(h)),stations:list,country:S.countries[S.country[list[0]]]});
  for(let i=0;i<S.N;i++)entries.push({kind:'station',name:S.names[i],key:fold(S.names[i]),stations:[i],country:S.countries[S.country[i]]});
  return function search(query,limit=8){
    const q=fold(query.trim());if(!q)return[];const scored=[];
    for(const e of entries){const at=e.key.indexOf(q);if(at<0)continue;const score=(at===0?0:/[\s\-(./]/.test(e.key[at-1])?1:2)+(e.kind==='city'?-0.5:0)+e.key.length/1000;scored.push([score,e]);}
    scored.sort((a,b)=>a[0]-b[0]);return scored.slice(0,limit).map(x=>x[1]);
  };
}
