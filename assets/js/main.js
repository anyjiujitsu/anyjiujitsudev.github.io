// main.js
// purpose: app bootstrap + data loading + render orchestration

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

// DEBUG ONLY: header/list flash instrumentation. Remove after diagnosis.
function flashDbg(label, data = {}){
  try{
    const now = performance.now().toFixed(1);
    const payload = { t: now, label, y: Math.round(window.scrollY || 0), view: state?.view || "?", ...data };
    console.log("[FLASHDBG " + now + "] " + label, payload);
    let box = document.getElementById("flashDebugPanel");
    if(!box){
      box = document.createElement("pre");
      box.id = "flashDebugPanel";
      box.setAttribute("aria-hidden", "true");
      box.style.cssText = "position:fixed;left:6px;right:6px;bottom:6px;z-index:2147483647;max-height:118px;overflow:hidden;margin:0;padding:5px 6px;background:rgba(0,0,0,.82);color:#7CFF8B;font:9px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;pointer-events:none;border-radius:8px";
      document.documentElement.appendChild(box);
    }
    const line = payload.t + " " + label + " y=" + payload.y + " view=" + payload.view + " " + JSON.stringify(data);
    const lines = box.textContent ? box.textContent.split("\n") : [];
    lines.unshift(line);
    box.textContent = lines.slice(0, 12).join("\n");
  }catch(err){ console.warn("FLASHDBG failed", err); }
}
function rectInfo(el){
  if(!el) return null;
  const r = el.getBoundingClientRect();
  return { top:Math.round(r.top), bottom:Math.round(r.bottom), height:Math.round(r.height), left:Math.round(r.left), width:Math.round(r.width) };
}
function rootInfo(root){
  if(!root) return null;
  const first = root.querySelector(".group__label, .group, .row--events, .row");
  return { childCount:root.children.length, textLen:String(root.textContent||"").length, rootRect:rectInfo(root), firstRect:rectInfo(first), html: root.innerHTML ? root.innerHTML.slice(0,90).replace(/\s+/g," ") : "EMPTY" };
}
function setupFlashDebugObservers(){
  const targets = [["header", $("header") || document.querySelector(".header")],["stickyFilters", $("stickyFilters") || document.querySelector(".stickyFilters")],["eventsSearchWrap", $("eventsSearchWrap")],["eventsSearchSuggest", $("eventsSearchSuggest")],["eventsSearchInput", $("eventsSearchInput")],["eventsRoot", $("eventsRoot")],["indexEventsRoot", $("indexEventsRoot")],["viewEvents", $("viewEvents")],["body", document.body],["html", document.documentElement]];
  const mo = new MutationObserver((mutations)=>{ for(const m of mutations){ const name = m.target?.dataset?.flashDebugName || m.target?.id || m.target?.className || m.target?.nodeName; flashDbg("mutation", { target:String(name).slice(0,60), type:m.type, attr:m.attributeName||"", added:m.addedNodes?m.addedNodes.length:0, removed:m.removedNodes?m.removedNodes.length:0, header:rectInfo($("header")||document.querySelector(".header")), sticky:rectInfo($("stickyFilters")||document.querySelector(".stickyFilters")), eventsRoot:rootInfo($("eventsRoot")) }); }});
  for(const [name, el] of targets){ if(!el) continue; try{ el.dataset.flashDebugName = name; mo.observe(el, { attributes:true, childList:true, subtree:name === "eventsRoot" || name === "indexEventsRoot" }); }catch{} }
  let lastScrollLog = 0;
  window.addEventListener("scroll", ()=>{ const now = performance.now(); if(now - lastScrollLog < 20) return; lastScrollLog = now; flashDbg("window scroll", { header:rectInfo($("header")||document.querySelector(".header")), sticky:rectInfo($("stickyFilters")||document.querySelector(".stickyFilters")), eventsRoot:rootInfo($("eventsRoot")) }); }, { passive:true });
  window.__ANYJJ_FLASH_DBG = { log:flashDbg, rectInfo, rootInfo };
  flashDbg("debug observers ready", { header:rectInfo($("header")||document.querySelector(".header")), sticky:rectInfo($("stickyFilters")||document.querySelector(".stickyFilters")), eventsRoot:rootInfo($("eventsRoot")), indexRoot:rootInfo($("indexEventsRoot")) });
}


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
  flashDbg("renderEventsView START", { eventsRootBefore: rootInfo($("eventsRoot")), header: rectInfo($("header") || document.querySelector(".header")), sticky: rectInfo($("stickyFilters") || document.querySelector(".stickyFilters")) });
  const distRes = applyDistanceFilter(
    eventRows,
    Number(state.events.distMiles) || 15,
    state.events.distFrom,
    () => {
      if(state.view === "events") renderActiveView();
    }
  );

  const evFiltered = filterEvents(distRes.rows, state);
  flashDbg("renderEventsGroups BEFORE", { count: evFiltered.length, eventsRootBefore: rootInfo($("eventsRoot")) });
  renderEventsGroups($("eventsRoot"), evFiltered);
  flashDbg("renderEventsGroups AFTER", { count: evFiltered.length, eventsRootAfter: rootInfo($("eventsRoot")) });

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
  flashDbg("renderIndexView START", { indexRootBefore: rootInfo($("indexEventsRoot")), header: rectInfo($("header") || document.querySelector(".header")), sticky: rectInfo($("stickyFilters") || document.querySelector(".stickyFilters")) });
  const distRes = applyDistanceFilter(
    directoryRows,
    Number(state.indexEvents.distMiles) || 15,
    state.indexEvents.distFrom,
    () => {
      if(state.view === "index") renderActiveView();
    }
  );

  const idxRows = distRes.rows.map(dirToIndexEventRow);
  const idxFiltered = filterIndexDirectoryAsEvents(idxRows, state.indexEvents);
  flashDbg("renderIndexEventsGroups BEFORE", { count: idxFiltered.length, indexRootBefore: rootInfo($("indexEventsRoot")) });
  renderIndexEventsGroups($("indexEventsRoot"), idxFiltered);
  flashDbg("renderIndexEventsGroups AFTER", { count: idxFiltered.length, indexRootAfter: rootInfo($("indexEventsRoot")) });

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
  flashDbg("render FULL START", { eventsRoot: rootInfo($("eventsRoot")), indexRoot: rootInfo($("indexEventsRoot")) });
  didRender = true;
  closePricingPopup();
  renderEventsView();
  renderIndexView();
  flashDbg("render FULL END", { eventsRoot: rootInfo($("eventsRoot")), indexRoot: rootInfo($("indexEventsRoot")) });
}

function renderActiveView(){
  flashDbg("renderActiveView START", { active: state.view, eventsRoot: rootInfo($("eventsRoot")), indexRoot: rootInfo($("indexEventsRoot")) });
  didRender = true;
  closePricingPopup();
  if(state.view === "index") renderIndexView();
  else renderEventsView();
  flashDbg("renderActiveView END", { active: state.view, eventsRoot: rootInfo($("eventsRoot")), indexRoot: rootInfo($("indexEventsRoot")) });
}

async function init(){
  const { applyCustomization } = await import(`../../customization.js?v=${Date.now()}`);
  applyCustomization();
  setupFlashDebugObservers();

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
    render: renderActiveView,
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
      renderActiveView();
    },
    onEventsDistanceSelectOrigin: (label) => {
      setEventsDistanceFrom(label);
      renderActiveView();
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
