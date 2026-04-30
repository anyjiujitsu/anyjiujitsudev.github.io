// main.js
// purpose: app bootstrap + data loading + render orchestration

function flashDebugLog(label, data = {}){
  try{
    if(typeof window.__ANY_FLASH_DEBUG_READY === "undefined") window.__ANY_FLASH_DEBUG_READY = true;
    const stamp = (performance.now() / 1000).toFixed(3);
    const parts = Object.entries(data).map(([k,v])=>`${k}=${String(v)}`);
    const line = `${stamp} ${label}${parts.length ? " | " + parts.join(" ") : ""}`;
    window.__ANY_FLASH_LOGS = window.__ANY_FLASH_LOGS || [];
    window.__ANY_FLASH_LOGS.unshift(line);
    window.__ANY_FLASH_LOGS.length = Math.min(window.__ANY_FLASH_LOGS.length, 80);
    let box = document.getElementById("anyFlashDebugPanel");
    if(!box){
      box = document.createElement("pre");
      box.id = "anyFlashDebugPanel";
      box.setAttribute("aria-hidden", "true");
      Object.assign(box.style, {
        position: "fixed", left: "6px", right: "6px", top: "6px", maxHeight: "118px", overflow: "hidden", margin: "0", padding: "5px 6px", zIndex: "2147483647", background: "rgba(0,0,0,.78)", color: "#b9ffb9", font: "9px/1.15 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", borderRadius: "7px", whiteSpace: "pre-wrap", pointerEvents: "none"
      });
      document.documentElement.appendChild(box);
    }
    box.textContent = window.__ANY_FLASH_LOGS.slice(0, 13).join("\n");
    if(console && console.debug) console.debug("[ANY flash]", line);
  }catch(_err){}
}
function flashRect(id){
  try{ const el = document.getElementById(id) || document.querySelector(id); if(!el) return "missing"; const r = el.getBoundingClientRect(); return `${Math.round(r.top)},${Math.round(r.height)},${Math.round(r.bottom)}`; }catch(_err){ return "err"; }
}
function flashSnapshot(extra = {}){
  const evRoot = document.getElementById("eventsRoot");
  const idxRoot = document.getElementById("indexEventsRoot");
  return {
    view: state?.view || "?",
    y: Math.round(window.scrollY || 0),
    header: flashRect("header"),
    sticky: flashRect("stickyFilters"),
    evRoot: flashRect("eventsRoot"),
    idxRoot: flashRect("indexEventsRoot"),
    evKids: evRoot ? evRoot.children.length : "?",
    idxKids: idxRoot ? idxRoot.children.length : "?",
    evSearch: document.getElementById("eventsSearchInput")?.value || "",
    idxSearch: document.getElementById("searchInput")?.value || "",
    ...extra
  };
}
function initFlashObservers(){
  try{
    ["header","stickyFilters","eventsSearchWrap","eventsRoot","indexEventsRoot","eventsStatus","status"].forEach((id)=>{
      const el = document.getElementById(id);
      if(!el) return;
      const mo = new MutationObserver((list)=>{
        flashDebugLog(`mut:${id}`, flashSnapshot({ muts: list.map(m=>m.type + (m.attributeName ? ":" + m.attributeName : "")).join(",") }));
      });
      mo.observe(el, { attributes:true, childList:true, subtree: id === "eventsRoot" || id === "indexEventsRoot" || id === "stickyFilters" });
    });
    window.addEventListener("scroll", ()=> flashDebugLog("window:scroll", flashSnapshot()), { passive:true });
    flashDebugLog("debug:observersReady", flashSnapshot());
  }catch(err){ flashDebugLog("debug:observerError", { message: err?.message || err }); }
}


import { loadCSV, normalizeDirectoryRow, normalizeEventRow } from "./data.js?v=20260210-911";
import { state, setIndexQuery, setEventsQuery, setIndexEventsQuery, setIndexDistanceMiles, setIndexDistanceFrom, setEventsDistanceMiles, setEventsDistanceFrom } from "./state.js?v=20260212-902";
import { filterEvents } from "./filters.js?v=20260210-911";
import { renderEventsGroups, renderIndexEventsGroups } from "./render.js?v=20260210-911";

import { $ } from "./utils/dom.js?v=20260210-911";
import { applyDistanceFilter } from "./utils/geo.js?v=20260212-902";
import { initEventsPills, initIndexPills } from "./ui/pills.js?v=20260210-911";
import { wireSearch, wireSearchSuggestions } from "./ui/search.js?v=20260427-eventszip-directapply";
import { closePricingPopup, wirePricingPopup } from "./ui/pricing.js";
import { activeEventsState, setActiveEventsQuery, setViewUI, wireViewToggle } from "./ui/viewToggle.js";
import { dirToIndexEventRow, ensureDistanceOriginOptions, filterIndexDirectoryAsEvents, syncDistanceUIFromState } from "./indexDirectory.js";

let directoryRows = [];
let eventRows = [];
let didRender = false;

function syncIndexDistanceUI(){
  ensureDistanceOriginOptions();
  syncDistanceUIFromState($, state);
}

