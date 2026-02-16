
/* Admin panel
   - Uses main-site header + viewToggle styling
   - Horizontal pager with scroll-snap
   - Keeps viewToggle thumb synced to scroll
   - Token save to LocalStorage
   - Clears forms on successful submit (stubbed commit hook for now)
*/
(function(){
  const pager = document.getElementById('adminPager');
  const titleEl = document.getElementById('adminViewTitle');
  const toggle = document.getElementById('adminViewToggle');
  const tabs = Array.from(toggle.querySelectorAll('.viewToggle__tab'));

  const tokenInput = document.getElementById('ghToken');
  const saveBtn = document.getElementById('saveToken');
  const eyeBtn = document.getElementById('toggleToken');
  const tokenStatus = document.getElementById('tokenStatus');

  // --- Token: load/save ---
  const TOKEN_KEY = 'anyjj_admin_github_token';
  const saved = localStorage.getItem(TOKEN_KEY);
  if(saved) tokenInput.value = saved;

  function setTokenStatus(status){
    if(!tokenStatus) return;
    tokenStatus.textContent = status || '';
    if(status){
      tokenStatus.setAttribute('data-status', status);
      tokenStatus.classList.add('isVisible');
    }else{
      tokenStatus.removeAttribute('data-status');
      tokenStatus.classList.remove('isVisible');
    }
  }

  // Hide the status while user is editing the token; show again on blur.
  tokenInput.addEventListener('focus', () => tokenStatus && tokenStatus.classList.remove('isVisible'));
  tokenInput.addEventListener('blur', () => {
    if(tokenStatus && tokenStatus.textContent.trim()) tokenStatus.classList.add('isVisible');
  });

  async function validateAndStoreToken(){
    const t = (tokenInput.value || '').trim();
    if(!t){
      setTokenStatus('FAILED');
      return null;
    }

    // Validate token against GitHub API. If invalid, do not store.
    try{
      const res = await fetch('https://api.github.com/user', {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `token ${t}`
        }
      });
      if(!res.ok){
        setTokenStatus('FAILED');
        return null;
      }
      localStorage.setItem(TOKEN_KEY, t);
      setTokenStatus('APPROVED');
      return t;
    }catch(_e){
      setTokenStatus('FAILED');
      return null;
    }
  }

  saveBtn.addEventListener('click', async () => {
    await validateAndStoreToken();
  });

  eyeBtn.addEventListener('click', () => {
    const isPw = tokenInput.type === 'password';
    tokenInput.type = isPw ? 'text' : 'password';
    eyeBtn.setAttribute('aria-label', isPw ? 'Hide token' : 'Show token');
  });

  // --- Helpers ---
  function setActiveView(view){
    const isIndex = view === 'index';
    tabs.forEach(btn => btn.setAttribute('aria-selected', String(btn.dataset.view === view)));
    toggle.style.setProperty('--viewProgress', isIndex ? 1 : 0);

    titleEl.textContent = isIndex ? 'INDEX – ADD NEW (DEV)' : 'EVENTS – ADD NEW (DEV)';
  }

  function scrollToView(view){
    const idx = view === 'index' ? 1 : 0;
    const x = idx * pager.clientWidth;
    pager.scrollTo({ left: x, behavior: 'smooth' });
  }

  // --- Toggle click ---
  toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.viewToggle__tab');
    if(!btn) return;
    scrollToView(btn.dataset.view);
  });

  // --- Pager scroll sync ---
  function syncFromScroll(){
    const w = pager.clientWidth || 1;
    const progress = Math.max(0, Math.min(1, pager.scrollLeft / w));
    toggle.style.setProperty('--viewProgress', progress);

    // snap title based on midpoint
    setActiveView(progress > 0.5 ? 'index' : 'events');
  }
  pager.addEventListener('scroll', () => {
    window.requestAnimationFrame(syncFromScroll);
  }, { passive: true });

  // Initialize
  setActiveView('events');
  syncFromScroll();


  // --- CSV-powered suggestions (WHERE, CITY) ---
  // Builds type-ahead suggestions from existing values in /data/events.csv
  // so entry fields stay consistent with the dataset.
  const PUBLIC_EVENTS_CSV = '../data/events.csv';

  function parseCSV(text){
    // RFC4180-ish parser (handles quotes + commas + newlines)
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for(let i=0;i<text.length;i++){
      const ch = text[i];

      if(inQuotes){
        if(ch === '"'){
          const next = text[i+1];
          if(next === '"'){ // escaped quote
            cell += '"';
            i++;
          }else{
            inQuotes = false;
          }
        }else{
          cell += ch;
        }
        continue;
      }

      if(ch === '"'){
        inQuotes = true;
        continue;
      }

      if(ch === ','){
        row.push(cell);
        cell = '';
        continue;
      }

      if(ch === '\n'){
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        continue;
      }

      if(ch === '\r'){
        continue;
      }

      cell += ch;
    }

    // last cell/row
    row.push(cell);
    rows.push(row);

    // trim any trailing empty rows
    while(rows.length && rows[rows.length-1].every(v => String(v||'').trim() === '')){
      rows.pop();
    }
    return rows;
  }

  function uniqueNonEmpty(values){
    const seen = new Set();
    const out = [];
    values.forEach(v => {
      const s = String(v ?? '').trim();
      if(!s) return;
      const k = s.toLowerCase();
      if(seen.has(k)) return;
      seen.add(k);
      out.push(s);
    });
    return out;
  }

  
  function attachAutocomplete(input, allValues){
    if(!input) return;

    // Custom dropdown to avoid native <datalist> (which can cover the field on mobile).
    let menu = null;
    let hideTimer = null;

    function ensureMenu(){
      if(menu) return menu;
      menu = document.createElement('div');
      menu.className = 'acMenu';
      menu.style.display = 'none';
      document.body.appendChild(menu);

      // Prevent input blur from immediately killing clicks.
      menu.addEventListener('mousedown', (e) => e.preventDefault());
      menu.addEventListener('click', (e) => {
        const item = e.target.closest('[data-ac-value]');
        if(!item) return;
        input.value = item.getAttribute('data-ac-value') || '';
        closeMenu();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      return menu;
    }

    function closeMenu(){
      if(!menu) return;
      menu.style.display = 'none';
      menu.innerHTML = '';
    }

    function positionMenu(){
      if(!menu || menu.style.display === 'none') return;
      const r = input.getBoundingClientRect();
      const top = r.bottom + window.scrollY + 4;
      const left = r.left + window.scrollX;
      menu.style.top = top + 'px';
      menu.style.left = left + 'px';
      menu.style.width = r.width + 'px';
    }

    function buildList(query){
      const q = String(query ?? '').trim().toLowerCase();
      const starts = [];
      const contains = [];

      for(const v of allValues){
        const lv = v.toLowerCase();
        if(!q){
          starts.push(v);
        }else if(lv.startsWith(q)){
          starts.push(v);
        }else if(lv.includes(q)){
          contains.push(v);
        }
        if(starts.length >= 20 && contains.length >= 20) break;
      }

      const list = (q ? starts.concat(contains) : starts).slice(0, 30);
      const dl = ensureMenu();
      dl.innerHTML = '';

      if(!list.length){
        closeMenu();
        return;
      }

      list.forEach(v => {
        const div = document.createElement('div');
        div.className = 'acItem';
        div.setAttribute('data-ac-value', v);
        div.textContent = v;
        dl.appendChild(div);
      });

      dl.style.display = 'block';
      positionMenu();
    }

    function scheduleClose(){
      clearTimeout(hideTimer);
      hideTimer = setTimeout(closeMenu, 120);
    }

    input.addEventListener('input', () => buildList(input.value));
    input.addEventListener('focus', () => buildList(input.value));
    input.addEventListener('blur', scheduleClose);

    window.addEventListener('scroll', positionMenu, true);
    window.addEventListener('resize', positionMenu);
  }

  async function loadWhereCitySuggestions(){
    try{
      const res = await fetch(PUBLIC_EVENTS_CSV, { cache: 'no-store' });
      if(!res.ok) return;
      const text = await res.text();
      const rows = parseCSV(text);
      if(!rows || rows.length < 2) return;

      const headers = rows[0].map(h => String(h||'').trim().toUpperCase());
      const idxWhere = headers.indexOf('WHERE');
      const idxCity  = headers.indexOf('CITY');

      if(idxWhere === -1 && idxCity === -1) return;

      const whereVals = [];
      const cityVals = [];

      for(let r=1;r<rows.length;r++){
        const row = rows[r] || [];
        if(idxWhere !== -1) whereVals.push(row[idxWhere]);
        if(idxCity  !== -1) cityVals.push(row[idxCity]);
      }

      const whereUnique = uniqueNonEmpty(whereVals);
      const cityUnique  = uniqueNonEmpty(cityVals);

      // Attach to all matching inputs (events + index forms)
      document.querySelectorAll('input[name="WHERE"]').forEach(inp => {
        attachAutocomplete(inp, whereUnique);
      });
      document.querySelectorAll('input[name="CITY"]').forEach(inp => {
        attachAutocomplete(inp, cityUnique);
      });
    }catch(_e){
      // silent fail — admin still works without suggestions
    }
  }

  // Kick off suggestions load (non-blocking)
  loadWhereCitySuggestions();

  // --- Form handling (wire commit later) ---
  const eventForm = document.getElementById('eventForm');
  const indexForm = document.getElementById('indexForm');

  function setCreatedDate(form){
    const el = form.querySelector('input[name="CREATED"]');
    if(!el) return;
    const d = new Date();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const yy = d.getFullYear();
    el.value = `${mm}/${dd}/${yy}`;
  }
  setCreatedDate(eventForm);
  setCreatedDate(indexForm);


  
  // --- INDEX: OPENS (SAT/SUN) time picker overlay sync ---
  function setupOpensTimeSync(form){
    if(!form) return;

    const satNative = form.querySelector('input.adminTimeNative[name="SAT"]');
    const sunNative = form.querySelector('input.adminTimeNative[name="SUN"]');
    const displays  = Array.from(form.querySelectorAll('input.adminTimeDisplay'));
    if(!satNative || !sunNative || displays.length < 2) return;

    const satDisplay = displays[0];
    const sunDisplay = displays[1];

    function format12(hhmm){
      const v = (hhmm || '').trim();
      const m = v.match(/^(\d{2}):(\d{2})$/);
      if(!m) return '';
      let hh = Number(m[1]);
      const mm = m[2];
      const ampm = hh >= 12 ? 'PM' : 'AM';
      hh = hh % 12; if(hh === 0) hh = 12;
      return `${hh}:${mm} ${ampm}`;
    }

    function syncOne(nativeEl, displayEl){
      const raw = nativeEl.value || '';
      displayEl.value = raw ? format12(raw) : '';
    }

    function isTimeSupported(el){
      // Desktop Safari downgrades type=time to text (no picker)
      return el && el.type === 'time';
    }

    // Desktop fallback modal
    function ensureModal(){
      let modal = document.querySelector('.adminTimeModal');
      if(modal) return modal;

      modal = document.createElement('div');
      modal.className = 'adminTimeModal';
      modal.innerHTML = `
        <div class="adminTimeSheet" role="dialog" aria-modal="true">
          <div class="adminTimeSheetTitle">Pick time</div>
          <div class="adminTimePickRow">
            <select class="tHour"></select>
            <select class="tMin"></select>
            <select class="tAmpm"><option>AM</option><option>PM</option></select>
          </div>
          <div class="adminTimePickActions">
            <button type="button" class="adminTimePickBtn tCancel">Cancel</button>
            <button type="button" class="adminTimePickBtn tOk">OK</button>
          </div>
        </div>`;
      document.body.appendChild(modal);

      modal.addEventListener('click', (e) => { if(e.target === modal) modal.classList.remove('is-open'); });

      const h = modal.querySelector('.tHour');
      const mi = modal.querySelector('.tMin');
      for(let i=1;i<=12;i++){
        const o=document.createElement('option');
        o.textContent=String(i);
        o.value=String(i);
        h.appendChild(o);
      }
      for(let j=0;j<60;j+=5){
        const o=document.createElement('option');
        o.textContent=String(j).padStart(2,'0');
        o.value=String(j).padStart(2,'0');
        mi.appendChild(o);
      }
      return modal;
    }

    function openModalFor(nativeEl, displayEl){
      const modal = ensureModal();
      const hourSel = modal.querySelector('.tHour');
      const minSel  = modal.querySelector('.tMin');
      const ampmSel = modal.querySelector('.tAmpm');

      const seed = (nativeEl.value || '').match(/^(\d{2}):(\d{2})$/);
      let hh = seed ? Number(seed[1]) : 10;
      let mm = seed ? seed[2] : '00';

      let ap = hh >= 12 ? 'PM' : 'AM';
      hh = hh % 12; if(hh === 0) hh = 12;

      hourSel.value = String(hh);

      const mmNum = Number(mm);
      const snapped = String(Math.round(mmNum/5)*5).padStart(2,'0');
      minSel.value = snapped;

      ampmSel.value = ap;

      modal.classList.add('is-open');
      modal.querySelector('.tCancel').onclick = () => modal.classList.remove('is-open');
      modal.querySelector('.tOk').onclick = () => {
        const h12 = Number(hourSel.value);
        const m2  = minSel.value;
        const ap2 = ampmSel.value;

        let h24 = h12 % 12;
        if(ap2 === 'PM') h24 += 12;

        const hh24 = String(h24).padStart(2,'0');
        nativeEl.value = `${hh24}:${m2}`;
        syncOne(nativeEl, displayEl);
        modal.classList.remove('is-open');
      };
    }

    satNative.addEventListener('input', () => syncOne(satNative, satDisplay));
    satNative.addEventListener('change', () => syncOne(satNative, satDisplay));
    sunNative.addEventListener('input', () => syncOne(sunNative, sunDisplay));
    sunNative.addEventListener('change', () => syncOne(sunNative, sunDisplay));

    // Clicking display triggers native picker if supported; otherwise modal
    satDisplay.addEventListener('click', () => {
      if(isTimeSupported(satNative)){
        if(typeof satNative.showPicker === 'function') satNative.showPicker();
        else { satNative.click(); satNative.focus({preventScroll:true}); }
      }else{
        openModalFor(satNative, satDisplay);
      }
    });
    sunDisplay.addEventListener('click', () => {
      if(isTimeSupported(sunNative)){
        if(typeof sunNative.showPicker === 'function') sunNative.showPicker();
        else { sunNative.click(); sunNative.focus({preventScroll:true}); }
      }else{
        openModalFor(sunNative, sunDisplay);
      }
    });

    syncOne(satNative, satDisplay);
    syncOne(sunNative, sunDisplay);
  }

  setupOpensTimeSync(indexForm);


// --- INDEX: auto-fill LAT/LON from CITY + STATE (readonly fields) ---
const idxCity  = indexForm.querySelector('input[name="CITY"]');
const idxState = indexForm.querySelector('select[name="STATE"]');
const idxLat   = indexForm.querySelector('input[name="LAT"]');
const idxLon   = indexForm.querySelector('input[name="LON"]');
const idxLatD  = indexForm.querySelector('input[name="LAT_display"]');
const idxLonD  = indexForm.querySelector('input[name="LON_display"]');
function setIdxLatLon(lat, lon){
  const _lat = lat || '';
  const _lon = lon || '';
  if(idxLat)  idxLat.value  = _lat;
  if(idxLon)  idxLon.value  = _lon;
  if(idxLatD) idxLatD.value = _lat;
  if(idxLonD) idxLonD.value = _lon;
}

let geoTimer = null;
let lastGeoQ = '';

async function geocodeCityState(city, state){
  const q = `${city}, ${state}, USA`.trim();
  if(!city || !state) { setIdxLatLon('', ''); return; }
  if(q === lastGeoQ) return;
  lastGeoQ = q;

  // Nominatim (OpenStreetMap) search
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q);

  try{
    const res = await fetch(url, { method: 'GET' });
    if(!res.ok) throw new Error('geocode_http_' + res.status);
    const data = await res.json();
    if(Array.isArray(data) && data[0] && data[0].lat && data[0].lon){
      // Keep as strings (reasonable precision)
      setIdxLatLon(String(data[0].lat), String(data[0].lon));
    }else{
      setIdxLatLon('', '');
    }
  }catch(_e){
    setIdxLatLon('', '');
  }
}

function scheduleGeocode(){
  if(!idxCity || !idxState) return;
  const city = (idxCity.value || '').trim();
  const state = (idxState.value || '').trim();
  if(geoTimer) clearTimeout(geoTimer);
  geoTimer = setTimeout(() => geocodeCityState(city, state), 450);
}

if(idxCity)  idxCity.addEventListener('input', scheduleGeocode);
if(idxState) idxState.addEventListener('change', scheduleGeocode);

  // optional: auto day from date on event form
  const dateInput = eventForm.querySelector('input[name="DATE"]');
  const dayInput = eventForm.querySelector('input[name="DAY"]');
  function normalizeEventDate(val){
    const s = (val || '').trim();
    // yyyy-mm-dd (from <input type="date">) -> mm/dd/yyyy
    const iso = s.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
    if(iso) return `${Number(iso[2])}/${Number(iso[3])}/${iso[1]}`;
    // already mm/dd/yyyy (or user-typed)
    return s;
  }

  // Normalize directory open times:
  // <input type="time"> returns "HH:MM" (24h). Directory CSV expects "h:MMAM/PM" (e.g., 5:13PM).
  function normalizeDirectoryTime(val){
    const s = (val || '').trim();
    if(!s) return '';
    // Already has AM/PM (any case) -> leave as-is but normalize casing and remove spaces
    if(/[ap]m\b/i.test(s)) return s.replace(/\s+/g,'').toUpperCase();
    const m = s.match(/^([0-9]{1,2}):([0-9]{2})$/);
    if(!m) return s;
    let hh = parseInt(m[1], 10);
    const mm = m[2];
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12;
    if(hh === 0) hh = 12;
    return `${hh}:${mm}${ampm}`;
  }

  function computeDay(str){
    const s = (str || '').trim();

    // mm/dd/yyyy
    let m = s.match(/^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})$/);
    let dt = null;
    if(m){
      dt = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
    }else{
      // yyyy-mm-dd
      m = s.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
      if(m) dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }

    if(!dt || isNaN(dt.getTime())) return '';
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return days[dt.getDay()] || '';
  }

  dateInput.addEventListener('input', () => {
    dayInput.value = computeDay(dateInput.value);
  });

  // Clear buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-clear]');
    if(!btn) return;
    const which = btn.getAttribute('data-clear');
    const form = which === 'index' ? indexForm : eventForm;
    form.reset();
    setCreatedDate(form);
    if(which === 'index'){
      lastGeoQ = '';
      setIdxLatLon('', '');
    }
    // clear OPENS display fields after reset
    const _opensDisplays = Array.from(indexForm.querySelectorAll('input.adminTimeDisplay'));
    _opensDisplays.forEach(el => el.value = '');

    if(which === 'event') dayInput.value = '';
  });

  // --- GitHub CSV append/commit (matches QA admin logic) ---
  const OWNER  = 'anyjiujitsu';
  const REPO   = 'anyjiujitsudev.github.io';
  const BRANCH = 'main';

  // Paths inside the repo (must exist)
  const EVENT_CSV_PATH = 'data/events.csv';
  const INDEX_CSV_PATH = 'data/directory.csv';

  function b64DecodeUnicode(str){
    str = (str || '').replace(/\n/g,'');
    const bin = atob(str);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  function b64EncodeUnicode(str){
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  }

  function csvEscape(v){
    const s = String(v ?? '');
    if(/[\n\r",]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }

  function apiUrlFor(path){
    return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(BRANCH)}`;
  }

  async function ghGetFile(path, token){
    const res = await fetch(apiUrlFor(path), {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `token ${token}`
      }
    });
    if(!res.ok){
      const t = await res.text().catch(()=> '');
      throw new Error(`GET failed (${res.status}): ${t}`);
    }
    return res.json();
  }

  async function ghPutFile(path, token, body){
    const putUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}`;
    const res = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'Authorization': `token ${token}`
      },
      body: JSON.stringify(body)
    });
    if(!res.ok){
      const t = await res.text().catch(()=> '');
      throw new Error(`PUT failed (${res.status}): ${t}`);
    }
    return res.json();
  }

  function buildRowFromForm(csvText, form){
    const lines = (csvText || '').split(/\r?\n/);
    const headerLine = lines.find(l => l.trim().length) || '';
    const columns = headerLine.split(',').map(s => s.trim());

    const fd = new FormData(form);
    const map = {};
    for(const [k,v] of fd.entries()) map[k] = (v ?? '').toString().trim();

    // Normalize event date (native date picker returns yyyy-mm-dd)
    if(form && form.id === 'eventForm' && map.DATE){
      map.DATE = normalizeEventDate(map.DATE);
      if(!map.DAY) map.DAY = computeDay(map.DATE);
    }


    // Normalize directory open times (SAT/SUN) to match existing directory.csv format
    if(form && form.id === 'indexForm'){
      if('SAT' in map) map.SAT = normalizeDirectoryTime(map.SAT);
      if('SUN' in map) map.SUN = normalizeDirectoryTime(map.SUN);
    }

    // If file is empty/no header, fall back to form keys order.
    const cols = columns.filter(Boolean);
    const finalCols = cols.length ? cols : Object.keys(map);
    const row = finalCols.map(c => csvEscape(map[c] ?? '')).join(',');

    return { row, finalCols, hasHeader: cols.length > 0 };
  }

  async function appendCsvRow({ path, form, commitPrefix }){
    const token = await validateAndStoreToken();
    if(!token) throw new Error('Token not approved');

    // read
    const current = await ghGetFile(path, token);
    const sha = current.sha;
    const csvText = b64DecodeUnicode(current.content || '');

    // append
    const { row, finalCols, hasHeader } = buildRowFromForm(csvText, form);
    const nowIso = new Date().toISOString();
    const header = hasHeader ? '' : (finalCols.join(',') + '\n');
    const base = (csvText || '').trimEnd();
    const updated = (base ? base + '\n' : header) + row + '\n';

    // write
    const body = {
      message: `${commitPrefix} (${nowIso})`,
      content: b64EncodeUnicode(updated),
      sha,
      branch: BRANCH
    };
    await ghPutFile(path, token, body);
    return true;
  }

  eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try{
      await appendCsvRow({
        path: EVENT_CSV_PATH,
        form: eventForm,
        commitPrefix: 'Append event row'
      });
      eventForm.reset();
      setCreatedDate(eventForm);
      dayInput.value = '';
    }catch(_e){
      // Surface failure in the token bar (what you asked for)
      setTokenStatus('FAILED');
    }
  });

  indexForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try{
      await appendCsvRow({
        path: INDEX_CSV_PATH,
        form: indexForm,
        commitPrefix: 'Append directory row'
      });
      indexForm.reset();
      setCreatedDate(indexForm);
      // clear OPENS display fields after reset
      const _opensDisplays2 = Array.from(indexForm.querySelectorAll('input.adminTimeDisplay'));
      _opensDisplays2.forEach(el => el.value = '');
    }catch(_e){
      setTokenStatus('FAILED');
    }
  });
})();
