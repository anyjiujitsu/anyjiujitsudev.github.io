// utils/geo.js
// purpose: lightweight geocoding + distance helpers for Index "Training Near" filter
// notes:
// - origin is a 5-digit ZIP (USA)
// - gyms are City/State only, so results are estimated (city centroids)

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

/* ------------------ GEOCODING (Nominatim) ------------------ */
// Works client-side on a static site.
// Uses localStorage caching + a small throttle queue.

function cityKey(city, state){
  const c = String(city ?? "").trim().toLowerCase();
  const s = String(state ?? "").trim().toUpperCase();
  return `city:${c}|${s}`;
}

function zipKey(zip){
  const z = String(zip ?? "").trim();
  return `zip:${z}`;
}

function storageKey(k){
  return `anyjj:geo:${k}`;
}

function readCache(k){
  try{
    const raw = localStorage.getItem(storageKey(k));
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || !Number.isFinite(obj.lat) || !Number.isFinite(obj.lon)) return null;
    return { lat: obj.lat, lon: obj.lon };
  }catch(_){
    return null;
  }
}

function writeCache(k, val){
  try{
    localStorage.setItem(storageKey(k), JSON.stringify(val));
  }catch(_){
    // ignore (private mode / quota)
  }
}

// in-memory cache: key -> {lat,lon} | Promise<{lat,lon}|null>
const mem = new Map();

// simple queue throttle (1 request ~ every 1100ms)
let queue = Promise.resolve();
function enqueue(fn){
  queue = queue.then(async ()=>{
    await new Promise(r => setTimeout(r, 1100));
    return fn();
  }).catch(()=>fn());
  return queue;
}

async function fetchNominatim(url){
  const res = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json" }
  });
  if(!res.ok) return null;
  const arr = await res.json();
  const hit = Array.isArray(arr) ? arr[0] : null;
  if(!hit) return null;
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function fetchCityState(city, state){
  const q = encodeURIComponent(`${city}, ${state}, USA`);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`;
  return fetchNominatim(url);
}

async function fetchZip(zip){
  // keep it simple and reliable: query the ZIP with a USA hint
  const q = encodeURIComponent(`${zip} USA`);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`;
  return fetchNominatim(url);
}

export function getCityStateLatLon(city, state, onUpdate){
  const k = cityKey(city, state);
  if(mem.has(k)){
    const v = mem.get(k);
    return (v && typeof v.then === "function") ? v : Promise.resolve(v);
  }

  const cached = readCache(k);
  if(cached){
    mem.set(k, cached);
    return Promise.resolve(cached);
  }

  const p = enqueue(async ()=>{
    const got = await fetchCityState(city, state);
    if(got){
      mem.set(k, got);
      writeCache(k, got);
    } else {
      mem.set(k, null);
    }
    if(typeof onUpdate === "function") onUpdate();
    return mem.get(k);
  });

  mem.set(k, p);
  return p;
}

export function getZipLatLon(zip, onUpdate){
  const z = String(zip ?? "").trim();
  if(!/^\d{5}$/.test(z)) return Promise.resolve(null);

  const k = zipKey(z);
  if(mem.has(k)){
    const v = mem.get(k);
    return (v && typeof v.then === "function") ? v : Promise.resolve(v);
  }

  const cached = readCache(k);
  if(cached){
    mem.set(k, cached);
    return Promise.resolve(cached);
  }

  const p = enqueue(async ()=>{
    const got = await fetchZip(z);
    if(got){
      mem.set(k, got);
      writeCache(k, got);
    } else {
      mem.set(k, null);
    }
    if(typeof onUpdate === "function") onUpdate();
    return mem.get(k);
  });

  mem.set(k, p);
  return p;
}

/* ------------------ DISTANCE FILTER ------------------ */
function getMemCached(k){
  const v = mem.get(k);
  if(v && typeof v.then !== "function") return v;
  return null;
}

export function applyDistanceFilter(directoryRows, distMiles, distFromLabel, onUpdate){
  const miles = Number(distMiles);
  const from = String(distFromLabel ?? "").trim();
  if(!Number.isFinite(miles) || miles <= 0 || !from) return { rows: directoryRows, pending: 0, active: false };

  // origin: ZIP
  const isZip = /^\d{5}$/.test(from);
  let origin = null;
  let originKey = null;

  if(isZip){
    originKey = zipKey(from);
    origin = readCache(originKey) || getMemCached(originKey);
    if(!origin){
      getZipLatLon(from, onUpdate);
      return { rows: [], pending: 1, active: true };
    }
  } else {
    // legacy support: "City, ST"
    const m = from.match(/^(.*?),\s*([A-Za-z]{2})$/);
    if(!m) return { rows: directoryRows, pending: 0, active: false };
    const originCity = m[1].trim();
    const originState = m[2].trim().toUpperCase();
    originKey = cityKey(originCity, originState);
    origin = readCache(originKey) || getMemCached(originKey);
    if(!origin){
      getCityStateLatLon(originCity, originState, onUpdate);
      return { rows: [], pending: 1, active: true };
    }
  }

  let pending = 0;
  const out = [];

  for(const r of directoryRows){
    const city = String(r.CITY ?? "").trim();
    const st   = String(r.STATE ?? "").trim().toUpperCase();
    if(!city || !st) continue;

    const k = cityKey(city, st);
    const cached = readCache(k) || getMemCached(k);
    if(!cached){
      pending++;
      getCityStateLatLon(city, st, onUpdate);
      continue;
    }

    const d = haversineMiles(origin, cached);
    if(Number.isFinite(d) && d <= miles) out.push(r);
  }

  return { rows: out, pending, active: true };
}
