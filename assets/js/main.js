import { loadCSV, normalizeDirectoryRow, normalizeEventRow } from "./data.js?v=20260202-321";
import { state, setView, setIndexQuery, setEventsQuery } from "./state.js?v=20260202-321";
import { filterDirectory, filterEvents } from "./filters.js?v=20260202-321";
import { renderDirectoryGroups, renderEventsGroups } from "./render.js?v=20260202-321";

let directoryRows = [];
let eventRows = [];

// TEMP: lock app to Events while Index view is being rebuilt
const VIEW_LOCKED = true;

function $(id){ return document.getElementById(id); }

/* ------------------ PILL MENUS (Events: YEAR) ------------------ */
function parseYearFromEventRow(r){
  const y = String(r?.YEAR ?? "").trim();
  if(y) return y;
  const d = String(r?.DATE ?? "").trim();
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m) return m[3];
  const tmp = new Date(d);
  if(!isNaN(tmp)) return String(tmp.getFullYear());
  return "";
}

function uniqYearsFromEvents(rows){
  const set = new Set();
  rows.forEach(r=>{
    const y = parseYearFromEventRow(r);
    if(y) set.add(y);
  });
  return Array.from(set).sort((a,b)=>Number(b)-Number(a));
}

function uniqStatesFromEvents(rows){
  const set = new Set();
  rows.forEach(r=>{
    const s = String(r.STATE ?? "").trim();
    if(s) set.add(s);
  });
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}

function uniqTypesFromEvents(rows){
  const set = new Set();
  rows.forEach(r=>{
    const t = String(r.TYPE ?? "").trim();
    if(t) set.add(t);
  });
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}




function uniqStatesFromDirectory(rows){
  const set = new Set();
  rows.forEach(r=>{
    const s = String(r.STATE ?? "").trim();
    if(s) set.add(s);
  });
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}

function buildMenuListIn(listEl, items, selectedSet, onChange){
  if(!listEl) return;
  listEl.innerHTML = "";
  items.forEach(val=>{
    const row = document.createElement('label');
    row.className = 'menu__item menu__item--check';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'menu__checkbox';
    cb.checked = selectedSet.has(val);
    cb.value = val;

    const text = document.createElement('span');
    text.className = 'menu__itemText';
    text.textContent = val;

    cb.addEventListener('change', (ev)=>{
      ev.stopPropagation();
      if(cb.checked) selectedSet.add(val);
      else selectedSet.delete(val);
      onChange();
    });

    row.appendChild(cb);
    row.appendChild(text);
    listEl.appendChild(row);
  });
}






function closeAllMenus(){
  document.querySelectorAll('.menu[data-pill-panel]').forEach(panel=>{
    panel.hidden = true;
    panel.style.left = '';
    panel.style.top  = '';
  });
  document.querySelectorAll('.pill.filter-pill[aria-expanded="true"]').forEach(btn=>{
    btn.setAttribute('aria-expanded','false');
  });
}

function positionMenu(btnEl, panelEl){
  const vv = window.visualViewport;
  if(!btnEl || !panelEl) return;
  const r = btnEl.getBoundingClientRect();
  const pad = 8;
  const vw = vv ? vv.width : window.innerWidth;
  const vh = vv ? vv.height : window.innerHeight;
  const vx = vv ? vv.offsetLeft : 0;
  const vy = vv ? vv.offsetTop : 0;

  panelEl.hidden = false; // show to measure

  let left = r.left + vx;
  let top  = r.bottom + pad + vy;

  const pr = panelEl.getBoundingClientRect();
  const w = pr.width;
  const h = pr.height;

  if(left + w + pad > vw) left = Math.max(pad, vw - w - pad);
  if(left < pad) left = pad;

  if(top + h + pad > vh){
    const above = r.top - h - pad;
    if(above >= pad) top = above;
    else top = Math.max(pad, vh - h - pad);
  }

  panelEl.style.left = Math.round(left) + "px";
  panelEl.style.top  = Math.round(top) + "px";
}

function setPillHasSelection(btnEl, has){
  if(!btnEl) return;
  btnEl.setAttribute('data-has-selection', has ? 'true' : 'false');
}

