// The "How it works" opening of About names the service week and the number
// of timetable sources. Both come from the delivery (its dates and manifest),
// never from typed text, so a new week or a new source updates the guide.
import{dateRangeLabels,formatNumber}from'./atlas-core.js?v=f8cc78f67d7df99a';

// "1–7 November 2026"; a week crossing a year already names both years.
export function aboutWeekLabel(dates){
  if(!Array.isArray(dates)||!dates.length)return'';
  const long=dateRangeLabels(dates).long;
  return /\d{4}$/.test(long)?long:long+' '+new Date(dates[0]+'T12:00:00Z').getUTCFullYear();
}

export function aboutSourceText(manifest){
  const count=Array.isArray(manifest?.sources)?manifest.sources.length:0;
  return count?formatNumber(count)+' published timetable sources':'published timetable sources';
}

// Fill every placeholder that is present; leave the neutral fallback text otherwise.
export function fillAboutGuide(doc,{dates,manifest}={}){
  const week=aboutWeekLabel(dates);
  if(week)for(const node of doc.querySelectorAll('[data-about-week]'))node.textContent=week;
  if(Array.isArray(manifest?.sources))for(const node of doc.querySelectorAll('[data-about-sources]'))node.textContent=aboutSourceText(manifest);
}

// Short clips beside the steps, recorded from this very site by the release
// (rail_data/about_visuals.py). Nothing is requested until About opens: then
// the packet, then one poster per step for this screen size. A clip itself is
// fetched when its step scrolls into view, or on Play under reduced motion.
export const ABOUT_VISUAL_PACKET='about-visuals/manifest.json';
// Which list item each clip belongs to: [list, zero-based item].
export const ABOUT_VISUAL_STEPS={line:['.about-steps',0],station:['.about-steps',1],route:['.about-steps',2],transit:['.about-things',6],explore:['.about-things',8]};
// A "try it" link stays on this site: a share link of the atlas or the Explore page.
export function aboutVisualLink(link){return typeof link==='string'&&/^(\?|assets\/explore\.html#)[\w\-.~%=&:#/,+]*$/.test(link)?link:'';}
const visualFile=name=>typeof name==='string'&&/^[a-z]+-(desktop|phone)(-poster)?-[0-9a-f]{12}\.webp$/.test(name)?name:'';
// What one figure shows, or null when the clip is held or the packet is not usable.
export function aboutVisualModel(entry,size,base=''){
  const item=entry?.state==='shown'&&ABOUT_VISUAL_STEPS[entry.id]?entry.sizes?.[size]:null;
  const poster=visualFile(item?.poster?.path),clip=visualFile(item?.clip?.path);
  if(!item||!poster||!clip||typeof item.alt!=='string'||!item.alt.trim()||!(item.width>0)||!(item.height>0))return null;
  return{id:entry.id,poster:base+poster,clip:base+clip,width:item.width,height:item.height,alt:item.alt.trim(),link:aboutVisualLink(item.link)};
}
function visualFigure(doc,model,reduced){
  const make=(tag,className,text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;};
  const figure=make('figure','about-visual'),image=make('img'),button=make('button','about-visual-toggle'),caption=make('figcaption');
  figure.dataset.visual=model.id;figure.dataset.playing='false';
  image.alt=model.alt;image.width=model.width;image.height=model.height;image.decoding='async';image.src=model.poster;
  button.type='button';
  let wanted=false;
  const show=()=>{figure.dataset.playing=String(wanted);button.textContent=wanted?'Pause':'Play';button.setAttribute('aria-label',(wanted?'Pause':'Play')+' this clip');};
  const set=playing=>{wanted=playing;show();
    if(!playing){image.src=model.poster;return;}
    // Fetch the clip first, so the poster stays until it can play.
    const clip=doc.createElement('img');clip.onload=()=>{if(wanted)image.src=model.clip;};clip.onerror=()=>{wanted=false;show();};clip.src=model.clip;};
  button.onclick=()=>{figure.dataset.chosen='true';set(!wanted);};image.onclick=button.onclick;
  show();
  figure.append(image);caption.append(button);
  if(model.link){const link=make('a','about-visual-try','Try it ↗');link.href=model.link;caption.append(link);}
  caption.append(make('span','about-visual-note',reduced?'Paused: reduced motion is on.':'Recorded from this map.'));
  figure.append(caption);
  return{figure,set,chosen:()=>figure.dataset.chosen==='true'};
}
// Put the figures of a packet under their steps. Returns the figures added.
export function renderAboutVisuals(doc,packet,{phone=false,reducedMotion=false,base='',observe}={}){
  const added=[];
  for(const entry of Array.isArray(packet?.visuals)?packet.visuals:[]){
    const model=aboutVisualModel(entry,phone?'phone':'desktop',base),place=ABOUT_VISUAL_STEPS[entry?.id];
    const step=model&&doc.querySelectorAll('#aboutGuide '+place[0]+'>li')[place[1]];
    if(!step)continue;
    const made=visualFigure(doc,model,reducedMotion);
    step.append(made.figure);added.push(made);
    // Motion is welcome: play while the step is on screen, until the visitor chooses.
    if(!reducedMotion&&observe)observe(made.figure,visible=>{if(!made.chosen())made.set(visible);});
  }
  return added;
}
// Load once, the first time About is open. Quiet on failure: the text stands on its own.
export function watchAboutVisuals(doc,{phone=()=>false,reducedMotion=()=>false,fetchPacket}={}){
  const dialog=doc.getElementById('methodDialog');let started=false;
  if(!dialog||typeof MutationObserver==='undefined')return;
  const base=new URL('./about-visuals/',import.meta.url).href;
  const load=fetchPacket||(()=>fetch(new URL('./'+ABOUT_VISUAL_PACKET,import.meta.url),{cache:'no-cache'}).then(response=>response.ok?response.json():null));
  const observe=typeof IntersectionObserver==='undefined'?null:(node,change)=>new IntersectionObserver(entries=>change(entries[entries.length-1].isIntersecting),{threshold:.6}).observe(node);
  const open=()=>{if(started||!dialog.open)return;started=true;
    load().then(packet=>{if(packet)renderAboutVisuals(doc,packet,{phone:phone(),reducedMotion:reducedMotion(),base,observe});}).catch(()=>{});};
  new MutationObserver(open).observe(dialog,{attributes:true,attributeFilter:['open']});open();
}
