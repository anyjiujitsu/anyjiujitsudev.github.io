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

  const zipFlashDebug = (()=>{
    let panelEl = null;
    let seq = 0;
    const maxLines = 32;
    function ensure(){
      if(panelEl || typeof document === "undefined") return panelEl;
      panelEl = document.createElement("div");
      panelEl.id = "zipFlashDebugPanel";
      panelEl.style.cssText = [
        "position:fixed","left:6px","right:6px","top:6px","z-index:999999","max-height:118px","overflow:auto",
        "background:rgba(0,0,0,.82)","color:#fff","font:10px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace",
        "padding:5px 6px","border-radius:8px","pointer-events:none","white-space:pre-wrap"
      ].join(";");
      panelEl.textContent = "ZIP FLASH DEBUG\n";
      document.documentElement.appendChild(panelEl);
      return panelEl;
    }
    function rectBits(el){
      if(!el) return "none";
      const r = el.getBoundingClientRect();
      return `t=${Math.round(r.top)} h=${Math.round(r.height)}`;
    }
    function snap(activeMode, label){
      const rootId = activeMode === "index" ? "indexEventsRoot" : "eventsRoot";
      const root = $(rootId);
      const firstLabel = root?.querySelector?.(".group__label");
      const firstGroup = root?.querySelector?.(".group");
      const evZip = $("eventsDistanceOriginInput")?.value || "";
      const idxZip = $("distanceOriginInput")?.value || "";
      const kids = root ? root.children.length : -1;
      return `${label} mode=${activeMode} y=${Math.round(window.scrollY)} primary=${JSON.stringify(input.value||"")} idxZip=${JSON.stringify(idxZip)} evZip=${JSON.stringify(evZip)} kids=${kids} root(${rectBits(root)}) label(${rectBits(firstLabel)}) group(${rectBits(firstGroup)}) hidden=${panel.hasAttribute("hidden")}`;
    }
    function log(activeMode, label, extra=""){
      const el = ensure();
      const line = `${String(++seq).padStart(3,"0")} ${Math.round(performance.now())} ${snap(activeMode || mode(), label)}${extra ? " " + extra : ""}`;
      const lines = (line + "\n" + el.textContent).split("\n").slice(0, maxLines);
      el.textContent = lines.join("\n");
      try { console.log("[ZIP_FLASH_DEBUG]", line); } catch(_) {}
    }
    function markFrames(activeMode, label){
      log(activeMode, `${label}:now`);
      requestAnimationFrame(()=>{
        log(activeMode, `${label}:raf1`);
        requestAnimationFrame(()=>log(activeMode, `${label}:raf2`));
      });
      setTimeout(()=>log(activeMode, `${label}:t80`), 80);
      setTimeout(()=>log(activeMode, `${label}:t180`), 180);
    }
    function observeRoot(activeMode){
      const rootId = activeMode === "index" ? "indexEventsRoot" : "eventsRoot";
      const root = $(rootId);
      if(!root || root.dataset.zipFlashDebugObserved === "1") return;
      root.dataset.zipFlashDebugObserved = "1";
      try {
        new MutationObserver((mutations)=>{
          let added=0, removed=0;
          mutations.forEach(m=>{ added += m.addedNodes?.length || 0; removed += m.removedNodes?.length || 0; });
          log(activeMode, "mutation", `added=${added} removed=${removed}`);
        }).observe(root, { childList:true, subtree:false });
      } catch(_) {}
    }
    return { log, markFrames, observeRoot };
  })();

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
    zipFlashDebug.log(mode(), "open:start");
    setModeUI();
    if(panel.hasAttribute("hidden")) panel.removeAttribute("hidden");
    if(mode() === "index" && typeof onIndexViewOpen === "function") onIndexViewOpen();
    if(mode() === "events" && typeof onEventsViewOpen === "function") onEventsViewOpen();
  };

  const close = ()=>{
    zipFlashDebug.log(mode(), "close:start");
    if(!panel.hasAttribute("hidden")) panel.setAttribute("hidden", "");
    zipFlashDebug.log(mode(), "close:end");
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
    zipFlashDebug.observeRoot(activeMode);

    const isSectionVisible = () => !section.hasAttribute("hidden") && !section.hidden;
    const isActiveMode = () => mode() === activeMode || (activeMode === "events" && isSectionVisible());
    const setSectionQuery = activeMode === "index" ? setIndexEventsQuery : setEventsQuery;

    function writeZipToPrimarySearch(zip, { dispatch = false } = {}){
      zipFlashDebug.log(activeMode, "writeZip:before", `zip=${zip} dispatch=${dispatch}`);
      input.value = zip;
      if(typeof setSectionQuery === "function") setSectionQuery(zip);
      else if(typeof setActiveEventsQuery === "function") setActiveEventsQuery(zip);
      if(dispatch){
        zipFlashDebug.log(activeMode, "writeZip:dispatchInput");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      zipFlashDebug.log(activeMode, "writeZip:after");
    }

    function prePositionResultsBeforeRender(){
      zipFlashDebug.log(activeMode, "prePosition:start");
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
      zipFlashDebug.log(activeMode, "prePosition:calc", `targetY=${Math.round(y)} currentY=${Math.round(window.scrollY)}`);
      if(Math.abs(window.scrollY - y) > 1){
        window.scrollTo({ top: y, left: 0, behavior: "auto" });
        zipFlashDebug.log(activeMode, "prePosition:scrolled");
      }
    }

    function scrollFilteredResultsToStart(){
      zipFlashDebug.log(activeMode, "postScroll:schedule");
      const rootId = activeMode === "index" ? "indexEventsRoot" : "eventsRoot";
      const root = $(rootId);
      if(!root) return;

      // Wait until the synchronous render triggered by onSelectOrigin has
      // replaced the list, then align the viewport just above the first group
      // label. This lands slightly higher than the first result card, keeping
      // the group name visible as the start of the filtered list.
      window.requestAnimationFrame(()=>{
        zipFlashDebug.log(activeMode, "postScroll:raf1");
        window.requestAnimationFrame(()=>{
          zipFlashDebug.log(activeMode, "postScroll:raf2before");
          const firstGroupLabel = root.querySelector(".group__label");
          const firstGroup = root.querySelector(".group");
          const firstResult = root.querySelector(".row--events, .row");
          const target = firstGroupLabel || firstGroup || firstResult || root;
          const rect = target.getBoundingClientRect();
          const header = document.querySelector(".header");
          const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
          const gap = 14;
          const y = Math.max(0, window.scrollY + rect.top - headerH - gap);
          zipFlashDebug.log(activeMode, "postScroll:calc", `targetY=${Math.round(y)} rectTop=${Math.round(rect.top)} headerH=${headerH}`);
          window.scrollTo({ top: y, left: 0, behavior: "auto" });
          zipFlashDebug.log(activeMode, "postScroll:afterScroll");
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
      zipFlashDebug.log(activeMode, "applyZip:start", `force=${force}`);
      zipFlashDebug.markFrames(activeMode, "applyZip:frames-before");
      // Button/Enter actions come from this exact ZIP section, so do not let
      // the shared view-mode check block the submit. The check remains for
      // passive refreshes and distance-segment changes.
      if(!force && !isActiveMode()){ zipFlashDebug.log(activeMode, "applyZip:returnInactive"); return false; }
      const zip = sanitizeZip();
      if(zip.length !== 5){ zipFlashDebug.log(activeMode, "applyZip:returnBadZip", `zip=${zip}`); return false; }
      // Close/blur and pre-position before the render so the updated rows do
      // not briefly paint under the sticky header. Then mirror into the visible
      // primary search bar and update the matching state branch directly:
      // INDEX => indexEvents.q, EVENTS => events.q.
      close();
      distInput?.blur();
      input.blur();
      prePositionResultsBeforeRender();
      writeZipToPrimarySearch(zip, { dispatch: false });
      zipFlashDebug.log(activeMode, "onSelectOrigin:before", `zip=${zip}`);
      if(typeof onSelectOrigin === "function") onSelectOrigin(zip);
      zipFlashDebug.log(activeMode, "onSelectOrigin:after");
      zipFlashDebug.markFrames(activeMode, "applyZip:frames-after-render");
      scrollFilteredResultsToStart();
      zipFlashDebug.log(activeMode, "applyZip:end");
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

      const onSeg = pointIsOnDistanceSegment(e);
      const onApply = pointIsOnApplyButton(e);
      if(onSeg || onApply) zipFlashDebug.log(activeMode, "pointerdown:hit", `onSeg=${onSeg} onApply=${onApply} x=${Math.round(Number(e.clientX)||0)} y=${Math.round(Number(e.clientY)||0)}`);

      if(onSeg){
        e.preventDefault();
        if(typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        else e.stopPropagation();
        setMilesFromSegmentPoint(e);
        return;
      }

      if(onApply){
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
    const active = mode();
    const insideWrap = wrap.contains(e.target);
    const insidePanelRect = !panel.hasAttribute("hidden") && pointIsInsideRect(e, panel, 10);
    if(!panel.hasAttribute("hidden")) zipFlashDebug.log(active, "outsidePointer", `insideWrap=${insideWrap} insidePanelRect=${insidePanelRect} target=${e.target?.tagName || "?"}.${e.target?.className || ""}`);
    if(insideWrap) return;
    // On mobile, taps on the visible helper controls can be reported as
    // targets on the page underneath. Treat the physical helper-panel
    // rectangle as inside as well, so distance toggles do not close or
    // behave like an apply action.
    if(insidePanelRect) return;
    if(pointIsInsideRect(e, wrap, 10)) return;
    close();
  }, true);

  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") close();
  });
}
