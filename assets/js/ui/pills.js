// ui/pills.js
// purpose: all pill dropdown wiring + menu positioning + hasSelection indicator

/* ------------------ Utilities ------------------ */
function parseYearFromEventRow(r){
  const y = String(r?.YEAR ?? "").trim();
  if(y) return y;
  const d = String(r?.DATE ?? "").trim();
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m) return m[3];
  const tmp = new Date(d);
  if(!isNaN(tmp)) return String(tmp.getFullYear());
  return "";
}

function uniqYearsFromEvents(rows){
  const set = new Set();
  rows.forEach(r=>{
    const y = parseYearFromEventRow(r);
    if(y) set.add(y);
  });
  return Array.from(set).sort((a,b)=>Number(b)-Number(a));
}

function uniqStatesFromEvents(rows){
  const set = new Set();
  rows.forEach(r=>{
    const s = String(r.STATE ?? "").trim();
    if(s) set.add(s);
  });
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}

function uniqTypesFromEvents(rows){
  const set = new Set();
  rows.forEach(r=>{
    const t = String(r.TYPE ?? "").trim();
    if(t) set.add(t);
  });
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}

function uniqStatesFromDirectory(rows){
  const set = new Set();
  rows.forEach(r=>{
    const s = String(r.STATE ?? "").trim();
    if(s) set.add(s);
  });
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}

function buildMenuList(panelEl, items, selectedSet, onToggle){
  panelEl.querySelectorAll('.menu__empty').forEach(n=>n.remove());
  panelEl.querySelectorAll('.menu__list').forEach(n=>n.remove());

  const list = document.createElement('div');
  list.className = 'menu__list';

  items.forEach(val=>{
    const row = document.createElement('label');
    row.className = 'menu__item menu__item--check';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'menu__checkbox';
    cb.checked = selectedSet.has(val);
    cb.value = val;

    const text = document.createElement('span');
    text.className = 'menu__itemText';
    text.textContent = val;

    cb.addEventListener('change', (ev)=>{
      ev.stopPropagation();
      if(cb.checked) selectedSet.add(val);
      else selectedSet.delete(val);
      onToggle(val, cb.checked);
    });

    row.appendChild(cb);
    row.appendChild(text);
    list.appendChild(row);
  });

  panelEl.appendChild(list);
}

function buildMenuListIn(listEl, items, selectedSet, onChange){
  if(!listEl) return;
  listEl.innerHTML = "";
  items.forEach(val=>{
    const row = document.createElement('label');
    row.className = 'menu__item menu__item--check';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'menu__checkbox';
    cb.checked = selectedSet.has(val);
    cb.value = val;

    const text = document.createElement('span');
    text.className = 'menu__itemText';
    text.textContent = val;

    cb.addEventListener('change', (ev)=>{
      ev.stopPropagation();
      if(cb.checked) selectedSet.add(val);
      else selectedSet.delete(val);
      onChange();
    });

    row.appendChild(cb);
    row.appendChild(text);
    listEl.appendChild(row);
  });
}

function setPillHasSelection(btnEl, has){
  if(!btnEl) return;
  btnEl.setAttribute('data-has-selection', has ? 'true' : 'false');
}

export function closeAllMenus(){
  document.querySelectorAll('.menu[data-pill-panel]').forEach(panel=>{
    panel.hidden = true;
    panel.style.left = '';
    panel.style.top  = '';
  });
  document.querySelectorAll('.pill.filter-pill[aria-expanded="true"]').forEach(btn=>{
    btn.setAttribute('aria-expanded','false');
  });
}

function positionMenu(btnEl, panelEl){
  const vv = window.visualViewport;
  if(!btnEl || !panelEl) return;
  const r = btnEl.getBoundingClientRect();
  const pad = 8;
  const vw = vv ? vv.width : window.innerWidth;
  const vh = vv ? vv.height : window.innerHeight;
  const vx = vv ? vv.offsetLeft : 0;
  const vy = vv ? vv.offsetTop : 0;

  panelEl.hidden = false; // show to measure

  let left = r.left + vx;
  let top  = r.bottom + pad + vy;

  const pr = panelEl.getBoundingClientRect();
  const w = pr.width;
  const h = pr.height;

  if(left + w + pad > vw) left = Math.max(pad, vw - w - pad);
  if(left < pad) left = pad;

  if(top + h + pad > vh){
    const above = r.top - h - pad;
    if(above >= pad) top = above;
    else top = Math.max(pad, vh - h - pad);
  }

  panelEl.style.left = Math.round(left) + "px";
  panelEl.style.top  = Math.round(top) + "px";
}

