// ui/search.js
// purpose: wire search inputs + search suggestion UX

// TEMP DIAGNOSTIC BUILD: on-screen EVENTS ZIP debug logger.
// Remove after diagnosing the mobile first-tap ZIP issue.
const ZIP_DEBUG_ENABLED = true;
const ZIP_DEBUG_MAX_LINES = 90;
let __zipDebugBox = null;
let __zipDebugLines = [];

function zipDebugValue(el){
  if(!el) return "<missing>";
  return String(el.value ?? "");
}

function zipDebugShortTarget(target){
  if(!target) return "<none>";
  const id = target.id ? `#${target.id}` : "";
  const cls = typeof target.className === "string" && target.className ? `.${target.className.trim().replace(/\s+/g, ".")}` : "";
  return `${target.tagName || target.nodeName || "?"}${id}${cls}`;
}

function zipDebugPanel(){
  if(!ZIP_DEBUG_ENABLED) return null;
  if(__zipDebugBox) return __zipDebugBox;
  const box = document.createElement("div");
  box.id = "zipDebugPanel";
  box.style.cssText = [
    "position:fixed", "left:8px", "right:8px", "bottom:8px",
    "z-index:2147483647", "max-height:42vh", "overflow:auto",
    "background:rgba(0,0,0,.88)", "color:#fff",
    "font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace",
    "padding:8px", "border-radius:10px", "box-shadow:0 8px 30px rgba(0,0,0,.35)",
    "white-space:pre-wrap"
  ].join(";");
  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:6px;";
  const title = document.createElement("strong");
  title.textContent = "EVENTS ZIP DEBUG";
  title.style.cssText = "font-size:12px;";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "clear";
  clear.style.cssText = "font:inherit;padding:3px 7px;border-radius:7px;border:0;";
  clear.addEventListener("click", ()=>{ __zipDebugLines = []; zipDebugRender(); });
  const hide = document.createElement("button");
  hide.type = "button";
  hide.textContent = "hide";
  hide.style.cssText = "font:inherit;padding:3px 7px;border-radius:7px;border:0;";
  hide.addEventListener("click", ()=>{ box.style.display = "none"; });
  controls.append(title, clear, hide);
  const pre = document.createElement("div");
  pre.id = "zipDebugLines";
  box.append(controls, pre);
  document.documentElement.appendChild(box);
  __zipDebugBox = box;
  return box;
}

function zipDebugRender(){
  const box = zipDebugPanel();
  if(!box) return;
  const pre = box.querySelector("#zipDebugLines");
  if(pre) pre.textContent = __zipDebugLines.join("\n");
  box.scrollTop = box.scrollHeight;
}

function zipDebugLog(label, detail = {}){
  if(!ZIP_DEBUG_ENABLED) return;
  const t = String(Math.round(performance.now())).padStart(6, "0");
  const safe = Object.entries(detail).map(([k,v])=>`${k}=${String(v)}`).join(" | ");
  __zipDebugLines.push(`${t} ${label}${safe ? " | " + safe : ""}`);
  if(__zipDebugLines.length > ZIP_DEBUG_MAX_LINES) __zipDebugLines = __zipDebugLines.slice(-ZIP_DEBUG_MAX_LINES);
  zipDebugRender();
}

