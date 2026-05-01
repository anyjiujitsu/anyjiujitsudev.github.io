// ui/search.js
// purpose: wire search inputs + search suggestion UX

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
  const flashDbg = (...args)=>window.__ANYJJ_FLASH_DBG?.log?.(...args);
  const rectInfo = (el)=>window.__ANYJJ_FLASH_DBG?.rectInfo?.(el) || null;
  const rootInfo = (el)=>window.__ANYJJ_FLASH_DBG?.rootInfo?.(el) || null;
  const wrap  = $("eventsSearchWrap");
  const input = $("eventsSearchInput");
  const panel = $("eventsSearchSuggest");
  if(!wrap || !input || !panel) return;

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
    if(!canSuggest()) return;
    setModeUI();
    if(panel.hasAttribute("hidden")) panel.removeAttribute("hidden");
    if(mode() === "index" && typeof onIndexViewOpen === "function") onIndexViewOpen();
    if(mode() === "events" && typeof onEventsViewOpen === "function") onEventsViewOpen();
  };

  const close = ()=>{
    if(!panel.hasAttribute("hidden")) panel.setAttribute("hidden", "");
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
      flashDbg("writeZipToPrimarySearch BEFORE", { activeMode, zip, dispatch, primaryValue: input?.value || "", eventsRoot: rootInfo($("eventsRoot")), header: rectInfo(document.querySelector(".header")), sticky: rectInfo(document.querySelector(".stickyFilters")) });
      input.value = zip;
      if(typeof setSectionQuery === "function") setSectionQuery(zip);
      else if(typeof setActiveEventsQuery === "function") setActiveEventsQuery(zip);
      if(dispatch){ flashDbg("writeZipToPrimarySearch DISPATCH input", { activeMode, zip }); input.dispatchEvent(new Event("input", { bubbles: true })); }
      flashDbg("writeZipToPrimarySearch AFTER", { activeMode, zip, primaryValue: input?.value || "", eventsRoot: rootInfo($("eventsRoot")), header: rectInfo(document.querySelector(".header")), sticky: rectInfo(document.querySelector(".stickyFilters")) });
    }

    function prePositionResultsBeforeRender(){
      const rootId = activeMode === "index" ? "indexEventsRoot" : "eventsRoot";
      flashDbg("prePosition START", { activeMode, rootId, scrollY: Math.round(window.scrollY || 0), root: rootInfo($(rootId)), header: rectInfo(document.querySelector(".header")), sticky: rectInfo(document.querySelector(".stickyFilters")) });
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
      flashDbg("prePosition TARGET", { activeMode, rootId, fromY: Math.round(window.scrollY || 0), toY: Math.round(y), rectTop: Math.round(rect.top), headerH, gap });
      if(Math.abs(window.scrollY - y) > 1){
        window.scrollTo({ top: y, left: 0, behavior: "auto" });
        flashDbg("prePosition SCROLLED", { activeMode, rootId, nowY: Math.round(window.scrollY || 0) });
      }else{
        flashDbg("prePosition NOOP", { activeMode, rootId, nowY: Math.round(window.scrollY || 0) });
      }
    }

    function scrollFilteredResultsToStart(){
      const rootId = activeMode === "index" ? "indexEventsRoot" : "eventsRoot";
      flashDbg("postScroll SCHEDULE", { activeMode, rootId, y: Math.round(window.scrollY || 0), root: rootInfo($(rootId)) });
      const root = $(rootId);
      if(!root) return;

      // Wait until the synchronous render triggered by onSelectOrigin has
      // replaced the list, then align the viewport just above the first group
      // label. This lands slightly higher than the first result card, keeping
      // the group name visible as the start of the filtered list.
      window.requestAnimationFrame(()=>{
        flashDbg("postScroll RAF1", { activeMode, rootId, y: Math.round(window.scrollY || 0), root: rootInfo($(rootId)) });
        window.requestAnimationFrame(()=>{
          flashDbg("postScroll RAF2 BEFORE", { activeMode, rootId, y: Math.round(window.scrollY || 0), root: rootInfo($(rootId)), header: rectInfo(document.querySelector(".header")), sticky: rectInfo(document.querySelector(".stickyFilters")) });
          const firstGroupLabel = root.querySelector(".group__label");
          const firstGroup = root.querySelector(".group");
          const firstResult = root.querySelector(".row--events, .row");
          const target = firstGroupLabel || firstGroup || firstResult || root;
          const rect = target.getBoundingClientRect();
          const header = document.querySelector(".header");
          const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
          const gap = 14;
          const y = Math.max(0, window.scrollY + rect.top - headerH - gap);
          flashDbg("postScroll TARGET", { activeMode, rootId, fromY: Math.round(window.scrollY || 0), toY: Math.round(y), targetRect: rectInfo(target), headerH, gap });
          window.scrollTo({ top: y, left: 0, behavior: "auto" });
          flashDbg("postScroll AFTER", { activeMode, rootId, y: Math.round(window.scrollY || 0), root: rootInfo(root), header: rectInfo(document.querySelector(".header")), sticky: rectInfo(document.querySelector(".stickyFilters")) });
        });
      });
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
      flashDbg("applyZip START", { activeMode, force, mode: mode(), isActive: isActiveMode(), zipBox: distInput?.value || "", primary: input?.value || "", panelHidden: panel.hasAttribute("hidden"), eventsRoot: rootInfo($("eventsRoot")), indexRoot: rootInfo($("indexEventsRoot")) });
      // Button/Enter actions come from this exact ZIP section, so do not let
      // the shared view-mode check block the submit. The check remains for
      // passive refreshes and distance-segment changes.
      if(!force && !isActiveMode()){ flashDbg("applyZip RETURN inactive", { activeMode, force, mode: mode() }); return false; }
      const zip = sanitizeZip();
      if(zip.length !== 5){ flashDbg("applyZip RETURN invalidZip", { activeMode, zip }); return false; }
      // Pre-position first, then update q + distFrom in the same synchronous
      // path. Do not close the helper until after render has rebuilt the final
      // filtered list; this keeps the helper covering the old list during the
      // update and avoids the visible old-list/new-list flash on EVENTS.
      prePositionResultsBeforeRender();
      writeZipToPrimarySearch(zip, { dispatch: false });
      if(typeof onSelectOrigin === "function"){
        flashDbg("applyZip onSelectOrigin BEFORE", { activeMode, zip, y: Math.round(window.scrollY || 0), eventsRoot: rootInfo($("eventsRoot")), indexRoot: rootInfo($("indexEventsRoot")) });
        onSelectOrigin(zip);
        flashDbg("applyZip onSelectOrigin AFTER", { activeMode, zip, y: Math.round(window.scrollY || 0), eventsRoot: rootInfo($("eventsRoot")), indexRoot: rootInfo($("indexEventsRoot")) });
      }
      scrollFilteredResultsToStart();
      flashDbg("applyZip close BEFORE", { activeMode, zip, panelHidden: panel.hasAttribute("hidden"), y: Math.round(window.scrollY || 0) });
      close();
      flashDbg("applyZip close AFTER", { activeMode, zip, panelHidden: panel.hasAttribute("hidden"), y: Math.round(window.scrollY || 0) });
      distInput?.blur();
      input.blur();
      flashDbg("applyZip END", { activeMode, zip, y: Math.round(window.scrollY || 0), eventsRoot: rootInfo($("eventsRoot")), indexRoot: rootInfo($("indexEventsRoot")) });
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
      if(!isActiveMode()) return;
      sanitizeZip();
    }

    distInput?.addEventListener("input", handleZipValueRefresh);
    distInput?.addEventListener("change", handleZipValueRefresh);
    distInput?.addEventListener("blur", handleZipValueRefresh);


    let lastArrowSubmitAt = 0;

    function submitZipFromArrow(e){
      flashDbg("submitZipFromArrow START", { activeMode, eventType: e?.type || "", x: e?.clientX || null, y: e?.clientY || null, target: e?.target?.id || e?.target?.className || e?.target?.nodeName || "", zipBox: distInput?.value || "", primary: input?.value || "" });
      if(!distInput) return;
      if(e){
        e.preventDefault();
        if(typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        else e.stopPropagation();
      }
      const now = Date.now();
      if(now - lastArrowSubmitAt < 180) return;
      lastArrowSubmitAt = now;
      const ok = applyZip({ force: true });
      flashDbg("submitZipFromArrow END", { activeMode, ok, y: Math.round(window.scrollY || 0) });
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
    flashDbg("outside pointerdown", { x: e.clientX, y: e.clientY, target: e.target?.id || e.target?.className || e.target?.nodeName || "", panelHidden: panel.hasAttribute("hidden"), wrapContains: wrap.contains(e.target), inPanelRect: pointIsInsideRect(e, panel, 10), inWrapRect: pointIsInsideRect(e, wrap, 10), scrollY: Math.round(window.scrollY || 0) });
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
