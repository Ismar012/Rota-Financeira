(() => {
  'use strict';
  const adminPaths = new Set(['/admin.html','/agendamentos-admin.html','/desafio-admin.html','/produtos-admin.html']);
  if (!adminPaths.has(location.pathname)) return;
  const body = document.body;
  body.classList.add('rf-admin-shell');
  const path = location.pathname;
  const icon = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
  const icons = {
    back: '<path d="m15 18-6-6 6-6"/><path d="M9 12h11"/>',
    bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>'
  };

  // Padroniza a barra superior nas quatro telas administrativas.
  let header = document.querySelector('body > header');
  if (!header) {
    header = document.createElement('header');
    body.insertBefore(header, body.firstElementChild);
  }
  header.classList.add('rf-admin-topbar');
  let nav = header.querySelector('nav');
  if (!nav) {
    nav = document.createElement('nav');
    header.replaceChildren(nav);
  }
  nav.classList.add('rf-admin-nav');

  let brand = nav.querySelector('.logo-text, .logo, .rf-admin-brand, b');
  if (brand) {
    const replacement = document.createElement('a');
    replacement.className = 'rf-admin-brand';
    replacement.href = '/admin.html';
    replacement.setAttribute('aria-label','Rota Financeira — área administrativa');
    replacement.innerHTML = `<img src="/marca-rf.png?v=20261027-brand1" alt=""><span>ROTA <strong>FINANCEIRA</strong></span>`;
    brand.replaceWith(replacement);
    brand = replacement;
  } else {
    brand = document.createElement('a');
    brand.className = 'rf-admin-brand';
    brand.href = '/admin.html';
    brand.innerHTML = `<img src="/marca-rf.png?v=20261027-brand1" alt=""><span>ROTA <strong>FINANCEIRA</strong></span>`;
  }
  nav.querySelectorAll('a').forEach(a => {
    if (a !== brand && /voltar ao administrador/i.test(a.textContent || '')) a.remove();
  });
  if (!nav.contains(brand)) nav.prepend(brand);

  let actions = nav.querySelector('.rf-admin-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'rf-admin-actions';
    nav.append(actions);
  }
  const adminName = document.getElementById('adminName');
  const oldLogout = document.getElementById('logout');
  const logout = oldLogout ? oldLogout.cloneNode(false) : document.createElement('button');
  logout.id = 'logout';
  logout.type = 'button';
  logout.className = 'btn btn-outline rf-admin-logout';
  logout.textContent = 'Sair';
  if (oldLogout?.parentNode) oldLogout.replaceWith(logout);

  const oldBack = actions.querySelector('.rf-admin-back');
  const back = oldBack || document.createElement('button');
  back.type = 'button';
  back.className = 'rf-admin-action rf-admin-back';
  back.innerHTML = `${icon(icons.back)}<span>Voltar</span>`;
  back.setAttribute('aria-label','Voltar para a tela anterior');
  const oldBell = actions.querySelector('.rf-admin-notify') || nav.querySelector('.rf-admin-notify');
  const bell = oldBell || document.createElement('button');
  bell.type = 'button';
  bell.className = 'rf-admin-action rf-admin-notify';
  bell.innerHTML = `${icon(icons.bell)}<span class="rf-admin-notify-count" hidden>0</span>`;
  bell.setAttribute('aria-label','Notificações de solicitações');
  bell.title = 'Notificações de solicitações';
  const count = bell.querySelector('.rf-admin-notify-count') || (() => { const span=document.createElement('span');span.className='rf-admin-notify-count';span.hidden=true;span.textContent='0';bell.append(span);return span; })();
  actions.replaceChildren(...(adminName ? [adminName] : []), bell, back, logout);
  nav.querySelectorAll('.nav-actions').forEach(legacy => { if (legacy !== actions) legacy.remove(); });

  const STACK_KEY = 'rf-admin-navigation-stack-v1';
  const route = (value = location.href) => { const u = new URL(value, location.origin); return `${u.pathname}${u.search}${u.hash}`; };
  const readStack = () => { try { const value=JSON.parse(sessionStorage.getItem(STACK_KEY)||'[]'); return Array.isArray(value)?value.filter(x=>typeof x==='string'):[]; } catch { return []; } };
  const writeStack = value => { try { sessionStorage.setItem(STACK_KEY,JSON.stringify(value.slice(-60))); } catch {} };
  const syncStack = () => {
    const stack = readStack(); const here = route();
    if (!stack.length) stack.push(here);
    else if (stack[stack.length-1] !== here) { const ix=stack.lastIndexOf(here); if (ix>=0) stack.splice(ix+1); else stack.push(here); }
    writeStack(stack);
  };
  syncStack(); window.addEventListener('pageshow', syncStack); window.addEventListener('popstate', syncStack);
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const a=event.target.closest?.('a[href]'); if(!a||a.target==='_blank'||a.hasAttribute('download')) return;
    let u; try { u=new URL(a.href,location.href); } catch { return; }
    if(u.origin!==location.origin) return;
    const here=new URL(location.href); if(u.pathname===here.pathname&&u.search===here.search) return;
    const stack=readStack(); const current=route();
    if(!stack.length) stack.push(current); else if(stack[stack.length-1]!==current) stack.push(current);
    stack.push(route(u.href)); writeStack(stack);
  },true);
  back.addEventListener('click', () => {
    const stack=readStack(); const current=route();
    if(stack.length && stack[stack.length-1]!==current){const ix=stack.lastIndexOf(current);if(ix>=0)stack.splice(ix+1);else stack.push(current);}
    if(stack.length>1){stack.pop();const previous=stack[stack.length-1];writeStack(stack);location.href=previous;}
    else {writeStack([]);location.href=path==='/admin.html'?'/login.html':'/admin.html';}
  });
  logout.addEventListener('click', async () => {
    logout.disabled=true;
    try { await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'}); }
    catch(error){ console.warn('Falha ao encerrar sessão administrativa:',error); }
    finally { try{sessionStorage.removeItem(STACK_KEY);}catch{} location.href='/login.html'; }
  });

  const overlay=document.createElement('div');
  overlay.className='rf-admin-notice-overlay'; overlay.hidden=true; overlay.id='rfAdminRequestNotifications';
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','rfAdminNoticeTitle');
  overlay.innerHTML=`<section class="rf-admin-notice-dialog"><header class="rf-admin-notice-head"><div><span class="rf-admin-eyebrow">CENTRAL ADMINISTRATIVA</span><h2 id="rfAdminNoticeTitle">Solicitações da Reserva da Liberdade</h2><p>Revise os pedidos de acesso enviados pelos clientes.</p></div><button type="button" class="rf-admin-notice-close" aria-label="Fechar notificações">×</button></header><p class="rf-admin-notice-status" role="status" aria-live="polite"></p><section class="rf-admin-request-list"></section><section class="rf-admin-decision" hidden><button type="button" class="rf-admin-decision-back">← Todas as solicitações</button><h3 class="rf-admin-decision-question"></h3><p class="rf-admin-decision-meta"></p><div class="rf-admin-decision-actions"><button type="button" class="rf-admin-reject">Não liberar</button><button type="button" class="rf-admin-approve">Sim, liberar acesso</button></div></section></section>`;
  body.append(overlay);
  const status=overlay.querySelector('.rf-admin-notice-status');
  const list=overlay.querySelector('.rf-admin-request-list');
  const decision=overlay.querySelector('.rf-admin-decision');
  let selectedRequest=null;
  const requestDate=value=>{if(!value)return 'Data não informada';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(d);};
  async function fetchJson(url, options={}){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||'Não foi possível consultar as solicitações.');
    return data;
  }
  async function refreshCount(){
    try{const data=await fetchJson('/api/admin/reserva-liberdade/notificacoes');const n=Math.max(0,Number(data.count)||0);count.textContent=String(n);count.hidden=n===0;bell.setAttribute('aria-label',n?`${n} solicitação(ões) pendente(s)`:'Sem solicitações pendentes');}
    catch{count.hidden=true;}
  }
  function showList(){decision.hidden=true;list.hidden=false;selectedRequest=null;}
  function chooseRequest(request){
    selectedRequest=request;list.hidden=true;decision.hidden=false;
    decision.querySelector('.rf-admin-decision-question').textContent=`Liberar a Reserva da Liberdade para ${request.name || 'este cliente'}?`;
    decision.querySelector('.rf-admin-decision-meta').textContent=`${request.email || 'E-mail não informado'} · Solicitação recebida em ${requestDate(request.requested_at)}.`;
    decision.querySelector('.rf-admin-decision-back').focus();
  }
  async function loadRequests(){
    list.replaceChildren();status.textContent='Consultando solicitações pendentes…';decision.hidden=true;list.hidden=false;
    try{
      const data=await fetchJson('/api/admin/reserva-liberdade/solicitacoes');
      const requests=Array.isArray(data.requests)?data.requests:[];
      status.textContent=requests.length?`${requests.length} solicitação(ões) aguardando análise.`:'Nenhuma solicitação pendente no momento.';
      if(!requests.length){const empty=document.createElement('div');empty.className='rf-admin-request-empty';empty.textContent='Quando um cliente solicitar acesso à Reserva da Liberdade, o pedido aparecerá aqui.';list.append(empty);return;}
      requests.forEach(request=>{
        const row=document.createElement('article');row.className='rf-admin-request-row';
        const details=document.createElement('div');details.className='rf-admin-request-details';
        const name=document.createElement('strong');name.textContent=request.name||'Cliente';
        const email=document.createElement('span');email.textContent=request.email||'E-mail não informado';
        const date=document.createElement('small');date.textContent=`Solicitou em ${requestDate(request.requested_at)}`;
        details.append(name,email,date);
        const review=document.createElement('button');review.type='button';review.className='rf-admin-review-request';review.textContent='Analisar';review.addEventListener('click',()=>chooseRequest(request));
        row.append(details,review);list.append(row);
      });
    }catch(error){status.textContent=error.message;const retry=document.createElement('button');retry.type='button';retry.className='rf-admin-review-request';retry.textContent='Tentar novamente';retry.addEventListener('click',loadRequests);list.append(retry);}
    refreshCount();
  }
  async function makeDecision(value){
    if(!selectedRequest)return;
    const buttons=overlay.querySelectorAll('.rf-admin-decision-actions button');buttons.forEach(b=>b.disabled=true);
    status.textContent='Salvando a decisão…';
    try{
      const result=await fetchJson(`/api/admin/reserva-liberdade/solicitacoes/${encodeURIComponent(selectedRequest.id)}/decisao`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision:value})});
      status.textContent=result.message||'Decisão registrada.';
      selectedRequest=null;
      await loadRequests();
    }catch(error){status.textContent=error.message;}
    finally{buttons.forEach(b=>b.disabled=false);}
  }
  bell.addEventListener('click',async()=>{overlay.hidden=false;document.body.classList.add('rf-admin-notices-open');await loadRequests();overlay.querySelector('.rf-admin-notice-close').focus();});
  overlay.querySelector('.rf-admin-notice-close').addEventListener('click',()=>{overlay.hidden=true;document.body.classList.remove('rf-admin-notices-open');});
  overlay.addEventListener('click',event=>{if(event.target===overlay){overlay.hidden=true;document.body.classList.remove('rf-admin-notices-open');}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden){overlay.hidden=true;document.body.classList.remove('rf-admin-notices-open');}});
  decision.querySelector('.rf-admin-decision-back').addEventListener('click',showList);
  decision.querySelector('.rf-admin-reject').addEventListener('click',()=>makeDecision('rejected'));
  decision.querySelector('.rf-admin-approve').addEventListener('click',()=>makeDecision('approved'));
  refreshCount();
  window.setInterval(refreshCount,60000);
})();
