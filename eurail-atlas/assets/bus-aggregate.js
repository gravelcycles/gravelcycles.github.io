import{validBusDocument}from'./bus-core.js?v=cec8b75fa8c21f7e';
import{safeBusBase}from'./bus-delivery.js?v=cec8b75fa8c21f7e';
import{worldPoint}from'./atlas-core.js?v=cec8b75fa8c21f7e';

export const BUS_AGGREGATE_LIMITS=Object.freeze({wireBytes:3*1024*1024,decodedBytes:16*1024*1024,vertices:250000,segments:1000000,profiles:65536,pixels:8*1024*1024});
const hash=/^[a-f0-9]{64}$/;
export function aggregateConfiguration(value,manifestSha){
  if(!value||value.busManifestSha256!==manifestSha||!hash.test(manifestSha)||!hash.test(value.catalogue?.sha256||'')||!Number.isSafeInteger(value.catalogue?.bytes)||value.catalogue.bytes<1||value.catalogue.bytes>BUS_AGGREGATE_LIMITS.wireBytes||!Number.isSafeInteger(value.catalogue?.uncompressedBytes)||value.catalogue.uncompressedBytes<1||value.catalogue.uncompressedBytes>BUS_AGGREGATE_LIMITS.decodedBytes||value.catalogue.encoding!=='gzip')throw new Error('Invalid aggregate overview binding');
  return{...value,assetBaseUrl:safeBusBase(value.assetBaseUrl).href};
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;

export function decodeAggregate(value,manifest,referenceZoom){
  const limits=BUS_AGGREGATE_LIMITS;
  validBusDocument(value,'bus_atlas_aggregate_overview');
  const scale=256*2**referenceZoom*4,profiles=value.profiles,counts=value.profilePatternCounts,n=value.segmentCount;
  if(value.referenceZoom!==referenceZoom||value.coordinateScale!==scale||value.segmentEncoding!=='u16le-columns-profile-ax-ay-bx-by'||!Array.isArray(profiles)||profiles.length>limits.profiles||!Array.isArray(counts)||counts.length!==profiles.length||!integer(n,0,limits.segments)||typeof value.segmentsB64!=='string'||value.segmentsB64.length>Math.ceil(n*10/3)*4)throw new Error('Invalid aggregate overview packet');
  const sources=new Set(manifest.sources.map(source=>source.id)),mask=2**manifest.dates.length-1;
  if(manifest.dates.length>16||!profiles.every((row,i)=>Array.isArray(row)&&row.length===(value.countryFilters===true?7:6)&&(!value.countryFilters||Array.isArray(row[6])&&row[6].every(c=>typeof c==='string'&&c.length>0&&c.length<100)&&new Set(row[6]).size===row[6].length)&&sources.has(row[0])&&typeof row[1]==='string'&&['bus','coach','trolleybus','rail_replacement_bus'].includes(row[2])&&['provider_shape','schematic','inferred_road'].includes(row[3])&&integer(row[4],0,mask)&&integer(row[5],0,mask)&&integer(counts[i],1,manifest.totals.patterns))||counts.reduce((a,b)=>a+b,0)!==manifest.totals.patterns)throw new Error('Aggregate profile/source/count mismatch');
  const binary=atob(value.segmentsB64);if(binary.length!==n*10)throw new Error('Aggregate segment bytes mismatch');
  const raw=Uint8Array.from(binary,c=>c.charCodeAt(0)),view=new DataView(raw.buffer),columns=new Uint16Array(n*5);
  for(let i=0;i<columns.length;i++)columns[i]=view.getUint16(i*2,true);
  for(let i=0;i<n;i++)if(columns[i]>=profiles.length||columns[n+i]>scale||columns[n*2+i]>scale||columns[n*3+i]>scale||columns[n*4+i]>scale||columns[n+i]>columns[n*3+i]||columns[n+i]===columns[n*3+i]&&columns[n*2+i]>columns[n*4+i])throw new Error('Invalid aggregate segment identity/position');
  return{profiles,counts,columns,n,scale};
}

export function aggregateScene(decoded,manifest,bounds,filters,reserve=0){
  const{profiles,counts,columns:c,n,scale}=decoded,day=manifest.dates.indexOf(filters.day),active=profiles.map(row=>(!filters.source||filters.source===row[0])&&(!filters.operator||filters.operator===row[1])&&(!filters.country||row[6]?.includes(filters.country))&&(!filters.international||row[6]?.length>1)&&(filters.day==='all'?row[4]||row[5]:day>=0&&((row[4]|row[5])&(1<<day))));
  const west=worldPoint(bounds[0],bounds[3]),east=worldPoint(bounds[2],bounds[1]),box=[west[0]/256*scale,west[1]/256*scale,east[0]/256*scale,east[1]/256*scale];
  const lines=[new Set(),new Set()],points=new Set();let vertices=0;
  for(let i=0;i<n;i++){
    const profile=c[i];if(!active[profile])continue;const ax=c[n+i],ay=c[n*2+i],bx=c[n*3+i],by=c[n*4+i];
    if(Math.max(ax,bx)<box[0]||Math.min(ax,bx)>box[2]||Math.max(ay,by)<box[1]||Math.min(ay,by)>box[3])continue;
    if(ax===bx&&ay===by){const key=ax*65536+ay;if(!points.has(key)){points.add(key);vertices++;}}
    else{const group=lines[profiles[profile][3]==='provider_shape'?0:1],key=ax+','+ay+','+bx+','+by;if(!group.has(key)){group.add(key);vertices+=2;}}
    if(vertices+reserve>BUS_AGGREGATE_LIMITS.vertices)return null;
  }
  const groups=lines.map((set,style)=>{const world=new Float64Array(set.size*4);let offset=0;for(const key of set)for(const value of key.split(','))world[offset++]=Number(value)/scale*256;return{world,dash:style===1};});
  const presence=new Float64Array(points.size*2);let offset=0;for(const key of points){presence[offset++]=Math.floor(key/65536)/scale*256;presence[offset++]=(key%65536)/scale*256;}
  const operators=new Map();profiles.forEach(row=>{if(row[1])operators.set(JSON.stringify(row.slice(0,2)),{sourceId:row[0],name:row[1]});});
  return{groups,presence,vertices,patternCount:counts.reduce((sum,count,i)=>sum+(active[i]?count:0),0),operators:[...operators.values()]};
}

export class BusAggregate{
  constructor(requests,configuration,{countryFilters=false}={}){this.countryFilters=countryFilters;this.requests=requests;this.configuration=configuration;this.catalogue=null;this.decoded=new WeakMap();this.scene=null;this.sequence=0;}
  async render(manifest,manifestSha,bounds,zoom,filters,camera,reserve,reader,check){
    const configuration=aggregateConfiguration(this.configuration,manifestSha),limits=BUS_AGGREGATE_LIMITS;
    if(!this.catalogue)this.catalogue=validBusDocument(await this.requests.load(configuration.catalogue,{reader,limit:limits.wireBytes}),'bus_atlas_aggregate_catalogue');check();
    const cat=this.catalogue;
    if(cat.busManifestSha256!==manifestSha||!same(cat.dates,manifest.dates)||!same([...cat.sourceIds||[]].sort(),manifest.sources.map(s=>s.id).sort())||cat.routeCount!==manifest.totals.patterns||cat.maxSceneVertices!==limits.vertices||!Array.isArray(cat.levels)||(cat.countryFilters===true)!==this.countryFilters||cat.levels.length!==(this.countryFilters?1:2)||!same(cat.levels.map(level=>level.referenceZoom).sort(),this.countryFilters?[3]:[3,5]))throw new Error('Aggregate catalogue/cohort mismatch');
    // All broad views use the complete generalized network. Source/operator/day
    // filters change membership before union without a second packet download;
    // local native paths and selected fine geometry take over at zoom 7.
    const referenceZoom=3,descriptor=cat.levels.find(item=>item.referenceZoom===referenceZoom);
    if(!hash.test(descriptor.sha256||'')||!integer(descriptor.bytes,1,limits.wireBytes)||!integer(descriptor.uncompressedBytes,1,limits.decodedBytes)||descriptor.encoding!=='gzip')throw new Error('Unbounded aggregate packet');
    const value=validBusDocument(await this.requests.load(descriptor,{reader,limit:limits.wireBytes}),'bus_atlas_aggregate_overview');check();
    if(value.busManifestSha256!==manifestSha||(value.countryFilters===true)!==this.countryFilters)throw new Error('Aggregate level/cohort mismatch');
    let decoded=this.decoded.get(value);if(!decoded){decoded=decodeAggregate(value,manifest,referenceZoom);this.decoded.set(value,decoded);}
    const scene=aggregateScene(decoded,manifest,bounds,filters,reserve);
    if(!scene)throw new Error('Complete aggregate overview exceeds scene budget');
    if(!camera||!integer(camera.width,1,4096)||!integer(camera.height,1,4096)||!Number.isFinite(camera.centerX+camera.centerY+camera.scale)||camera.scale!==2**zoom)throw new Error('Invalid aggregate camera');
    const id=++this.sequence,cell=16,gridWidth=Math.ceil(camera.width/cell),gridHeight=Math.ceil(camera.height/cell),occupancy=new Uint8Array(gridWidth*gridHeight);
    const screen=(x,y)=>[(x-camera.centerX)*camera.scale+camera.width/2,(y-camera.centerY)*camera.scale+camera.height/2];
    const mark=(x,y)=>{const cx=Math.floor(x/cell),cy=Math.floor(y/cell);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=cx+dx,yy=cy+dy;if(xx>=0&&yy>=0&&xx<gridWidth&&yy<gridHeight)occupancy[yy*gridWidth+xx]=1;}};
    for(const group of scene.groups)for(let i=0;i<group.world.length;i+=4){const[a,b]=screen(group.world[i],group.world[i+1]),[c,d]=screen(group.world[i+2],group.world[i+3]),steps=Math.min(512,Math.max(1,Math.ceil(Math.max(Math.abs(c-a),Math.abs(d-b))/cell)));for(let j=0;j<=steps;j++)mark(a+(c-a)*j/steps,b+(d-b)*j/steps);}
    for(let i=0;i<scene.presence.length;i+=2)mark(...screen(scene.presence[i],scene.presence[i+1]));
    let bitmap=null;const ratio=Math.min(2,Math.max(1,camera.pixelRatio||1));
    if(typeof OffscreenCanvas==='function'&&camera.width*camera.height*ratio*ratio<=limits.pixels){
      const canvas=new OffscreenCanvas(Math.ceil(camera.width*ratio),Math.ceil(camera.height*ratio)),ctx=canvas.getContext('2d');
      if(ctx){ctx.setTransform(ratio*camera.scale,0,0,ratio*camera.scale,ratio*(camera.width/2-camera.centerX*camera.scale),ratio*(camera.height/2-camera.centerY*camera.scale));ctx.strokeStyle='#b26918';ctx.fillStyle='#b26918';ctx.globalAlpha=.8;ctx.lineWidth=1.5/camera.scale;
        for(const group of scene.groups){ctx.beginPath();ctx.setLineDash(group.dash?[5/camera.scale,5/camera.scale]:[]);for(let i=0;i<group.world.length;i+=4){ctx.moveTo(group.world[i],group.world[i+1]);ctx.lineTo(group.world[i+2],group.world[i+3]);}ctx.stroke();}
        ctx.setLineDash([]);ctx.beginPath();for(let i=0;i<scene.presence.length;i+=2){const x=scene.presence[i],y=scene.presence[i+1],r=1.2/camera.scale;ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,Math.PI*2);}ctx.fill();bitmap=canvas.transferToImageBitmap();}
    }
    try{check();}catch(error){bitmap?.close();throw error;}
    this.scene={...scene,id,camera};
    return{aggregate:true,sceneId:id,camera,bitmap,aggregateGroups:bitmap?[]:scene.groups.map(group=>({...group,world:group.world.slice()})),presence:bitmap?new Float64Array():scene.presence.slice(),occupancy,gridWidth,cell,vertices:scene.vertices,patternCount:scene.patternCount,referenceZoom,operators:scene.operators,routes:[],stops:[],entries:['aggregate'],limited:false};
  }
  hit(id,x,y){
    const scene=this.scene;if(!scene||scene.id!==id||!Number.isFinite(x+y))return null;
    const camera=scene.camera,px=camera.centerX+(x-camera.width/2)/camera.scale,py=camera.centerY+(y-camera.height/2)/camera.scale;let best=(8/camera.scale)**2,point=null;
    for(const group of scene.groups)for(let i=0;i<group.world.length;i+=4){const a=group.world[i],b=group.world[i+1],dx=group.world[i+2]-a,dy=group.world[i+3]-b,t=Math.max(0,Math.min(1,((px-a)*dx+(py-b)*dy)/(dx*dx+dy*dy||1))),xx=a+t*dx,yy=b+t*dy,d=(px-xx)**2+(py-yy)**2;if(d<best){best=d;point=[xx,yy];}}
    for(let i=0;i<scene.presence.length;i+=2){const a=scene.presence[i],b=scene.presence[i+1],d=(px-a)**2+(py-b)**2;if(d<best){best=d;point=[a,b];}}
    return point?{hit:true,lon:point[0]/256*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*point[1]/256)))*180/Math.PI}:null;
  }
  clear(){this.catalogue=null;this.decoded=new WeakMap();this.scene=null;}
}
