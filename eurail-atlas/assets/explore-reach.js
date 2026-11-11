// Reach: earliest arrival at every station from a chosen origin and time,
// by connection scan over one day's timed trains, with walking transfers.
import{tripInfo,clockLabel,haversineKm}from'./explore-data.js?v=5365ea7a3816698f';
import{fillDaySelect,attachStationSearch,esc,fmt}from'./explore-ui.js?v=5365ea7a3816698f';

const $=id=>document.getElementById(id);
const CHANGE=5,WALK_M=700,INF=1e9,BANDS=6;
const RAMP=['--r1','--r2','--r3','--r4','--r5','--r6'];

export function create(ctx){
  const{data,layer,search}=ctx,S=data.stations,N=S.N;
  const state={day:3,t0:8*60,maxH:6,pass:false,origin:null,target:-1};
  let conn=null,result=null,colors=[],shown=[],busy=false;

  // Walking links between stations under 700 m, from a coarse lat/lon grid.
  const foot=Array.from({length:N},()=>[]);
  {const grid=new Map(),key=(a,b)=>a*100000+b;
    for(let i=0;i<N;i++){const k=key(Math.floor(S.lat[i]/0.01),Math.floor(S.lon[i]/0.015));if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);}
    for(let i=0;i<N;i++){const gy=Math.floor(S.lat[i]/0.01),gx=Math.floor(S.lon[i]/0.015);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const j of grid.get(key(gy+dy,gx+dx))||[]){if(j===i)continue;const m=haversineKm(S.lat[i],S.lon[i],S.lat[j],S.lon[j])*1000;if(m<WALK_M)foot[i].push(j,Math.round(m/75)+2);}}}

  // Connections (one per hop) for the chosen day, sorted by departure.
  function buildConnections(day){
    const lo=data.dayStart[day],hi=data.dayStart[day+1];let count=0;
    for(let t=lo;t<hi;t++){const p=data.tripProfile[t];count+=data.profileStart[p+1]-data.profileStart[p]-1;}
    const from=new Uint16Array(count),to=new Uint16Array(count),dep=new Int16Array(count),arr=new Int16Array(count),trip=new Uint32Array(count),call=new Uint16Array(count);
    let c=0;
    for(let t=lo;t<hi;t++){const p=data.tripProfile[t],pat=data.profilePattern[p],ps=data.patternStart[pat],b=data.profileStart[p],n=data.profileStart[p+1]-b,s0=data.tripStart[t];
      for(let i=0;i<n-1;i++){from[c]=data.patternStation[ps+i];to[c]=data.patternStation[ps+i+1];dep[c]=s0+data.profileDep[b+i];arr[c]=s0+data.profileArr[b+i+1];trip[c]=t;call[c]=i;c++;}}
    // Counting sort by departure minute.
    const minDep=-1440,span=5761,counts=new Uint32Array(span+1);for(let i=0;i<count;i++)counts[dep[i]-minDep+1]++;for(let i=1;i<=span;i++)counts[i]+=counts[i-1];
    const order=new Uint32Array(count);for(let i=0;i<count;i++)order[counts[dep[i]-minDep]++]=i;
    const pick=(src,Type)=>{const out=new Type(count);for(let i=0;i<count;i++)out[i]=src[order[i]];return out;};
    const passBlocked=new Uint8Array(hi-lo);for(let t=lo;t<hi;t++){const pc=data.journeys.patternPass[data.profilePattern[data.tripProfile[t]]];passBlocked[t-lo]=pc===1||pc===3?1:0;}
    return{lo,hi,count,from:pick(from,Uint16Array),to:pick(to,Uint16Array),dep:pick(dep,Int16Array),arr:pick(arr,Int16Array),trip:pick(trip,Uint32Array),call:pick(call,Uint16Array),passBlocked};
  }

  function scan(){
    const C=conn,origins=state.origin.stations,t0=state.t0,limit=t0+state.maxH*60;
    const ea=new Int32Array(N).fill(INF),parentConn=new Int32Array(N).fill(-1),parentFoot=new Int32Array(N).fill(-1),board=new Int32Array(C.hi-C.lo).fill(-1);
    const relax=(s,time)=>{const f=foot[s];for(let k=0;k<f.length;k+=2){const j=f[k],w=time+f[k+1];if(w<ea[j]){ea[j]=w;parentConn[j]=-1;parentFoot[j]=s;}}};
    for(const o of origins){ea[o]=t0-CHANGE;}
    for(const o of origins)relax(o,t0-CHANGE);
    let lo=0,hi=C.count;while(lo<hi){const m=(lo+hi)>>1;if(C.dep[m]<t0)lo=m+1;else hi=m;}
    for(let c=lo;c<C.count;c++){
      const d=C.dep[c];if(d>limit)break;const tl=C.trip[c]-C.lo;
      if(state.pass&&C.passBlocked[tl])continue;
      if(board[tl]>=0||ea[C.from[c]]+CHANGE<=d){
        if(board[tl]<0)board[tl]=c;
        const a=C.arr[c],s=C.to[c];if(a<ea[s]){ea[s]=a;parentConn[s]=c;parentFoot[s]=-1;relax(s,a);}
      }
    }
    for(const o of origins){ea[o]=t0;parentConn[o]=-1;parentFoot[o]=-1;}
    return{ea,parentConn,parentFoot,board,t0,limit,origins:new Set(origins)};
  }

  function journey(target){
    const R=result,C=conn,legs=[];let s=target,guard=0;
    while(!R.origins.has(s)&&guard++<60){
      if(R.parentFoot[s]>=0){legs.unshift({walk:true,from:R.parentFoot[s],to:s,arr:R.ea[s]});s=R.parentFoot[s];continue;}
      const c=R.parentConn[s];if(c<0)break;const b=R.board[C.trip[c]-C.lo];
      legs.unshift({trip:C.trip[c],from:C.from[b],to:s,dep:C.dep[b],arr:C.arr[c],fromCall:C.call[b],toCall:C.call[c]+1});s=C.from[b];
    }
    return legs;
  }

  function recompute(){
    if(!state.origin)return;busy=true;$('reachStats').textContent='Working out every journey…';
    setTimeout(()=>{
      if(!conn||conn.day!==state.day){conn=buildConnections(state.day);conn.day=state.day;}
      const started=performance.now();result=scan();
      const limit=state.maxH*60;let reached=0,countries=new Set(),far=-1,farKm=0;const o=state.origin.stations[0];
      for(let i=0;i<N;i++){const m=result.ea[i]-state.t0;if(m<=limit&&!result.origins.has(i)){reached++;countries.add(S.country[i]);const km=haversineKm(S.lat[o],S.lon[o],S.lat[i],S.lon[i]);if(km>farKm){farKm=km;far=i;}}}
      $('reachStats').innerHTML=`<b>${fmt(reached)}</b> stations in ${countries.size} ${countries.size===1?'country':'countries'} within ${state.maxH} h.${far>=0?` Farthest: ${esc(S.names[far])}, ${fmt(farKm)} km away.`:''}`;
      busy=false;if(state.target>=0&&result.ea[state.target]-state.t0>limit)state.target=-1;showJourney();ctx.requestDraw();
      console.debug(`Reach scan ${Math.round(performance.now()-started)} ms`);
    },20);
  }

  function legendHTML(){const step=state.maxH/BANDS,label=h=>h<1?`${Math.round(h*60)} min`:`${+h.toFixed(1)} h`;
    $('reachLegend').innerHTML=`<div class="ramp">${RAMP.map(t=>`<span style="background:var(${t})"></span>`).join('')}</div><div class="ticks">${Array.from({length:BANDS+1},(_,i)=>`<span>${i?label(i*step):'0'}</span>`).join('')}</div><span><i style="background:var(--accent)"></i>Start</span>`;}
  $('reachMaxLabel').textContent=state.maxH+' h';

  function showJourney(){
    const box=$('reachJourney');if(state.target<0||!result){box.hidden=true;return;}
    const s=state.target,legs=journey(s),mins=result.ea[s]-state.t0,trains=legs.filter(l=>!l.walk).length;
    box.hidden=false;
    box.innerHTML=`<h3>${esc(S.names[s])}</h3><div class="meta">Arrive ${clockLabel(result.ea[s])} · ${Math.floor(mins/60)} h ${String(mins%60).padStart(2,'0')} min · ${trains<=1?'direct':`${trains-1} change${trains>2?'s':''}`}</div>
      <ol class="x-legs">${legs.map(l=>{if(l.walk)return`<li><span class="t"></span><span class="walk">Walk to ${esc(S.names[l.to])}</span></li>`;const info=tripInfo(data,l.trip);
        return`<li><span class="t">${clockLabel(l.dep)}</span><span>${esc(S.names[l.from])}<br><b>${esc(info.title)}</b> <span class="meta">${esc(info.operator)}</span></span><span class="t">${clockLabel(l.arr)}</span><span>${esc(S.names[l.to])}</span></li>`;}).join('')}</ol>
      <div class="actions"><button class="x-button" type="button" id="reachClear">Clear route</button></div>`;
    $('reachClear').onclick=()=>{state.target=-1;showJourney();ctx.requestDraw();};
  }

  function draw(){
    const tr=layer.transform(),W=layer.width,H=layer.height,g=layer.begin(),X=x=>x*tr.scale-tr.ox,Y=y=>y*tr.scale-tr.oy;shown=[];
    if(!result)return;
    const limit=state.maxH*60,step=limit/BANDS,r=Math.max(1.4,Math.min(4.5,1.4+(tr.z-4.5)*.6));
    const byBand=Array.from({length:BANDS},()=>[]);
    for(let i=0;i<N;i++){const m=result.ea[i]-state.t0;if(m>limit||result.origins.has(i))continue;const x=X(S.mx[i]),y=Y(S.my[i]);if(x<-8||y<-8||x>W+8||y>H+8)continue;byBand[Math.min(BANDS-1,Math.floor(m/step))].push(x,y);shown.push(x,y,i);}
    for(let b=BANDS-1;b>=0;b--){const a=byBand[b];if(!a.length)continue;g.fillStyle=colors[b];g.beginPath();for(let k=0;k<a.length;k+=2){g.moveTo(a[k]+r,a[k+1]);g.arc(a[k],a[k+1],r,0,6.283);}g.fill();}
    if(state.target>=0){const legs=journey(state.target);g.lineWidth=3;g.lineCap='round';g.lineJoin='round';
      for(const l of legs){g.strokeStyle=ctx.css('--accent');g.setLineDash(l.walk?[4,5]:[]);g.beginPath();
        if(l.walk){g.moveTo(X(S.mx[l.from]),Y(S.my[l.from]));g.lineTo(X(S.mx[l.to]),Y(S.my[l.to]));}
        else{const calls=tripInfo(data,l.trip).calls.slice(l.fromCall,l.toCall+1);calls.forEach((c,i)=>{const x=X(S.mx[c.station]),y=Y(S.my[c.station]);i?g.lineTo(x,y):g.moveTo(x,y);});}
        g.stroke();}
      g.setLineDash([]);g.fillStyle=ctx.css('--panel');g.strokeStyle=ctx.css('--accent');g.lineWidth=2;for(const l of legs)for(const s of [l.from,l.to]){g.beginPath();g.arc(X(S.mx[s]),Y(S.my[s]),4,0,6.283);g.fill();g.stroke();}}
    g.fillStyle=ctx.css('--accent');g.strokeStyle=ctx.css('--panel');g.lineWidth=2;for(const o of state.origin.stations){g.beginPath();g.arc(X(S.mx[o]),Y(S.my[o]),6,0,6.283);g.fill();g.stroke();}
  }

  function nearest(p){let best=-1,bd=100;for(let k=0;k<shown.length;k+=3){const d=(shown[k]-p.x)**2+(shown[k+1]-p.y)**2;if(d<bd){bd=d;best=shown[k+2];}}return best;}
  function onMove(p){const s=nearest(p);if(s<0||!result)return ctx.hideTooltip();const m=result.ea[s]-state.t0,legs=journey(s),trains=legs.filter(l=>!l.walk).length;
    ctx.tooltip(`<b>${esc(S.names[s])}</b><br>Arrive ${clockLabel(result.ea[s])} · ${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')} min<br>${trains<=1?'Direct train':`${trains-1} change${trains>2?'s':''}`} · click for the route`,p.x,p.y);}
  function onClick(p){const s=nearest(p);state.target=s;showJourney();ctx.requestDraw();}

  function setOrigin(entry){state.origin=entry;state.target=-1;$('reachFrom').value=entry.name;
    const xs=entry.stations;if(xs.length){let la=0,lo=0;for(const s of xs){la+=S.lat[s];lo+=S.lon[s];}ctx.map.panTo([la/xs.length,lo/xs.length],{animate:false});
      // On phones the controls are a bottom sheet: keep the origin above it.
      const panel=document.getElementById('panel');if(window.innerWidth<=760&&panel&&!panel.classList.contains('collapsed'))ctx.map.panBy([0,panel.offsetHeight/2],{animate:false});}
    recompute();}
  fillDaySelect($('reachDay'),data.dates,state.day);
  $('reachTime').innerHTML=Array.from({length:48},(_,i)=>`<option value="${i*30}"${i*30===state.t0?' selected':''}>${clockLabel(i*30)}</option>`).join('');
  attachStationSearch($('reachFrom'),$('reachFromList'),search,setOrigin);
  $('reachDay').addEventListener('change',e=>{state.day=+e.target.value;recompute();});
  $('reachTime').addEventListener('change',e=>{state.t0=+e.target.value;recompute();});
  $('reachMode').addEventListener('change',e=>{state.pass=e.target.value==='pass';recompute();});
  let maxTimer=0;$('reachMax').addEventListener('input',e=>{state.maxH=+e.target.value;$('reachMaxLabel').textContent=state.maxH+' h';legendHTML();clearTimeout(maxTimer);maxTimer=setTimeout(recompute,150);});
  const readColors=()=>{colors=RAMP.map(ctx.css);};readColors();legendHTML();

  return{
    activate(){if(!state.origin){const vienna=search('Vienna').find(e=>e.kind==='city')||search('Wien Hbf')[0];if(vienna)setOrigin(vienna);}},
    draw,onMove,onClick,onTheme:readColors,
  };
}
