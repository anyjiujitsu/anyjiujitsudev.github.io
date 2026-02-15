
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
  const tokenHint = document.getElementById('tokenHint');

  // --- Token: load/save ---
  const TOKEN_KEY = 'anyjj_admin_github_token';
  const saved = localStorage.getItem(TOKEN_KEY);
  if(saved) tokenInput.value = saved;

  function setTokenStatus(ok){
    if(!tokenHint) return;
    if(ok){
      // Reuse your existing on-screen message copy
      tokenHint.textContent = 'Token is stored locally (LocalStorage) after you tap Save.';
      tokenHint.setAttribute('data-status', 'ok');
    }else{
      tokenHint.textContent = 'Token save failed.';
      tokenHint.setAttribute('data-status', 'fail');
    }
  }

  saveBtn.addEventListener('click', () => {
    const t = (tokenInput.value || '').trim();
    if(!t){
      setTokenStatus(false);
      return;
    }
    try{
      localStorage.setItem(TOKEN_KEY, t);
      setTokenStatus(true);
    }catch(_e){
      setTokenStatus(false);
    }
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


  // --- INDEX: native time picker proxy (keeps iOS-perfect sizing by using text inputs) ---
  function setupTimePickerProxy(form){
    if(!form) return;
    const fields = Array.from(form.querySelectorAll('input.adminTimeProxy[name="SAT"], input.adminTimeProxy[name="SUN"]'));
    if(!fields.length) return;

    // Create one hidden native time input reused for both fields (mobile-friendly)
    const picker = document.createElement('input');
    picker.type = 'time';
    picker.step = 60; // minute granularity
    picker.tabIndex = -1;
    picker.setAttribute('aria-hidden','true');
    picker.style.position = 'fixed';
    picker.style.left = '-9999px';
    picker.style.top = '0';
    picker.style.width = '1px';
    picker.style.height = '1px';
    picker.style.opacity = '0';
    document.body.appendChild(picker);

    let active = null;
    let didInteract = false;

    function normalizeHHMM(v){
      // Accept "HH:MM" or "H:MM" or "HHMM" and return "HH:MM" when possible
      v = (v || '').trim();
      if(!v) return '';
      const m1 = v.match(/^(\d{1,2}):(\d{2})$/);
      if(m1){
        const hh = String(Math.min(23, Math.max(0, Number(m1[1])))).padStart(2,'0');
        const mm = String(Math.min(59, Math.max(0, Number(m1[2])))).padStart(2,'0');
        return `${hh}:${mm}`;
      }
      const m2 = v.match(/^(\d{1,2})(\d{2})$/); // e.g. 930, 0930
      if(m2){
        const hh = String(Math.min(23, Math.max(0, Number(m2[1])))).padStart(2,'0');
        const mm = String(Math.min(59, Math.max(0, Number(m2[2])))).padStart(2,'0');
        return `${hh}:${mm}`;
      }
      return '';
    }

    function openPickerFor(field){
      active = field;
      didInteract = false;
      // Seed picker with current value if valid
      const seed = normalizeHHMM(field.value);
      picker.value = seed || '';
      // Prefer showPicker() where supported (avoids some iOS quirks)
      if(typeof picker.showPicker === 'function'){
        picker.showPicker();
      }else{
        picker.click();
        picker.focus({ preventScroll: true });
      }
    }

    // Open on tap/click only (avoid focus-triggered auto fill on iOS)
    fields.forEach(f => {
      f.readOnly = true; // keep sizing + prevent keyboard; user uses picker
      f.addEventListener('click', (e) => {
        e.preventDefault();
        openPickerFor(f);
      });
    });

    picker.addEventListener('input', () => {
      // User is actively changing the picker
      didInteract = true;
    });

    picker.addEventListener('change', () => {
      // Only commit after user interaction (prevents auto-filling current time)
      if(!active) return;
      if(!didInteract) return;
      active.value = picker.value || '';
      active.dispatchEvent(new Event('input', { bubbles: true }));
    });
});

    // Allow clearing with backspace via long-press iOS menu isn't reliable; provide double-tap to clear
    fields.forEach(f => {
      f.addEventListener('dblclick', () => { f.value = ''; });
    });
  }

  setupTimePickerProxy(indexForm);

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
  function computeDay(str){
    // expects mm/dd/yyyy
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(!m) return '';
    const dt = new Date(Number(m[3]), Number(m[1])-1, Number(m[2]));
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return days[dt.getDay()] || '';
  }
  dateInput.addEventListener('input', () => {
    dayInput.value = computeDay(dateInput.value.trim());
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
    if(which === 'event') dayInput.value = '';
  });

  // Submit stubs – keep behavior: clear on success
  async function fakeCommit(){
    // This is intentionally a stub; you said we'll wire INDEX creation later.
    // Return true to simulate success.
    return true;
  }

  eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await fakeCommit();
    if(ok){
      eventForm.reset();
      setCreatedDate(eventForm);
      dayInput.value = '';
    }
  });

  indexForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = await fakeCommit();
    if(ok){
      indexForm.reset();
      setCreatedDate(indexForm);

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
    }
  });
})();