function wireMenuDismiss(){
  if(wireMenuDismiss._did) return;
  wireMenuDismiss._did = true;

  document.addEventListener('click', (e)=>{
    const t = e.target;
    if(t && (t.closest('.pillSelect') || t.closest('.menu') || t.closest('.pill.filter-pill'))) return;
    closeAllMenus();
  });

  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape') closeAllMenus();
  });

  window.addEventListener('resize', ()=>closeAllMenus());
}

function buildMenuList(panelEl, items, selectedSet, onToggle){
  panelEl.querySelectorAll('.menu__empty').forEach(n=>n.remove());
  panelEl.querySelectorAll('.menu__list').forEach(n=>n.remove());

  const list = document.createElement('div');
  list.className = 'menu__list';

  items.forEach(val=>{
    const row = document.createElement('label');
    row.className = 'menu__item menu__item--check';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'menu__checkbox';
    cb.checked = selectedSet.has(val);
    cb.value = val;

    const text = document.createElement('span');
    text.className = 'menu__itemText';
    text.textContent = val;

    cb.addEventListener('change', (ev)=>{
      ev.stopPropagation();
      // keep Set in sync with checkbox state
      if(cb.checked) selectedSet.add(val);
      else selectedSet.delete(val);
      onToggle(val, cb.checked);
    });

    row.appendChild(cb);
    row.appendChild(text);
    list.appendChild(row);
  });

  panelEl.appendChild(list);
}

function wireEventsYearPill(getEventRows, onChange){
  wireMenuDismiss();

  const btn = $('eventsPill1Btn');
  const panel = $('eventsPill1Menu');
  const clearBtn = $('eventsPill1Clear');

  if(!btn || !panel) return;

  const years = uniqYearsFromEvents(getEventRows());
  buildMenuList(panel, years, state.events.year, ()=>{
    setPillHasSelection(btn, state.events.year.size>0);
    onChange();
  });

  setPillHasSelection(btn, state.events.year.size>0);

  const toggleYearMenu = (e)=>{
    if(e.type === 'touchend') e.preventDefault();
    e.stopPropagation();

    const expanded = btn.getAttribute('aria-expanded') === 'true';
    closeAllMenus();

    if(!expanded){
      btn.setAttribute('aria-expanded','true');
      positionMenu(btn, panel);
    } else {
      btn.setAttribute('aria-expanded','false');
      panel.hidden = true;
    }
  };

  // Desktop: click. Mobile: touchend fallback.
  btn.addEventListener('click', toggleYearMenu);
  btn.addEventListener('touchend', toggleYearMenu, {passive:false});

  clearBtn?.addEventListener('click', (e)=>{
    if(e.type === 'touchend') e.preventDefault();
    e.stopPropagation();

    state.events.year.clear();
    setPillHasSelection(btn, false);
    panel.querySelectorAll('input.menu__checkbox').forEach(cb=>{ cb.checked = false; });
    onChange();
    closeAllMenus();
  });
}


function wireEventsStatePill(getEventRows, onChange){
  wireMenuDismiss();

  const btn = $('eventsPill2Btn');
  const panel = $('eventsPill2Menu');
  const clearBtn = $('eventsPill2Clear');

  if(!btn || !panel) return;

  const states = uniqStatesFromEvents(getEventRows());
  buildMenuList(panel, states, state.events.state, ()=>{
    setPillHasSelection(btn, state.events.state.size>0);
    onChange();
  });

  setPillHasSelection(btn, state.events.state.size>0);

  const toggleStateMenu = (e)=>{
    if(e.type === 'touchend') e.preventDefault();
    e.stopPropagation();

    const expanded = btn.getAttribute('aria-expanded') === 'true';
    closeAllMenus();

    if(!expanded){
      btn.setAttribute('aria-expanded','true');
      positionMenu(btn, panel);
    } else {
      btn.setAttribute('aria-expanded','false');
      panel.hidden = true;
    }
  };

  btn.addEventListener('click', toggleStateMenu);
  btn.addEventListener('touchend', toggleStateMenu, {passive:false});

  clearBtn?.addEventListener('click', (e)=>{
    if(e.type === 'touchend') e.preventDefault();
    e.stopPropagation();

    state.events.state.clear();
    setPillHasSelection(btn, false);
    panel.querySelectorAll('input.menu__checkbox').forEach(cb=>{ cb.checked = false; });
    onChange();
    closeAllMenus();
  });
}


