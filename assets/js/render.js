/* section: render (Index + Events)
   purpose: build DOM rows + grouped sections for Index and Events views
   notes: exports must match main.js imports (renderDirectoryGroups, renderEventsGroups) */

export function renderStateMenu(stateListEl, allStates, selectedSet){
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

/* section: Index groups (by STATE) */
export function renderDirectoryGroups(root, rows){
  if(!root) return;

  const grouped = groupByKey(rows, r => (r.STATE || "—").toUpperCase());
  root.innerHTML = "";

  for(const [labelText, list] of grouped){
    const group = document.createElement("section");
    group.className = "group" + (isPast ? " group--past" : "");

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
  const parts = [];
  parts.push(r.SAT ? `Sat. ${r.SAT}` : "Sat.");
  parts.push(r.SUN ? `Sun. ${r.SUN}` : "Sun.");
  return parts.join("  ");
}

/* section: Events groups (Upcoming first, Past second)
   rules:
   - Upcoming: Month groups ASC, dates ASC
   - Past: Month groups DESC, dates DESC
   - Past section gets a header
   - Unknown dates last */
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
    } else if(d < todayMidnight){
      past.push(r);
    } else {
      upcoming.push(r);
    }
  }

  const upcomingGroups = groupEventsByMonth(upcoming, "asc");
  const pastGroups = groupEventsByMonth(past, "desc");
  const unknownGroups = groupEventsByMonth(unknown, "asc");

  root.innerHTML = "";

  // Upcoming (no header)
  for(const g of upcomingGroups){
    renderEventGroup(root, g, "asc");
  }

  // Past header (only if past exists)
  if(pastGroups.length){
    const hdr = document.createElement("div");
    hdr.className = "group__label group__label--section";
    hdr.textContent = "PAST EVENTS";
    root.appendChild(hdr);

    for(const g of pastGroups){
      renderEventGroup(root, g, "desc", true);
    }
  }

  // Unknown dates last
  for(const g of unknownGroups){
    renderEventGroup(root, g, "asc");
  }
}

function renderEventGroup(root, groupTuple, dir, isPast=false){
  const [labelText, list] = groupTuple;

  const group = document.createElement("section");
  group.className = "group" + (isPast ? " group--past" : "");

  const label = document.createElement("div");
  label.className = "group__label";
  label.textContent = labelText;

  const table = document.createElement("div");
  table.className = "table";

  const sorted = [...list].sort((a,b)=>{
    const da = parseEventDate(a.DATE)?.getTime() ?? (dir === "asc" ? Infinity : -Infinity);
    const db = parseEventDate(b.DATE)?.getTime() ?? (dir === "asc" ? Infinity : -Infinity);
    return dir === "asc" ? da - db : db - da;
  });

  for(const r of sorted){
    table.appendChild(renderEventRow(r));
  }

  group.appendChild(label);
  group.appendChild(table);
  root.appendChild(group);
}

function renderEventRow(r){
  const row = document.createElement("div");
  row.className = "row row--events";

  const rawDate = String(r.DATE ?? "").trim();
  const parsed = rawDate ? parseEventDate(rawDate) : null;
  const dateText = parsed
    ? `${String(parsed.getMonth()+1).padStart(2,"0")}/${String(parsed.getDate()).padStart(2,"0")}/${String(parsed.getFullYear()).slice(-2)}`
    : (rawDate || "—");

  const showNew = shouldShowNew(r.CREATED);

  const c1 = document.createElement("div");
  c1.className = "cell cell--event";
  c1.innerHTML = `
    <div class="cell__top cell__event">${escapeHtml(r.EVENT || r.TYPE || "—")}</div>
    ${showNew ? `<div class="cell__sub cell__new">*NEW</div>` : `<div class="cell__sub cell__new">&nbsp;</div>`}
  `;

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

  const c3 = document.createElement("div");
  c3.className = "cell cell--citystate";
  c3.innerHTML = `
    <div class="cell__top cell__city">${escapeHtml(r.CITY || "—")}</div>
    <div class="cell__sub cell__state">${escapeHtml(r.STATE || "—")}</div>
  `;

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
  const t = String((r.WHERE ?? r.GYM ?? "")).trim();
  return t || "HOSTED LOCATION";
}

function shouldShowNew(createdRaw){
  const raw = String(createdRaw ?? "").trim();
  if(!raw) return false;
  const d = parseCreatedDate(raw);
  if(!d) return false;
  return d >= localMidnightDaysAgo(4);
}

function parseCreatedDate(str){
  const ms = Date.parse(str);
  if(!Number.isNaN(ms)) return new Date(ms);
  return parseEventDate(str);
}

function localMidnightDaysAgo(days){
  const m = localMidnight();
  m.setDate(m.getDate() - days);
  return m;
}

function localMidnight(){
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function groupEventsByMonth(rows, dir){
  const m = new Map();
  for(const r of rows){
    const d = parseEventDate(r.DATE);
    const key = d ? formatMonthYear(d) : "Unknown Date";
    if(!m.has(key)) m.set(key, []);
    m.get(key).push(r);
  }

  return [...m.entries()].sort((a,b)=>{
    if(a[0] === "Unknown Date") return 1;
    if(b[0] === "Unknown Date") return -1;

    const da = minDateIn(a[1]);
    const db = minDateIn(b[1]);
    const ta = da ? da.getTime() : (dir === "asc" ? Infinity : -Infinity);
    const tb = db ? db.getTime() : (dir === "asc" ? Infinity : -Infinity);
    return dir === "asc" ? ta - tb : tb - ta;
  });
}

function minDateIn(list){
  let best = null;
  for(const r of list){
    const d = parseEventDate(r.DATE);
    if(d && (!best || d < best)) best = d;
  }
  return best;
}

function parseEventDate(s){
  const str = String(s ?? "").trim();
  if(!str) return null;
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
    return isNaN(d) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function formatMonthYear(d){
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

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
