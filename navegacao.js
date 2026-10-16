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
  const rest = document.getElementById('menuRest');
  if (rest) {
    const actions = document.createElement('div'); actions.className = 'planning-shortcuts';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'meta-button'; button.textContent = 'Cadastrar descanso';
    button.onclick = () => { rest.click(); document.getElementById('menu')?.classList.remove('open'); };
    const a = document.createElement('a'); a.className = 'meta-button'; a.href = '/agendamento.html'; a.textContent = 'Agendar consultoria';
    actions.append(button,a); document.querySelector('.planning-head')?.after(actions);
  }
})();
