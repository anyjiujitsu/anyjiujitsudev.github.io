// ui/search.js
// purpose: wire search inputs + search suggestion UX

function flashDebugLog(label, data = {}){
  try{
    const stamp = (performance.now() / 1000).toFixed(3);
    const parts = Object.entries(data).map(([k,v])=>`${k}=${String(v)}`);
    const line = `${stamp} ${label}${parts.length ? " | " + parts.join(" ") : ""}`;
    window.__ANY_FLASH_LOGS = window.__ANY_FLASH_LOGS || [];
    window.__ANY_FLASH_LOGS.unshift(line);
    window.__ANY_FLASH_LOGS.length = Math.min(window.__ANY_FLASH_LOGS.length, 80);
    let box = document.getElementById("anyFlashDebugPanel");
    if(!box){
      box = document.createElement("pre");
      box.id = "anyFlashDebugPanel";
      box.setAttribute("aria-hidden", "true");
      Object.assign(box.style, {
        position: "fixed",
        left: "6px",
        right: "6px",
        top: "6px",
        maxHeight: "118px",
        overflow: "hidden",
        margin: "0",
        padding: "5px 6px",
        zIndex: "2147483647",
        background: "rgba(0,0,0,.78)",
        color: "#b9ffb9",
        font: "9px/1.15 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        borderRadius: "7px",
        whiteSpace: "pre-wrap",
        pointerEvents: "none"
      });
      document.documentElement.appendChild(box);
    }
    box.textContent = window.__ANY_FLASH_LOGS.slice(0, 13).join("\n");
    if(window.console && console.debug) console.debug("[ANY flash]", line);
  }catch(_err){}
}

function flashRect(id){
  try{
    const el = document.getElementById(id) || document.querySelector(id);
    if(!el) return "missing";
    const r = el.getBoundingClientRect();
    return `${Math.round(r.top)},${Math.round(r.height)},${Math.round(r.bottom)}`;
  }catch(_err){ return "err"; }
}

