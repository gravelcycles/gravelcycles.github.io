// Loading screens for the data-heavy views, in the style of the Explore page's
// loading card (.x-loading/.x-bar). Each view describes what it is loading as
// a status; LoadCard shows it after a short delay, so a fast or cached load
// never flashes a card, and hides it the moment the data is in.
//
// A status is {key, phase, title, detail, done, total, placement}:
//   phase      'loading'      nothing of this view is drawn yet
//              'partial'      an overview is drawn; the detail is still coming
//              'unavailable'  an overview is drawn; part of the detail failed
//              'error'        the view could not load at all
//   done/total real progress (parts, tiles or chunks) where it is known;
//              without a total the bar runs indeterminate
//   placement  'center' over the map, 'corner' beside it (an overview is
//              visible and must stay readable), 'inline' inside a panel
// The phases also cover a lighter delivery that has an overview but no
// detail at all: 'unavailable' says so rather than a false "no data".
export const SHOW_AFTER_MS=300;

export function plural(n,one,many=one+'s'){return n===1?one:many;}
export function progressText(done,total,unit){
  if(!Number.isFinite(total)||total<=0)return'';
  return `${Math.min(done,total).toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} ${plural(total,unit)}`;
}

// Traffic: overview first, then tiles for the view (or the complete product).
export function describeTraffic({active,error,overviewVisible,documentReady,tiled,viewTiles=0,loadedTiles=0,pendingTiles=0,failedTiles=0,exact=false}){
  if(!active)return null;
  if(error)return{key:'traffic:error',phase:'error',title:'Rail traffic could not load',detail:'Select Traffic again to retry.',placement:'center'};
  if(!documentReady&&!overviewVisible)return{key:'traffic:start',phase:'loading',title:'Loading rail traffic',
    detail:'Estimated trains on each railway section this week',placement:'center'};
  if(!documentReady||!tiled||exact)return null;
  const missing=Math.max(0,viewTiles-loadedTiles);
  if(missing>0&&(pendingTiles>0||failedTiles===0))return{key:'traffic:tiles',phase:overviewVisible?'partial':'loading',
    title:overviewVisible?'Loading detail for this view':'Loading rail traffic for this view',
    detail:[overviewVisible?'Overview shown':'',progressText(loadedTiles,viewTiles,'area')].filter(Boolean).join(' · '),
    done:loadedTiles,total:viewTiles,placement:overviewVisible?'corner':'center'};
  if(failedTiles>0&&missing>0)return{key:'traffic:unavailable',phase:'unavailable',title:'Some detail is unavailable here',
    detail:(overviewVisible?'Overview shown · ':'')+`${failedTiles.toLocaleString('en-GB')} ${plural(failedTiles,'area')} could not load. Move the map to retry.`,placement:'corner'};
  return null;
}

// Hubs: the city index, then the connection parts for the chosen city limit.
export function describeHubs({active,loading,error,done=0,total=null}){
  if(!active)return null;
  if(error&&loading)return{key:'hubs:error',phase:'error',title:'City connections could not load',detail:'Select Hubs to retry.',placement:'center'};
  if(!loading)return null;
  return{key:'hubs:loading',phase:'loading',title:'Loading city connections',
    detail:Number.isFinite(total)&&total>0?progressText(done,total,'part'):'The cities and their railway paths',done,total,placement:'center'};
}

// A station, city or connection panel reading its journeys.
export function describePanel({loading,label,done=0,total=null,step=null}){
  if(!loading)return null;
  return{key:'panel:'+label,phase:'loading',title:'Loading '+label,
    detail:Number.isFinite(total)&&total>0?progressText(done,total,'part'):step||'Finding every matching service',done,total,placement:'inline'};
}

// The panel load in progress. Each begin() returns its own load as a token:
// a superseded request (the same station tapped again) can neither update nor
// end the newer one, even when both share a key.
export class PanelLoads{
  constructor(){this.current=null;}
  begin(label,key){const load=this.current={label,key,done:0,total:null,step:null};return load;}
  progress(load){return(done,total)=>{if(this.current===load){load.done=done;load.total=total;}};}
  step(load,text){if(this.current===load)load.step=text;}
  end(load){if(this.current===load)this.current=null;}
}

export class LoadCard{
  constructor(host,{className='data-loading',delay=SHOW_AFTER_MS,doc=globalThis.document,setTimer=(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimer=id=>globalThis.clearTimeout(id)}={}){
    this.doc=doc;this.delay=delay;this.setTimer=setTimer;this.clearTimer=clearTimer;this.timer=0;this.status=null;this.shownKey=null;
    const root=this.root=doc.createElement('div');root.className=className;root.hidden=true;root.setAttribute('role','status');root.setAttribute('aria-live','polite');
    root.innerHTML='<strong></strong><span class="data-loading-detail"></span><span class="data-loading-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></span>';
    this.title=root.querySelector('strong');this.detail=root.querySelector('.data-loading-detail');this.bar=root.querySelector('.data-loading-bar');this.fill=this.bar.querySelector('i');
    host.appendChild(root);
  }
  update(status){
    if(!status){this.clearTimer(this.timer);this.timer=0;this.status=null;this.shownKey=null;this.root.hidden=true;this.root.removeAttribute('aria-busy');return;}
    const firstSight=!this.status;this.status=status;
    // Errors and partial-detail notices replace a visible card at once; a fresh
    // load waits for the delay so cached data never flashes a card.
    if(this.root.hidden){if(status.phase==='error'||status.phase==='unavailable')this.paint();else if(firstSight||!this.timer)this.timer=this.setTimer(()=>{this.timer=0;if(this.status)this.paint();},this.delay);return;}
    this.paint();
  }
  paint(){
    const s=this.status;if(!s)return;const root=this.root;
    root.dataset.phase=s.phase;root.dataset.placement=s.placement||'center';
    if(s.phase==='loading'||s.phase==='partial')root.setAttribute('aria-busy','true');else root.removeAttribute('aria-busy');
    if(this.title.textContent!==s.title)this.title.textContent=s.title;
    const detail=s.detail||'';if(this.detail.textContent!==detail)this.detail.textContent=detail;
    const known=Number.isFinite(s.total)&&s.total>0,showBar=s.phase==='loading'||s.phase==='partial';
    this.bar.hidden=!showBar;this.bar.classList.toggle('indeterminate',showBar&&!known);
    if(known){const pct=Math.round(Math.min(1,Math.max(0,(s.done||0)/s.total))*100);this.fill.style.width=pct+'%';this.bar.setAttribute('aria-valuenow',String(pct));this.bar.setAttribute('aria-valuetext',s.detail||pct+'%');}
    else{this.fill.style.width='';this.bar.removeAttribute('aria-valuenow');this.bar.removeAttribute('aria-valuetext');}
    this.shownKey=s.key;root.hidden=false;
  }
}
