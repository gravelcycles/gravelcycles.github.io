export const MOBILE_LAYOUT='(max-width:700px), (max-height:500px) and (pointer:coarse)';

export function setupMobileSheets({closeControls,closeSearch,closeInspector,getMap}){
  const query=matchMedia(MOBILE_LAYOUT),inspector=document.getElementById('inspector'),controls=document.getElementById('mapControls'),search=document.getElementById('stationSearch');
  const handle=document.getElementById('inspectorGrabber'),summary=document.getElementById('inspectorSummary'),showMap=document.getElementById('inspectorShowMap');
  let detent='full',modal=null,drag=null,suppressClick=false;
  const contexts=[...document.querySelectorAll('.service-context-panel')],panels=[controls,search,inspector,...contexts];
  const previous=new Map(panels.map(panel=>[panel,panel.hidden])),parents=new Map(panels.map(panel=>[panel,panel.parentElement]));
  const background=[...document.querySelectorAll('.site-header,#map,.map-tools,.view-tools,.controls-toggle,.map-key,.map-footer')];
  function viewport(){document.documentElement.style.setProperty('--sheet-viewport-height',(visualViewport?.height||innerHeight)+'px');}
  function responsiveTools(){
    // Workspace/map stacking contexts sit below the header. Modal phone
    // sheets live at body level; returning to desktop restores their parents.
    for(const panel of panels){const parent=query.matches?document.body:parents.get(panel);if(panel.parentElement!==parent)parent.appendChild(panel);}
    const hubs=document.getElementById('hubsTools'),target=document.getElementById(query.matches?'mobileHubsControls':'viewTools');
    if(hubs.parentElement!==target){if(query.matches)target.appendChild(hubs);else target.insertBefore(hubs,document.getElementById('viewToolsNote'));}
  }
  function focusMap(){requestAnimationFrame(()=>{summary.focus({preventScroll:true});getMap()?.invalidateSize({pan:false});});}
  function setDetent(value,{focus=false}={}){
    detent=value;inspector.dataset.detent=value;
    handle.setAttribute('aria-expanded',String(value!=='peek'));
    handle.setAttribute('aria-label',value==='full'?'Collapse details':value==='peek'?'Expand details':'Expand details to full screen');
    sync();if(focus)focusMap();
  }
  function sync(){
    modal=query.matches?(!search.hidden?search:!controls.hidden?controls:contexts.find(panel=>!panel.hidden)||(!inspector.hidden&&detent==='full'?inspector:null)):null;
    document.body.classList.toggle('mobile-modal',!!modal);
    for(const node of background)node.inert=!!modal;
    for(const panel of panels){
      const active=query.matches&&panel===modal;
      if(active){panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');}
      else{panel.removeAttribute('role');panel.removeAttribute('aria-modal');}
      panel.inert=query.matches&&!!modal&&panel!==modal;
    }
    document.body.classList.toggle('mobile-inspector-open',query.matches&&!inspector.hidden);
  }
  function inspectVisibility(){
    for(const panel of panels){
      const wasHidden=previous.get(panel);previous.set(panel,panel.hidden);
      if(wasHidden&&!panel.hidden&&query.matches){
        if(panel===inspector)setDetent('full');else if(!inspector.hidden)setDetent('peek');
        if(contexts.includes(panel)){closeControls();closeSearch();}
        for(const context of contexts)if(context!==panel&&!context.hidden)context.querySelector('.close-button')?.click();
      }
    }
    sync();
  }
  for(const panel of panels)new MutationObserver(inspectVisibility).observe(panel,{attributes:true,attributeFilter:['hidden']});
  function updateSummary(){
    const title=inspector.querySelector('.train-route-title')||inspector.querySelector('h3');
    document.getElementById('inspectorSummaryTitle').textContent=title?.textContent?.trim()||'Selected connection';
    const count=inspector.querySelector('.detail-stat strong')?.textContent;
    document.getElementById('inspectorSummaryMetric').textContent=count?count+' services / day':'Routes and train details';
  }
  new MutationObserver(updateSummary).observe(document.getElementById('inspectorContent'),{childList:true,subtree:true,characterData:true});
  handle.onclick=()=>{if(suppressClick){suppressClick=false;return;}setDetent(detent==='full'?'peek':'full');};
  summary.onclick=()=>setDetent('full');
  showMap.onclick=()=>{document.activeElement?.blur();setDetent('peek',{focus:true});};
  for(const node of[handle,summary]){
    node.addEventListener('pointerdown',event=>{if(!query.matches||event.button>0)return;drag={id:event.pointerId,y:event.clientY};node.setPointerCapture(event.pointerId);});
    node.addEventListener('pointerup',event=>{
      if(!drag||drag.id!==event.pointerId)return;
      const dy=event.clientY-drag.y;drag=null;
      if(Math.abs(dy)<45)return;
      suppressClick=true;
      setTimeout(()=>{suppressClick=false;},0);
      if(dy<0)setDetent('full');
      else if(detent==='full')setDetent('medium');
      else if(detent==='medium')setDetent('peek');
      else closeInspector();
    });
    node.addEventListener('pointercancel',()=>{drag=null;});
    node.addEventListener('keydown',event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();setDetent(event.key==='ArrowUp'?'full':detent==='full'?'medium':'peek');}});
  }
  document.getElementById('filtersDone').onclick=()=>{closeControls();sync();document.getElementById('controlsToggle').focus({preventScroll:true});};
  document.addEventListener('keydown',event=>{
    if(!modal)return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopImmediatePropagation();
      if(modal===controls)closeControls();else if(modal===search)closeSearch();else if(contexts.includes(modal))modal.querySelector('.close-button')?.click();else setDetent('peek',{focus:true});
    }else if(event.key==='Tab'){
      const nodes=[...modal.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(n=>!n.disabled&&!n.inert&&n.getClientRects().length);
      if(!nodes.length)return;
      const first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){event.preventDefault();first.focus();}
    }
  },true);
  query.addEventListener('change',()=>{responsiveTools();sync();viewport();});
  visualViewport?.addEventListener('resize',viewport,{passive:true});window.addEventListener('resize',viewport,{passive:true});
  responsiveTools();viewport();sync();
  return{get mobile(){return query.matches;},collapse:()=>setDetent('peek',{focus:true}),expand:()=>setDetent('full'),get detent(){return detent;}};
}
