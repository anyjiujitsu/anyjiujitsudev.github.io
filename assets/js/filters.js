import { eventYear, monthYearLabel, parseCreatedDate, parseEventDate, sameYMD, startOfWeekMonday } from "./utils/dates.js";

/* section: query normalization | purpose: case-insensitive + punctuation cleanup */
function norm(s){
  return String(s ?? "")
    .toLowerCase()
    // keep commas for splitting; remove other punctuation
    .replace(/[^\p{L}\p{N}\s,]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* section: query parsing | purpose: comma-separated clauses are ANDed */
function clauses(q){
  return norm(q)
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);
}

/* section: query matching | purpose: require all words in a clause to be present */
function includesAllWords(hay, needle){
  const words = norm(needle).split(" ").filter(Boolean);
  if(!words.length) return true;
  const h = String(hay ?? "");
  return words.every(w => h.includes(w));
}

/* section: events created | purpose: parse CREATED field */
function createdDateFromRow(row){
  return row?._createdDate || parseCreatedDate(row?.CREATED);
}

/* section: events tokens | purpose: "new events" matches CREATED within last 4 days */
function isRowNew(row){
  const d = createdDateFromRow(row);
  if(!d) return false;

  const now = new Date();
  // local midnight cutoff to match render.js behavior
  const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  mid.setDate(mid.getDate() - 4);

  return d >= mid;
}

function extractNewEventsToken(q){
  // detect "new events" and remove from remaining query
  const raw = String(q ?? "");
  const n = norm(raw);
  const wantsNew = n.includes("new events");
  if(!wantsNew) return { wantsNew: false, remaining: raw };

  const remainingNorm = n
    .replace(/\bnew\s+events\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { wantsNew: true, remaining: remainingNorm };
}

/* section: events tokens | purpose: "this weekend" matches Sat/Sun of current Mon–Sun week */
function weekendDatesForCurrentWeek(){
  const now = new Date();
  const mon = startOfWeekMonday(now);
  const sat = new Date(mon); sat.setDate(mon.getDate() + 5);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { sat, sun };
}

function isRowThisWeekend(row){
  const d = row?._date || parseEventDate(row?.DATE);
  if(!d) return false;
  const { sat, sun } = weekendDatesForCurrentWeek();
  return sameYMD(d, sat) || sameYMD(d, sun);
}



function weekendDatesForNextWeek(){
  const now = new Date();
  const mon = startOfWeekMonday(now);
  const sat = new Date(mon); sat.setDate(mon.getDate() + 12);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 13);
  return { sat, sun };
}

function isRowNextWeekend(row){
  const d = row?._date || parseEventDate(row?.DATE);
  if(!d) return false;
  const { sat, sun } = weekendDatesForNextWeek();
  return sameYMD(d, sat) || sameYMD(d, sun);
}

function extractNextWeekendToken(q){
  // detect "next weekend" and remove from remaining query
  const raw = String(q ?? "");
  const n = norm(raw);
  const wantsNextWeekend = n.includes("next weekend");
  if(!wantsNextWeekend) return { wantsNextWeekend: false, remaining: raw };

  const remainingNorm = n
    .replace(/\bnext\s+weekend\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { wantsNextWeekend: true, remaining: remainingNorm };
}

function extractThisWeekendToken(q){
  // detect "this weekend" and remove from remaining query
  const raw = String(q ?? "");
  const n = norm(raw);
  const wantsWeekend = n.includes("this weekend");
  if(!wantsWeekend) return { wantsWeekend: false, remaining: raw };

  const remainingNorm = n
    .replace(/\bthis\s+weekend\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { wantsWeekend: true, remaining: remainingNorm };
}

/* section: directory filtering | purpose: apply Index view pills + search */
export function filterDirectory(rows, state){
  let out = rows;

  // OPENS pill — multi-select: ALL | SATURDAY | SUNDAY
  const opensSel = state?.index?.opens;
  if(opensSel && opensSel.size){
    const wantAll = opensSel.has("ALL");
    const wantSat = opensSel.has("SATURDAY");
    const wantSun = opensSel.has("SUNDAY");

    // if ALL selected, treat as "Sat OR Sun"
    if(wantAll){
      out = out.filter(r => r.hasSat || r.hasSun);
    } else {
      // otherwise OR across selected days
      out = out.filter(r => {
        return (wantSat && r.hasSat) || (wantSun && r.hasSun);
      });
    }
  }

  // GUESTS pill — "GUESTS WELCOME" means OTA === "Y"
  const guestsSel = state?.index?.guests;
  if(guestsSel && guestsSel.size){
    out = out.filter(r => String(r.OTA ?? "").trim().toUpperCase() === "Y");
  }

  // STATE pill
  const statesSel = state?.index?.states;
  if(statesSel && statesSel.size){
    out = out.filter(r => statesSel.has(String(r.STATE ?? "").trim()));
  }

  // Search query (comma-separated clauses ANDed)
  const cs = clauses(state?.index?.q);
  if(!cs.length) return out;

  return out.filter(r => {
    return cs.every(c => {
      // special tokens
      if(c === "sat" || c === "saturday") return !!r.hasSat;
      if(c === "sun" || c === "sunday") return !!r.hasSun;
      if(c === "open mat") return !!(r.hasSat || r.hasSun);

      const hay = r.searchText ?? `${r.STATE} ${r.CITY} ${r.NAME} ${r.IG} ${r.SAT} ${r.SUN} ${r.OTA}`;
      return includesAllWords(hay, c);
    });
  });
}

/* section: events filtering | purpose: apply Events view pills + search */
export function filterEvents(rows, state){
  let out = rows;

  // YEAR pill (multi-select)
  const years = state?.events?.year;
  if(years && years.size){
    out = out.filter(r => years.has(r._eventYear || eventYear(r)));
  }

  // STATE pill
  const statesSel = state?.events?.state;
  if(statesSel && statesSel.size){
    out = out.filter(r => statesSel.has(String(r.STATE ?? "").trim()));
  }

  // TYPE pill
  const typesSel = state?.events?.type;
  if(typesSel && typesSel.size){
    out = out.filter(r => typesSel.has(String(r.TYPE ?? "").trim()));
  }

  // Search query + special tokens
  // When a ZIP distance filter is active, the ZIP may be mirrored into the search bar
  // for visibility; do not also treat that ZIP as a text-search token.
  const qRaw = String(state?.events?.q ?? "").trim();
  const qForSearch = (/^\d{5}$/.test(qRaw) && String(state?.events?.distFrom || "").trim() === qRaw)
    ? ""
    : qRaw;
  const tokenNew = extractNewEventsToken(qForSearch);
  const tokenWeekend = extractThisWeekendToken(tokenNew.remaining);
  const tokenNextWeekend = extractNextWeekendToken(tokenWeekend.remaining);

  const cs = clauses(tokenNextWeekend.remaining);
  const wantsNew = tokenNew.wantsNew;
  const wantsWeekend = tokenWeekend.wantsWeekend;
  const wantsNextWeekend = tokenNextWeekend.wantsNextWeekend;

  if(!cs.length && !wantsNew && !wantsWeekend && !wantsNextWeekend) return out;

  return out.filter(r => {
    if(wantsNew && !isRowNew(r)) return false;
    if(wantsWeekend && !isRowThisWeekend(r)) return false;
    if(wantsNextWeekend && !isRowNextWeekend(r)) return false;

    if(!cs.length) return true;

    const group = r._monthYearLabel || monthYearLabel(r.DATE);
    const base = r.searchText ?? `${r.YEAR} ${r.STATE} ${r.CITY} ${r.GYM} ${r.TYPE} ${r.DATE}`;
    const hay = `${base} ${group}`;

    return cs.every(c => includesAllWords(hay, c));
  });
}