function zipDebugWireEventsProbe($, primaryInput, panel, modeFn){
  if(!ZIP_DEBUG_ENABLED || zipDebugWireEventsProbe._wired) return;
  zipDebugWireEventsProbe._wired = true;
  const zip = $("eventsDistanceOriginInput");
  const btn = $("eventsDistanceApplyBtn");
  const wrap = $("eventsSearchWrap");
  zipDebugLog("probe:init", {
    zip: !!zip, btn: !!btn, primary: !!primaryInput, panel: !!panel, wrap: !!wrap,
    mode: typeof modeFn === "function" ? modeFn() : "?",
    zipValue: zipDebugValue(zip), primaryValue: zipDebugValue(primaryInput),
    panelHidden: panel ? panel.hasAttribute("hidden") : "missing"
  });
  const eventNames = ["touchstart","pointerdown","mousedown","touchend","pointerup","mouseup","click","focus","input","change","blur","keydown"];
  for(const name of eventNames){
    zip?.addEventListener(name, (e)=>{
      zipDebugLog(`zip:${name}`, {
        key: e.key || "", zipValue: zipDebugValue(zip), primaryValue: zipDebugValue(primaryInput),
        active: zipDebugShortTarget(document.activeElement), target: zipDebugShortTarget(e.target),
        panelHidden: panel ? panel.hasAttribute("hidden") : "missing"
      });
    }, true);
    btn?.addEventListener(name, (e)=>{
      zipDebugLog(`btn:${name}`, {
        key: e.key || "", zipValue: zipDebugValue(zip), primaryValue: zipDebugValue(primaryInput),
        active: zipDebugShortTarget(document.activeElement), target: zipDebugShortTarget(e.target),
        panelHidden: panel ? panel.hasAttribute("hidden") : "missing"
      });
    }, true);
  }
  primaryInput?.addEventListener("input", (e)=>{
    zipDebugLog("primary:input", {
      primaryValue: zipDebugValue(primaryInput), zipValue: zipDebugValue(zip),
      target: zipDebugShortTarget(e.target), mode: typeof modeFn === "function" ? modeFn() : "?"
    });
  }, true);
  document.addEventListener("pointerdown", (e)=>{
    zipDebugLog("document:pointerdown:capture", {
      target: zipDebugShortTarget(e.target), insideWrap: wrap ? wrap.contains(e.target) : "missing",
      zipValue: zipDebugValue(zip), primaryValue: zipDebugValue(primaryInput)
    });
  }, true);
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
  zipDebugLog("wireSearchSuggestions:init", { wrap: !!wrap, primary: !!input, panel: !!panel });

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

  zipDebugWireEventsProbe($, input, panel, mode);

  const open = ()=>{
    zipDebugLog("panel:open:attempt", { mode: mode(), primaryValue: zipDebugValue(input), canSuggest: canSuggest() });
    if(!canSuggest()) return;
    setModeUI();
    if(panel.hasAttribute("hidden")) panel.removeAttribute("hidden");
    if(mode() === "index" && typeof onIndexViewOpen === "function") onIndexViewOpen();
    if(mode() === "events" && typeof onEventsViewOpen === "function") onEventsViewOpen();
    zipDebugLog("panel:open:done", { mode: mode(), hidden: panel.hasAttribute("hidden") });
  };

  const close = ()=>{
    zipDebugLog("panel:close", { mode: mode(), primaryValue: zipDebugValue(input), hiddenBefore: panel.hasAttribute("hidden") });
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
    zipDebugLog("quickSearch:click", { val, primaryBefore: zipDebugValue(input) });
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
    zipDebugLog("distance:init", { activeMode, inputId, applyId, distInput: !!distInput, distApply: !!distApply, hasSetSectionQuery: typeof setSectionQuery === "function" });

    function writeZipToPrimarySearch(zip){
      zipDebugLog("writeZipToPrimarySearch:before", { activeMode, zip, primaryBefore: zipDebugValue(input), distValue: zipDebugValue(distInput), hasSetSectionQuery: typeof setSectionQuery === "function", hasSetActiveEventsQuery: typeof setActiveEventsQuery === "function" });
      input.value = zip;
      if(typeof setSectionQuery === "function") setSectionQuery(zip);
      else if(typeof setActiveEventsQuery === "function") setActiveEventsQuery(zip);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      zipDebugLog("writeZipToPrimarySearch:after", { activeMode, zip, primaryAfter: zipDebugValue(input), distValue: zipDebugValue(distInput) });
    }

    function sanitizeZip(){
      if(!distInput) return "";
      const raw = String(distInput.value || "");
      const digits = raw.replace(/\D/g, "").slice(0, 5);
      if(digits !== raw) distInput.value = digits;
      zipDebugLog("sanitizeZip", { activeMode, raw, digits, distAfter: zipDebugValue(distInput) });
      return digits;
    }

    function applyZip({ force = false } = {}){
      zipDebugLog("applyZip:start", { activeMode, force, isActiveMode: isActiveMode(), distValue: zipDebugValue(distInput), primaryValue: zipDebugValue(input), mode: mode() });
      // Button/Enter actions come from this exact ZIP section, so do not let
      // the shared view-mode check block the submit. The check remains for
      // passive refreshes and distance-segment changes.
      if(!force && !isActiveMode()){ zipDebugLog("applyZip:return:notActive", { activeMode, force, mode: mode() }); return false; }
      const zip = sanitizeZip();
      if(zip.length !== 5){ zipDebugLog("applyZip:return:badZip", { activeMode, zip, length: zip.length, distValue: zipDebugValue(distInput) }); return false; }
      // Mirror into the visible primary search bar and update the matching
      // state branch directly: INDEX => indexEvents.q, EVENTS => events.q.
      writeZipToPrimarySearch(zip);
      if(typeof onSelectOrigin === "function"){ zipDebugLog("applyZip:onSelectOrigin", { activeMode, zip }); onSelectOrigin(zip); }
      else zipDebugLog("applyZip:noOnSelectOrigin", { activeMode, zip });
      close();
      distInput?.blur();
      input.blur();
      zipDebugLog("applyZip:success", { activeMode, zip, primaryValue: zipDebugValue(input), distValue: zipDebugValue(distInput) });
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

    function handleZipValueRefresh(e){
      zipDebugLog("handleZipValueRefresh", { activeMode, eventType: e?.type || "?", isActiveMode: isActiveMode(), distValue: zipDebugValue(distInput), primaryValue: zipDebugValue(input) });
      if(!isActiveMode()) return;
      sanitizeZip();
    }

    distInput?.addEventListener("input", handleZipValueRefresh);
    distInput?.addEventListener("change", handleZipValueRefresh);
    distInput?.addEventListener("blur", handleZipValueRefresh);


    function submitZipFromArrow(e){
      zipDebugLog("submitZipFromArrow", { activeMode, eventType: e?.type || "?", target: zipDebugShortTarget(e?.target), distValue: zipDebugValue(distInput), primaryValue: zipDebugValue(input), mode: mode() });
      if(!distInput){ zipDebugLog("submitZipFromArrow:return:noDistInput", { activeMode }); return; }
      if(e){
        e.preventDefault();
        e.stopPropagation();
      }
      const ok = applyZip({ force: true });
      zipDebugLog("submitZipFromArrow:done", { activeMode, ok, distValue: zipDebugValue(distInput), primaryValue: zipDebugValue(input) });
    }

    // Use the same click/bubble path as EVENTS Quick Search. Selecting a
    // browser ZIP suggestion only fills the ZIP box; only the arrow click
    // promotes the ZIP into the primary search bar.
    panel.addEventListener("click", (e)=>{
      const target = e.target instanceof Element ? e.target : e.target?.parentElement;
      const btn = target?.closest?.(`#${applyId}`);
      zipDebugLog("panel:click:distanceCheck", { activeMode, applyId, target: zipDebugShortTarget(e.target), matched: !!btn, distValue: zipDebugValue(distInput), primaryValue: zipDebugValue(input) });
      if(!btn) return;
      submitZipFromArrow(e);
    });

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
    zipDebugLog("outsideClose:pointerdown", { target: zipDebugShortTarget(e.target), insideWrap: wrap.contains(e.target), primaryValue: zipDebugValue(input) });
    if(wrap.contains(e.target)) return;
    close();
  }, true);

  input.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") close();
  });
}
