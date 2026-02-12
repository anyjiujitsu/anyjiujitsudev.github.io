// ui/search.js
// purpose: wire search inputs + search suggestion UX

export function wireSearch({ $, setIndexQuery, setIndexEventsQuery, setActiveEventsQuery, render }){
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

  // INDEX mode: Training Near (typeahead)
  function matchesDatalist(val){
    const list = document.getElementById("distanceOriginList");
    if(!list) return false;
    const opts = list.querySelectorAll("option");
    for(const o of opts){
      if(o.value === val) return true;
    }
    return false;
  }

  distInput?.addEventListener("input", ()=>{
    if(mode() !== "index") return;
    const val = String(distInput.value || "").trim();
    if(!val){
      if(typeof onIndexDistanceSelectOrigin === "function") onIndexDistanceSelectOrigin("");
      return;
    }
    // Only apply when the user has selected a full suggestion.
    if(matchesDatalist(val)){
      if(typeof onIndexDistanceSelectOrigin === "function") onIndexDistanceSelectOrigin(val);
    }
  });

  // When user hits Enter, attempt to apply if exact match.
  distInput?.addEventListener("keydown", (e)=>{
    if(mode() !== "index") return;
    if(e.key !== "Enter") return;
    const val = String(distInput.value || "").trim();
    if(matchesDatalist(val)){
      e.preventDefault();
      if(typeof onIndexDistanceSelectOrigin === "function") onIndexDistanceSelectOrigin(val);
      close();
      distInput.blur();
    }
  });

  document.addEventListener("pointerdown", (e)=>{
    if(wrap.contains(e.target)) return;
    close();
  }, true);

  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") close();
  });
}
