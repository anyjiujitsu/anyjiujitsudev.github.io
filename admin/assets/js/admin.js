
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
      satDisplay.blur();
    });
    satDisplay.addEventListener('focus', () => {
      // treat focus like click (keyboard users / desktop)
      if(isTimeSupported(satNative)){
        if(typeof satNative.showPicker === 'function') satNative.showPicker();
        else { satNative.click(); satNative.focus({preventScroll:true}); }
      }else{
        openModalFor(satNative, satDisplay);
      }
    });

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
        else { sunNative.click(); sunNative.focus({preventScroll:true});     sunDisplay.addEventListener('focus', () => {
      if(isTimeSupported(sunNative)){
        if(typeof sunNative.showPicker === 'function') sunNative.showPicker();
        else { sunNative.click(); sunNative.focus({preventScroll:true}); }
      }else{
        openModalFor(sunNative, sunDisplay);
      }
    });
}
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
    // clear OPENS display fields after reset
    const _opensDisplays = Array.from(indexForm.querySelectorAll('input.adminTimeDisplay'));
    _opensDisplays.forEach(el => el.value = '');

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
          // clear OPENS display fields after reset
      const _opensDisplays2 = Array.from(indexForm.querySelectorAll('input.adminTimeDisplay'));
      _opensDisplays2.forEach(el => el.value = '');
}
  });
})();
