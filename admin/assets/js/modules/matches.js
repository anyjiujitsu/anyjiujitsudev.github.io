import { CUSTOMIZATION } from '../../../../customization.js';

// The competition catalog is independent of any city or existing event page.
// Dispatch uses the same GitHub token entered in the admin header.
export async function initMatchesPreview(){
  const pick = document.getElementById('matchesPicker');
  if (!pick) return;
  const toggle = document.getElementById('matchesToggle');
  const menu = document.getElementById('matchesMenu');
  const options = document.getElementById('matchesOptions');
  const text = document.getElementById('matchesSelectionText');
  const count = document.getElementById('matchesCount');
  const filter = document.getElementById('matchesFilter');
  const button = document.getElementById('matchesGetCompetitions');
  const status = document.getElementById('matchesFetchStatus');
  const selected = new Set();
  const refreshRate = document.getElementById('matchesRefreshRate');
  const currentComps = document.getElementById('matchesCurrentComps');
  const currentRate = document.getElementById('matchesCurrentRate');
  const currentStatus = document.getElementById('matchesCurrentStatus');
  const pauseButton = document.getElementById('matchesPause');
  const resumeButton = document.getElementById('matchesResume');
  let currentConfig = {enabled:false,refresh_minutes:10,competitions:[]};
  let competitions = [];
  function drawCurrent(){
    currentComps.replaceChildren();
    const values = currentConfig.competitions || [];
    if (!values.length) currentComps.textContent = 'No competitions configured.';
    else for (const c of values){const item=document.createElement('div');item.textContent=c.name;currentComps.append(item);}
    currentRate.textContent = `${currentConfig.refresh_minutes} min`;
    currentStatus.textContent = currentConfig.enabled ? 'RUNNING' : 'PAUSED';
    pauseButton.disabled = !currentConfig.enabled;
    resumeButton.disabled = currentConfig.enabled;
  }

  const owner = CUSTOMIZATION.adminGitHubOwner;
  const repo = CUSTOMIZATION.adminGitHubRepo;
  const branch = CUSTOMIZATION.adminGitHubBranch || 'main';
  const workflow = 'ibjjf-competition-catalog.yml';
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const headers = token => ({'Accept':'application/vnd.github+json','Authorization':`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'});
  const saveStatus = document.getElementById('matchesSaveStatus');
  const saveButton = document.getElementById('matchesSave');
  async function loadConfig(){
    const response = await fetch(`../opens/config.json?t=${Date.now()}`, {cache:'no-store'});
    if (!response.ok) throw new Error(`Configuration unavailable: HTTP ${response.status}`);
    const config = await response.json();
    currentConfig = {
      enabled: Boolean(config.enabled),
      refresh_minutes: [5,10,15,20].includes(Number(config.refresh_minutes)) ? Number(config.refresh_minutes) : 10,
      competitions: Array.isArray(config.competitions) ? config.competitions : []
    };
    selected.clear();
    currentConfig.competitions.forEach(c => selected.add(String(c.id)));
    refreshRate.value = String(currentConfig.refresh_minutes);
    drawCurrent();
  }
  // Compare-and-swap using the latest GitHub SHA avoids overwriting unrelated changes.
  async function saveConfig(config){
    const token = await getToken();
    if (!token) throw new Error('Enter your GitHub token first.');
    const url = `${endpoint}/contents/opens/config.json`;
    const read = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, {headers:headers(token),cache:'no-store'});
    if (!read.ok) throw new Error(`Cannot read config from GitHub: HTTP ${read.status}`);
    const file = await read.json();
    const payload = JSON.stringify({...config, updated_at:new Date().toISOString()},null,2)+'\n';
    const encoded = btoa(Array.from(new TextEncoder().encode(payload), b=>String.fromCharCode(b)).join(''));
    const response = await fetch(url,{method:'PUT',headers:{...headers(token),'Content-Type':'application/json'},body:JSON.stringify({message:'Update OPENS match monitoring',content:encoded,sha:file.sha,branch})});
    if(!response.ok)throw new Error(`Cannot save configuration: HTTP ${response.status} ${(await response.text()).slice(0,160)}`);
    currentConfig={...config};drawCurrent();
  }
  let saving = false;
  async function persist(config, message){
    if(saving)return;
    saving=true;pauseButton.disabled=true;resumeButton.disabled=true;saveButton.disabled=true;
    saveStatus.textContent=message;
    try{await saveConfig(config);saveStatus.textContent='Saved to GitHub; takes effect after deployment.';}
    catch(err){saveStatus.textContent=err.message;drawCurrent();}
    finally{saving=false;saveButton.disabled=false;}
  }
  pauseButton.addEventListener('click',()=>persist({...currentConfig,enabled:false},'Pausing monitoring…'));
  resumeButton.addEventListener('click',()=>persist({...currentConfig,enabled:true},'Resuming monitoring…'));
  saveButton.addEventListener('click',()=>{
    const configured = [...selected].map(id=>competitions.find(c=>c.id===id) || currentConfig.competitions.find(c=>String(c.id)===id)).filter(Boolean);
    persist({enabled:currentConfig.enabled,refresh_minutes:Number(refreshRate.value),competitions:configured},'Saving competitions…');
  });
  function update(){
    text.textContent = selected.size ? `${selected.size} COMPETITION${selected.size===1?'':'S'} SELECTED` : 'Select competitions…';
    count.textContent = `${selected.size} selected · ${competitions.length} available`;
  }
  function draw(){
    options.replaceChildren();
    const q = filter.value.toLocaleLowerCase().trim();
    const entries = competitions.filter(c => c.name.toLocaleLowerCase().includes(q));
    if (!entries.length){options.textContent = 'No matching competitions.';return;}
    for (const comp of entries){
      const row = document.createElement('label');row.className='adminMatchesOption';
      const cb = document.createElement('input');cb.type='checkbox';cb.checked=selected.has(comp.id);
      cb.addEventListener('change',()=>{cb.checked?selected.add(comp.id):selected.delete(comp.id);update();});
      const title = document.createElement('span');title.textContent=comp.name;
      row.append(cb,title);options.append(row);
    }
  }
  function close(){menu.hidden=true;toggle.setAttribute('aria-expanded','false');}
  toggle.addEventListener('click',()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)filter.focus();});
  document.addEventListener('pointerdown',e=>{if(!pick.contains(e.target))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  filter.addEventListener('input',draw);
  document.getElementById('matchesClearSelections').addEventListener('click',()=>{selected.clear();update();draw();});
  async function loadCatalog(){
    const res = await fetch(`./matches-competitions.json?t=${Date.now()}`,{cache:'no-store'});
    if (!res.ok) throw new Error(`Competition catalog unavailable (HTTP ${res.status})`);
    const data = await res.json();
    if(!Array.isArray(data.competitions))throw new Error('Invalid competition catalog');
    competitions = data.competitions.filter(c=>c.id && c.name).map(c=>({id:String(c.id),name:String(c.name)}));
    const valid = new Set(competitions.map(c=>c.id));
    // Keep selected configured IDs even if the catalog has not been refreshed.
    draw();update();
    return data;
  }
  async function getToken(){
    const input = document.getElementById('ghToken');
    const raw = input?.value?.trim();
    if(raw)return raw;
    const explicit = CUSTOMIZATION.adminTokenStorageKey;
    const fallbackKey = `admin_github_token_${String(owner).toLowerCase().replace(/[^a-z0-9]+/g,'_')}_${String(repo).toLowerCase().replace(/[^a-z0-9]+/g,'_')}`;
    return localStorage.getItem(explicit || fallbackKey) || localStorage.getItem('anyjj_admin_github_token') || '';
  }
  try { await loadConfig(); } catch (err) { saveStatus.textContent = `Unable to read active config: ${err.message}`; }
  let active = false;
  button.addEventListener('click',async()=>{
    if(active)return;
    if(button.dataset.reload==='true'){
      try{const data=await loadCatalog();status.textContent=competitions.length?`${competitions.length} competitions loaded.`:'Catalog is still empty; check GitHub Actions logs.';if(competitions.length){button.textContent='GET COMPETITIONS';delete button.dataset.reload;}}
      catch(err){status.textContent='Not published yet. Check GitHub Actions; then try RELOAD LIST.';}
      return;
    }
    const token = await getToken();
    if(!token){status.textContent='Enter and save your GitHub token in the admin header first.';return;}
    active=true;button.disabled=true;
    status.textContent='Requesting IBJJF catalog refresh from GitHub Actions…';
    try{
      const response = await fetch(`${endpoint}/actions/workflows/${workflow}/dispatches`,{
        method:'POST',headers:{...headers(token),'Content-Type':'application/json'},body:JSON.stringify({ref:branch})
      });
      if(response.status!==204){
        const message = await response.text();
        throw new Error(`GitHub rejected refresh (HTTP ${response.status}): ${message.slice(0,180)}`);
      }
      status.textContent='Refresh requested. GitHub Actions is collecting competitions; use RELOAD LIST after it deploys.';
      button.textContent='RELOAD LIST';
      // Next click reloads published data, not another workflow run.
      button.dataset.reload='true';
    }catch(err){status.textContent=err.message;}
    finally{active=false;button.disabled=false;}
  });
  try{
    const data=await loadCatalog();
    status.textContent = competitions.length ? `${competitions.length} IBJJF competitions loaded${data.updated_at ? ' · updated '+new Date(data.updated_at).toLocaleString() : ''}.` : 'No catalog loaded yet. Click GET COMPETITIONS.';
  }catch(err){status.textContent='Catalog not loaded yet. Click GET COMPETITIONS.';options.textContent='No catalog yet.';}
  drawCurrent();
}
