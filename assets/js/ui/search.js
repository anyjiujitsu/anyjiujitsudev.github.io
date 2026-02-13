// ui/search.js
// purpose: wire search inputs + search suggestion UX

export function wireSearch({ $, state, setIndexQuery, setIndexEventsQuery, setActiveEventsQuery, setIndexDistanceMiles, render, isIndexView, clearIndexDistance }){
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
    // Index view: X should also clear the ZIP distance filter
    const idx = (typeof isIndexView === "function") ? !!isIndexView() : false;
    if(idx && typeof clearIndexDistance === "function") clearIndexDistance();
    render();
  });
}

/* section: search suggestions // purpose: quick-pick common search tokens for Events */
export function wireSearchSuggestions({
  $,
  setActiveEventsQuery,
  isEventsView,
  isIndexView,
  onIndexViewOpen,
  onIndexDistanceSelectOrigin,
}){
  const wrap  = $("eventsSearchWrap");
  const input = $("eventsSearchInput");
  const panel = $("eventsSearchSuggest");
  if(!wrap || !input || !panel) return;

  // sections inside panel
  const quick = $("eventsSearchSuggestQuick");
  const dist  = $("eventsSearchSuggestDistance");
  const distInput = $("distanceOriginInput");
  const distApply = $("distanceApplyBtn");
  const seg = dist?.querySelector(".iosSeg");
  const segBtns = dist?.querySelectorAll(".iosSeg__btn");


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
    if(dist)  dist.hidden  = (m !== "index");
  }

  const open = ()=>{
    if(!canSuggest()) return;
    setModeUI();
    if(panel.hasAttribute("hidden")) panel.removeAttribute("hidden");
    if(mode() === "index" && typeof onIndexViewOpen === "function") onIndexViewOpen();
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

  // INDEX mode: Training Near (ZIP)
  function sanitizeZip(){
    if(!distInput) return "";
    const raw = String(distInput.value || "");
    const digits = raw.replace(/\D/g, "").slice(0, 5);
    if(digits !== raw) distInput.value = digits;
    return digits;
  }

  function applyZip(){
    if(!isIndexView()) return;
    const zip = sanitizeZip();
    if(zip.length !== 5) return;
    // Mirror into the search bar so the user can see the active filter.
    input.value = zip;
    setActiveEventsQuery(zip);
    if(typeof onIndexDistanceSelectOrigin === "function") onIndexDistanceSelectOrigin(zip);
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

  // iOS-style segmented control (Index view only)
  segBtns?.forEach((btn)=>{
    btn.addEventListener("click", (e)=>{
      if(!isIndexView()) return;
      e.preventDefault();
      e.stopPropagation();
      const miles = Number(btn.dataset.miles);
      if(!Number.isFinite(miles)) return;
      setMilesUI(miles);
      if(typeof setIndexDistanceMiles === "function") setIndexDistanceMiles(miles);
      render();
    });
  });

  distInput?.addEventListener("input", ()=>{
    if(!isIndexView()) return;
    sanitizeZip();
  });

  distInput?.addEventListener("keydown", (e)=>{
    if(!isIndexView()) return;
    if(e.key !== "Enter") return;
    e.preventDefault();
    applyZip();
  });

  distApply?.addEventListener("click", (e)=>{
    if(!isIndexView()) return;
    e.preventDefault();
    e.stopPropagation();
    applyZip();
  });

  document.addEventListener("pointerdown", (e)=>{
    if(wrap.contains(e.target)) return;
    close();
  }, true);

  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") close();
  });
}
