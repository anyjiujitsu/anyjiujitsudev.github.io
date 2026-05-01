// ui/search.js
// purpose: wire search inputs + search suggestion UX


/* DEBUG ONLY: suggestion-selection row/header flash tracer */
function ensureZipSuggestionFlashDebug(){
  if(typeof window === "undefined" || window.__anyZipSuggestionFlashDebug) return window.__anyZipSuggestionFlashDebug;
  const state = { rows: [], rafs: 0, lastZipChangeAt: 0, lastBreach: "LAST BREACH: none" };
  function panel(){
    let el = document.getElementById("zipSuggestionFlashDebugPanel");
    if(!el){
      el = document.createElement("div");
      el.id = "zipSuggestionFlashDebugPanel";
      el.style.cssText = [
        "position:fixed", "left:6px", "right:6px", "top:calc(env(safe-area-inset-top, 0px) + 6px)", "z-index:2147483647",
        "max-height:92px", "overflow:hidden", "background:rgba(0,0,0,.84)", "color:#d8ffd8",
        "font:9px/1.16 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace", "padding:4px 6px",
        "border-radius:8px", "pointer-events:none", "white-space:pre-wrap", "box-shadow:0 2px 14px rgba(0,0,0,.35)"
      ].join(";");
      document.documentElement.appendChild(el);
    }
    return el;
  }
  function mode(){
    const title = document.getElementById("viewTitle")?.textContent || "";
    return /index/i.test(title) ? "index" : "events";
  }
  function rectInfo(el){
    if(!el) return "none";
    const r = el.getBoundingClientRect();
    return `${Math.round(r.top)}/${Math.round(r.bottom)}`;
  }
  function rootForMode(m){ return document.getElementById(m === "index" ? "indexEventsRoot" : "eventsRoot"); }
  function firstRowForMode(m){
    const root = rootForMode(m);
    return root?.querySelector(".row--events, .row, .cell, .group") || null;
  }
  function groupForMode(m){
    const root = rootForMode(m);
    return root?.querySelector(".group__label, .group") || null;
  }
  function metrics(label){
    const m = mode();
    const header = document.querySelector(".header");
    const sticky = document.getElementById("stickyFilters") || document.querySelector(".stickyFilters");
    const row = firstRowForMode(m);
    const group = groupForMode(m);
    const boundaryEl = sticky || header;
    const boundary = boundaryEl ? boundaryEl.getBoundingClientRect().bottom : 0;
    const rowTop = row ? row.getBoundingClientRect().top : NaN;
    const groupTop = group ? group.getBoundingClientRect().top : NaN;
    const breach = (Number.isFinite(rowTop) && rowTop < boundary - 1) || (Number.isFinite(groupTop) && groupTop < boundary - 1);
    const out = `${label} m=${m} y=${Math.round(window.scrollY)} head=${rectInfo(header)} stick=${rectInfo(sticky)} grpT=${Number.isFinite(groupTop)?Math.round(groupTop):"na"} rowT=${Number.isFinite(rowTop)?Math.round(rowTop):"na"} breach=${breach}`;
    if(breach) state.lastBreach = `LAST BREACH: ${Math.round(performance.now())} ${out}`;
    return out;
  }
  function log(msg){
    const line = `${Math.round(performance.now())} ${msg}`;
    state.rows.unshift(line);
    state.rows = state.rows.slice(0, 8);
    panel().textContent = [state.lastBreach, ...state.rows].join("\n");
  }
  function sampleFrames(reason, count=14){
    if(state.rafs > 0) return;
    state.rafs = count;
    let i = 0;
    function step(){
      log(metrics(`frame:${reason}:${i}`));
      i += 1;
      state.rafs -= 1;
      if(state.rafs > 0) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  const origScrollTo = window.scrollTo.bind(window);
  const origScrollBy = window.scrollBy.bind(window);
  window.scrollTo = function(...args){
    try{ log(`CALL scrollTo args=${JSON.stringify(args)} ${metrics("before")}`); sampleFrames("scrollTo", 8); }catch(_e){}
    return origScrollTo(...args);
  };
  window.scrollBy = function(...args){
    try{ log(`CALL scrollBy args=${JSON.stringify(args)} ${metrics("before")}`); sampleFrames("scrollBy", 8); }catch(_e){}
    return origScrollBy(...args);
  };
  const origSiv = Element.prototype.scrollIntoView;
  if(origSiv){
    Element.prototype.scrollIntoView = function(...args){
      try{ log(`CALL scrollIntoView target=#${this.id||this.className||this.tagName} ${metrics("before")}`); sampleFrames("scrollIntoView", 8); }catch(_e){}
      return origSiv.apply(this, args);
    };
  }
  window.addEventListener("scroll", ()=>{ log(metrics("EVENT scroll")); }, { passive:true });
  const mo = new MutationObserver((mutations)=>{
    const names = new Set();
    for(const mu of mutations){
      const t = mu.target;
      if(t?.id) names.add(`#${t.id}`);
      else if(t?.className && typeof t.className === "string") names.add(`.${t.className.split(/\s+/).slice(0,2).join(".")}`);
      else names.add(t?.tagName || "node");
    }
    log(`MUT ${Array.from(names).slice(0,5).join(",")} ${metrics("mut")}`);
    if(performance.now() - state.lastZipChangeAt < 900) sampleFrames("mutationAfterZip", 12);
  });
  queueMicrotask(()=>{
    [document.body, document.documentElement, document.getElementById("eventsRoot"), document.getElementById("indexEventsRoot"), document.querySelector(".header"), document.getElementById("stickyFilters"), document.getElementById("eventsSearchSuggest")].filter(Boolean).forEach((el)=>{
      try{ mo.observe(el, { attributes:true, childList:true, subtree: el.id === "eventsRoot" || el.id === "indexEventsRoot" }); }catch(_e){}
    });
  });
  function watchInput(id){
    const el = document.getElementById(id);
    if(!el) return;
    ["beforeinput","input","change","blur","focusout","focus"].forEach((type)=>{
      el.addEventListener(type, (e)=>{
        state.lastZipChangeAt = performance.now();
        log(`ZIP ${id}:${type} val=${JSON.stringify(el.value)} target=${e.target?.id||e.target?.tagName} ${metrics("zipEvt")}`);
        sampleFrames(`${id}:${type}`, 18);
      }, true);
    });
  }
  queueMicrotask(()=>{
    watchInput("eventsDistanceOriginInput");
    watchInput("distanceOriginInput");
    log(metrics("debug-ready"));
  });
  window.__anyZipSuggestionFlashDebug = { log, metrics, sampleFrames };
  return window.__anyZipSuggestionFlashDebug;
}


export function wireSearch({ $, state, setIndexQuery, setIndexEventsQuery, setActiveEventsQuery, setIndexDistanceMiles, render, isIndexView, isEventsView, clearIndexDistance, clearEventsDistance }){
  const idxIn = $("searchInput");
  const evIn  = $("eventsSearchInput");

  idxIn?.addEventListener("input", (e)=>{
    setIndexQuery(e.target.value);
    setIndexEventsQuery(e.target.value);
    render();
  });

  evIn?.addEventListener("input", (e)=>{
    setActiveEventsQuery(e.target.value);
    render();
  });

  $("searchClear")?.addEventListener("click", ()=>{
    setIndexQuery("");
    setIndexEventsQuery("");
    if(idxIn) idxIn.value = "";
    render();
  });

  $("eventsSearchClear")?.addEventListener("click", ()=>{
    setActiveEventsQuery("");
    if(evIn) evIn.value = "";

    const idx = (typeof isIndexView === "function") ? !!isIndexView() : false;
    const ev = (typeof isEventsView === "function") ? !!isEventsView() : false;
    if(idx && typeof clearIndexDistance === "function") clearIndexDistance();
    if(ev && typeof clearEventsDistance === "function") clearEventsDistance();

    render();
  });
}

/* section: search suggestions // purpose: quick-pick common search tokens + ZIP distance filters */
export function wireSearchSuggestions({
  $,
  setActiveEventsQuery,
  setIndexDistanceMiles,
  setEventsDistanceMiles,
  isEventsView,
  isIndexView,
  onIndexViewOpen,
  onEventsViewOpen,
  onIndexDistanceSelectOrigin,
  onEventsDistanceSelectOrigin,
  setIndexEventsQuery,
  setEventsQuery,
}){
  const wrap  = $("eventsSearchWrap");
  const input = $("eventsSearchInput");
  const panel = $("eventsSearchSuggest");
  if(!wrap || !input || !panel) return;
  const zipFlashDebug = ensureZipSuggestionFlashDebug();
  zipFlashDebug?.log?.("wireSearchSuggestions:init");

  // sections inside panel
  const quick = $("eventsSearchSuggestQuick");
  const indexDist  = $("eventsSearchSuggestDistance");
  const eventsDist = $("eventsSearchSuggestEventsDistance");

  const canSuggest = () => {
    const ev = (typeof isEventsView !== "function") ? true : !!isEventsView();
    const idx = (typeof isIndexView !== "function") ? false : !!isIndexView();
    return ev || idx;
  };

  function mode(){
    return (typeof isIndexView === "function" && isIndexView()) ? "index" : "events";
  }

  function setModeUI(){
    const m = mode();
    if(quick) quick.hidden = (m !== "events");
    if(eventsDist) eventsDist.hidden = (m !== "events");
    if(indexDist) indexDist.hidden = (m !== "index");
  }

  const open = ()=>{
    zipFlashDebug?.log?.(`open:before ${zipFlashDebug.metrics?.("openBefore") || ""}`);
    if(!canSuggest()) return;
    setModeUI();
    if(panel.hasAttribute("hidden")) panel.removeAttribute("hidden");
    if(mode() === "index" && typeof onIndexViewOpen === "function") onIndexViewOpen();
    if(mode() === "events" && typeof onEventsViewOpen === "function") onEventsViewOpen();
    zipFlashDebug?.log?.(`open:after mode=${mode()} ${zipFlashDebug.metrics?.("openAfter") || ""}`);
    zipFlashDebug?.sampleFrames?.("afterOpen", 10);
  };

  const close = ()=>{
    zipFlashDebug?.log?.(`close:before ${zipFlashDebug.metrics?.("closeBefore") || ""}`);
    if(!panel.hasAttribute("hidden")) panel.setAttribute("hidden", "");
    zipFlashDebug?.log?.(`close:after ${zipFlashDebug.metrics?.("closeAfter") || ""}`);
    zipFlashDebug?.sampleFrames?.("afterClose", 10);
  };

  input.addEventListener("focus", ()=>{
    if(!canSuggest()) return;
    if(!String(input.value || "").trim()) open();
  });

  input.addEventListener("click", ()=>{
    if(!canSuggest()) return;
    if(!String(input.value || "").trim()) open();
  });

  input.addEventListener("input", ()=>{
    if(!canSuggest()) { close(); return; }
    if(String(input.value || "").trim()) close();
  });

  // EVENTS mode: quick-search buttons write into the search box
  panel.addEventListener("click", (e)=>{
    if(!canSuggest()) { close(); return; }
    if(mode() !== "events") return;
    const btn = e.target.closest("button[data-value]");
    if(!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const val = btn.getAttribute("data-value") || "";
    input.value = val;
    setActiveEventsQuery(val);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    close();
    input.blur();
  });

  function wireDistanceSection({
    section,
    inputId,
    applyId,
    activeMode,
    setMiles,
    onSelectOrigin,
  }){
    if(!section) return;
    const distInput = $(inputId);
    const distApply = $(applyId);
    const seg = section.querySelector(".iosSeg");
    const segBtns = section.querySelectorAll(".iosSeg__btn");

    const isSectionVisible = () => !section.hasAttribute("hidden") && !section.hidden;
    const isActiveMode = () => mode() === activeMode || (activeMode === "events" && isSectionVisible());
    const setSectionQuery = activeMode === "index" ? setIndexEventsQuery : setEventsQuery;

    function writeZipToPrimarySearch(zip, { dispatch = false } = {}){
      input.value = zip;
      if(typeof setSectionQuery === "function") setSectionQuery(zip);
      else if(typeof setActiveEventsQuery === "function") setActiveEventsQuery(zip);
      if(dispatch) input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function prePositionResultsBeforeRender(){
      const rootId = activeMode === "index" ? "indexEventsRoot" : "eventsRoot";
      const root = $(rootId);
      if(!root) return;

      // The EVENTS page can be partially scrolled when the ZIP helper is used.
      // If render runs while the viewport is still below the top of the results
      // root, the freshly-filtered rows briefly paint under/through the sticky
      // header before the post-render alignment runs. Put the viewport at the
      // same final anchor synchronously before the render so there is no
      // visible intermediate position.
      const rect = root.getBoundingClientRect();
      const header = document.querySelector(".header");
      const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      const gap = 14;
      const y = Math.max(0, window.scrollY + rect.top - headerH - gap);
      if(Math.abs(window.scrollY - y) > 1){
        window.scrollTo({ top: y, left: 0, behavior: "auto" });
      }
    }

    function scrollFilteredResultsToStart(){
      const rootId = activeMode === "index" ? "indexEventsRoot" : "eventsRoot";
      const root = $(rootId);
      if(!root) return;

      // Wait until the synchronous render triggered by onSelectOrigin has
      // replaced the list, then align the viewport just above the first group
      // label. This lands slightly higher than the first result card, keeping
      // the group name visible as the start of the filtered list.
      window.requestAnimationFrame(()=>{
        window.requestAnimationFrame(()=>{
          const firstGroupLabel = root.querySelector(".group__label");
          const firstGroup = root.querySelector(".group");
          const firstResult = root.querySelector(".row--events, .row");
          const target = firstGroupLabel || firstGroup || firstResult || root;
          const rect = target.getBoundingClientRect();
          const header = document.querySelector(".header");
          const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
          const gap = 14;
          const y = Math.max(0, window.scrollY + rect.top - headerH - gap);
          window.scrollTo({ top: y, left: 0, behavior: "auto" });
        });
      });
    }

    function stabilizeOpenHelperScroll(){
      zipFlashDebug?.log?.(`${activeMode}:stabilize:start ${zipFlashDebug.metrics?.("stabStart") || ""}`);
      if(!isActiveMode()) return;
      if(panel.hasAttribute("hidden")) return;
      if(!isSectionVisible()) return;

      const zip = sanitizeZip();
      if(zip.length !== 5) return;

      const rootId = activeMode === "index" ? "indexEventsRoot" : "eventsRoot";
      const root = $(rootId);
      if(!root) return;

      // Mobile autocomplete can leave EVENTS scrolled partway down while the
      // helper is still open. INDEX is already sitting at this top anchor when
      // submit happens, which is why its filter transition feels smooth. Bring
      // the page to the same helper-open anchor before the arrow submit, without
      // submitting the ZIP, changing the search input, or closing the helper.
      const rect = root.getBoundingClientRect();
      const header = document.querySelector(".header");
      const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      const gap = 14;
      const y = Math.max(0, window.scrollY + rect.top - headerH - gap);
      if(Math.abs(window.scrollY - y) > 2){
        zipFlashDebug?.log?.(`${activeMode}:stabilize:scrollTo y=${Math.round(y)} ${zipFlashDebug.metrics?.("stabBeforeScroll") || ""}`);
        window.scrollTo({ top: y, left: 0, behavior: "auto" });
        zipFlashDebug?.sampleFrames?.(`${activeMode}:afterStabilizeScroll`, 12);
      }
      zipFlashDebug?.log?.(`${activeMode}:stabilize:end targetY=${Math.round(y)} ${zipFlashDebug.metrics?.("stabEnd") || ""}`);
    }

    let stabilizeZipScrollTimer = 0;
    function scheduleOpenHelperScrollStabilize(){
      zipFlashDebug?.log?.(`${activeMode}:scheduleStabilize ${zipFlashDebug.metrics?.("sched") || ""}`);
      if(stabilizeZipScrollTimer) window.clearTimeout(stabilizeZipScrollTimer);
      stabilizeZipScrollTimer = window.setTimeout(()=>{
        stabilizeZipScrollTimer = 0;
        stabilizeOpenHelperScroll();
      }, 35);
    }

    function sanitizeZip(){
      if(!distInput) return "";
      const raw = String(distInput.value || "");
      const digits = raw.replace(/\D/g, "").slice(0, 5);
      if(digits !== raw) distInput.value = digits;
      return digits;
    }

    function zipIsAlreadyApplied(zip){
      if(zip.length !== 5) return false;
      return String(input.value || "").trim() === zip;
    }

    function applyZip({ force = false } = {}){
      zipFlashDebug?.log?.(`${activeMode}:applyZip:start force=${force} ${zipFlashDebug.metrics?.("applyStart") || ""}`);
      // Button/Enter actions come from this exact ZIP section, so do not let
      // the shared view-mode check block the submit. The check remains for
      // passive refreshes and distance-segment changes.
      if(!force && !isActiveMode()) return false;
      const zip = sanitizeZip();
      if(zip.length !== 5) return false;
      // Pre-position first, then update q + distFrom in the same synchronous
      // path. Do not close the helper until after render has rebuilt the final
      // filtered list; this keeps the helper covering the old list during the
      // update and avoids the visible old-list/new-list flash on EVENTS.
      prePositionResultsBeforeRender();
      writeZipToPrimarySearch(zip, { dispatch: false });
      if(typeof onSelectOrigin === "function") onSelectOrigin(zip);
      scrollFilteredResultsToStart();
      zipFlashDebug?.log?.(`${activeMode}:applyZip:afterOnSelect ${zipFlashDebug.metrics?.("applyAfterOnSelect") || ""}`);
      close();
      distInput?.blur();
      input.blur();
      return true;
    }

    function setMilesUI(miles){
      if(!seg || !segBtns) return;
      const mNum = Number(miles);
      seg.dataset.selected = String(mNum);
      segBtns.forEach((b)=>{
        const m = Number(b.dataset.miles);
        const on = (m === mNum);
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    segBtns?.forEach((btn)=>{
      btn.addEventListener("click", (e)=>{
        if(!isActiveMode()) return;
        e.preventDefault();
        e.stopPropagation();
        const miles = Number(btn.dataset.miles);
        if(!Number.isFinite(miles)) return;
        setMilesUI(miles);
        if(typeof setMiles === "function") setMiles(miles);
        const zip = sanitizeZip();
        if(typeof onSelectOrigin === "function" && zipIsAlreadyApplied(zip)) onSelectOrigin(zip);
      });
    });

    function handleZipValueRefresh(){
      zipFlashDebug?.log?.(`${activeMode}:handleZipValueRefresh:start val=${JSON.stringify(distInput?.value || "")} ${zipFlashDebug.metrics?.("refreshStart") || ""}`);
      if(!isActiveMode()) return;
      const zip = sanitizeZip();
      zipFlashDebug?.log?.(`${activeMode}:handleZipValueRefresh:zip=${zip} ${zipFlashDebug.metrics?.("refreshZip") || ""}`);
      if(zip.length === 5) scheduleOpenHelperScrollStabilize();
    }

    distInput?.addEventListener("input", handleZipValueRefresh);
    distInput?.addEventListener("change", handleZipValueRefresh);
    distInput?.addEventListener("blur", handleZipValueRefresh);


    let lastArrowSubmitAt = 0;

    function submitZipFromArrow(e){
      if(!distInput) return;
      if(e){
        e.preventDefault();
        if(typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        else e.stopPropagation();
      }
      const now = Date.now();
      if(now - lastArrowSubmitAt < 180) return;
      lastArrowSubmitAt = now;
      applyZip({ force: true });
    }

    function pointIsOnApplyButton(e){
      if(!distApply || !e) return false;
      const x = Number(e.clientX);
      const y = Number(e.clientY);
      if(!Number.isFinite(x) || !Number.isFinite(y)) return false;
      const r = distApply.getBoundingClientRect();
      const slop = 10;
      return x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop;
    }

    function pointIsOnDistanceSegment(e){
      if(!seg || !e) return false;
      const x = Number(e.clientX);
      const y = Number(e.clientY);
      if(!Number.isFinite(x) || !Number.isFinite(y)) return false;
      const r = seg.getBoundingClientRect();
      const slop = 10;
      return x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop;
    }

    function setMilesFromSegmentPoint(e){
      if(!seg || !e) return false;
      const x = Number(e.clientX);
      if(!Number.isFinite(x)) return false;
      const r = seg.getBoundingClientRect();
      const miles = x < (r.left + (r.width / 2)) ? 15 : 30;
      setMilesUI(miles);
      if(typeof setMiles === "function") setMiles(miles);
      const zip = sanitizeZip();
      if(typeof onSelectOrigin === "function" && zipIsAlreadyApplied(zip)) onSelectOrigin(zip);
      return true;
    }

    // Normal path: the actual arrow button receives the click.
    distApply?.addEventListener("click", submitZipFromArrow);

    // Mobile Safari/Chrome can report taps on the visible helper controls as
    // taps on the page underneath. Use one shared coordinate-capture path for
    // both INDEX and EVENTS, with the 15/30 segmented control taking priority
    // over the ZIP arrow. This prevents a distance-toggle tap from being
    // treated as a ZIP submit.
    document.addEventListener("pointerdown", (e)=>{
      if(!isActiveMode()) return;
      if(panel.hasAttribute("hidden")) return;
      if(!isSectionVisible()) return;

      if(pointIsOnDistanceSegment(e)){
        e.preventDefault();
        if(typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        else e.stopPropagation();
        setMilesFromSegmentPoint(e);
        return;
      }

      if(pointIsOnApplyButton(e)){
        submitZipFromArrow(e);
      }
    }, true);

    distInput?.addEventListener("keydown", (e)=>{
      if(!isActiveMode()) return;
      if(e.key !== "Enter") return;
      submitZipFromArrow(e);
    });
  }

  wireDistanceSection({
    section: indexDist,
    inputId: "distanceOriginInput",
    applyId: "distanceApplyBtn",
    activeMode: "index",
    setMiles: setIndexDistanceMiles,
    onSelectOrigin: onIndexDistanceSelectOrigin,
  });

  wireDistanceSection({
    section: eventsDist,
    inputId: "eventsDistanceOriginInput",
    applyId: "eventsDistanceApplyBtn",
    activeMode: "events",
    setMiles: setEventsDistanceMiles,
    onSelectOrigin: onEventsDistanceSelectOrigin,
  });

  function pointIsInsideRect(e, el, slop = 0){
    if(!el || !e) return false;
    const x = Number(e.clientX);
    const y = Number(e.clientY);
    if(!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop;
  }

  document.addEventListener("pointerdown", (e)=>{
    if(wrap.contains(e.target)) return;
    // On mobile, taps on the visible helper controls can be reported as
    // targets on the page underneath. Treat the physical helper-panel
    // rectangle as inside as well, so distance toggles do not close or
    // behave like an apply action.
    if(!panel.hasAttribute("hidden") && pointIsInsideRect(e, panel, 10)) return;
    if(pointIsInsideRect(e, wrap, 10)) return;
    close();
  }, true);

  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") close();
  });
}