function wireEventsTypePill(getEventRows, onChange){
  wireMenuDismiss();

  const btn = $('eventsPill3Btn');
  const panel = $('eventsPill3Menu');
  const clearBtn = $('eventsPill3Clear');

  if(!btn || !panel) return;

  const types = uniqTypesFromEvents(getEventRows());
  buildMenuList(panel, types, state.events.type, ()=>{
    setPillHasSelection(btn, state.events.type.size>0);
    onChange();
  });

  setPillHasSelection(btn, state.events.type.size>0);

  const toggleTypeMenu = (e)=>{
    if(e.type === 'touchend') e.preventDefault();
    e.stopPropagation();

    const expanded = btn.getAttribute('aria-expanded') === 'true';
    closeAllMenus();

    if(!expanded){
      btn.setAttribute('aria-expanded','true');
      positionMenu(btn, panel);
    } else {
      btn.setAttribute('aria-expanded','false');
      panel.hidden = true;
    }
  };

  btn.addEventListener('click', toggleTypeMenu);
  btn.addEventListener('touchend', toggleTypeMenu, {passive:false});

  clearBtn?.addEventListener('click', (e)=>{
    if(e.type === 'touchend') e.preventDefault();
    e.stopPropagation();

    state.events.type.clear();
    setPillHasSelection(btn, false);
    panel.querySelectorAll('input.menu__checkbox').forEach(cb=>{ cb.checked = false; });
    onChange();
    closeAllMenus();
  });
}



function setTransition(ms){
  document.body.style.setProperty("--viewTransition", ms + "ms");
}

function applyProgress(p){
  const clamped = Math.max(0, Math.min(1, p));
  document.body.style.setProperty("--viewProgress", String(clamped));
  const viewTitle = $("viewTitle");
  if(viewTitle){
    viewTitle.textContent = (clamped >= 0.5) ? "INDEX" : "EVENTS (QA)";
  }
  return clamped;
}

function setViewUI(view){
  setView(view);

  $("tabEvents")?.setAttribute("aria-selected", view === "events" ? "true" : "false");
  $("tabIndex")?.setAttribute("aria-selected", view === "index" ? "true" : "false");

  // Sticky filter bars (now outside the slider)
  const evFilters = document.getElementById("eventsFilters");
  const idxFilters = document.getElementById("filters");
  if(evFilters) evFilters.hidden = (view !== "events");
  if(idxFilters) idxFilters.hidden = (view !== "index");

  const title = $("viewTitle");
  if(title) title.textContent = (view === "events") ? "EVENTS (QA)" : "INDEX";

  // Header counts: show the relevant total next to the header title
  const evStatus = $("eventsStatus");
  const idxStatus = $("status");
  if(evStatus) evStatus.hidden = (view !== "events");
  if(idxStatus) idxStatus.hidden = (view !== "index");

  document.title = (view === "events") ? "ANY N.E. GRAPPLING (QA)" : "ANY N.E. GRAPPLING (QA)";

  setTransition(260);
  applyProgress(view === "index" ? 1 : 0);
}

