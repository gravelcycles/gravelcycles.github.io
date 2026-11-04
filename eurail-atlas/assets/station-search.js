import{normalize,validMapLocation}from'./atlas-core.js?v=ba3c88c61a4e74aa';
import{stationSearchText,stationSourceSelected,stationSourceLabel,stationMemberIds}from'./station-identity.js?v=ba3c88c61a4e74aa';
import{stationInScope}from'./project-scope.js?v=ba3c88c61a4e74aa';
import{countryMatches}from'./explorer-core.js?v=ba3c88c61a4e74aa';

export function stationOptions(stations,query,state={},limit=10){
  const q=normalize(query),terms=q.split(' ');if(q.length<2)return[];
  return stations.filter(s=>stationInScope(s,state)&&(state.mode!=='countries'||!state.country||countryMatches(s.country,state.country))&&terms.every(term=>stationSearchText(s).includes(term))).map(s=>({s,rank:[s.name,...s.aliases||[]].some(name=>normalize(name)===q)?0:[s.name,...s.aliases||[]].some(name=>normalize(name).startsWith(q))?1:2,selected:stationSourceSelected(s,state)})).sort((a,b)=>a.rank-b.rank||Number(b.selected)-Number(a.selected)||(b.s.weekly||0)-(a.s.weekly||0)||(a.s.name||'').localeCompare(b.s.name||'')||a.s.id.localeCompare(b.s.id)).slice(0,limit).map(row=>row.s);
}
export function nearbyStationRecords(station,stations,limit=5){
  if(!validMapLocation(station.lon,station.lat))return[];
  const members=new Set(stationMemberIds(station));
  return stations.filter(s=>s.id!==station.id&&!stationMemberIds(s).some(id=>members.has(id))&&validMapLocation(s.lon,s.lat)).map(s=>({s,distance:111320*Math.hypot((s.lon-station.lon)*Math.cos(station.lat*Math.PI/180),s.lat-station.lat)})).filter(row=>row.distance<=150).sort((a,b)=>a.distance-b.distance||(a.s.name||'').localeCompare(b.s.name||'')).slice(0,limit).map(row=>row.s);
}

export function setupStationSearch({getStations,getState,ensureStations,onPick,sourceName,onOpen}){
  const root=document.getElementById('stationSearch'),input=document.getElementById('stationSearchInput'),list=document.getElementById('stationSearchResults'),status=document.getElementById('stationSearchStatus'),toggle=document.getElementById('stationSearchToggle');
  let choices=[],active=-1,sequence=0,timer=0;
  function hide(){sequence++;list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
  function close(){hide();root.hidden=true;toggle.setAttribute('aria-expanded','false');}
  function select(station){close();input.value=station.name;onPick(station);}
  function paint(){
    choices=stationOptions(getStations(),input.value,getState());active=-1;list.replaceChildren();input.removeAttribute('aria-activedescendant');
    for(const[sIndex,station]of choices.entries()){
      const option=document.createElement('li');option.id='station-search-option-'+sIndex;option.setAttribute('role','option');option.setAttribute('aria-selected','false');
      const name=document.createElement('strong');name.textContent=station.name;option.appendChild(name);
      const details=document.createElement('small'),inactive=!stationSourceSelected(station,getState());
      details.textContent=[station.country,stationSourceLabel(station,sourceName),inactive?'sources not selected':'',validMapLocation(station.lon,station.lat)?'':'location unavailable'].filter(Boolean).join(' · ');option.appendChild(details);
      option.onmousedown=event=>event.preventDefault();option.onclick=()=>select(station);list.appendChild(option);
    }
    list.hidden=!choices.length;input.setAttribute('aria-expanded',String(!!choices.length));status.textContent=choices.length?choices.length+' stations found.':normalize(input.value).length<2?'Enter at least two characters.':'No station matches. Try another spelling or country.';
  }
  async function search(){
    const ticket=++sequence;status.textContent='Loading station index…';
    try{await ensureStations();if(ticket===sequence&&!root.hidden&&document.activeElement===input)paint();}
    catch{if(ticket===sequence)status.textContent='Station search could not load. Type again to retry.';}
  }
  function open(){onOpen?.();root.hidden=false;toggle.setAttribute('aria-expanded','true');input.focus();if(input.value)input.select();search();}
  toggle.onclick=()=>root.hidden?open():close();document.getElementById('closeStationSearch').onclick=()=>{close();toggle.focus();};
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
