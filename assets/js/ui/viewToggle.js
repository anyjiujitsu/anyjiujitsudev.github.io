// ui/viewToggle.js
// purpose: view state, slider UI, tab clicks, and swipe gestures

import { CUSTOMIZATION } from "../../../customization.js";
import { state, setView } from "../state.js?v=20260212-902";
import { refreshEventsPillDots } from "./pills.js?v=20260210-911";

const VIEW_LOCKED = false;

let viewShellW = 0;
let lastViewTitleMode = null; // null | "events" | "index"
let currentP = 0;             // source of truth for current progress

function setTransition(ms){
  document.body.style.setProperty("--viewTransition", ms + "ms");
}

function setViewShellW(w){
  viewShellW = Math.max(1, Number(w) || 0);
}

function getViewShellW($){
  return viewShellW || ($("viewShell")?.clientWidth) || window.innerWidth || 1;
}

function applyProgressVars($, p){
  const clamped = Math.max(0, Math.min(1, p));
  currentP = clamped;

  document.body.style.setProperty("--viewProgress", String(clamped));
  document.body.style.setProperty("--viewOffsetPx", (-getViewShellW($) * clamped) + "px");
  return clamped;
}

function applyProgress($, p){
  const clamped = applyProgressVars($, p);

  const mode = (clamped >= 0.5) ? "index" : "events";
  if(mode !== lastViewTitleMode){
    lastViewTitleMode = mode;
    const viewTitle = $("viewTitle");
    if(viewTitle) viewTitle.textContent = (mode === "index") ? "FIND TRAINING" : "EVENTS";
  }
  return clamped;
}

function setSharedPillLabels(view){
  const isIndex = view === "index";

  const pill1Btn = document.getElementById("eventsPill1Btn");
  const pill1Menu = document.getElementById("eventsPill1Menu");
  const pill1BtnLabel = pill1Btn?.querySelector('[data-pill-title]');
  const pill1MenuTitle = pill1Menu?.querySelector('.menu__title');
  if(pill1BtnLabel) pill1BtnLabel.textContent = isIndex ? "OPENS" : "YEAR";
  if(pill1MenuTitle) pill1MenuTitle.textContent = isIndex ? "OPENS" : "YEAR";
  if(pill1Menu) pill1Menu.setAttribute("aria-label", isIndex ? "Opens menu" : "Year menu");

  const wrapYear  = document.querySelector('.pillSelect[data-filter="eventsYear"]');
  const wrapState = document.querySelector('.pillSelect[data-filter="eventsState"]');
  const parent = wrapYear?.parentElement;
  if(wrapYear && wrapState && parent){
    if(isIndex){
      if(wrapState.nextElementSibling !== wrapYear) parent.insertBefore(wrapState, wrapYear);
    } else if(wrapYear.nextElementSibling !== wrapState){
      parent.insertBefore(wrapYear, wrapState);
    }
  }

  const pill3Btn = document.getElementById("eventsPill3Btn");
  const pill3Menu = document.getElementById("eventsPill3Menu");
  const pill3BtnLabel = pill3Btn?.querySelector('[data-pill-title]');
  const pill3MenuTitle = pill3Menu?.querySelector('.menu__title');
  if(pill3BtnLabel) pill3BtnLabel.textContent = isIndex ? "DROP IN" : "EVENT";
  if(pill3MenuTitle) pill3MenuTitle.textContent = isIndex ? "DROP IN" : "EVENT";
  if(pill3Menu) pill3Menu.setAttribute("aria-label", isIndex ? "Drop In menu" : "Event menu");
}

export function activeEventsState(){
  return (state.view === "index") ? state.indexEvents : state.events;
}

export function setActiveEventsQuery(val, setters){
  if(state.view === "index") setters.setIndexEventsQuery(val);
  else setters.setEventsQuery(val);
}

export function setViewUI(view, { $, onIndexViewOpen } = {}){
  setView(view);

  $("tabEvents")?.setAttribute("aria-selected", view === "events" ? "true" : "false");
  $("tabIndex")?.setAttribute("aria-selected", view === "index" ? "true" : "false");

  const evFilters = document.getElementById("eventsFilters");
  const idxFilters = document.getElementById("filters");
  if(evFilters) evFilters.hidden = false;
  if(idxFilters) idxFilters.hidden = true;

  const title = $("viewTitle");
  if(title) title.textContent = (view === "events") ? "EVENTS" : "FIND TRAINING";

  setSharedPillLabels(view);

  const evIn = $("eventsSearchInput");
  if(evIn){
    evIn.value = String(activeEventsState().q || "");
    evIn.setAttribute("placeholder", view === "index" ? "Search index" : "Search events");
  }

  if(view === "index" && typeof onIndexViewOpen === "function") onIndexViewOpen();

  const evStatus = $("eventsStatus");
  const idxStatus = $("status");
  if(evStatus) evStatus.hidden = (view !== "events");
  if(idxStatus) idxStatus.hidden = (view !== "index");

  document.title = CUSTOMIZATION.siteHeaderName || "UNDEFINED";

  setTransition(260);
  refreshEventsPillDots({ $, activeEventsState });
  applyProgress($, view === "index" ? 1 : 0);
}

