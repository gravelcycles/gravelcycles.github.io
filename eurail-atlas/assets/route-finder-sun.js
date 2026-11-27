// Sunrise and sunset for the route finder's "Daylight" travel hours
// (docs/RAIL_ROUTE_FINDER_DAY_TRIPS.md, section 1). Computed in the browser
// from a station's position and the date; no external service. The standard
// sunrise equation (solar mean anomaly, equation of centre, ecliptic
// longitude, declination, hour angle at -0.833 degrees: refraction and the
// sun's radius), good to about a minute away from the polar circles.
const RAD=Math.PI/180;

// The Julian day of 12:00 UTC on an ISO date.
function julianNoon(iso){const[y,m,d]=iso.split('-').map(Number);return Date.UTC(y,m-1,d,12)/86400000+2440587.5;}

// {rise, set} in UTC minutes from 00:00 UTC of `iso` (may fall outside
// 0..1440 at the date line; not in Europe), or {polarNight:true} when the sun
// does not rise, or {midnightSun:true} when it does not set.
// lat, lon in degrees (east positive).
export function sunTimes(iso,lat,lon){
  const n=Math.round(julianNoon(iso)-2451545.0),J=n-lon/360;
  const M=(357.5291+0.98560028*J)%360,Mr=M*RAD;
  const C=1.9148*Math.sin(Mr)+0.02*Math.sin(2*Mr)+0.0003*Math.sin(3*Mr);
  const L=((M+C+180+102.9372)%360)*RAD;
  const transit=2451545+J+0.0053*Math.sin(Mr)-0.0069*Math.sin(2*L);
  const sinD=Math.sin(L)*Math.sin(23.4397*RAD),cosD=Math.cos(Math.asin(sinD)),phi=lat*RAD;
  const cosW=(Math.sin(-0.833*RAD)-Math.sin(phi)*sinD)/(Math.cos(phi)*cosD);
  if(cosW>1)return{polarNight:true};
  if(cosW<-1)return{midnightSun:true};
  const w=Math.acos(cosW)/RAD/360,midnight=julianNoon(iso)-0.5;
  return{rise:(transit-w-midnight)*1440,set:(transit+w-midnight)*1440};
}

// The daylight window at a place on a date, in local minutes of that day:
// [sunrise - margin, sunset + margin] clamped to the day, where local = UTC +
// utcOffset (minutes). Polar night gives an empty window (start > end, no
// travel there that day: never a made-up fallback); midnight sun the whole day.
export function daylightWindow(iso,lat,lon,utcOffset,margin=0){
  const t=sunTimes(iso,lat,lon);
  if(t.polarNight)return{start:1,end:0,polarNight:true};
  if(t.midnightSun)return{start:0,end:1440,midnightSun:true};
  const start=Math.max(0,Math.round(t.rise+utcOffset-margin)),end=Math.min(1440,Math.round(t.set+utcOffset+margin));
  return start<end?{start,end}:{start:1,end:0,polarNight:true};
}