function wireViewToggle(){
  const tabEvents = $("tabEvents");
  const tabIndex  = $("tabIndex");
  const viewToggle = $("viewToggle");
  const viewShell  = $("viewShell");

  // View lock: disable toggle + swipe and force Events
  if(VIEW_LOCKED){
    setView("events");
    setViewUI("events");

    if(viewToggle){
      viewToggle.classList.add("viewToggle--locked");
      viewToggle.setAttribute("aria-disabled", "true");
    }
    // keep focus from landing on disabled control
    tabEvents?.setAttribute("tabindex", "-1");
    tabIndex?.setAttribute("tabindex", "-1");
    tabEvents?.setAttribute("aria-disabled", "true");
    tabIndex?.setAttribute("aria-disabled", "true");
    return;
  }

  tabEvents?.addEventListener("click", () => setViewUI("events"));
  tabIndex?.addEventListener("click", () => setViewUI("index"));

  if(viewToggle){
    let dragging = false;
    let pointerId = null;

    viewToggle.addEventListener("pointerdown", (e) => {
      dragging = true;
      pointerId = e.pointerId;
      viewToggle.setPointerCapture(pointerId);
      setTransition(0);

      const rect = viewToggle.getBoundingClientRect();
      const padding = 4;
      const trackW = rect.width - padding * 2;
      const thumbW = trackW / 2;
      const travel = trackW - thumbW;

      const x = e.clientX - rect.left - padding;
      const p = (x - thumbW / 2) / travel;
      applyProgress(p);
    });

    viewToggle.addEventListener("pointermove", (e) => {
      if(!dragging || e.pointerId !== pointerId) return;

      const rect = viewToggle.getBoundingClientRect();
      const padding = 4;
      const trackW = rect.width - padding * 2;
      const thumbW = trackW / 2;
      const travel = trackW - thumbW;

      const x = e.clientX - rect.left - padding;
      const p = (x - thumbW / 2) / travel;
      applyProgress(p);
    });

    const endDrag = (e) => {
      if(!dragging) return;
      if(e && pointerId != null && e.pointerId !== pointerId) return;

      dragging = false;
      pointerId = null;

      setTransition(260);
      const p = Number(getComputedStyle(document.body).getPropertyValue("--viewProgress")) || 0;
      setViewUI(p >= 0.5 ? "index" : "events");
    };

    viewToggle.addEventListener("pointerup", endDrag);
    viewToggle.addEventListener("pointercancel", endDrag);
    viewToggle.addEventListener("lostpointercapture", endDrag);
  }

  if(viewShell){
    let startX = 0, startY = 0, startP = 0;

    viewShell.addEventListener("touchstart", (e) => {
      if(e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startP = Number(getComputedStyle(document.body).getPropertyValue("--viewProgress")) || 0;
      setTransition(0);
    }, { passive: true });

    viewShell.addEventListener("touchmove", (e) => {
      if(e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;

      const dx = x - startX;
      const dy = y - startY;

      if(Math.abs(dy) > Math.abs(dx)) return;

      const delta = -dx / window.innerWidth;
      applyProgress(startP + delta);
    }, { passive: true });

    viewShell.addEventListener("touchend", () => {
      setTransition(260);
      const p = Number(getComputedStyle(document.body).getPropertyValue("--viewProgress")) || 0;
      setViewUI(p >= 0.5 ? "index" : "events");
    }, { passive: true });
  }
}



function wireIndexOpensPill(getDirectoryRows, onChange){
  wireMenuDismiss();

  const btn = $('openMatBtn');
  const panel = $('openMatMenu');
  const clearBtn = $('openMatClear');
  const listEl = $('openMatList') || panel?.querySelector('.menu__list');

  if(!btn || !panel) return;

  const items = ["ALL","SATURDAY","SUNDAY"];
  buildMenuListIn(listEl, items, state.index.opens, ()=>{
    setPillHasSelection(btn, state.index.opens.size>0);
    onChange();
  });

  setPillHasSelection(btn, state.index.opens.size>0);

  btn.addEventListener('click', (e)=>{
    e.preventDefault();
    e.stopPropagation();

    const expanded = btn.getAttribute('aria-expanded') === 'true';
    closeAllMenus();

    if(!expanded){
      btn.setAttribute('aria-expanded','true');
      positionMenu(btn, panel);
    } else {
      btn.setAttribute('aria-expanded','false');
      panel.hidden = true;
    }
  });

  clearBtn?.addEventListener('click', (e)=>{
    e.preventDefault();
    e.stopPropagation();

    state.index.opens.clear();
    setPillHasSelection(btn, false);
    panel.querySelectorAll('input.menu__checkbox').forEach(cb=>{ cb.checked = false; });
    onChange();
    closeAllMenus();
  });
}




function wireIndexGuestsPill(getDirectoryRows, onChange){
  wireMenuDismiss();

  const btn = $('guestsBtn');
  const panel = $('guestsMenu');
  const clearBtn = $('guestsClear');
  const listEl = $('guestsList') || panel?.querySelector('.menu__list');

  if(!btn || !panel) return;

  const items = ["GUESTS WELCOME"];
  buildMenuListIn(listEl, items, state.index.guests, ()=>{
    setPillHasSelection(btn, state.index.guests.size>0);
    onChange();
  });

  setPillHasSelection(btn, state.index.guests.size>0);

  btn.addEventListener('click', (e)=>{
    e.preventDefault();
    e.stopPropagation();

    const expanded = btn.getAttribute('aria-expanded') === 'true';
    closeAllMenus();

    if(!expanded){
      btn.setAttribute('aria-expanded','true');
      positionMenu(btn, panel);
    } else {
      btn.setAttribute('aria-expanded','false');
      panel.hidden = true;
    }
  });

  clearBtn?.addEventListener('click', (e)=>{
    e.preventDefault();
    e.stopPropagation();

    state.index.guests.clear();
    setPillHasSelection(btn, false);
    panel.querySelectorAll('input.menu__checkbox').forEach(cb=>{ cb.checked = false; });
    onChange();
    closeAllMenus();
  });
}


function wireIndexStatePill(getDirectoryRows, onChange){
  wireMenuDismiss();

  const btn = $('stateBtn');
  const panel = $('stateMenu');
  const clearBtn = $('stateClear');
  const listEl = $('stateList') || panel?.querySelector('.menu__list');

  if(!btn || !panel) return;

  const states = uniqStatesFromDirectory(getDirectoryRows());
  buildMenuListIn(listEl, states, state.index.states, ()=>{
    setPillHasSelection(btn, state.index.states.size>0);
    onChange();
  });

  setPillHasSelection(btn, state.index.states.size>0);

  btn.addEventListener('click', (e)=>{
    e.preventDefault();
    e.stopPropagation();

    const expanded = btn.getAttribute('aria-expanded') === 'true';
    closeAllMenus();

    if(!expanded){
      btn.setAttribute('aria-expanded','true');
      positionMenu(btn, panel);
    } else {
      btn.setAttribute('aria-expanded','false');
      panel.hidden = true;
    }
  });

  clearBtn?.addEventListener('click', (e)=>{
    e.preventDefault();
    e.stopPropagation();

    state.index.states.clear();
    setPillHasSelection(btn, false);
    panel.querySelectorAll('input.menu__checkbox').forEach(cb=>{ cb.checked = false; });
    onChange();
    closeAllMenus();
  });
}

function wireSearch(){
  const idxIn = $("searchInput");
  const evIn  = $("eventsSearchInput");

  idxIn?.addEventListener("input",(e)=>{
    setIndexQuery(e.target.value);
    render();
  });
  evIn?.addEventListener("input",(e)=>{
    setEventsQuery(e.target.value);
    render();
  });

  $("searchClear")?.addEventListener("click", ()=>{
    setIndexQuery("");
    if(idxIn) idxIn.value = "";
    render();
  });

  $("eventsSearchClear")?.addEventListener("click", ()=>{
    setEventsQuery("");
    if(evIn) evIn.value = "";
    render();
  });
}

function render(){
  const evFiltered = filterEvents(eventRows, state);
  renderEventsGroups($("eventsRoot"), evFiltered);
  $("eventsStatus").textContent = `${evFiltered.length} events`;

  let idxFiltered = filterDirectory(directoryRows, state);
  // Redundant safeguard: ensure Index STATE selection is applied even if filterDirectory is stale/cached.
  const idxStatesSel = state?.index?.states;
  if(idxStatesSel && idxStatesSel.size){
    idxFiltered = idxFiltered.filter(r => idxStatesSel.has(String(r.STATE ?? "").trim()));
  }
  renderDirectoryGroups($("groupsRoot"), idxFiltered);
  $("status").textContent = `${idxFiltered.length} gyms`;
}

async function init(){
  wireViewToggle();
  wireSearch();

  if(!state.view) state.view = "events";
  setView("events");
  state.view = "events";
  setViewUI("events");

  $("status").textContent = "Loading...";
  $("eventsStatus").textContent = "Loading...";

  const [dirRaw, evRaw] = await Promise.all([
    loadCSV("data/directory.csv"),
    loadCSV("data/events.csv").catch(()=>[])
  ]);

  directoryRows = dirRaw.map(normalizeDirectoryRow);
  eventRows = evRaw.map(normalizeEventRow);

  // Wire YEAR + STATE + EVENT filter pills (Events view)
  wireEventsYearPill(()=>eventRows, render);
  wireEventsStatePill(()=>eventRows, render);
  wireEventsTypePill(()=>eventRows, render);

  // Wire STATE + OPENS + GUESTS filter pills (Index view)
  wireIndexStatePill(()=>directoryRows, render);
  wireIndexOpensPill(()=>directoryRows, render);
  wireIndexGuestsPill(()=>directoryRows, render);

  render();
}

init().catch((err)=>{
  console.error(err);
  $("status").textContent = "Failed to load data";
  $("eventsStatus").textContent = "Failed to load data";
});