export function wireViewToggle({ $, onIndexViewOpen } = {}){
  const tabEvents = $("tabEvents");
  const tabIndex  = $("tabIndex");
  const viewToggle = $("viewToggle");
  const viewShell  = $("viewShell");

  if(VIEW_LOCKED){
    setView("events");
    setViewUI("events", { $, onIndexViewOpen });
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

  tabEvents?.addEventListener("click", () => setViewUI("events", { $, onIndexViewOpen }));
  tabIndex?.addEventListener("click", () => setViewUI("index", { $, onIndexViewOpen }));

  if(viewToggle){
    let dragging = false;
    let pointerId = null;
    let downX = 0;
    let moved = false;

    viewToggle.addEventListener("pointerdown", (e) => {
      dragging = true;
      moved = false;
      downX = e.clientX;
      pointerId = e.pointerId;
      viewToggle.setPointerCapture(pointerId);
    });

    viewToggle.addEventListener("pointermove", (e) => {
      if(!dragging || e.pointerId !== pointerId) return;
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
      applyProgress($, (x - thumbW / 2) / travel);
    });

    const endDrag = (e) => {
      if(!dragging) return;
      if(e && pointerId != null && e.pointerId !== pointerId) return;

      dragging = false;
      const wasMoved = moved;
      moved = false;
      pointerId = null;

      if(!wasMoved){
        const rect = viewToggle.getBoundingClientRect();
        const x = e && typeof e.clientX === "number" ? e.clientX : (rect.left + rect.width / 2);
        const isRightHalf = x >= (rect.left + rect.width / 2);
        setTransition(260);
        setViewUI(isRightHalf ? "index" : "events", { $, onIndexViewOpen });
        return;
      }

      setTransition(260);
      setViewUI((currentP || 0) >= 0.5 ? "index" : "events", { $, onIndexViewOpen });
    };

    viewToggle.addEventListener("pointerup", endDrag);
    viewToggle.addEventListener("pointercancel", endDrag);
    viewToggle.addEventListener("lostpointercapture", endDrag);
  }

  if(viewShell){
    let startX = 0, startY = 0, startP = 0;
    let shellW = 0;
    let lastX = 0, lastT = 0, vx = 0;
    let lockedAxis = "";
    let swipeActive = false;
    let rafLoop = 0;
    let targetP = null;

    function startSwipeLoop(){
      if(rafLoop) return;
      const SWIPE_BLEND = 0.88;
      let p = currentP || startP || 0;
      const tick = () => {
        rafLoop = requestAnimationFrame(tick);
        if(targetP === null) return;
        p = p + (targetP - p) * SWIPE_BLEND;
        applyProgressVars($, p);
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
      startP = currentP || 0;
      shellW = Math.max(1, viewShell.clientWidth || 1);
      setViewShellW(shellW);
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

      if(!lockedAxis){
        if(Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        lockedAxis = (Math.abs(dx) >= Math.abs(dy)) ? "x" : "y";
      }
      if(lockedAxis === "y") return;

      if(!swipeActive){
        swipeActive = true;
        setTransition(0);
        targetP = startP;
        startSwipeLoop();
      }

      e.preventDefault();

      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      vx = (x - lastX) / dt;
      lastX = x;
      lastT = now;

      targetP = startP + (-dx / (shellW || 1));
    }, { passive: false });

    viewShell.addEventListener("touchend", () => {
      setTransition(220);
      stopSwipeLoop();
      if(targetP !== null) applyProgress($, targetP);

      const p = currentP || 0;
      const FLICK_V = 0.45;
      const EDGE_T  = 0.35;

      if(Math.abs(vx) > FLICK_V){
        setViewUI(vx < 0 ? "index" : "events", { $, onIndexViewOpen });
        return;
      }

      if(startP >= 0.5){
        setViewUI(p <= (1 - EDGE_T) ? "events" : "index", { $, onIndexViewOpen });
      } else {
        setViewUI(p >= EDGE_T ? "index" : "events", { $, onIndexViewOpen });
      }
    }, { passive: true });
  }
}
