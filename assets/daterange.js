
(function(){
  const $ = (s)=>document.querySelector(s);
  function pad2(n){ return String(n).padStart(2,'0'); }
  function toISODate(s){
    if(!s) return "";
    if(typeof s === "string"){
      const str = s.trim();
      if(/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
      if(/^\d{2}\/\d{2}\/\d{4}$/.test(str)){
        const [d,m,y] = str.split("/").map(Number);
        return `${y}-${pad2(m)}-${pad2(d)}`;
      }
    }
    const d = (s instanceof Date) ? s : new Date(s);
    if(!isNaN(d)){
      const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return `${dd.getFullYear()}-${pad2(dd.getMonth()+1)}-${pad2(dd.getDate())}`;
    }
    return "";
  }
  function placePopover(pop, anchor){
    pop.style.display = 'block';
    $('#drOverlay').style.display = 'block';
    const r = anchor.getBoundingClientRect();
    const PAD = 8;
    const w = Math.min(window.innerWidth * 0.94, 360);
    pop.style.width = w + 'px';
    let left = r.left;
    let top  = r.bottom + 6;
    if (left + w > window.innerWidth - PAD) left = window.innerWidth - w - PAD;
    if (left < PAD) left = PAD;
    if (top + pop.offsetHeight > window.innerHeight - PAD) {
      top = r.top - pop.offsetHeight - 6;
      if (top < PAD) top = PAD;
    }
    pop.style.position = 'fixed';
    pop.style.left = left + 'px';
    pop.style.top  = top  + 'px';
  }
  function hideAll(){ const pop=$('#drPop'); if(pop) pop.style.display='none'; const ov=$('#drOverlay'); if(ov) ov.style.display='none'; }

  function buildRangeCalendar(container, state, onApply, onCancel){
    container.innerHTML = "";
    const cal = document.createElement("div"); cal.className="cal";
    const head = document.createElement("div"); head.className="cal-head";
    const prev = document.createElement("button"); prev.className="btn"; prev.textContent="‹";
    const next = document.createElement("button"); next.className="btn"; next.textContent="›";
    const title = document.createElement("div"); title.style.fontWeight="800";
    const updTitle=()=>title.textContent = state.cursor.toLocaleString('pt-BR',{month:'long',year:'numeric'});
    prev.onclick=()=>{ state.cursor = new Date(state.cursor.getFullYear(),state.cursor.getMonth()-1,1); drawGrid(); updTitle(); placePopover(container, state.anchor); };
    next.onclick=()=>{ state.cursor = new Date(state.cursor.getFullYear(),state.cursor.getMonth()+1,1); drawGrid(); updTitle(); placePopover(container, state.anchor); };
    head.appendChild(prev); head.appendChild(title); head.appendChild(next);
    cal.appendChild(head);

    const grid = document.createElement("div"); grid.className="cal-grid";
    "DSTQQSS".split("").forEach(l=>{ const d=document.createElement("div"); d.className="dow"; d.textContent=l; grid.appendChild(d); });

    function sameYMD(a,b){ return a&&b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
    function inSelRange(d){
      if(!state.start||!state.end) return false;
      const dd=new Date(d.getFullYear(),d.getMonth(),d.getDate());
      const s=new Date(state.start.getFullYear(),state.start.getMonth(),state.start.getDate());
      const e=new Date(state.end.getFullYear(),state.end.getMonth(),state.end.getDate());
      return dd>=s && dd<=e;
    }

    function drawGrid(){
      grid.querySelectorAll('.day').forEach(n=>n.remove());
      const y=state.cursor.getFullYear(), m=state.cursor.getMonth();
      const first=new Date(y,m,1);
      const startDay=(first.getDay()+6)%7;
      const daysInMonth=new Date(y,m+1,0).getDate();

      for(let i=0;i<startDay;i++){ const x=document.createElement("div"); x.className="day out"; grid.appendChild(x); }
      for(let d=1; d<=daysInMonth; d++){
        const date=new Date(y,m,d);
        const el=document.createElement("div"); el.className="day"; el.textContent=d;
        if(sameYMD(date,state.start)||sameYMD(date,state.end)) el.classList.add('sel');
        else if(inSelRange(date)) el.classList.add('range');
        el.onclick=()=>{ 
          if(!state.start || (state.start && state.end)){ state.start=date; state.end=null; } 
          else { if(date<state.start){ state.end=state.start; state.start=date; } else { state.end=date; } } 
          drawGrid(); 
        };
        grid.appendChild(el);
      }
    }
    cal.appendChild(grid);

    const foot=document.createElement("div"); foot.className="cal-foot cal foot";
    const cancel=document.createElement("button"); cancel.className="btn"; cancel.textContent="Cancelar";
    const apply=document.createElement("button"); apply.className="btn dark"; apply.textContent="Aplicar";
    cancel.onclick=onCancel;
    apply.onclick=()=>{ if(state.start && !state.end){ state.end = state.start; } if(state.start && state.end) onApply(state.start, state.end); };
    foot.appendChild(cancel); foot.appendChild(apply);
    cal.appendChild(foot);

    container.appendChild(cal);
    updTitle(); drawGrid();
  }

  window.attachDateRange = function({button, label, onChange}){
    const btn = (typeof button==='string') ? document.querySelector(button) : button;
    const lbl = (typeof label==='string') ? document.querySelector(label) : label;
    const pop = document.getElementById('drPop');
    const overlay = document.getElementById('drOverlay');

    const now=new Date();
    let ini=new Date(now.getFullYear(),now.getMonth(),1);
    let fim=new Date(now.getFullYear(),now.getMonth()+1,0);
    let state={cursor:new Date(ini.getFullYear(),ini.getMonth(),1), start:ini, end:fim, anchor:btn};

    function fmtBR(d){ return d.toLocaleDateString('pt-BR'); }
    function fmtLabel(){ lbl.textContent = `${fmtBR(ini)} → ${fmtBR(fim)}`; }

    function open(){
      state.anchor = btn; pop.innerHTML=""; 
      buildRangeCalendar(pop, state, (start,end)=>{
        ini = new Date(start.getFullYear(),start.getMonth(),start.getDate());
        fim = new Date(end.getFullYear(),end.getMonth(),end.getDate());
        fmtLabel(); onChange && onChange({iniISO: toISODate(ini), fimISO: toISODate(fim), ini, fim}); hideAll();
      }, hideAll);
      placePopover(pop, btn);
    }
    btn.addEventListener('click', open);
    overlay.addEventListener('click', hideAll);
    fmtLabel();
    onChange && onChange({iniISO: toISODate(ini), fimISO: toISODate(fim), ini, fim});
  };

  window.addEventListener('DOMContentLoaded', ()=>{
    if(!document.getElementById('drPop')){
      const ov=document.createElement('div'); ov.id='drOverlay'; ov.className='overlay';
      const pop=document.createElement('div'); pop.id='drPop'; pop.className='popover';
      document.body.appendChild(ov); document.body.appendChild(pop);
    }
  });
})();
