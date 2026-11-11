// Place names on the Explore maps. Major cities first, then the busiest
// stations as the reader zooms in. Labels are placed greedily in order of
// weight and never overlap, and the number shown scales with the map area,
// so a phone gets a handful and a desktop a few dozen.

const cap=s=>s.split('-').map(w=>w?w[0].toUpperCase()+w.slice(1):w).join(' ');
// "Bahnhof Fulda" and "Fulda Bahnhof" read as "Fulda" on a map.
const short=name=>name.replace(/^Bahnhof\s+/,'').replace(/\s+Bahnhof$/,'')||name;

export function makeLabels(ctx){
  const{data,layer}=ctx,S=data.stations;
  // Weight: calls over the whole delivery, whatever dates it covers.
  const weight=new Float32Array(S.N),perPattern=new Uint32Array(data.patternStart.length);
  for(let t=0;t<data.trips;t++)perPattern[data.profilePattern[data.tripProfile[t]]]++;
  for(let p=0;p<perPattern.length-1;p++){const n=perPattern[p];if(!n)continue;for(let i=data.patternStart[p];i<data.patternStart[p+1];i++)weight[data.patternStation[i]]+=n;}
  const places=[],hubs=new Map();
  for(let i=0;i<S.N;i++){
    if(!weight[i])continue;
    if(S.hub[i]>=0){const h=hubs.get(S.hub[i])||{x:0,y:0,n:0,w:0};h.x+=S.mx[i];h.y+=S.my[i];h.n++;h.w+=weight[i];hubs.set(S.hub[i],h);
      places.push({x:S.mx[i],y:S.my[i],name:short(S.names[i]),w:weight[i],minZoom:9});}
    else places.push({x:S.mx[i],y:S.my[i],name:short(S.names[i]),w:weight[i],minZoom:6});
  }
  // A city outranks any single station, so the first names on a wide map are cities.
  for(const[h,v]of hubs)places.push({x:v.x/v.n,y:v.y/v.n,name:cap(S.hubs[h]),w:v.w+1e7,minZoom:0,city:true});
  places.sort((a,b)=>b.w-a.w);
  const widths=new Map(),phone=window.matchMedia('(max-width:760px)');let key='',shown=[];
  const FONT_CITY='600 12px ',FONT_STATION='500 11px ';

  function layout(g,tr,W,H){
    // On wider screens the controls float over the left of the map: keep names clear of them.
    let px=0,py0=0,py1=0;if(!phone.matches){const panel=document.getElementById('panel'),view=document.getElementById('mapView');if(panel&&view){const a=panel.getBoundingClientRect(),b=view.getBoundingClientRect();px=a.right-b.left+6;py0=a.top-b.top-8;py1=a.bottom-b.top+8;}}
    shown=[];const sans=ctx.css('--sans'),boxes=[],limit=Math.max(6,Math.min(48,Math.round(W*H/15000)));
    for(const p of places){
      if(shown.length>=limit)break;
      if(tr.z<p.minZoom)continue;
      const x=p.x*tr.scale-tr.ox,y=p.y*tr.scale-tr.oy;if(x<4||y<10||x>W-4||y>H-6)continue;
      let w=widths.get(p.name);if(w===undefined){g.font=(p.city?FONT_CITY:FONT_STATION)+sans;w=g.measureText(p.name).width;widths.set(p.name,w);}
      // To the right of the point, or to the left where the right edge is near.
      const left=x+7+w>W-4,x0=left?x-7-w:x+7,box=[x0-5,y-9,x0+w+5,y+9];
      if(box[0]<2||(box[0]<px&&y>py0&&y<py1))continue;
      let clash=false;for(const b of boxes){if(box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]){clash=true;break;}}
      if(clash)continue;
      boxes.push(box);shown.push({x,y,tx:x0,name:p.name,city:!!p.city});
    }
  }

  return{
    draw(){
      const tr=layer.transform(),W=layer.width,g=layer.ctx;
      // On phones the controls cover the foot of the map: place names only where they can be seen.
      let H=layer.height;if(phone.matches){const panel=document.getElementById('panel'),view=document.getElementById('mapView');if(panel&&view)H=Math.max(60,Math.min(H,panel.getBoundingClientRect().top-view.getBoundingClientRect().top));}
      const k=`${tr.z}|${tr.ox.toFixed(1)}|${tr.oy.toFixed(1)}|${W}|${H}|${document.getElementById('panel')?.offsetHeight}`;
      if(k!==key){key=k;layout(g,tr,W,H);}
      if(!shown.length)return;
      const sans=ctx.css('--sans'),ink=ctx.css('--ink'),halo=ctx.css('--land');
      g.save();g.textBaseline='middle';g.textAlign='left';g.lineJoin='round';g.lineWidth=3.5;g.strokeStyle=halo;
      for(const s of shown){
        g.globalAlpha=1;g.fillStyle=halo;g.beginPath();g.arc(s.x,s.y,s.city?3.2:2.4,0,6.283);g.fill();
        g.lineWidth=1.4;g.strokeStyle=ink;g.stroke();
        g.font=(s.city?FONT_CITY:FONT_STATION)+sans;g.lineWidth=3.5;g.strokeStyle=halo;g.globalAlpha=.9;g.strokeText(s.name,s.tx,s.y);
        g.globalAlpha=s.city?1:.82;g.fillStyle=ink;g.fillText(s.name,s.tx,s.y);
      }
      g.restore();
    },
    reset(){key='';},
  };
}
