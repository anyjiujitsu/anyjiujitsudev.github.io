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

  function distanceDebugPanel(){
    let el = document.getElementById("distanceToggleDebugPanel");
    if(el) return el;
    el = document.createElement("div");
    el.id = "distanceToggleDebugPanel";
    el.style.cssText = "position:fixed;left:6px;right:6px;bottom:6px;z-index:2147483647;max-height:36vh;overflow:auto;background:rgba(0,0,0,.88);color:#fff;font:11px/1.35 monospace;padding:8px;border-radius:8px;white-space:pre-wrap;";
    el.textContent = "DISTANCE TOGGLE DEBUG\n";
    document.body.appendChild(el);
    return el;
  }

  function distanceDebugLog(msg){
    const el = distanceDebugPanel();
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.textContent = `${line}\n${el.textContent}`.slice(0, 9000);
  }

  function rectSummary(el){
    if(!el) return "none";
    const r = el.getBoundingClientRect();
    return `L${Math.round(r.left)} T${Math.round(r.top)} R${Math.round(r.right)} B${Math.round(r.bottom)} W${Math.round(r.width)} H${Math.round(r.height)}`;
  }

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

    function writeZipToPrimarySearch(zip){
      input.value = zip;
      if(typeof setSectionQuery === "function") setSectionQuery(zip);
      else if(typeof setActiveEventsQuery === "function") setActiveEventsQuery(zip);
      input.dispatchEvent(new Event("input", { bubbles: true }));
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

    function sanitizeZip(){
      if(!distInput) return "";
      const raw = String(distInput.value || "");
      const digits = raw.replace(/\D/g, "").slice(0, 5);
      if(digits !== raw) distInput.value = digits;
      return digits;
    }

    function applyZip({ force = false } = {}){
      // Button/Enter actions come from this exact ZIP section, so do not let
      // the shared view-mode check block the submit. The check remains for
      // passive refreshes and distance-segment changes.
      if(!force && !isActiveMode()) return false;
      const zip = sanitizeZip();
      if(zip.length !== 5) return false;
      // Mirror into the visible primary search bar and update the matching
      // state branch directly: INDEX => indexEvents.q, EVENTS => events.q.
      writeZipToPrimarySearch(zip);
      if(typeof onSelectOrigin === "function") onSelectOrigin(zip);
      scrollFilteredResultsToStart();
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
        distanceDebugLog(`${activeMode}:seg click START targetMiles=${btn.dataset.miles} zip=${distInput?.value || ""} primary=${input?.value || ""} segRect=${rectSummary(seg)} applyRect=${rectSummary(distApply)} target=${e.target?.className || e.target?.id || e.target?.tagName}`);
        if(!isActiveMode()) { distanceDebugLog(`${activeMode}:seg click ignored inactive`); return; }
        e.preventDefault();
        e.stopPropagation();
        const miles = Number(btn.dataset.miles);
        if(!Number.isFinite(miles)) { distanceDebugLog(`${activeMode}:seg click bad miles`); return; }
        setMilesUI(miles);
        if(typeof setMiles === "function") setMiles(miles);
        if(typeof onSelectOrigin === "function" && sanitizeZip().length === 5) onSelectOrigin(sanitizeZip());
        distanceDebugLog(`${activeMode}:seg click DONE miles=${miles} zip=${distInput?.value || ""} primary=${input?.value || ""}`);
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
      distanceDebugLog(`${activeMode}:submitZipFromArrow event=${e?.type || "none"} x=${Math.round(Number(e?.clientX))} y=${Math.round(Number(e?.clientY))} zip=${distInput?.value || ""} primaryBefore=${input?.value || ""}`);
      if(!distInput) return;
      if(e){
        e.preventDefault();
        e.stopPropagation();
      }
      const now = Date.now();
      if(now - lastArrowSubmitAt < 180) { distanceDebugLog(`${activeMode}:submit debounced`); return; }
      lastArrowSubmitAt = now;
      const ok = applyZip({ force: true });
      distanceDebugLog(`${activeMode}:submitZipFromArrow after ok=${ok} primaryAfter=${input?.value || ""}`);
    }

    function pointIsInsideElement(e, el, slop = 0){
      if(!el || !e) return false;
      const x = Number(e.clientX);
      const y = Number(e.clientY);
      if(!Number.isFinite(x) || !Number.isFinite(y)) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left - slop &&
             x <= r.right + slop &&
             y >= r.top - slop &&
             y <= r.bottom + slop;
    }

    function pointIsOnApplyButton(e){
      if(!distApply || !e) return false;

      const hint = section.querySelector(".distance__hint");
      const inSeg = pointIsInsideElement(e, seg, 14);
      const inHint = pointIsInsideElement(e, hint, 8);
      const inInput = pointIsInsideElement(e, distInput, 6);
      const inApply = pointIsInsideElement(e, distApply, 10);
      const result = !inSeg && !inHint && !inInput && inApply;
      distanceDebugLog(`${activeMode}:pointCheck type=${e.type} x=${Math.round(Number(e.clientX))} y=${Math.round(Number(e.clientY))} target=${e.target?.className || e.target?.id || e.target?.tagName} inSeg=${inSeg} inHint=${inHint} inInput=${inInput} inApply=${inApply} RESULT=${result} seg=${rectSummary(seg)} hint=${rectSummary(hint)} apply=${rectSummary(distApply)}`);
      return result;
    }

    // Normal path: the actual arrow button receives the click.
    distApply?.addEventListener("click", (e)=>{
      distanceDebugLog(`${activeMode}:distApply CLICK target=${e.target?.className || e.target?.id || e.target?.tagName}`);
      submitZipFromArrow(e);
    });

    // Mobile Safari/Chrome can commit an autocomplete ZIP, then send the first
    // arrow tap through to the page underneath instead of to the visible button.
    // Capture that same physical tap by coordinates before the outside-click
    // closer runs. This remains shared for INDEX and EVENTS; it is not an
    // EVENTS-only workaround, and it only fires when the tap lands on the
    // visible arrow button rectangle.
    document.addEventListener("pointerdown", (e)=>{
      if(!isActiveMode()) return;
      if(panel.hasAttribute("hidden")) return;
      if(!isSectionVisible()) return;
      distanceDebugLog(`${activeMode}:doc pointerdown active visible x=${Math.round(Number(e.clientX))} y=${Math.round(Number(e.clientY))} target=${e.target?.className || e.target?.id || e.target?.tagName} zip=${distInput?.value || ""} primary=${input?.value || ""}`);
      if(!pointIsOnApplyButton(e)) return;
      submitZipFromArrow(e);
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

  document.addEventListener("pointerdown", (e)=>{
    const inside = wrap.contains(e.target);
    distanceDebugLog(`OUTSIDE-CLOSE pointerdown insideWrap=${inside} target=${e.target?.className || e.target?.id || e.target?.tagName} x=${Math.round(Number(e.clientX))} y=${Math.round(Number(e.clientY))}`);
    if(inside) return;
    close();
  }, true);

  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") close();
  });
}
