// Europe in motion: every timed train at its scheduled position for one day.
import{CATEGORY_LABELS,PASS_LABELS,tripInfo,clockLabel,clockName}from'./explore-data.js?v=18e7ea9f6c5b7ed8';
import{fillDaySelect,esc,fmt}from'./explore-ui.js?v=18e7ea9f6c5b7ed8';

const $=id=>document.getElementById(id);
const RAD=Math.PI/180,KM_PER_WORLD=40075.016/256,TRAIL=10,MAX_ACTIVE=60000;
const unproject=(x,y)=>[Math.atan(Math.sinh(Math.PI*(1-2*y/256)))/RAD,x/256*360-180];

// Colour modes: label list, palette tokens and a value function per train.
const MODES={
  category:{legend:CATEGORY_LABELS,tokens:['--c1','--c2','--c3','--c4']},
  pass:{legend:['No reservation needed','Reservation required','Not included','Uncertain'],tokens:['--c1','--c3','--c-mag','--c-neutral']},
  direction:{legend:['Northbound','Eastbound','Southbound','Westbound','Standing at a stop'],tokens:['--c2','--c3','--c1','--c4','--c-neutral']},
  speed:{legend:['Under 60','60–100','100–140','140–200','200+ km/h','Standing'],tokens:['--s4','--s3','--s2','--s1','--accent','--c-neutral'],ramp:true},
  length:{legend:['Under 50','50–150','150–400','400–800','800+ km'],tokens:['--s4','--s3','--s2','--s1','--accent'],ramp:true},
  progress:{legend:['Just left','','Halfway','','Nearly there'],tokens:['--s4','--s3','--s2','--s1','--accent'],ramp:true},
};
const PASS_ORDER=[0,1,3,2]; // data pass class -> legend slot

