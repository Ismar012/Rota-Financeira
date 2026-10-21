(() => {
'use strict';
async function init(){
 const r=await fetch('/api/auth/me',{credentials:'same-origin'});if(!r.ok)return;const me=await r.json();if(!me.authenticated)return;
 const admin=me.user?.role==='admin';
 const serviceResponse=await fetch('/api/services',{credentials:'same-origin'});
 const serviceData=serviceResponse.ok?await serviceResponse.json():{services:[]};
 const house=admin||serviceData.services.some(s=>s.slug==='divisao-casa'&&s.acquired);
 const menu=document.getElementById('menu');
 function item(label,url){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>{location.href=url;});return b;}
 if(menu&&!document.getElementById('consultationMenuItem')){const b=item('Agendar consultoria','/agendamento.html');b.id='consultationMenuItem';menu.appendChild(b);if(admin)menu.appendChild(item('Área de agendamentos','/agendamentos-admin.html'));}
 if(menu&&house)menu.appendChild(item('Resumo de casa','/resumo-casa.html'));
 if(!admin){if(house&&!menu){const nav=document.querySelector('.header .nav');if(nav){const d=document.createElement('details');const sm=document.createElement('summary');sm.textContent='⋮';sm.setAttribute('aria-label','Mais opções');d.append(sm,item('Resumo de casa','/resumo-casa.html'));nav.appendChild(d);}}return;}
 const nav=document.querySelector('.header .nav');const logo=nav?.querySelector('.logo-text');if(!nav||!logo)return;
 const style=document.createElement('style');style.textContent='.rota-schedule-brand{display:flex;align-items:center;gap:12px;min-width:0}.rota-schedule-tools{display:flex;align-items:center;gap:8px;flex-shrink:0}.rota-schedule-link{display:inline-flex;align-items:center;justify-content:center;gap:3px}.rota-schedule-link{position:relative;border:1px solid rgba(217,169,40,.4);border-radius:8px;padding:9px 12px;background:#0b0d0f;color:#f2cb5b;text-decoration:none;cursor:pointer;font-size:18px}.rota-schedule-count{font-size:11px;background:#f2cb5b;color:#080808;border-radius:20px;padding:2px 5px;margin-left:4px}.rota-schedule-dropdown{position:relative}.rota-schedule-dropdown summary{list-style:none}.rota-schedule-dropdown summary::-webkit-details-marker{display:none}.rota-schedule-dropdown a{position:absolute;right:0;top:45px;min-width:190px;z-index:40;background:#0b0d0f;color:#f2cb5b;padding:14px;border:1px solid #514221;border-radius:8px;text-decoration:none;font-size:13px}';document.head.appendChild(style);
 const tools=document.createElement('div');tools.className='rota-schedule-tools';
 const notifications=document.createElement('details');notifications.className='notification-panel';
 const bell=document.createElement('summary');bell.className='rota-schedule-link';bell.setAttribute('aria-label','Notificações');bell.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
 const count=document.createElement('span');count.className='rota-schedule-count';count.hidden=true;bell.append(count);notifications.append(bell);
 const list=document.createElement('div');list.className='notification-list';const agenda=document.createElement('a');agenda.href='/agendamentos-admin.html';agenda.textContent='Agendamentos — consultar';const products=document.createElement('a');products.href='/produtos-admin.html';products.textContent='Solicitações de produtos — consultar';list.append(agenda,products);notifications.append(list);tools.append(notifications);
 let agendaCount=null,productCount=null;function update(){const total=(agendaCount||0)+(productCount||0);count.textContent=total;count.hidden=!total;bell.setAttribute('aria-label',total+' notificações: agendamentos e produtos');agenda.textContent='Agendamentos'+(agendaCount===null?' — indisponível no momento':' · '+agendaCount+' novos');products.textContent='Solicitações de produtos'+(productCount===null?' — indisponível no momento':' · '+productCount+' pendentes');}
 if(location.pathname==='/admin.html'){const details=document.createElement('details');details.className='rota-schedule-dropdown';const summary=document.createElement('summary');summary.className='rota-schedule-link';summary.textContent='⋮';summary.setAttribute('aria-label','Mais opções');details.appendChild(summary);const a=document.createElement('a');a.href='/agendamentos-admin.html';a.textContent='Área de agendamentos';details.appendChild(a);for(const [label,url] of [['Resumo de casa','/resumo-casa.html'],['Produtos por cliente','/produtos-admin.html'],['Desafios e reservas','/desafio-admin.html']]){const link=document.createElement('a');link.href=url;link.textContent=label;details.appendChild(link);}const dropdownStyle=document.createElement('style');dropdownStyle.textContent='.rota-schedule-dropdown a{position:static;display:block}.rota-schedule-dropdown[open]{background:#0b0d0f}.rota-schedule-dropdown[open] a{min-width:190px}';document.head.appendChild(dropdownStyle);tools.appendChild(details);}
 async function refreshProducts(){try{const r=await fetch('/api/admin/products',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();productCount=(d.requests||[]).length;}catch(_){productCount=null;}update();}
 refreshProducts();setInterval(()=>{if(!document.hidden)refreshProducts();},60000);
 const brand=document.createElement('div');brand.className='rota-schedule-brand';logo.before(brand);brand.append(logo,tools);
 async function refresh(){try{const r=await fetch('/api/admin/consultations/notifications',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();agendaCount=Number(d.count)||0;}catch(_){agendaCount=null;}update();}
 window.addEventListener('rota-consultations-changed',refresh);
 await refresh();setInterval(()=>{if(!document.hidden)refresh();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){refresh();refreshProducts();}});
}
init().catch(()=>{});
})();
