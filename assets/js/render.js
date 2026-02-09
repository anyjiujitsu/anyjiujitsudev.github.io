/* section: render (Index + Events)
   purpose: build DOM rows + grouped sections for Index and Events views
   notes: exports must match main.js imports (renderDirectoryGroups, renderEventsGroups) */

export function renderStateMenu(stateListEl, allStates, selectedSet){
  /* section: menu render
     purpose: render STATE checkbox list into a provided container */
  if(!stateListEl) return;

  stateListEl.innerHTML = "";
  for(const code of allStates){
    const label = document.createElement("label");
    label.className = "menu__item";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = code;
    input.checked = selectedSet.has(code);

    const span = document.createElement("span");
    span.textContent = code;

    label.appendChild(input);
    label.appendChild(span);
    stateListEl.appendChild(label);
  }
}

/* section: Index groups (by STATE)
   purpose: render directory rows grouped by state */
export function renderDirectoryGroups(root, rows){
  if(!root) return;

  const grouped = groupByKey(rows, (r)=> (r.STATE || "—").toUpperCase());
  root.innerHTML = "";

  for(const [labelText, list] of grouped){
    const group = document.createElement("section");
    group.className = "group";

    const label = document.createElement("div");
    label.className = "group__label";
    label.textContent = labelText;

    const table = document.createElement("div");
    table.className = "table";

    for(const r of list){
      table.appendChild(renderIndexRow(r));
    }

    group.appendChild(label);
    group.appendChild(table);
    root.appendChild(group);
  }
}

function renderIndexRow(r){
  /* section: Index row
     purpose: one directory row using existing DOM/CSS contract */
  const row = document.createElement("div");
  row.className = "row";

  const a = document.createElement("div");
  a.innerHTML = `
    <div class="cell__name">${escapeHtml(r.NAME)}</div>
    <div class="cell__ig">${escapeHtml(r.IG)}</div>
  `;

  const b = document.createElement("div");
  b.innerHTML = `
    <div class="cell__city">${escapeHtml(r.CITY)}</div>
    <div class="cell__state">${escapeHtml(r.STATE)}</div>
  `;

  const c = document.createElement("div");
  c.innerHTML = `
    <div class="cell__days">${escapeHtml(composeDays(r))}</div>
    <div class="cell__ota">OTA: ${escapeHtml(r.OTA || "—")}</div>
  `;

  row.appendChild(a);
  row.appendChild(b);
  row.appendChild(c);
  return row;
}

function composeDays(r){
  /* section: Index days
     purpose: display Sat/Sun schedule in a compact single line */
  const parts = [];
  parts.push(r.SAT ? `Sat. ${r.SAT}` : "Sat.");
  parts.push(r.SUN ? `Sun. ${r.SUN}` : "Sun.");
  return parts.join("  ");
}

/* section: Events groups (UPCOMING first, then PAST)
   purpose: render events rows grouped by month/year with priority ordering:
            1) Upcoming (today or later), grouped by Month-Year ascending
            2) Past (before today), grouped by Month-Year ascending
            3) Unknown date (unparseable), last
   note: no explicit "Upcoming/Past" headers; groups are simply ordered */
export function renderEventsGroups(root, rows){
  if(!root) return;

  const todayMidnight = localMidnight();

  const upcoming = [];
  const past = [];
  const unknown = [];

  for(const r of rows){
    const d = parseEventDate(r.DATE);
    if(!d){
      unknown.push(r);
      continue;
    }
    if(d < todayMidnight) past.push(r);
    else upcoming.push(r);
  }

  const groupedUpcoming = groupEventsByMonthAscending(upcoming);
  const groupedPast = groupEventsByMonthAscending(past);
  const groupedUnknown = groupEventsByMonthAscending(unknown);

  const grouped = [...groupedUpcoming, ...groupedPast, ...groupedUnknown];

  root.innerHTML = "";

  for(const [labelText, list] of grouped){
    const group = document.createElement("section");
    group.className = "group";

    const label = document.createElement("div");
    label.className = "group__label";
    label.textContent = labelText;

    const table = document.createElement("div");
    table.className = "table";

    // sort within group by date ascending (unknowns last)
    const sorted = [...list].sort((a,b)=>{
      const da = parseEventDate(a.DATE)?.getTime() ?? Number.POSITIVE_INFINITY;
      const db = parseEventDate(b.DATE)?.getTime() ?? Number.POSITIVE_INFINITY;
      return da - db;
    });

    for(const r of sorted){
      table.appendChild(renderEventRow(r));
    }

    group.appendChild(label);
    group.appendChild(table);
    root.appendChild(group);
  }
}

