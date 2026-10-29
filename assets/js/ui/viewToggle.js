// ui/viewToggle.js
// purpose: view state, slider UI, tab clicks, and swipe gestures

import { CUSTOMIZATION } from "../../../customization.js";
import { state, setView } from "../state.js?v=20260212-902";
import { refreshEventsPillDots } from "./pills.js?v=20260210-911";

const VIEW_LOCKED = false;

let viewShellW = 0;
let lastViewTitleMode = null; // null | "events" | "index" | "comps"
let currentP = 0;             // source of truth for current progress
let nativeTabNavigation = false;

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
  const clamped = Math.max(0, Math.min(2, p));
  currentP = clamped;

  document.body.style.setProperty("--viewProgress", String(clamped));
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

  setTransition(260);
  if(view !== "comps") refreshEventsPillDots({ $, activeEventsState });
  const destination = view === "comps" ? 2 : (view === "index" ? 1 : 0);
  if(!fromNativeScroll && !nativeTabNavigation) applyProgress($, destination);
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

  tabEvents?.addEventListener("click", () => setViewUI("events", { $, onIndexViewOpen }));
  tabIndex?.addEventListener("click", () => setViewUI("index", { $, onIndexViewOpen }));
  tabComps?.addEventListener("click", () => setViewUI("comps", { $, onIndexViewOpen }));

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
      const thumbW = trackW / 3;
      const travel = trackW - thumbW;
      const x = e.clientX - rect.left - padding;
      applyProgressVars($, 2 * (x - thumbW / 2) / travel);
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
        const third = Math.max(0, Math.min(2, Math.floor(3 * (x - rect.left) / rect.width)));
        setTransition(260);
        setViewUI(["events", "index", "comps"][third], { $, onIndexViewOpen });
        return;
      }

      setTransition(260);
      setViewUI(["events", "index", "comps"][Math.round(currentP || 0)], { $, onIndexViewOpen });
    };

    viewToggle.addEventListener("pointerup", endDrag);
    viewToggle.addEventListener("pointercancel", endDrag);
    viewToggle.addEventListener("lostpointercapture", endDrag);
  }

  if(viewShell){
    const views = ["events", "index", "comps"];
    let settleTimer = 0;
    let framePending = false;
    let lastScrollLeft = 0;
    let programmaticDestination = -1;
    let pointerDownInShell = false;

    const shellProgress = () => Math.max(0, Math.min(2,
      viewShell.scrollLeft / Math.max(1, viewShell.clientWidth)));

    // The browser moves the pages. Follow its position with the tab thumb,
    // but update the header/filter state as soon as the new page takes over.
    function syncDuringScroll(){
      framePending = false;
      const progress = shellProgress();
      setTransition(0); // The thumb must not animate behind the native scroller.
      applyProgressVars($, progress);
      const index = Math.max(0, Math.min(2, Math.round(progress)));
      if(programmaticDestination < 0 && state.view !== views[index]){
        // Do NOT snap the thumb to an integer while the finger is still moving.
        setViewUI(views[index], { $, onIndexViewOpen, fromNativeScroll:true });
      }
    }

    function scheduleSync(){
      if(!framePending){
        framePending = true;
        requestAnimationFrame(syncDuringScroll);
      }
    }

    function finishScroll(){
      clearTimeout(settleTimer);
      programmaticDestination = -1;
      nativeTabNavigation = false;
      const index = Math.max(0, Math.min(2, Math.round(shellProgress())));
      if(state.view !== views[index]){
        setViewUI(views[index], { $, onIndexViewOpen, fromNativeScroll:true });
      }
      // Use exact physical scroll progress rather than forcing a thumb jump.
      applyProgressVars($, shellProgress());
      setTransition(260);
    }

    viewShell.addEventListener("scroll", () => {
      lastScrollLeft = viewShell.scrollLeft;
      scheduleSync();
      clearTimeout(settleTimer);
      // Safari versions without scrollend still need a reliable settle signal.
      settleTimer = setTimeout(finishScroll, 180);
    }, { passive:true });
    if("onscrollend" in viewShell){
      viewShell.addEventListener("scrollend", finishScroll, { passive:true });
    }

    // Clicking a tab owns its destination until smooth scrolling finishes.
    // Native finger swipes can interrupt that programmatic navigation.
    for(const [index, tab] of [tabEvents, tabIndex, tabComps].entries()){
      tab?.addEventListener("click", () => {
        programmaticDestination = index;
        nativeTabNavigation = true;
        setTransition(0);
      }, { capture:true });
    }
    viewShell.addEventListener("touchstart", () => {
      programmaticDestination = -1;
      nativeTabNavigation = false;
      pointerDownInShell = true;
    }, {passive:true});
    viewShell.addEventListener("touchend", () => { pointerDownInShell = false; }, {passive:true});
    viewShell.addEventListener("pointerdown", e => {
      if(e.pointerType === "mouse" || e.pointerType === "pen") programmaticDestination = -1;
    }, {passive:true});
    window.addEventListener("resize", () => {
      const index = state.view === "comps" ? 2 : (state.view === "index" ? 1 : 0);
      viewShell.scrollTo({left:index * viewShell.clientWidth, behavior:"instant"});
      applyProgressVars($, index);
    }, {passive:true});
  }
}
