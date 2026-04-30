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


  // DEBUG ONLY: on-screen probe for comparing INDEX vs EVENTS distance toggle behavior.
  function distanceDebugPanel(){
    let el = document.getElementById("distanceToggleDebugPanel");
    if(el) return el;
    el = document.createElement("div");
    el.id = "distanceToggleDebugPanel";
    el.setAttribute("style", [
      "position:fixed", "left:6px", "right:6px", "bottom:6px", "z-index:2147483647",
      "max-height:42vh", "overflow:auto", "background:rgba(0,0,0,.88)", "color:#00ff90",
      "font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace", "padding:8px",
      "border-radius:10px", "box-shadow:0 6px 20px rgba(0,0,0,.45)", "white-space:pre-wrap",
      "pointer-events:none"
    ].join(";"));
    el.textContent = "DISTANCE TOGGLE DEBUG\n";
    document.body.appendChild(el);
    return el;
  }

  function distanceDebugLog(msg, data = {}){
    try{
      const el = distanceDebugPanel();
      const line = `[${new Date().toLocaleTimeString()}] ${msg}` + (Object.keys(data).length ? ` ${JSON.stringify(data)}` : "");
      el.textContent = `${line}\n${el.textContent}`.slice(0, 9000);
    }catch(_){ /* debug only */ }
  }

  function shortRect(el){
    if(!el || typeof el.getBoundingClientRect !== "function") return null;
    const r = el.getBoundingClientRect();
    return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
  }

  function eventPoint(e){
    return { x: Math.round(Number(e?.clientX)), y: Math.round(Number(e?.clientY)) };
  }

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

    function dbg(label, e){
      distanceDebugLog(`${activeMode}:${label}`, {
        mode: mode(),
        activeMode,
        panelHidden: panel.hasAttribute("hidden"),
        sectionHidden: section.hasAttribute("hidden") || !!section.hidden,
        distValue: String(distInput?.value || ""),
        primaryValue: String(input?.value || ""),
        segSelected: String(seg?.dataset?.selected || ""),
        target: e?.target?.id || e?.target?.className || e?.target?.tagName || "",
        point: e ? eventPoint(e) : null,
        segRect: shortRect(seg),
        applyRect: shortRect(distApply),
        inputRect: shortRect(distInput),
      });
    }

    function writeZipToPrimarySearch(zip){
      dbg(`writeZipToPrimarySearch:before:${zip}`);
      input.value = zip;
      if(typeof setSectionQuery === "function") setSectionQuery(zip);
      else if(typeof setActiveEventsQuery === "function") setActiveEventsQuery(zip);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      dbg(`writeZipToPrimarySearch:after:${zip}`);
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
      distanceDebugLog(`${activeMode}:sanitizeZip`, { raw, digits, primaryValue: String(input?.value || "") });
      return digits;
    }

    function zipIsAlreadyApplied(zip){
      if(zip.length !== 5) return false;
      return String(input.value || "").trim() === zip;
    }

    function applyZip({ force = false } = {}){
      dbg(`applyZip:start:force=${force}`);
      // Button/Enter actions come from this exact ZIP section, so do not let
      // the shared view-mode check block the submit. The check remains for
      // passive refreshes and distance-segment changes.
      if(!force && !isActiveMode()) { dbg("applyZip:return:notActive"); return false; }
      const zip = sanitizeZip();
      if(zip.length !== 5) { dbg(`applyZip:return:badZip:${zip}`); return false; }
      // Mirror into the visible primary search bar and update the matching
      // state branch directly: INDEX => indexEvents.q, EVENTS => events.q.
      writeZipToPrimarySearch(zip);
      if(typeof onSelectOrigin === "function") onSelectOrigin(zip);
      scrollFilteredResultsToStart();
      close();
      distInput?.blur();
      input.blur();
      dbg(`applyZip:success:${zip}`);
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
        dbg(`segBtn:click:start:${btn.dataset.miles}`, e);
        if(!isActiveMode()) { dbg("segBtn:click:return:notActive", e); return; }
        e.preventDefault();
        e.stopPropagation();
        const miles = Number(btn.dataset.miles);
        if(!Number.isFinite(miles)) { dbg("segBtn:click:return:badMiles", e); return; }
        setMilesUI(miles);
        if(typeof setMiles === "function") setMiles(miles);
        const zip = sanitizeZip();
        distanceDebugLog(`${activeMode}:segBtn:afterSetMiles`, { miles, zip, zipAlreadyApplied: zipIsAlreadyApplied(zip), primaryValue: String(input?.value || "") });
        if(typeof onSelectOrigin === "function" && zipIsAlreadyApplied(zip)) { distanceDebugLog(`${activeMode}:segBtn:onSelectOrigin`, { zip }); onSelectOrigin(zip); }
        dbg(`segBtn:click:done:${miles}`, e);
      });
    });

    function handleZipValueRefresh(e){
      dbg(`distInput:${e?.type || "refresh"}`, e);
      if(!isActiveMode()) return;
      sanitizeZip();
    }

    distInput?.addEventListener("input", handleZipValueRefresh);
    distInput?.addEventListener("change", handleZipValueRefresh);
    distInput?.addEventListener("blur", handleZipValueRefresh);


    let lastArrowSubmitAt = 0;

    function submitZipFromArrow(e){
      dbg(`submitZipFromArrow:start:${e?.type || "manual"}`, e);
      if(!distInput) return;
      if(e){
        e.preventDefault();
        e.stopPropagation();
      }
      const now = Date.now();
      if(now - lastArrowSubmitAt < 180) { dbg("submitZipFromArrow:return:debounced", e); return; }
      lastArrowSubmitAt = now;
      const ok = applyZip({ force: true });
      dbg(`submitZipFromArrow:done:${ok}`, e);
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
      dbg("setMilesFromSegmentPoint:start", e);
      if(!seg || !e) return false;
      const x = Number(e.clientX);
      if(!Number.isFinite(x)) return false;
      const r = seg.getBoundingClientRect();
      const miles = x < (r.left + (r.width / 2)) ? 15 : 30;
      setMilesUI(miles);
      if(typeof setMiles === "function") setMiles(miles);
      const zip = sanitizeZip();
      distanceDebugLog(`${activeMode}:setMilesFromSegmentPoint:afterSetMiles`, { miles, zip, zipAlreadyApplied: zipIsAlreadyApplied(zip), primaryValue: String(input?.value || "") });
      if(typeof onSelectOrigin === "function" && zipIsAlreadyApplied(zip)) { distanceDebugLog(`${activeMode}:setMilesFromSegmentPoint:onSelectOrigin`, { zip }); onSelectOrigin(zip); }
      dbg(`setMilesFromSegmentPoint:done:${miles}`, e);
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
      const onSeg = pointIsOnDistanceSegment(e);
      const onApply = pointIsOnApplyButton(e);
      distanceDebugLog(`${activeMode}:doc:pointerdown:check`, {
        mode: mode(), activeMode,
        active: isActiveMode(), panelHidden: panel.hasAttribute("hidden"), sectionVisible: isSectionVisible(),
        onSeg, onApply, point: eventPoint(e), target: e?.target?.id || e?.target?.className || e?.target?.tagName || "",
        distValue: String(distInput?.value || ""), primaryValue: String(input?.value || ""),
        segRect: shortRect(seg), applyRect: shortRect(distApply)
      });
      if(!isActiveMode()) return;
      if(panel.hasAttribute("hidden")) return;
      if(!isSectionVisible()) return;

      if(onSeg){
        e.preventDefault();
        e.stopPropagation();
        setMilesFromSegmentPoint(e);
        return;
      }

      if(onApply){
        submitZipFromArrow(e);
      }
    }, true);

    distInput?.addEventListener("keydown", (e)=>{
      dbg(`distInput:keydown:${e.key}`, e);
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
    distanceDebugLog("global:outsidePointerdown", { target: e?.target?.id || e?.target?.className || e?.target?.tagName || "", insideWrap: wrap.contains(e.target), point: eventPoint(e), primaryValue: String(input?.value || "") });
    if(wrap.contains(e.target)) return;
    close();
  }, true);

  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") close();
  });
}
