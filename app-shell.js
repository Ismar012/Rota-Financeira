(() => {
  'use strict';
  const allowed = new Set([
    '/dashboard.html','/planejamento.html','/resumo-casa.html','/atividades.html',
    '/importacao.html','/servicos.html','/perfil.html','/desafio.html','/agendamento.html'
  ]);
  const path = window.location.pathname;
  if (!allowed.has(path)) return;

  const body = document.body;
  body.classList.add('rf-app-shell');
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') || '';
  const planningPath = path === '/planejamento.html';
  const activeKey = path === '/desafio.html' ? 'desafio' : planningPath && view
    ? view
    : (path === '/dashboard.html' ? 'inicio'
      : path === '/planejamento.html' ? 'planejamento'
      : path === '/resumo-casa.html' ? 'casa'
      : path === '/perfil.html' ? 'configuracoes'
      : path === '/servicos.html' ? 'servicos'
      : 'planejamento');

  const iconPaths = {
    inicio: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/>',
    planejamento: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3.5 9h17M7.5 13h3M7.5 16h7"/>',
    despesas: '<rect x="3" y="5" width="18" height="15" rx="2.5"/><path d="M7 5V3.5h10V5M3 10h18M7 14h4M7 17h7"/>',
    receitas: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M8.5 9.5c0-1.2 1.3-2 3.5-2s3.5.8 3.5 2-1.1 2-3.5 2-3.5.8-3.5 2 1.3 2 3.5 2 3.5-.8 3.5-2"/>',
    casa: '<path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5M9 21v-6h6v6"/>',
    metas: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/><path d="m14 10 5-5"/>',
    relatorios: '<path d="M4 20V11h4v9M10 20V4h4v16M16 20v-7h4v7"/><path d="M2 20h20"/>',
    desafio: '<path d="M8 4h8l2 4-6 11-6-11 2-4Z"/><path d="M8 4 12 8l4-4M6 8h12M12 8v11"/>',
    configuracoes: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.5 2.6-1.8-.6a8 8 0 0 1-1.8 1l-.3 1.9h-3l-.3-1.9a8 8 0 0 1-1.8-1l-1.8.6-1.5-2.6L6.5 15a7 7 0 0 1 0-2l-1.4-1.1 1.5-2.6 1.8.6a8 8 0 0 1 1.8-1l.3-1.9h3l.3 1.9a8 8 0 0 1 1.8 1l1.8-.6 1.5 2.6-1.4 1.1a7 7 0 0 1-.1 2Z"/>',
    suporte: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.2 1.8c-1.1 1-1.8 1.3-1.8 2.7M12 17.2h.01"/>'
  };
  const nav = [
    ['inicio','Início','/dashboard.html'],
    ['planejamento','Planejamento financeiro','/planejamento.html'],
    ['despesas','Despesas','/planejamento.html?view=despesas'],
    ['receitas','Receitas','/planejamento.html?view=receitas'],
    ['casa','Resumo de casa','/resumo-casa.html'],
    ['metas','Metas','/planejamento.html?view=metas'],
    ['desafio','Reserva da Liberdade','/desafio.html'],
    ['relatorios','Relatórios','/planejamento.html?view=relatorios']
  ];
  const svg = (content, cls='') => `<svg ${cls ? `class="${cls}"` : ''} viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
  const link = ([key,label,href]) => `<a class="rf-sidebar-link" href="${href}" ${key === activeKey ? 'aria-current="page"' : ''} aria-label="${label}" title="${label}">${svg(iconPaths[key])}<span>${label}</span></a>`;

  const aside = document.createElement('aside');
  aside.className = 'rf-app-sidebar';
  aside.setAttribute('aria-label','Navegação principal');
  aside.innerHTML = `
    <a class="rf-sidebar-brand" href="/dashboard.html" aria-label="Rota Financeira — início">
      <span class="rf-brand-mark" aria-hidden="true"><img src="/marca-rf.png?v=20261027-brand1" alt=""></span>
      <span class="rf-brand-name">ROTA<span>FINANCEIRA</span></span>
    </a>
    <nav class="rf-sidebar-nav" aria-label="Seções financeiras">${nav.map(link).join('')}</nav>
    <div class="rf-sidebar-spacer"></div>
    <div class="rf-sidebar-footer">
      ${link(['configuracoes','Configurações','/perfil.html'])}
      <button type="button" class="tour-help rf-sidebar-help" aria-label="Como usar esta tela" title="Como usar esta tela">${svg(iconPaths.suporte)}<span>Como usar esta tela</span></button>
      <button type="button" class="rf-sidebar-support" aria-label="Falar com o suporte" title="Falar com o suporte">${svg('<path d="M21 11.5a8.5 8.5 0 0 1-12.8 7.3L3 20l1.2-4.2A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.5 9.2c.6 2.7 2 4.2 4.7 4.8l1.1-1.1 2 .8c.3.1.4.4.3.7-.4 1-1.2 1.5-2.3 1.5-3.7-.2-7.1-3.6-7.3-7.3 0-1.1.5-1.9 1.5-2.3.3-.1.6 0 .7.3l.8 2-1.2.6Z"/>')}<span>Falar com o suporte</span></button>
      <div class="rf-sidebar-note"><strong>Rota Financeira</strong>Seu dinheiro, mais organizado.</div>
    </div>`;
  body.insertAdjacentElement('afterbegin', aside);

  const titleMap = {inicio:'Início',planejamento:'Planejamento financeiro',despesas:'Despesas',receitas:'Receitas',casa:'Resumo de casa',metas:'Metas',desafio:'Reserva da Liberdade',relatorios:'Relatórios',configuracoes:'Configurações',servicos:'Serviços'};
  const pageTitle = path === '/atividades.html' ? 'Atividades e fluxo de caixa'
    : path === '/importacao.html' ? 'Lançar por planilha'
    : path === '/agendamento.html' ? 'Agendar consultoria'
    : (titleMap[activeKey] || 'Área financeira');

  const headerNav = document.querySelector('.header .nav');
  let actionHost = null;
  if (headerNav) {
    const oldLogo = headerNav.querySelector('.logo-text');
    if (oldLogo) oldLogo.style.display = 'none';
    let caption = headerNav.querySelector('.rf-header-caption');
    if (!caption) {
      caption = document.createElement('div');
      caption.className = 'rf-header-caption';
      const headingIcon = activeKey === 'inicio'
        ? `<span class="rf-header-icon" aria-hidden="true">${svg(iconPaths.inicio)}</span>` : '';
      caption.innerHTML = `${headingIcon}<strong>${pageTitle}</strong>`;
      headerNav.insertBefore(caption, headerNav.firstChild);
    }
    actionHost = headerNav.querySelector('.nav-actions');
    if (!actionHost) {
      actionHost = document.createElement('div');
      actionHost.className = 'nav-actions rf-shell-header-actions';
      headerNav.append(actionHost);
    }
    actionHost.classList.add('rf-shell-header-actions');
  } else {
    let bar = document.querySelector('.rf-workspace-topbar');
    if (!bar) {
      bar = document.createElement('header');
      bar.className = 'rf-workspace-topbar';
      bar.innerHTML = `<div class="rf-workspace-title"><span class="rf-topbar-eyebrow">ROTA FINANCEIRA</span><strong>${pageTitle.replace(/[&<>"']/g, '')}</strong></div><div class="rf-workspace-actions"></div>`;
      aside.insertAdjacentElement('afterend', bar);
    }
    actionHost = bar.querySelector('.rf-workspace-actions');
  }

  // Padroniza os três controles do cabeçalho em todas as páginas autenticadas.
  const oldLogout = document.getElementById('logout');
  const logout = oldLogout ? oldLogout.cloneNode(false) : document.createElement('button');
  logout.id = 'logout';
  logout.type = 'button';
  logout.className = 'btn btn-outline rf-shell-logout';
  logout.textContent = 'Sair';
  logout.setAttribute('aria-label','Sair da conta');
  if (oldLogout?.parentNode) oldLogout.replaceWith(logout);

  const oldBell = document.getElementById('dashboardNotifications') || document.querySelector('.rf-shell-notifications');
  const bell = oldBell ? oldBell.cloneNode(false) : document.createElement('button');
  bell.id = 'dashboardNotifications';
  bell.type = 'button';
  bell.className = 'rf-notification-btn rf-shell-notifications';
  bell.setAttribute('aria-label','Ver notificações');
  bell.title = 'Ver notificações';
  bell.innerHTML = svg('<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>');
  if (oldBell?.parentNode) oldBell.replaceWith(bell);

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn btn-outline rf-shell-back';
  back.setAttribute('aria-label','Voltar para a tela anterior');
  back.title = 'Voltar para a tela anterior';
  back.innerHTML = `${svg('<path d="m15 18-6-6 6-6"/><path d="M9 12h11"/>')}<span>Voltar</span>`;
  if (actionHost) actionHost.replaceChildren(bell, back, logout);

  // Usa uma pilha da sessão, para que o botão volte pelas telas anteriores da plataforma.
  const STACK_KEY = 'rf-client-navigation-stack-v2';
  const route = (value = window.location.href) => {
    const u = new URL(value, window.location.origin);
    return `${u.pathname}${u.search}${u.hash}`;
  };
  const readStack = () => {
    try {
      const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || '[]');
      return Array.isArray(stack) ? stack.filter(v => typeof v === 'string') : [];
    } catch { return []; }
  };
  const saveStack = stack => { try { sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-60))); } catch {} };
  const currentRoute = route();
  const syncStack = () => {
    const stack = readStack();
    const current = route();
    if (!stack.length) stack.push(current);
    else if (stack[stack.length - 1] !== current) {
      const priorIndex = stack.lastIndexOf(current);
      if (priorIndex >= 0) stack.splice(priorIndex + 1);
      else stack.push(current);
    }
    saveStack(stack);
  };
  syncStack();
  window.addEventListener('pageshow', syncStack);
  window.addEventListener('popstate', syncStack);
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const a = event.target.closest?.('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    let target;
    try { target = new URL(a.href, window.location.href); } catch { return; }
    if (target.origin !== window.location.origin) return;
    const here = new URL(window.location.href);
    if (target.pathname === here.pathname && target.search === here.search) return;
    const stack = readStack();
    const hereRoute = route();
    if (!stack.length) stack.push(hereRoute);
    else if (stack[stack.length - 1] !== hereRoute) stack.push(hereRoute);
    stack.push(route(target.href));
    saveStack(stack);
  }, true);
  back.addEventListener('click', () => {
    const stack = readStack();
    const current = route();
    if (!stack.length) {
      window.location.href = '/login.html';
      return;
    }
    if (stack[stack.length - 1] !== current) {
      const index = stack.lastIndexOf(current);
      if (index >= 0) stack.splice(index + 1);
      else stack.push(current);
    }
    if (stack.length > 1) {
      stack.pop();
      const previous = stack[stack.length - 1] || '/login.html';
      saveStack(stack);
      window.location.href = previous;
    } else {
      saveStack([]);
      window.location.href = '/login.html';
    }
  });
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); }
    catch (error) { console.warn('Não foi possível confirmar o encerramento da sessão:', error); }
    finally {
      try { sessionStorage.removeItem(STACK_KEY); } catch {}
      window.location.href = '/login.html';
    }
  });
  bell.addEventListener('click', () => {
    const pending = document.getElementById('dashboardPending');
    if (path === '/dashboard.html' && pending) pending.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.location.href = '/dashboard.html#dashboardPending';
  });

  // Central de ajuda e FAQ: as respostas ficam na plataforma e o WhatsApp é uma opção explícita.
  const supportUrl = 'https://wa.me/5575981450079?text=' + encodeURIComponent('Olá! Preciso de ajuda com a Rota Financeira.');
  const supportButton = aside.querySelector('.rf-sidebar-support');
  const supportOverlay = document.createElement('div');
  supportOverlay.className = 'rf-support-overlay';
  supportOverlay.id = 'rfSupportCenter';
  supportOverlay.hidden = true;
  supportOverlay.setAttribute('role','dialog');
  supportOverlay.setAttribute('aria-modal','true');
  supportOverlay.setAttribute('aria-labelledby','rfSupportTitle');
  supportOverlay.innerHTML = `
    <section class="rf-support-dialog">
      <header class="rf-support-header"><div><span class="rf-support-eyebrow">ROTA FINANCEIRA</span><h2 id="rfSupportTitle">Como podemos ajudar?</h2><p>Escolha uma dúvida frequente ou fale com a equipe.</p></div><button type="button" class="rf-support-close" data-support-close aria-label="Fechar suporte">×</button></header>
      <div class="rf-support-home" data-support-home-panel>
        <a class="rf-support-whatsapp" href="${supportUrl}" target="_blank" rel="noopener noreferrer"><span class="rf-support-whatsapp-icon">✆</span><span><strong>Falar com um atendente via WhatsApp</strong><small>Atendimento direto com a equipe da Rota Financeira</small></span><span aria-hidden="true">↗</span></a>
        <div class="rf-support-section-title">Dúvidas frequentes</div>
        <div class="rf-support-faq-list">
          <button type="button" data-faq="prices">Quais são os preços dos serviços? <span>›</span></button>
          <button type="button" data-faq="reactivate">Como reativar meu plano? <span>›</span></button>
          <button type="button" data-faq="consulting">Como agendar uma consultoria? <span>›</span></button>
          <button type="button" data-faq="password">Esqueci minha senha. Como recupero? <span>›</span></button>
          <button type="button" data-faq="entries">Como cadastro ganhos e despesas? <span>›</span></button>
          <button type="button" data-faq="reports">Como baixar meus relatórios? <span>›</span></button>
          <button type="button" data-faq="reserve">Como acesso a Reserva da Liberdade? <span>›</span></button>
          <button type="button" data-faq="house">Como funciona o Resumo de casa? <span>›</span></button>
        </div>
      </div>
      <section class="rf-support-answer" data-support-answer hidden>
        <button type="button" class="rf-support-back-faq" data-support-back>← Todas as dúvidas</button>
        <h3 data-support-answer-title></h3><p data-support-answer-text></p><div class="rf-support-answer-actions" data-support-answer-actions></div>
        <a class="rf-support-team-link" href="${supportUrl}" target="_blank" rel="noopener noreferrer">Falar com a equipe</a>
      </section>
      <footer class="rf-support-footer"><span>Não encontrou o que procurava?</span><a href="${supportUrl}" target="_blank" rel="noopener noreferrer">Falar com o suporte</a></footer>
    </section>`;
  body.append(supportOverlay);
  const faq = {
    prices: {title:'Preços dos serviços', text:'Os valores dependem do serviço e das condições de contratação disponíveis para sua conta. Para receber os preços e as opções vigentes, fale com a equipe pelo WhatsApp.', action:{label:'Ver meus serviços',href:'/servicos.html'}},
    reactivate: {title:'Reativar meu plano', text:'A reativação pode depender do status atual da conta e da confirmação da equipe. Abra a área de serviços para consultar as opções disponíveis; se o acesso continuar bloqueado, fale com o suporte. Nunca envie sua senha.', action:{label:'Abrir meus serviços',href:'/servicos.html'}},
    consulting: {title:'Agendar uma consultoria', text:'Quando o serviço estiver disponível para sua conta, abra o agendamento, selecione um dia e horário livre e confirme. Se não aparecer horário disponível ou você tiver dúvidas sobre contratação, fale com a equipe.', action:{label:'Abrir agendamento',href:'/agendamento.html'}},
    password: {title:'Recuperar a senha', text:'Abra a página de recuperação de acesso e siga as orientações. Por segurança, não envie sua senha a ninguém, inclusive pelo WhatsApp.', action:{label:'Recuperar acesso',href:'/recuperar-senha.html'}},
    entries: {title:'Cadastrar ganhos e despesas', text:'Abra Planejamento financeiro. Use Cadastrar ganho ou Cadastrar despesa para um lançamento individual; para várias despesas, escolha a opção de cadastro em massa. Confirme datas, categoria e situação antes de salvar.', action:{label:'Abrir planejamento',href:'/planejamento.html'}},
    reports: {title:'Baixar relatórios', text:'Abra a aba Relatórios para ver os gráficos e baixar o relatório geral. Os relatórios específicos de metas e do resumo da casa ficam nas respectivas telas.', action:{label:'Abrir relatórios',href:'/planejamento.html?view=relatorios'}},
    reserve: {title:'Reserva da Liberdade', text:'Abra Reserva da Liberdade e envie a solicitação de acesso. Enquanto ela estiver em análise, essa mensagem aparecerá na tela. Quando a equipe aprovar, você poderá ler e aceitar as regras para começar.', action:{label:'Abrir Reserva da Liberdade',href:'/desafio.html'}},
    house: {title:'Resumo de casa', text:'O Resumo de casa organiza despesas compartilhadas, a parte de cada morador e os acertos do mês. O acesso e as funções disponíveis dependem dos serviços liberados para sua conta.', action:{label:'Abrir resumo de casa',href:'/resumo-casa.html'}}
  };
  let lastSupportFocus = null;
  const showSupport = () => {
    lastSupportFocus = document.activeElement;
    supportOverlay.hidden = false;
    supportOverlay.querySelector('[data-support-close]')?.focus?.();
    document.body.classList.add('rf-support-open');
  };
  const hideSupport = () => {
    supportOverlay.hidden = true;
    document.body.classList.remove('rf-support-open');
    lastSupportFocus?.focus?.();
  };
  supportButton.addEventListener('click', showSupport);
  supportOverlay.querySelectorAll('[data-support-close]').forEach(btn => btn.addEventListener('click', hideSupport));
  supportOverlay.addEventListener('click', event => { if (event.target === supportOverlay) hideSupport(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !supportOverlay.hidden) hideSupport(); });
  supportOverlay.querySelectorAll('[data-faq]').forEach(button => {
    button.addEventListener('click', () => {
      const item = faq[button.dataset.faq];
      if (!item) return;
      supportOverlay.querySelector('[data-support-home-panel]').hidden = true;
      const answer = supportOverlay.querySelector('[data-support-answer]');
      answer.hidden = false;
      answer.querySelector('[data-support-answer-title]').textContent = item.title;
      answer.querySelector('[data-support-answer-text]').textContent = item.text;
      const actions = answer.querySelector('[data-support-answer-actions]');
      actions.replaceChildren();
      if (item.action) {
        const a = document.createElement('a');
        a.href = item.action.href;
        a.className = 'rf-support-open-page';
        a.textContent = item.action.label;
        actions.append(a);
      }
    });
  });
  supportOverlay.querySelectorAll('[data-support-back]').forEach(button => button.addEventListener('click', () => {
    supportOverlay.querySelector('[data-support-answer]').hidden = true;
    supportOverlay.querySelector('.rf-support-home').hidden = false;
  }));
  // As abas internas do planejamento são renderizadas por finance-views.js.
})();
