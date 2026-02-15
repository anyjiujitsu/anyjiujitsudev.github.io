
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

  // --- Token: load/save ---
  const TOKEN_KEY = 'anyjj_admin_github_token';
  const saved = localStorage.getItem(TOKEN_KEY);
  if(saved) tokenInput.value = saved;

  saveBtn.addEventListener('click', () => {
    localStorage.setItem(TOKEN_KEY, tokenInput.value || '');
    saveBtn.textContent = 'Saved';
    setTimeout(() => (saveBtn.textContent = 'Save'), 900);
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
    }
  });
})();


// Admin: keep token bar sticky below header
function setAdminHeaderHeight(){
  const header = document.querySelector('.adminHeader');
  const h = header ? Math.round(header.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--adminHeaderHeight', h + 'px');
}
window.addEventListener('load', setAdminHeaderHeight);
window.addEventListener('resize', setAdminHeaderHeight);


// Admin: token button label + empty-token warning
function wireTokenButtonLabel(){
  const tokenInput = document.querySelector('.adminFilters input[type="password"], .adminFilters input[type="text"]');
  const btn = document.querySelector('.adminFilters button, .adminFilters .tokenSaveBtn');
  if(!tokenInput || !btn) return;

  function refresh(){
    const has = !!(tokenInput.value || '').trim();
    btn.textContent = has ? 'SAVE' : 'CLICK TO ENTER';
    btn.classList.toggle('tokenBtnWarn', !has);
  }

  tokenInput.addEventListener('input', refresh);
  btn.addEventListener('click', (e) => {
    const has = !!(tokenInput.value || '').trim();
    if(!has){
      e.preventDefault();
      e.stopPropagation();
      tokenInput.focus();
      tokenInput.classList.add('tokenInputWarn');
      setTimeout(()=>tokenInput.classList.remove('tokenInputWarn'), 900);
      btn.classList.add('tokenBtnPulse');
      setTimeout(()=>btn.classList.remove('tokenBtnPulse'), 900);
    }
  }, true);

  refresh();
}
window.addEventListener('load', wireTokenButtonLabel);


// Admin: fixed header/token metrics + content span
function setAdminLayoutMetrics(){
  const header = document.getElementById('adminHeader');
  const token  = document.getElementById('adminTokenBar');
  const title  = header ? header.querySelector('.header__title') : null;
  const toggle = header ? header.querySelector('.viewToggle') : null;

  const headerH = header ? Math.round(header.getBoundingClientRect().height) : 0;
  const tokenH  = token  ? Math.round(token.getBoundingClientRect().height)  : 0;

  document.documentElement.style.setProperty('--adminHeaderH', headerH + 'px');
  document.documentElement.style.setProperty('--adminTokenH', tokenH + 'px');

  // Span from title left edge to toggle right edge
  if(title && toggle){
    const t = title.getBoundingClientRect();
    const g = toggle.getBoundingClientRect();
    const left = Math.max(0, Math.round(t.left));
    const width = Math.max(0, Math.round(g.right - t.left));
    document.documentElement.style.setProperty('--adminSpanL', left + 'px');
    document.documentElement.style.setProperty('--adminSpanW', width + 'px');
  }else{
    document.documentElement.style.setProperty('--adminSpanL', '0px');
    document.documentElement.style.setProperty('--adminSpanW', '100%');
  }
}
window.addEventListener('load', setAdminLayoutMetrics);
window.addEventListener('resize', setAdminLayoutMetrics);


// Admin: arrow token button focus-on-empty
function wireTokenArrow(){
  const tokenBar = document.getElementById('adminTokenBar');
  if(!tokenBar) return;
  const input = tokenBar.querySelector('input');
  const btn = tokenBar.querySelector('.tokenArrowBtn');
  if(!input || !btn) return;

  function refresh(){
    const has = !!(input.value || '').trim();
    btn.classList.toggle('tokenBtnWarn', !has);
  }
  input.addEventListener('input', refresh);

  btn.addEventListener('click', (e) => {
    const has = !!(input.value || '').trim();
    if(!has){
      e.preventDefault();
      e.stopPropagation();
      input.focus();
      input.classList.add('tokenInputWarn');
      setTimeout(()=>input.classList.remove('tokenInputWarn'), 900);
      btn.classList.add('tokenBtnPulse');
      setTimeout(()=>btn.classList.remove('tokenBtnPulse'), 900);
    }
  }, true);

  refresh();
}
window.addEventListener('load', wireTokenArrow);

window.addEventListener('load', () => { setTimeout(setAdminLayoutMetrics, 0); });
