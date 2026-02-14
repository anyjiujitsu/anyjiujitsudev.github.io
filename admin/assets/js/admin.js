/* Admin panel (v300)
   - Matches main-site EVENTS header styling
   - Two entry pages (Events + Index)
   - Swipe/scroll slider + tab toggle
   - Clears form on successful commit
*/

(() => {
  const OWNER  = "anyjiujitsu";
  const REPO   = "anyjiujitsudev.github.io";
  const BRANCH = "main";

  const EVENTS_CSV_PATH = "data/events.csv";
  const DIR_CSV_PATH    = "data/directory.csv";

  const $ = (id) => document.getElementById(id);

  // ---------- shared UI helpers ----------
  function setText(id, msg){ const el = $(id); if (el) el.textContent = msg || ""; }
  function setStatus(msg){ setText("status", msg); setText("error", ""); }
  function setError(msg){ setText("error", msg); setText("status", ""); }
  function setStatusDir(msg){ setText("statusDirectory", msg); setText("errorDirectory", ""); }
  function setErrorDir(msg){ setText("errorDirectory", msg); setText("statusDirectory", ""); }

  function pad2(n){ return String(n).padStart(2, "0"); }
  function todayMMDDYYYY(){
    const d = new Date();
    return pad2(d.getMonth()+1) + "/" + pad2(d.getDate()) + "/" + d.getFullYear();
  }

  function requireToken(){
    const t = ($("token")?.value || "").trim();
    if (!t) throw new Error("Missing token.");
    return t;
  }

  function b64DecodeUnicode(str){
    str = (str || "").replace(/\n/g, "");
    const bin = atob(str);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }

  function b64EncodeUnicode(str){
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  }

  async function ghRequest(url, { method="GET", token, body } = {}){
    const headers = {
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = "token " + token;
    if (body) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const txt = await res.text();
    let json = null;
    try{ json = txt ? JSON.parse(txt) : null; }catch{ /* ignore */ }

    if (!res.ok){
      const msg = (json && (json.message || json.error)) ? (json.message || json.error) : (txt || ("HTTP " + res.status));
      throw new Error(msg);
    }
    return json;
  }

  // ---------- CSV helpers ----------
  function csvEscape(value){
    const s = (value ?? "").toString();
    if (/[\n\r",]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function parseCSV(text){
    // Basic RFC4180-ish parser (handles quotes and commas/newlines in quotes)
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++){
      const c = text[i];
      const n = text[i+1];

      if (inQuotes){
        if (c === '"' && n === '"'){ field += '"'; i++; continue; }
        if (c === '"'){ inQuotes = false; continue; }
        field += c;
        continue;
      }

      if (c === '"'){ inQuotes = true; continue; }
      if (c === ','){ row.push(field); field = ""; continue; }
      if (c === '\n'){
        row.push(field); field = "";
        if (row.length === 1 && row[0] === ""){ row = []; continue; }
        rows.push(row);
        row = [];
        continue;
      }
      if (c === '\r'){ continue; }
      field += c;
    }

    if (field.length || row.length){
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function uniqSorted(arr){
    const seen = new Set();
    for (const v of arr){
      const s = (v || "").trim();
      if (s) seen.add(s);
    }
    return Array.from(seen).sort((a,b) => a.localeCompare(b));
  }

  function fillDatalist(id, values){
    const dl = $(id);
    if (!dl) return;
    dl.innerHTML = values.map(v => `<option value="${v.replace(/"/g,'&quot;')}"></option>`).join("");
  }

  // ---------- Slider / tabs ----------
  function initPager(){
    const pages = $("adminPages");
    const tabA = $("tabAdminEvents");
    const tabB = $("tabAdminIndex");
    if (!pages || !tabA || !tabB) return;

    function setActive(which){
      const isA = which === "events";
      tabA.setAttribute("aria-selected", isA ? "true" : "false");
      tabB.setAttribute("aria-selected", isA ? "false" : "true");
    }

    function scrollToIndex(idx){
      const w = pages.clientWidth;
      pages.scrollTo({ left: w * idx, behavior: "smooth" });
    }

    tabA.addEventListener("click", () => { setActive("events"); scrollToIndex(0); });
    tabB.addEventListener("click", () => { setActive("index");  scrollToIndex(1); });

    let raf = 0;
    pages.addEventListener("scroll", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const idx = Math.round(pages.scrollLeft / Math.max(1, pages.clientWidth));
        setActive(idx >= 1 ? "index" : "events");
      });
    }, { passive: true });
  }

  // ---------- Events form logic ----------
  function computeDay(yyyy_mm_dd){
    if (!yyyy_mm_dd) return "";
    const [y,m,d] = yyyy_mm_dd.split("-").map(Number);
    if (!y || !m || !d) return "";
    const dt = new Date(y, m-1, d);
    const names = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    return names[dt.getDay()] || "";
  }

  function setEventsCreated(){
    const el = $("f_CREATED");
    if (el) el.value = todayMMDDYYYY();
  }

  function wireEventsDay(){
    const dateEl = $("f_DATE");
    const dayEl = $("f_DAY");
    if (!dateEl || !dayEl) return;
    const sync = () => { dayEl.value = computeDay(dateEl.value); };
    dateEl.addEventListener("change", sync);
    dateEl.addEventListener("input", sync, { passive: true });
    sync();
  }

  function clearEventsForm(){
    const ids = ["f_EVENT","f_FOR","f_WHERE","f_CITY","f_STATE","f_DATE","f_DAY"]; // keep CREATED
    for (const id of ids){
      const el = $(id);
      if (!el) continue;
      if (el.tagName === "SELECT") el.value = "";
      else el.value = "";
    }
    setEventsCreated();
  }

  function validateEvents(){
    const required = ["f_EVENT","f_FOR","f_CITY","f_STATE","f_DATE"];
    for (const id of required){
      const el = $(id);
      const v = (el?.value || "").trim();
      if (!v) throw new Error("Missing required field: " + id.replace(/^f_/, "").replace("_", " "));
    }
  }

  function makeEventsRow(){
    // columns: EVENT,FOR,WHERE,CITY,STATE,DAY,DATE,CREATED
    const values = [
      $("f_EVENT")?.value ?? "",
      $("f_FOR")?.value ?? "",
      $("f_WHERE")?.value ?? "",
      $("f_CITY")?.value ?? "",
      $("f_STATE")?.value ?? "",
      $("f_DAY")?.value ?? "",
      $("f_DATE")?.value ?? "",
      $("f_CREATED")?.value ?? "",
    ];
    return values.map(csvEscape).join(",");
  }

  async function loadEventsAutocomplete(){
    const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${EVENTS_CSV_PATH}`;
    try{
      const res = await fetch(RAW, { cache: "no-store" });
      if (!res.ok) throw new Error("Autocomplete fetch failed: " + res.status);
      const text = await res.text();
      const rows = parseCSV(text);
      if (!rows.length) return;

      const header = rows[0].map(h => (h||"").trim());
      const idxWhere = header.indexOf("WHERE");
      const idxCity  = header.indexOf("CITY");

      const wheres = [];
      const cities = [];
      for (let i = 1; i < rows.length; i++){
        const r = rows[i];
        if (idxWhere >= 0) wheres.push(r[idxWhere] || "");
        if (idxCity  >= 0) cities.push(r[idxCity] || "");
      }
      fillDatalist("whereList", uniqSorted(wheres));
      fillDatalist("cityList", uniqSorted(cities));
    }catch(e){
      console.warn(e);
    }
  }

  // ---------- Directory form logic ----------
  function setDirectoryCreated(){
    const el = $("d_CREATED");
    if (el) el.value = todayMMDDYYYY();
  }

  function clearDirectoryForm(){
    const ids = ["d_NAME","d_IG","d_CITY","d_STATE","d_SAT","d_SUN","d_OTA"]; // keep CREATED
    for (const id of ids){
      const el = $(id);
      if (!el) continue;
      if (el.tagName === "SELECT") el.value = "";
      else el.value = "";
    }
    setDirectoryCreated();
  }

  function validateDirectory(){
    const required = ["d_NAME","d_CITY","d_STATE"];
    for (const id of required){
      const el = $(id);
      const v = (el?.value || "").trim();
      if (!v) throw new Error("Missing required field: " + id.replace(/^d_/, "").replace("_", " "));
    }
  }

  function makeDirectoryRow(){
    // columns: STATE,CITY,NAME,IG,SAT,SUN,OTA,CREATED,LAT,LON
    const state = $("d_STATE")?.value ?? "";
    const city  = $("d_CITY")?.value ?? "";
    const name  = $("d_NAME")?.value ?? "";
    const ig    = ($("d_IG")?.value ?? "").replace(/^@/, "");
    const sat   = $("d_SAT")?.value ?? "";
    const sun   = $("d_SUN")?.value ?? "";
    const ota   = $("d_OTA")?.value ?? ""; // Y/N/blank
    const created = $("d_CREATED")?.value ?? "";

    const values = [state, city, name, ig, sat, sun, ota, created, "", ""]; // LAT/LON blank
    return values.map(csvEscape).join(",");
  }

  // ---------- CSV commit (append row) ----------
  async function appendRowToCsv({ csvPath, newRow, token, commitMessage }){
    const getUrl = `https://api.github.com/repos/${encodeURIComponent(OWNER)}/${encodeURIComponent(REPO)}/contents/${csvPath}?ref=${encodeURIComponent(BRANCH)}`;
    const data = await ghRequest(getUrl, { token });
    const csv = b64DecodeUnicode(data.content || "");
    const sha = data.sha;

    let updated = csv;
    if (!updated.endsWith("\n")) updated += "\n";
    updated += newRow.endsWith("\n") ? newRow : (newRow + "\n");

    const putUrl = `https://api.github.com/repos/${encodeURIComponent(OWNER)}/${encodeURIComponent(REPO)}/contents/${csvPath}`;
    const body = {
      message: commitMessage,
      content: b64EncodeUnicode(updated),
      sha,
      branch: BRANCH,
    };
    await ghRequest(putUrl, { method: "PUT", token, body });
  }

  // ---------- wire up UI ----------
  function setBusy(b){
    const ids = [
      "saveTokenBtn","appendBtn","clearFormBtn",
      "appendDirectoryBtn","clearDirectoryBtn",
    ];
    for (const id of ids){
      const el = $(id);
      if (el) el.disabled = !!b;
    }
  }

  function initToken(){
    const LS_KEY = "anyne_events_admin_token";
    const tokenEl = $("token");
    const saved = localStorage.getItem(LS_KEY);
    if (saved && tokenEl) tokenEl.value = saved;

    $("toggleToken")?.addEventListener("click", () => {
      if (!tokenEl) return;
      tokenEl.type = (tokenEl.type === "password") ? "text" : "password";
    });

    $("saveTokenBtn")?.addEventListener("click", () => {
      try{
        const t = (tokenEl?.value || "").trim();
        if (!t) throw new Error("No token to save.");
        localStorage.setItem(LS_KEY, t);
        setStatus("Token saved locally.");
      }catch(e){
        setError(e.message || String(e));
      }
    });
  }

  function initEventsForm(){
    setEventsCreated();
    wireEventsDay();

    // Lazy-load autocomplete
    let autocompleteLoaded = false;
    const loadOnce = async () => {
      if (autocompleteLoaded) return;
      autocompleteLoaded = true;
      await loadEventsAutocomplete();
    };
    $("f_WHERE")?.addEventListener("focus", loadOnce, { once: true });
    $("f_CITY")?.addEventListener("focus", loadOnce, { once: true });
    $("f_WHERE")?.addEventListener("input", loadOnce, { passive: true });
    $("f_CITY")?.addEventListener("input", loadOnce, { passive: true });

    $("clearFormBtn")?.addEventListener("click", () => {
      clearEventsForm();
      setStatus("Cleared.");
    });

    $("appendBtn")?.addEventListener("click", async () => {
      setError("");
      setBusy(true);
      setStatus("Appending + committing…");
      try{
        validateEvents();
        const token = requireToken();
        const newRow = makeEventsRow();
        await appendRowToCsv({
          csvPath: EVENTS_CSV_PATH,
          newRow,
          token,
          commitMessage: `Append event row (${new Date().toISOString()})`,
        });
        setStatus("✅ Commit succeeded. Form cleared.");
        clearEventsForm();
      }catch(e){
        setError(e.message || String(e));
      }finally{
        setBusy(false);
      }
    });
  }

  function initDirectoryForm(){
    setDirectoryCreated();

    $("clearDirectoryBtn")?.addEventListener("click", () => {
      clearDirectoryForm();
      setStatusDir("Cleared.");
    });

    $("appendDirectoryBtn")?.addEventListener("click", async () => {
      setErrorDir("");
      setBusy(true);
      setStatusDir("Appending + committing…");
      try{
        validateDirectory();
        const token = requireToken();
        const newRow = makeDirectoryRow();
        await appendRowToCsv({
          csvPath: DIR_CSV_PATH,
          newRow,
          token,
          commitMessage: `Append directory row (${new Date().toISOString()})`,
        });
        setStatusDir("✅ Commit succeeded. Form cleared.");
        clearDirectoryForm();
      }catch(e){
        setErrorDir(e.message || String(e));
      }finally{
        setBusy(false);
      }
    });
  }

  // Safety nets
  window.addEventListener("unhandledrejection", (e) => setError("Unhandled: " + (e.reason?.message || e.reason || "Unknown")));
  window.addEventListener("error", (e) => setError("Script error: " + (e.message || "Unknown")));

  // Boot
  initPager();
  initToken();
  initEventsForm();
  initDirectoryForm();
  setStatus("Ready.");
})();
