// Where the sun is: elevation above the horizon for a place and an instant,
// from the NOAA low-accuracy solar formulas (good to about a third of a degree).
const RAD=Math.PI/180;

// The sun's upper edge touches the horizon at -0.833 degrees (its radius plus
// refraction); civil twilight lasts until its centre is 6 degrees below.
export const SUNRISE=-0.833,TWILIGHT=-6;

// Solar constants for one instant (UTC milliseconds), shared by every place.
export function solarInstant(ms){
  const date=new Date(ms),year=date.getUTCFullYear(),days=(ms-Date.UTC(year,0,1))/864e5;
  const g=2*Math.PI/365*(days-0.5);
  const equation=229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
  const declination=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
  const utcMinutes=((ms%864e5)+864e5)%864e5/6e4;
  return{sinDec:Math.sin(declination),cosDec:Math.cos(declination),solarMinutes:utcMinutes+equation};
}

// Sine of the sun's elevation; the caller supplies sin and cos of latitude so
// a grid can reuse them along each row.
export function sinElevation(sun,sinLat,cosLat,lon){
  const hourAngle=((sun.solarMinutes+4*lon)/4-180)*RAD;
  return sinLat*sun.sinDec+cosLat*sun.cosDec*Math.cos(hourAngle);
}

export function sunElevation(ms,lat,lon){
  const s=sinElevation(solarInstant(ms),Math.sin(lat*RAD),Math.cos(lat*RAD),lon);
  return Math.asin(Math.max(-1,Math.min(1,s)))/RAD;
}

// 0 = daylight, 1 = twilight, 2 = dark.
const SIN_SUNRISE=Math.sin(SUNRISE*RAD),SIN_TWILIGHT=Math.sin(TWILIGHT*RAD);
export function lightBand(sinElev){return sinElev>=SIN_SUNRISE?0:sinElev>=SIN_TWILIGHT?1:2;}

// How dark a place is, 0 in daylight rising to 1 at the end of civil twilight.
export function darkness(sinElev){return sinElev>=SIN_SUNRISE?0:sinElev<=SIN_TWILIGHT?1:(SIN_SUNRISE-sinElev)/(SIN_SUNRISE-SIN_TWILIGHT);}
