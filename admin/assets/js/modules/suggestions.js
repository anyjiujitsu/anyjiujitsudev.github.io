// admin/modules/suggestions.js
// purpose: CSV-powered WHERE/CITY autocomplete menus

import { parseCSVRows } from '../../../../assets/js/utils/csv.js';

const PUBLIC_EVENTS_CSV = '../events.csv';

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

  let menu = null;
  let hideTimer = null;

  function ensureMenu(){
    if(menu) return menu;
    menu = document.createElement('div');
    menu.className = 'acMenu';
    menu.style.display = 'none';
    document.body.appendChild(menu);

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
    menu.style.top = (r.bottom + window.scrollY + 4) + 'px';
    menu.style.left = (r.left + window.scrollX) + 'px';
    menu.style.width = r.width + 'px';
  }

  function buildList(query){
    const q = String(query ?? '').trim().toLowerCase();
    const starts = [];
    const contains = [];

    for(const v of allValues){
      const lv = v.toLowerCase();
      if(!q) starts.push(v);
      else if(lv.startsWith(q)) starts.push(v);
      else if(lv.includes(q)) contains.push(v);
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

export async function initWhereCitySuggestions(){
  try{
    const res = await fetch(PUBLIC_EVENTS_CSV, { cache: 'no-store' });
    if(!res.ok) return;
    const text = await res.text();
    const rows = parseCSVRows(text);
    if(!rows || rows.length < 2) return;

    const headers = rows[0].map(h => String(h || '').trim().toUpperCase());
    const idxWhere = headers.indexOf('WHERE');
    const idxCity  = headers.indexOf('CITY');
    if(idxWhere === -1 && idxCity === -1) return;

    const whereVals = [];
    const cityVals = [];
    for(let r = 1; r < rows.length; r++){
      const row = rows[r] || [];
      if(idxWhere !== -1) whereVals.push(row[idxWhere]);
      if(idxCity  !== -1) cityVals.push(row[idxCity]);
    }

    const whereUnique = uniqueNonEmpty(whereVals);
    const cityUnique  = uniqueNonEmpty(cityVals);

    document.querySelectorAll('input[name="WHERE"]').forEach(inp => attachAutocomplete(inp, whereUnique));
    document.querySelectorAll('input[name="CITY"]').forEach(inp => attachAutocomplete(inp, cityUnique));
  }catch(_e){
    // Admin still works without suggestions.
  }
}
