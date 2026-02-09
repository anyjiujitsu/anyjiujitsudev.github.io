/* section: data loading | purpose: fetch CSV with cache disabled */
export async function loadCSV(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`Failed to load CSV: ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}

/* section: csv parsing | purpose: convert CSV text to row objects */
export function parseCSV(text){
  const lines = text
    .split(/\r?\n/)
    .filter(l => l.trim().length > 0);

  if(!lines.length) return [];

  const headers = splitLine(lines[0]).map(h => h.trim());
  const rows = [];

  for(let i = 1; i < lines.length; i++){
    const cols = splitLine(lines[i]);
    const r = {};
    headers.forEach((h, idx) => {
      r[h] = (cols[idx] ?? "").trim();
    });
    rows.push(r);
  }

  return rows;
}

/* section: csv parsing | purpose: split line respecting quoted commas */
function splitLine(line){
  const out = [];
  let cur = "";
  let inQ = false;

  for(let i = 0; i < line.length; i++){
    const ch = line[i];
    if(ch === '"'){
      inQ = !inQ;
      continue;
    }
    if(ch === "," && !inQ){
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }

  out.push(cur);
  return out;
}

/* section: search indexing | purpose: build lowercase search text */
function buildSearchText(obj){
  return Object.values(obj).join(" ").toLowerCase();
}

/* section: directory normalization | purpose: standardize directory rows */
export function normalizeDirectoryRow(r){
  const STATE = (r.STATE || "").trim().toUpperCase();
  const CITY  = (r.CITY || "").trim();
  const NAME  = (r.NAME || "").trim();
  const IG    = (r.IG || "").trim();
  const SAT   = (r.SAT || "").trim();
  const SUN   = (r.SUN || "").trim();
  const OTA   = (r.OTA || "").trim().toUpperCase(); // Y / N / blank

  const row = { STATE, CITY, NAME, IG, SAT, SUN, OTA };
  return { ...row, searchText: buildSearchText(row) };
}

/* section: event normalization | purpose: standardize flexible event rows */
export function normalizeEventRow(r){
  const YEAR    = (r.YEAR || r.Year || "").trim();
  const STATE   = (r.STATE || r.State || "").trim().toUpperCase();
  const CITY    = (r.CITY || r.City || "").trim();
  const GYM     = (r.GYM || r.Where || r.WHERE || r.LOCATION || r.Location || "").trim();
  const TYPE    = (r.TYPE || r.Event || r.EVENT || "").trim();
  const DATE    = (r.DATE || r.Date || "").trim();
  const CREATED = (r.CREATED || r.Created || "").trim();

  const row = { YEAR, STATE, CITY, GYM, TYPE, DATE, CREATED };

  /* keep originals for future render expansion */
  return {
    ...r,
    ...row,
    searchText: buildSearchText({ ...r, ...row })
  };
}