function flashCounts(){
  const evRoot = document.getElementById("eventsRoot");
  const idxRoot = document.getElementById("indexEventsRoot");
  return {
    y: Math.round(window.scrollY || 0),
    header: flashRect("header"),
    sticky: flashRect("stickyFilters"),
    evRoot: flashRect("eventsRoot"),
    idxRoot: flashRect("indexEventsRoot"),
    evKids: evRoot ? evRoot.children.length : "?",
    idxKids: idxRoot ? idxRoot.children.length : "?",
    evVal: document.getElementById("eventsSearchInput")?.value || "",
    idxVal: document.getElementById("searchInput")?.value || "",
  };
}


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
    flashDebugLog("search:open:start", { mode: mode(), ...flashCounts() });
    if(!canSuggest()) return;
    setModeUI();
    if(panel.hasAttribute("hidden")) panel.removeAttribute("hidden");
    if(mode() === "index" && typeof onIndexViewOpen === "function") onIndexViewOpen();
    if(mode() === "events" && typeof onEventsViewOpen === "function") onEventsViewOpen();
  };

  const close = ()=>{
    flashDebugLog("search:close", { mode: mode(), ...flashCounts() });
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

    function writeZipToPrimarySearch(zip, { dispatch = false } = {}){
      flashDebugLog(`${activeMode}:writeZip:before`, { zip, dispatch, ...flashCounts() });
      input.value = zip;
      if(typeof setSectionQuery === "function") setSectionQuery(zip);
      else if(typeof setActiveEventsQuery === "function") setActiveEventsQuery(zip);
      if(dispatch){
        flashDebugLog(`${activeMode}:writeZip:dispatchInput`, flashCounts());
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      flashDebugLog(`${activeMode}:writeZip:after`, { zip, dispatch, ...flashCounts() });
    }

    function prePositionResultsBeforeRender(){
      flashDebugLog(`${activeMode}:prePosition:start`, flashCounts());
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
      flashDebugLog(`${activeMode}:prePosition:target`, { y: Math.round(y), curY: Math.round(window.scrollY || 0), rootRect: flashRect(rootId), header: flashRect("header") });
      if(Math.abs(window.scrollY - y) > 1){
        window.scrollTo({ top: y, left: 0, behavior: "auto" });
        flashDebugLog(`${activeMode}:prePosition:afterScroll`, flashCounts());
      }
    }

    function scrollFilteredResultsToStart(){
      flashDebugLog(`${activeMode}:postScroll:schedule`, flashCounts());
      const rootId = activeMode === "index" ? "indexEventsRoot" : "eventsRoot";
      const root = $(rootId);
      if(!root) return;

      // Wait until the synchronous render triggered by onSelectOrigin has
      // replaced the list, then align the viewport just above the first group
      // label. This lands slightly higher than the first result card, keeping
      // the group name visible as the start of the filtered list.
      window.requestAnimationFrame(()=>{
        flashDebugLog(`${activeMode}:postScroll:raf1`, flashCounts());
        window.requestAnimationFrame(()=>{
          flashDebugLog(`${activeMode}:postScroll:raf2`, flashCounts());
          const firstGroupLabel = root.querySelector(".group__label");
          const firstGroup = root.querySelector(".group");
          const firstResult = root.querySelector(".row--events, .row");
          const target = firstGroupLabel || firstGroup || firstResult || root;
          const rect = target.getBoundingClientRect();
          const header = document.querySelector(".header");
          const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
          const gap = 14;
          const y = Math.max(0, window.scrollY + rect.top - headerH - gap);
          flashDebugLog(`${activeMode}:postScroll:target`, { y: Math.round(y), targetTop: Math.round(rect.top), headerH, ...flashCounts() });
          window.scrollTo({ top: y, left: 0, behavior: "auto" });
          flashDebugLog(`${activeMode}:postScroll:after`, flashCounts());
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
      flashDebugLog(`${activeMode}:applyZip:start`, { force, zip: distInput?.value || "", ...flashCounts() });
      // Button/Enter actions come from this exact ZIP section, so do not let
      // the shared view-mode check block the submit. The check remains for
      // passive refreshes and distance-segment changes.
      if(!force && !isActiveMode()){ flashDebugLog(`${activeMode}:applyZip:return:notActive`, flashCounts()); return false; }
      const zip = sanitizeZip();
      if(zip.length !== 5){ flashDebugLog(`${activeMode}:applyZip:return:badZip`, { zip, ...flashCounts() }); return false; }
      // Pre-position first, then update q + distFrom in the same synchronous
      // path. Do not close the helper until after render has rebuilt the final
      // filtered list; this keeps the helper covering the old list during the
      // update and avoids the visible old-list/new-list flash on EVENTS.
      prePositionResultsBeforeRender();
      writeZipToPrimarySearch(zip, { dispatch: false });
      if(typeof onSelectOrigin === "function"){
        flashDebugLog(`${activeMode}:onSelectOrigin:before`, { zip, ...flashCounts() });
        onSelectOrigin(zip);
        flashDebugLog(`${activeMode}:onSelectOrigin:after`, { zip, ...flashCounts() });
      }
      scrollFilteredResultsToStart();
      close();
      distInput?.blur();
      input.blur();
      flashDebugLog(`${activeMode}:applyZip:done`, flashCounts());
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
      flashDebugLog(`${activeMode}:submitArrow:start`, { type: e?.type || "", x: Math.round(Number(e?.clientX)||0), y: Math.round(Number(e?.clientY)||0), ...flashCounts() });
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
      flashDebugLog(`${activeMode}:docPointer`, { x: Math.round(Number(e.clientX)||0), y: Math.round(Number(e.clientY)||0), onSeg: pointIsOnDistanceSegment(e), onApply: pointIsOnApplyButton(e), target: e.target?.id || e.target?.className || e.target?.tagName || "", ...flashCounts() });
      if(panel.hasAttribute("hidden")) return;
      if(!isSectionVisible()) return;

      if(pointIsOnDistanceSegment(e)){
        e.preventDefault();
        if(typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        else e.stopPropagation();
        setMilesFromSegmentPoint(e);
        return;
      }

      if(pointIsOnApplyButton(e)){
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
    flashDebugLog("outside:pointer", { target: e.target?.id || e.target?.className || e.target?.tagName || "", inWrap: wrap.contains(e.target), inPanelRect: (!panel.hasAttribute("hidden") && pointIsInsideRect(e, panel, 10)), ...flashCounts() });
    if(wrap.contains(e.target)) return;
    // On mobile, taps on the visible helper controls can be reported as
    // targets on the page underneath. Treat the physical helper-panel
    // rectangle as inside as well, so distance toggles do not close or
    // behave like an apply action.
    if(!panel.hasAttribute("hidden") && pointIsInsideRect(e, panel, 10)) return;
    if(pointIsInsideRect(e, wrap, 10)) return;
    close();
  }, true);

  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") close();
  });
}
