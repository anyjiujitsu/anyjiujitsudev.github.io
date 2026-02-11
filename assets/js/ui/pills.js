/* assets/js/ui/pills.js
   Full overwrite – restored + updated
*/

import { state } from '../state.js';
import {
  buildMenuList,
  positionMenu,
  closeAllMenus,
  wireMenuDismiss
} from './pillMenu.js';

/* =========================
   EVENTS VIEW PILLS
   ========================= */

export function initEventsPills() {
  const yearBtn  = document.getElementById('eventsPill1Btn');
  const stateBtn = document.getElementById('eventsPill2Btn');
  const typeBtn  = document.getElementById('eventsPill3Btn');

  if (!yearBtn || !stateBtn || !typeBtn) return;

  // YEAR
  wirePill({
    btn: yearBtn,
    label: 'YEAR',
    getSet: () => state.events.year,
    getOptions: () => Array.from(state.meta.years || [])
  });

  // STATE
  wirePill({
    btn: stateBtn,
    label: 'STATE',
    getSet: () => state.events.state,
    getOptions: () => Array.from(state.meta.states || [])
  });

  // EVENT (TYPE)
  wirePill({
    btn: typeBtn,
    label: 'EVENT',
    getSet: () => state.events.type,
    getOptions: () => Array.from(state.meta.types || [])
  });
}

/* =========================
   INDEX VIEW PILLS
   ========================= */

export function initIndexPills() {
  const stateBtn = document.getElementById('stateBtn');
  const opensBtn = document.getElementById('openMatBtn');
  const eventBtn = document.getElementById('guestsBtn'); // shared pill slot

  if (!stateBtn || !opensBtn || !eventBtn) return;

  // STATE
  wirePill({
    btn: stateBtn,
    label: 'STATE',
    getSet: () => state.index.states,
    getOptions: () => Array.from(state.meta.states || [])
  });

  // OPENS
  wirePill({
    btn: opensBtn,
    label: 'OPENS',
    getSet: () => state.index.opens,
    getOptions: () => Array.from(state.meta.opens || [])
  });

  // DROP IN (OTA)
  wirePill({
    btn: eventBtn,
    label: 'DROP IN',
    getSet: () => state.index.events,
    getOptions: () => ['ALLOWED']
  });
}

/* =========================
   CORE PILL WIRING
   ========================= */

function wirePill({ btn, label, getSet, getOptions }) {
  btn.querySelector('.pill-label').textContent = label;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllMenus();

    const set = getSet();
    const opts = getOptions();

    const menu = buildMenuList({
      options: opts,
      selectedSet: set,
      onChange: () => {
        btn.dataset.hasSelection = set.size ? 'true' : '';
        document.dispatchEvent(new CustomEvent('filters:changed'));
      },
      onClear: () => {
        set.clear();
        btn.dataset.hasSelection = '';
        document.dispatchEvent(new CustomEvent('filters:changed'));
      }
    });

    positionMenu(btn, menu);
    wireMenuDismiss(menu);
  });

  // initial dot state
  const set = getSet();
  btn.dataset.hasSelection = set && set.size ? 'true' : '';
}
