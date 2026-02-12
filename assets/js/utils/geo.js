// utils/geo.js
// purpose: fast, client-side distance filtering for Index "Training Near" (ZIP)

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

/* ------------------ ZIP GEOCODING ------------------ */
// We only ever geocode ONE thing: the user's ZIP.
// Directory rows already include LAT/LON in directory.csv.

function zipStorageKey(zip){
  return `anyjj:zipgeo:${zip}`;
}

function readZipCache(zip){
  try{
    const raw = localStorage.getItem(zipStorageKey(zip));
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
    localStorage.setItem(zipStorageKey(zip), JSON.stringify(val));
  }catch(_){
    // ignore (private mode / quota)
  }
}

// in-memory cache: zip -> {lat,lon} | Promise<{lat,lon}|null>
const zipMem = new Map();

let zipQueue = Promise.resolve();
function enqueueZip(fn){
  zipQueue = zipQueue.then(async ()=>{
    // space requests a bit (polite)
    await new Promise(r => setTimeout(r, 450));
    return fn();
  }).catch(()=>fn());
  return zipQueue;
}

async function fetchZipLatLon(zip){
  // zippopotam.us is simple and fast; one call per ZIP.
  const url = `https://api.zippopotam.us/us/${encodeURIComponent(zip)}`;
  const res = await fetch(url, { method: "GET" });
  if(!res.ok) return null;
  const data = await res.json();
  const place = data && Array.isArray(data.places) ? data.places[0] : null;
  if(!place) return null;
  const lat = Number(place.latitude);
  const lon = Number(place.longitude);
  if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

export function getZipLatLon(zip, onUpdate){
  const z = String(zip || "").trim();
  if(!/^\d{5}$/.test(z)) return Promise.resolve(null);

  if(zipMem.has(z)){
    const v = zipMem.get(z);
    return (v && typeof v.then === "function") ? v : Promise.resolve(v);
  }

  const cached = readZipCache(z);
  if(cached){
    zipMem.set(z, cached);
    return Promise.resolve(cached);
  }

  const p = enqueueZip(async ()=>{
    const got = await fetchZipLatLon(z);
    if(got){
      zipMem.set(z, got);
      writeZipCache(z, got);
    }else{
      zipMem.set(z, null);
    }
    if(typeof onUpdate === "function") onUpdate();
    return zipMem.get(z);
  });

  zipMem.set(z, p);
  return p;
}

/* ------------------ DISTANCE FILTER ------------------ */
export function applyDistanceFilter(directoryRows, distMiles, distFromLabel, onUpdate){
  const miles = Number(distMiles);
  const from = String(distFromLabel ?? "").trim();
  if(!Number.isFinite(miles) || miles <= 0 || !from) return { rows: directoryRows, pending: 0, active: false };

  // ZIP must be 5 digits
  if(!/^\d{5}$/.test(from)) return { rows: directoryRows, pending: 0, active: false };

  // origin coords (ZIP) – if missing, request and temporarily return [] (keeps UI honest)
  const originCached = readZipCache(from) || (zipMem.get(from) && typeof zipMem.get(from).then !== "function" ? zipMem.get(from) : null);
  if(!originCached){
    getZipLatLon(from, onUpdate);
    return { rows: [], pending: 1, active: true };
  }

  // bounding box prefilter (cheap) before haversine
  const deltaLat = miles / 69; // ~69 miles per degree latitude
  const cosLat = Math.cos(toRad(originCached.lat));
  const deltaLon = miles / (69 * (cosLat || 1));
  const minLat = originCached.lat - deltaLat;
  const maxLat = originCached.lat + deltaLat;
  const minLon = originCached.lon - deltaLon;
  const maxLon = originCached.lon + deltaLon;

  const out = [];
  for(const r of directoryRows){
    const lat = Number(r.LAT);
    const lon = Number(r.LON);
    if(!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if(lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) continue;

    const d = haversineMiles(originCached, { lat, lon });
    if(Number.isFinite(d) && d <= miles) out.push(r);
  }

  return { rows: out, pending: 0, active: true };
}
