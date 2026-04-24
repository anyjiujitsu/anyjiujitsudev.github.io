// admin/modules/token.js
// purpose: GitHub token input, validation, and localStorage persistence

const TOKEN_KEY = 'anyjj_admin_github_token';

export function initTokenControls(){
  const tokenInput = document.getElementById('ghToken');
  const saveBtn = document.getElementById('saveToken');
  const eyeBtn = document.getElementById('toggleToken');
  const tokenStatus = document.getElementById('tokenStatus');

  const saved = localStorage.getItem(TOKEN_KEY);
  if(saved && tokenInput) tokenInput.value = saved;

  function setTokenStatus(status){
    if(!tokenStatus) return;
    tokenStatus.textContent = status || '';
    if(status){
      tokenStatus.setAttribute('data-status', status);
      tokenStatus.classList.add('isVisible');
    }else{
      tokenStatus.removeAttribute('data-status');
      tokenStatus.classList.remove('isVisible');
    }
  }

  tokenInput?.addEventListener('focus', () => tokenStatus && tokenStatus.classList.remove('isVisible'));
  tokenInput?.addEventListener('blur', () => {
    if(tokenStatus && tokenStatus.textContent.trim()) tokenStatus.classList.add('isVisible');
  });

  async function validateAndStoreToken(){
    const t = (tokenInput?.value || '').trim();
    if(!t){
      setTokenStatus('FAILED');
      return null;
    }

    try{
      const res = await fetch('https://api.github.com/user', {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `token ${t}`
        }
      });
      if(!res.ok){
        setTokenStatus('FAILED');
        return null;
      }
      localStorage.setItem(TOKEN_KEY, t);
      setTokenStatus('APPROVED');
      return t;
    }catch(_e){
      setTokenStatus('FAILED');
      return null;
    }
  }

  saveBtn?.addEventListener('click', async () => {
    await validateAndStoreToken();
  });

  eyeBtn?.addEventListener('click', () => {
    if(!tokenInput) return;
    const isPw = tokenInput.type === 'password';
    tokenInput.type = isPw ? 'text' : 'password';
    eyeBtn.setAttribute('aria-label', isPw ? 'Hide token' : 'Show token');
  });

  return { setTokenStatus, validateAndStoreToken };
}
