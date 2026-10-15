(() => {
  const nav = document.querySelector('.header .nav');
  if (!nav) return;
  const menu = document.createElement('div');
  menu.className = 'client-navigation';
  menu.setAttribute('aria-label', 'Área do cliente');
  for (const [label, href] of [['Início','/dashboard.html'],['Planejamento','/planejamento.html'],['Serviços','/servicos.html'],['Perfil','/perfil.html']]) {
    const a = document.createElement('a'); a.textContent = label; a.href = href;
    if (location.pathname === href) a.setAttribute('aria-current', 'page');
    menu.appendChild(a);
  }
  nav.appendChild(menu);
  // Descanso permanece no atalho principal e no menu de opções.
  // Consultorias ficam disponíveis pelo menu de agendamentos.
})();
