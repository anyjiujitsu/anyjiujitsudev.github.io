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
  let paused = false;
  function drawCurrent(){
    if(!currentComps)return;
    currentComps.replaceChildren();
    const names = competitions.filter(c=>selected.has(c.id)).map(c=>c.name);
    if (!names.length) currentComps.textContent='No competitions selected yet.';
    else for (const name of names){const entry=document.createElement('div');entry.textContent=name;currentComps.append(entry);}
    currentRate.textContent=`${refreshRate.value} min`;
    currentStatus.textContent=paused ? 'PAUSED (PREVIEW)' : 'READY (PREVIEW)';
    pauseButton.disabled=paused;
    resumeButton.disabled=!paused;
  }
  pauseButton.addEventListener('click',()=>{paused=true;drawCurrent();});
  resumeButton.addEventListener('click',()=>{paused=false;drawCurrent();});
  refreshRate.addEventListener('change',drawCurrent);
  let competitions = [];
  const owner = CUSTOMIZATION.adminGitHubOwner;
  const repo = CUSTOMIZATION.adminGitHubRepo;
  const branch = CUSTOMIZATION.adminGitHubBranch || 'main';
  const workflow = 'ibjjf-competition-catalog.yml';
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const headers = token => ({'Accept':'application/vnd.github+json','Authorization':`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'});
  function update(){
    text.textContent = selected.size ? `${selected.size} COMPETITION${selected.size===1?'':'S'} SELECTED` : 'Select competitions…';
    count.textContent = `${selected.size} selected · ${competitions.length} available`;
    drawCurrent();
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
    for (const id of selected) if(!valid.has(id))selected.delete(id);
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
  drawCurrent();
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
}
