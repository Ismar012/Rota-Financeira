(() => {
  'use strict';
  const adminPaths = new Set([
    '/admin.html', '/agendamentos-admin.html', '/desafio-admin.html',
    '/produtos-admin.html', '/relatorios-admin.html'
  ]);
  if (!adminPaths.has(location.pathname)) return;

  const body = document.body;
  body.classList.add('rf-admin-shell');
  const path = location.pathname;
  const icon = inner => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
  const icons = {
    overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>',
    product: '<path d="M12 3 20 7v5c0 5-3.4 7.8-8 9-4.6-1.2-8-4-8-9V7z"/><path d="m9 12 2 2 4-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    report: '<path d="M4 19V5M4 19h17"/><rect x="7" y="11" width="3" height="5" rx=".5"/><rect x="13" y="7" width="3" height="9" rx=".5"/><rect x="19" y="3" width="2" height="13" rx=".5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" transform="translate(-1 -1)"/>',
    bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    back: '<path d="m15 18-6-6 6-6"/><path d="M9 12h11"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>'
  };

  let header = document.querySelector('body > header');
  if (!header) { header = document.createElement('header'); body.prepend(header); }
  header.classList.add('rf-admin-topbar');
  let nav = header.querySelector('nav');
  if (!nav) { nav = document.createElement('nav'); header.replaceChildren(nav); }
  nav.className = 'rf-admin-nav';

  const brand = document.createElement('a');
  brand.className = 'rf-admin-brand';
  brand.href = '/admin.html';
  brand.setAttribute('aria-label', 'Rota Financeira — área administrativa');
  brand.innerHTML = `<img src="/marca-rf.png?v=20261027-brand2" alt=""><span>ROTA <strong>FINANCEIRA</strong></span>`;

  const oldAdminName = document.getElementById('adminName');
  const oldLogout = document.getElementById('logout');
  const logout = document.createElement('button');
  logout.id = 'logout'; logout.type = 'button'; logout.className = 'rf-admin-action rf-admin-logout';
  logout.innerHTML = `${icon(icons.logout)}<span>Sair</span>`;
  logout.setAttribute('aria-label', 'Sair da conta administrativa');
  if (oldLogout) oldLogout.replaceWith(logout);

  const back = document.createElement('button');
  back.type = 'button'; back.className = 'rf-admin-action rf-admin-back';
  back.innerHTML = `${icon(icons.back)}<span>Voltar</span>`;
  back.setAttribute('aria-label', 'Voltar para a tela anterior');

  const bell = document.createElement('button');
  bell.type = 'button'; bell.className = 'rf-admin-action rf-admin-notify';
  bell.innerHTML = `${icon(icons.bell)}<span class="rf-admin-notify-count" hidden>0</span>`;
  bell.setAttribute('aria-label', 'Notificações administrativas');
  bell.title = 'Notificações administrativas';
  const count = bell.querySelector('.rf-admin-notify-count');

  const left = document.createElement('div'); left.className = 'rf-admin-topbar-left';
  left.append(brand, bell);
  const actions = document.createElement('div'); actions.className = 'rf-admin-actions';
  if (oldAdminName) { oldAdminName.className = 'admin-badge rf-admin-name'; actions.append(oldAdminName); }
  actions.append(back, logout);
  nav.replaceChildren(left, actions);

  // Navegação administrativa consistente em todas as telas de gestão.
  const sidebar = document.createElement('aside');
  sidebar.className = 'rf-admin-sidebar';
  sidebar.setAttribute('aria-label', 'Navegação administrativa');
  const links = [
    { label: 'Visão da consultoria', href: '/admin.html', key: 'overview', svg: icons.overview },
    { label: 'Clientes', href: '/admin.html#clients', key: 'clients', svg: icons.users },
    { label: 'Solicitações do produto', href: '/produtos-admin.html', key: 'products', svg: icons.product, badge: 'productRequestsNavCount' },
    { label: 'Acompanhar agendamentos', href: '/agendamentos-admin.html', key: 'appointments', svg: icons.calendar, badge: 'appointmentsNavCount' },
    { label: 'Relatórios', href: '/relatorios-admin.html', key: 'reports', svg: icons.report }
  ];
  const linkArea = document.createElement('nav'); linkArea.className = 'rf-admin-side-links';
  linkArea.setAttribute('aria-label', 'Seções administrativas');
  links.forEach(item => {
    const a = document.createElement('a'); a.className = 'rf-admin-side-link'; a.href = item.href; a.dataset.adminNav = item.key;
    a.innerHTML = `${icon(item.svg)}<span>${item.label}</span>${item.badge ? `<span id="${item.badge}" class="rf-admin-side-count" hidden>0</span>` : ''}`;
    const active = item.key === 'overview' && path === '/admin.html' && !location.hash
      || item.key === 'clients' && path === '/admin.html' && location.hash === '#clients'
      || item.key === 'products' && path === '/produtos-admin.html'
      || item.key === 'appointments' && path === '/agendamentos-admin.html'
      || item.key === 'reports' && path === '/relatorios-admin.html';
    if (active) { a.classList.add('active'); a.setAttribute('aria-current', 'page'); }
    linkArea.append(a);
  });
  sidebar.append(linkArea);
  const bottom = document.createElement('div'); bottom.className = 'rf-admin-sidebar-bottom';
  const settings = document.createElement('a'); settings.className = 'rf-admin-side-link rf-admin-settings-link'; settings.href = '/admin.html#adminSettings';
  settings.innerHTML = `${icon(icons.settings)}<span>Configurações</span>`;
  if ((path === '/admin.html' && location.hash === '#adminSettings') || path === '/desafio-admin.html') { settings.classList.add('active'); settings.setAttribute('aria-current','page'); }
  bottom.append(settings);
  const foot = document.createElement('div'); foot.className = 'rf-admin-side-brand';
  foot.innerHTML = '<strong>Rota Financeira</strong><span>Gestão mais organizada.</span>';
  bottom.append(foot); sidebar.append(bottom);
  const oldSidebar = document.querySelector('.rf-admin-sidebar'); oldSidebar?.remove();
  header.after(sidebar);

  // Mantém a pilha de navegação restrita ao host administrativo.
  const STACK_KEY = 'rf-admin-navigation-stack-v2';
  const route = (value = location.href) => { const u = new URL(value, location.origin); return `${u.pathname}${u.search}${u.hash}`; };
  const readStack = () => { try { const value=JSON.parse(sessionStorage.getItem(STACK_KEY)||'[]'); return Array.isArray(value)?value.filter(x=>typeof x==='string'):[]; } catch { return []; } };
  const writeStack = value => { try { sessionStorage.setItem(STACK_KEY,JSON.stringify(value.slice(-60))); } catch {} };
  const syncStack = () => { const stack=readStack(), here=route(); if(!stack.length)stack.push(here);else if(stack[stack.length-1]!==here){const ix=stack.lastIndexOf(here);if(ix>=0)stack.splice(ix+1);else stack.push(here);}writeStack(stack); };
  syncStack(); window.addEventListener('pageshow', syncStack);
  document.addEventListener('click', event => {
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const a=event.target.closest?.('a[href]');if(!a||a.target==='_blank'||a.hasAttribute('download'))return;
    let u;try{u=new URL(a.href,location.href);}catch{return;}if(u.origin!==location.origin)return;
    if(route(u.href)===route())return;
    const stack=readStack(), current=route();if(!stack.length)stack.push(current);else if(stack[stack.length-1]!==current)stack.push(current);stack.push(route(u.href));writeStack(stack);
  },true);
  back.addEventListener('click',()=>{
    const stack=readStack(),current=route();if(stack.length&&stack[stack.length-1]!==current){const i=stack.lastIndexOf(current);if(i>=0)stack.splice(i+1);else stack.push(current);}
    if(stack.length>1){stack.pop();const previous=stack[stack.length-1];writeStack(stack);location.href=previous;}
    else{writeStack([]);location.href=path==='/admin.html'?'/login.html':'/admin.html';}
  });
  logout.addEventListener('click',async()=>{logout.disabled=true;try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});}catch(error){console.warn('Falha ao encerrar sessão administrativa:',error);}finally{try{sessionStorage.removeItem(STACK_KEY);}catch{}location.href='/login.html';}});

  // Central unificada: solicitações de produto, agendamentos novos e Reserva da Liberdade.
  const overlay=document.createElement('div');
  overlay.className='rf-admin-notice-overlay';overlay.hidden=true;overlay.id='rfAdminRequestNotifications';
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','rfAdminNoticeTitle');
  overlay.innerHTML=`<section class="rf-admin-notice-dialog"><header class="rf-admin-notice-head"><div><span class="rf-admin-eyebrow">CENTRAL ADMINISTRATIVA</span><h2 id="rfAdminNoticeTitle">Notificações administrativas</h2><p>Solicitações e novos agendamentos que precisam da sua atenção.</p></div><button type="button" class="rf-admin-notice-close" aria-label="Fechar notificações">×</button></header><p class="rf-admin-notice-status" role="status" aria-live="polite"></p><section class="rf-admin-notice-section"><h3>Solicitações do produto</h3><div class="rf-admin-product-list"></div><a class="rf-admin-notice-link" href="/produtos-admin.html">Abrir solicitações do produto →</a></section><section class="rf-admin-notice-section"><h3>Agendamentos novos</h3><div class="rf-admin-agenda-list"></div><a class="rf-admin-notice-link" href="/agendamentos-admin.html">Acompanhar agendamentos →</a></section><section class="rf-admin-notice-section"><h3>Solicitações da Reserva da Liberdade</h3><section class="rf-admin-request-list"></section></section><section class="rf-admin-decision" hidden><button type="button" class="rf-admin-decision-back">← Todas as solicitações</button><h3 class="rf-admin-decision-question"></h3><p class="rf-admin-decision-meta"></p><div class="rf-admin-decision-actions"><button type="button" class="rf-admin-reject">Não liberar</button><button type="button" class="rf-admin-approve">Sim, liberar acesso</button></div></section></section>`;
  body.append(overlay);
  const status=overlay.querySelector('.rf-admin-notice-status');
  const productList=overlay.querySelector('.rf-admin-product-list');
  const agendaList=overlay.querySelector('.rf-admin-agenda-list');
  const reserveList=overlay.querySelector('.rf-admin-request-list');
  const decision=overlay.querySelector('.rf-admin-decision');
  const noticeSections=[...overlay.querySelectorAll('.rf-admin-notice-section')];
  let selectedRequest=null;
  const requestDate=value=>{if(!value)return 'Data não informada';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(d);};
  async function fetchJson(url,options={}){const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Não foi possível consultar as notificações.');return data;}
  function badge(id,n){const el=document.getElementById(id);if(!el)return;el.textContent=String(n);el.hidden=!(n>0);}
  async function refreshCount(){
    try{
      const [products,agenda,reserve]=await Promise.all([
        fetchJson('/api/admin/products'),fetchJson('/api/admin/consultations'),fetchJson('/api/admin/reserva-liberdade/solicitacoes')
      ]);
      const productCount=Array.isArray(products.requests)?products.requests.length:0;
      const agendaCount=Array.isArray(agenda.bookings)?agenda.bookings.filter(b=>!b.seen_at&&!b.cancelled_at).length:0;
      const reserveCount=Array.isArray(reserve.requests)?reserve.requests.length:0;
      count.textContent=String(productCount+agendaCount+reserveCount);count.hidden=productCount+agendaCount+reserveCount===0;
      bell.setAttribute('aria-label',`${productCount+agendaCount+reserveCount} notificações administrativas`);
      badge('productRequestsNavCount',productCount);badge('appointmentsNavCount',agendaCount);
    }catch{count.hidden=true;}
  }
  function addEmpty(target,message){const p=document.createElement('p');p.className='rf-admin-notice-empty';p.textContent=message;target.append(p);}
  function chooseRequest(request){
    selectedRequest=request;noticeSections.forEach(section=>section.hidden=true);decision.hidden=false;
    decision.querySelector('.rf-admin-decision-question').textContent=`Liberar a Reserva da Liberdade para ${request.name||'este cliente'}?`;
    decision.querySelector('.rf-admin-decision-meta').textContent=`${request.email||'E-mail não informado'} · Solicitação recebida em ${requestDate(request.requested_at)}.`;
    decision.querySelector('.rf-admin-decision-back').focus();
  }
  function showList(){decision.hidden=true;noticeSections.forEach(section=>section.hidden=false);selectedRequest=null;}
  async function loadNotifications(){
    productList.replaceChildren();agendaList.replaceChildren();reserveList.replaceChildren();showList();status.textContent='Consultando notificações…';
    try{
      const [products,agenda,reserve]=await Promise.all([
        fetchJson('/api/admin/products'),fetchJson('/api/admin/consultations'),fetchJson('/api/admin/reserva-liberdade/solicitacoes')
      ]);
      const productRequests=Array.isArray(products.requests)?products.requests:[];
      const newBookings=Array.isArray(agenda.bookings)?agenda.bookings.filter(b=>!b.seen_at&&!b.cancelled_at):[];
      const reserveRequests=Array.isArray(reserve.requests)?reserve.requests:[];
      const total=productRequests.length+newBookings.length+reserveRequests.length;
      status.textContent=total?`${total} item(ns) aguardando atenção.`:'Tudo em dia. Não há solicitações pendentes nem novos agendamentos.';
      if(productRequests.length){productRequests.forEach(r=>{const row=document.createElement('article');row.className='rf-admin-request-row';const details=document.createElement('div');details.className='rf-admin-request-details';const strong=document.createElement('strong');strong.textContent=r.name||'Cliente';const product=document.createElement('span');product.textContent=r.product||'Produto';const when=document.createElement('small');when.textContent='Solicitado em '+requestDate(r.created_at);details.append(strong,product,when);const link=document.createElement('a');link.className='rf-admin-review-request';link.href=`/produtos-admin.html?client=${encodeURIComponent(r.user_id)}`;link.textContent='Ver pedido';row.append(details,link);productList.append(row);});}else addEmpty(productList,'Nenhuma solicitação de produto pendente.');
      if(newBookings.length){newBookings.slice(0,8).forEach(b=>{const row=document.createElement('article');row.className='rf-admin-request-row';const details=document.createElement('div');details.className='rf-admin-request-details';const strong=document.createElement('strong');strong.textContent=b.name||'Cliente';const line=document.createElement('span');line.textContent=`${String(b.day||'').split('-').reverse().join('/')} · ${b.start||'—'} às ${b.end||'—'}`;const email=document.createElement('small');email.textContent=b.email||'E-mail não informado';details.append(strong,line,email);const link=document.createElement('a');link.className='rf-admin-review-request';link.href=`/agendamentos-admin.html?month=${encodeURIComponent(String(b.day||'').slice(0,7))}&day=${encodeURIComponent(b.day||'')}`;link.textContent='Ver agenda';row.append(details,link);agendaList.append(row);});}else addEmpty(agendaList,'Nenhum agendamento novo aguardando visualização.');
      if(reserveRequests.length){reserveRequests.forEach(request=>{const row=document.createElement('article');row.className='rf-admin-request-row';const details=document.createElement('div');details.className='rf-admin-request-details';const name=document.createElement('strong');name.textContent=request.name||'Cliente';const email=document.createElement('span');email.textContent=request.email||'E-mail não informado';const date=document.createElement('small');date.textContent='Solicitou em '+requestDate(request.requested_at);details.append(name,email,date);const review=document.createElement('button');review.type='button';review.className='rf-admin-review-request';review.textContent='Analisar';review.addEventListener('click',()=>chooseRequest(request));row.append(details,review);reserveList.append(row);});}else addEmpty(reserveList,'Nenhuma solicitação da Reserva da Liberdade pendente.');
    }catch(error){status.textContent=error.message;addEmpty(productList,'Não foi possível atualizar a central de notificações.');}
    await refreshCount();
  }
  async function decideReserve(value){
    if(!selectedRequest)return;
    const buttons=overlay.querySelectorAll('.rf-admin-decision-actions button');buttons.forEach(b=>b.disabled=true);status.textContent='Salvando a decisão…';
    try{const result=await fetchJson(`/api/admin/reserva-liberdade/solicitacoes/${encodeURIComponent(selectedRequest.id)}/decisao`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision:value})});selectedRequest=null;status.textContent=result.message||'Decisão registrada.';await loadNotifications();}
    catch(error){status.textContent=error.message;}
    finally{buttons.forEach(b=>b.disabled=false);}
  }
  bell.addEventListener('click',async()=>{overlay.hidden=false;body.classList.add('rf-admin-notices-open');await loadNotifications();overlay.querySelector('.rf-admin-notice-close').focus();});
  overlay.querySelector('.rf-admin-notice-close').addEventListener('click',()=>{overlay.hidden=true;body.classList.remove('rf-admin-notices-open');});
  overlay.addEventListener('click',event=>{if(event.target===overlay){overlay.hidden=true;body.classList.remove('rf-admin-notices-open');}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden){overlay.hidden=true;body.classList.remove('rf-admin-notices-open');}});
  decision.querySelector('.rf-admin-decision-back').addEventListener('click',showList);
  decision.querySelector('.rf-admin-reject').addEventListener('click',()=>decideReserve('rejected'));
  decision.querySelector('.rf-admin-approve').addEventListener('click',()=>decideReserve('approved'));
  refreshCount();window.setInterval(()=>{if(!document.hidden)refreshCount();},60000);
})();
