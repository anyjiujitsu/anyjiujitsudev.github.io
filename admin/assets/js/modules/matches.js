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
  let requestPending = false;
  let competitions = [];
  function drawCurrent(){
    currentComps.replaceChildren();
    const values = currentConfig.competitions || [];
    if (!values.length) currentComps.textContent = 'No competitions configured.';
    else for (const c of values){const item=document.createElement('div');item.textContent=c.name;currentComps.append(item);}
    currentRate.textContent = `${currentConfig.refresh_minutes} min`;
    currentStatus.textContent = currentConfig.competitions.length ? (currentConfig.enabled ? 'RUNNING' : 'PAUSED') : 'NO ACTIVE MATCHES';
    pauseButton.disabled = !currentConfig.competitions.length || !currentConfig.enabled;
    resumeButton.disabled = !currentConfig.competitions.length || currentConfig.enabled;
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
      competitions: Array.isArray(config.competitions) ? config.competitions : [],
      updated_at: config.updated_at || null
    };
    requestPending = false;
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
    currentConfig={...config,updated_at:JSON.parse(payload).updated_at};drawCurrent();
  }
  async function dispatchInitialScrape(candidate) {
    const token = await getToken();
    if (!token) throw new Error('Enter your GitHub token first.');
    const payload = JSON.stringify(candidate);
    if (new TextEncoder().encode(payload).length > 50000) throw new Error('Too many selected competitions for one request.');
    const encoded = btoa(Array.from(new TextEncoder().encode(payload), b=>String.fromCharCode(b)).join(''));
    const started = new Date().toISOString();
    const response = await fetch(`${endpoint}/actions/workflows/opens-refresh.yml/dispatches`, {
      method: 'POST', headers: {...headers(token), 'Content-Type':'application/json'},
      body: JSON.stringify({ref:branch, inputs:{force:'true',candidate:encoded}})
    });
    if (response.status !== 204) throw new Error(`GitHub could not start verification (HTTP ${response.status}): ${(await response.text()).slice(0,180)}`);
    return {started,token};
  }
  async function awaitOutcome(started, token, expected) {
    const startTime = Date.parse(started);
    // Poll the GitHub workflow result; only the workflow can commit active settings.
    const expires = Date.now() + 12*60*1000;
    let runId = null;
    while(Date.now() < expires) {
      await new Promise(resolve => setTimeout(resolve, 7000));
      const result = await fetch(`${endpoint}/actions/workflows/opens-refresh.yml/runs?event=workflow_dispatch&per_page=15`,{headers:headers(token),cache:'no-store'});
      if(!result.ok) continue;
      const runs = (await result.json()).workflow_runs || [];
      if(!runId){
        const suitable = runs.filter(r=>Date.parse(r.created_at) >= startTime-20000 && r.head_branch===branch).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
        if(suitable.length) runId=suitable[0].id;
      }
      const run = runs.find(r=>r.id===runId);
      if (!run || run.status!=='completed') continue;
      if(run.conclusion !== 'success') {saveStatus.textContent='NO MATCHES AVAILABLE — No changes were made. Check the OPENS workflow log for details.';return;}
      // GitHub Pages may deploy shortly after the workflow completes.
      for(let i=0;i<18;i++){
        try {
          const response=await fetch(`../opens/config.json?t=${Date.now()}`,{cache:'no-store'});
          if(response.ok){
            const cfg=await response.json();
            if(cfg.updated_at && cfg.updated_at!==currentConfig.updated_at && Number(cfg.refresh_minutes)===Number(expected.refresh_minutes) &&
              (cfg.competitions||[]).length>0 && (cfg.competitions||[]).every(c=>expected.competitions.some(e=>String(e.id)===String(c.id)))){
              await loadConfig();saveStatus.textContent=(cfg.competitions.length===expected.competitions.length?'ACTIVE — New matches published; scheduled monitoring is running.':'ACTIVE — Available competitions published; unsuccessful selections excluded. Scheduled monitoring is running.');return;
            }
          }
        } catch(e){}
        await new Promise(resolve=>setTimeout(resolve,5000));
      }
      saveStatus.textContent='Scrape succeeded; awaiting GitHub Pages publication. Reload to confirm CURRENT MATCHES.';
      return;
    }
    saveStatus.textContent='Verification is taking longer than expected. CURRENT MATCHES remains unchanged; check GitHub Actions.';
  }
  let saving = false;
  async function saveMonitoringState(enabled){
    if(saving || !currentConfig.competitions.length)return;
    saving=true;pauseButton.disabled=true;resumeButton.disabled=true;saveButton.disabled=true;
    try {
      // Only change the monitoring switch; never clear selected competitions or saved results.
      await saveConfig({...currentConfig,enabled});
      if (!enabled) {
        saveStatus.textContent='PAUSED — Existing matches remain published. Future scheduled scrapes are skipped.';
      } else {
        // RESUME also launches an immediate run using the existing active configuration.
        // No candidate input: this does not replace the selected competitions.
        try {
          const token=await getToken();
          if(!token)throw new Error('GitHub token missing.');
          const response=await fetch(`${endpoint}/actions/workflows/opens-refresh.yml/dispatches`,{
            method:'POST',headers:{...headers(token),'Content-Type':'application/json'},
            body:JSON.stringify({ref:branch,inputs:{force:'true'}})
          });
          if(response.status!==204)throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0,180)}`);
          saveStatus.textContent='RUNNING — Monitoring resumed; an immediate scrape was requested.';
        } catch(error) {
          saveStatus.textContent=`RUNNING — Monitoring resumed, but the immediate scrape could not start (${error.message}). Scheduled checks remain enabled.`;
        }
      }
    } catch(error) {
      saveStatus.textContent=`FAILED — Monitoring status was not changed. ${error.message}`;
    } finally {saving=false;saveButton.disabled=false;drawCurrent();}
  }
  pauseButton.addEventListener('click',()=>saveMonitoringState(false));
  resumeButton.addEventListener('click',()=>saveMonitoringState(true));
  saveButton.addEventListener('click',async()=>{
    const configured=[...selected].map(id=>competitions.find(c=>String(c.id)===id)||currentConfig.competitions.find(c=>String(c.id)===id)).filter(Boolean);
    if(!configured.length){saveStatus.textContent='Select at least one competition before saving.';return;}
    if(configured.length!==selected.size){saveStatus.textContent='One or more selections are missing from the catalog.';return;}
    if(configured.some(c=>!/^\d+$/.test(String(c.id)))){saveStatus.textContent='Competition IDs must be verified numeric IDs.';return;}
    const rate=Number(refreshRate.value);
    if(![5,10,15,20].includes(rate)){saveStatus.textContent='Select a valid refresh rate.';return;}
    if(saving)return;
    saving=true;saveButton.disabled=true;
    saveStatus.textContent='CHECKING — Verifying the new competitions before changing CURRENT MATCHES…';
    try{
      const candidate={enabled:true,refresh_minutes:rate,competitions:configured};
      const {started,token}=await dispatchInitialScrape(candidate);
      await awaitOutcome(started,token,candidate);
    }catch(error){saveStatus.textContent=`FAILED — No changes were made. ${error.message}`;}
    finally{saving=false;saveButton.disabled=false;drawCurrent();}
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
  // Float outside the horizontally scrolling pager to avoid clipped options.
  // Phones use a viewport-bounded selection sheet with a scrollable list.
  document.body.append(menu);
  const mobileMenu = window.matchMedia('(max-width: 760px)');
  const backdrop = document.createElement('div');
  backdrop.className = 'adminMatchesBackdrop';
  backdrop.hidden = true;
  document.body.append(backdrop);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'adminMatchesMobileClose';
  closeButton.textContent = 'DONE';
  closeButton.setAttribute('aria-label', 'Close competitions');
  menu.prepend(closeButton);
  const visualViewport = window.visualViewport;
  function placeMenu(){
    if(menu.hidden) return;
    menu.style.position = 'fixed';
    menu.style.zIndex = '10001';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';
    menu.style.boxSizing = 'border-box';
    options.style.minHeight = '0';
    options.style.flex = '1 1 auto';
    options.style.maxHeight = 'none';
    options.style.overflowY = 'auto';
    if(mobileMenu.matches){
      // visualViewport tracks the usable screen after the iOS keyboard appears.
      const top = visualViewport ? visualViewport.offsetTop : 0;
      const height = visualViewport ? visualViewport.height : window.innerHeight;
      const width = visualViewport ? visualViewport.width : window.innerWidth;
      const left = visualViewport ? visualViewport.offsetLeft : 0;
      const margin = 12;
      menu.style.top = `${top + margin}px`;
      menu.style.bottom = 'auto';
      menu.style.left = `${left + margin}px`;
      menu.style.right = 'auto';
      menu.style.width = `${Math.max(200,width - 2 * margin)}px`;
      menu.style.maxHeight = `${Math.max(150,height - 2 * margin)}px`;
      backdrop.hidden = false;
    } else {
      backdrop.hidden = true;
      const rect = toggle.getBoundingClientRect();
      const margin = 12;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const below = viewportHeight - rect.bottom - margin - 6;
      const above = rect.top - margin - 6;
      const useAbove = below < 275 && above > below;
      const available = Math.max(130, useAbove ? above : below);
      const width = Math.min(Math.max(rect.width,290), viewportWidth - margin * 2);
      menu.style.width = `${width}px`;
      menu.style.left = `${Math.min(Math.max(margin,rect.left), viewportWidth - width - margin)}px`;
      menu.style.right = 'auto';
      menu.style.top = useAbove ? 'auto' : `${rect.bottom + 6}px`;
      menu.style.bottom = useAbove ? `${viewportHeight - rect.top + 6}px` : 'auto';
      menu.style.maxHeight = `${available}px`;
    }
  }
  function close(){
    menu.hidden = true;
    menu.style.display = '';
    backdrop.hidden = true;
    toggle.setAttribute('aria-expanded','false');
  }
  function open(){
    menu.hidden = false;
    toggle.setAttribute('aria-expanded','true');
    placeMenu();
    // On phones, do not automatically summon the keyboard.
    if(!mobileMenu.matches)filter.focus();
  }
  toggle.addEventListener('click',()=>menu.hidden ? open() : close());
  closeButton.addEventListener('click',close);
  backdrop.addEventListener('click',close);
  document.addEventListener('pointerdown',e=>{if(!pick.contains(e.target) && !menu.contains(e.target) && !backdrop.contains(e.target))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  window.addEventListener('resize',placeMenu);
  visualViewport?.addEventListener('resize',placeMenu);
  visualViewport?.addEventListener('scroll',placeMenu);
  mobileMenu.addEventListener('change',placeMenu);
  // Desktop floating menus close on scroll. Mobile sheets remain open while
  // their own competition list scrolls and while iOS adjusts for the keyboard.
  window.addEventListener('scroll',()=>{if(!mobileMenu.matches)close();},{passive:true});
  document.getElementById('adminPager')?.addEventListener('scroll',()=>{if(!mobileMenu.matches)close();},{passive:true});
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
  let pollTimer = null;
  let priorStamp = null;
  async function waitForCatalog(){
    let attempt = 0;
    clearInterval(pollTimer);
    pollTimer = setInterval(async()=>{
      if (++attempt > 24){ clearInterval(pollTimer); pollTimer=null; status.textContent='Catalog refresh is taking longer than expected. Check GitHub Actions and click RELOAD LIST.'; return; }
      try {
        const response = await fetch(`./matches-competitions.json?t=${Date.now()}`, {cache:'no-store'});
        if (!response.ok) return;
        const data = await response.json();
        if (!Array.isArray(data.competitions) || !data.competitions.length || data.updated_at === priorStamp) return;
        clearInterval(pollTimer); pollTimer=null;
        await loadCatalog();
        status.textContent=`${competitions.length} competitions loaded from IBJJF.`;
        button.textContent='REFRESH COMPS'; delete button.dataset.reload;
      } catch(error) { /* Keep polling while the publish/deployment completes. */ }
    }, 15000);
  }
  button.addEventListener('click',async()=>{
    if(active)return;
    if(button.dataset.reload==='true'){
      try{const data=await loadCatalog();status.textContent=competitions.length?`${competitions.length} competitions loaded.`:'Catalog is still empty; check GitHub Actions logs.';if(competitions.length && data.updated_at !== priorStamp){button.textContent='REFRESH COMPS';delete button.dataset.reload;clearInterval(pollTimer);}}
      catch(err){status.textContent='Not published yet. Check GitHub Actions; then try RELOAD LIST.';}
      return;
    }
    const token = await getToken();
    if(!token){status.textContent='Enter and save your GitHub token in the admin header first.';return;}
    active=true;button.disabled=true;
    status.textContent='Requesting IBJJF catalog refresh from GitHub Actions…';
    try{
      const previousResponse=await fetch(`./matches-competitions.json?t=${Date.now()}`,{cache:'no-store'});
      priorStamp=previousResponse.ok ? (await previousResponse.json()).updated_at || null : null;
      const response = await fetch(`${endpoint}/actions/workflows/${workflow}/dispatches`,{
        method:'POST',headers:{...headers(token),'Content-Type':'application/json'},body:JSON.stringify({ref:branch})
      });
      if(response.status!==204){
        const message = await response.text();
        throw new Error(`GitHub rejected refresh (HTTP ${response.status}): ${message.slice(0,180)}`);
      }
      status.textContent='GitHub refresh started. Waiting for the updated IBJJF catalog to publish…';
      button.textContent='RELOAD LIST'; button.dataset.reload='true';
      await waitForCatalog();
    }catch(err){status.textContent=err.message;}
    finally{active=false;button.disabled=false;}
  });
  try{
    const data=await loadCatalog();
    status.textContent = competitions.length ? `${competitions.length} IBJJF competitions loaded${data.updated_at ? ' · updated '+new Date(data.updated_at).toLocaleString() : ''}.` : 'No catalog loaded yet. Click REFRESH COMPS.';
  }catch(err){status.textContent='Catalog not loaded yet. Click REFRESH COMPS.';options.textContent='No catalog yet.';}
  drawCurrent();
}
