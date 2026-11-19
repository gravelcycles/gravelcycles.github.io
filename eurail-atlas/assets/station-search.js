import{normalize,validMapLocation}from'./atlas-core.js?v=133f74a0e1b8e2bc';
import{stationSearchText,stationSourceSelected,stationSourceLabel,stationMemberIds}from'./station-identity.js?v=133f74a0e1b8e2bc';
import{stationInScope}from'./project-scope.js?v=133f74a0e1b8e2bc';
import{countryMatches}from'./explorer-core.js?v=133f74a0e1b8e2bc';
import{latinSpellings}from'./transliterate.js?v=133f74a0e1b8e2bc';

const searchNameCache=new WeakMap();
function searchNames(station){
  let cached=searchNameCache.get(station);
  if(!cached||cached.name!==station.name||cached.aliases!==station.aliases||cached.foldedName!==station._name){
    const names=[station._name||normalize(station.name),...(station.aliases||[]).map(normalize)];cached={name:station.name,aliases:station.aliases,foldedName:station._name,names:[...names,...names.flatMap(latinSpellings)]};searchNameCache.set(station,cached);
  }
  return cached.names;
}
function insertBest(best,row,limit,compare){
  let low=0,high=best.length;
  while(low<high){const middle=(low+high)>>>1;if(compare(row,best[middle])<0)high=middle;else low=middle+1;}
  if(low<limit){best.splice(low,0,row);if(best.length>limit)best.pop();}
}
export function stationOptions(stations,query,state={},limit=10){
  const q=normalize(query),best=[];if(q.length<2||limit<1)return[];
  // A query typed in Cyrillic or Greek also matches Latin names, and the reverse
  // through the Latin spellings in the station's search text.
  const queries=[q,...latinSpellings(q)],termSets=queries.map(value=>value.split(' '));
  const compare=(a,b)=>a.rank-b.rank||Number(b.selected)-Number(a.selected)||(b.s.weekly||0)-(a.s.weekly||0)||(a.s.name||'').localeCompare(b.s.name||'')||a.s.id.localeCompare(b.s.id);
  for(const s of stations){
    if(!stationInScope(s,state)||state.mode==='countries'&&state.country&&!countryMatches(s.country,state.country))continue;
    const text=stationSearchText(s);if(!termSets.some(terms=>terms.every(term=>text.includes(term))))continue;
    const names=searchNames(s),rank=queries.some(value=>names.includes(value))?0:queries.some(value=>names.some(name=>name.startsWith(value)))?1:2;
    insertBest(best,{s,rank,selected:stationSourceSelected(s,state)},limit,compare);
  }
  return best.map(row=>row.s);
}
export function nearbyStationRecords(station,stations,limit=5){
  if(!validMapLocation(station.lon,station.lat))return[];
  const members=new Set(stationMemberIds(station)),best=[],latitudeLimit=150/111320,longitudeScale=Math.cos(station.lat*Math.PI/180),compare=(a,b)=>a.distance-b.distance||(a.s.name||'').localeCompare(b.s.name||'');
  for(const s of stations){
    if(s.id===station.id||!validMapLocation(s.lon,s.lat)||Math.abs(s.lat-station.lat)>latitudeLimit||Math.abs((s.lon-station.lon)*longitudeScale)>latitudeLimit)continue;
    if(stationMemberIds(s).some(id=>members.has(id)))continue;
    const distance=111320*Math.hypot((s.lon-station.lon)*longitudeScale,s.lat-station.lat);
    if(distance<=150)insertBest(best,{s,distance},limit,compare);
  }
  return best.map(row=>row.s);
}

