import { loadCSV, normalizeDirectoryRow, normalizeEventRow } from "./data.js?v=20260202-321";
import { state, setView, setIndexQuery, setEventsQuery } from "./state.js?v=20260202-321";
import { filterDirectory, filterEvents } from "./filters.js?v=20260202-321";
import { renderDirectoryGroups, renderEventsGroups } from "./render.js?v=20260202-321";

/* section: data caches
   purpose: hold raw/normalized CSV rows in-memory for filtering + render */
let directoryRows = [];
let eventRows = [];

/* section: app mode
   purpose: temporarily force the Events view while Index is being rebuilt */
const VIEW_LOCKED = true;

/* section: DOM helpers
   purpose: small utilities for consistent element access */
function $(id){ return document.getElementById(id); }

/* section: events parsing
   purpose: derive menu values (YEAR/STATE/TYPE) from event rows */
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

/* section: directory parsing
   purpose: derive menu values (STATE) from directory rows */
function uniqStatesFromDirectory(rows){
  const set = new Set();
  rows.forEach(r=>{
    const s = String(r.STATE ?? "").trim();
    if(s) set.add(s);
  });
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}

/* section: pill menus
   purpose: shared menu build/position/dismiss behavior for all pills */
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

  panelEl.hidden = false; // must be visible to measure

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

/* section: menu list builder
   purpose: render checkbox list into a given container element */
function ensureMenuList(panelEl){
  if(!panelEl) return null;
  let listEl = panelEl.querySelector('.menu__list');
  if(listEl) return listEl;

  // If the menu was scaffolded with a placeholder (e.g., "Coming soon"), remove it
  panelEl.querySelectorAll('.menu__empty').forEach(n=>n.remove());

  listEl = document.createElement('div');
  listEl.className = 'menu__list';
  panelEl.appendChild(listEl);
  return listEl;
}

