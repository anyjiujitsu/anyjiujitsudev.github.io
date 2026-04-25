/* section: app state
   purpose: single source of truth for UI state (no DOM access in this file) */

export const state = {
  /* section: view
     purpose: current view ("events" | "index") */
  view: "events",

  /* section: index state
     purpose: search + pills for Index view */
  index: {
    q: "",
    states: new Set(),
    opens: new Set(),  // "ALL" | "SATURDAY" | "SUNDAY"
    guests: new Set(), // e.g. "GUESTS WELCOME"
  },

  /* section: index-events state
     purpose: Events-clone pipeline for Index view (Phase 1)
     note: initially mirrors Events filters; later can diverge */
  indexEvents: {
    q: "",
    year: new Set(),
    state: new Set(),
    type: new Set(),
    /* section: index distance filter
       purpose: optional radius + origin ZIP (5 digits) for filtering directory rows */
    distMiles: 15,      // number | null
    distFrom: "",         // "#####" | ""
  },

  /* section: events state
     purpose: search + pills for Events view */
  events: {
    q: "",
    year: new Set(),
    state: new Set(),
    type: new Set(),
    /* section: events distance filter
       purpose: optional radius + origin ZIP for filtering event rows by LAT/LON */
    distMiles: 15,
    distFrom: "",
  },
};

/* section: state mutators
   purpose: small setters used by main.js and other modules */

export function setView(v){
  // section: view
  // purpose: switch between "events" and "index" (default to events if unknown)
  state.view = (v === "index") ? "index" : "events";
}

export function setIndexQuery(q){
  state.index.q = String(q ?? "");
}

export function setEventsQuery(q){
  state.events.q = String(q ?? "");
}

export function setIndexEventsQuery(q){
  state.indexEvents.q = String(q ?? "");
}

/* section: index distance mutators
   purpose: used by Index search dropdown (Training Near / Enter ZIP) */
export function setIndexDistanceMiles(miles){
  const n = (miles == null || miles === "") ? null : Number(miles);
  state.indexEvents.distMiles = Number.isFinite(n) ? n : null;
}

export function setIndexDistanceFrom(label){
  const v = String(label ?? "").trim();
  state.indexEvents.distFrom = v;
}

/* section: events distance mutators
   purpose: used by Events search dropdown (Events Near / Enter ZIP) */
export function setEventsDistanceMiles(miles){
  const n = (miles == null || miles === "") ? null : Number(miles);
  state.events.distMiles = Number.isFinite(n) ? n : null;
}

export function setEventsDistanceFrom(label){
  const v = String(label ?? "").trim();
  state.events.distFrom = v;
}

/* section: selection checks
   purpose: used for "hasSelection" indicators (dots) */

export function hasIndexSelections(){
  return state.index.q.trim().length > 0 ||
    state.index.states.size > 0 ||
    state.index.opens.size > 0 ||
    state.index.guests.size > 0 ||
    (String(state.indexEvents.distFrom || "").trim().length > 0);
}

export function hasEventsSelections(){
  return state.events.q.trim().length > 0 ||
    state.events.year.size > 0 ||
    state.events.state.size > 0 ||
    state.events.type.size > 0 ||
    (String(state.events.distFrom || "").trim().length > 0);
}
