// utils/geo.js
// purpose: lightweight distance helpers for Index "Training Near" filter (ZIP -> local distance)

/* ------------------ HAVERSINE (miles) ------------------ */
const EARTH_RADIUS_MI = 3958.7613;

function toRad(deg){
  return (deg * Math.PI) / 180;
}

export function haversineMiles(a, b){
  if(!a || !b) return NaN;
  const lat1 = Number(a.lat), lon1 = Number(a.lon);
  const lat2 = Number(b.lat), lon2 = Number(b.lon);
  if(!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return NaN;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const s = Math.sin(dLat/2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * (Math.sin(dLon/2) ** 2);
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(s)));
  return EARTH_RADIUS_MI * c;
}

/* ------------------ ZIP -> LAT/LON (Zippopotam.us) ------------------ */
// Notes:
// - We only geocode the ZIP once per search.
// - All directory rows already have LAT/LON in the CSV, so per-row work is just math.

function zipKey(zip){
  return `anyjj:zip:${zip}`;
}

function readZipCache(zip){
  try{
    const raw = localStorage.getItem(zipKey(zip));
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || !Number.isFinite(obj.lat) || !Number.isFinite(obj.lon)) return null;
    return { lat: obj.lat, lon: obj.lon };
  }catch(_){
    return null;
  }
}

function writeZipCache(zip, val){
  try{
    localStorage.setItem(zipKey(zip), JSON.stringify(val));
  }catch(_){
    // ignore
  }
}

const zipMem = new Map(); // zip -> {lat,lon} | Promise<{lat,lon}|null>

async function fetchZipLatLon(zip){
  const url = `https://api.zippopotam.us/us/${encodeURIComponent(zip)}`;
  const res = await fetch(url, { method: "GET" });
  if(!res.ok) return null;
  const data = await res.json();
  const place = Array.isArray(data?.places) ? data.places[0] : null;
  if(!place) return null;
  const lat = Number(place.latitude);
  const lon = Number(place.longitude);
  if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function getZipLatLon(zip, onUpdate){
  if(zipMem.has(zip)){
    const v = zipMem.get(zip);
    return (v && typeof v.then === "function") ? v : Promise.resolve(v);
  }

  const cached = readZipCache(zip);
  if(cached){
    zipMem.set(zip, cached);
    return Promise.resolve(cached);
  }

  const p = (async ()=>{
    const got = await fetchZipLatLon(zip);
    if(got){
      zipMem.set(zip, got);
      writeZipCache(zip, got);
    } else {
      zipMem.set(zip, null);
    }
    if(typeof onUpdate === "function") onUpdate();
    return zipMem.get(zip);
  })();

  zipMem.set(zip, p);
  return p;
}

/* ------------------ DISTANCE FILTER ------------------ */
export function applyDistanceFilter(directoryRows, distMiles, distFromLabel, onUpdate){
  const miles = Number(distMiles);
  const from = String(distFromLabel ?? "").trim();
  if(!Number.isFinite(miles) || miles <= 0 || !from) return { rows: directoryRows, pending: 0, active: false };

  // ZIP origin (5 digits)
  const zip = (from.match(/^\d{5}$/) || [])[0];
  if(!zip) return { rows: directoryRows, pending: 0, active: false };

  const origin = readZipCache(zip) || (zipMem.get(zip) && typeof zipMem.get(zip).then !== "function" ? zipMem.get(zip) : null);
  if(!origin){
    getZipLatLon(zip, onUpdate);
    return { rows: [], pending: 1, active: true };
  }

  // cheap bounding-box prefilter before haversine
  const lat0 = origin.lat;
  const lon0 = origin.lon;
  const dLat = miles / 69;
  const dLon = miles / (69 * Math.max(0.2, Math.cos(toRad(lat0))));
  const minLat = lat0 - dLat, maxLat = lat0 + dLat;
  const minLon = lon0 - dLon, maxLon = lon0 + dLon;

  const out = [];
  for(const r of directoryRows){
    const lat = Number(r.LAT);
    const lon = Number(r.LON);
    if(!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if(lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) continue;
    const d = haversineMiles(origin, { lat, lon });
    if(Number.isFinite(d) && d <= miles) out.push(r);
  }

  return { rows: out, pending: 0, active: true };
}
