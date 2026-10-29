// ui/viewToggle.js
// purpose: view state, slider UI, tab clicks, and swipe gestures

import { CUSTOMIZATION } from "../../../customization.js";
import { state, setView } from "../state.js?v=20260212-902";
import { refreshEventsPillDots } from "./pills.js?v=20260210-911";

const VIEW_LOCKED = false;

let viewShellW = 0;
let lastViewTitleMode = null; // null | "events" | "index" | "comps"
let currentP = 0;             // source of truth for current progress


function setTransition(ms){
  // Keep transition invalidation inside the navigation control.
  document.getElementById("viewToggle")?.style.setProperty("--viewTransition", ms + "ms");
}

function setViewShellW(w){
  viewShellW = Math.max(1, Number(w) || 0);
}

function getViewShellW($){
  return viewShellW || ($("viewShell")?.clientWidth) || window.innerWidth || 1;
}

function applyProgressVars($, p){
  const clamped = Math.max(0, Math.min(2, p));
  currentP = clamped;

  // Changing this on body invalidates styles across every match row.
  // The thumb is the only consumer, so scope it to the tiny nav subtree.
  const toggle = $("viewToggle");
  if(toggle) toggle.style.setProperty("--viewProgress", String(clamped));
  // Native scroll-snap owns the panel position; only the tab thumb follows progress.
  return clamped;
}