function renderEventRow(r){
  /* section: Events row
     purpose: one events row using existing DOM/CSS contract (4 cells) */
  const row = document.createElement("div");
  row.className = "row row--events";

  // DATE displayed as MM/DD/YY (fallback to raw if parse fails)
  const rawDate = String(r.DATE ?? "").trim();
  const parsed = rawDate ? parseEventDate(rawDate) : null;
  const dateText = parsed
    ? `${String(parsed.getMonth() + 1).padStart(2,"0")}/${String(parsed.getDate()).padStart(2,"0")}/${String(parsed.getFullYear()).slice(-2)}`
    : (rawDate || "—");

  // section: NEW flag
  // purpose: show *NEW only if CREATED is within last 4 days (local midnight cutoff)
  const showNew = shouldShowNew(r.CREATED);

  // 1) EVENT + NEW (subline)
  const c1 = document.createElement("div");
  c1.className = "cell cell--event";
  c1.innerHTML = `
    <div class="cell__top cell__event">${escapeHtml(r.EVENT || r.TYPE || "—")}</div>
    ${showNew ? `<div class="cell__sub cell__new">*NEW</div>` : `<div class="cell__sub cell__new">&nbsp;</div>`}
  `;

  // 2) EVENT inline + FOR + WHERE
  const c2 = document.createElement("div");
  c2.className = "cell cell--forwhere";
  c2.innerHTML = `
    <div class="cell__eventInlineWrap">
      <span class="cell__eventInline">${escapeHtml(r.EVENT || "—")}</span>
      ${showNew ? `<span class="cell__newInline">*NEW</span>` : `<span class="cell__newInline">&nbsp;</span>`}
    </div>
    <div class="cell__top cell__for">${escapeHtml(r.FOR || "—")}</div>
    <div class="cell__sub cell__where">${escapeHtml(getWhereText(r))}</div>
  `;

  // 3) CITY + STATE
  const c3 = document.createElement("div");
  c3.className = "cell cell--citystate";
  c3.innerHTML = `
    <div class="cell__top cell__city">${escapeHtml(r.CITY || "—")}</div>
    <div class="cell__sub cell__state">${escapeHtml(r.STATE || "—")}</div>
  `;

  // 4) DAY + DATE
  const c4 = document.createElement("div");
  c4.className = "cell cell--daydate";
  c4.innerHTML = `
    <div class="cell__top cell__day">${escapeHtml(r.DAY || "—")}</div>
    <div class="cell__sub cell__date">${escapeHtml(dateText)}</div>
  `;

  row.appendChild(c1);
  row.appendChild(c2);
  row.appendChild(c3);
  row.appendChild(c4);

  return row;
}

function getWhereText(r){
  /* section: WHERE fallback
     purpose: display a friendly placeholder when WHERE/GYM is blank */
  const raw = (r.WHERE ?? r.GYM ?? "");
  const t = String(raw).trim();
  return t || "HOSTED LOCATION";
}

function shouldShowNew(createdRaw){
  /* section: NEW logic
     purpose: true if CREATED parses and is within last 4 days */
  const raw = String(createdRaw ?? "").trim();
  if(!raw) return false;

  const createdDate = parseCreatedDate(raw);
  if(!createdDate) return false;

  const cutoff = localMidnightDaysAgo(4);
  return createdDate >= cutoff;
}

function parseCreatedDate(str){
  // Try native parse first (handles ISO and many common formats)
  const ms = Date.parse(str);
  if(!Number.isNaN(ms)) return new Date(ms);

  // Fallback: MM/DD/YYYY style
  return parseEventDate(str);
}

function localMidnightDaysAgo(days){
  const mid = localMidnight();
  mid.setDate(mid.getDate() - days);
  return mid;
}

function localMidnight(){
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function groupEventsByMonthAscending(rows){
  /* section: Events grouping (ascending)
     purpose: map rows to Month-Year keys and sort groups by earliest valid date (asc) */
  const m = new Map();

  for(const r of rows){
    const d = parseEventDate(r.DATE);
    const key = d ? formatMonthYear(d) : "Unknown Date";
    if(!m.has(key)) m.set(key, []);
    m.get(key).push(r);
  }

  // sort groups by their earliest valid date (ascending). Unknown last.
  return [...m.entries()].sort((a,b)=>{
    if(a[0] === "Unknown Date") return 1;
    if(b[0] === "Unknown Date") return -1;

    const da = minDateIn(a[1]);
    const db = minDateIn(b[1]);
    const ta = da ? da.getTime() : Number.POSITIVE_INFINITY;
    const tb = db ? db.getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
}

function minDateIn(list){
  let best = null;
  for(const r of list){
    const d = parseEventDate(r.DATE);
    if(!d) continue;
    if(!best || d < best) best = d;
  }
  return best;
}

function parseEventDate(s){
  /* section: date parse
     purpose: accept MM/DD/YYYY or fall back to Date() for other parseable formats */
  const str = String(s ?? "").trim();
  if(!str) return null;

  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    const yy = Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d) ? null : d;
  }

  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function formatMonthYear(d){
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

/* section: shared helpers
   purpose: grouping + XSS-safe text injection */
function groupByKey(rows, keyFn){
  const m = new Map();
  for(const r of rows){
    const k = keyFn(r);
    if(!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m.entries()].sort((a,b)=> a[0].localeCompare(b[0]));
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
