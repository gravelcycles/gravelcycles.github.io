import{FREQUENCY_BREAKS,FREQUENCY_COLORS,FREQUENCY_LABELS,threshold,frequencyBand,frequencyStateForMinimum,exactFrequencyMinimum}from'./atlas-core.js?v=0c0a84033e50767c';

export function frequencyMinimumDescription(value,unit='services'){
  const minimum=threshold(value);
  return minimum>0?'At least '+minimum+' '+unit+' per day':'Any frequency; no minimum';
}

// The native range supplies arrow/Home/End keyboard controls and a full-height
// touch target. The legend offers the same exact values with ordinary buttons.
export function setupFrequencyFilter({getState,onPreview=()=>{},onCommit=()=>{},root=globalThis.document}){
  const slider=root.getElementById('minFrequency'),output=root.getElementById('frequencyValue'),
    control=root.getElementById('frequencyControl'),ticks=root.getElementById('frequencyStops'),
    help=root.getElementById('frequencyHelp'),legend=root.getElementById('legendLabels'),
    gradient=root.getElementById('legendGradient'),buttons=[],listeners=[];
  const listen=(node,type,handler)=>{node.addEventListener(type,handler);listeners.push(()=>node.removeEventListener(type,handler));};
  slider.min='0';slider.max=String(FREQUENCY_BREAKS.length-1);slider.step='1';
  const last=FREQUENCY_COLORS.length-1;
  control.style.setProperty('--frequency-band-gradient','linear-gradient(to right,'+FREQUENCY_COLORS.map((color,i)=>color+' '+Math.max(0,(i-.5)/last)*100+'% '+Math.min(1,(i+.5)/last)*100+'%').join(',')+')');
  legend.replaceChildren();ticks.replaceChildren();
  legend.classList.add('frequency-legend-buttons');
  legend.setAttribute('role','group');legend.setAttribute('aria-label','Choose the minimum daily frequency');
  gradient?.classList.add('frequency-interactive-gradient');
  function select(index,commit){
    const at=Math.max(0,Math.min(FREQUENCY_BREAKS.length-1,Math.round(Number(index)||0))),state=getState(),previous=threshold(state.min);
    state.min=frequencyStateForMinimum(FREQUENCY_BREAKS[at]);sync();
    const detail={minimum:FREQUENCY_BREAKS[at],previous,value:state.min};
    if(previous!==detail.minimum)onPreview(detail);
    if(commit)onCommit(detail);
  }
  FREQUENCY_BREAKS.forEach((minimum,index)=>{
    const tick=root.createElement('span');tick.textContent=String(minimum);tick.style.setProperty('--frequency-band-color',FREQUENCY_COLORS[index]);ticks.appendChild(tick);
    const button=root.createElement('button');button.type='button';button.className='frequency-band-button';
    button.dataset.minimum=String(minimum);button.style.setProperty('--frequency-band-color',FREQUENCY_COLORS[index]);
    const swatch=root.createElement('span');swatch.className='frequency-band-swatch';swatch.setAttribute('aria-hidden','true');
    const label=root.createElement('span');label.textContent=FREQUENCY_LABELS[index];button.append(swatch,label);
    listen(button,'click',()=>select(index,true));
    listen(button,'keydown',event=>{
      let next=index;
      if(event.key==='ArrowRight')next=Math.min(buttons.length-1,index+1);
      else if(event.key==='ArrowLeft')next=Math.max(0,index-1);
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=buttons.length-1;
      else return;
      event.preventDefault();select(next,true);buttons[next].focus();
    });
    buttons.push(button);legend.appendChild(button);
  });
  listen(slider,'input',()=>select(slider.value,false));
  listen(slider,'change',()=>select(slider.value,true));
  function sync(){
    const state=getState(),minimum=threshold(state.min),exact=exactFrequencyMinimum(state.min),index=frequencyBand(minimum),unit=state.mode==='traffic'?'trains':'services';
    slider.value=String(index);slider.setAttribute('aria-valuetext',frequencyMinimumDescription(state.min,unit)+(exact===null?'; saved minimum. Move the slider to use the color bands.':''));
    output.textContent=minimum>0?minimum+' / day':'Any';
    control.style.setProperty('--frequency-selected-color',FREQUENCY_COLORS[index]);
    help.textContent=exact===null?'Saved minimum: '+minimum+' / day. Moving the slider selects a color band.':'Daily '+unit+' · choose a map color band.';
    [...ticks.children].forEach((tick,at)=>{tick.dataset.current=String(exact===FREQUENCY_BREAKS[at]);});
    buttons.forEach((button,at)=>{
      button.setAttribute('aria-pressed',String(exact===FREQUENCY_BREAKS[at]));
      button.setAttribute('aria-label',FREQUENCY_BREAKS[at]?'Show at least '+FREQUENCY_BREAKS[at]+' '+unit+' per day':'Show all frequencies; no minimum');
      button.title=FREQUENCY_BREAKS[at]?'Minimum '+FREQUENCY_BREAKS[at]+' / day':'Clear the frequency minimum';
    });
  }
  sync();return{sync,selectMinimum:minimum=>select(FREQUENCY_BREAKS.indexOf(Number(minimum)),true),destroy:()=>listeners.forEach(remove=>remove())};
}
