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

/* section: search suggestions // purpose: quick-pick common search tokens + one shared ZIP distance control */
export function wireSearchSuggestions({
  $,
  state,
  setActiveEventsQuery,
  setIndexDistanceMiles,
  setEventsDistanceMiles,
  isEventsView,
  isIndexView,
  onIndexViewOpen,
  onEventsViewOpen,
  onIndexDistanceSelectOrigin,
  onEventsDistanceApply,
}){
  const wrap  = $("eventsSearchWrap");
  const input = $("eventsSearchInput");
  const panel = $("eventsSearchSuggest");
  if(!wrap || !input || !panel) return;

  const quick = $("eventsSearchSuggestQuick");
  const distanceSection = $("eventsSearchSuggestDistance");
  const distanceTitle = $("distanceSectionTitle") || distanceSection?.querySelector(".menu__title");
  const distInput = $("distanceOriginInput");
  const distApply = $("distanceApplyBtn");
  const seg = distanceSection?.querySelector(".iosSeg");
  const segBtns = distanceSection ? Array.from(distanceSection.querySelectorAll(".iosSeg__btn")) : [];

  const canSuggest = () => {
    const ev = (typeof isEventsView !== "function") ? true : !!isEventsView();
    const idx = (typeof isIndexView !== "function") ? false : !!isIndexView();
    return ev || idx;
  };

  function mode(){
    return (typeof isIndexView === "function" && isIndexView()) ? "index" : "events";
  }

  function activeDistanceState(){
    return mode() === "index" ? state?.indexEvents : state?.events;
  }

  function setMilesUI(miles){
    if(!seg || !segBtns.length) return;
    const mNum = Number(miles) || 15;
    seg.dataset.selected = String(mNum);
    segBtns.forEach((b)=>{
      const m = Number(b.dataset.miles);
      const on = (m === mNum);
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function syncDistanceSection(){
    const m = mode();
    const distState = activeDistanceState();
    if(distanceTitle) distanceTitle.textContent = (m === "index") ? "TRAINING NEAR" : "EVENTS NEAR";
    if(distanceSection){
      distanceSection.setAttribute("aria-label", m === "index" ? "Training near ZIP" : "Events near ZIP");
      distanceSection.hidden = false;
    }
    if(distInput) distInput.value = String(distState?.distFrom || "");
    setMilesUI(distState?.distMiles || 15);
  }

  function setModeUI(){
    const m = mode();
    if(quick) quick.hidden = (m !== "events");
    syncDistanceSection();
  }

  const open = ()=>{
    if(!canSuggest()) return;
    setModeUI();
    if(panel.hasAttribute("hidden")) panel.removeAttribute("hidden");
    if(mode() === "index" && typeof onIndexViewOpen === "function") onIndexViewOpen();
    if(mode() === "events" && typeof onEventsViewOpen === "function") onEventsViewOpen();
    syncDistanceSection();
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
    close();
    input.blur();
  });

  function sanitizeZip(){
    if(!distInput) return "";
    const raw = String(distInput.value || "");
    const digits = raw.replace(/\D/g, "").slice(0, 5);
    if(digits !== raw) distInput.value = digits;
    return digits;
  }

  function applyDistanceZip(){
    if(!canSuggest()) return;
    const zip = sanitizeZip();
    if(zip.length !== 5) return;

    input.value = zip;
    setActiveEventsQuery(zip);

    if(mode() === "index"){
      if(typeof onIndexDistanceSelectOrigin === "function") onIndexDistanceSelectOrigin(zip);
    }else if(typeof onEventsDistanceApply === "function"){
      onEventsDistanceApply(zip);
    }

    close();
    distInput?.blur();
    input.blur();
  }

  segBtns.forEach((btn)=>{
    btn.addEventListener("click", (e)=>{
      if(!canSuggest()) return;
      e.preventDefault();
      e.stopPropagation();
      const miles = Number(btn.dataset.miles);
      if(!Number.isFinite(miles)) return;
      setMilesUI(miles);
      const zip = sanitizeZip();
      if(mode() === "index"){
        if(typeof setIndexDistanceMiles === "function") setIndexDistanceMiles(miles);
        if(zip.length === 5 && typeof onIndexDistanceSelectOrigin === "function") onIndexDistanceSelectOrigin(zip);
      }else{
        if(typeof setEventsDistanceMiles === "function") setEventsDistanceMiles(miles);
        if(zip.length === 5 && typeof onEventsDistanceApply === "function") onEventsDistanceApply(zip);
      }
    });
  });

  distInput?.addEventListener("input", sanitizeZip);
  distInput?.addEventListener("change", sanitizeZip);
  distInput?.addEventListener("blur", sanitizeZip);

  distInput?.addEventListener("keydown", (e)=>{
    if(e.key !== "Enter") return;
    e.preventDefault();
    applyDistanceZip();
  });

  distApply?.addEventListener("click", (e)=>{
    e.preventDefault();
    e.stopPropagation();
    applyDistanceZip();
  });

  document.addEventListener("pointerdown", (e)=>{
    if(wrap.contains(e.target)) return;
    close();
  }, true);

  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") close();
  });
}
