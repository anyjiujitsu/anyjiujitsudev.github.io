/* assets/js/filters.js
   Full overwrite
   Purpose:
   - Events view: unchanged behavior
   - Index view: EVENT pill now filters OTA === 'Y' instead of r.EVENT
*/

import { state } from './state.js';

/* =========================
   EVENTS VIEW FILTERING
   ========================= */

export function filterEvents(rows, evState = state.events) {
  let out = rows.slice();

  // search query
  if (evState.q) {
    const q = evState.q.toLowerCase();
    out = out.filter(r =>
      Object.values(r).some(v =>
        String(v || '').toLowerCase().includes(q)
      )
    );
  }

  // year
  if (evState.year && evState.year.size) {
    out = out.filter(r => evState.year.has(String(r.YEAR)));
  }

  // state
  if (evState.state && evState.state.size) {
    out = out.filter(r => evState.state.has(r.STATE));
  }

  // type (EVENT pill on Events view)
  if (evState.type && evState.type.size) {
    out = out.filter(r => evState.type.has(r.TYPE));
  }

  return out;
}

/* =========================
   INDEX VIEW FILTERING
   ========================= */

export function filterDirectory(rows, idxState = state.index) {
  let out = rows.slice();

  // search query
  if (idxState.q) {
    const q = idxState.q.toLowerCase();
    out = out.filter(r =>
      Object.values(r).some(v =>
        String(v || '').toLowerCase().includes(q)
      )
    );
  }

  // STATE pill (unchanged)
  if (idxState.states && idxState.states.size) {
    out = out.filter(r => idxState.states.has(r.STATE));
  }

  // OPENS pill (unchanged)
  if (idxState.opens && idxState.opens.size) {
    out = out.filter(r => idxState.opens.has(r.OPENS));
  }

  // EVENT pill redirected to OTA
  // Any active selection means OTA === 'Y'
  if (idxState.events && idxState.events.size) {
    out = out.filter(r => r.OTA === 'Y');
  }

  return out;
}