function buildMenuListIn(listEl, items, selectedSet, onChange){
  if(!listEl) return;
  // Only clear/inject inside the checkbox list container (never the whole menu panel)
  if(!listEl.classList.contains('menu__list')) return;

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

/* section: pill wiring (events)
   purpose: YEAR / STATE / TYPE checkbox pills on the Events view */
function wireEventsYearPill(getEventRows, onChange){
  wireMenuDismiss();

  const btn = $('eventsPill1Btn');
  const panel = $('eventsPill1Menu');
  const clearBtn = $('eventsPill1Clear');
  if(!btn || !panel) return;

  const listEl = ensureMenuList(panel);
  const years = uniqYearsFromEvents(getEventRows());
  buildMenuListIn(listEl, years, state.events.year, ()=>{
    setPillHasSelection(btn, state.events.year.size > 0);
    onChange();
  });
  setPillHasSelection(btn, state.events.year.size > 0);

  const toggle = (e)=>{
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

  btn.addEventListener('click', toggle);
  btn.addEventListener('touchend', toggle, { passive:false });

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

  const listEl = ensureMenuList(panel);
  const states = uniqStatesFromEvents(getEventRows());
  buildMenuListIn(listEl, states, state.events.state, ()=>{
    setPillHasSelection(btn, state.events.state.size > 0);
    onChange();
  });
  setPillHasSelection(btn, state.events.state.size > 0);

  const toggle = (e)=>{
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

  btn.addEventListener('click', toggle);
  btn.addEventListener('touchend', toggle, { passive:false });

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

  const listEl = ensureMenuList(panel);
  const types = uniqTypesFromEvents(getEventRows());
  buildMenuListIn(listEl, types, state.events.type, ()=>{
    setPillHasSelection(btn, state.events.type.size > 0);
    onChange();
  });
  setPillHasSelection(btn, state.events.type.size > 0);

  const toggle = (e)=>{
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

  btn.addEventListener('click', toggle);
  btn.addEventListener('touchend', toggle, { passive:false });

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

/* section: view toggle UI
   purpose: sync view state + UI (and optionally lock to Events) */
function setTransition(ms){
  document.body.style.setProperty("--viewTransition", ms + "ms");
}

function applyProgress(p){
  const clamped = Math.max(0, Math.min(1, p));
  document.body.style.setProperty("--viewProgress", String(clamped));

  const viewTitle = $("viewTitle");
  if(viewTitle){
    viewTitle.textContent = (clamped >= 0.5) ? "INDEX" : "EVENTS (DEV)";
  }
  return clamped;
}

function setViewUI(view){
  setView(view);

  $("tabEvents")?.setAttribute("aria-selected", view === "events" ? "true" : "false");
  $("tabIndex")?.setAttribute("aria-selected", view === "index" ? "true" : "false");

  const evFilters  = $("eventsFilters");
  const idxFilters = $("filters");
  if(evFilters)  evFilters.hidden  = (view !== "events");
  if(idxFilters) idxFilters.hidden = (view !== "index");

  const title = $("viewTitle");
  if(title) title.textContent = (view === "events") ? "EVENTS (DEV)" : "INDEX";

  const evStatus  = $("eventsStatus");
  const idxStatus = $("status");
  if(evStatus)  evStatus.hidden  = (view !== "events");
  if(idxStatus) idxStatus.hidden = (view !== "index");

  document.title = "ANY N.E. GRAPPLING (DEV)";

  setTransition(260);
  applyProgress(view === "index" ? 1 : 0);
}

function wireViewToggle(){
  const tabEvents = $("tabEvents");
  const tabIndex  = $("tabIndex");
  const viewToggle = $("viewToggle");
  const viewShell  = $("viewShell");

  if(VIEW_LOCKED){
    setView("events");
    setViewUI("events");

    if(viewToggle){
      viewToggle.classList.add("viewToggle--locked");
      viewToggle.setAttribute("aria-disabled", "true");
    }
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

    const computeProgressFromX = (clientX)=>{
      const rect = viewToggle.getBoundingClientRect();
      const padding = 4;
      const trackW = rect.width - padding * 2;
      const thumbW = trackW / 2;
      const travel = trackW - thumbW;

      const x = clientX - rect.left - padding;
      return (x - thumbW / 2) / travel;
    };

    viewToggle.addEventListener("pointerdown", (e) => {
      dragging = true;
      pointerId = e.pointerId;
      viewToggle.setPointerCapture(pointerId);
      setTransition(0);
      applyProgress(computeProgressFromX(e.clientX));
    });

    viewToggle.addEventListener("pointermove", (e) => {
      if(!dragging || e.pointerId !== pointerId) return;
      applyProgress(computeProgressFromX(e.clientX));
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

/* section: pill wiring (index)
   purpose: STATE / OPENS / GUESTS checkbox pills on the Index view */
function wireIndexOpensPill(getDirectoryRows, onChange){
  wireMenuDismiss();

  const btn = $('openMatBtn');
  const panel = $('openMatMenu');
  const clearBtn = $('openMatClear');
  if(!btn || !panel) return;

  const listEl = $('openMatList') || ensureMenuList(panel);
  const items = ["ALL","SATURDAY","SUNDAY"];

  buildMenuListIn(listEl, items, state.index.opens, ()=>{
    setPillHasSelection(btn, state.index.opens.size > 0);
    onChange();
  });
  setPillHasSelection(btn, state.index.opens.size > 0);

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
  if(!btn || !panel) return;

  const listEl = $('guestsList') || ensureMenuList(panel);
  const items = ["GUESTS WELCOME"];

  buildMenuListIn(listEl, items, state.index.guests, ()=>{
    setPillHasSelection(btn, state.index.guests.size > 0);
    onChange();
  });
  setPillHasSelection(btn, state.index.guests.size > 0);

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
  if(!btn || !panel) return;

  const listEl = $('stateList') || ensureMenuList(panel);
  const states = uniqStatesFromDirectory(getDirectoryRows());

  buildMenuListIn(listEl, states, state.index.states, ()=>{
    setPillHasSelection(btn, state.index.states.size > 0);
    onChange();
  });
  setPillHasSelection(btn, state.index.states.size > 0);

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

/* section: search wiring
   purpose: keep search inputs in sync with state and re-render */
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

/* section: render
   purpose: apply filters then render both views (and update counts) */
function render(){
  const evFiltered = filterEvents(eventRows, state);
  renderEventsGroups($("eventsRoot"), evFiltered);
  $("eventsStatus").textContent = `${evFiltered.length} events`;

  let idxFiltered = filterDirectory(directoryRows, state);

  // section: index safety
  // purpose: ensure Index STATE selection is applied even if filterDirectory is stale/cached
  const idxStatesSel = state?.index?.states;
  if(idxStatesSel && idxStatesSel.size){
    idxFiltered = idxFiltered.filter(r => idxStatesSel.has(String(r.STATE ?? "").trim()));
  }

  renderDirectoryGroups($("groupsRoot"), idxFiltered);
  $("status").textContent = `${idxFiltered.length} gyms`;
}

/* section: init
   purpose: wire UI, load CSV, normalize rows, then render */
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

  wireEventsYearPill(()=>eventRows, render);
  wireEventsStatePill(()=>eventRows, render);
  wireEventsTypePill(()=>eventRows, render);

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
