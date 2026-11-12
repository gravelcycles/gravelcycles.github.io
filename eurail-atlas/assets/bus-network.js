import{BusRequests,validBusDocument,foldBusText}from'./bus-core.js?v=8eeddc2d0b1f1115';
import{FREQUENCY_BREAKS,FREQUENCY_COLORS}from'./atlas-core.js?v=8eeddc2d0b1f1115';

// Spatial network tiles: every published path segment in the viewport, with the
// scheduled trips that use it. Unlike the identity-ordered native packets, a
// city view is complete in a handful of small location-keyed files.
export const BUS_NETWORK_LIMITS=Object.freeze({tiles:24,wireBytes:16*1024*1024,segments:450000,lines:40,variants:12,hitPixels:9,rasterSegments:20000});
const HASH=/^[a-f0-9]{64}$/,WORLD=256,aborted=()=>new DOMException('Stale bus request','AbortError');
const invalid=()=>{throw new Error('Invalid bus network tile');};
const sized=row=>Number.isSafeInteger(row?.bytes)&&row.bytes>0&&Number.isSafeInteger(row.uncompressedBytes)&&row.uncompressedBytes>0&&HASH.test(row.sha256||'');
function bytesOf(text,length){
  if(typeof text!=='string')invalid();
  const raw=atob(text);if(length!==undefined&&raw.length!==length)invalid();
  const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;
}
const little=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
function typed(text,Type,count){
  const size=Type.BYTES_PER_ELEMENT,bytes=bytesOf(text,count*size);
  if(little||size===1)return new Type(bytes.buffer,0,count);
  const view=new DataView(bytes.buffer),out=new Type(count);
  for(let i=0;i<count;i++)out[i]=size===4?view.getUint32(i*4,true):Type===Int16Array?view.getInt16(i*2,true):view.getUint16(i*2,true);
  return out;
}
export const busFrequencyBand=value=>{let band=0;while(band<FREQUENCY_BREAKS.length-1&&value>=FREQUENCY_BREAKS[band+1])band++;return band;};
const worldX=lon=>(lon+180)/360*WORLD,worldY=lat=>{const s=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180);return(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*WORLD;};
// One stroke per legend band, quiet bands first so busy corridors stay on top.
// Shared by the page canvas and the worker's off-thread bitmap.
export function busNetworkPaths(bands){
  return bands.map(group=>{const path=new Path2D(),w=group.world;for(let i=0;i<w.length;i+=4){path.moveTo(w[i],w[i+1]);path.lineTo(w[i+2],w[i+3]);}return{path,band:group.band,dash:group.dash};});
}
export function paintBusNetwork(ctx,paths,view,ratio,{focused=false,members=false}={}){
  const zoom=view.zoom,base=zoom<7?.8:zoom<11?1.2:1.8,step=zoom<7?.22:zoom<11?.3:.45;
  ctx.setTransform(ratio*view.scale,0,0,ratio*view.scale,ratio*(view.width/2-view.centerX*view.scale),ratio*(view.height/2-view.centerY*view.scale));
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const group of paths){
    ctx.strokeStyle=focused?'#aab3ae':FREQUENCY_COLORS[group.band];
    ctx.globalAlpha=focused?.5:group.dash?.72:.95;
    ctx.lineWidth=(base+group.band*step)*(group.dash?.85:1)/view.scale;
    // Dashes mark straight stop-to-stop links only where they are long enough
    // to read; short generalized cells would render solid anyway.
    ctx.setLineDash(group.dash&&members&&zoom>=12?[6/view.scale,5/view.scale]:[]);
    ctx.stroke(group.path);
  }
  ctx.setLineDash([]);ctx.globalAlpha=1;ctx.lineCap='butt';
}
export const busNetworkLevel=(levels,zoom)=>{let chosen=levels[0];for(const level of levels)if(zoom>=level.minimumZoom)chosen=level;return chosen;};