function wireMenuDismiss(){
  if(wireMenuDismiss._did) return;
  wireMenuDismiss._did = true;

  document.addEventListener('click', (e)=>{
    const t = e.target;
    if(t && (t.closest('.pillSelect') || t.closest('.menu') || t.closest('.pill.filter-pill'))) return;
    closeAllMenus();
  });

  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape') closeAllMenus();
  });

  window.addEventListener('resize', ()=>closeAllMenus());
}

/* ------------------ Public API ------------------ */
export function refreshEventsPillDots({ $, activeEventsState }){
  const s = activeEventsState();
  const b1 = $("eventsPill1Btn");
  const b2 = $("eventsPill2Btn");
  const b3 = $("eventsPill3Btn");
  if(b1) setPillHasSelection(b1, s.year.size>0);
  if(b2) setPillHasSelection(b2, s.state.size>0);
  if(b3) setPillHasSelection(b3, s.type.size>0);
}

export function initEventsPills({ $, getEventRows, activeEventsState, isIndexView, onChange }){
  wireMenuDismiss();

  // YEAR
  (function(){
    const btn = $("eventsPill1Btn");
    const panel = $("eventsPill1Menu");
    const clearBtn = $("eventsPill1Clear");
    if(!btn || !panel) return;

    const rebuild = ()=>{
      const sel = activeEventsState().year;
      // Index view repurposes Pill 1 as OPENS (Sat/Sun availability)
      const items = (typeof isIndexView === "function" && isIndexView()) ? ["SATURDAY","SUNDAY","BOTH"] : uniqYearsFromEvents(getEventRows());
      buildMenuList(panel, items, sel, ()=>{
        setPillHasSelection(btn, sel.size>0);
        onChange();
      });
      setPillHasSelection(btn, sel.size>0);
    };
    rebuild();

    const toggleMenu = (e)=>{
      if(e.type === 'touchend') e.preventDefault();
      e.stopPropagation();
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      closeAllMenus();
      if(!expanded){
        rebuild();
        btn.setAttribute('aria-expanded','true');
        positionMenu(btn, panel);
      } else {
        btn.setAttribute('aria-expanded','false');
        panel.hidden = true;
      }
    };
    btn.addEventListener('click', toggleMenu);
    btn.addEventListener('touchend', toggleMenu, { passive:false });

    clearBtn?.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const sel = activeEventsState().year;
      sel.clear();
      rebuild();
      closeAllMenus();
      onChange();
    });
  })();

  // STATE
  (function(){
    const btn = $("eventsPill2Btn");
    const panel = $("eventsPill2Menu");
    const clearBtn = $("eventsPill2Clear");
    if(!btn || !panel) return;

    const rebuild = ()=>{
      const sel = activeEventsState().state;
      const items = uniqStatesFromEvents(getEventRows());
      buildMenuList(panel, items, sel, ()=>{
        setPillHasSelection(btn, sel.size>0);
        onChange();
      });
      setPillHasSelection(btn, sel.size>0);
    };
    rebuild();

    const toggleMenu = (e)=>{
      if(e.type === 'touchend') e.preventDefault();
      e.stopPropagation();
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      closeAllMenus();
      if(!expanded){
        rebuild();
        btn.setAttribute('aria-expanded','true');
        positionMenu(btn, panel);
      } else {
        btn.setAttribute('aria-expanded','false');
        panel.hidden = true;
      }
    };
    btn.addEventListener('click', toggleMenu);
    btn.addEventListener('touchend', toggleMenu, { passive:false });

    clearBtn?.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const sel = activeEventsState().state;
      sel.clear();
      rebuild();
      closeAllMenus();
      onChange();
    });
  })();

  // TYPE
  (function(){
    const btn = $("eventsPill3Btn");
    const panel = $("eventsPill3Menu");
    const clearBtn = $("eventsPill3Clear");
    if(!btn || !panel) return;

    const rebuild = ()=>{
      const sel = activeEventsState().type;
      const items = (typeof isIndexView === "function" && isIndexView()) ? ["ALLOWED"] : uniqTypesFromEvents(getEventRows());
      buildMenuList(panel, items, sel, ()=>{
        setPillHasSelection(btn, sel.size>0);
        onChange();
      });
      setPillHasSelection(btn, sel.size>0);
    };
    rebuild();

    const toggleMenu = (e)=>{
      if(e.type === 'touchend') e.preventDefault();
      e.stopPropagation();
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      closeAllMenus();
      if(!expanded){
        rebuild();
        btn.setAttribute('aria-expanded','true');
        positionMenu(btn, panel);
      } else {
        btn.setAttribute('aria-expanded','false');
        panel.hidden = true;
      }
    };
    btn.addEventListener('click', toggleMenu);
    btn.addEventListener('touchend', toggleMenu, { passive:false });

    clearBtn?.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const sel = activeEventsState().type;
      sel.clear();
      rebuild();
      closeAllMenus();
      onChange();
    });
  })();
}