function applyProgress($, p){
  const clamped = applyProgressVars($, p);

  const mode = clamped >= 1.5 ? "comps" : (clamped >= 0.5 ? "index" : "events");
  if(mode !== lastViewTitleMode){
    lastViewTitleMode = mode;
    const viewTitle = $("viewTitle");
    if(viewTitle) viewTitle.textContent = (mode === "comps") ? "COMPS" : (mode === "index" ? "FIND TRAINING" : "EVENTS");
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

export function setViewUI(view, { $, onIndexViewOpen, fromNativeScroll = false } = {}){
  const previousView = state.view;
  setView(view);
  if(view === "comps" && !window.__compsModuleStarted){
    window.__compsModuleStarted = true;
    const academyToggle = document.getElementById("academyToggle");
    const academyMenu = document.getElementById("academyMenu");
    if(academyToggle && academyMenu && !academyToggle.dataset.embeddedPositionWired){
      academyToggle.dataset.embeddedPositionWired = "true";
      const position = () => {
        if(window.innerWidth > 680 || academyMenu.hidden) return;
        const vp = window.visualViewport;
        academyMenu.style.left = `${(vp?.offsetLeft || 0) + 8}px`;
        academyMenu.style.right = "auto";
        academyMenu.style.width = `${Math.max(200, (vp?.width || window.innerWidth) - 16)}px`;
        academyMenu.style.top = `${academyToggle.getBoundingClientRect().bottom + 7}px`;
      };
      academyToggle.addEventListener("click", () => requestAnimationFrame(position));
      window.addEventListener("resize", position);
      window.addEventListener("scroll", position, {passive:true});
      window.visualViewport?.addEventListener("resize", position);
      window.visualViewport?.addEventListener("scroll", position);
    }
    import("../../../opens/opens.js").catch(error => {
      window.__compsModuleStarted = false;
      const status = document.getElementById("bostonStatus");
      if(status) status.textContent = `Could not load COMPS: ${error.message}`;
      console.error(error);
    });
  }

  $("tabComps")?.setAttribute("aria-selected", view === "comps" ? "true" : "false");
  $("tabEvents")?.setAttribute("aria-selected", view === "events" ? "true" : "false");
  $("tabIndex")?.setAttribute("aria-selected", view === "index" ? "true" : "false");

  const evFilters = document.getElementById("eventsFilters");
  const idxFilters = document.getElementById("filters");
  if(evFilters) evFilters.hidden = view === "comps";
  const compsFilters = document.getElementById("compsFilters");
  if(compsFilters) compsFilters.hidden = view !== "comps";
  if(idxFilters) idxFilters.hidden = true;

  const title = $("viewTitle");
  if(title) title.textContent = (view === "events") ? "EVENTS" : (view === "comps" ? "COMPS" : "FIND TRAINING");

  if(view !== "comps") setSharedPillLabels(view);

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
  const compsStatus = $("compsActiveStatus");
  if(compsStatus) compsStatus.hidden = (view !== "comps");

  document.title = CUSTOMIZATION.siteHeaderName || "UNDEFINED";

  setTransition(0); // Native scroll progress moves the thumb; never animate it independently.
  if(view !== "comps") refreshEventsPillDots({ $, activeEventsState });
  const destination = view === "comps" ? 2 : (view === "index" ? 1 : 0);
  // Progress always follows viewShell.scrollLeft; do not jump the thumb ahead.
  if(!fromNativeScroll){
    const shell = $("viewShell");
    if(shell){
      const target = destination * shell.clientWidth;
      if(Math.abs(shell.scrollLeft - target) > 1){
        // The browser animates button-triggered navigation; touch swipes remain native.
        shell.scrollTo({ left: target, behavior: "smooth" });
      }
    }
  }

  // Reset only the destination list. Keep the fixed header and filter bar
  // completely outside scrolling, so switching cannot repaint the page shell.
  if(previousView !== state.view){
    const panelId = view === "comps" ? "viewComps" : (view === "index" ? "viewIndex" : "viewEvents");
    const panel = $(panelId);
    if(panel) panel.scrollTop = 0;
  }

}

export function wireViewToggle({ $, onIndexViewOpen } = {}){
  const tabEvents = $("tabEvents");
  const tabIndex  = $("tabIndex");
  const tabComps = $("tabComps");
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

  // A single route for tab clicks. The thumb only follows the physical scroll.
  const views = ["events", "index", "comps"];
  const tabs = [tabEvents, tabIndex, tabComps];
  let suppressClick = false;
  let suppressTimer = 0;
  function goTo(index){
    index = Math.max(0, Math.min(2, index));
    if(viewShell){
      const target = index * viewShell.clientWidth;
      if(Math.abs(viewShell.scrollLeft - target) > 1){
        viewShell.scrollTo({left:target, behavior:"smooth"});
      }else if(state.view !== views[index]){
        setViewUI(views[index], { $, onIndexViewOpen, fromNativeScroll:true });
      }
    } else {
      setViewUI(views[index], { $, onIndexViewOpen });
    }
  }
  for(const [index, tab] of tabs.entries()){
    tab?.addEventListener("click", e => {
      if(suppressClick){ e.preventDefault(); return; }
      goTo(index);
    });
  }

  // Dragging the top selector also moves the *real native scroller*.
  // Do not move a simulated thumb separately from the pages.
  if(viewToggle && viewShell){
    let downX = 0, pointerId = null, dragging = false, startScrollLeft = 0;
    let previousSnap = "";
    viewToggle.addEventListener("pointerdown", e => {
      if(e.button !== 0) return;
      pointerId = e.pointerId;
      downX = e.clientX;
      startScrollLeft = viewShell.scrollLeft;
      dragging = false;
    });
    viewToggle.addEventListener("pointermove", e => {
      if(e.pointerId !== pointerId) return;
      const dx = e.clientX - downX;
      if(!dragging){
        if(Math.abs(dx) < 7) return;
        dragging = true;
        previousSnap = viewShell.style.scrollSnapType;
        viewShell.style.scrollSnapType = "none";
        try { viewToggle.setPointerCapture(pointerId); } catch(_) {}
      }
      const thumbRange = Math.max(1, viewToggle.getBoundingClientRect().width * (2/3));
      const progressDx = (dx / thumbRange) * 2;
      viewShell.scrollLeft = Math.max(0, Math.min(2 * viewShell.clientWidth,
        startScrollLeft + progressDx * viewShell.clientWidth));
    });
    const finishDrag = e => {
      if(e?.pointerId !== pointerId) return;
      pointerId = null;
      if(!dragging) return;
      dragging = false;
      viewShell.style.scrollSnapType = previousSnap;
      // Synthetic click from releasing a drag must not launch a second navigation.
      suppressClick = true;
      clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => { suppressClick = false; }, 100);
      const index = Math.max(0, Math.min(2, Math.round(viewShell.scrollLeft / Math.max(1,viewShell.clientWidth))));
      goTo(index);
    };
    viewToggle.addEventListener("pointerup", finishDrag);
    viewToggle.addEventListener("pointercancel", finishDrag);
    viewToggle.addEventListener("lostpointercapture", finishDrag);
  }

  if(viewShell){
    let settleTimer = 0;
    let framePending = false;
    let lastCommittedView = state.view;
    const progress = () => Math.max(0, Math.min(2,
      viewShell.scrollLeft / Math.max(1, viewShell.clientWidth)));
    function sync(){
      framePending = false;
      const p = progress();
      applyProgressVars($, p);
      const index = Math.max(0, Math.min(2, Math.round(p)));
      if(lastCommittedView !== views[index] || state.view !== views[index]){
        lastCommittedView = views[index];
        setViewUI(views[index], { $, onIndexViewOpen, fromNativeScroll:true });
      }
    }
    const scheduleSync = () => {
      if(!framePending){ framePending = true; requestAnimationFrame(sync); }
    };
    const finishScroll = () => {
      clearTimeout(settleTimer);
      scheduleSync();
    };
    viewShell.addEventListener("scroll", () => {
      scheduleSync();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(finishScroll, 150);
    }, {passive:true});
    if("onscrollend" in viewShell) viewShell.addEventListener("scrollend", finishScroll, {passive:true});
    window.addEventListener("resize", () => {
      const index = Math.max(0, views.indexOf(state.view));
      viewShell.scrollTo({left:index * viewShell.clientWidth, behavior:"instant"});
      scheduleSync();
    }, {passive:true});
    setTransition(0);
    scheduleSync();
  }
}
