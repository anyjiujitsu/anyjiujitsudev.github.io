
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

  
  // --- CSS var sizing (helps keep sticky bars visible, especially on mobile keyboard) ---
  function setAdminHeights(){
    const header = document.getElementById('header');
    const filters = document.getElementById('adminFilters');
    if(header){
      const h = header.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--adminHeaderH', h + 'px');
      document.documentElement.style.setProperty('--adminStickyTop', h + 'px');
    }
    if(filters){
      const fh = filters.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--adminFiltersH', fh + 'px');
    }
  }
  window.addEventListener('load', setAdminHeights);
  window.addEventListener('resize', setAdminHeights);

  // --- Mobile keyboard: keep header/token bar fixed while editing ---
  const KB_MAX_W = 760;

  function isFormField(el){
    if(!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'select' || tag === 'textarea';
  }

  document.addEventListener('focusin', (e) => {
    if(window.innerWidth > KB_MAX_W) return;
    const t = e.target;
    if(!isFormField(t)) return;
    document.body.classList.add('adminKeyboardOpen');
    setAdminHeights();
  });

  document.addEventListener('focusout', (e) => {
    if(window.innerWidth > KB_MAX_W) return;
    const t = e.target;
    if(!isFormField(t)) return;

    // focus may move between inputs; wait a tick to see if another field receives focus
    window.setTimeout(() => {
      const active = document.activeElement;
      if(active && isFormField(active)) return;
      document.body.classList.remove('adminKeyboardOpen');
      setAdminHeights();
    }, 50);
  });

  // --- EVENTS: populate the EVENT dropdown from /data/events.csv ---
  function parseCsvLine(line){
    const out = [];
    let cur = '';
    let inQ = false;

    for(let i=0;i<line.length;i++){
      const ch = line[i];

      if(ch === '"'){
        if(inQ && line[i+1] === '"'){
          cur += '"';
          i++;
        }else{
          inQ = !inQ;
        }
        continue;
      }

      if(ch === ',' && !inQ){
        out.push(cur);
        cur = '';
        continue;
      }

      cur += ch;
    }
    out.push(cur);
    return out;
  }

  async function populateEventDropdown(){
    const select = document.getElementById('eventTypeSelect') || document.querySelector('#eventForm select[name="EVENT"]');
    if(!select) return;

    const keep = select.value;
    const defaultText = (select.querySelector('option[value=""]') || select.options[0])?.textContent || 'Select…';

    try{
      const res = await fetch('../data/events.csv', { cache: 'no-store' });
      if(!res.ok) throw new Error('events_csv_http_' + res.status);
      const text = await res.text();

      const lines = text.split(/\r?\n/).filter(l => l.trim().length);
      if(lines.length < 2) return;

      const headers = parseCsvLine(lines[0]).map(h => (h || '').trim());
      const colIdx = headers.findIndex(h => String(h).toUpperCase() === 'EVENT');
      if(colIdx < 0) return;

      const set = new Set();
      for(let i=1;i<lines.length;i++){
        const cells = parseCsvLine(lines[i]);
        const v = (cells[colIdx] || '').trim();
        if(v) set.add(v);
      }

      const values = Array.from(set).sort((a,b)=>a.localeCompare(b, undefined, { sensitivity: 'base' }));

      // rebuild options (default at top)
      select.innerHTML = '';
      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = defaultText;
      select.appendChild(opt0);

      values.forEach(v => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        select.appendChild(o);
      });

      if(keep && values.includes(keep)) select.value = keep;
    }catch(_e){
      // If fetch fails, leave the HTML fallback options as-is.
    }
  }
  window.addEventListener('load', populateEventDropdown);

// --- Helpers ---
  function setActiveView(view){
    const isIndex = view === 'index';
    tabs.forEach(btn => btn.setAttribute('aria-selected', String(btn.dataset.view === view)));
    toggle.style.setProperty('--viewProgress', isIndex ? 1 : 0);

    titleEl.textContent = isIndex ? 'INDEX – ADD NEW' : 'EVENTS – ADD NEW';
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
