// More views: station rhythm (dials and hourly heartbeat), clock-face league,
// country wake-up curves, weekend service, commuter tides, corridor strings,
// border crossings, the city-pair league and slow neighbours, all derived
// from one chosen day.
import{haversineKm,clockLabel,tripInfo,weekdayIndex}from'./explore-data.js?v=a613641732ab9825';
import{fillDaySelect,attachStationSearch,esc,fmt}from'./explore-ui.js?v=a613641732ab9825';
import{hubCities,cityTides,neighbourSearch,MIN_CITY_TRAINS,NEIGHBOUR_FROM}from'./explore-city.js?v=a613641732ab9825';

const $=id=>document.getElementById(id);
const DEFAULT_STATIONS=['Zürich HB','Utrecht Centraal','Wien Hbf','München Hbf','Madrid Atocha','Warszawa Centralna'];
const WAKE_COUNTRIES=['Germany','Great Britain','France','Switzerland','Italy','Poland','Spain','Czechia','Netherlands','Austria','Sweden','Romania'];
const cap=s=>s.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
// Slow neighbours: straight-line speed bands, slowest first.
const SPEED_LABELS=['Under 40','40–60','60–90','90–130','130+ km/h'],SPEED_TOKENS=['--v1','--v2','--v3','--v4','--v5'];
const speedBand=v=>v<40?0:v<60?1:v<90?2:v<130?3:4;
const duration=m=>`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')}`;
const changes=n=>n<=1?'direct':`${n-1} change${n>2?'s':''}`;
const signed=v=>(v>0.004?'+':v<-0.004?'−':'')+Math.abs(Math.round(v*100))+'%';

