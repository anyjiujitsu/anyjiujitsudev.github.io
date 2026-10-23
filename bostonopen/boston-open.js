/* Isolated Boston Open page: reads repository-local IBJJF data, no cross-origin browser scraping. */
const CUTOFF = '2026-07-01'; // EXCLUSIVE: only dates strictly after July 1, 2026.
const $ = id => document.getElementById(id);
const toggle = $('competitionToggle');
const menu = $('competitionMenu');
const options = $('competitionOptions');
const label = $('competitionLabel');
const status = $('bostonStatus');
const rows = $('athleteRows');
const searchButton = $('athleteSearchButton');
const chosen = new Set();
let competitions = [];
let roster = { athletes: [], loaded_competition_ids: [], errors: {} };
const normalized = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
function setStatus(s) { status.textContent = s; }
function updateLabel() {
  label.textContent = chosen.size ? `COMPETITIONS · ${chosen.size} SELECTED` : 'COMPETITIONS · SELECT';
  toggle.classList.toggle('has-selection', chosen.size > 0);
}
function showOptions() {
  options.replaceChildren();
  if (!competitions.length) { options.textContent = 'No Boston competitions after July 1, 2026.'; return; }
  for (const comp of competitions) {
    const item = document.createElement('label'); item.className = 'boston-menu-row';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = chosen.has(comp.id);
    checkbox.addEventListener('change', () => { checkbox.checked ? chosen.add(comp.id) : chosen.delete(comp.id); updateLabel(); });
    const details = document.createElement('span');
    const name = document.createElement('span'); name.textContent = comp.name;
    const date = document.createElement('small'); date.textContent = comp.date + (comp.end_date && comp.end_date !== comp.date ? ` – ${comp.end_date}` : '');
    date.style.display = 'block'; date.style.opacity = '.65';
    details.append(name,date); item.append(checkbox,details); options.append(item);
  }
}
function setMenu(open) { menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); }
toggle.addEventListener('click', () => setMenu(menu.hidden));
document.addEventListener('pointerdown', event => { if (!$('competitionPicker').contains(event.target)) setMenu(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') setMenu(false); });
$('clearCompetitions').addEventListener('click', () => { chosen.clear(); updateLabel(); showOptions(); });
async function getJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not read ${path} (HTTP ${response.status}).`);
  return response.json();
}
function appendCell(parent, text, cls = '') { const span = document.createElement('span'); span.className = cls; span.textContent = text || '—'; parent.append(span); }
function renderAthletes(items) {
  rows.replaceChildren();
  if (!items.length) { const blank = document.createElement('div'); blank.className = 'boston-empty'; blank.textContent = 'No athletes matched your search in the available rosters.'; rows.append(blank); return; }
  for (const athlete of items) {
    const row = document.createElement('div'); row.className = 'boston-results-row';
    const primary = document.createElement('span');
    const a = document.createElement('a'); a.href = `https://ibjjf.com/events/${encodeURIComponent(athlete.competition_id)}/athletes-list-by-divisions`;
    a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = athlete.name; primary.append(a);
    const secondary = document.createElement('small'); secondary.textContent = `${athlete.team || 'Team unavailable'} · ${athlete.competition_name || ''}`; primary.append(secondary);
    row.append(primary);
    appendCell(row, [athlete.belt,athlete.division].filter(Boolean).join(' · '));
    appendCell(row, athlete.time || '—'); appendCell(row, athlete.mat || '—'); appendCell(row, athlete.day || athlete.date || '—');
    rows.append(row);
  }
}
$('athleteSearchForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!chosen.size) { setStatus('Select at least one Boston competition first.'); setMenu(true); return; }
  const term = normalized($('athleteQuery').value.trim());
  const found = (roster.athletes || []).filter(a => chosen.has(String(a.competition_id)) && (!term || normalized(`${a.name} ${a.team}`).includes(term)));
  found.sort((a,b) => a.name.localeCompare(b.name) || a.competition_id.localeCompare(b.competition_id));
  renderAthletes(found);
  const loaded = new Set((roster.loaded_competition_ids || []).map(String));
  const pending = [...chosen].filter(id => !loaded.has(id));
  setStatus(`${found.length} matching athlete ${found.length === 1 ? 'entry' : 'entries'}.${pending.length ? ` Athlete lists for ${pending.length} selected competition${pending.length === 1 ? ' are' : 's are'} not yet synced; use the GitHub Actions refresh.` : ''}`);
  setMenu(false);
});
async function initialize() {
  searchButton.disabled = true;
  try {
    const source = await getJson('./competitions.json');
    competitions = (source.competitions || []).map(c => ({ ...c, id: String(c.id) }))
      .filter(c => /boston/i.test(c.name) && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.date > CUTOFF)
      .sort((a,b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    showOptions(); updateLabel();
    try { roster = await getJson('./athletes.json'); }
    catch (error) { roster = { athletes: [], loaded_competition_ids: [] }; setStatus(`Competitions ready, but athlete data is unavailable: ${error.message}`); }
    const loadedCount = (roster.loaded_competition_ids || []).filter(id => competitions.some(c => c.id === String(id))).length;
    if (!status.textContent.includes('unavailable')) setStatus(`${competitions.length} Boston competition${competitions.length === 1 ? '' : 's'} after July 1, 2026. ${loadedCount} athlete roster${loadedCount === 1 ? '' : 's'} synced.${loadedCount ? ' Select competitions, then search.' : ' Run the GitHub Actions roster refresh to enable athlete results.'}`);
    searchButton.disabled = false;
  } catch (error) {
    label.textContent = 'COMPETITIONS · UNAVAILABLE'; options.textContent = 'Failed to load IBJJF competitions.';
    setStatus(`Unable to load competition data: ${error.message}`);
  }
}
initialize();
