/* Boston Open: isolated from the main site's JavaScript. */
/* WhichMat requires sign-in; supply an authorized, CORS-enabled JSON bridge here. */
const DATA_SOURCE = {
  competitions: '', // e.g. 'https://your-endpoint.example/competitions'
  athletes: ''       // e.g. 'https://your-endpoint.example/competitions/{id}/athletes'
};

const $ = (id) => document.getElementById(id);
const toggle = $('competitionToggle');
const menu = $('competitionMenu');
const options = $('competitionOptions');
const label = $('competitionLabel');
const status = $('bostonStatus');
const rows = $('athleteRows');
const button = $('athleteSearchButton');
const chosen = new Set();
let competitions = [];

function setStatus(message) { status.textContent = message; }
function safeUrl(url) {
  try { const result = new URL(url, location.href); return ['https:', 'http:'].includes(result.protocol) ? result.href : null; }
  catch { return null; }
}
function normalizeCollection(json, property) {
  const items = Array.isArray(json) ? json : json?.[property] ?? json?.data?.[property];
  if (!Array.isArray(items)) throw new Error(`Data source response needs an array or a '${property}' array.`);
  return items;
}
async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Data source returned HTTP ${response.status}.`);
  return response.json();
}
function updateLabel() {
  label.textContent = chosen.size ? `COMPETITIONS · ${chosen.size} SELECTED` : 'COMPETITIONS · SELECT';
  toggle.classList.toggle('has-selection', chosen.size > 0);
}
function showOptions() {
  options.replaceChildren();
  if (!competitions.length) { options.textContent = 'No Boston competitions available.'; return; }
  for (const comp of competitions) {
    const item = document.createElement('label');
    item.className = 'boston-menu-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = chosen.has(comp.id);
    box.addEventListener('change', () => {
      box.checked ? chosen.add(comp.id) : chosen.delete(comp.id);
      updateLabel();
    });
    const text = document.createElement('span'); text.textContent = comp.name;
    item.append(box, text); options.append(item);
  }
}
function setMenu(open) { menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); }
toggle.addEventListener('click', () => setMenu(menu.hidden));
document.addEventListener('pointerdown', (event) => { if (!$('competitionPicker').contains(event.target)) setMenu(false); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setMenu(false); });
$('clearCompetitions').addEventListener('click', () => { chosen.clear(); updateLabel(); showOptions(); });

async function loadCompetitions() {
  if (!DATA_SOURCE.competitions || !DATA_SOURCE.athletes) {
    label.textContent = 'COMPETITIONS · NOT CONNECTED';
    options.textContent = 'WhichMat data connection not configured.';
    setStatus('WhichMat sign-in is required. A permitted data connection must be configured before live Boston competitions and athletes can be loaded.');
    return;
  }
  try {
    const raw = normalizeCollection(await getJson(DATA_SOURCE.competitions), 'competitions');
    competitions = raw.map((item) => ({ id: String(item.id ?? item.competition_id ?? ''), name: String(item.name ?? item.title ?? '') }))
      .filter((item) => item.id && /boston/i.test(item.name))
      .sort((a,b) => a.name.localeCompare(b.name));
    updateLabel(); showOptions();
    setStatus(competitions.length ? `${competitions.length} Boston competition${competitions.length === 1 ? '' : 's'} found. Check one or more and search.` : 'No competitions containing “Boston” were returned.');
  } catch (error) {
    label.textContent = 'COMPETITIONS · UNAVAILABLE';
    options.textContent = 'Unable to load competitions.';
    setStatus(`Unable to load competitions: ${error.message}`);
  }
}
const getField = (record, ...names) => names.map(name => record?.[name]).find(v => v !== undefined && v !== null && v !== '') ?? '';
function renderAthletes(athletes) {
  rows.replaceChildren();
  if (!athletes.length) { const el = document.createElement('div'); el.className = 'boston-empty'; el.textContent = 'No athletes matched your search in the selected competitions.'; rows.append(el); return; }
  for (const athlete of athletes) {
    const row = document.createElement('div'); row.className = 'boston-results-row';
    const name = document.createElement('span');
    const athleteName = String(getField(athlete, 'name', 'athlete_name'));
    const url = safeUrl(getField(athlete, 'url', 'athlete_url', 'bracket_url'));
    if (url) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = athleteName; name.append(a); }
    else name.textContent = athleteName;
    const competition = document.createElement('small'); competition.textContent = athlete.competitionName || '';
    name.append(competition);
    const values = [getField(athlete,'bracket','division','category'), getField(athlete,'time','start_time'), getField(athlete,'mat','mat_number'), getField(athlete,'day','date')];
    row.append(name, ...values.map(value => { const el = document.createElement('span'); el.textContent = String(value || '—'); return el; }));
    rows.append(row);
  }
}
$('athleteSearchForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!DATA_SOURCE.competitions || !DATA_SOURCE.athletes) { setStatus('Cannot search: a WhichMat data connection is not configured.'); return; }
  if (!chosen.size) { setStatus('Select at least one Boston competition first.'); setMenu(true); return; }
  const term = $('athleteQuery').value.trim().toLocaleLowerCase();
  button.disabled = true;
  setStatus(`Searching athletes across ${chosen.size} selected competition${chosen.size === 1 ? '' : 's'}…`);
  try {
    const selected = competitions.filter(comp => chosen.has(comp.id));
    const results = await Promise.allSettled(selected.map(async comp => {
      const url = DATA_SOURCE.athletes.replace('{id}', encodeURIComponent(comp.id));
      const raw = normalizeCollection(await getJson(url), 'athletes');
      return raw.map(athlete => ({ ...athlete, competitionName: comp.name }));
    }));
    const athletes = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value);
    const failed = results.filter(result => result.status === 'rejected').length;
    const filtered = athletes.filter(athlete => !term || `${getField(athlete,'name','athlete_name')} ${getField(athlete,'team','academy')}`.toLocaleLowerCase().includes(term));
    filtered.sort((a,b) => String(getField(a,'day','date')).localeCompare(String(getField(b,'day','date'))) || String(getField(a,'time','start_time')).localeCompare(String(getField(b,'time','start_time'))) || String(getField(a,'name','athlete_name')).localeCompare(String(getField(b,'name','athlete_name'))));
    renderAthletes(filtered);
    setStatus(`${filtered.length} athlete${filtered.length === 1 ? '' : 's'} found${failed ? `; ${failed} competition${failed === 1 ? '' : 's'} could not be loaded` : ''}.`);
  } catch (error) { setStatus(`Search failed: ${error.message}`); }
  finally { button.disabled = false; }
});
loadCompetitions();
