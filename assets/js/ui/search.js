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
  }){
    if(!section) return;
    const distInput = $(inputId);
    const distApply = $(applyId);
    const seg = section.querySelector(".iosSeg");
    const segBtns = section.querySelectorAll(".iosSeg__btn");

    const isSectionVisible = () => !section.hasAttribute("hidden") && !section.hidden;
    const isActiveMode = () => mode() === activeMode || (activeMode === "events" && isSectionVisible());

    function sanitizeZip(){
      if(!distInput) return "";
      const raw = String(distInput.value || "");
      const digits = raw.replace(/\D/g, "").slice(0, 5);
      if(digits !== raw) distInput.value = digits;
      return digits;
    }

    function applyZip(){
      if(!isActiveMode()) return false;
      const zip = sanitizeZip();
      if(zip.length !== 5) return false;
      // Mirror into the search bar so the user can see the active distance filter.
      input.value = zip;
      setActiveEventsQuery(zip);
      if(typeof onSelectOrigin === "function") onSelectOrigin(zip);
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
        if(typeof onSelectOrigin === "function" && sanitizeZip().length === 5) onSelectOrigin(sanitizeZip());
      });
    });

    function handleZipValueRefresh(){
      if(!isActiveMode()) return;
      sanitizeZip();
    }

    distInput?.addEventListener("input", handleZipValueRefresh);
    distInput?.addEventListener("change", handleZipValueRefresh);
    distInput?.addEventListener("blur", handleZipValueRefresh);


    distInput?.addEventListener("keydown", (e)=>{
      if(!isActiveMode()) return;
      if(e.key !== "Enter") return;
      e.preventDefault();
      applyZip();
    });

    let lastApplyTap = 0;
    let applyRetryToken = 0;

    function runApplyRetries(){
      // The arrow/submit button is the only thing that promotes the ZIP
      // into the main search bar. Mobile suggestions can commit slightly
      // after release, so retry briefly after the submit event only.
      distInput?.blur();
      const token = ++applyRetryToken;
      const delays = [0, 40, 100, 180, 300, 500, 800, 1200];
      delays.forEach((delay)=>{
        window.setTimeout(()=>{
          if(token !== applyRetryToken) return;
          if(applyZip()) applyRetryToken += 1;
        }, delay);
      });
    }

    function scheduleApplyZip(e){
      if(!isActiveMode()) return;
      if(e){
        e.preventDefault();
        e.stopPropagation();
      }
      const now = Date.now();
      if(now - lastApplyTap < 180) return;
      lastApplyTap = now;
      runApplyRetries();
    }

    // Submit only from release/click/keyboard events. Do not submit from
    // touchstart/pointerdown: on mobile that can run before the selected
    // ZIP suggestion has become the input value.
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
  });

  // Capture-phase submit fallback for the distance arrow buttons.
  // This is intentionally tied only to the arrow buttons: selecting a mobile
  // ZIP suggestion still fills only the ZIP box. The fallback catches mobile
  // cases where the button normal click path is swallowed by focus/blur.
  let delegatedApplyStamp = 0;

  function submitDistanceFromButton(btn){
    const isIndexBtn = btn && btn.id === "distanceApplyBtn";
    const isEventsBtn = btn && btn.id === "eventsDistanceApplyBtn";
    if(!isIndexBtn && !isEventsBtn) return false;

    const active = mode();
    if(isIndexBtn && active !== "index") return false;
    if(isEventsBtn && active !== "events") return false;

    const distInput = $(isIndexBtn ? "distanceOriginInput" : "eventsDistanceOriginInput");
    const searchInput = $("eventsSearchInput");
    if(!distInput || !searchInput) return false;

    const applyOrigin = isIndexBtn ? onIndexDistanceSelectOrigin : onEventsDistanceSelectOrigin;
    const token = ++delegatedApplyStamp;

    distInput.blur();

    const tryApply = ()=>{
      if(token !== delegatedApplyStamp) return true;
      const raw = String(distInput.value || "");
      const zip = raw.replace(/\D/g, "").slice(0, 5);
      if(zip !== raw) distInput.value = zip;
      if(zip.length !== 5) return false;

      searchInput.value = zip;
      setActiveEventsQuery(zip);
      if(typeof applyOrigin === "function") applyOrigin(zip);
      close();
      searchInput.blur();
      delegatedApplyStamp += 1;
      return true;
    };

    [0, 40, 100, 180, 300, 500, 800, 1200].forEach((delay)=>{
      window.setTimeout(tryApply, delay);
    });

    return true;
  }

  function handleDelegatedDistanceSubmit(e){
    const btn = e.target?.closest?.("#distanceApplyBtn, #eventsDistanceApplyBtn");
    if(!btn) return;
    e.preventDefault();
    e.stopPropagation();
    submitDistanceFromButton(btn);
  }

  panel.addEventListener("touchend", handleDelegatedDistanceSubmit, { capture: true, passive: false });
  panel.addEventListener("pointerup", handleDelegatedDistanceSubmit, true);
  panel.addEventListener("click", handleDelegatedDistanceSubmit, true);

  document.addEventListener("pointerdown", (e)=>{
    if(wrap.contains(e.target)) return;
    close();
  }, true);

  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") close();
  });
}