export function setupStationSearch({getStations,getState,ensureStations,ensureQuickStations=null,isComplete=()=>true,getCities=()=>[],onPick,sourceName,onOpen}){
  const root=document.getElementById('stationSearch'),input=document.getElementById('stationSearchInput'),list=document.getElementById('stationSearchResults'),status=document.getElementById('stationSearchStatus'),toggle=document.getElementById('stationSearchToggle');
  let choices=[],active=-1,sequence=0,timer=0;
  function hide(){sequence++;list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
  function close(){hide();root.hidden=true;toggle.setAttribute('aria-expanded','false');}
  function select(station){close();input.value=station.name;onPick(station);}
  function paint(cities,{partial=false}={}){
    choices=[...cities.filter(city=>!city.noServices),...stationOptions(getStations(),input.value,getState()),...cities.filter(city=>city.noServices)];active=-1;list.replaceChildren();input.removeAttribute('aria-activedescendant');
    for(const[sIndex,station]of choices.entries()){
      const option=document.createElement('li');option.id='station-search-option-'+sIndex;option.setAttribute('role','option');option.setAttribute('aria-selected','false');
      const name=document.createElement('strong');name.textContent=station.name;option.appendChild(name);
      const details=document.createElement('small'),inactive=!stationSourceSelected(station,getState());
      details.textContent=station.isCityArea?['All stations',station.country,station.noServices?'no recorded trains in this view':''].filter(Boolean).join(' · '):[station.country,stationSourceLabel(station,sourceName),inactive?'sources not selected':'',validMapLocation(station.lon,station.lat)?'':'location unavailable'].filter(Boolean).join(' · ');option.appendChild(details);
      option.onmousedown=event=>event.preventDefault();option.onclick=()=>select(station);list.appendChild(option);
    }
    list.hidden=!choices.length;input.setAttribute('aria-expanded',String(!!choices.length));status.textContent=partial?(choices.length?choices.length+' results so far · loading all stations…':'Loading all stations…'):choices.length?choices.length+' results found.':normalize(input.value).length<2?'Enter at least two characters.':'No city or station matches. Try another spelling.';
  }
  // The full station index is several megabytes. Until it arrives, answer
  // from the start-up station list (main stations) and the city names, then
  // repaint with every station.
  async function search(){
    const ticket=++sequence,current=()=>ticket===sequence&&!root.hidden&&document.activeElement===input;status.textContent='Loading station index…';
    const full=ensureStations(),cities=getCities(input.value);
    try{
      if(ensureQuickStations&&!isComplete()){
        const quick=await Promise.race([full.then(()=>null),Promise.all([cities,ensureQuickStations()]).then(([value])=>value)]).catch(()=>null);
        if(quick&&!isComplete()&&current())paint(quick,{partial:true});
      }
      // City areas are marked "no recorded trains" only against the full index,
      // so they are looked up again once it is in.
      await Promise.all([full,cities]);const value=await getCities(input.value);if(current())paint(value);
    }
    catch{if(ticket===sequence)status.textContent='Station search could not load. Type again to retry.';}
  }
  function open(){onOpen?.();root.hidden=false;toggle.setAttribute('aria-expanded','true');input.focus();if(input.value)input.select();search();}
  toggle.onclick=()=>root.hidden?open():close();
  // Start the index download as soon as the search button is approached.
  for(const type of['pointerenter','touchstart','focus'])toggle.addEventListener(type,()=>{ensureStations().catch(()=>{});},{once:true,passive:true});document.getElementById('closeStationSearch').onclick=()=>{close();toggle.focus();};
  input.oninput=()=>{hide();clearTimeout(timer);timer=setTimeout(search,80);};
  input.onkeydown=event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();toggle.focus();return;}
    if(event.key==='Tab'&&root.getAttribute('aria-modal')!=='true'){close();return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      if(!choices.length||list.hidden)return;event.preventDefault();active=(active+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;
      [...list.children].forEach((option,i)=>{option.classList.toggle('active',i===active);option.setAttribute('aria-selected',String(i===active));});input.setAttribute('aria-activedescendant',list.children[active].id);list.children[active].scrollIntoView({block:'nearest'});
    }
    if(event.key==='Enter'&&choices.length&&!list.hidden){event.preventDefault();select(choices[Math.max(0,active)]);}
  };
  document.addEventListener('pointerdown',event=>{if(!root.contains(event.target)&&!toggle.contains(event.target))close();});
  document.addEventListener('focusin',event=>{if(!root.hidden&&!root.contains(event.target)&&event.target!==toggle)close();});
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.target.closest('input,textarea,select,[contenteditable=true]')&&!document.querySelector('dialog[open]')){event.preventDefault();open();}});
  return{close,open,refresh:()=>{if(!root.hidden&&document.activeElement===input)search();}};
}
