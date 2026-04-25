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

  // INDEX mode: Training Near (ZIP)
  // This block intentionally preserves the original INDEX behavior.
  const indexDistInput = $("distanceOriginInput");
  const indexDistApply = $("distanceApplyBtn");
  const indexSeg = indexDist?.querySelector(".iosSeg");
  const indexSegBtns = indexDist?.querySelectorAll(".iosSeg__btn");

  function sanitizeIndexZip(){
    if(!indexDistInput) return "";
    const raw = String(indexDistInput.value || "");
    const digits = raw.replace(/\D/g, "").slice(0, 5);
    if(digits !== raw) indexDistInput.value = digits;
    return digits;
  }

  function applyIndexZip(){
    if(mode() !== "index") return;
    const zip = sanitizeIndexZip();
    if(zip.length !== 5) return;
    input.value = zip;
    setActiveEventsQuery(zip);
    if(typeof onIndexDistanceSelectOrigin === "function") onIndexDistanceSelectOrigin(zip);
    close();
    indexDistInput?.blur();
    input.blur();
  }

  function setIndexMilesUI(miles){
    if(!indexSeg || !indexSegBtns) return;
    const mNum = Number(miles);
    indexSeg.dataset.selected = String(mNum);
    indexSegBtns.forEach((b)=>{
      const m = Number(b.dataset.miles);
      const on = (m === mNum);
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  indexSegBtns?.forEach((btn)=>{
    btn.addEventListener("click", (e)=>{
      if(mode() !== "index") return;
      e.preventDefault();
      e.stopPropagation();
      const miles = Number(btn.dataset.miles);
      if(!Number.isFinite(miles)) return;
      setIndexMilesUI(miles);
      if(typeof setIndexDistanceMiles === "function") setIndexDistanceMiles(miles);
      if(typeof onIndexDistanceSelectOrigin === "function" && sanitizeIndexZip().length === 5){
        onIndexDistanceSelectOrigin(sanitizeIndexZip());
      }
    });
  });

  indexDistInput?.addEventListener("input", ()=>{
    if(mode() !== "index") return;
    sanitizeIndexZip();
  });

  indexDistInput?.addEventListener("keydown", (e)=>{
    if(mode() !== "index") return;
    if(e.key !== "Enter") return;
    e.preventDefault();
    applyIndexZip();
  });

  indexDistApply?.addEventListener("click", (e)=>{
    if(mode() !== "index") return;
    e.preventDefault();
    e.stopPropagation();
    applyIndexZip();
  });

  // EVENTS mode: Events Near (ZIP)
  // Mirrors the INDEX apply pattern, but is scoped only to EVENTS so INDEX stays untouched.
  const eventsDistInput = $("eventsDistanceOriginInput");
  const eventsDistApply = $("eventsDistanceApplyBtn");
  const eventsSeg = eventsDist?.querySelector(".iosSeg");
  const eventsSegBtns = eventsDist?.querySelectorAll(".iosSeg__btn");

  function sanitizeEventsZip(){
    if(!eventsDistInput) return "";
    const raw = String(eventsDistInput.value || "");
    const digits = raw.replace(/\D/g, "").slice(0, 5);
    if(digits !== raw) eventsDistInput.value = digits;
    return digits;
  }

  function applyEventsZip(){
    if(mode() !== "events") return;
    const zip = sanitizeEventsZip();
    if(zip.length !== 5) return;
    input.value = zip;
    setActiveEventsQuery(zip);
    if(typeof onEventsDistanceSelectOrigin === "function") onEventsDistanceSelectOrigin(zip);
    close();
    eventsDistInput?.blur();
    input.blur();
  }

  function setEventsMilesUI(miles){
    if(!eventsSeg || !eventsSegBtns) return;
    const mNum = Number(miles);
    eventsSeg.dataset.selected = String(mNum);
    eventsSegBtns.forEach((b)=>{
      const m = Number(b.dataset.miles);
      const on = (m === mNum);
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  eventsSegBtns?.forEach((btn)=>{
    btn.addEventListener("click", (e)=>{
      if(mode() !== "events") return;
      e.preventDefault();
      e.stopPropagation();
      const miles = Number(btn.dataset.miles);
      if(!Number.isFinite(miles)) return;
      setEventsMilesUI(miles);
      if(typeof setEventsDistanceMiles === "function") setEventsDistanceMiles(miles);
      if(typeof onEventsDistanceSelectOrigin === "function" && sanitizeEventsZip().length === 5){
        onEventsDistanceSelectOrigin(sanitizeEventsZip());
      }
    });
  });

  eventsDistInput?.addEventListener("input", ()=>{
    if(mode() !== "events") return;
    sanitizeEventsZip();
  });

  eventsDistInput?.addEventListener("change", ()=>{
    if(mode() !== "events") return;
    sanitizeEventsZip();
  });

  eventsDistInput?.addEventListener("keydown", (e)=>{
    if(mode() !== "events") return;
    if(e.key !== "Enter") return;
    e.preventDefault();
    applyEventsZip();
  });

  eventsDistApply?.addEventListener("click", (e)=>{
    if(mode() !== "events") return;
    e.preventDefault();
    e.stopPropagation();
    applyEventsZip();
  });

  document.addEventListener("pointerdown", (e)=>{
    if(wrap.contains(e.target)) return;
    close();
  }, true);

  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") close();
  });
}
