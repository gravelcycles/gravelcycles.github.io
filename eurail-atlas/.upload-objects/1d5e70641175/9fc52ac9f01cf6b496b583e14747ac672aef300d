// Daily travel windows for the route finder (docs/RAIL_ROUTE_FINDER_DAY_TRIPS.md,
// section 1, and AR3's review, I2): a hop may be ridden only if it departs
// inside the window at its from-station and arrives inside the window at its
// to-station, each on that station's local clock and local date.
//
// Clocks. Connection times are minutes on the shared clock from 00:00 of the
// connection set's first date (C.d, a delivery date index). offsetOf(station,
// date) gives the minutes to add for the station's local clock on delivery
// date `date` (the delivery's countryOffsets, indexed by delivery date, not by
// the day relative to a search). The offset is taken on the shared-clock date
// of the time; the local date follows from the local minutes.
import{maskConnections}from'./route-finder-engine.js?v=bb4836e4a6de50c2';

// {date, minute}: the local delivery date and minute of the day of shared
// minute m on the clock of date d at station s.
export function localAt(offsetOf,s,d,m){
  const value=m+offsetOf(s,d+Math.floor(m/1440)),k=Math.floor(value/1440);
  return{date:d+k,minute:value-1440*k};
}

// A fixed window, the same every day at every station: local minutes
// [start, end], start < end, none across midnight (end may be 1440).
export function fixedWindow(start,end){
  if(!(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&start<end&&end<=1440))throw new Error('route_finder_bad_travel_window');
  return{id:'fixed:'+start+'-'+end,start:()=>start,end:()=>end};
}

// Is shared minute m (clock of date d) inside the window at station s?
// win.start(s, date) / win.end(s, date): local minutes; start > end is an
// empty window (no travel there that day, for example polar night).
export function insideWindow(win,offsetOf,s,d,m){
  const x=localAt(offsetOf,s,d,m),lo=win.start(s,x.date),hi=win.end(s,x.date);
  return x.minute>=lo&&x.minute<=hi;
}

// The hop mask of connection set C for window `win`, cached on C (one mask
// per set and window: a carried set gets its own, on its own date base).
export function hopMask(C,win,offsetOf){
  return maskConnections(C,win.id,(f,dep,t,arr)=>insideWindow(win,offsetOf,f,C.d,dep)&&insideWindow(win,offsetOf,t,C.d,arr));
}
