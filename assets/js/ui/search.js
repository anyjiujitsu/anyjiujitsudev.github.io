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

  const zipScrollDebug = (()=>{
    const max = 28;
    const lines = [];
    let box = null;
    function ensure(){
      if(box) return box;
      box = document.createElement("div");
      box.id = "zipScrollDebugPanel";
      box.setAttribute("aria-hidden", "true");
      Object.assign(box.style, {
        position: "fixed",
        left: "6px",
        right: "6px",
        top: "6px",
        zIndex: "2147483647",
        maxHeight: "112px",
        overflow: "auto",
        background: "rgba(0,0,0,.82)",
        color: "#fff",
        font: "10px/1.25 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        padding: "5px 6px",
        borderRadius: "8px",
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        boxShadow: "0 2px 12px rgba(0,0,0,.35)"
      });
      document.documentElement.appendChild(box);
      return box;
    }
    function val(id){
      const el = typeof $ === "function" ? $(id) : document.getElementById(id);
      return el ? String(el.value || "") : "∅";
    }
    function view(){
      try { return mode(); } catch { return "?"; }
    }
    function log(label, data = {}){
      const y = Math.round(window.scrollY || 0);
      const payload = Object.entries(data).map(([k,v])=>`${k}=${v}`).join(" ");
      const line = `${new Date().toLocaleTimeString().split(" ")[0]} ${view()} y=${y} p=${val("eventsSearchInput")} iz=${val("distanceOriginInput")} ez=${val("eventsDistanceOriginInput")} ${label}${payload ? " " + payload : ""}`;
      lines.unshift(line);
      lines.length = Math.min(lines.length, max);
      ensure().textContent = ["ZIP SCROLL DEBUG", ...lines].join("\n");
      window.__zipScrollDebugLogs = lines.slice();
    }
    function rect(el){
      if(!el) return "∅";
      const r = el.getBoundingClientRect();
      return `${Math.round(r.top)},${Math.round(r.bottom)},h${Math.round(r.height)}`;
    }
    return { log, rect };
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
    setModeUI();
    if(panel.hasAttribute("hidden")) panel.removeAttribute("hidden");
    zipScrollDebug.log("panel:open", { panel: zipScrollDebug.rect(panel) });
    if(mode() === "index" && typeof onIndexViewOpen === "function") onIndexViewOpen();
    if(mode() === "events" && typeof onEventsViewOpen === "function") onEventsViewOpen();
  };

  const close = ()=>{
    zipScrollDebug.log("panel:close", { panel: zipScrollDebug.rect(panel) });
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
      zipScrollDebug.log(`${activeMode}:writeZip:before`, { zip });
      input.value = zip;
      if(typeof setSectionQuery === "function") setSectionQuery(zip);
      else if(typeof setActiveEventsQuery === "function") setActiveEventsQuery(zip);
      zipScrollDebug.log(`${activeMode}:writeZip:dispatchInput`, { zip });
      input.dispatchEvent(new Event("input", { bubbles: true }));
      zipScrollDebug.log(`${activeMode}:writeZip:after`, { zip });
    }

    function scrollFilteredResultsToStart(){
      const rootId = activeMode === "index" ? "indexEventsRoot" : "eventsRoot";
      const root = $(rootId);
      if(!root) { zipScrollDebug.log(`${activeMode}:scroll:noRoot`, { rootId }); return; }

      zipScrollDebug.log(`${activeMode}:scroll:schedule`, { rootId, root: zipScrollDebug.rect(root) });
      window.requestAnimationFrame(()=>{
        zipScrollDebug.log(`${activeMode}:scroll:raf1`, { root: zipScrollDebug.rect(root) });
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
          zipScrollDebug.log(`${activeMode}:scroll:raf2:before`, {
            target: target.className || target.id || target.tagName,
            rect: zipScrollDebug.rect(target),
            header: zipScrollDebug.rect(header),
            headerH, gap, to: Math.round(y)
          });
          window.scrollTo({ top: y, left: 0, behavior: "auto" });
          zipScrollDebug.log(`${activeMode}:scroll:afterScroll`, { to: Math.round(y), target: zipScrollDebug.rect(target) });
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
      zipScrollDebug.log(`${activeMode}:applyZip:start`, { force, active: isActiveMode(), section: isSectionVisible() });
      // Button/Enter actions come from this exact ZIP section, so do not let
      // the shared view-mode check block the submit. The check remains for
      // passive refreshes and distance-segment changes.
      if(!force && !isActiveMode()) { zipScrollDebug.log(`${activeMode}:applyZip:return:notActive`); return false; }
      const zip = sanitizeZip();
      if(zip.length !== 5) { zipScrollDebug.log(`${activeMode}:applyZip:return:badZip`, { zip }); return false; }
      // Mirror into the visible primary search bar and update the matching
      // state branch directly: INDEX => indexEvents.q, EVENTS => events.q.
      writeZipToPrimarySearch(zip);
      zipScrollDebug.log(`${activeMode}:applyZip:beforeOnSelect`, { zip });
      if(typeof onSelectOrigin === "function") onSelectOrigin(zip);
      zipScrollDebug.log(`${activeMode}:applyZip:afterOnSelect`, { zip });
      scrollFilteredResultsToStart();
      close();
      distInput?.blur();
      input.blur();
      zipScrollDebug.log(`${activeMode}:applyZip:done`, { zip });
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
      zipScrollDebug.log(`${activeMode}:submitArrow:start`, { type: e?.type || "manual" });
      if(!distInput) return;
      if(e){
        e.preventDefault();
        if(typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        else e.stopPropagation();
      }
      const now = Date.now();
      if(now - lastArrowSubmitAt < 180) { zipScrollDebug.log(`${activeMode}:submitArrow:debounced`); return; }
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
      zipScrollDebug.log(`${activeMode}:docPointer`, { x: Math.round(e.clientX||0), y: Math.round(e.clientY||0), onSeg, onApply });

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
    const inWrap = wrap.contains(e.target);
    const inPanelRect = !panel.hasAttribute("hidden") && pointIsInsideRect(e, panel, 10);
    const inWrapRect = pointIsInsideRect(e, wrap, 10);
    zipScrollDebug.log("outside:pointer", { x: Math.round(e.clientX||0), y: Math.round(e.clientY||0), inWrap, inPanelRect, inWrapRect });
    if(inWrap) return;
    // On mobile, taps on the visible helper controls can be reported as
    // targets on the page underneath. Treat the physical helper-panel
    // rectangle as inside as well, so distance toggles do not close or
    // behave like an apply action.
    if(inPanelRect) return;
    if(inWrapRect) return;
    close();
  }, true);

  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") close();
  });
}
