/* Isolated OPENS page: reads repository-local IBJJF data, no cross-origin browser scraping. */

const $ = id => document.getElementById(id);
const toggle = $('competitionToggle');
const menu = $('competitionMenu');
const options = $('competitionOptions');
const label = $('competitionLabel');
const status = $('bostonStatus');
const rows = $('athleteRows');
// Optional shared-site header label. The standalone OPENS page has no such element.
const activeCountLabel = $('compsActiveStatus');
function updateActiveCount(items) {
  if (!activeCountLabel) return;
  const count = items.filter(a => !['WIN', 'LOSS', 'BYE'].includes(String(a.result || '').trim().toUpperCase())).length;
  activeCountLabel.textContent = `${count} active ${count === 1 ? 'match' : 'matches'}`;
  // The counter belongs to the COMPS view. Do not depend on view-toggle
  // timing to reveal it after the module has rendered its results.
  if (document.getElementById('tabComps')?.getAttribute('aria-selected') === 'true') {
    activeCountLabel.hidden = false;
  }
}
const chosen = new Set();
const chosenAcademies = new Set();
const chosenAthletes = new Set();
let athleteVisibleLimit = 150;
const academyToggle = $('academyToggle');
const academyMenu = $('academyMenu');
const academyOptions = $('academyOptions');
const academyLabel = $('academyLabel');
const academySearchInput = $('academySearchInput');
const academySearchClear = $('academySearchClear');
const athleteToggle = $('athleteToggle');
const athleteMenu = $('athleteMenu');
const athleteOptions = $('athleteOptions');
const athleteLabel = $('athleteLabel');
const athleteSearchInput = $('athleteSearchInput');
const athleteSearchClear = $('athleteSearchClear');
let competitions = [];
let roster = { athletes: [], loaded_competition_ids: [], errors: {} };
let hasRenderedSearch = false;
let rosterFingerprint = '';
let refreshInFlight = false;
const ROSTER_POLL_MS = 120000; // Check the published dataset every two minutes.
const normalized = v => String(v || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const SAVED_SEARCH_KEY = 'opens:last-search:v1';
function saveSearch() {
  try {
    localStorage.setItem(SAVED_SEARCH_KEY, JSON.stringify({
      competitions: [...chosen],
      academies: [...chosenAcademies],
      athletes: [...chosenAthletes]
    }));
  } catch (error) { console.warn('Could not save OPENS search:', error); }
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
  catch (error) { console.warn('Could not clear OPENS search:', error); }
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
  const availableAthletes = new Set(eligibleAthletes().map(([key]) => key));
  for (const key of saved.athletes || []) {
    if (availableAthletes.has(String(key))) chosenAthletes.add(String(key));
  }
  updateAthletes();
  applySearch({ persist: false });
}
function setStatus(s) { status.textContent = s; }
function updateLabel() {
  label.textContent = chosen.size ? `COMPS · ${chosen.size}` : 'COMPS';
  toggle.classList.toggle('has-selection', chosen.size > 0);
}
function showOptions() {
  options.replaceChildren();
  if (!competitions.length) { options.textContent = 'No competitions after July 1, 2026.'; return; }
  for (const comp of competitions) {
    const item = document.createElement('label'); item.className = 'boston-menu-row';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = chosen.has(comp.id);
    checkbox.addEventListener('change', () => { checkbox.checked ? chosen.add(comp.id) : chosen.delete(comp.id); updateLabel(); updateAcademies(); updateAthletes(); applySearch(); });
    const details = document.createElement('span');
    const name = document.createElement('span'); name.textContent = comp.name;
    const date = document.createElement('small'); date.textContent = comp.date + (comp.end_date && comp.end_date !== comp.date ? ` – ${comp.end_date}` : '');
    date.style.display = 'block'; date.style.opacity = '.65';
    details.append(name,date); item.append(checkbox,details); options.append(item);
  }
}
function setMenu(open) { menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); if(open) { setAcademyMenu(false); setAthleteMenu(false); } }
toggle.addEventListener('click', () => setMenu(menu.hidden));
document.addEventListener('pointerdown', event => { if (!$('competitionPicker').contains(event.target)) setMenu(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') setMenu(false); });
$('clearCompetitions').addEventListener('click', () => { chosen.clear(); updateLabel(); showOptions(); updateAcademies(); updateAthletes(); applySearch(); });
function eligibleAcademies() {
  const names = new Map();
  for (const athlete of roster.athletes || []) {
    if (!chosen.has(String(athlete.competition_id))) continue;
    const name = String(athlete.team || '').trim().replace(/\s+/g, ' ');
    if (name && !names.has(normalized(name))) names.set(normalized(name), name);
  }
  return [...names.entries()].sort((a,b) => a[1].localeCompare(b[1]));
}
// Filtering only changes the visible choices; selected academy keys remain intact.
// With an empty search, selected gyms always appear first, alphabetically.
function renderAcademyOptions(available = eligibleAcademies()) {
  const query = normalized(academySearchInput.value);
  const visible = available.filter(([, name]) => normalized(name).includes(query))
    .sort((a, b) => Number(chosenAcademies.has(b[0])) - Number(chosenAcademies.has(a[0])) || a[1].localeCompare(b[1]));
  academyOptions.replaceChildren();
  if (!available.length) {
    academyOptions.textContent = chosen.size ? 'No academy data for these competitions yet. Check the roster refresh.' : 'Select competitions first.';
    return;
  }
  if (!visible.length) {
    academyOptions.textContent = 'No academies match your search.';
    return;
  }
  for (const [key, name] of visible) {
    const item = document.createElement('label');
    item.className = 'boston-menu-row';
    item.classList.toggle('is-selected', chosenAcademies.has(key));
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = chosenAcademies.has(key);
    cb.addEventListener('change', () => {
      cb.checked ? chosenAcademies.add(key) : chosenAcademies.delete(key);
      updateAcademyLabel();
      renderAcademyOptions(available);
      // Change the displayed matches immediately, without closing the picker.
      applySearch();
    });
    const value = document.createElement('span');
    value.textContent = name;
    item.append(cb, value);
    academyOptions.append(item);
  }
}
function updateAcademies() {
  const available = eligibleAcademies();
  const allowed = new Set(available.map(([key]) => key));
  for (const name of chosenAcademies) if (!allowed.has(name)) chosenAcademies.delete(name);
  updateAcademyLabel();
  renderAcademyOptions(available);
}
function updateAcademyLabel() {
  academyLabel.textContent = chosenAcademies.size ? `ACADEMIES · ${chosenAcademies.size}` : 'ACADEMIES';
  academyToggle.classList.toggle('has-selection', chosenAcademies.size > 0);
}
function syncAcademySearchClear() {
  academySearchClear.hidden = !academySearchInput.value;
}
function fitAcademyMenu() {
  if (academyMenu.hidden) return;
  const vp = window.visualViewport;
  const visibleBottom = vp ? vp.offsetTop + vp.height : window.innerHeight;
  const availableSpace = visibleBottom - academyMenu.getBoundingClientRect().top - 8;
  academyMenu.style.maxHeight = `${Math.min(330, Math.max(95, availableSpace))}px`;
}
function setAcademyMenu(open) {
  academyMenu.hidden = !open;
  academyToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    setMenu(false);
    setAthleteMenu(false);
    requestAnimationFrame(fitAcademyMenu);
    // Avoid unexpectedly opening the iOS keyboard while switching slides.
    if (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) {
      academySearchInput.focus({ preventScroll: true });
    }
  } else {
    academyMenu.style.removeProperty('max-height');
  }
}
academyToggle.addEventListener('click', () => setAcademyMenu(academyMenu.hidden));
$('clearAcademies').addEventListener('click', () => { chosenAcademies.clear(); updateAcademies(); applySearch(); });
academySearchInput.addEventListener('input', () => {
  syncAcademySearchClear();
  renderAcademyOptions();
  academyOptions.scrollTop = 0;
  requestAnimationFrame(fitAcademyMenu);
});
academySearchInput.addEventListener('keydown', e => {
  // Return filters academy choices only; it doesn't navigate or change selections.
  if (e.key === 'Enter') e.preventDefault();
});
academySearchClear.addEventListener('click', () => {
  academySearchInput.value = '';
  syncAcademySearchClear();
  renderAcademyOptions();
  academyOptions.scrollTop = 0;
  academySearchInput.focus({ preventScroll: true });
});
window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(fitAcademyMenu));
window.visualViewport?.addEventListener('scroll', () => requestAnimationFrame(fitAcademyMenu));
document.addEventListener('pointerdown', e => { if (!$('academyPicker').contains(e.target)) setAcademyMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') setAcademyMenu(false); });
// Athletes are identified by name + academy to avoid silently merging namesakes.
// A selection follows every matching bracket row for that athlete across selected comps.
function athleteKey(athlete) {
  return `${normalized(athlete.name)}|${normalized(athlete.team)}`;
}
function eligibleAthletes() {
  const names = new Map();
  for (const athlete of roster.athletes || []) {
    if (!chosen.has(String(athlete.competition_id))) continue;
    const name = String(athlete.name || '').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const team = String(athlete.team || '').trim().replace(/\s+/g, ' ');
    const key = athleteKey(athlete);
    if (!names.has(key)) names.set(key, { name, team });
  }
  return [...names.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name) || a[1].team.localeCompare(b[1].team));
}
// Search the entire athlete roster. Limit the rendered rows to keep large IBJJF
// competitions responsive on iOS; the rest remain immediately searchable.
function renderAthleteOptions(available = eligibleAthletes()) {
  const query = normalized(athleteSearchInput.value);
  const matching = available.filter(([, person]) =>
    normalized(person.name).includes(query) || normalized(person.team).includes(query));
  matching.sort((a, b) => Number(chosenAthletes.has(b[0])) - Number(chosenAthletes.has(a[0])) ||
    a[1].name.localeCompare(b[1].name) || a[1].team.localeCompare(b[1].team));
  athleteOptions.replaceChildren();
  if (!available.length) {
    athleteOptions.textContent = chosen.size ? 'No athlete data for these competitions yet. Check the roster refresh.' : 'Select competitions first.';
    return;
  }
  if (!matching.length) {
    athleteOptions.textContent = 'No athletes match your search.';
    return;
  }
  const maxRows = athleteVisibleLimit;
  const fragment = document.createDocumentFragment();
  for (const [key, person] of matching.slice(0, maxRows)) {
    const item = document.createElement('label');
    item.className = 'boston-menu-row';
    item.classList.toggle('is-selected', chosenAthletes.has(key));
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = chosenAthletes.has(key);
    cb.addEventListener('change', () => {
      cb.checked ? chosenAthletes.add(key) : chosenAthletes.delete(key);
      updateAthleteLabel();
      renderAthleteOptions(available);
      applySearch();
    });
    const detail = document.createElement('span');
    const name = document.createElement('span');
    name.textContent = person.name;
    detail.append(name);
    if (person.team) {
      const team = document.createElement('small');
      team.className = 'boston-option-team';
      team.textContent = person.team;
      detail.append(team);
    }
    item.append(cb, detail);
    fragment.append(item);
  }
  if (matching.length > maxRows) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'boston-options-more';
    more.textContent = `Show more athletes (${maxRows} of ${matching.length})`;
    more.addEventListener('click', () => {
      const previousScroll = athleteOptions.scrollTop;
      athleteVisibleLimit += 150;
      renderAthleteOptions(available);
      athleteOptions.scrollTop = previousScroll;
    });
    fragment.append(more);
  }
  athleteOptions.append(fragment);
}
function updateAthleteLabel() {
  athleteLabel.textContent = chosenAthletes.size ? `ATHLETES · ${chosenAthletes.size}` : 'ATHLETES';
  athleteToggle.classList.toggle('has-selection', chosenAthletes.size > 0);
}
function updateAthletes() {
  const available = eligibleAthletes();
  const allowed = new Set(available.map(([key]) => key));
  for (const key of chosenAthletes) if (!allowed.has(key)) chosenAthletes.delete(key);
  updateAthleteLabel();
  renderAthleteOptions(available);
}
function syncAthleteSearchClear() {
  athleteSearchClear.hidden = !athleteSearchInput.value;
}
function fitAthleteMenu() {
  if (athleteMenu.hidden) return;
  const vp = window.visualViewport;
  const visibleBottom = vp ? vp.offsetTop + vp.height : window.innerHeight;
  const availableSpace = visibleBottom - athleteMenu.getBoundingClientRect().top - 8;
  athleteMenu.style.maxHeight = `${Math.min(330, Math.max(95, availableSpace))}px`;
}
function setAthleteMenu(open) {
  athleteMenu.hidden = !open;
  athleteToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    setMenu(false);
    setAcademyMenu(false);
    requestAnimationFrame(fitAthleteMenu);
    if (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) {
      athleteSearchInput.focus({ preventScroll: true });
    }
  } else {
    athleteMenu.style.removeProperty('max-height');
  }
}
athleteToggle.addEventListener('click', () => setAthleteMenu(athleteMenu.hidden));
$('clearAthletes').addEventListener('click', () => { chosenAthletes.clear(); updateAthletes(); applySearch(); });
athleteSearchInput.addEventListener('input', () => {
  athleteVisibleLimit = 150;
  syncAthleteSearchClear();
  renderAthleteOptions();
  athleteOptions.scrollTop = 0;
  requestAnimationFrame(fitAthleteMenu);
});
athleteSearchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') e.preventDefault();
});
athleteSearchClear.addEventListener('click', () => {
  athleteVisibleLimit = 150;
  athleteSearchInput.value = '';
  syncAthleteSearchClear();
  renderAthleteOptions();
  athleteOptions.scrollTop = 0;
  athleteSearchInput.focus({ preventScroll: true });
});
window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(fitAthleteMenu));
window.visualViewport?.addEventListener('scroll', () => requestAnimationFrame(fitAthleteMenu));
document.addEventListener('pointerdown', e => { if (!$('athletePicker').contains(e.target)) setAthleteMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') setAthleteMenu(false); });
async function getJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not read ${path} (HTTP ${response.status}).`);
  return response.json();
}
function appendCell(parent, text, cls = '') { const span = document.createElement('span'); span.className = cls; span.textContent = text || '—'; parent.append(span); }
// Display IBJJF divisions with a muted belt-color bar spanning age, gender, and weight.
function appendBracketCell(parent, bracketText, resultText = '') {
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
  weight.textContent = (parts.slice(3).join(' / ').replace(/\s*\(\s*[\d.,]+\s*(?:lb|lbs|kg)?\s*\)/gi, '').trim()) || '—';
  lines.append(age, gender, weight);
  const result = String(resultText || '').trim().toUpperCase();
  if (result) {
    const pill = document.createElement('span');
    pill.className = `boston-result-pill boston-result-pill--${result.toLowerCase()}`;
    pill.textContent = `-${result}-`;
    lines.append(pill);
  }
  cell.append(bar, lines);
  parent.append(cell);
}
function renderAthletes(items) {
  updateActiveCount(items);
  rows.replaceChildren();
  if (!items.length) { const blank = document.createElement('div'); blank.className = 'boston-empty'; blank.textContent = 'No athletes matched your search in the available rosters.'; rows.append(blank); return; }
  const isFinishedMatch = athlete => ['WIN', 'LOSS', 'BYE'].includes(String(athlete.result || '').trim().toUpperCase());
  const upcoming = items.filter(athlete => !isFinishedMatch(athlete));
  const finishedItems = items.filter(isFinishedMatch);
  const ordered = upcoming.concat(finishedItems);
  // Separate the active and finished match cardbodies without changing row content.
  const activeCard = document.createElement('div');
  activeCard.className = 'boston-match-card boston-match-card--active';
  if (upcoming.length) rows.append(activeCard);
  let finishedCard = null;
  let finishedSectionStarted = false;
  for (const athlete of ordered) {
    const isFinished = isFinishedMatch(athlete);
    if (isFinished && !finishedSectionStarted) {
      const divider = document.createElement('div');
      divider.className = 'boston-finished-divider';
      divider.textContent = 'FINISHED MATCHES';
      rows.append(divider);
      finishedCard = document.createElement('div');
      finishedCard.className = 'boston-match-card boston-match-card--finished';
      rows.append(finishedCard);
      finishedSectionStarted = true;
    }
    const row = document.createElement('div'); row.className = 'boston-results-row';
    if (isFinished) row.classList.add('is-finished');
    const primary = document.createElement('span');
    const a = document.createElement('a'); a.href = athlete.bracket_url || `https://ibjjf.com/events/${encodeURIComponent(athlete.competition_id)}/athletes-list-by-academy-teams`;
    a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = athlete.name; primary.append(a);
    // Display-only presentation: keep the complete academy name in dropdowns and saved data.
    const academy = document.createElement('small');
    academy.className = 'boston-athlete-academy';
    academy.textContent = athlete.team || 'Team unavailable';
    academy.title = academy.textContent;
    const event = document.createElement('small');
    event.className = 'boston-athlete-event';
    event.textContent = String(athlete.competition_name || '')
      .replace(/\b(?:international|jiu[-– ]jitsu|championships?)\b/gi, '')
      .replace(/\s{2,}/g, ' ').replace(/\s+([.,-])/g, '$1').trim();
    event.title = athlete.competition_name || '';
    primary.append(academy, event);
    row.append(primary);
    appendBracketCell(row, athlete.bracket || athlete.division || '—', athlete.result || '');
    appendCell(row, athlete.time || '—'); appendCell(row, athlete.mat || '—'); appendCell(row, athlete.day || '—');
    (isFinished ? finishedCard : activeCard).append(row);
  }
}
// Calendar day first, then actual clock time; missing assignments sort last.
function dayRank(value) {
  const d = normalized(value);
  const days = ['mon','tue','wed','thu','fri','sat','sun'];
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
  hasRenderedSearch = false;
  chosen.clear(); chosenAcademies.clear(); chosenAthletes.clear();
  academySearchInput.value = '';
  athleteSearchInput.value = '';
  athleteVisibleLimit = 150;
  syncAcademySearchClear();
  syncAthleteSearchClear();
  updateLabel(); showOptions(); updateAcademies(); updateAthletes();
  rows.replaceChildren();
  updateActiveCount([]);
  const empty = document.createElement('div');
  empty.className = 'boston-empty'; empty.textContent = ' ';
  rows.append(empty);
  setStatus('Selections cleared. Choose competitions, then academies or athletes.');
  setMenu(false); setAcademyMenu(false); setAthleteMenu(false);
});
function applySearch({ persist = true } = {}) {
  if (persist) saveSearch();
  if (!chosen.size || (!chosenAcademies.size && !chosenAthletes.size)) {
    hasRenderedSearch = false;
    rows.replaceChildren();
    updateActiveCount([]);
    const empty = document.createElement('div');
    empty.className = 'boston-empty';
    empty.textContent = ' ';
    rows.append(empty);
    setStatus(chosen.size ? 'Select an academy or athlete to display matches.' : 'Select a competition, then choose academies or athletes.');
    return;
  }
  hasRenderedSearch = true;
  const found = (roster.athletes || []).filter(a => chosen.has(String(a.competition_id)) && (chosenAcademies.has(normalized(a.team)) || chosenAthletes.has(athleteKey(a))));
  found.sort((a,b) => {
    const fa = ['WIN','LOSS','BYE'].includes(String(a.result || '').trim().toUpperCase()) ? 1 : 0;
    const fb = ['WIN','LOSS','BYE'].includes(String(b.result || '').trim().toUpperCase()) ? 1 : 0;
    const da=dayRank(a.day), db=dayRank(b.day);
    return fa-fb || da-db || timeRank(a.time)-timeRank(b.time) || a.name.localeCompare(b.name);
  });
  renderAthletes(found);
  const loaded = new Set((roster.loaded_competition_ids || []).map(String));
  const pending = [...chosen].filter(id => !loaded.has(id));
  const failed = pending.map(id => roster.errors?.[id]).filter(Boolean);
  const missing = found.filter(a => !a.mat || !a.time || !a.day).length;
  const selectionType = chosenAcademies.size && chosenAthletes.size ? 'academies and individual athletes' : (chosenAcademies.size ? 'academies' : 'athletes');
  setStatus(`${found.length} athlete ${found.length === 1 ? 'entry' : 'entries'} from selected ${selectionType}.${missing ? ` Fight assignments are not yet published or matched for ${missing}.` : ''}${pending.length ? ` ${pending.length} selected roster(s) are not yet synced; run the GitHub Actions refresh.${failed.length ? ' Refresh issue: ' + failed.join(' / ') : ''}` : ''}`);
  // Keep dropdowns open when a checkbox changes, so several gyms can be added quickly.
}
$('athleteSearchForm').addEventListener('submit', event => event.preventDefault());
async function initialize() {
  try {
    const source = await getJson(new URL('./config.json', import.meta.url).href);
    try { roster = await getJson(new URL('./athletes.json', import.meta.url).href);
      rosterFingerprint = JSON.stringify([roster.athletes, roster.published_competitions, roster.loaded_competition_ids, roster.errors]); }
    catch (error) { roster = { athletes: [], loaded_competition_ids: [] }; setStatus(`Athlete data is unavailable: ${error.message}`); }
    // Only published competition data is exposed; newly saved settings wait for a successful scrape.
    const legacyPublished = [...new Map((roster.athletes || []).filter(a=>a.competition_id && a.competition_name).map(a=>[String(a.competition_id), {id:String(a.competition_id),name:a.competition_name,date:a.date||''}])).values()];
    competitions = (roster.published_competitions || legacyPublished).map(c => ({...c,id:String(c.id)}))
      .filter(c => c.id && c.name).sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')) || a.name.localeCompare(b.name));
    showOptions(); updateLabel();
    updateAcademies(); updateAthletes();
    const loadedCount = (roster.loaded_competition_ids || []).filter(id => competitions.some(c => c.id === String(id))).length;
    const errorSummary = Object.values(roster.errors || {}).filter(Boolean).slice(0, 2).join(' / ');
    if (!status.textContent.includes('unavailable')) {
      setStatus('Select a competition, then choose academies or athletes. Matches update automatically.');
    }
    if (readSavedSearch()) restoreSearch();
  } catch (error) {
    label.textContent = 'COMPS'; options.textContent = 'Failed to load IBJJF competitions.';
    setStatus(`Unable to load competition data: ${error.message}`);
  }
}
updateActiveCount([]);
initialize();

