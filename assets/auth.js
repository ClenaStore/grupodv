
(function(){
  const KEY_NAME='dv_pwd';
  const savedTheme = localStorage.getItem('dv_theme');
  if(savedTheme){ document.documentElement.setAttribute('data-theme', savedTheme); }

  async function ensurePassword(){
    let pwd = localStorage.getItem(KEY_NAME) || '';
    while(!pwd){
      pwd = prompt('Digite a senha de acesso:') || '';
      if(!pwd) continue;
      try{
        const r = await fetch('/api/ping', { headers: { 'x-api-key': pwd } });
        if(r.ok){ localStorage.setItem(KEY_NAME, pwd); break; }
        else { alert('Senha incorreta.'); pwd=''; }
      }catch(e){
        localStorage.setItem(KEY_NAME, pwd); break;
      }
    }
  }
  const _fetch = window.fetch.bind(window);
  window.fetch = (input, init={})=>{
    let url = (typeof input === 'string') ? input : (input && input.url) || '';
    init = init || {};
    const headers = new Headers(init.headers || ((typeof input !== 'string' && input.headers) || {}));
    const pwd = localStorage.getItem(KEY_NAME) || '';
    if(url.startsWith('/api/') && pwd){ headers.set('x-api-key', pwd); }
    return _fetch(input, Object.assign({}, init, { headers }));
  };
  if(!localStorage.getItem(KEY_NAME)) ensurePassword();
  window.__DV_PWD_KEY__ = KEY_NAME;
})();
