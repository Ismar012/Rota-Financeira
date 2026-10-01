(() => {
'use strict';
async function init(){
 const r=await fetch('/api/auth/me',{credentials:'same-origin'});if(!r.ok)return;const me=await r.json();if(!me.authenticated)return;
 const admin=me.user?.role==='admin';
 const menu=document.getElementById('menu');
 function item(label,url){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>{location.href=url;});return b;}
 if(menu&&!document.getElementById('consultationMenuItem')){const b=item('Agendar consultoria','/agendamento.html');b.id='consultationMenuItem';menu.appendChild(b);if(admin)menu.appendChild(item('Área de agendamentos','/agendamentos-admin.html'));}
 if(!admin)return;
 const nav=document.querySelector('.nav-actions');if(!nav)return;
 const style=document.createElement('style');style.textContent='.rota-schedule-tools{display:flex;align-items:center;gap:8px}.rota-schedule-link{position:relative;border:1px solid rgba(217,169,40,.4);border-radius:8px;padding:9px 12px;background:#0b0d0f;color:#f2cb5b;text-decoration:none;cursor:pointer;font-size:18px}.rota-schedule-count{font-size:11px;background:#f2cb5b;color:#080808;border-radius:20px;padding:2px 5px;margin-left:4px}.rota-schedule-dropdown{position:relative}.rota-schedule-dropdown summary{list-style:none}.rota-schedule-dropdown summary::-webkit-details-marker{display:none}.rota-schedule-dropdown a{position:absolute;right:0;top:45px;min-width:190px;z-index:40;background:#0b0d0f;color:#f2cb5b;padding:14px;border:1px solid #514221;border-radius:8px;text-decoration:none;font-size:13px}';document.head.appendChild(style);
 const tools=document.createElement('div');tools.className='rota-schedule-tools';
 const bell=document.createElement('a');bell.className='rota-schedule-link';bell.href='/agendamentos-admin.html';bell.setAttribute('aria-label','Agendamentos');bell.textContent='♧';
 // Ícone de sino em SVG, independente de bibliotecas externas.
 bell.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
 const count=document.createElement('span');count.className='rota-schedule-count';count.hidden=true;bell.appendChild(count);tools.appendChild(bell);
 if(location.pathname==='/admin.html'){const details=document.createElement('details');details.className='rota-schedule-dropdown';const summary=document.createElement('summary');summary.className='rota-schedule-link';summary.textContent='⋮';summary.setAttribute('aria-label','Mais opções');details.appendChild(summary);const a=document.createElement('a');a.href='/agendamentos-admin.html';a.textContent='Área de agendamentos';details.appendChild(a);tools.appendChild(details);}
 nav.prepend(tools);
 async function refresh(){try{const r=await fetch('/api/admin/consultations/notifications',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;const d=await r.json();count.textContent=d.count;count.hidden=!d.count;bell.setAttribute('aria-label',d.count?`${d.count} novos agendamentos`:'Agendamentos');}catch(_){}}
 await refresh();setInterval(()=>{if(!document.hidden)refresh();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
}
init().catch(()=>{});
})();
