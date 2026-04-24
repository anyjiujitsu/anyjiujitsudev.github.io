// indexDirectory.js
// purpose: Index view directory remap + filters used by the Events-style card renderer

export function dirToIndexEventRow(r){
  const row = {
    EVENT: "Drop Ins:",
    FOR: r.NAME || "",
    WHERE: r.IG || "",
    CITY: r.CITY || "",
    STATE: r.STATE || "",
    DAY: r.SAT || "",
    DATE: r.SUN || "",
    OTA: (r.OTA || "").toUpperCase(),
    CREATED: ""
  };

  row.hasSat = !!String(row.DAY || "").trim();
  row.hasSun = !!String(row.DATE || "").trim();
  row.searchText = [row.EVENT, row.FOR, row.WHERE, row.CITY, row.STATE, row.DAY, row.DATE, row.OTA].join(" ").toLowerCase();
  return row;
}

export function filterIndexDirectoryAsEvents(rows, idxState){
  const qRaw = String(idxState?.q ?? "").trim();
  // When a ZIP is applied, mirror it into the search bar for clarity, but do not
  // treat that ZIP as a text-search token.
  const q = (/^\d{5}$/.test(qRaw) && String(idxState?.distFrom || "").trim() === qRaw)
    ? ""
    : qRaw.toLowerCase();
  const stateSet = idxState?.state instanceof Set ? idxState.state : new Set();
  const typeSet  = idxState?.type  instanceof Set ? idxState.type  : new Set();
  const yearSet  = idxState?.year  instanceof Set ? idxState.year  : new Set();

  return rows.filter(r=>{
    if(q){
      const hay = r.searchText || `${r.EVENT} ${r.FOR} ${r.WHERE} ${r.CITY} ${r.STATE} ${r.DAY} ${r.DATE} ${r.OTA}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(stateSet.size){
      const s = String(r.STATE || "").trim().toUpperCase();
      if(!stateSet.has(s)) return false;
    }
    // OPENS pill (Index view repurposed from YEAR): filter by SAT/SUN availability.
    if(yearSet.size){
      const hasSat = r.hasSat ?? (String(r.DAY || "").trim() !== "");
      const hasSun = r.hasSun ?? (String(r.DATE || "").trim() !== "");
      const wantSat  = yearSet.has("SATURDAY");
      const wantSun  = yearSet.has("SUNDAY");
      const wantBoth = yearSet.has("BOTH") || (wantSat && wantSun);

      if(wantBoth){
        if(!(hasSat || hasSun)) return false;
      } else {
        let ok = false;
        if(wantSat && hasSat) ok = true;
        if(wantSun && hasSun) ok = true;
        if(!ok) return false;
      }
    }
    // EVENT pill (Index view repurposed): any selection => OTA === "Y".
    if(typeSet.size){
      const ota = String(r.OTA || "").trim().toUpperCase();
      if(ota !== "Y") return false;
    }
    return true;
  });
}

export function syncDistanceUIFromState($, state){
  const distWrap = $("eventsSearchSuggestDistance");
  if(!distWrap) return;
  const input = $("distanceOriginInput");
  if(input) input.value = String(state.indexEvents.distFrom || "");

  const seg = distWrap.querySelector(".iosSeg");
  const btns = distWrap.querySelectorAll(".iosSeg__btn");
  if(seg && btns && btns.length){
    const miles = Number(state.indexEvents.distMiles || 15);
    seg.dataset.selected = String(miles);
    btns.forEach((b)=>{
      const m = Number(b.dataset.miles);
      const on = (m === miles);
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
}

export function ensureDistanceOriginOptions(){
  // Index now uses a 5-digit ZIP entry instead of a city datalist.
}
