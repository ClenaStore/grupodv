
(function(){
  const btn = document.getElementById('themeToggle');
  if(btn){
    btn.addEventListener('click', ()=>{
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      const next = (cur==='light') ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('dv_theme', next);
    });
  }
  const user = document.getElementById('userMenu');
  if(user){
    const trigger = user.querySelector('.user-btn');
    if(trigger){ trigger.addEventListener('click', ()=> user.classList.toggle('open')); }
    window.addEventListener('click', (e)=>{ if(!user.contains(e.target)) user.classList.remove('open'); });
  }
  window.handleLogout = function(){
    try{ localStorage.removeItem('dv_pwd'); }catch(e){}
    location.reload();
  };
})();
