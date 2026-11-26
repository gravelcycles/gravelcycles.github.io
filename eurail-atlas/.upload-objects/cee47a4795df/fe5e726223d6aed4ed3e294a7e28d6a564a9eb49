// A small notice on the map while rail data comes from the lite copy, which
// carries fewer connections than the full delivery (rail-r2.js). The notice
// can be hidden; About keeps a status line with a button that shows it again.
// Hiding lasts for this page only: a new visit shows it again if still needed.
export const LITE_NOTICE_TEXT='Showing a reduced network: full detail is temporarily unavailable.';

export function setupLiteNotice({notice,close,status,show,subscribe}){
  let active=false,dismissed=false;
  const render=()=>{
    if(notice)notice.hidden=!active||dismissed;
    if(status)status.hidden=!active;
    if(show)show.hidden=!active||!dismissed;
  };
  if(close)close.onclick=()=>{dismissed=true;render();};
  if(show)show.onclick=()=>{dismissed=false;render();};
  render();
  const stop=subscribe?.(()=>{active=true;render();});
  return{
    state:()=>({active,dismissed}),
    dismiss(){dismissed=true;render();},
    restore(){dismissed=false;render();},
    stop(){stop?.();},
  };
}

// Subscribe to "rail data now comes from the lite copy": the DEGRADED_EVENT
// with kind 'lite' on the page (rail-r2.js; the data worker's reports are
// relayed to the page by the data loader), and the state at subscription, in
// case it happened first. 'unavailable' alone is a detail object that could
// not be read (it has its own notice in the panel), not a reduced map.
export function subscribeRailLite(listener,{target=globalThis,event,liteNow=()=>false}){
  const on=e=>{if(e?.detail?.kind==='lite')listener(e.detail);};
  target.addEventListener?.(event,on);
  if(liteNow())listener(null);
  return()=>target.removeEventListener?.(event,on);
}