export function initIndexPills({ $, state, getDirectoryRows, onChange }){
  wireMenuDismiss();

  // STATE pill
  (function(){
    const btn = $("stateBtn");
    const panel = $("stateMenu");
    const clearBtn = $("stateClear");
    const listEl = $("stateList") || panel?.querySelector('.menu__list');
    if(!btn || !panel) return;

    const rebuild = ()=>{
      const states = uniqStatesFromDirectory(getDirectoryRows());
      buildMenuListIn(listEl, states, state.index.states, ()=>{
        setPillHasSelection(btn, state.index.states.size>0);
        onChange();
      });
      setPillHasSelection(btn, state.index.states.size>0);
    };
    rebuild();

    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      closeAllMenus();
      if(!expanded){
        btn.setAttribute('aria-expanded','true');
        positionMenu(btn, panel);
      } else {
        btn.setAttribute('aria-expanded','false');
        panel.hidden = true;
      }
    });

    clearBtn?.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      state.index.states.clear();
      setPillHasSelection(btn, false);
      panel.querySelectorAll('input.menu__checkbox').forEach(cb=>{ cb.checked = false; });
      onChange();
      closeAllMenus();
    });
  })();

  // OPENS pill
  (function(){
    const btn = $("openMatBtn");
    const panel = $("openMatMenu");
    const clearBtn = $("openMatClear");
    const listEl = $("openMatList") || panel?.querySelector('.menu__list');
    if(!btn || !panel) return;

    const items = ["ALL","SATURDAY","SUNDAY"];
    buildMenuListIn(listEl, items, state.index.opens, ()=>{
      setPillHasSelection(btn, state.index.opens.size>0);
      onChange();
    });
    setPillHasSelection(btn, state.index.opens.size>0);

    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      closeAllMenus();
      if(!expanded){
        btn.setAttribute('aria-expanded','true');
        positionMenu(btn, panel);
      } else {
        btn.setAttribute('aria-expanded','false');
        panel.hidden = true;
      }
    });

    clearBtn?.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      state.index.opens.clear();
      setPillHasSelection(btn, false);
      panel.querySelectorAll('input.menu__checkbox').forEach(cb=>{ cb.checked = false; });
      onChange();
      closeAllMenus();
    });
  })();

  // GUESTS pill
  (function(){
    const btn = $("guestsBtn");
    const panel = $("guestsMenu");
    const clearBtn = $("guestsClear");
    const listEl = $("guestsList") || panel?.querySelector('.menu__list');
    if(!btn || !panel) return;

    const items = ["GUESTS WELCOME"];
    buildMenuListIn(listEl, items, state.index.guests, ()=>{
      setPillHasSelection(btn, state.index.guests.size>0);
      onChange();
    });
    setPillHasSelection(btn, state.index.guests.size>0);

    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      closeAllMenus();
      if(!expanded){
        btn.setAttribute('aria-expanded','true');
        positionMenu(btn, panel);
      } else {
        btn.setAttribute('aria-expanded','false');
        panel.hidden = true;
      }
    });

    clearBtn?.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      state.index.guests.clear();
      setPillHasSelection(btn, false);
      panel.querySelectorAll('input.menu__checkbox').forEach(cb=>{ cb.checked = false; });
      onChange();
      closeAllMenus();
    });
  })();
}
