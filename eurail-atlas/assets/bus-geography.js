import{escapeHTML as esc}from'./atlas-core.js?v=36bcedbe061d63be';
import{BUS_LIMITS}from'./bus-core.js?v=36bcedbe061d63be';

export function cityArea(city,radiusKm=15){
  const dy=radiusKm/111.2,dx=dy/Math.max(.15,Math.cos(city.lat*Math.PI/180));
  return[city.lon-dx,city.lat-dy,city.lon+dx,city.lat+dy];
}

// Place names navigate a geographic area. A city point never becomes a native
// boarding stop or evidence of a route's actual operating road.
export function setupBusGeography({panel,filters,initial,client,changed,map,onSummary}){
  let city=null,run=0,timer=0,framing=0,restoreCity=initial.busCity;
  const root=document.createElement('section');root.className='bus-geography';
  root.innerHTML=`<label for="busCountryFilter">Explore a country<select id="busCountryFilter"><option value="">All recorded countries</option></select></label><label for="busRouteScope">Routes<select id="busRouteScope"><option value="all">All bus routes</option><option value="international">International only</option></select></label><p class="helper">International routes have recorded stops in two or more countries. Country boundaries are approximate.</p><label for="busCitySearch">Find a city<input type="search" id="busCitySearch" placeholder="City name, e.g. Berlin or Praha" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="busCityResults" aria-expanded="false"></label><ul id="busCityResults" role="listbox" hidden></ul><p id="busCityFocus" class="helper"></p><button type="button" id="busClearCity" class="inline-button" hidden>Clear city area</button><p class="bus-place-credit">City names: <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p>`;
  panel.querySelector('.bus-filters').before(root);
  const $=id=>root.querySelector('#'+id),country=$('busCountryFilter'),scope=$('busRouteScope'),input=$('busCitySearch'),list=$('busCityResults');
  function close(){list.hidden=true;input.setAttribute('aria-expanded','false');}
  function summary(){onSummary({country:filters.country,international:filters.international,city});}
  function clearCity(){run++;framing++;client()?.cancel('places');clearTimeout(timer);city=null;filters.cityBounds=null;input.value='';$('busCityFocus').textContent='';$('busClearCity').hidden=true;close();summary();}
  function selectCity(row,{frame=true,notify=true}={}){
    run++;framing++;city=row;filters.cityBounds=cityArea(row);input.value=row.name;close();
    $('busCityFocus').textContent=`Map area within about 15 km of ${row.name}. Routes with recorded stops in this approximate area stay highlighted; other loaded routes turn grey. Local results are limited. Inspect actual boarding stops before travelling.`;
    $('busClearCity').hidden=false;if(notify)changed();summary();
    if(frame){const b=filters.cityBounds;map.fitBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[30,30],maxZoom:11,animate:false});}
  }
  $('busClearCity').onclick=()=>{clearCity();changed();input.focus();};
  country.onchange=async()=>{
    clearCity();filters.country=country.value;changed();summary();
    const ticket=++framing,selected=filters.country;if(!selected)return;
    try{const rows=await client()?.countryInfo();if(ticket!==framing||selected!==filters.country)return;const b=rows?.find(r=>r.name===selected)?.bbox;if(b)map.fitBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[35,35],maxZoom:BUS_LIMITS.minimumZoom-.25,animate:false});}catch{/* Route loading reports an unavailable country packet. */}
  };
  scope.onchange=()=>{filters.international=scope.value==='international';changed();summary();};
  input.oninput=()=>{
    const q=input.value.trim(),ticket=++run;clearTimeout(timer);client()?.cancel('places');close();
    if(q.length<2)return;
    timer=setTimeout(async()=>{
      try{const result=await client()?.places(q,filters.country);if(ticket!==run)return;
        const rows=result?.places||[];list.innerHTML=rows.length?rows.map((row,i)=>`<li><button type="button" role="option" id="busCityOption${i}"><strong>${esc(row.name)}</strong><span>${esc(row.country)}</span></button></li>`).join(''):'<li class="helper">No city match. Try a local name, or use route / stop search below.</li>';
        list.hidden=false;input.setAttribute('aria-expanded','true');for(const[ i,button]of[...list.querySelectorAll('button')].entries())button.onclick=()=>selectCity(rows[i]);
      }catch(error){if(ticket===run&&error.name!=='AbortError'){$('busCityFocus').textContent='City names could not load. Type again to retry.';}}
    },180);
  };
  input.onkeydown=event=>{if(event.key==='Escape'&&!list.hidden){event.preventDefault();event.stopPropagation();close();}if(event.key==='ArrowDown'&&!list.hidden){event.preventDefault();list.querySelector('button')?.focus();}if(event.key==='Enter'&&!list.hidden){event.preventDefault();list.querySelector('button')?.click();}};
  list.onkeydown=event=>{const buttons=[...list.querySelectorAll('button')],at=buttons.indexOf(document.activeElement);if(event.key==='Escape'){event.stopPropagation();close();input.focus();}if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();buttons[(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}};
  return{
    async ready(manifest){
      const countries=[...new Set(manifest.sources.flatMap(s=>s.countries||[]))].sort();
      country.innerHTML='<option value="">All recorded countries</option>'+countries.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
      if(!countries.includes(filters.country))filters.country='';country.value=filters.country;scope.value=filters.international?'international':'all';summary();
      if(restoreCity){const id=restoreCity;restoreCity='';const ticket=++run;try{const result=await client().places('',filters.country,{id});if(ticket===run&&result.places?.[0])selectCity(result.places[0],{frame:!initial.lat,notify:false});}catch{}}
    },
    state:()=>({busMapCountry:filters.country,busInternational:filters.international?'1':'',busCity:city?.id||''}),
    clear:clearCity,
    reset(){clearCity();filters.country='';filters.international=false;country.value='';scope.value='all';summary();},
    destroy(){clearTimeout(timer);run++;framing++;close();}
  };
}