export function create(ctx){
  const{data,search}=ctx,S=data.stations,J=data.journeys;
  const state={day:3,stations:[],corridor:null},cities=hubCities(data);
  let day=null,tides=null;
  // First word of each line label, used to group departures into services.
  const lineTokens=new Map(),patternToken=new Uint32Array(J.rows.length);
  J.rows.forEach((row,p)=>{const tok=(row[0]||'').split(/\s+/)[0]||'';if(!lineTokens.has(tok))lineTokens.set(tok,lineTokens.size);patternToken[p]=lineTokens.get(tok);});

  const root=$('moreView');
  root.innerHTML=`<div class="x-more-inner">
  <section><div class="eyebrow">Station · Country · Network</div><h2>More views</h2>
    <p>Station rhythms, timetable regularity, corridors, borders and city pairs, all from the same timetable as the maps.</p>
    <div class="x-row"><label class="x-field"><span>Day</span><select id="moreDay"></select></label><p class="x-note" id="moreStatus"></p></div></section>

  <section id="rhythm"><div class="eyebrow">Station</div><h2>Station rhythm</h2>
    <p>Each dial shows one dot per departure: the angle is the minute past the hour and the distance from the centre is the hour of day. Spokes mean a train at the same minutes every hour. The strip below shows departures per hour.</p>
    <div class="x-card"><div class="x-row"><div class="x-search x-field"><span>Add a station</span><input id="rhythmAdd" type="search" autocomplete="off" placeholder="Station name" aria-controls="rhythmAddList"><ul class="x-suggest" id="rhythmAddList" role="listbox" hidden></ul></div><div class="x-chips" id="rhythmChips"></div></div>
    <div class="x-dials" id="rhythmDials"></div><div class="x-scroll"><div id="rhythmHeat"></div></div></div></section>

  <section id="clockface"><div class="eyebrow">Country</div><h2>Clock-face league</h2>
    <p>Share of departures that repeat at fixed minutes past the hour, among station, next-stop and line groups with eight or more trains a day.</p>
    <div class="x-card"><div class="x-bars" id="clockBars"></div><p class="x-note">Countries with fewer than 3,000 such departures are left out. Hungary and Denmark publish only partial clock times.</p></div></section>

  <section id="wake"><div class="eyebrow">Country</div><h2>When each country runs</h2>
    <p>Trains in motion through the day, in Central European Time, scaled to each country's own peak. The share still running at 03:00 is in each label.</p>
    <div class="x-card"><div class="x-minis" id="wakeMinis"></div></div>
    <div class="x-card"><h3>Weekend service against a midweek day</h3><div class="x-scroll" id="weekendChart"></div><p class="x-note">Scheduled trips on Saturday and Sunday as a share of the Tuesday–Thursday average.${data.dates.some(d=>d.date==='2026-11-01')?" Sunday 1 November was also All Saints' Day in much of Europe.":''}</p></div></section>

  <section id="tides"><div class="eyebrow">City</div><h2>Commuter tides</h2>
    <p>Trains arriving in each city from outside it (bars above the line) and leaving it (bars below), hour by hour on the city's own clock. The orange line is the difference: above the middle the city is filling with trains, below it is emptying.</p>
    <div class="x-card"><div class="x-minis" id="tideMinis"></div><div class="x-legend"><span><i style="background:var(--s3)"></i>Arriving</span><span><i style="background:var(--s5)"></i>Leaving</span><span><i class="line" style="background:var(--accent)"></i>Arriving minus leaving</span><span>The twelve busiest cities</span></div></div>
    <div class="x-card"><h3>Morning pull and evening release</h3><div class="x-scroll" id="tideChart"></div><p class="x-note" id="tideNote"></p></div></section>

  <section id="corridor"><div class="eyebrow">Corridor</div><h2>Corridor strings</h2>
    <p>Stations down the side, the day across, one line per train. Steeper lines are faster trains; crossings are where trains meet.</p>
    <div class="x-card"><div class="x-row">
      <div class="x-search x-field"><span>From</span><input id="corrFrom" type="search" autocomplete="off" aria-controls="corrFromList"><ul class="x-suggest" id="corrFromList" role="listbox" hidden></ul></div>
      <div class="x-search x-field"><span>To</span><input id="corrTo" type="search" autocomplete="off" aria-controls="corrToList"><ul class="x-suggest" id="corrToList" role="listbox" hidden></ul></div>
      <p class="x-note" id="corrNote"></p></div>
      <div class="x-scroll"><div id="corrChart" class="x-marey"></div></div>
      <div class="x-legend" id="corrLegend"></div></div></section>

  <section id="borders"><div class="eyebrow">Continent</div><h2>Border crossings</h2>
    <p>Trains crossing each border on the chosen day, both directions, and the busiest individual crossings.</p>
    <div class="x-split"><div class="x-card"><h3>By country pair</h3><div class="x-bars" id="borderPairs"></div></div><div class="x-card"><h3>Busiest crossings</h3><div class="x-bars" id="borderLegs"></div></div></div>
    <p class="x-note">Countries with no published clock times show no crossings. Stops with no recorded country are skipped.</p></section>

  <section id="pairs"><div class="eyebrow">City</div><h2>City-pair league</h2>
    <p>Major cities with a direct train between them: straight-line distance against the fastest direct journey. Circle size is direct trains that day.</p>
    <div class="x-card"><div class="x-scroll" id="pairsChart"></div><div class="x-legend"><span>Dashed guides mark 200 and 80 km/h in a straight line</span></div></div></section>

  <section id="neighbours"><div class="eyebrow">City</div><h2>Slow neighbours</h2>
    <p>Cities that are close on the map but far apart by train. Each line joins two major cities and is coloured by the fastest journey of the day between them, changes included, as a straight-line speed.</p>
    <div class="x-card"><div class="x-row"><label class="x-field"><span>Distance between the cities</span><select id="nbRange"><option value="300">100 to 300 km</option><option value="500" selected>100 to 500 km</option><option value="800">100 to 800 km</option></select></label><p class="x-note" id="nbStatus" role="status"></p></div>
      <div class="x-split"><div class="x-nbmap" id="nbMap"></div><div class="x-nbside"><h3>Slowest pairs</h3><ol class="x-rank" id="nbList"></ol></div></div>
      <div class="x-legend" id="nbLegend"></div><p class="x-note" id="nbNote"></p></div></section>
  </div>`;

  // ---- Per-day aggregates -------------------------------------------------
  function computeDay(){
    const lo=data.dayStart[state.day],hi=data.dayStart[state.day+1],N=S.N,hourly=new Uint16Array(N*24),groups=new Map();
    const countryIndex=new Map(WAKE_COUNTRIES.map((c,i)=>[c,i])),wake=WAKE_COUNTRIES.map(()=>new Float32Array(97));
    const pairs=new Map(),legs=new Map(),hubs=new Map();
    for(let t=lo;t<hi;t++){
      const p=data.tripProfile[t],pat=data.profilePattern[p],ps=data.patternStart[pat],b=data.profileStart[p],n=data.profileStart[p+1]-b,s0=data.tripStart[t],tok=patternToken[pat];
      const ci=countryIndex.get(J.rows[pat][5]);
      if(ci!==undefined){const a=Math.max(0,Math.floor(s0/15)),e=Math.min(96,Math.floor(data.tripEnd[t]/15)+1);if(e>0&&a<96){wake[ci][a]++;wake[ci][e]--;}}
      let hubCalls=null;
      for(let i=0;i<n;i++){
        const st=data.patternStation[ps+i],dep=s0+data.profileDep[b+i];
        if(i<n-1){
          if(dep>=0&&dep<1440)hourly[st*24+Math.floor(dep/60)]++;
          const nx=data.patternStation[ps+i+1],key=(st*65536+nx)*4096+(tok%4096);let g=groups.get(key);if(!g){g=[];groups.set(key,g);}if(dep>=0&&dep<1440)g.push(dep);
          const c1=S.country[st],c2=S.country[nx],n1=S.countries[c1],n2=S.countries[c2];
          if(n1&&n2&&c1!==c2){const pk=n1<n2?n1+'|'+n2:n2+'|'+n1;pairs.set(pk,(pairs.get(pk)||0)+1);const lk=st<nx?st*65536+nx:nx*65536+st;legs.set(lk,(legs.get(lk)||0)+1);}
        }
        if(S.hub[st]>=0)(hubCalls||(hubCalls=[])).push(i,S.hub[st]);
      }
      if(hubCalls&&hubCalls.length>=4){const seen=new Map();
        for(let x=0;x<hubCalls.length;x+=2)for(let y=x+2;y<hubCalls.length;y+=2){const h1=hubCalls[x+1],h2=hubCalls[y+1];if(h1===h2)continue;const minutes=data.profileArr[b+hubCalls[y]]-data.profileDep[b+hubCalls[x]];if(minutes<=0)continue;const k=h1<h2?h1*1000+h2:h2*1000+h1;if(!seen.has(k)||minutes<seen.get(k))seen.set(k,minutes);}
        for(const [k,m] of seen){let e=hubs.get(k);if(!e){e={count:0,best:1e9};hubs.set(k,e);}e.count++;if(m<e.best)e.best=m;}}
    }
    // Clock-face share by country.
    const league=new Map();
    for(const [key,deps] of groups){const st=Math.floor(key/4096/65536),c=S.countries[S.country[st]];if(!c)continue;let e=league.get(c);if(!e){e=[0,0];league.set(c,e);}if(deps.length<8)continue;
      const mins=new Map();for(const d of deps)mins.set(d%60,(mins.get(d%60)||0)+1);const k=Math.min(6,Math.max(1,Math.round(deps.length/16)));const top=[...mins.values()].sort((a,b)=>b-a).slice(0,k).reduce((a,b)=>a+b,0);
      e[1]+=deps.length;if(top/deps.length>=0.8)e[0]+=deps.length;}
    for(const w of wake){let run=0;for(let i=0;i<96;i++){run+=w[i];w[i]=run;}}
    day={hourly,league,wake,pairs,legs,hubs};
  }

  // ---- Station rhythm ----------------------------------------------------
  function departures(st){const lo=data.dayStart[state.day],hi=data.dayStart[state.day+1],out=[];
    for(let t=lo;t<hi;t++){const p=data.tripProfile[t],pat=data.profilePattern[p],ps=data.patternStart[pat],n=data.patternStart[pat+1]-ps;for(let i=0;i<n-1;i++)if(data.patternStation[ps+i]===st){const d=data.tripStart[t]+data.profileDep[data.profileStart[p]+i];if(d>=0&&d<1440)out.push(d);}}
    return out.sort((a,b)=>a-b);}
  function renderRhythm(){
    $('rhythmChips').innerHTML=state.stations.map((s,i)=>`<span class="x-chip">${esc(S.names[s])}<button type="button" data-i="${i}" aria-label="Remove ${esc(S.names[s])}">×</button></span>`).join('');
    $('rhythmDials').innerHTML=state.stations.map(st=>{const deps=departures(st),R=170,c=85;let g='';
      for(const h of [6,12,18,24])g+=`<circle cx="${c}" cy="${c}" r="${(12+(h-4)/21*64).toFixed(1)}" fill="none" stroke="var(--line)"/>`;
      for(let m=0;m<60;m+=15){const a=m/60*6.283-1.5708;g+=`<text x="${(c+Math.cos(a)*80).toFixed(1)}" y="${(c+Math.sin(a)*80+3).toFixed(1)}" font-size="8" text-anchor="middle">${m}</text>`;}
      let dots='';for(const d of deps){const h=d/60;if(h<4)continue;const r=12+(h-4)/21*64,a=(d%60)/60*6.283-1.5708;dots+=`<circle cx="${(c+Math.cos(a)*r).toFixed(1)}" cy="${(c+Math.sin(a)*r).toFixed(1)}" r="1.3"/>`;}
      return`<div class="x-dial"><svg viewBox="0 0 ${R} ${R}" width="${R}" height="${R}" role="img" aria-label="Departure dial for ${esc(S.names[st])}">${g}<g fill="var(--s2)" fill-opacity=".75">${dots}</g></svg><b>${esc(S.names[st])}</b><span>${esc(S.countries[S.country[st]])} · ${fmt(deps.length)} departures</span></div>`;}).join('');
    const ramp=['--s6','--s5','--s4','--s3','--s2','--s1'];
    const slim=$('rhythmHeat').clientWidth<520;
    let h=`<div style="display:grid;grid-template-columns:${slim?'minmax(64px,1fr) repeat(24,minmax(0,8px)) 34px':'minmax(110px,180px) repeat(24,minmax(9px,1fr)) 52px'};gap:1px;font-size:${slim?10:11}px;align-items:center;${slim?'':'min-width:560px;'}font-variant-numeric:tabular-nums"><span></span>`;
    for(let i=0;i<24;i++)h+=`<span style="text-align:center;color:var(--muted);overflow:visible;white-space:nowrap">${i%(slim?6:3)===0?String(i).padStart(2,'0'):''}</span>`;h+='<span style="text-align:right;color:var(--muted)">total</span>';
    for(const st of state.stations){const row=day.hourly.subarray(st*24,st*24+24),mx=Math.max(1,...row),tot=row.reduce((a,b)=>a+b,0);
      h+=`<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:${slim?4:8}px">${esc(S.names[st])}</span>`;
      for(let i=0;i<24;i++){const v=row[i],k=v?Math.min(5,1+Math.floor(v/mx*4.999)):0;h+=`<span style="height:16px;border-radius:2px;background:var(${ramp[k]})" title="${esc(S.names[st])}, ${String(i).padStart(2,'0')}:00 — ${v} departures"></span>`;}
      h+=`<span style="text-align:right;color:var(--ink-soft)">${fmt(tot)}</span>`;}
    $('rhythmHeat').innerHTML=h+'</div>';
  }

  // ---- Country views -----------------------------------------------------
  function bars(rows,format){const mx=Math.max(...rows.map(r=>r[1]),1);return rows.map(r=>`<div class="bar" title="${esc(r[0])}: ${esc(format(r[1]))}"><span class="n">${esc(r[0])}</span><span class="t"><span class="f" style="width:${(r[1]/mx*100).toFixed(1)}%"></span></span><span class="v">${esc(format(r[1]))}</span></div>`).join('');}
  function renderCountries(){
    const rows=[...day.league].filter(([c,[,t]])=>t>=3000&&c!=='Hungary'&&c!=='Denmark').map(([c,[g,t]])=>[c,g/t*100]).sort((a,b)=>b[1]-a[1]);
    $('clockBars').innerHTML=bars(rows,v=>v.toFixed(0)+'%');
    $('wakeMinis').innerHTML=WAKE_COUNTRIES.map((c,i)=>{const v=day.wake[i].subarray(0,96),mx=Math.max(1,...v),W=160,H=46;let d=`M0 ${H}`;for(let k=0;k<96;k++)d+=`L${(k/95*W).toFixed(1)} ${(H-v[k]/mx*(H-4)).toFixed(1)}`;d+=`L${W} ${H}Z`;const pk=v.indexOf(mx);
      return`<div class="x-mini"><svg viewBox="0 0 ${W} ${H+11}" role="img" aria-label="Trains in motion through the day in ${esc(c)}"><path d="${d}" fill="var(--s4)"/><line x1="0" x2="${W}" y1="${H}" y2="${H}" stroke="var(--line)"/><circle cx="${(pk/95*W).toFixed(1)}" cy="3" r="2.5" fill="var(--accent)"/>${[0,6,12,18,24].map(t=>`<text x="${Math.min(W-6,Math.max(6,t/24*W))}" y="${H+10}" font-size="8" text-anchor="middle">${t}</text>`).join('')}</svg><b>${esc(c)}</b><span>peak ${clockLabel(pk*15)} · ${(v[12]/mx*100).toFixed(1)}% at 03:00</span></div>`;}).join('');
    const week=data.summary.tripsByWeekdayAndCountry,at=weekdayIndex(data.dates.map(d=>d.date)),rowsW=Object.entries(week).map(([c,v])=>{const mid=(v[at[2]]+v[at[3]]+v[at[4]])/3;return[c,v[at[0]]/mid,v[at[6]]/mid,v.reduce((a,b)=>a+b,0)];}).filter(r=>r[3]>3000&&r[1]>0).sort((a,b)=>a[1]-b[1]);
    const narrow=$('weekendChart').clientWidth<520,W=narrow?Math.max(300,$('weekendChart').clientWidth):720,rh=19,ml=narrow?96:130,H=rowsW.length*rh+34,x=v=>ml+v/1.15*(W-ml-20);let g='';
    for(const t of [0,.25,.5,.75,1])g+=`<line x1="${x(t)}" x2="${x(t)}" y1="8" y2="${H-22}" stroke="var(--line)"/><text x="${x(t)}" y="${H-8}" font-size="11" text-anchor="middle">${t*100}%</text>`;
    rowsW.forEach((r,i)=>{const y=14+i*rh;g+=`<text x="${ml-8}" y="${y+4}" font-size="11.5" text-anchor="end" fill="var(--ink)">${esc(r[0])}</text><line x1="${x(Math.min(r[1],r[2]))}" x2="${x(Math.max(r[1],r[2]))}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="2"/><circle cx="${x(r[2])}" cy="${y}" r="4.5" fill="var(--c2)" stroke="var(--panel)" stroke-width="2"><title>${esc(r[0])}: Saturday ${Math.round(r[2]*100)}%</title></circle><circle cx="${x(r[1])}" cy="${y}" r="4.5" fill="var(--c3)" stroke="var(--panel)" stroke-width="2"><title>${esc(r[0])}: Sunday ${Math.round(r[1]*100)}%</title></circle>`;});
    $('weekendChart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;height:auto" role="img" aria-label="Weekend service as a share of midweek by country">${g}</svg><div class="x-legend"><span><i style="background:var(--c3)"></i>Sunday</span><span><i style="background:var(--c2)"></i>Saturday</span></div>`;
  }

  // ---- Commuter tides ----------------------------------------------------
  function renderTides(){
    tides=cityTides(data,state.day,cities);
    const big=tides.filter(t=>t.arrivals>=300),hours=h=>String(h).padStart(2,'0')+':00';
    $('tideMinis').innerHTML=[...big].sort((a,b)=>b.arrivals-a.arrivals).slice(0,12).map(t=>{
      const W=168,H=72,mid=36,bw=W/24;let mx=1;for(let h=0;h<24;h++)mx=Math.max(mx,t.arrive[h],t.leave[h]);const k=(mid-4)/mx;let up='',down='',line='',hits='';
      for(let h=0;h<24;h++){const a=t.arrive[h]*k,l=t.leave[h]*k,x=(h*bw+.5).toFixed(1),w=(bw-1).toFixed(1);
        up+=`<rect x="${x}" y="${(mid-a).toFixed(1)}" width="${w}" height="${a.toFixed(1)}"/>`;down+=`<rect x="${x}" y="${mid}" width="${w}" height="${l.toFixed(1)}"/>`;
        line+=`${h?'L':'M'}${((h+.5)*bw).toFixed(1)} ${(mid-(t.arrive[h]-t.leave[h])*k).toFixed(1)}`;
        hits+=`<rect x="${(h*bw).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}" fill="transparent"><title>${esc(t.city.name)}, ${hours(h)}: ${t.arrive[h]} arriving, ${t.leave[h]} leaving</title></rect>`;}
      return`<div class="x-mini"><svg viewBox="0 0 ${W} ${H+12}" role="img" aria-label="Trains arriving in and leaving ${esc(t.city.name)} through the day"><g fill="var(--s3)">${up}</g><g fill="var(--s5)">${down}</g><line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="var(--line)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round"/>${[0,6,12,18,24].map(h=>`<text x="${Math.min(W-6,Math.max(6,h/24*W))}" y="${H+10}" font-size="8" text-anchor="middle">${h}</text>`).join('')}${hits}</svg><b>${esc(t.city.name)}</b><span>morning ${signed(t.morning)} · evening ${signed(t.evening)}</span></div>`;}).join('');
    const ranked=[...big].sort((a,b)=>(b.morning-b.evening)-(a.morning-a.evening)),rows=ranked.slice(0,16),rest=ranked.slice(16).sort((a,b)=>b.arrivals-a.arrivals);
    const narrow=$('tideChart').clientWidth<520,W=narrow?Math.max(300,$('tideChart').clientWidth):720,rh=19,ml=narrow?96:130,H=rows.length*rh+34,span=.35,x=v=>ml+(Math.max(-span,Math.min(span,v))+span)/(2*span)*(W-ml-20);let g='';
    for(const t of narrow?[-.3,-.15,0,.15,.3]:[-.3,-.2,-.1,0,.1,.2,.3])g+=`<line x1="${x(t)}" x2="${x(t)}" y1="8" y2="${H-22}" stroke="var(${t?'--line':'--muted'})"/><text x="${x(t)}" y="${H-8}" font-size="11" text-anchor="middle">${signed(t)}</text>`;
    rows.forEach((t,i)=>{const y=14+i*rh,dot=(v,token,when)=>`<circle cx="${x(v)}" cy="${y}" r="4.5" fill="var(${token})" stroke="var(--panel)" stroke-width="2"><title>${esc(t.city.name)}: ${when} ${signed(v)} of arriving trains</title></circle>`;
      g+=`<text x="${ml-8}" y="${y+4}" font-size="11.5" text-anchor="end" style="fill:var(--ink)">${esc(t.city.name)}</text><line x1="${x(t.evening)}" x2="${x(t.morning)}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="2"/>${dot(t.evening,'--c4','16:00–20:00')}${dot(t.morning,'--c3','06:00–10:00')}`;});
    $('tideChart').innerHTML=rows.length?`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;height:auto" role="img" aria-label="Morning and evening balance of arriving and leaving trains by city">${g}</svg><div class="x-legend"><span><i style="background:var(--c3)"></i>06:00–10:00</span><span><i style="background:var(--c4)"></i>16:00–20:00</span></div>`:'';
    $('tideNote').textContent=`Trains arriving minus trains leaving, as a share of the trains arriving in those hours. A train passing through counts once in and once out, so only trains that start, end or wait in the city move the balance. Cities with fewer than 300 arrivals that day are left out.`+(rest.length?` The other ${rest.length} cities are flatter; the busiest of them, ${rest[0].city.name}, is at ${signed(rest[0].morning)} in the morning and ${signed(rest[0].evening)} in the evening.`:'');
  }

  // ---- Corridor strings --------------------------------------------------
  function renderCorridor(){
    const c=state.corridor;if(!c?.from||!c?.to){$('corrChart').innerHTML='';return;}
    const lo=data.dayStart[state.day],hi=data.dayStart[state.day+1],A=new Set(c.from.stations),B=new Set(c.to.stations);let spine=null;
    for(let t=lo;t<hi;t++){const p=data.tripProfile[t],pat=data.profilePattern[p],ps=data.patternStart[pat],n=data.patternStart[pat+1]-ps;let ia=-1,ib=-1;for(let i=0;i<n;i++){const s=data.patternStation[ps+i];if(ia<0&&A.has(s))ia=i;if(B.has(s))ib=i;}
      if(ia>=0&&ib>ia){const seg=Array.from(data.patternStation.subarray(ps+ia,ps+ib+1));if(!spine||seg.length>spine.length)spine=seg;}}
    if(!spine){$('corrChart').innerHTML='';$('corrNote').textContent='No train on this day calls at both, in this direction. Try swapping them.';return;}
    const pos=new Map();let acc=0;spine.forEach((s,i)=>{if(i)acc+=haversineKm(S.lat[spine[i-1]],S.lon[spine[i-1]],S.lat[s],S.lon[s]);pos.set(s,acc);});const L=acc||1;
    const trains=[];
    for(let t=lo;t<hi;t++){const p=data.tripProfile[t],pat=data.profilePattern[p],ps=data.patternStart[pat],b=data.profileStart[p],n=data.patternStart[pat+1]-ps,hits=[];
      for(let i=0;i<n;i++){const s=data.patternStation[ps+i];if(pos.has(s))hits.push(i);}
      if(hits.length<2)continue;const d0=pos.get(data.patternStation[ps+hits[0]]),d1=pos.get(data.patternStation[ps+hits[hits.length-1]]);if(Math.abs(d1-d0)<0.25*L)continue;
      const pts=[];for(const i of hits){const s=data.patternStation[ps+i];pts.push([data.tripStart[t]+data.profileArr[b+i],pos.get(s)],[data.tripStart[t]+data.profileDep[b+i],pos.get(s)]);}
      trains.push({t,cat:J.patternCategory[pat],pts});}
    const slim=$('corrChart').clientWidth<520,W=slim?1040:1560,H=Math.max(300,Math.min(560,spine.length*30+60)),ml=slim?112:170,cutAt=slim?15:24,mt=16,mb=28,t0=240,t1=1500,x=t=>ml+(Math.max(t0,Math.min(t1,t))-t0)/(t1-t0)*(W-ml-12),y=d=>mt+d/L*(H-mt-mb);let g='';
    for(let h=4;h<=25;h++)g+=`<line x1="${x(h*60)}" x2="${x(h*60)}" y1="${mt}" y2="${H-mb}" stroke="var(--line)"/><text x="${x(h*60)}" y="${H-9}" font-size="11" text-anchor="middle">${String(h%24).padStart(2,'0')}:00</text>`;
    let last=-99;for(const s of spine){const yy=y(pos.get(s));g+=`<line x1="${ml}" x2="${W-12}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-opacity=".6"/>`;if(yy-last>=13){g+=`<text x="${ml-8}" y="${yy+4}" font-size="11.5" text-anchor="end" fill="var(--ink)">${esc(S.names[s].length>cutAt?S.names[s].slice(0,cutAt-1)+'…':S.names[s])}</text>`;last=yy;}}
    const tokens=['--c1','--c2','--c3','--c4'];let paths='';
    for(const tr of trains){if(tr.pts[tr.pts.length-1][0]<t0-60||tr.pts[0][0]>t1+60)continue;const info=tripInfo(data,tr.t);
      paths+=`<path d="${tr.pts.map((q,i)=>(i?'L':'M')+x(q[0]).toFixed(1)+' '+y(q[1]).toFixed(1)).join('')}" stroke="var(${tokens[tr.cat]})"><title>${esc(info.title)} · ${esc(info.operator)} · ${esc(info.from)} ${clockLabel(info.calls[0].dep)} → ${esc(info.to)}</title></path>`;}
    $('corrChart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Time–distance diagram from ${esc(c.from.name)} to ${esc(c.to.name)}">${g}${paths}</svg>`;
    $('corrNote').textContent=`${fmt(trains.length)} trains along ${fmt(L)} km of the corridor. ${coarse?'Scroll sideways through the day; tap':'Hover'} a line for the train.`;
    $('corrLegend').innerHTML=['Regional','Long distance','High speed','Night'].map((l,i)=>`<span><i class="line" style="background:var(${tokens[i]})"></i>${l}</span>`).join('');
  }

  // ---- Borders and city pairs -------------------------------------------
  function renderBorders(){
    const pairs=[...day.pairs].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([k,v])=>[k.replace('|',' – ').replace(/Great Britain/g,'Britain'),v]);
    $('borderPairs').innerHTML=bars(pairs,v=>fmt(v)+'/day');
    const legs=[...day.legs].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([k,v])=>{const a=Math.floor(k/65536),b=k%65536;return[`${S.names[a]} – ${S.names[b]}`,v];});
    $('borderLegs').innerHTML=bars(legs,v=>fmt(v)+'/day');
  }
  function renderPairs(){
    const H=S.hubs,rows=[];
    const centre=new Map();for(let i=0;i<S.N;i++){if(S.hub[i]<0)continue;const e=centre.get(S.hub[i])||[0,0,0];e[0]+=S.lat[i];e[1]+=S.lon[i];e[2]++;centre.set(S.hub[i],e);}
    for(const [k,e] of day.hubs){const a=Math.floor(k/1000),b=k%1000,ca=centre.get(a),cb=centre.get(b);if(!ca||!cb)continue;const km=haversineKm(ca[0]/ca[2],ca[1]/ca[2],cb[0]/cb[2],cb[1]/cb[2]);if(km<60)continue;rows.push([cap(H[a]),cap(H[b]),km,e.best,e.count]);}
    const slim=$('pairsChart').clientWidth<520,W=slim?Math.max(300,$('pairsChart').clientWidth):900,Hh=slim?380:470,ml=slim?38:52,mb=38,mt=12,xm=slim?1000:1300,ym=1200,x=v=>ml+v/xm*(W-ml-14),y=v=>Hh-mb-v/ym*(Hh-mb-mt);let g='';
    for(let k=0;k<=(slim?1000:1200);k+=slim?250:200)g+=`<line x1="${x(k)}" x2="${x(k)}" y1="${mt}" y2="${Hh-mb}" stroke="var(--line)"/><text x="${x(k)}" y="${Hh-mb+15}" font-size="11" text-anchor="middle">${k}</text>`;
    for(let m=0;m<=1200;m+=240)g+=`<line x1="${ml}" x2="${W-14}" y1="${y(m)}" y2="${y(m)}" stroke="var(--line)"/><text x="${ml-7}" y="${y(m)+4}" font-size="11" text-anchor="end">${m/60} h</text>`;
    g+=`<text x="${(ml+W)/2}" y="${Hh-6}" font-size="11.5" text-anchor="middle">${slim?'Straight-line distance, km':'Straight-line distance between city centres, km'}</text>`;
    for(const sp of [200,80]){const xe=Math.min(xm,ym/60*sp);g+=`<line x1="${x(0)}" y1="${y(0)}" x2="${x(xe)}" y2="${y(xe/sp*60)}" stroke="var(--muted)" stroke-dasharray="4 4"/><text x="${x(xe)-6}" y="${y(xe/sp*60)+(sp>100?14:-6)}" font-size="11" text-anchor="end">${sp} km/h</text>`;}
    rows.sort((a,b)=>b[4]-a[4]);
    for(const r of rows){if(r[3]>ym||r[2]>xm)continue;const rr=Math.min(11,2.4+Math.sqrt(r[4])*0.8)*(slim?.62:1);g+=`<circle cx="${x(r[2]).toFixed(1)}" cy="${y(r[3]).toFixed(1)}" r="${rr.toFixed(1)}" fill="var(--s2)" fill-opacity=".6" stroke="var(--panel)"><title>${esc(r[0])} – ${esc(r[1])}: ${fmt(r[2])} km, fastest direct ${Math.floor(r[3]/60)} h ${String(r[3]%60).padStart(2,'0')} (${fmt(r[2]/(r[3]/60))} km/h), ${r[4]} direct trains</title></circle>`;}
    const fast=[...rows].sort((a,b)=>b[2]/b[3]-a[2]/a[3]).slice(0,4);for(const r of slim?[]:fast)g+=`<text x="${x(r[2])+9}" y="${y(r[3])+4}" font-size="11" fill="var(--ink)">${esc(r[0])}–${esc(r[1])}</text>`;
    $('pairsChart').innerHTML=`<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" style="${slim?'':'min-width:620px;'}max-width:100%;height:auto" role="img" aria-label="City pairs: distance against fastest direct journey">${g}</svg><p class="x-note">${fmt(rows.length)} city pairs with a direct train. Fastest: ${fast.map(r=>`${esc(r[0])}–${esc(r[1])} ${fmt(r[2]/(r[3]/60))} km/h`).join(', ')}.</p>`;
  }

  // ---- Slow neighbours ---------------------------------------------------
  // The search runs a city at a time once the section is near the screen, so
  // the page stays usable on a phone.
  const nb={day:-1,token:0,visible:!window.IntersectionObserver,search:null,rows:null};
  let land=null,landRequest=null;
  const loadLand=()=>landRequest||(landRequest=fetch(new URL('countries.geojson',import.meta.url)).then(r=>r.json()).then(g=>{land=g;}).catch(()=>{}));
  function startNeighbours(){
    if(!nb.visible||!tides||nb.day===state.day)return;
    nb.day=state.day;nb.rows=null;const token=++nb.token,found=nb.search=neighbourSearch(data,state.day,cities,tides);
    $('nbMap').innerHTML='';$('nbList').innerHTML='';$('nbNote').textContent='';$('nbStatus').textContent='Working out journeys…';
    const step=()=>{
      if(token!==nb.token)return;
      const began=performance.now();let more=true;while(more&&performance.now()-began<40)more=found.next();
      if(more){$('nbStatus').textContent=`Working out journeys: ${found.done} of ${found.total} cities…`;setTimeout(step,0);return;}
      nb.rows=found.pairs();loadLand().then(()=>{if(token===nb.token)renderNeighbours();});
    };
    setTimeout(step,30);
  }
  function renderNeighbours(){
    if(!nb.rows)return;
    const max=+$('nbRange').value,rows=nb.rows.filter(r=>r.km>=100&&r.km<=max),found=rows.filter(r=>r.journey).sort((a,b)=>a.speed-b.speed),missing=rows.filter(r=>!r.journey),top=found.slice(0,12);
    const pair=r=>`${esc(r.a.name)} – ${esc(r.b.name)}`,id=r=>`${r.a.index}-${r.b.index}`;
    // A Mercator frame around the cities in the search.
    const mercY=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
    let w=Infinity,e=-Infinity,so=Infinity,n=-Infinity;for(const c of nb.search.included){w=Math.min(w,c.lon);e=Math.max(e,c.lon);so=Math.min(so,c.lat);n=Math.max(n,c.lat);}
    w-=2;e+=2;so-=1.5;n+=1.5;
    const W=640,k=W/((e-w)*Math.PI/180),H=Math.round((mercY(n)-mercY(so))*k),X=lon=>(lon-w)*Math.PI/180*k,Y=lat=>(mercY(n)-mercY(lat))*k;
    let coast='';
    for(const feature of land?.features||[]){const geom=feature.geometry;if(!geom)continue;
      for(const poly of geom.type==='MultiPolygon'?geom.coordinates:[geom.coordinates]){const ring=poly[0];let d='',lx=NaN,ly=NaN,inside=false;
        for(const [lon,lat] of ring){if(lat>84||lat<-84)continue;const x=X(lon),y=Y(lat);if(x>=0&&x<=W&&y>=0&&y<=H)inside=true;if(Math.abs(x-lx)+Math.abs(y-ly)<1.2)continue;d+=(d?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);lx=x;ly=y;}
        if(inside&&d)coast+=d+'Z';}}
    const widths=[2.8,2.1,1.3,1,1],alpha=[.95,.85,.55,.5,.5];let lines='';
    for(const r of missing)lines+=`<line x1="${X(r.a.lon).toFixed(1)}" y1="${Y(r.a.lat).toFixed(1)}" x2="${X(r.b.lon).toFixed(1)}" y2="${Y(r.b.lat).toFixed(1)}" stroke="var(--muted)" stroke-dasharray="3 4"><title>${pair(r)}: ${fmt(r.km)} km apart, no journey found on this day</title></line>`;
    for(let i=found.length-1;i>=0;i--){const r=found[i],b=speedBand(r.speed),j=r.journey,from=cities[j.from];
      lines+=`<line data-pair="${id(r)}" x1="${X(r.a.lon).toFixed(1)}" y1="${Y(r.a.lat).toFixed(1)}" x2="${X(r.b.lon).toFixed(1)}" y2="${Y(r.b.lat).toFixed(1)}" stroke="var(${SPEED_TOKENS[b]})" stroke-width="${widths[b]}" stroke-opacity="${alpha[b]}"><title>${pair(r)}: ${fmt(r.km)} km apart, fastest ${duration(j.minutes)} (${changes(j.trains)}), leaving ${esc(from.name)} at ${clockLabel(j.depart+tides[from.index].shift).slice(0,5)}, ${fmt(r.speed)} km/h</title></line>`;}
    // Name the cities of the slowest pairs, slowest first, wherever a name fits
    // beside its dot without covering another name.
    const named=new Set(),placed=[];for(const r of top){named.add(r.a);named.add(r.b);}
    let dots='',labels='';
    for(const c of nb.search.included)dots+=`<circle cx="${X(c.lon).toFixed(1)}" cy="${Y(c.lat).toFixed(1)}" r="${named.has(c)?3:2}"><title>${esc(c.name)}</title></circle>`;
    for(const c of named){const x=X(c.lon),y=Y(c.lat),tw=c.name.length*6.1+4,th=13;
      for(const [dx,dy] of [[5,-5],[-5-tw,-5],[5,th],[-5-tw,th],[-tw/2,-9],[-tw/2,th+5]]){const box=[x+dx,y+dy-th+2,x+dx+tw,y+dy+3];
        if(box[0]<0||box[2]>W||box[1]<0||box[3]>H||placed.some(q=>box[0]<q[2]&&box[2]>q[0]&&box[1]<q[3]&&box[3]>q[1]))continue;
        placed.push(box);labels+=`<text x="${(x+dx+2).toFixed(1)}" y="${(y+dy).toFixed(1)}" font-size="11" style="fill:var(--ink);stroke:var(--land);stroke-width:3;paint-order:stroke">${esc(c.name)}</text>`;break;}}
    $('nbMap').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of city pairs coloured by the fastest journey between them"><rect width="${W}" height="${H}" fill="var(--sea)"/><path d="${coast}" fill="var(--land)" stroke="var(--coast)" stroke-width=".6"/><g stroke-linecap="round">${lines}</g><g fill="var(--ink)" stroke="var(--land)" stroke-width="1">${dots}</g>${labels}</svg>`;
    $('nbList').innerHTML=top.map(r=>`<li><button type="button" data-pair="${id(r)}"><b>${pair(r)}</b><span>${fmt(r.km)} km · ${duration(r.journey.minutes)} · ${changes(r.journey.trains)}</span><span class="v">${fmt(r.speed)} km/h</span></button></li>`).join('');
    $('nbLegend').innerHTML=SPEED_LABELS.map((l,i)=>`<span><i class="line" style="background:var(${SPEED_TOKENS[i]})"></i>${l}</span>`).join('')+(missing.length?'<span><i class="line" style="background:var(--muted)"></i>Dashed: no journey found</span>':'');
    $('nbStatus').textContent=found.length?`${fmt(found.length)} city pairs on ${data.dates[state.day].label}. Half are slower than ${fmt(found[found.length>>1].speed)} km/h in a straight line.`:'No city pairs in this range.';
    const left=nb.search.left.map(c=>c.name);
    $('nbNote').textContent=`The quicker direction is shown, for journeys starting at ${clockLabel(NEIGHBOUR_FROM)} Central European Time or later. Waits at changes count, the wait for the first train does not. Distances are straight lines between city centres. Countries without published clock times are missing, so a journey that would use their trains shows as slower than it is.`+(left.length?` Left out with fewer than ${MIN_CITY_TRAINS} timed trains leaving that day: ${left.join(', ')}.`:'');
  }

  function renderAll(){$('moreStatus').textContent='Working out the day…';setTimeout(()=>{computeDay();renderRhythm();renderCountries();renderTides();renderCorridor();renderBorders();renderPairs();$('moreStatus').textContent=`Figures for ${data.dates[state.day].label}.`;nb.day=-1;nb.token++;startNeighbours();},20);}

  fillDaySelect($('moreDay'),data.dates,state.day);
  $('moreDay').addEventListener('change',e=>{state.day=+e.target.value;renderAll();});
  attachStationSearch($('rhythmAdd'),$('rhythmAddList'),search,e=>{for(const s of e.kind==='city'?e.stations.slice(0,1):e.stations)if(!state.stations.includes(s))state.stations.push(s);$('rhythmAdd').value='';renderRhythm();});
  $('rhythmChips').addEventListener('click',e=>{const b=e.target.closest('button[data-i]');if(b){state.stations.splice(+b.dataset.i,1);renderRhythm();}});
  const setCorr=(key,input)=>e=>{state.corridor={...state.corridor,[key]:e};input.value=e.name;renderCorridor();};
  attachStationSearch($('corrFrom'),$('corrFromList'),search,setCorr('from',$('corrFrom')));
  attachStationSearch($('corrTo'),$('corrToList'),search,setCorr('to',$('corrTo')));
  for(const name of DEFAULT_STATIONS){const i=S.names.indexOf(name);if(i>=0)state.stations.push(i);}
  const zh=search('Zürich HB')[0],be=search('Bern').find(e=>e.name==='Bern');state.corridor={from:zh,to:be};$('corrFrom').value=zh?.name||'';$('corrTo').value=be?.name||'';
  // Touch has no hover: a tap on a mark shows the text a pointer would get as
  // a tooltip. Thin lines are hard to hit, so nearby points are tried too.
  const coarse=window.matchMedia?.('(pointer:coarse)').matches,readout=document.createElement('div');readout.className='x-readout';readout.setAttribute('role','status');readout.hidden=true;$('moreView').append(readout);
  let readoutTimer=0;const label=el=>el?.closest?.('#moreView')?(el.querySelector?.(':scope>title')?.textContent||el.closest('[title]')?.getAttribute('title')||''):'';
  $('moreView').addEventListener('click',e=>{
    let text=label(e.target);
    if(!text&&e.target.closest('svg'))for(const r of [5,10])for(let a=0;a<8&&!text;a++)text=label(document.elementFromPoint(e.clientX+Math.cos(a*.785)*r,e.clientY+Math.sin(a*.785)*r));
    clearTimeout(readoutTimer);readout.hidden=!text;if(text){readout.textContent=text;readoutTimer=setTimeout(()=>{readout.hidden=true;},6000);}
  });
  $('nbRange').addEventListener('change',renderNeighbours);
  $('nbList').addEventListener('click',e=>{const button=e.target.closest('button[data-pair]');if(!button)return;const on=!button.classList.contains('on');
    $('neighbours').querySelectorAll('.on').forEach(el=>el.classList.remove('on'));
    if(on){button.classList.add('on');const line=$('nbMap').querySelector(`line[data-pair="${button.dataset.pair}"]`);if(line){line.classList.add('on');line.parentNode.append(line);}}});
  if(window.IntersectionObserver)new IntersectionObserver(entries=>{nb.visible=entries.some(entry=>entry.isIntersecting);startNeighbours();},{root:$('moreView'),rootMargin:'400px'}).observe($('neighbours'));
  let rendered=false;
  return{activate(){if(!rendered){rendered=true;renderAll();}},draw(){},onTheme(){}};
}