// Background GitHub Actions updates athletes.json; a long-lived browser tab must
// reload that published snapshot independently of the Python scrape interval.
// This never triggers a scrape, changes admin settings, or edits saved selections.
async function checkPublishedRoster() {
  if (refreshInFlight || document.visibilityState === 'hidden') return;
  refreshInFlight = true;
  try {
    const next = await getJson(new URL('./athletes.json', import.meta.url).href);
    if (!Array.isArray(next.athletes)) throw new Error('Invalid athlete dataset');
    // updated_at changes on every successful scrape, even if no match changed.
    // Compare actual published data to avoid flickering the list unnecessarily.
    const nextFingerprint = JSON.stringify([next.athletes, next.published_competitions, next.loaded_competition_ids, next.errors]);
    if (nextFingerprint === rosterFingerprint) return;
    roster = next;
    rosterFingerprint = nextFingerprint;
    const legacyPublished = [...new Map((roster.athletes || []).filter(a => a.competition_id && a.competition_name)
      .map(a => [String(a.competition_id), { id: String(a.competition_id), name: a.competition_name, date: a.date || '' }])).values()];
    competitions = (roster.published_competitions || legacyPublished).map(c => ({ ...c, id: String(c.id) }))
      .filter(c => c.id && c.name)
      .sort((a,b) => String(a.date || '').localeCompare(String(b.date || '')) || a.name.localeCompare(b.name));
    showOptions(); updateLabel(); updateAcademies(); updateAthletes();
    if (hasRenderedSearch || chosen.size || chosenAcademies.size || chosenAthletes.size) {
      // Keep the user's position in the independent COMPS scroll container.
      const scrollNodes = [];
      for (let node = rows.parentElement; node; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight && node.clientHeight > 0) {
          scrollNodes.push([node, node.scrollTop, node.scrollLeft]);
        }
      }
      const pageScrollX = window.scrollX;
      const pageScrollY = window.scrollY;
      applySearch({ persist: false });
      saveSearch(); // Drop obsolete academy/athlete IDs when a roster changes.
      requestAnimationFrame(() => {
        for (const [node, top, left] of scrollNodes) {
          node.scrollTop = top;
          node.scrollLeft = left;
        }
        window.scrollTo(pageScrollX, pageScrollY);
      });
    }
  } catch (error) {
    // Keep the last good dataset and existing results during network failures.
    console.warn('COMPS published roster refresh unavailable:', error);
  } finally {
    refreshInFlight = false;
  }
}
setInterval(checkPublishedRoster, ROSTER_POLL_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkPublishedRoster();
});
window.addEventListener('focus', checkPublishedRoster);
