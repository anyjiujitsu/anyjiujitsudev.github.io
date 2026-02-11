// main.js
// purpose: app bootstrap + data loading + view wiring + render orchestration

import { loadCSV, normalizeDirectoryRow, normalizeEventRow } from "./data.js?v=20260210-900";
import { state, setView, setIndexQuery, setEventsQuery, setIndexEventsQuery } from "./state.js?v=20260210-900";
import { filterEvents } from "./filters.js?v=20260210-900";
import { renderEventsGroups, renderIndexEventsGroups } from "./render.js?v=20260210-900";

import { $ } from "./utils/dom.js?v=20260210-900";
import {
  initEventsPills,
  initIndexPills,
  refreshEventsPillDots,
} from "./ui/pills.js?v=20260210-900";
import { wireSearch, wireSearchSuggestions } from "./ui/search.js?v=20260210-900";

let directoryRows = [];
let eventRows = [];

let didRender = false;
// View lock removed: enable slider + Index view
const VIEW_LOCKED = false;

/* ------------------ INDEX REMAP (directory.csv -> events-style rows) ------------------ */
function dirToIndexEventRow(r){
  return {
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
}

function filterIndexDirectoryAsEvents(rows, idxState){
  const q = String(idxState?.q ?? "").trim().toLowerCase();
  const stateSet = idxState?.state instanceof Set ? idxState.state : new Set();
  const typeSet  = idxState?.type  instanceof Set ? idxState.type  : new Set();
  const yearSet  = idxState?.year  instanceof Set ? idxState.year  : new Set();

  return rows.filter(r=>{
    if(q){
      const hay = `${r.EVENT} ${r.FOR} ${r.WHERE} ${r.CITY} ${r.STATE} ${r.DAY} ${r.DATE} ${r.OTA}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(stateSet.size){
      const s = String(r.STATE || "").trim().toUpperCase();
      if(!stateSet.has(s)) return false;
    }
    // YEAR pill does not apply to directory rows (SAT/SUN are not dates)
    if(yearSet.size){ /* ignore safely */ }
    // EVENT pill redirected to OTA
    // Any active selection means OTA === "Y"
    if(typeSet.size){
      const ota = String(r.OTA || "").trim().toUpperCase();
      if(ota !== "Y") return false;
    }
    return true;
  });
}

function activeEventsState(){
  return (state.view === "index") ? state.indexEvents : state.events;
}

function setActiveEventsQuery(val){
  if(state.view === "index") setIndexEventsQuery(val);
  else setEventsQuery(val);
}

/* ------------------ VIEW TOGGLE ------------------ */
function setTransition(ms){
  document.body.style.setProperty("--viewTransition", ms + "ms");
}

function applyProgress(p){
  const clamped = Math.max(0, Math.min(1, p));
  document.body.style.setProperty("--viewProgress", String(clamped));
  const viewTitle = $("viewTitle");
  if(viewTitle){
    viewTitle.textContent = (clamped >= 0.5) ? "INDEX (DEV)" : "EVENTS (DEV)";
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
  if(evFilters) evFilters.hidden = false;
  if(idxFilters) idxFilters.hidden = true;
  // Phase 1: Index uses Events filter bar for a 1:1 UI match

  const title = $("viewTitle");
  if(title) title.textContent = (view === "events") ? "EVENTS (DEV)" : "INDEX";

  const evIn = $("eventsSearchInput");
  if(evIn) evIn.value = String(activeEventsState().q || "");

  // Header counts
  const evStatus = $("eventsStatus");
  const idxStatus = $("status");
  if(evStatus) evStatus.hidden = (view !== "events");
  if(idxStatus) idxStatus.hidden = (view !== "index");

  document.title = "ANY N.E. GRAPPLING (DEV)";

  setTransition(260);
  refreshEventsPillDots({ $, activeEventsState });
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

/* ------------------ RENDER ------------------ */
function render(){
  didRender = true;

  // Events view
  const evFiltered = filterEvents(eventRows, state);
  renderEventsGroups($("eventsRoot"), evFiltered);
  $("eventsStatus").textContent = `${evFiltered.length} events`;

  // Index view (Phase 2): render Directory rows using Events-style cards
  const idxRows = directoryRows.map(dirToIndexEventRow);
  const idxFiltered = filterIndexDirectoryAsEvents(idxRows, state.indexEvents);
  renderIndexEventsGroups($("indexEventsRoot"), idxFiltered);
  $("status").textContent = `${idxFiltered.length} events`;
}

/* ------------------ INIT ------------------ */
async function init(){
  wireViewToggle();

  wireSearch({
    $,
    setIndexQuery,
    setIndexEventsQuery,
    setActiveEventsQuery,
    render,
  });
  wireSearchSuggestions({
    $,
    setActiveEventsQuery,
  });

  if(!state.view) state.view = "events";
  setViewUI(state.view);

  $("status").textContent = "Loading...";
  $("eventsStatus").textContent = "Loading...";

  const [dirRaw, evRaw] = await Promise.all([
    loadCSV("data/directory.csv"),
    loadCSV("data/events.csv").catch(()=>[])
  ]);

  directoryRows = dirRaw.map(normalizeDirectoryRow);
  eventRows = evRaw.map(normalizeEventRow);

  // Events pills
  initEventsPills({
    $,
    getEventRows: ()=>eventRows,
    activeEventsState,
    isIndexView: ()=> state.view === "index",
    onChange: render,
  });

  // Index pills (kept defensive)
  try{
    initIndexPills({
      $,
      state,
      getDirectoryRows: ()=>directoryRows,
      onChange: render,
    });
  }catch(err){
    console.warn("Index pill wiring skipped:", err);
  }

  render();
}

init().catch((err)=>{
  console.error(err);
  if(didRender) return;
  $("status").textContent = "Failed to load data";
  $("eventsStatus").textContent = "Failed to load data";
});
