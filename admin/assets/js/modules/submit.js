// admin/modules/submit.js
// purpose: form normalization + GitHub CSV append/commit

import { clearOpensDisplay, normalizeDirectoryTime } from './time.js';
import { CUSTOMIZATION } from '../../../../customization.js';

function customizationString(key, fallback){
  const value = CUSTOMIZATION?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

const OWNER  = customizationString('adminGitHubOwner', '');
const REPO   = customizationString('adminGitHubRepo', '');
const BRANCH = customizationString('adminGitHubBranch', 'main');
const EVENT_CSV_PATH = customizationString('adminEventsCsvPath', 'events.csv');
const INDEX_CSV_PATH = customizationString('adminDirectoryCsvPath', 'directory.csv');

function b64DecodeUnicode(str){
  str = (str || '').replace(/\n/g,'');
  const bin = atob(str);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function b64EncodeUnicode(str){
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}

function csvEscape(v){
  const s = String(v ?? '');
  if(/[\n\r",]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}

function apiUrlFor(path){
  return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}?ref=${encodeURIComponent(BRANCH)}`;
}

async function ghGetFile(path, token){
  const res = await fetch(apiUrlFor(path), {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `token ${token}`
    }
  });
  if(!res.ok){
    const t = await res.text().catch(()=> '');
    throw new Error(`GET failed (${res.status}): ${t}`);
  }
  return res.json();
}

async function ghPutFile(path, token, body){
  const putUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURI(path)}`;
  const res = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'Authorization': `token ${token}`
    },
    body: JSON.stringify(body)
  });
  if(!res.ok){
    const t = await res.text().catch(()=> '');
    throw new Error(`PUT failed (${res.status}): ${t}`);
  }
  return res.json();
}

function setCreatedDate(form){
  const el = form?.querySelector('input[name="CREATED"]');
  if(!el) return;
  const d = new Date();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  el.value = `${mm}/${dd}/${d.getFullYear()}`;
}

function normalizeEventDate(val){
  const s = (val || '').trim();
  const iso = s.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if(iso) return `${Number(iso[2])}/${Number(iso[3])}/${iso[1]}`;
  return s;
}

function computeDay(str){
  const s = (str || '').trim();
  let m = s.match(/^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})$/);
  let dt = null;
  if(m){
    dt = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  }else{
    m = s.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
    if(m) dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  if(!dt || isNaN(dt.getTime())) return '';
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return days[dt.getDay()] || '';
}

function buildRowFromForm(csvText, form){
  const lines = (csvText || '').split(/\r?\n/);
  const headerLine = lines.find(l => l.trim().length) || '';
  const columns = headerLine.split(',').map(s => s.trim());

  const fd = new FormData(form);
  const map = {};
  for(const [k,v] of fd.entries()) map[k] = (v ?? '').toString().trim();

  if(form?.id === 'eventForm'){
    ['CASH','VENMO','SIGN UP'].forEach((name) => {
      const el = form.querySelector(`[name="${name}"]`);
      map[name] = (el && el.checked) ? 'Y' : '';
    });
  }

  if(form?.id === 'eventForm' && map.DATE){
    map.DATE = normalizeEventDate(map.DATE);
    if(!map.DAY) map.DAY = computeDay(map.DATE);
  }

  if(form?.id === 'indexForm'){
    if('SAT' in map) map.SAT = normalizeDirectoryTime(map.SAT);
    if('SUN' in map) map.SUN = normalizeDirectoryTime(map.SUN);
  }

  const cols = columns.filter(Boolean);
  const finalCols = cols.length ? cols : Object.keys(map);
  const row = finalCols.map(c => csvEscape(map[c] ?? '')).join(',');

  return { row, finalCols, hasHeader: cols.length > 0 };
}

async function appendCsvRow({ path, form, commitPrefix, validateAndStoreToken }){
  const token = await validateAndStoreToken();
  if(!token) throw new Error('Token not approved');

  const current = await ghGetFile(path, token);
  const sha = current.sha;
  const csvText = b64DecodeUnicode(current.content || '');
  const { row, finalCols, hasHeader } = buildRowFromForm(csvText, form);
  const nowIso = new Date().toISOString();
  const header = hasHeader ? '' : (finalCols.join(',') + '\n');
  const base = (csvText || '').trimEnd();
  const updated = (base ? base + '\n' : header) + row + '\n';

  await ghPutFile(path, token, {
    message: `${commitPrefix} (${nowIso})`,
    content: b64EncodeUnicode(updated),
    sha,
    branch: BRANCH
  });
  return true;
}

export function initAdminForms({ validateAndStoreToken, setTokenStatus, geoController, geoControllers }){
  const eventForm = document.getElementById('eventForm');
  const indexForm = document.getElementById('indexForm');
  const dateInput = eventForm?.querySelector('input[name="DATE"]');
  const dayInput = eventForm?.querySelector('input[name="DAY"]');

  setCreatedDate(eventForm);
  setCreatedDate(indexForm);

  dateInput?.addEventListener('input', () => {
    if(dayInput) dayInput.value = computeDay(dateInput.value);
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-clear]');
    if(!btn) return;
    const which = btn.getAttribute('data-clear');
    const form = which === 'index' ? indexForm : eventForm;
    form?.reset();
    setCreatedDate(form);
    const controller = geoControllers?.[which] || (which === 'index' ? geoController : null);
    controller?.reset();
    clearOpensDisplay(indexForm);
    if(which === 'event' && dayInput) dayInput.value = '';
  });

  eventForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try{
      await appendCsvRow({
        path: EVENT_CSV_PATH,
        form: eventForm,
        commitPrefix: 'Append event row',
        validateAndStoreToken
      });
      eventForm.reset();
      setCreatedDate(eventForm);
      geoControllers?.event?.reset();
      if(dayInput) dayInput.value = '';
    }catch(_e){
      setTokenStatus('FAILED');
    }
  });

  indexForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try{
      await appendCsvRow({
        path: INDEX_CSV_PATH,
        form: indexForm,
        commitPrefix: 'Append directory row',
        validateAndStoreToken
      });
      indexForm.reset();
      setCreatedDate(indexForm);
      geoControllers?.index?.reset();
      if(!geoControllers?.index) geoController?.reset();
      clearOpensDisplay(indexForm);
    }catch(_e){
      setTokenStatus('FAILED');
    }
  });
}
