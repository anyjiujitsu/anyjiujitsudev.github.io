/* section: data loading | purpose: fetch CSV with cache disabled */
import { parseCSVObjects } from "./utils/csv.js";
import { eventYear, formatMonthYear, parseCreatedDate, parseEventDate } from "./utils/dates.js";

export async function loadCSV(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`Failed to load CSV: ${res.status}`);
  const text = await res.text();
  return parseCSVObjects(text);
}

/* section: csv parsing | purpose: shared parser alias for existing imports/tests */
export const parseCSV = parseCSVObjects;

/* section: search indexing | purpose: build normalized lowercase search text once per row */
function normalizeSearchText(s){
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s,]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchText(obj){
  return normalizeSearchText(Object.values(obj).join(" "));
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

  // Optional precomputed coordinates (for fast local ZIP distance filtering)
  const LAT = (r.LAT ?? r.Lat ?? "").toString().trim();
  const LON = (r.LON ?? r.Lon ?? r.LONG ?? r.Long ?? "").toString().trim();
  const lat = LAT === "" ? NaN : Number(LAT);
  const lon = LON === "" ? NaN : Number(LON);

  const row = { STATE, CITY, NAME, IG, SAT, SUN, OTA, LAT: lat, LON: lon };

  return {
    ...row,
    hasSat: !!SAT,
    hasSun: !!SUN,
    searchText: buildSearchText(row)
  };
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
  const LAT = (r.LAT ?? r.Lat ?? "").toString().trim();
  const LON = (r.LON ?? r.Lon ?? r.LONG ?? r.Long ?? "").toString().trim();
  const lat = LAT === "" ? NaN : Number(LAT);
  const lon = LON === "" ? NaN : Number(LON);

  const row = { YEAR, STATE, CITY, GYM, TYPE, DATE, CREATED, LAT: lat, LON: lon };
  const parsedDate = parseEventDate(DATE);
  const parsedCreated = parseCreatedDate(CREATED);

  /* keep originals for future render expansion while caching common derived values */
  return {
    ...r,
    ...row,
    _date: parsedDate,
    _dateTime: parsedDate ? parsedDate.getTime() : null,
    _createdDate: parsedCreated,
    _eventYear: eventYear(row),
    _monthYearLabel: parsedDate ? formatMonthYear(parsedDate) : "Unknown Date",
    searchText: buildSearchText({ ...r, ...row })
  };
}
