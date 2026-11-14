// Speed: every hop between consecutive stops, coloured by scheduled
// straight-line speed for one day's trains.
import{CATEGORY_LABELS,haversineKm}from'./explore-data.js?v=a613641732ab9825';
import{fillDaySelect,esc,fmt}from'./explore-ui.js?v=a613641732ab9825';
import{capFramePadding}from'./frame-padding.js?v=a613641732ab9825';

const $=id=>document.getElementById(id);
const BANDS=[[60,'Under 60','--s6'],[90,'60–90','--s5'],[120,'90–120','--s4'],[160,'120–160','--s3'],[200,'160–200','--s2'],[1e9,'200+ km/h','--accent']];
// Hops faster than these are location errors (a misplaced station), not trains.
const MAX_KMH=330,MAX_REGIONAL_KMH=200,MIN_KM=2;

export function create(ctx){
  const{data,layer,map}=ctx,S=data.stations;
  const state={day:3,metric:'best',cats:[true,true,true,true],min:1};
  // Straight-line length of every pattern hop, computed once.
  const hopKm=new Float32Array(data.patternStation.length);
  for(let p=0;p<data.patternStart.length-1;p++)for(let i=data.patternStart[p];i<data.patternStart[p+1]-1;i++){const a=data.patternStation[i],b=data.patternStation[i+1];hopKm[i]=haversineKm(S.lat[a],S.lon[a],S.lat[b],S.lon[b]);}
  let seg=null,colors=[],drawn=null,drawnCount=0,topTimer=0;

  function aggregate(){
    const lo=data.dayStart[state.day],hi=data.dayStart[state.day+1],index=new Map(),A=[],B=[],count=[],best=[],sum=[],km=[];
    for(let t=lo;t<hi;t++){
      const p=data.tripProfile[t],pat=data.profilePattern[p],cat=data.journeys.patternCategory[pat];if(!state.cats[cat])continue;
      const cap=cat===0?MAX_REGIONAL_KMH:MAX_KMH;
      const ps=data.patternStart[pat],b=data.profileStart[p],n=data.profileStart[p+1]-b;
      for(let i=0;i<n-1;i++){
        const d=hopKm[ps+i],minutes=data.profileArr[b+i+1]-data.profileDep[b+i];if(d<MIN_KM||minutes<=0)continue;
        const v=d/(minutes/60);if(v>cap)continue;
        let a=data.patternStation[ps+i],c=data.patternStation[ps+i+1];if(a>c){const x=a;a=c;c=x;}
        const key=a*65536+c;let k=index.get(key);
        if(k===undefined){k=A.length;index.set(key,k);A.push(a);B.push(c);count.push(0);best.push(0);sum.push(0);km.push(d);}
        count[k]++;sum[k]+=v;if(v>best[k])best[k]=v;
      }
    }
    // Weekday/Sunday counts already reflect the chosen date; nothing to scale.
    const order=A.map((_,k)=>k);
    seg={A,B,count,best,typical:sum.map((s,k)=>s/count[k]),km,order};
    sortOrder();
  }
  function sortOrder(){const v=state.metric==='best'?seg.best:seg.typical;seg.order.sort((x,y)=>v[x]-v[y]);}
  const band=v=>{for(let i=0;i<BANDS.length;i++)if(v<BANDS[i][0])return i;return BANDS.length-1;};

  function draw(){
    const tr=layer.transform(),W=layer.width,H=layer.height,g=layer.begin(),X=x=>x*tr.scale-tr.ox,Y=y=>y*tr.scale-tr.oy;
    if(!seg)return;
    const v=state.metric==='best'?seg.best:seg.typical,zoomWidth=Math.max(0.6,Math.min(2.2,(tr.z-3.5)*0.45));
    if(!drawn||drawn.length<seg.A.length*5)drawn=new Float32Array(seg.A.length*5);drawnCount=0;
    g.lineCap='round';let current=-1,currentWidth=-1;
    for(const k of seg.order){
      if(seg.count[k]<state.min)continue;
      const a=seg.A[k],b=seg.B[k],x1=X(S.mx[a]),y1=Y(S.my[a]),x2=X(S.mx[b]),y2=Y(S.my[b]);
      if(Math.max(x1,x2)<-5||Math.min(x1,x2)>W+5||Math.max(y1,y2)<-5||Math.min(y1,y2)>H+5)continue;
      const bi=band(v[k]),width=Math.round((0.7+Math.log2(seg.count[k]+1)*0.45)*zoomWidth*2)/2;
      if(bi!==current||width!==currentWidth){if(current>=0)g.stroke();g.beginPath();g.strokeStyle=colors[bi];g.lineWidth=width;current=bi;currentWidth=width;}
      g.moveTo(x1,y1);g.lineTo(x2,y2);
      const o=drawnCount*5;drawn[o]=x1;drawn[o+1]=y1;drawn[o+2]=x2;drawn[o+3]=y2;drawn[o+4]=k;drawnCount++;
    }
    if(current>=0)g.stroke();
    clearTimeout(topTimer);topTimer=setTimeout(()=>topList(v),180);
  }
  // The list of fastest hops in view refreshes once the map stops moving.
  function topList(v){
    const top=[];for(let i=0;i<drawnCount;i++){const k=drawn[i*5+4];if(seg.km[k]>=20)top.push(k);}
    top.sort((x,y)=>v[y]-v[x]);
    $('speedTop').innerHTML=top.slice(0,10).map(k=>`<li><button type="button" data-k="${k}"><b>${fmt(v[k])} km/h</b> ${esc(S.names[seg.A[k]])} – ${esc(S.names[seg.B[k]])} <span class="x-note">${fmt(seg.km[k])} km · ${seg.count[k]}/day</span></button></li>`).join('')||'<li class="x-note">No hops of 20 km or more in view.</li>';
  }

  function nearest(p){
    let best=-1,bd=49;
    for(let i=0;i<drawnCount;i++){const o=i*5,x1=drawn[o],y1=drawn[o+1],x2=drawn[o+2],y2=drawn[o+3],dx=x2-x1,dy=y2-y1,l=dx*dx+dy*dy;let t=l?((p.x-x1)*dx+(p.y-y1)*dy)/l:0;t=Math.max(0,Math.min(1,t));const d=(x1+t*dx-p.x)**2+(y1+t*dy-p.y)**2;if(d<=bd){bd=d;best=drawn[o+4];}}
    return best;
  }
  function onMove(p){
    const k=nearest(p);if(k<0)return ctx.hideTooltip();
    ctx.tooltip(`<b>${esc(S.names[seg.A[k]])} – ${esc(S.names[seg.B[k]])}</b><br>${fmt(seg.km[k])} km in a straight line · ${seg.count[k]} trains this day<br>Fastest ${fmt(seg.best[k])} km/h · typical ${fmt(seg.typical[k])} km/h`,p.x,p.y);
  }
  // Capped so a ~250 px landscape phone does not collapse to maxZoom 10. The
  // 0.7 share leaves portrait phones at least 343 px wide (240 px of padding)
  // and desktop framed exactly as before.
  function zoomTo(k){map.fitBounds([[S.lat[seg.A[k]],S.lon[seg.A[k]]],[S.lat[seg.B[k]],S.lon[seg.B[k]]]],{...capFramePadding({padding:[120,120]},map.getSize(),.7),maxZoom:10});}

  fillDaySelect($('speedDay'),data.dates,state.day);
  $('speedCategories').innerHTML='<legend>Trains</legend>'+CATEGORY_LABELS.map((l,i)=>`<label><input type="checkbox" data-cat="${i}" checked> ${esc(l)}</label>`).join('');
  $('speedLegend').innerHTML=BANDS.map(b=>`<span><i class="line" style="background:var(${b[2]})"></i>${esc(b[1])}</span>`).join('')+'<span>Thicker lines carry more trains</span>';
  $('speedCategories').addEventListener('change',e=>{state.cats[+e.target.dataset.cat]=e.target.checked;aggregate();ctx.requestDraw();});
  $('speedDay').addEventListener('change',e=>{state.day=+e.target.value;aggregate();ctx.requestDraw();});
  $('speedMetric').addEventListener('change',e=>{state.metric=e.target.value;sortOrder();ctx.requestDraw();});
  $('speedMin').addEventListener('input',e=>{state.min=+e.target.value;$('speedMinLabel').textContent=state.min;ctx.requestDraw();});
  $('speedTop').addEventListener('click',e=>{const b=e.target.closest('button[data-k]');if(b)zoomTo(+b.dataset.k);});
  const readColors=()=>{colors=BANDS.map(b=>ctx.css(b[2]));};readColors();

  return{activate(){if(!seg)aggregate();},draw,onMove,onTheme:readColors};
}
