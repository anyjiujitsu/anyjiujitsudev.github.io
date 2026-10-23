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
const chosenAcademies = new Set();
const academyToggle = $('academyToggle');
const academyMenu = $('academyMenu');
const academyOptions = $('academyOptions');
const academyLabel = $('academyLabel');
let competitions = [];
let roster = { athletes: [], loaded_competition_ids: [], errors: {} };
const normalized = v => String(v || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const SAVED_SEARCH_KEY = 'bostonopen:last-search:v1';
function saveSearch() {
  try {
    localStorage.setItem(SAVED_SEARCH_KEY, JSON.stringify({
      competitions: [...chosen],
      academies: [...chosenAcademies]
    }));
  } catch (error) { console.warn('Could not save Boston Open search:', error); }
}
function readSavedSearch() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_SEARCH_KEY) || 'null');
    if (!saved || !Array.isArray(saved.competitions) || !Array.isArray(saved.academies)) return null;
    return saved;
  } catch (error) { return null; }
}
function forgetSearch() {
  try { localStorage.removeItem(SAVED_SEARCH_KEY); }
  catch (error) { console.warn('Could not clear Boston Open search:', error); }
}
function restoreSearch() {
  const saved = readSavedSearch();
  if (!saved) return;
  const validCompetitions = new Set(competitions.map(c => c.id));
  chosen.clear();
  for (const id of saved.competitions) {
    if (validCompetitions.has(String(id))) chosen.add(String(id));
  }
  updateLabel();
  showOptions();
  updateAcademies();
  const availableAcademies = new Set(eligibleAcademies().map(([key]) => key));
  for (const key of saved.academies) {
    if (availableAcademies.has(normalized(key))) chosenAcademies.add(normalized(key));
  }
  updateAcademies();
  if (chosen.size && chosenAcademies.size) {
    $('athleteSearchForm').requestSubmit();
  }
}
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
    checkbox.addEventListener('change', () => { checkbox.checked ? chosen.add(comp.id) : chosen.delete(comp.id); updateLabel(); updateAcademies(); });
    const details = document.createElement('span');
    const name = document.createElement('span'); name.textContent = comp.name;
    const date = document.createElement('small'); date.textContent = comp.date + (comp.end_date && comp.end_date !== comp.date ? ` – ${comp.end_date}` : '');
    date.style.display = 'block'; date.style.opacity = '.65';
    details.append(name,date); item.append(checkbox,details); options.append(item);
  }
}
function setMenu(open) { menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if(open) setAcademyMenu(false); }
toggle.addEventListener('click', () => setMenu(menu.hidden));
document.addEventListener('pointerdown', event => { if (!$('competitionPicker').contains(event.target)) setMenu(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') setMenu(false); });
$('clearCompetitions').addEventListener('click', () => { chosen.clear(); updateLabel(); showOptions(); updateAcademies(); });
function eligibleAcademies() {
  const names = new Map();
  for (const athlete of roster.athletes || []) {
    if (!chosen.has(String(athlete.competition_id))) continue;
    const name = String(athlete.team || '').trim().replace(/\s+/g, ' ');
    if (name && !names.has(normalized(name))) names.set(normalized(name), name);
  }
  return [...names.entries()].sort((a,b) => a[1].localeCompare(b[1]));
}
function updateAcademies() {
  const available = eligibleAcademies();
  const allowed = new Set(available.map(a=>a[0]));
  for (const name of chosenAcademies) if (!allowed.has(name)) chosenAcademies.delete(name);
  academyLabel.textContent = chosenAcademies.size ? `ACADEMIES · ${chosenAcademies.size} SELECTED` :
    (!chosen.size ? 'ACADEMIES · SELECT' : available.length ? 'ACADEMIES · SELECT' : 'ACADEMIES · NO ROSTER');
  academyToggle.classList.toggle('has-selection', chosenAcademies.size > 0);
  academyOptions.replaceChildren();
  if (!available.length) {
    academyOptions.textContent = chosen.size ? 'No academy data for these competitions yet. Check the roster refresh.' : 'Select competitions first.';
    return;
  }
  for (const [key,name] of available) {
    const item=document.createElement('label'); item.className='boston-menu-row';
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=chosenAcademies.has(key);
    cb.addEventListener('change',()=>{ cb.checked ? chosenAcademies.add(key) : chosenAcademies.delete(key); updateAcademyLabel(); });
    const value=document.createElement('span'); value.textContent=name;
    item.append(cb,value); academyOptions.append(item);
  }
}
function updateAcademyLabel() {
  academyLabel.textContent = chosenAcademies.size ? `ACADEMIES · ${chosenAcademies.size} SELECTED` : 'ACADEMIES · SELECT';
  academyToggle.classList.toggle('has-selection',chosenAcademies.size>0);
}
function setAcademyMenu(open) { academyMenu.hidden=!open; academyToggle.setAttribute('aria-expanded',String(open)); if(open) setMenu(false); }
academyToggle.addEventListener('click',()=>setAcademyMenu(academyMenu.hidden));
$('clearAcademies').addEventListener('click',()=>{chosenAcademies.clear();updateAcademies();});
document.addEventListener('pointerdown',e=>{if(!$('academyPicker').contains(e.target))setAcademyMenu(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape')setAcademyMenu(false);});
async function getJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not read ${path} (HTTP ${response.status}).`);
  return response.json();
}
function appendCell(parent, text, cls = '') { const span = document.createElement('span'); span.className = cls; span.textContent = text || '—'; parent.append(span); }
// Display IBJJF divisions with a muted belt-color bar spanning age, gender, and weight.
function appendBracketCell(parent, bracketText) {
  const text = String(bracketText || '').trim();
  const parts = text.split(/\s*\/\s*/).map(part => part.trim());
  const colors = { white: '#e5e3de', blue: '#647e9a', purple: '#877790', brown: '#886f60', black: '#3e403f', gray: '#8d908e', grey: '#8d908e', yellow: '#c0ae7c', orange: '#b68a68', green: '#6f8878' };
  const color = (parts[0] || '').toLowerCase();
  const cell = document.createElement('span');
  cell.className = 'boston-bracket';
  if (parts.length < 3 || !Object.prototype.hasOwnProperty.call(colors, color)) {
    cell.textContent = text || '—';
    parent.append(cell);
    return;
  }
  const bar = document.createElement('span');
  bar.className = 'boston-belt-bar';
  bar.style.backgroundColor = colors[color];
  bar.title = `${parts[0]} belt`;
  bar.setAttribute('aria-label', `${parts[0]} belt`);
  const lines = document.createElement('span');
  lines.className = 'boston-bracket-text';
  const age = document.createElement('span');
  age.className = 'boston-bracket-line';
  age.textContent = parts[1] || '—';
  const gender = document.createElement('span');
  gender.className = 'boston-bracket-line';
  gender.textContent = parts[2] || '—';
  const weight = document.createElement('span');
  weight.className = 'boston-bracket-line';
  weight.textContent = parts.slice(3).join(' / ') || '—';
  lines.append(age, gender, weight);
  cell.append(bar, lines);
  parent.append(cell);
}
function renderAthletes(items) {
  rows.replaceChildren();
  if (!items.length) { const blank = document.createElement('div'); blank.className = 'boston-empty'; blank.textContent = 'No athletes matched your search in the available rosters.'; rows.append(blank); return; }
  for (const athlete of items) {
    const row = document.createElement('div'); row.className = 'boston-results-row';
    const primary = document.createElement('span');
    const a = document.createElement('a'); a.href = athlete.bracket_url || `https://ibjjf.com/events/${encodeURIComponent(athlete.competition_id)}/athletes-list-by-academy-teams`;
    a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = athlete.name; primary.append(a);
    const secondary = document.createElement('small'); secondary.textContent = `${athlete.team || 'Team unavailable'} · ${athlete.competition_name || ''}`; primary.append(secondary);
    row.append(primary);
    appendBracketCell(row, athlete.bracket || athlete.division || '—');
    appendCell(row, athlete.time || '—'); appendCell(row, athlete.mat || '—'); appendCell(row, athlete.day || '—');
    rows.append(row);
  }
}
// Calendar day first, then actual clock time; missing assignments sort last.
function dayRank(value) {
  const d = normalized(value);
  const days = ['sat','sun','mon','tue','wed','thu','fri'];
  const match = days.findIndex(x => d.startsWith(x));
  if (match >= 0) return match;
  const date = d.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?/);
  return date ? Number(date[1])*32 + Number(date[2]) : 9999;
}
function timeRank(value) {
  const t = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!t) return 9999;
  return (Number(t[1]) % 12 + (t[3].toUpperCase()==='PM' ? 12 : 0))*60 + Number(t[2]);
}
$('clearAllButton').addEventListener('click', () => {
  forgetSearch();
  chosen.clear(); chosenAcademies.clear();
  updateLabel(); showOptions(); updateAcademies();
  rows.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'boston-empty'; empty.textContent = ' ';
  rows.append(empty);
  setStatus('Selections cleared. Choose competitions and academies to search.');
  setMenu(false); setAcademyMenu(false);
});
$('athleteSearchForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!chosen.size) { setStatus('Select at least one Boston competition first.'); setMenu(true); return; }
  if (!chosenAcademies.size) { setStatus('Select at least one academy.'); setAcademyMenu(true); return; }
  saveSearch();
  const found = (roster.athletes || []).filter(a => chosen.has(String(a.competition_id)) && chosenAcademies.has(normalized(a.team)));
  found.sort((a,b) => {
    const da=dayRank(a.day), db=dayRank(b.day);
    return da-db || timeRank(a.time)-timeRank(b.time) || a.name.localeCompare(b.name);
  });
  renderAthletes(found);
  const loaded = new Set((roster.loaded_competition_ids || []).map(String));
  const pending = [...chosen].filter(id => !loaded.has(id));
  const failed = pending.map(id => roster.errors?.[id]).filter(Boolean);
  const missing = found.filter(a => !a.mat || !a.time || !a.day).length;
  setStatus(`${found.length} athlete ${found.length === 1 ? 'entry' : 'entries'} from selected academies.${missing ? ` Fight assignments are not yet published or matched for ${missing}.` : ''}${pending.length ? ` ${pending.length} selected roster(s) are not yet synced; run the GitHub Actions refresh.${failed.length ? ' Refresh issue: ' + failed.join(' / ') : ''}` : ''}`);
  setMenu(false); setAcademyMenu(false);
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
    updateAcademies();
    const loadedCount = (roster.loaded_competition_ids || []).filter(id => competitions.some(c => c.id === String(id))).length;
    const errorSummary = Object.values(roster.errors || {}).filter(Boolean).slice(0, 2).join(' / ');
    if (!status.textContent.includes('unavailable')) setStatus('Select competitions and academies, then GO.');
    searchButton.disabled = false;
    restoreSearch();
  } catch (error) {
    label.textContent = 'COMPETITIONS · UNAVAILABLE'; options.textContent = 'Failed to load IBJJF competitions.';
    setStatus(`Unable to load competition data: ${error.message}`);
  }
}
initialize();
