// main.js
// purpose: app bootstrap + data loading + view wiring + render orchestration

import { loadCSV, normalizeDirectoryRow, normalizeEventRow } from "./data.js?v=20260210-911";
import { state, setView, setIndexQuery, setEventsQuery, setIndexEventsQuery, setIndexDistanceMiles, setIndexDistanceFrom } from "./state.js?v=20260212-902";
import { filterEvents } from "./filters.js?v=20260210-911";
import { renderEventsGroups, renderIndexEventsGroups } from "./render.js?v=20260210-911";

import { $ } from "./utils/dom.js?v=20260210-911";
import { applyDistanceFilter } from "./utils/geo.js?v=20260212-902";
import {
  initEventsPills,
  initIndexPills,
  refreshEventsPillDots,
} from "./ui/pills.js?v=20260210-911";
import { wireSearch, wireSearchSuggestions } from "./ui/search.js?v=20260212-902";

let directoryRows = [];
let eventRows = [];

let didRender = false;
// View lock removed: enable slider + Index view
const VIEW_LOCKED = false;

/* ------------------ INDEX DISTANCE UI (Training Near ZIP) ------------------ */
function ensureDistanceOriginOptions(){
  // legacy stub (kept to avoid breaking callers)
  // Index now uses a 5-digit ZIP entry instead of a city datalist.
}

