// admin/modules/time.js
// purpose: Index SAT/SUN time picker display sync

export function normalizeDirectoryTime(val){
  const s = (val || '').trim();
  if(!s) return '';
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

function format12(hhmm){
  const v = (hhmm || '').trim();
  const m = v.match(/^(\d{2}):(\d{2})$/);
  if(!m) return '';
  let hh = Number(m[1]);
  const mm = m[2];
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12;
  if(hh === 0) hh = 12;
  return `${hh}:${mm} ${ampm}`;
}

function isTimeSupported(el){
  return el && el.type === 'time';
}

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
  for(let i = 1; i <= 12; i++){
    const o = document.createElement('option');
    o.textContent = String(i);
    o.value = String(i);
    h.appendChild(o);
  }
  for(let j = 0; j < 60; j += 5){
    const o = document.createElement('option');
    o.textContent = String(j).padStart(2,'0');
    o.value = String(j).padStart(2,'0');
    mi.appendChild(o);
  }
  return modal;
}

function openModalFor(nativeEl, displayEl, syncOne){
  const modal = ensureModal();
  const hourSel = modal.querySelector('.tHour');
  const minSel  = modal.querySelector('.tMin');
  const ampmSel = modal.querySelector('.tAmpm');

  const seed = (nativeEl.value || '').match(/^(\d{2}):(\d{2})$/);
  let hh = seed ? Number(seed[1]) : 10;
  let mm = seed ? seed[2] : '00';
  let ap = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12;
  if(hh === 0) hh = 12;

  hourSel.value = String(hh);
  minSel.value = String(Math.round(Number(mm) / 5) * 5).padStart(2,'0');
  ampmSel.value = ap;

  modal.classList.add('is-open');
  modal.querySelector('.tCancel').onclick = () => modal.classList.remove('is-open');
  modal.querySelector('.tOk').onclick = () => {
    const h12 = Number(hourSel.value);
    const m2  = minSel.value;
    const ap2 = ampmSel.value;
    let h24 = h12 % 12;
    if(ap2 === 'PM') h24 += 12;

    nativeEl.value = `${String(h24).padStart(2,'0')}:${m2}`;
    syncOne(nativeEl, displayEl);
    modal.classList.remove('is-open');
  };
}

export function setupOpensTimeSync(form){
  if(!form) return;

  const satNative = form.querySelector('input.adminTimeNative[name="SAT"]');
  const sunNative = form.querySelector('input.adminTimeNative[name="SUN"]');
  const displays  = Array.from(form.querySelectorAll('input.adminTimeDisplay'));
  if(!satNative || !sunNative || displays.length < 2) return;

  const satDisplay = displays[0];
  const sunDisplay = displays[1];

  function syncOne(nativeEl, displayEl){
    const raw = nativeEl.value || '';
    displayEl.value = raw ? format12(raw) : '';
  }

  satNative.addEventListener('input', () => syncOne(satNative, satDisplay));
  satNative.addEventListener('change', () => syncOne(satNative, satDisplay));
  sunNative.addEventListener('input', () => syncOne(sunNative, sunDisplay));
  sunNative.addEventListener('change', () => syncOne(sunNative, sunDisplay));

  satDisplay.addEventListener('click', () => {
    if(isTimeSupported(satNative)){
      if(typeof satNative.showPicker === 'function') satNative.showPicker();
      else { satNative.click(); satNative.focus({preventScroll:true}); }
    }else{
      openModalFor(satNative, satDisplay, syncOne);
    }
  });

  sunDisplay.addEventListener('click', () => {
    if(isTimeSupported(sunNative)){
      if(typeof sunNative.showPicker === 'function') sunNative.showPicker();
      else { sunNative.click(); sunNative.focus({preventScroll:true}); }
    }else{
      openModalFor(sunNative, sunDisplay, syncOne);
    }
  });

  syncOne(satNative, satDisplay);
  syncOne(sunNative, sunDisplay);
}

export function clearOpensDisplay(form){
  Array.from(form?.querySelectorAll('input.adminTimeDisplay') || []).forEach(el => { el.value = ''; });
}
