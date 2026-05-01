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
  const wrap  = $("eventsSearchWrap");
  const input = $("eventsSearchInput");
  const panel = $("eventsSearchSuggest");
  if(!wrap || !input || !panel) return;

  const FLASH_DEBUG = true;
  let flashDebugEl = null;
  let flashDebugLines = [];

  function flashDebugPanel(){
    if(!FLASH_DEBUG) return null;
    if(flashDebugEl) return flashDebugEl;
    flashDebugEl = document.createElement("div");
    flashDebugEl.id = "zipFlashDebugPanel";
    flashDebugEl.setAttribute("aria-hidden", "true");
    flashDebugEl.style.cssText = [
      "position:fixed",
      "left:0",
      "right:0",
      "bottom:0",
      "z-index:2147483647",
      "max-height:112px",
      "overflow:hidden",
      "padding:4px 6px",
      "box-sizing:border-box",
      "background:rgba(0,0,0,.84)",
      "color:#fff",
      "font:10px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace",
      "white-space:pre-wrap",
      "pointer-events:none"
    ].join(";");
    document.body.appendChild(flashDebugEl);
    return flashDebugEl;
  }

  function flashMetric(){
    const header = document.querySelector(".header");
    const sticky = document.querySelector("#stickyFilters");
    const root = $(mode() === "index" ? "indexEventsRoot" : "eventsRoot");
    const target = root?.querySelector?.(".group__label") || root?.querySelector?.(".group") || root?.querySelector?.(".row--events,.row") || root;
    const row = root?.querySelector?.(".row--events,.row");
    const headerRect = header?.getBoundingClientRect?.();
    const stickyRect = sticky?.getBoundingClientRect?.();
    const targetRect = target?.getBoundingClientRect?.();
    const rowRect = row?.getBoundingClientRect?.();
    const headerBottom = headerRect ? Math.round(headerRect.bottom) : -1;
    const stickyBottom = stickyRect ? Math.round(stickyRect.bottom) : -1;
    const targetTop = targetRect ? Math.round(targetRect.top) : -1;
    const rowTop = rowRect ? Math.round(rowRect.top) : -1;
    const breachTarget = targetTop >= 0 && headerBottom >= 0 && targetTop < headerBottom;
    const breachRow = rowTop >= 0 && headerBottom >= 0 && rowTop < headerBottom;
    const panelState = panel.hasAttribute("hidden") ? "closed" : "open";
    return `m=${mode()} y=${Math.round(window.scrollY)} hb=${headerBottom} sb=${stickyBottom} gt=${targetTop} rt=${rowTop} breach=${breachTarget||breachRow} panel=${panelState}`;
  }

  function flashLog(label, extra = ""){
    if(!FLASH_DEBUG) return;
    const t = Math.round(performance.now());
    const line = `${t} ${label} ${flashMetric()} ${extra}`.slice(0, 260);
    flashDebugLines.unshift(line);
    flashDebugLines = flashDebugLines.slice(0, 9);
    const el = flashDebugPanel();
    if(el) el.textContent = flashDebugLines.join("\n");
  }

  function flashTraceFrames(label, frames = 22){
    if(!FLASH_DEBUG) return;
    let i = 0;
    function step(){
      flashLog(`${label}:f${i}`);
      i += 1;
      if(i < frames) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  window.addEventListener("scroll", ()=>{
    flashLog("window:scroll");
  }, { passive: true });

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
    flashLog("panel:open:before");
    setModeUI();
    if(panel.hasAttribute("hidden")) panel.removeAttribute("hidden");
    if(mode() === "index" && typeof onIndexViewOpen === "function") onIndexViewOpen();
    if(mode() === "events" && typeof onEventsViewOpen === "function") onEventsViewOpen();
    flashLog("panel:open:after");
  };

  const close = ()=>{
    flashLog("panel:close:before");
    if(!panel.hasAttribute("hidden")) panel.setAttribute("hidden", "");
    flashLog("panel:close:after");
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
      flashLog(`${activeMode}:prePosition:start`);
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
      flashLog(`${activeMode}:prePosition:target`, `targetY=${Math.round(y)}`);
      if(Math.abs(window.scrollY - y) > 1){
        window.scrollTo({ top: y, left: 0, behavior: "auto" });
        flashLog(`${activeMode}:prePosition:afterScroll`);
      }
    }

    function scrollFilteredResultsToStart(){
      flashLog(`${activeMode}:postScroll:schedule`);
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
          flashLog(`${activeMode}:postScroll:target`, `targetY=${Math.round(y)}`);
          window.scrollTo({ top: y, left: 0, behavior: "auto" });
          flashLog(`${activeMode}:postScroll:after`);
          flashTraceFrames(`${activeMode}:afterPostScroll`, 18);
        });
      });
    }

    function stabilizeOpenHelperScroll(){
      flashLog(`${activeMode}:stabilize:start`);
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
      flashLog(`${activeMode}:stabilize:target`, `targetY=${Math.round(y)}`);
      if(Math.abs(window.scrollY - y) > 2){
        window.scrollTo({ top: y, left: 0, behavior: "auto" });
        flashLog(`${activeMode}:stabilize:afterScroll`);
      }
    }

    let stabilizeZipScrollTimer = 0;
    function scheduleOpenHelperScrollStabilize(){
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
      flashLog(`${activeMode}:applyZip:start`, `force=${force}`);
      flashTraceFrames(`${activeMode}:applyZipTrace`, 24);
      // Button/Enter actions come from this exact ZIP section, so do not let
      // the shared view-mode check block the submit. The check remains for
      // passive refreshes and distance-segment changes.
      if(!force && !isActiveMode()){ flashLog(`${activeMode}:applyZip:return:notActive`); return false; }
      const zip = sanitizeZip();
      if(zip.length !== 5){ flashLog(`${activeMode}:applyZip:return:badZip`, `zip=${zip}`); return false; }
      // Pre-position first, then update q + distFrom in the same synchronous
      // path. Do not close the helper until after render has rebuilt the final
      // filtered list; this keeps the helper covering the old list during the
      // update and avoids the visible old-list/new-list flash on EVENTS.
      prePositionResultsBeforeRender();
      flashLog(`${activeMode}:writeZip:before`, `zip=${zip}`);
      writeZipToPrimarySearch(zip, { dispatch: false });
      flashLog(`${activeMode}:writeZip:after`);
      flashLog(`${activeMode}:onSelectOrigin:before`);
      if(typeof onSelectOrigin === "function") onSelectOrigin(zip);
      flashLog(`${activeMode}:onSelectOrigin:after`);
      scrollFilteredResultsToStart();
      close();
      distInput?.blur();
      input.blur();
      flashLog(`${activeMode}:applyZip:done`);
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
      const zip = sanitizeZip();
      if(zip.length === 5) scheduleOpenHelperScrollStabilize();
    }

    distInput?.addEventListener("input", handleZipValueRefresh);
    distInput?.addEventListener("change", handleZipValueRefresh);
    distInput?.addEventListener("blur", handleZipValueRefresh);


    let lastArrowSubmitAt = 0;

    function submitZipFromArrow(e){
      flashLog(`${activeMode}:submitArrow`, e ? `type=${e.type}` : "");
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

  try{
    const obsCfg = { attributes: true, childList: true, subtree: false };
    const watch = (id, label)=>{
      const el = $(id);
      if(!el || typeof MutationObserver !== "function") return;
      const mo = new MutationObserver((records)=>{
        const bits = records.map(r=>r.type === "attributes" ? `attr:${r.attributeName}` : `child:${r.addedNodes.length}/${r.removedNodes.length}`).join(",");
        flashLog(`mut:${label}`, bits);
      });
      mo.observe(el, obsCfg);
    };
    watch("eventsRoot", "eventsRoot");
    watch("indexEventsRoot", "indexRoot");
    watch("stickyFilters", "stickyFilters");
    watch("eventsSearchWrap", "searchWrap");
    const header = document.querySelector(".header");
    if(header && typeof MutationObserver === "function"){
      const mo = new MutationObserver((records)=>{
        const bits = records.map(r=>r.type === "attributes" ? `attr:${r.attributeName}` : `child:${r.addedNodes.length}/${r.removedNodes.length}`).join(",");
        flashLog("mut:header", bits);
      });
      mo.observe(header, obsCfg);
    }
  }catch(_err){}

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