function syncDistanceUIFromState(){
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
  const qRaw = String(idxState?.q ?? "").trim();
  // When a ZIP is applied, we mirror it into the search bar for clarity.
  // Do NOT treat that ZIP as a text-search token.
  const q = (/^\d{5}$/.test(qRaw) && String(idxState?.distFrom || "").trim() === qRaw)
    ? ""
    : qRaw.toLowerCase();
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
    // OPENS pill (Index view repurposed from YEAR): filter by SAT/SUN availability
    if(yearSet.size){
      const hasSat = String(r.DAY || "").trim() !== "";
      const hasSun = String(r.DATE || "").trim() !== "";
      const wantSat  = yearSet.has("SATURDAY");
      const wantSun  = yearSet.has("SUNDAY");
      const wantBoth = yearSet.has("BOTH") || (wantSat && wantSun);

      if(wantBoth){
        if(!(hasSat || hasSun)) return false;
      } else {
        // Treat selections as OR when BOTH is not selected
        let ok = false;
        if(wantSat && hasSat) ok = true;
        if(wantSun && hasSun) ok = true;
        if(!ok) return false;
      }
    }
    // EVENT pill (Index view repurposed): any selection => OTA === "Y"
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

let __viewShellW = 0;
function __setViewShellW(w){ __viewShellW = Math.max(1, Number(w)||0); }
function __getViewShellW(){ return (__viewShellW || ($("viewShell")?.clientWidth) || window.innerWidth || 1); }

let __lastViewTitleMode = null; // null | "events" | "index"
let __currentP = 0;              // source of truth for current progress (avoids getComputedStyle reads)

function applyProgressVars(p){
  const clamped = Math.max(0, Math.min(1, p));
  __currentP = clamped;

  // Fast path: only update CSS variables.
  document.body.style.setProperty("--viewProgress", String(clamped));

  const w = __getViewShellW();
  const offsetPx = (-w * clamped);

  // Avoid toFixed() during swipe frames (it allocates + can be expensive on iOS).
  document.body.style.setProperty("--viewOffsetPx", offsetPx + "px");
  return clamped;
}

function applyProgress(p){
  const clamped = applyProgressVars(p);

  // Update title only when crossing the mid-point (prevents per-frame DOM churn).
  const mode = (clamped >= 0.5) ? "index" : "events";
  if(mode !== __lastViewTitleMode){
    __lastViewTitleMode = mode;
    const viewTitle = $("viewTitle");
    if(viewTitle){
      viewTitle.textContent = (mode === "index") ? "FIND TRAINING" : "EVENTS";
    }
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
  if(title) title.textContent = (view === "events") ? "EVENTS" : "FIND TRAINING";


  // Events filter bar is shared across views (Phase 1).
  // Update Pill 1 copy depending on view: Events = YEAR, Index = OPENS.
  (function(){
    const pill1Btn = document.getElementById("eventsPill1Btn");
    const pill1Menu = document.getElementById("eventsPill1Menu");
    const btnLabel = pill1Btn?.querySelector('[data-pill-title]');
    const menuTitle = pill1Menu?.querySelector('.menu__title');
    const isIndex = view === "index";
    if(btnLabel) btnLabel.textContent = isIndex ? "OPENS" : "YEAR";
    if(menuTitle) menuTitle.textContent = isIndex ? "OPENS" : "YEAR";
    if(pill1Menu) pill1Menu.setAttribute("aria-label", isIndex ? "Opens menu" : "Year menu");
  })();

  // Index view wants pill order: STATE first, OPENS second.
  // Events view keeps: YEAR first, STATE second.
  (function(){
    const wrapYear  = document.querySelector('.pillSelect[data-filter="eventsYear"]');
    const wrapState = document.querySelector('.pillSelect[data-filter="eventsState"]');
    const parent = wrapYear?.parentElement;
    if(!wrapYear || !wrapState || !parent) return;
    const isIndex = view === "index";

    // Ensure desired order by re-inserting nodes.
    // (DOM insertion moves the node; no clones.)
    if(isIndex){
      // STATE before OPENS
      if(wrapState.nextElementSibling !== wrapYear){
        parent.insertBefore(wrapState, wrapYear);
      }
    } else {
      // YEAR before STATE
      if(wrapYear.nextElementSibling !== wrapState){
        parent.insertBefore(wrapYear, wrapState);
      }
    }
  })();

  // Update Pill 3 copy depending on view: Events = EVENT, Index = DROP IN (option label = ALLOWED).
  (function(){
    const pill3Btn = document.getElementById("eventsPill3Btn");
    const pill3Menu = document.getElementById("eventsPill3Menu");
    const btnLabel = pill3Btn?.querySelector('[data-pill-title]');
    const menuTitle = pill3Menu?.querySelector('.menu__title');
    const isIndex = view === "index";
    if(btnLabel) btnLabel.textContent = isIndex ? "DROP IN" : "EVENT";
    if(menuTitle) menuTitle.textContent = isIndex ? "DROP IN" : "EVENT";
    if(pill3Menu) pill3Menu.setAttribute("aria-label", isIndex ? "Drop In menu" : "Event menu");
  })();

  const evIn = $("eventsSearchInput");
  if(evIn) evIn.value = String(activeEventsState().q || "");

  // Per-view helper text for the shared search bar
  if(evIn) evIn.setAttribute("placeholder", view === "index" ? "Search index" : "Search events");

  // Search suggestion panel: Events uses Quick Searches; Index uses Distance From
  // (panel is opened on focus/click when input is empty)
  if(view === "index"){
    ensureDistanceOriginOptions();
    syncDistanceUIFromState();
  }

  // Header counts
  const evStatus = $("eventsStatus");
  const idxStatus = $("status");
  if(evStatus) evStatus.hidden = (view !== "events");
  if(idxStatus) idxStatus.hidden = (view !== "index");

  document.title = "ANY N.E. GRAPPLING";

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
    let downX = 0;
    let moved = false;

    viewToggle.addEventListener("pointerdown", (e) => {
      // Treat pointerdown as a potential "tap". We only enter drag-mode after a small move.
      dragging = true;
      moved = false;
      downX = e.clientX;
      pointerId = e.pointerId;
      viewToggle.setPointerCapture(pointerId);
    });

    viewToggle.addEventListener("pointermove", (e) => {
      if(!dragging || e.pointerId !== pointerId) return;

      // Only start dragging after a tiny movement threshold.
      if(!moved){
        if(Math.abs(e.clientX - downX) < 6) return;
        moved = true;
        setTransition(0);
      }

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
      const wasMoved = moved;
      moved = false;
      pointerId = null;

      // If the user didn't drag, treat this as a tap/click and animate the view change.
      if(!wasMoved){
        const rect = viewToggle.getBoundingClientRect();
        const x = e && typeof e.clientX === "number" ? e.clientX : (rect.left + rect.width / 2);
        const isRightHalf = x >= (rect.left + rect.width / 2);
        setTransition(260);
        setViewUI(isRightHalf ? "index" : "events");
        return;
      }

      setTransition(260);
      const p = __currentP || 0;
      setViewUI(p >= 0.5 ? "index" : "events");
    };

    viewToggle.addEventListener("pointerup", endDrag);
    viewToggle.addEventListener("pointercancel", endDrag);
    viewToggle.addEventListener("lostpointercapture", endDrag);
  }

  if(viewShell){
    let startX = 0, startY = 0, startP = 0;
    let shellW = 0;
    let lastX = 0, lastT = 0, vx = 0;
    let lockedAxis = ""; // "", "x", "y"
    let swipeActive = false;
    let rafLoop = 0;
    let targetP = null;

    function startSwipeLoop(){
      if(rafLoop) return;

      // Tiny blend factor smooths micro-jitter from uneven touchmove cadence on iOS.
      // Closer to 1 = tighter finger tracking; lower = smoother (but more lag).
      const SWIPE_BLEND = 0.88;

      let p = __currentP || startP || 0;

      const tick = () => {
        rafLoop = requestAnimationFrame(tick);
        if(targetP === null) return;

        // Smooth toward the latest target.
        p = p + (targetP - p) * SWIPE_BLEND;

        applyProgressVars(p);
      };

      rafLoop = requestAnimationFrame(tick);
    }

function stopSwipeLoop(){

      if(rafLoop){
        cancelAnimationFrame(rafLoop);
        rafLoop = 0;
      }
    }
    viewShell.addEventListener("touchstart", (e) => {
      if(e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startP = __currentP || 0;
      shellW = Math.max(1, viewShell.clientWidth || 1);
      __setViewShellW(shellW);

      lastX = startX;
      lastT = performance.now();
      vx = 0;
      lockedAxis = "";
      swipeActive = false;
      stopSwipeLoop();
      targetP = null;
    }, { passive: true });

    viewShell.addEventListener("touchmove", (e) => {
      if(e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;

      const dx = x - startX;
      const dy = y - startY;

      // Deadzone + axis lock to avoid jitter from tiny diagonal movement
      if(!lockedAxis){
        if(Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        lockedAxis = (Math.abs(dx) >= Math.abs(dy)) ? "x" : "y";
      }
      if(lockedAxis === "y") return;

      // We're committing to a horizontal swipe; disable transition for buttery tracking.
      if(!swipeActive){
        swipeActive = true;
        setTransition(0);
        targetP = startP;
        startSwipeLoop();
      }

      // Prevent the page from trying to scroll while we are swiping horizontally
      e.preventDefault();

      // Velocity (px/ms) for "quick flick" commits
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      vx = (x - lastX) / dt;
      lastX = x;
      lastT = now;

      const denom = shellW || 1;
      const delta = -dx / denom;
      const nextP = startP + delta;

      // Set the target progress; a dedicated rAF loop will keep frames smooth even if touchmove events arrive unevenly.
      targetP = nextP;
    }, { passive: false });

    viewShell.addEventListener("touchend", () => {
      setTransition(220);

      // Stop the continuous swipe loop and sync the last target before we decide which view to commit.
      stopSwipeLoop();
      if(targetP !== null){
        applyProgress(targetP);
      }

      const p = __currentP || 0;

      // More sensitive commit: shorter swipe distance + quick flick support
      const FLICK_V = 0.45; // px/ms
      const EDGE_T  = 0.35; // distance from edge to switch

      // Quick flick wins (left = index, right = events)
      if(Math.abs(vx) > FLICK_V){
        setViewUI(vx < 0 ? "index" : "events");
        return;
      }

      // Otherwise: commit based on how far you pulled from the *starting* view edge
      if(startP >= 0.5){
        // started on index (p ~ 1) -> switch earlier when p drops below 1-EDGE_T
        setViewUI(p <= (1 - EDGE_T) ? "events" : "index");
      }else{
        // started on events (p ~ 0) -> switch earlier when p rises above EDGE_T
        setViewUI(p >= EDGE_T ? "index" : "events");
      }
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

  // Index view: render Directory rows using Events-style cards
  // Optional distance filter (Distance From dropdown)
  // Source of truth for miles: the visible iOS segmented control (prevents state/module mismatch issues)
  const seg = document.querySelector("#eventsSearchSuggestDistance .iosSeg");
  const uiMiles = Number(seg?.dataset?.selected);
  const miles = Number.isFinite(uiMiles) ? uiMiles : (Number(state.indexEvents.distMiles) || 15);
  state.indexEvents.distMiles = miles;

  const distRes = applyDistanceFilter(
    directoryRows,
    miles,
    state.indexEvents.distFrom,
    () => {
      // re-render as geocoding results arrive
      if(state.view === "index") render();
    }
  );
const idxRows = distRes.rows.map(dirToIndexEventRow);
  const idxFiltered = filterIndexDirectoryAsEvents(idxRows, state.indexEvents);
  renderIndexEventsGroups($("indexEventsRoot"), idxFiltered);

  // status copy: show pending geocodes if distance filter is active
  if(distRes.active){
    const pending = Number(distRes.pending) || 0;
    $("status").textContent = pending > 0
      ? `${idxFiltered.length} gyms (locating ${pending}…)`
      : `${idxFiltered.length} gyms`;
  } else {
    $("status").textContent = `${idxFiltered.length} gyms`;
  }
}

/* ------------------ INIT ------------------ */
async function init(){
  wireViewToggle();

  wireSearch({
    setIndexDistanceMiles,
    $,
    setIndexQuery,
    setIndexEventsQuery,
    setActiveEventsQuery,
    isIndexView: () => state.view === "index",
    clearIndexDistance: () => {
      setIndexDistanceFrom("");
      const inZip = $("distanceOriginInput");
      if(inZip) inZip.value = "";
    },
    render,
  });
  wireSearchSuggestions({
    $,
    setActiveEventsQuery,
    isEventsView: () => state.view === "events",
    isIndexView: () => state.view === "index",
    onIndexViewOpen: () => {
      ensureDistanceOriginOptions();
      syncDistanceUIFromState();
    },
    onIndexDistanceSelectOrigin: (label) => {
      setIndexDistanceFrom(label);
      render();
    },
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
