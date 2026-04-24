// main.js
// purpose: app bootstrap + data loading + render orchestration

import { loadCSV, normalizeDirectoryRow, normalizeEventRow } from "./data.js?v=20260210-911";
import { state, setIndexQuery, setEventsQuery, setIndexEventsQuery, setIndexDistanceMiles, setIndexDistanceFrom } from "./state.js?v=20260212-902";
import { filterEvents } from "./filters.js?v=20260210-911";
import { renderEventsGroups, renderIndexEventsGroups } from "./render.js?v=20260210-911";

import { $ } from "./utils/dom.js?v=20260210-911";
import { applyDistanceFilter } from "./utils/geo.js?v=20260212-902";
import { initEventsPills, initIndexPills } from "./ui/pills.js?v=20260210-911";
import { wireSearch, wireSearchSuggestions } from "./ui/search.js?v=20260212-902";
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

function setSearchQueryForActiveView(val){
  setActiveEventsQuery(val, { setIndexEventsQuery, setEventsQuery });
}

function renderEventsView(){
  const evFiltered = filterEvents(eventRows, state);
  renderEventsGroups($("eventsRoot"), evFiltered);
  $("eventsStatus").textContent = `${evFiltered.length} events`;
}

function renderIndexView(){
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
  renderIndexEventsGroups($("indexEventsRoot"), idxFiltered);

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
  didRender = true;
  closePricingPopup();
  renderEventsView();
  renderIndexView();
}

async function init(){
  const { applyCustomization } = await import(`../../customization.js?v=${Date.now()}`);
  applyCustomization();

  wireViewToggle({ $, onIndexViewOpen: syncIndexDistanceUI });
  wirePricingPopup();

  wireSearch({
    $,
    setIndexQuery,
    setIndexEventsQuery,
    setActiveEventsQuery: setSearchQueryForActiveView,
    setIndexDistanceMiles,
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
    setActiveEventsQuery: setSearchQueryForActiveView,
    setIndexDistanceMiles,
    isEventsView: () => state.view === "events",
    isIndexView: () => state.view === "index",
    onIndexViewOpen: syncIndexDistanceUI,
    onIndexDistanceSelectOrigin: (label) => {
      setIndexDistanceFrom(label);
      render();
    },
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
