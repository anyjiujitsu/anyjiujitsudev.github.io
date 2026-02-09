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
  const h = norm(hay);
  return words.every(w => h.includes(w));
}

/* section: events dates | purpose: parse DATE field reliably */
function parseEventDate(str){
  const s = String(str ?? "").trim();
  if(!s) return null;

  // MM/DD/YYYY or M/D/YYYY
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    const yy = Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d) ? null : d;
  }

  // MM/DD/YY or M/D/YY (assume 20YY)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if(m){
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    const yy = 2000 + Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d) ? null : d;
  }

  // ISO YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m){
    const yy = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d) ? null : d;
}

/* section: events created | purpose: parse CREATED field */
function createdDateFromRow(row){
  const createdRaw = String(row?.CREATED ?? "").trim();
  if(!createdRaw) return null;

  // native parsing first (handles ISO and many formats)
  const ms = Date.parse(createdRaw);
  if(!Number.isNaN(ms)) return new Date(ms);

  // fallback: date-only formats
  try{
    return parseEventDate(createdRaw);
  }catch(e){
    return null;
  }
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
function startOfWeekMonday(d){
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay(); // 0=Sun..6=Sat
  const offset = (dow + 6) % 7; // Mon=0 ... Sun=6
  x.setDate(x.getDate() - offset);
  return x;
}

function sameYMD(a, b){
  return !!(a && b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate());
}

function weekendDatesForCurrentWeek(){
  const now = new Date();
  const mon = startOfWeekMonday(now);
  const sat = new Date(mon); sat.setDate(mon.getDate() + 5);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { sat, sun };
}

function isRowThisWeekend(row){
  const d = parseEventDate(row?.DATE);
  if(!d) return false;
  const { sat, sun } = weekendDatesForCurrentWeek();
  return sameYMD(d, sat) || sameYMD(d, sun);
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

/* section: events grouping | purpose: month-year label search (matches group headers) */
function monthYearLabel(dateStr){
  const str = String(dateStr ?? "").trim();
  if(!str) return "";

  // prefer MM/DD/YYYY (or M/D/YYYY) to avoid locale issues
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  let d = null;

  if(m){
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    const yy = Number(m[3]);
    d = new Date(yy, mm - 1, dd);
  } else {
    const tmp = new Date(str);
    d = isNaN(tmp) ? null : tmp;
  }

  if(!d || isNaN(d)) return "";
  return d.toLocaleString("en-US", { month: "long", year: "numeric" }).toLowerCase();
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
      out = out.filter(r =>
        (r.SAT && String(r.SAT).trim()) || (r.SUN && String(r.SUN).trim())
      );
    } else {
      // otherwise OR across selected days
      out = out.filter(r => {
        const hasSat = (r.SAT && String(r.SAT).trim());
        const hasSun = (r.SUN && String(r.SUN).trim());
        return (wantSat && hasSat) || (wantSun && hasSun);
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
      if(c === "sat" || c === "saturday") return !!(r.SAT && String(r.SAT).trim());
      if(c === "sun" || c === "sunday") return !!(r.SUN && String(r.SUN).trim());
      if(c === "open mat") return !!((r.SAT && String(r.SAT).trim()) || (r.SUN && String(r.SUN).trim()));

      const hay = r.searchText ?? `${r.STATE} ${r.CITY} ${r.NAME} ${r.IG} ${r.SAT} ${r.SUN} ${r.OTA}`;
      return includesAllWords(hay, c);
    });
  });
}

/* section: events helpers | purpose: YEAR fallbacks */
function eventYear(row){
  const y = String(row?.YEAR ?? "").trim();
  if(y) return y;

  const d = String(row?.DATE ?? "").trim();
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m) return m[3];

  const tmp = new Date(d);
  if(!isNaN(tmp)) return String(tmp.getFullYear());

  return "";
}

/* section: events filtering | purpose: apply Events view pills + search */
export function filterEvents(rows, state){
  let out = rows;

  // YEAR pill (multi-select)
  const years = state?.events?.year;
  if(years && years.size){
    out = out.filter(r => years.has(eventYear(r)));
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
  const tokenNew = extractNewEventsToken(state?.events?.q);
  const tokenWeekend = extractThisWeekendToken(tokenNew.remaining);

  const cs = clauses(tokenWeekend.remaining);
  const wantsNew = tokenNew.wantsNew;
  const wantsWeekend = tokenWeekend.wantsWeekend;

  if(!cs.length && !wantsNew && !wantsWeekend) return out;

  return out.filter(r => {
    if(wantsNew && !isRowNew(r)) return false;
    if(wantsWeekend && !isRowThisWeekend(r)) return false;

    if(!cs.length) return true;

    const group = monthYearLabel(r.DATE);
    const base = r.searchText ?? `${r.YEAR} ${r.STATE} ${r.CITY} ${r.GYM} ${r.TYPE} ${r.DATE}`;
    const hay = `${base} ${group}`;

    return cs.every(c => includesAllWords(hay, c));
  });
}