export function create(ctx){
  const{data,map,layer}=ctx,S=data.stations;
  const T_ALL=data.trips,tripPattern=new Uint32Array(T_ALL),tripCat=new Uint8Array(T_ALL);
  for(let t=0;t<T_ALL;t++){const p=data.profilePattern[data.tripProfile[t]];tripPattern[t]=p;tripCat[t]=data.journeys.patternCategory[p];}
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const state={day:3,T:8*60,rate:5,playing:!reduced,mode:'category',cats:[true,true,true,true],trails:true,selected:-1,follow:false};
  let colors=[],lastTime=0,active=0,spark=null;
  const ax=new Float32Array(MAX_ACTIVE),ay=new Float32Array(MAX_ACTIVE),at=new Uint32Array(MAX_ACTIVE);
  const out={x:0,y:0,speed:0,dx:0,dy:0,moving:false,progress:0};

  // Position of trip t at minute T, in z0 Web Mercator world units.
  function locate(t,T,o=out){
    const p=data.tripProfile[t],base=data.profileStart[p],n=data.profileStart[p+1]-base,rel=T-data.tripStart[t];
    const pattern=tripPattern[t],ps=data.patternStart[pattern],arr=data.profileArr,dep=data.profileDep;
    let lo=0,hi=n-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(arr[base+mid]<=rel)lo=mid;else hi=mid-1;}
    const a=data.patternStation[ps+lo];o.progress=Math.min(1,Math.max(0,rel/Math.max(1,arr[base+n-1])));
    if(lo===n-1||rel<=dep[base+lo]){
      o.x=S.mx[a];o.y=S.my[a];o.moving=false;o.speed=0;
      const b=data.patternStation[ps+Math.min(n-1,lo+1)],c=lo===n-1?data.patternStation[ps+lo-1]:a;
      o.dx=lo===n-1?S.mx[a]-S.mx[c]:S.mx[b]-S.mx[a];o.dy=lo===n-1?S.my[a]-S.my[c]:S.my[b]-S.my[a];return o;}
    const b=data.patternStation[ps+lo+1],t0=dep[base+lo],t1=arr[base+lo+1],f=t1>t0?(rel-t0)/(t1-t0):1;
    o.dx=S.mx[b]-S.mx[a];o.dy=S.my[b]-S.my[a];o.x=S.mx[a]+o.dx*f;o.y=S.my[a]+o.dy*f;o.moving=true;
    const km=Math.hypot(o.dx,o.dy)*KM_PER_WORLD*Math.cos(S.lat[a]*RAD);o.speed=t1>t0?km/((t1-t0)/60):0;return o;
  }
  function slot(t,o){
    switch(state.mode){
      case'category':return tripCat[t];
      case'pass':return PASS_ORDER[data.journeys.patternPass[tripPattern[t]]];
      case'direction':{if(!o.moving)return 4;const a=Math.atan2(-o.dy,o.dx)/RAD;return a>=45&&a<135?0:a>=-45&&a<45?1:a>=-135&&a<-45?2:3;}
      case'speed':{if(!o.moving)return 5;const v=o.speed;return v<60?0:v<100?1:v<140?2:v<200?3:4;}
      case'length':{const km=data.journeys.patternKm[tripPattern[t]];return km<50?0:km<150?1:km<400?2:km<800?3:4;}
      default:return Math.min(4,Math.floor(o.progress*5));
    }
  }
  function readColors(){colors=MODES[state.mode].tokens.map(ctx.css);}
  function legend(){const m=MODES[state.mode];$('motionLegend').innerHTML=m.legend.map((label,i)=>label?`<span><i style="background:var(${m.tokens[i]})"></i>${esc(label)}</span>`:'').join('');}

  const range=()=>[data.dayStart[state.day],data.dayStart[state.day+1]];
  function computeSpark(){
    const bins=new Float32Array(145),[lo,hi]=range();
    for(let t=lo;t<hi;t++){if(!state.cats[tripCat[t]])continue;const a=Math.max(0,Math.floor(data.tripStart[t]/10)),b=Math.min(144,Math.floor(data.tripEnd[t]/10)+1);if(b<=0||a>=144)continue;bins[a]++;bins[b]--;}
    let run=0;for(let i=0;i<144;i++){run+=bins[i];bins[i]=run;}spark=bins.subarray(0,144);drawSpark();
  }
  function drawSpark(){
    const c=$('motionSpark'),w=c.clientWidth||300,h=56,dpr=Math.min(2,window.devicePixelRatio||1);
    if(c.width!==Math.round(w*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
    const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);if(!spark)return;
    let max=1;for(const v of spark)max=Math.max(max,v);
    g.fillStyle=ctx.css('--s4');g.beginPath();g.moveTo(0,h-12);for(let i=0;i<144;i++)g.lineTo(i/143*w,h-12-(spark[i]/max)*(h-18));g.lineTo(w,h-12);g.closePath();g.fill();
    g.fillStyle=ctx.css('--muted');g.font='10px '+ctx.css('--sans');g.textAlign='center';for(const hr of [0,6,12,18,24])g.fillText(String(hr).padStart(2,'0'),Math.min(w-8,Math.max(8,hr/24*w)),h-1);
    const x=state.T/1440*w;g.strokeStyle=ctx.css('--accent');g.lineWidth=2;g.beginPath();g.moveTo(x,0);g.lineTo(x,h-12);g.stroke();
  }

  function selectedPanel(){
    const box=$('motionSelected');if(state.selected<0){box.hidden=true;return;}
    const info=tripInfo(data,state.selected),first=info.calls[0],last=info.calls[info.calls.length-1],km=data.journeys.patternKm[info.pattern];
    box.hidden=false;
    box.innerHTML=`<h3>${esc(info.title)}</h3><div class="meta">${esc(info.operator)}</div>
      <div>${esc(info.from)} ${clockLabel(first.dep)} → ${esc(info.to)} ${clockLabel(last.arr)}</div>
      <div class="meta">${info.calls.length} stops · ${fmt(km)} km in a straight line · ${esc(CATEGORY_LABELS[info.category])} · ${esc(PASS_LABELS[info.pass])}</div>
      <div class="actions"><button class="x-button" type="button" id="motionFollow">${state.follow?'Stop following':'Follow this train'}</button><button class="x-button" type="button" id="motionClear">Clear</button></div>`;
    $('motionFollow').onclick=()=>{state.follow=!state.follow;selectedPanel();ctx.requestDraw();};
    $('motionClear').onclick=()=>{state.selected=-1;state.follow=false;selectedPanel();ctx.requestDraw();};
  }

  function draw(time){
    if(state.playing&&lastTime){state.T+=(time-lastTime)/1000*state.rate;if(state.T>=1440)state.T-=1440;}
    lastTime=state.playing?time:0;
    const tr=layer.transform(),W=layer.width,H=layer.height,g=layer.begin(),z=tr.z,sc=tr.scale;
    const X=x=>x*sc-tr.ox,Y=y=>y*sc-tr.oy;
    if(z>=7.5){g.fillStyle=ctx.css('--station');const r=z>=10?1.6:1;for(let i=0;i<S.N;i++){const x=X(S.mx[i]),y=Y(S.my[i]);if(x>-4&&y>-4&&x<W+4&&y<H+4)g.fillRect(x-r,y-r,2*r,2*r);}}
    if(state.selected>=0){const calls=tripInfo(data,state.selected).calls;g.strokeStyle=ctx.css('--route-hi');g.lineWidth=2.5;g.globalAlpha=.75;g.beginPath();calls.forEach((c,i)=>{const x=X(S.mx[c.station]),y=Y(S.my[c.station]);i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();g.globalAlpha=1;
      g.fillStyle=ctx.css('--panel');g.strokeStyle=ctx.css('--route-hi');g.lineWidth=1.5;for(const c of calls){const x=X(S.mx[c.station]),y=Y(S.my[c.station]);g.beginPath();g.arc(x,y,3,0,6.283);g.fill();g.stroke();}}
    const [lo,hi]=range(),T=state.T,K=colors.length,buckets=Array.from({length:K},()=>[]),trails=Array.from({length:K},()=>[]);
    const back={x:0,y:0,speed:0,dx:0,dy:0,moving:false,progress:0};active=0;let total=0;
    for(let t=lo;t<hi;t++){
      if(data.tripStart[t]>T||data.tripEnd[t]<T||!state.cats[tripCat[t]])continue;total++;
      locate(t,T);const x=X(out.x),y=Y(out.y);if(x<-30||y<-30||x>W+30||y>H+30)continue;
      const k=slot(t,out);buckets[k].push(x,y);
      if(state.trails&&T-data.tripStart[t]>0){locate(t,Math.max(data.tripStart[t],T-TRAIL),back);trails[k].push(X(back.x),Y(back.y),x,y);}
      if(active<MAX_ACTIVE){ax[active]=x;ay[active]=y;at[active]=t;active++;}
    }
    const r=Math.max(1.2,Math.min(4,1.2+(z-4.5)*.5));
    if(state.trails){g.lineWidth=Math.max(1,r*.8);g.lineCap='round';g.globalAlpha=.4;for(let k=0;k<K;k++){const a=trails[k];if(!a.length)continue;g.strokeStyle=colors[k];g.beginPath();for(let i=0;i<a.length;i+=4){g.moveTo(a[i],a[i+1]);g.lineTo(a[i+2],a[i+3]);}g.stroke();}g.globalAlpha=1;}
    for(let k=0;k<K;k++){const a=buckets[k];if(!a.length)continue;g.fillStyle=colors[k];g.beginPath();for(let i=0;i<a.length;i+=2){g.moveTo(a[i]+r,a[i+1]);g.arc(a[i],a[i+1],r,0,6.283);}g.fill();}
    if(state.selected>=0&&data.tripStart[state.selected]<=T&&data.tripEnd[state.selected]>=T){
      locate(state.selected,T);const x=X(out.x),y=Y(out.y);g.strokeStyle=ctx.css('--route-hi');g.lineWidth=3;g.beginPath();g.arc(x,y,r+5,0,6.283);g.stroke();
      if(state.follow&&(Math.abs(x-W/2)>2||Math.abs(y-H/2)>2))map.panTo(unproject(out.x,out.y),{animate:false});
    }
    $('motionClock').textContent=clockLabel(T)+' '+clockName(data.manifest);$('motionCount').textContent=`${fmt(total)} trains moving`;
    const slider=$('motionTime');if(document.activeElement!==slider)slider.value=Math.floor(T);
    if(state.playing)drawSpark();
  }

  function nearest(p){let best=-1,bd=81;for(let i=0;i<active;i++){const d=(ax[i]-p.x)**2+(ay[i]-p.y)**2;if(d<bd){bd=d;best=i;}}return best<0?-1:at[best];}
  function onMove(p){
    const t=nearest(p);if(t<0)return ctx.hideTooltip();
    const info=tripInfo(data,t),o=locate(t,state.T,{});let next=info.calls.find(c=>c.arr>=state.T)||info.calls[info.calls.length-1];
    ctx.tooltip(`<b>${esc(info.title)}</b> · ${esc(info.operator)}<br>${esc(info.from)} → ${esc(info.to)}<br>${o.moving?`${fmt(o.speed)} km/h · next ${esc(S.names[next.station])} ${clockLabel(next.arr)}`:`At ${esc(S.names[next.station])}`}`,p.x,p.y);
  }
  function onClick(p){const t=nearest(p);state.selected=t;state.follow=false;selectedPanel();if(t>=0)ctx.reveal($('motionSelected'));ctx.requestDraw();}

  // Controls
  fillDaySelect($('motionDay'),data.dates,state.day);
  $('motionCategories').innerHTML='<legend>Show</legend>'+CATEGORY_LABELS.map((l,i)=>`<label><input type="checkbox" data-cat="${i}" checked> ${esc(l)}</label>`).join('');
  $('motionCategories').addEventListener('change',e=>{const i=+e.target.dataset.cat;state.cats[i]=e.target.checked;computeSpark();ctx.requestDraw();});
  $('motionDay').addEventListener('change',e=>{state.day=+e.target.value;state.selected=-1;state.follow=false;selectedPanel();computeSpark();ctx.requestDraw();});
  $('motionRate').addEventListener('change',e=>{state.rate=+e.target.value;});
  $('motionColor').addEventListener('change',e=>{state.mode=e.target.value;readColors();legend();ctx.requestDraw();});
  $('motionTrails').addEventListener('change',e=>{state.trails=e.target.checked;ctx.requestDraw();});
  $('motionTime').addEventListener('input',e=>{state.T=+e.target.value;drawSpark();ctx.requestDraw();});
  $('motionPlay').addEventListener('click',()=>{state.playing=!state.playing;$('motionPlay').textContent=state.playing?'Pause':'Play';ctx.requestDraw();});
  $('motionPlay').textContent=state.playing?'Pause':'Play';
  $('motionSpark').addEventListener('click',e=>{const r=e.currentTarget.getBoundingClientRect();state.T=Math.max(0,Math.min(1439,(e.clientX-r.left)/r.width*1440));drawSpark();ctx.requestDraw();});
  readColors();legend();

  return{
    activate(){computeSpark();lastTime=0;},
    deactivate(){lastTime=0;},
    animating:()=>state.playing||state.follow,
    draw,onMove,onClick,
    onTheme(){readColors();drawSpark();},
  };
}