export class BusNetwork{
  constructor(configuration,options={}){
    this.configuration=configuration;
    // A separate small pool: many short location tiles benefit from more
    // parallel downloads than the three used for multi-megabyte packets.
    this.requests=options.requests||new BusRequests(configuration.assetBaseUrl,{...options,sharedPool:null,detailsBaseUrl:null,requireHashes:true,concurrency:6,maximumBytes:64*1024*1024});
    this.decoded=new WeakMap();this.indexes=new WeakMap();this.scene=null;this.sequence=0;
  }
  cancel(reader){this.requests.cancel(reader);}
  clear(){this.requests.cancelAll();this.decoded=new WeakMap();this.indexes=new WeakMap();this.scene=null;}
  async catalogue(manifest,manifestSha,reader){
    const c=this.configuration;
    if(manifestSha!==c.busManifestSha256)throw new Error('Bus network cohort mismatch');
    const value=validBusDocument(await this.requests.load(c.catalogue,{reader,limit:2*1024*1024}),'bus_atlas_network_catalogue');
    if(value.busManifestSha256!==manifestSha||JSON.stringify(value.dates)!==JSON.stringify(manifest.dates)||!Array.isArray(value.levels)||!value.levels.length||JSON.stringify(value.frequencyBreaks)!==JSON.stringify(FREQUENCY_BREAKS)||!Array.isArray(value.sourceIds)||!Array.isArray(value.modes)||!Array.isArray(value.countries)||value.levels.some(l=>!Number.isSafeInteger(l.tileZoom)||l.tileZoom<0||l.tileZoom>12||!Number.isSafeInteger(l.grid)||l.grid<2||l.grid>32767||!Number.isFinite(l.minimumZoom)||!Array.isArray(l.indexes)||l.indexes.some(d=>!sized(d))))throw new Error('Invalid bus network catalogue');
    const known=new Set(manifest.sources.map(s=>s.id));
    if(value.sourceIds.some(id=>!known.has(id)))throw new Error('Bus network source binding changed');
    return value;
  }
  eligible(catalogue,zoom,filters){
    // Operator names exist only where exact pattern membership is published.
    return!filters.operator||busNetworkLevel(catalogue.levels,zoom).members===true;
  }
  index(document,level){
    let rows=this.indexes.get(document);
    if(!rows){
      if(document.tileZoom!==level.tileZoom||!Array.isArray(document.tiles))invalid();
      rows=new Map();
      for(const row of document.tiles){
        const[x,y,bytes,uncompressedBytes,sha256,segments]=row,limit=2**level.tileZoom;
        if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x>=limit||y>=limit||!Number.isSafeInteger(segments)||segments<0)invalid();
        const descriptor={path:`tiles/${level.tileZoom}/${x}/${y}.json.gz`,sha256,bytes,uncompressedBytes,encoding:'gzip',segments,x,y};
        if(!sized(descriptor))invalid();
        rows.set(x+'/'+y,descriptor);
      }
      this.indexes.set(document,rows);
    }
    return rows;
  }
  decode(document,level,catalogue,descriptor){
    let tile=this.decoded.get(document);
    if(tile)return tile;
    const n=document.segmentCount,grid=level.grid;
    if(document.busManifestSha256!==catalogue.busManifestSha256||document.tileZoom!==level.tileZoom||document.grid!==grid||document.x!==descriptor.x||document.y!==descriptor.y||!Number.isSafeInteger(n)||n<0||n>4000000||document.members!==level.members)invalid();
    const start=typed(document.startB64,Uint16Array,n*2),offset=typed(document.offsetB64,Int16Array,n*2),world=new Float64Array(n*4),size=WORLD/2**level.tileZoom,unit=size/grid,ox=document.x*size,oy=document.y*size;
    for(let i=0;i<n;i++){
      const ax=start[i],ay=start[n+i],bx=ax+offset[i],by=ay+offset[n+i];
      if(ax>grid||ay>grid||bx<0||by<0||bx>grid||by>grid)invalid();
      world[i*4]=ox+ax*unit;world[i*4+1]=oy+ay*unit;world[i*4+2]=ox+bx*unit;world[i*4+3]=oy+by*unit;
    }
    const sets=document.countrySets;
    if(!Array.isArray(sets)||sets.some(s=>!Array.isArray(s)||s.some(v=>!Number.isSafeInteger(v)||v<0||v>=catalogue.countries.length)))invalid();
    const days=catalogue.dates.length;
    if(level.members){
      const p=document.patternCount,m=document.memberCount;
      if(!Number.isSafeInteger(p)||p<1||!Number.isSafeInteger(m)||m<n||document.patternIdBytes!==12||![2,4].includes(document.memberBytes)||!Array.isArray(document.lines)||!Array.isArray(document.names))invalid();
      const first=typed(document.segmentStartB64,Uint32Array,n+1),members=typed(document.membersB64,document.memberBytes===2?Uint16Array:Uint32Array,m),line=typed(document.patternLineB64,Uint32Array,p),country=typed(document.patternCountryB64,Uint16Array,p);
      if(first[0]!==0||first[n]!==m)invalid();
      for(let i=0;i<n;i++)if(first[i+1]<=first[i])invalid();
      for(let i=0;i<m;i++)if(members[i]>=p)invalid();
      for(let i=0;i<p;i++)if(line[i]>=document.lines.length||country[i]>=sets.length)invalid();
      for(const row of document.lines)if(!Array.isArray(row)||row.length!==4||typeof row[0]!=='string'||typeof row[1]!=='string'||!Number.isSafeInteger(row[2])||row[2]<0||row[2]>=catalogue.modes.length||!Number.isSafeInteger(row[3])||row[3]<0||row[3]>=catalogue.sourceIds.length)invalid();
      tile={members:true,n,world,start:first,member:members,patterns:p,ids:bytesOf(document.patternIdsB64,p*12),line,country,from:typed(document.patternFromB64,Uint32Array,p),to:typed(document.patternToB64,Uint32Array,p),dates:typed(document.patternDatesB64,Uint16Array,p*days),flags:typed(document.patternFlagsB64,Uint8Array,p),lines:document.lines,names:document.names,sets};
    }else{
      const profiles=document.profiles;
      if(!Array.isArray(profiles)||!profiles.length||profiles.some(r=>!Array.isArray(r)||r.length!==4||!Number.isSafeInteger(r[0])||r[0]<0||r[0]>=catalogue.sourceIds.length||!Number.isSafeInteger(r[1])||r[1]<0||r[1]>=catalogue.modes.length||![0,1].includes(r[2])||!Number.isSafeInteger(r[3])||r[3]<0||r[3]>=sets.length))invalid();
      const profile=typed(document.profileB64,Uint16Array,n);
      for(let i=0;i<n;i++)if(profile[i]>=profiles.length)invalid();
      tile={members:false,n,world,profile,profiles,bands:typed(document.bandsB64,Uint8Array,n*(days+1)),sets};
    }
    this.decoded.set(document,tile);
    return tile;
  }
  // Trips per day for the chosen date; "all" is the mean day of the cohort.
  // Exact-membership tiles weigh each pattern; broad tiles carry legend bands.
  weights(tile,catalogue,filters){
    const days=catalogue.dates.length,day=filters.day==='all'?-1:catalogue.dates.indexOf(filters.day),count=tile.members?tile.patterns:tile.n;
    const source=filters.source?catalogue.sourceIds.indexOf(filters.source):-1,country=filters.country?catalogue.countries.indexOf(filters.country):-1;
    const setOk=tile.sets.map(s=>(!filters.country||s.includes(country))&&(!filters.international||s.length>1)),modeOk=mode=>!filters.mode||(filters.mode==='coach')===(catalogue.modes[mode]==='coach');
    if(!tile.members){
      const band=new Int8Array(count).fill(-1);
      if(day<0&&filters.day!=='all')return band;
      const column=(day<0?days:day)*count,profileOk=tile.profiles.map(p=>(!filters.source||p[0]===source)&&modeOk(p[1])&&setOk[p[3]]);
      for(let i=0;i<count;i++)if(profileOk[tile.profile[i]])band[i]=tile.bands[column+i]-1;
      return band;
    }
    const value=new Float32Array(count),d=tile.dates;
    if(day<0&&filters.day!=='all')return value;
    if(day>=0)for(let i=0;i<count;i++)value[i]=d[day*count+i];
    else for(let i=0;i<count;i++){let sum=0;for(let k=0;k<days;k++)sum+=d[k*count+i];value[i]=sum/days;}
    const lineOk=tile.lines.map(l=>(!filters.source||l[3]===source)&&modeOk(l[2])&&(!filters.operator||l[1]===filters.operator));
    for(let i=0;i<count;i++)if(!lineOk[tile.line[i]]||!setOk[tile.country[i]])value[i]=0;
    return value;
  }
  async render(manifest,manifestSha,bounds,zoom,filters,reader,check,camera=null){
    const catalogue=await this.catalogue(manifest,manifestSha,reader);check();
    const level=busNetworkLevel(catalogue.levels,zoom),scale=2**level.tileZoom,size=WORLD/scale,limit=scale-1;
    const west=worldX(bounds[0]),east=worldX(bounds[2]),north=worldY(bounds[3]),south=worldY(bounds[1]);
    const x0=Math.max(0,Math.floor(west/size)),x1=Math.min(limit,Math.floor(east/size)),y0=Math.max(0,Math.floor(north/size)),y1=Math.min(limit,Math.floor(south/size));
    const shift=level.indexShift||0,parts=new Map(level.indexes.map(d=>[d.x+'/'+d.y,d])),wanted=new Map();
    for(let ix=x0>>shift;ix<=x1>>shift;ix++)for(let iy=y0>>shift;iy<=y1>>shift;iy++){const d=parts.get(ix+'/'+iy);if(d)wanted.set(d.path,d);}
    const indexRows=await Promise.all([...wanted.values()].map(async d=>this.index(validBusDocument(await this.requests.load(d,{reader,limit:4*1024*1024}),'bus_atlas_network_index'),level)));
    check();
    const centerX=(west+east)/2,centerY=(north+south)/2,descriptors=[];
    for(const rows of indexRows)for(const d of rows.values())if(d.x>=x0&&d.x<=x1&&d.y>=y0&&d.y<=y1)descriptors.push(d);
    descriptors.sort((a,b)=>((a.x+.5)*size-centerX)**2+((a.y+.5)*size-centerY)**2-((b.x+.5)*size-centerX)**2-((b.y+.5)*size-centerY)**2||a.path.localeCompare(b.path));
    let wire=0,limited=false;const chosen=[];
    for(const d of descriptors){if(chosen.length>=BUS_NETWORK_LIMITS.tiles||wire+d.bytes>BUS_NETWORK_LIMITS.wireBytes){limited=true;continue;}chosen.push(d);wire+=d.bytes;}
    // One unavailable tile must not blank the rest of the view.
    const settled=await Promise.allSettled(chosen.map(async d=>({descriptor:d,tile:this.decode(validBusDocument(await this.requests.load(d,{reader,limit:8*1024*1024}),'bus_atlas_network_tile'),level,catalogue,d)})));
    check();
    const loaded=[];let failed=0;
    for(const row of settled){if(row.status==='fulfilled')loaded.push(row.value);else if(row.reason?.name==='AbortError')throw row.reason;else failed++;}
    if(chosen.length&&!loaded.length)throw new Error('Bus network tiles unavailable');
    const groups=FREQUENCY_BREAKS.length*2,counts=new Uint32Array(groups),prepared=[];
    let segments=0,maximum=0;const linesSeen=new Map();
    for(const{tile}of loaded){
      const weight=this.weights(tile,catalogue,filters),band=new Int8Array(tile.n).fill(-1),w=tile.world;
      for(let i=0;i<tile.n;i++){
        let level,dash;
        if(tile.members){
          let sum=0,solid=0;
          for(let k=tile.start[i];k<tile.start[i+1];k++){const p=tile.member[k],v=weight[p];if(v>0){sum+=v;if(!tile.flags[p])solid=1;}}
          if(!(sum>0))continue;
          level=busFrequencyBand(sum);dash=solid?0:1;if(sum>maximum)maximum=sum;
        }else{
          level=weight[i];if(level<0)continue;
          dash=tile.profiles[tile.profile[i]][2];
        }
        const ax=w[i*4],ay=w[i*4+1],bx=w[i*4+2],by=w[i*4+3];
        if(Math.max(ax,bx)<west||Math.min(ax,bx)>east||Math.max(ay,by)<north||Math.min(ay,by)>south)continue;
        const g=level*2+dash;band[i]=g;counts[g]++;segments++;
      }
      prepared.push({tile,band,weight});
    }
    // Shed the quietest bands first if a broad view would exceed the draw budget.
    let dropBelow=0,total=segments;
    while(total>BUS_NETWORK_LIMITS.segments&&dropBelow<groups){total-=counts[dropBelow];counts[dropBelow]=0;dropBelow++;limited=true;}
    const buffers=Array.from(counts,c=>new Float64Array(c*4)),offsets=new Uint32Array(groups);
    for(const{tile,band}of prepared)for(let i=0;i<tile.n;i++){
      const g=band[i];if(g<dropBelow)continue;
      buffers[g].set(tile.world.subarray(i*4,i*4+4),offsets[g]);offsets[g]+=4;
    }
    if(level.members)for(const{tile,weight}of prepared){
      // Summarise the busiest recorded lines in the loaded tiles for the panel.
      const perLine=new Float64Array(tile.lines.length),best=new Int32Array(tile.lines.length).fill(-1);
      for(let p=0;p<tile.patterns;p++)if(weight[p]>0){const l=tile.line[p];perLine[l]+=weight[p];if(best[l]<0||weight[p]>weight[best[l]])best[l]=p;}
      for(let l=0;l<perLine.length;l++)if(perLine[l]>0){
        const row=tile.lines[l],key=JSON.stringify(row),old=linesSeen.get(key);
        if(!old||perLine[l]>old.trips)linesSeen.set(key,{label:row[0],operator:row[1],mode:catalogue.modes[row[2]],sourceId:catalogue.sourceIds[row[3]],trips:perLine[l],id:this.patternId(tile,best[l],catalogue),stopNames:[tile.names[tile.from[best[l]]],tile.names[tile.to[best[l]]]].filter(Boolean)});
      }
    }
    const sceneId=++this.sequence;
    this.scene={sceneId,catalogue,level,prepared,filters:{...filters}};
    let bands=[],bitmap=null,view=null;
    for(let g=dropBelow;g<groups;g++)if(counts[g])bands.push({band:g>>1,dash:!!(g&1),world:buffers[g]});
    // Dense views are rasterised here, off the animation thread; the page only
    // blits the bitmap. Small scenes stay vector and crisp at any zoom.
    if(total>BUS_NETWORK_LIMITS.rasterSegments&&typeof OffscreenCanvas==='function'&&camera&&Number.isFinite(camera.width+camera.height+camera.scale+camera.centerX+camera.centerY+camera.zoom)&&camera.width>0&&camera.height>0&&camera.width<=8192&&camera.height<=8192){
      const ratio=Math.min(2,Math.max(1,Number(camera.pixelRatio)||1)),canvas=new OffscreenCanvas(Math.ceil(camera.width*ratio),Math.ceil(camera.height*ratio)),ctx=canvas.getContext('2d');
      view={zoom:camera.zoom,width:camera.width,height:camera.height,scale:camera.scale,centerX:camera.centerX,centerY:camera.centerY};
      paintBusNetwork(ctx,busNetworkPaths(bands),view,ratio,{members:level.members===true});
      bitmap=canvas.transferToImageBitmap();bands=[];check();
    }
    return{network:true,sceneId,tileZoom:level.tileZoom,members:level.members===true,bands,...(bitmap?{bitmap,camera:view}:{}),segments:total,maximum,limited,failedTiles:failed,tiles:loaded.length,wireBytes:wire,
      lines:[...linesSeen.values()].sort((a,b)=>b.trips-a.trips||a.label.localeCompare(b.label)).slice(0,BUS_NETWORK_LIMITS.lines),lineCount:linesSeen.size,
      routes:[],stops:[],entries:loaded.map(row=>row.descriptor.path),operators:this.operators(prepared,catalogue),day:filters.day};
  }
  operators(prepared,catalogue){
    const rows=new Map();
    for(const{tile}of prepared)if(tile.members)for(const line of tile.lines)if(line[1])rows.set(line[3]+'\u0000'+line[1],{sourceId:catalogue.sourceIds[line[3]],name:line[1]});
    return[...rows.values()].slice(0,2000);
  }
  patternId(tile,p,catalogue){
    let hex='';for(let i=0;i<12;i++)hex+=tile.ids[p*12+i].toString(16).padStart(2,'0');
    return catalogue.sourceIds[tile.lines[tile.line[p]][3]]+':'+hex;
  }
  // Lines in the loaded view whose number, operator or end stops match. This
  // is complete for the drawn area, unlike the bounded packet search.
  search(sceneId,query){
    const scene=this.scene,tokens=foldBusText(query).trim().split(/\s+/).filter(Boolean);
    if(!scene||scene.sceneId!==sceneId||!scene.level.members||!tokens.length)return null;
    const lines=new Map();
    for(const{tile,weight,band}of scene.prepared){
      const shown=new Uint8Array(tile.patterns);
      for(let i=0;i<tile.n;i++)if(band[i]>=0)for(let k=tile.start[i];k<tile.start[i+1];k++)shown[tile.member[k]]=1;
      const lineText=tile.lines.map(row=>foldBusText(row[0]+' '+row[1])),nameText=tile.names.map(foldBusText);
      for(let p=0;p<tile.patterns;p++){
        if(!shown[p]||!(weight[p]>0))continue;
        const text=lineText[tile.line[p]]+' '+nameText[tile.from[p]]+' '+nameText[tile.to[p]];
        if(!tokens.every(token=>text.includes(token)))continue;
        const row=tile.lines[tile.line[p]],key=JSON.stringify(row),id=this.patternId(tile,p,scene.catalogue);
        let line=lines.get(key);
        if(!line){line={label:row[0],operator:row[1],mode:scene.catalogue.modes[row[2]],sourceId:scene.catalogue.sourceIds[row[3]],patterns:new Map()};lines.set(key,line);}
        if(!line.patterns.has(id))line.patterns.set(id,{id,trips:weight[p],stopNames:[tile.names[tile.from[p]],tile.names[tile.to[p]]].filter(Boolean),schematic:!!tile.flags[p]});
      }
    }
    const exact=tokens.join(' '),rows=[...lines.values()].map(line=>{const patterns=[...line.patterns.values()].sort((a,b)=>b.trips-a.trips||a.id.localeCompare(b.id));return{...line,trips:patterns.reduce((n,p)=>n+p.trips,0),variantCount:patterns.length,patterns:patterns.slice(0,BUS_NETWORK_LIMITS.variants)};})
      .sort((a,b)=>Number(foldBusText(b.label)===exact)-Number(foldBusText(a.label)===exact)||b.trips-a.trips||a.label.localeCompare(b.label));
    return{lines:rows.slice(0,BUS_NETWORK_LIMITS.lines),lineCount:rows.length,day:scene.filters.day};
  }
  // Every recorded line whose path passes within the pick radius of a point.
  hit(sceneId,x,y,radius){
    const scene=this.scene;
    if(!scene||scene.sceneId!==sceneId||!Number.isFinite(x+y+radius)||radius<=0)return null;
    if(!scene.level.members){
      const lon=x/WORLD*360-180,lat=Math.atan(Math.sinh(Math.PI*(1-2*y/WORLD)))*180/Math.PI;
      let near=false;
      for(const{tile,band}of scene.prepared){const w=tile.world;for(let i=0;i<tile.n&&!near;i++)if(band[i]>=0&&distance2(x,y,w[i*4],w[i*4+1],w[i*4+2],w[i*4+3])<=radius*radius)near=true;if(near)break;}
      return near?{zoom:true,lon,lat,minimumZoom:scene.catalogue.levels.find(l=>l.members)?.minimumZoom??11}:null;
    }
    const lines=new Map(),limit=radius*radius;let nearest=Infinity;
    for(const{tile,weight,band}of scene.prepared){
      const w=tile.world;
      for(let i=0;i<tile.n;i++){
        if(band[i]<0)continue;
        const ax=w[i*4],ay=w[i*4+1],bx=w[i*4+2],by=w[i*4+3];
        if(Math.min(ax,bx)-radius>x||Math.max(ax,bx)+radius<x||Math.min(ay,by)-radius>y||Math.max(ay,by)+radius<y)continue;
        const d=distance2(x,y,ax,ay,bx,by);if(d>limit)continue;
        if(d<nearest)nearest=d;
        for(let k=tile.start[i];k<tile.start[i+1];k++){
          const p=tile.member[k],v=weight[p];if(!(v>0))continue;
          const row=tile.lines[tile.line[p]],key=JSON.stringify(row),id=this.patternId(tile,p,scene.catalogue);
          let line=lines.get(key);
          if(!line){line={label:row[0],operator:row[1],mode:scene.catalogue.modes[row[2]],sourceId:scene.catalogue.sourceIds[row[3]],trips:0,distance:d,patterns:new Map()};lines.set(key,line);}
          line.distance=Math.min(line.distance,d);
          if(!line.patterns.has(id))line.patterns.set(id,{id,trips:v,stopNames:[tile.names[tile.from[p]],tile.names[tile.to[p]]].filter(Boolean),schematic:!!tile.flags[p]});
        }
      }
    }
    if(!lines.size)return null;
    const rows=[...lines.values()].map(line=>{const patterns=[...line.patterns.values()].sort((a,b)=>b.trips-a.trips||a.id.localeCompare(b.id));return{...line,trips:patterns.reduce((n,p)=>n+p.trips,0),variantCount:patterns.length,patterns:patterns.slice(0,BUS_NETWORK_LIMITS.variants)};})
      .sort((a,b)=>b.trips-a.trips||a.label.localeCompare(b.label));
    return{lines:rows.slice(0,BUS_NETWORK_LIMITS.lines),lineCount:rows.length,day:scene.filters.day};
  }
}
function distance2(px,py,ax,ay,bx,by){
  const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/length)):0,x=ax+dx*t-px,y=ay+dy*t-py;
  return x*x+y*y;
}
