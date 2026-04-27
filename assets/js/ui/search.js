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
  onEventsDistanceApply,
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
    onApplyZip,
  }){
    if(!section) return;
    const distInput = $(inputId);
    const distApply = $(applyId);
    const seg = section.querySelector(".iosSeg");
    const segBtns = section.querySelectorAll(".iosSeg__btn");

    const isSectionVisible = () => !section.hasAttribute("hidden") && !section.hidden;
    const isActiveMode = () => mode() === activeMode || (activeMode === "events" && isSectionVisible());

    // iOS Safari can display a suggested value in an input before the normal
    // .value read is reliable. Keep the last ZIP-like value that appears
    // through any input-style event, then use that as a fallback on submit.
    let lastCommittedZip = "";

    function zipDigits(value){
      return String(value || "").replace(/\D/g, "").slice(0, 5);
    }

    function rememberZip(value){
      const digits = zipDigits(value);
      if(digits) lastCommittedZip = digits;
      return digits;
    }

    function sanitizeZip({ allowFallback = false } = {}){
      if(!distInput) return allowFallback ? lastCommittedZip : "";
      const raw = String(distInput.value || "");
      let digits = rememberZip(raw);

      // Some iOS suggested/autofill commits expose the chosen text through
      // beforeinput/input before it is reflected in input.value at submit time.
      if(!digits && allowFallback) digits = lastCommittedZip;

      if(digits && distInput.value !== digits) distInput.value = digits;
      return digits;
    }

    function applyZip(){
      if(!isActiveMode()) return;
      const zip = sanitizeZip({ allowFallback: true });
      if(zip.length !== 5) return;
      // Mirror into the search bar so the user can see the active distance filter.
      input.value = zip;
      setActiveEventsQuery(zip);
      if(typeof onApplyZip === "function") onApplyZip(zip);
      else if(typeof onSelectOrigin === "function") onSelectOrigin(zip);
      close();
      distInput?.blur();
      input.blur();
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
        if(typeof onSelectOrigin === "function" && sanitizeZip().length === 5) onSelectOrigin(sanitizeZip());
      });
    });

    function handleZipValueRefresh(e){
      if(!isActiveMode()) return;
      if(e && typeof e.data === "string") rememberZip(e.data);
      sanitizeZip({ allowFallback: true });
    }

    distInput?.addEventListener("beforeinput", (e)=>{
      if(!isActiveMode()) return;
      if(e && typeof e.data === "string") rememberZip(e.data);
    });
    distInput?.addEventListener("input", handleZipValueRefresh);
    distInput?.addEventListener("change", handleZipValueRefresh);
    distInput?.addEventListener("keyup", handleZipValueRefresh);
    distInput?.addEventListener("blur", handleZipValueRefresh);

    distInput?.addEventListener("keydown", (e)=>{
      if(!isActiveMode()) return;
      if(e.key !== "Enter") return;
      e.preventDefault();
      applyZip();
    });

    let lastApplyTap = 0;
    function scheduleApplyZip(e){
      if(!isActiveMode()) return;
      if(e){
        e.preventDefault();
        e.stopPropagation();
      }
      const now = Date.now();
      if(now - lastApplyTap < 180) return;
      lastApplyTap = now;
      // Mobile Safari can commit suggested/autofilled values after the tap cycle.
      // Blur first, then read after a short delay so the value is real, not just visual.
      distInput?.blur();
      window.setTimeout(applyZip, activeMode === "events" ? 90 : 0);
    }

    distApply?.addEventListener("touchend", scheduleApplyZip, { passive: false });
    distApply?.addEventListener("pointerup", scheduleApplyZip);
    distApply?.addEventListener("click", scheduleApplyZip);
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
    onApplyZip: onEventsDistanceApply,
  });

  document.addEventListener("pointerdown", (e)=>{
    if(wrap.contains(e.target)) return;
    close();
  }, true);

  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") close();
  });
}
