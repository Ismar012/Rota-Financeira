(() => {
  'use strict';
  const allowed = new Set(['/dashboard.html','/planejamento.html','/resumo-casa.html','/atividades.html','/importacao.html','/servicos.html','/perfil.html']);
  const path = window.location.pathname;
  if (!allowed.has(path)) return;
  const body = document.body;
  body.classList.add('rf-app-shell');
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') || '';
  const planningPath = path === '/planejamento.html';
  const activeKey = planningPath && view ? view : (path === '/dashboard.html' ? 'inicio' : path === '/planejamento.html' ? 'planejamento' : path === '/resumo-casa.html' ? 'casa' : path === '/perfil.html' ? 'configuracoes' : path === '/servicos.html' ? 'servicos' : 'planejamento');
  const icons = {
    inicio: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/>',
    planejamento: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3.5 9h17M7.5 13h3M7.5 16h7"/>',
    despesas: '<rect x="3" y="5" width="18" height="15" rx="2.5"/><path d="M7 5V3.5h10V5M3 10h18M7 14h4M7 17h7"/>',
    receitas: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M8.5 9.5c0-1.2 1.3-2 3.5-2s3.5.8 3.5 2-1.1 2-3.5 2-3.5.8-3.5 2 1.3 2 3.5 2 3.5-.8 3.5-2"/>',
    casa: '<path d="m3 10 9-7 9 7"/><path d="M5 9.5V21h14V9.5M9 21v-6h6v6"/><path d="M12 3v3"/>',
    metas: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/><path d="m14 10 5-5"/>',
    relatorios: '<path d="M4 20V11h4v9M10 20V4h4v16M16 20v-7h4v7"/><path d="M2 20h20"/>',
    configuracoes: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.5 2.6-1.8-.6a8 8 0 0 1-1.8 1l-.3 1.9h-3l-.3-1.9a8 8 0 0 1-1.8-1l-1.8.6-1.5-2.6L6.5 15a7 7 0 0 1 0-2l-1.4-1.1 1.5-2.6 1.8.6a8 8 0 0 1 1.8-1l.3-1.9h3l.3 1.9a8 8 0 0 1 1.8 1l1.8-.6 1.5 2.6-1.4 1.1a7 7 0 0 1-.1 2Z"/>'
  };
  const nav = [
    ['inicio','Início','/dashboard.html'],
    ['planejamento','Planejamento financeiro','/planejamento.html'],
    ['despesas','Despesas','/planejamento.html?view=despesas'],
    ['receitas','Receitas','/planejamento.html?view=receitas'],
    ['casa','Resumo de casa','/resumo-casa.html'],
    ['metas','Metas','/planejamento.html?view=metas'],
    ['relatorios','Relatórios','/planejamento.html?view=relatorios']
  ];
  const link = ([key,label,href]) => `<a class="rf-sidebar-link" href="${href}" ${key === activeKey ? 'aria-current="page"' : ''} aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg><span>${label}</span></a>`;
  const aside = document.createElement('aside');
  aside.className = 'rf-app-sidebar';
  aside.setAttribute('aria-label','Navegação principal');
  aside.innerHTML = `
    <a class="rf-sidebar-brand" href="/dashboard.html" aria-label="Rota Financeira — início">
      <span class="rf-brand-mark" aria-hidden="true">RF</span>
      <span class="rf-brand-name">ROTA<span>FINANCEIRA</span></span>
    </a>
    <nav class="rf-sidebar-nav" aria-label="Seções financeiras">${nav.map(link).join('')}</nav>
    <div class="rf-sidebar-spacer"></div>
    <div class="rf-sidebar-footer">
      ${link(['configuracoes','Configurações','/perfil.html'])}
      <button type="button" class="tour-help rf-sidebar-help" aria-label="Como usar esta tela" title="Como usar esta tela">Como usar esta tela</button>
      <div class="rf-sidebar-note"><strong>Rota Financeira</strong>Seu dinheiro, mais organizado.</div>
    </div>`;
  body.insertAdjacentElement('afterbegin', aside);

  const headerNav = document.querySelector('.header .nav');
  if (headerNav) {
    const oldLogo = headerNav.querySelector('.logo-text');
    if (oldLogo) oldLogo.style.display = 'none';
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'rf-header-caption';
    const titleMap = {inicio:'Início',planejamento:'Planejamento financeiro',despesas:'Despesas',receitas:'Receitas',casa:'Área da casa',metas:'Metas',relatorios:'Relatórios',configuracoes:'Configurações',servicos:'Serviços'};
    const title = path === '/atividades.html' ? 'Atividades e fluxo de caixa' : path === '/importacao.html' ? 'Lançar por planilha' : (titleMap[activeKey] || 'Área financeira');
    const headingIcon = activeKey === 'inicio'
      ? '<span class="rf-header-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/></svg></span>'
      : '';
    sectionTitle.innerHTML = `${headingIcon}<strong>${title}</strong>`;
    headerNav.insertBefore(sectionTitle, headerNav.firstChild);
  }

  if (!document.querySelector('.header') && !document.querySelector('.rf-workspace-topbar')) {
    const main = document.querySelector('main');
    const heading = main?.querySelector('h1')?.textContent?.trim() || 'Área financeira';
    const bar = document.createElement('header');
    bar.className = 'rf-workspace-topbar';
    bar.innerHTML = `<div class="rf-workspace-title"><span class="rf-topbar-eyebrow">ROTA FINANCEIRA</span><strong>${heading.replace(/[&<>"']/g, '')}</strong></div><div class="rf-workspace-actions"><a href="/planejamento.html">Planejamento financeiro</a></div>`;
    aside.insertAdjacentElement('afterend', bar);
  }

  function navigatePlanningView() {
    if (!planningPath || !view) return;
    if (view === 'despesas' || view === 'receitas') {
      const disclosure = document.getElementById('entriesDisclosure');
      const section = document.getElementById('entriesSection');
      const filter = document.getElementById('entriesFilter');
      if (disclosure) disclosure.open = true;
      if (section) section.classList.remove('hidden');
      if (filter) filter.value = view === 'despesas' ? 'expense-all' : 'income-all';
      window.__rotaNavigationView = view;
      window.setTimeout(() => section?.scrollIntoView({behavior:'smooth',block:'start'}), 260);
      return;
    }
    if (view === 'relatorios') {
      window.setTimeout(() => document.getElementById('reportsSection')?.scrollIntoView({behavior:'smooth',block:'start'}), 300);
      return;
    }
    if (view === 'metas') {
      const tryScroll = () => {
        const target = document.getElementById('metaMensalPanel');
        if (!target) return false;
        target.scrollIntoView({behavior:'smooth',block:'start'});
        return true;
      };
      if (tryScroll()) return;
      const host = document.querySelector('.planning-container') || document.body;
      const observer = new MutationObserver(() => { if (tryScroll()) observer.disconnect(); });
      observer.observe(host,{childList:true,subtree:true});
      window.setTimeout(() => observer.disconnect(),10000);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', navigatePlanningView, {once:true});
  else navigatePlanningView();
})();