function syncEventsDistanceUI(){
  const distWrap = $("eventsSearchSuggestEventsDistance");
  if(!distWrap) return;
  const seg = distWrap.querySelector(".iosSeg");
  const btns = distWrap.querySelectorAll(".iosSeg__btn");
  if(seg && btns && btns.length){
    const miles = Number(state.events.distMiles || 15);
    seg.dataset.selected = String(miles);
    btns.forEach((b)=>{
      const m = Number(b.dataset.miles);
      const on = (m === miles);
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
}

function setSearchQueryForActiveView(val){
  setActiveEventsQuery(val, { setIndexEventsQuery, setEventsQuery });
}


function renderEventsView(){
  flashDebugLog("renderEventsView:start", flashSnapshot());
  const distRes = applyDistanceFilter(
    eventRows,
    Number(state.events.distMiles) || 15,
    state.events.distFrom,
    () => {
      if(state.view === "events") render();
    }
  );

  const evFiltered = filterEvents(distRes.rows, state);
  flashDebugLog("renderEventsView:beforeGroups", flashSnapshot({ filtered: evFiltered.length }));
  renderEventsGroups($("eventsRoot"), evFiltered);
  flashDebugLog("renderEventsView:afterGroups", flashSnapshot({ filtered: evFiltered.length }));

  if(distRes.active){
    const pending = Number(distRes.pending) || 0;
    $("eventsStatus").textContent = pending > 0
      ? `${evFiltered.length} events (locating ${pending}…)`
      : `${evFiltered.length} events`;
  } else {
    $("eventsStatus").textContent = `${evFiltered.length} events`;
  }
}

function renderIndexView(){
  flashDebugLog("renderIndexView:start", flashSnapshot());
  const distRes = applyDistanceFilter(
    directoryRows,
    Number(state.indexEvents.distMiles) || 15,
    state.indexEvents.distFrom,
    () => {
      if(state.view === "index") render();
    }
  );

  const idxRows = distRes.rows.map(dirToIndexEventRow);
  const idxFiltered = filterIndexDirectoryAsEvents(idxRows, state.indexEvents);
  flashDebugLog("renderIndexView:beforeGroups", flashSnapshot({ filtered: idxFiltered.length }));
  renderIndexEventsGroups($("indexEventsRoot"), idxFiltered);
  flashDebugLog("renderIndexView:afterGroups", flashSnapshot({ filtered: idxFiltered.length }));

  if(distRes.active){
    const pending = Number(distRes.pending) || 0;
    $("status").textContent = pending > 0
      ? `${idxFiltered.length} gyms (locating ${pending}…)`
      : `${idxFiltered.length} gyms`;
  } else {
    $("status").textContent = `${idxFiltered.length} gyms`;
  }
}

function render(){
  flashDebugLog("render:start", flashSnapshot());
  didRender = true;
  closePricingPopup();
  renderEventsView();
  renderIndexView();
  flashDebugLog("render:end", flashSnapshot());
}

async function init(){
  const { applyCustomization } = await import(`../../customization.js?v=${Date.now()}`);
  applyCustomization();
  initFlashObservers();

  wireViewToggle({ $, onIndexViewOpen: syncIndexDistanceUI });
  wirePricingPopup();

  wireSearch({
    $,
    setIndexQuery,
    setIndexEventsQuery,
    setActiveEventsQuery: setSearchQueryForActiveView,
    setIndexDistanceMiles,
    isIndexView: () => state.view === "index",
    isEventsView: () => state.view === "events",
    clearIndexDistance: () => {
      setIndexDistanceFrom("");
      const inZip = $("distanceOriginInput");
      if(inZip) inZip.value = "";
    },
    clearEventsDistance: () => {
      setEventsDistanceFrom("");
      const inZip = $("eventsDistanceOriginInput");
      if(inZip) inZip.value = "";
    },
    render,
  });

  wireSearchSuggestions({
    $,
    setActiveEventsQuery: setSearchQueryForActiveView,
    setIndexDistanceMiles,
    setEventsDistanceMiles,
    isEventsView: () => state.view === "events",
    isIndexView: () => state.view === "index",
    onIndexViewOpen: syncIndexDistanceUI,
    onEventsViewOpen: syncEventsDistanceUI,
    onIndexDistanceSelectOrigin: (label) => {
      setIndexDistanceFrom(label);
      render();
    },
    onEventsDistanceSelectOrigin: (label) => {
      setEventsDistanceFrom(label);
      render();
    },
    setIndexEventsQuery,
    setEventsQuery,
  });


  if(!state.view) state.view = "events";
  setViewUI(state.view, { $, onIndexViewOpen: syncIndexDistanceUI });

  $("status").textContent = "Loading...";
  $("eventsStatus").textContent = "Loading...";

  const [dirRaw, evRaw] = await Promise.all([
    loadCSV("data/directory.csv"),
    loadCSV("data/events.csv").catch(()=>[])
  ]);

  directoryRows = dirRaw.map(normalizeDirectoryRow);
  eventRows = evRaw.map(normalizeEventRow);

  initEventsPills({
    $,
    getEventRows: () => eventRows,
    activeEventsState,
    isIndexView: () => state.view === "index",
    onChange: render,
  });

  try{
    initIndexPills({
      $,
      state,
      getDirectoryRows: () => directoryRows,
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
