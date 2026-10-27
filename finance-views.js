(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const view = params.get('view') || '';
  const allowedViews = new Set(['despesas', 'receitas', 'metas', 'relatorios']);
  const fmt = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const isPaid = entry => entry.paid === true || Number(entry.paid) === 1;
  const isMonth = (value, month) => String(value || '').slice(0, 7) === month;
  const effectiveDate = entry => String(entry.paid_date || entry.paid_at || entry.due_date || '').slice(0, 10);
  const inMonthlyActivity = (entry, month) => isPaid(entry) ? isMonth(effectiveDate(entry), month) : isMonth(entry.due_date, month);
  const fmtDate = value => {
    if (!value) return '—';
    const parts = String(value).slice(0,10).split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
  };
  const labels = { despesas: 'Despesas', receitas: 'Receitas', metas: 'Metas', relatorios: 'Relatórios' };

  const generalDownload = document.getElementById('downloadGeneralReportPlanning');
  if (generalDownload) generalDownload.addEventListener('click', () => {
    const month = document.getElementById('monthPicker')?.value || new Date().toISOString().slice(0, 7);
    location.href = `/api/finance/report?month=${encodeURIComponent(month)}`;
  });
  if (!allowedViews.has(view)) return;

  document.body.classList.add('rf-finance-section-view', `rf-view-${view}`);
  const container = document.querySelector('.planning-container');
  const head = container?.querySelector('.planning-head');
  if (!container || !head) return;

  const root = document.createElement('div');
  root.id = 'financeViewRoot';
  root.className = 'rf-finance-view-root';
  root.innerHTML = `
    <div class="rf-finance-view-topline">
      <div><span class="rf-finance-view-eyebrow">VISÃO DO MÊS</span><p id="rfFinanceViewIntro">Acompanhe os valores do período selecionado.</p></div>
      <div id="rfFinanceViewActions" class="rf-finance-view-actions"></div>
    </div>
    <div id="rfFinanceViewBody"><p class="rf-view-loading" role="status">Carregando os dados do mês…</p></div>
    <details id="rfGoalSettingsDetails" class="rf-goal-settings" hidden><summary>Configurar a base e os prazos da meta</summary><div id="rfGoalSettingsHost"></div></details>`;
  head.insertAdjacentElement('afterend', root);

  const title = head.querySelector('.planning-title');
  const eyebrow = head.querySelector('.eyebrow');
  const desc = head.querySelector('.muted');
  if (title) title.textContent = labels[view];
  if (eyebrow) eyebrow.textContent = 'PLANEJAMENTO FINANCEIRO';
  if (desc) desc.textContent = ({
    despesas: 'Despesas pagas, pendentes e evolução diária dos gastos.',
    receitas: 'Ganhos previstos, recebidos e distribuição por categoria.',
    metas: 'Meta diária e acompanhamento de cada dia do mês.',
    relatorios: 'Resultados do período em gráficos e relatório financeiro consolidado.'
  })[view];
  if (generalDownload) {
    generalDownload.hidden = true;
    generalDownload.style.setProperty('display', 'none', 'important');
  }

  function hidePlanningSiblings() {
    // Os resumos e atalhos antigos do planejamento ficam somente na aba principal.
    // Algumas regras de display dos cartões sobrepunham o atributo [hidden], então
    // aplicamos display:none!important enquanto uma visão dedicada está ativa.
    [...container.children].forEach(node => {
      if (node !== head && node !== root) {
        node.hidden = true;
        node.setAttribute('data-hidden-for-finance-view', 'true');
        node.setAttribute('aria-hidden', 'true');
        node.style.setProperty('display', 'none', 'important');
      }
    });
  }
  hidePlanningSiblings();
  new MutationObserver(hidePlanningSiblings).observe(container, { childList: true });

  const body = root.querySelector('#rfFinanceViewBody');
  const actions = root.querySelector('#rfFinanceViewActions');
  const settings = root.querySelector('#rfGoalSettingsDetails');
  if (view === 'metas') settings.hidden = true;
  if (view === 'despesas') actions.innerHTML = '<button type="button" class="rf-view-primary" data-rf-action="new-expense">＋ Cadastrar despesa</button>';
  if (view === 'receitas') actions.innerHTML = '<button type="button" class="rf-view-primary" data-rf-action="new-income">＋ Cadastrar ganho</button>';
  if (view === 'metas') actions.innerHTML = '<button type="button" class="rf-view-primary" data-rf-action="download-goals">Baixar relatório de metas</button>';
  if (view === 'relatorios') actions.innerHTML = '<button type="button" class="rf-view-primary" data-rf-action="download-general">Baixar relatório geral</button>';

  let charts = {};
  let currentSummary = null;
  let currentMonth = document.getElementById('monthPicker')?.value || new Date().toISOString().slice(0,7);
  let drawToken = 0;
  function destroyCharts() {
    Object.values(charts).forEach(chart => { try { chart.destroy(); } catch {} });
    charts = {};
  }
  function chartOptions() {
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#c7d2df', usePointStyle: true, boxWidth: 8, padding: 16 } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label || ctx.label}: ${fmt(ctx.parsed.y ?? ctx.parsed)}` } } },
      scales: { x: { ticks: { color: '#9badbe', maxRotation: 0, autoSkip: true }, grid: { color: 'rgba(150,170,190,.08)' } }, y: { beginAtZero: true, ticks: { color: '#9badbe', callback: value => fmt(value) }, grid: { color: 'rgba(150,170,190,.10)' } } }
    };
  }
  function lineChart(id, rows, datasets) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return;
    charts[id] = new Chart(canvas, {
      type: 'line',
      data: { labels: rows.map(row => String(row.day ?? row.date ?? '').slice(-2)), datasets: datasets.map(ds => ({ ...ds, data: ds.data, borderWidth: 2.2, tension: .28, pointRadius: 2, pointHoverRadius: 4, fill: false })) },
      options: chartOptions()
    });
  }
  function pieChart(id, entries, type) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return;
    const sums = new Map();
    entries.filter(entry => entry.type === type).forEach(entry => {
      const key = String(entry.financial_category || 'Outros').trim() || 'Outros';
      sums.set(key, (sums.get(key) || 0) + Number(entry.amount || 0));
    });
    const pairs = [...sums.entries()].filter(([, amount]) => amount > 0).sort((a,b) => b[1]-a[1]);
    if (!pairs.length) {
      canvas.parentElement.innerHTML = '<p class="rf-view-empty">Ainda não há lançamentos categorizados neste mês.</p>';
      return;
    }
    const palette = ['#e7b936','#4f82a8','#4caf8c','#d66b52','#9b83c8','#d68e39','#5ca6a6','#c95b89','#8aa35b','#7c8ea5'];
    charts[id] = new Chart(canvas, { type: 'pie', data: { labels: pairs.map(x=>x[0]), datasets: [{ data: pairs.map(x=>x[1]), backgroundColor: pairs.map((_,i)=>palette[i%palette.length]), borderColor: '#081019', borderWidth: 2 }] }, options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{position:'bottom',labels:{color:'#c7d2df',usePointStyle:true,boxWidth:8,padding:14}}, tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${fmt(ctx.parsed)}`}} } } });
  }
  function metrics(items) {
    return `<section class="rf-view-metrics">${items.map(item => `<article class="rf-view-metric"><span>${esc(item.label)}</span><strong>${fmt(item.value)}</strong><small>${esc(item.help || '')}</small></article>`).join('')}</section>`;
  }
  function chartCard(titleText, canvasId, description) {
    return `<section class="rf-view-chart-card"><div class="rf-view-card-heading"><h2>${esc(titleText)}</h2>${description ? `<p>${esc(description)}</p>` : ''}</div><div class="rf-view-chart"><canvas id="${canvasId}" aria-label="${esc(titleText)}" role="img"></canvas></div></section>`;
  }
  function renderEntriesTable(summary, type) {
    const filterId = `rfEntriesStatus-${type}`;
    const searchId = `rfEntriesSearch-${type}`;
    const entries = (summary.entries || []).filter(entry => entry.type === type && inMonthlyActivity(entry, summary.month));
    return `<section class="rf-view-list-card"><div class="rf-view-list-heading"><div><h2>${type === 'expense' ? 'Despesas do mês' : 'Ganhos do mês'}</h2><p>Consulte ou altere os lançamentos deste período.</p></div><div class="rf-view-list-filters"><input type="search" id="${searchId}" placeholder="Buscar lançamento" aria-label="Buscar lançamento"><select id="${filterId}" aria-label="Filtrar situação"><option value="all">Todas as situações</option><option value="paid">${type === 'expense' ? 'Pagas' : 'Recebidos'}</option><option value="pending">Pendentes</option></select></div></div><div class="rf-view-table-scroll"><table class="rf-view-table"><thead><tr><th>Data efetiva / prevista</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Situação</th><th>Ações</th></tr></thead><tbody id="rfEntriesRows-${type}">${entries.length ? entries.map(entry => {
      const paid = isPaid(entry);
      const action = paid ? `undo-${type==='income'?'receive':'pay'}` : (type==='income'?'receive':'pay');
      return `<tr data-type="${type}" data-id="${Number(entry.id)}" data-paid="${paid?'paid':'pending'}" data-name="${esc(`${entry.name} ${entry.financial_category||''}`.toLowerCase())}"><td>${fmtDate(isPaid(entry) ? effectiveDate(entry) : entry.due_date)}</td><td>${esc(entry.name)}</td><td>${esc(entry.financial_category || 'Outros')}</td><td class="rf-view-money">${fmt(entry.amount)}</td><td><span class="rf-view-status ${paid?'is-paid':'is-pending'}">${paid?(type==='income'?'Recebido':'Paga'):'Pendente'}</span></td><td><div class="rf-view-row-actions">${entry.house_expense_id ? '<a href="/resumo-casa.html">Gerenciar em Despesas da casa</a>' : entry.challenge_reserve ? '<a href="/desafio.html">Gerenciar na Reserva da Liberdade</a>' : `<button type="button" data-rf-entry-action="${action}" data-id="${Number(entry.id)}">${paid?'Desfazer confirmação':(type==='income'?'Confirmar recebimento':'Confirmar pagamento')}</button><button type="button" data-rf-entry-action="edit" data-id="${Number(entry.id)}">Editar</button>`}</div></td></tr>`;
    }).join('') : `<tr><td colspan="6">Não há lançamentos ${type==='income'?'de receita':'de despesa'} neste período.</td></tr>`}</tbody></table></div></section>`;
  }
  function renderExpense(summary) {
    const monthEntries = (summary.entries || []).filter(e => e.type === 'expense' && inMonthlyActivity(e, summary.month));
    const paidTotal = monthEntries.filter(isPaid).reduce((sum,e)=>sum+Number(e.amount||0),0);
    const pendingTotal = monthEntries.filter(e=>!isPaid(e)).reduce((sum,e)=>sum+Number(e.amount||0),0);
    const total = paidTotal + pendingTotal;
    body.innerHTML = `${metrics([
      {label:'Despesas pagas',value:paidTotal,help:'Pagamentos confirmados efetivamente neste mês'},
      {label:'Despesas pendentes',value:pendingTotal,help:'Contas ainda não confirmadas com vencimento neste mês'},
      {label:'Total de despesas do mês',value:total,help:'Pagamentos do mês + despesas pendentes do período'}
    ])}<div class="rf-view-chart-grid">${chartCard('Despesas dia a dia','rfExpenseDailyChart','Distribuição diária das despesas previstas e pagas')}${chartCard('Despesas por categoria','rfExpenseCategoryChart','Distribuição por categoria dos lançamentos do mês')}</div>${renderEntriesTable(summary,'expense')}`;
    lineChart('rfExpenseDailyChart', summary.data || [], [
      {label:'Despesa diária',data:(summary.data||[]).map(d=>Number(d.futureExpense||0)+Number(d.paidExpense||0)),borderColor:'#e7b936',backgroundColor:'#e7b936'}
    ]);
    pieChart('rfExpenseCategoryChart', monthEntries, 'expense');
  }
  function renderIncome(summary) {
    const monthEntries = (summary.entries || []).filter(e => e.type === 'income' && inMonthlyActivity(e, summary.month));
    const planned = monthEntries.filter(e=>!isPaid(e)).reduce((sum,e)=>sum+Number(e.amount||0),0);
    const received = monthEntries.filter(isPaid).reduce((sum,e)=>sum+Number(e.amount||0),0);
    const total = planned + received;
    body.innerHTML = `${metrics([
      {label:'Ganhos previstos',value:planned,help:'Valores cadastrados e ainda não recebidos'},
      {label:'Ganhos recebidos',value:received,help:'Valores confirmados como recebidos'},
      {label:'Total de ganhos do mês',value:total,help:'Previstos + recebidos no mês selecionado'}
    ])}<div class="rf-view-chart-grid">${chartCard('Evolução diária dos ganhos','rfIncomeDailyChart','Ganhos previstos e recebidos por dia')}${chartCard('Ganhos por categoria','rfIncomeCategoryChart','Distribuição por tipo de ganho, como salário ou diária')}</div>${renderEntriesTable(summary,'income')}`;
    lineChart('rfIncomeDailyChart', summary.data || [], [
      {label:'Ganho previsto',data:(summary.data||[]).map(d=>Number(d.futureIncome||0)),borderColor:'#4f82a8',backgroundColor:'#4f82a8'},
      {label:'Ganho recebido',data:(summary.data||[]).map(d=>Number(d.paidIncome||0)),borderColor:'#4caf8c',backgroundColor:'#4caf8c'}
    ]);
    pieChart('rfIncomeCategoryChart', monthEntries, 'income');
  }
  function renderGoals(summary) {
    const rows = summary.data || [];
    const plan = summary.goalPlan || {};
    const dailyGoal = plan.displayDailyGoal ?? summary.totals?.dailyGoal;
    body.innerHTML = `<section class="rf-goal-hero"><div><span class="rf-finance-view-eyebrow">META DIÁRIA DO MÊS</span><strong>${dailyGoal == null ? (plan.status==='needs_setup'?'Configure sua meta':'Revisar planejamento') : fmt(dailyGoal)}</strong><p>${Number(plan.availableWorkingDays ?? summary.totals?.availableWorkingDays ?? 0)} dias disponíveis · ${esc(plan.status==='ready'?'Planejamento atualizado':(plan.status||'consulte a configuração da meta'))}</p></div><span class="rf-goal-hero-icon" aria-hidden="true">◎</span></section>
      <section class="rf-view-list-card"><div class="rf-view-list-heading"><div><h2>Metas e resultados diários</h2><p>O mês completo é recalculado quando você cadastra, edita ou confirma um lançamento.</p></div><span class="rf-view-period-badge">${esc(summary.month)}</span></div><div class="rf-view-table-scroll"><table class="rf-view-table"><thead><tr><th>Data</th><th>Meta do dia</th><th>Despesa prevista</th><th>Despesa paga</th><th>Ganho previsto</th><th>Ganho recebido</th><th>Dia</th></tr></thead><tbody>${rows.map(d=>`<tr><td>${fmtDate(d.date)}</td><td class="rf-view-money">${d.dailyGoal==null?'—':fmt(d.dailyGoal)}</td><td class="rf-view-money">${fmt(d.futureExpense)}</td><td class="rf-view-money">${fmt(d.paidExpense)}</td><td class="rf-view-money">${fmt(d.futureIncome)}</td><td class="rf-view-money">${fmt(d.paidIncome)}</td><td>${d.isRestDay?'Descanso':d.isWeekend?'Fim de semana':'Disponível'}</td></tr>`).join('')||'<tr><td colspan="7">Sem dados para este mês.</td></tr>'}</tbody></table></div></section>`;
    // A aba Metas permanece focada na meta diária e na tabela do mês.
    // A configuração completa continua disponível no planejamento financeiro.
  }
  function renderReports(summary) {
    body.innerHTML = `<div class="rf-view-chart-grid rf-view-report-charts">${chartCard('Evolução financeira diária','rfOverallDailyChart','Ganhos e despesas previstos e confirmados')}${chartCard('Despesas por categoria','rfReportExpensePie','Distribuição das despesas previstas no mês')}${chartCard('Receitas por categoria','rfReportIncomePie','Distribuição dos ganhos por tipo')}</div><p class="rf-view-report-note">O relatório geral reúne planejamento financeiro, movimentação diária, despesas, receitas, metas e resumo de casa.</p>`;
    const data = summary.data || [];
    lineChart('rfOverallDailyChart', data, [
      {label:'Ganho previsto',data:data.map(d=>Number(d.futureIncome||0)),borderColor:'#4f82a8',backgroundColor:'#4f82a8'},
      {label:'Ganho recebido',data:data.map(d=>Number(d.paidIncome||0)),borderColor:'#4caf8c',backgroundColor:'#4caf8c'},
      {label:'Despesa prevista',data:data.map(d=>Number(d.futureExpense||0)),borderColor:'#e7b936',backgroundColor:'#e7b936'},
      {label:'Despesa paga',data:data.map(d=>Number(d.paidExpense||0)),borderColor:'#d66b52',backgroundColor:'#d66b52'}
    ]);
    const entries = (summary.entries || []).filter(e=>inMonthlyActivity(e,summary.month));
    pieChart('rfReportExpensePie', entries, 'expense');
    pieChart('rfReportIncomePie', entries, 'income');
  }
  function attachMetaPanel() {
    const panel = document.getElementById('metaMensalPanel');
    const host = document.getElementById('rfGoalSettingsHost');
    if (!panel || !host || panel.parentElement === host) return;
    const overview = panel.closest('.ux-meta-disclosure');
    if (overview && overview !== host) overview.remove();
    host.append(panel);
  }
  function render(summary) {
    currentSummary = summary;
    currentMonth = summary.month || currentMonth;
    destroyCharts();
    root.querySelector('#rfFinanceViewIntro').textContent = `${new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(`${currentMonth}-01T12:00:00`))} · Os valores são atualizados com os lançamentos do seu planejamento.`;
    if (view === 'despesas') renderExpense(summary);
    if (view === 'receitas') renderIncome(summary);
    if (view === 'metas') renderGoals(summary);
    if (view === 'relatorios') renderReports(summary);
    if (view === 'metas') attachMetaPanel();
    document.dispatchEvent(new CustomEvent('rota-finance-view-ready', { detail: { view, month: currentMonth } }));
  }
  async function refresh(month) {
    const token = ++drawToken;
    currentMonth = month || document.getElementById('monthPicker')?.value || currentMonth;
    body.innerHTML = '<p class="rf-view-loading" role="status">Atualizando os dados do mês…</p>';
    try {
      const response = await fetch(`/api/finance/summary?month=${encodeURIComponent(currentMonth)}`, { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os dados desta aba.');
      if (token !== drawToken) return;
      render(data);
    } catch (error) {
      if (token !== drawToken) return;
      body.innerHTML = `<p class="rf-view-error" role="alert">${esc(error.message || 'Não foi possível carregar os dados.')}</p>`;
    }
  }
  function download(month, report) {
    const m = month || currentMonth || document.getElementById('monthPicker')?.value || new Date().toISOString().slice(0,7);
    location.href = `${report === 'goals' ? '/api/finance/goal-report' : '/api/finance/report'}?month=${encodeURIComponent(m)}`;
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-rf-action]');
    if (button) {
      const action = button.dataset.rfAction;
      if (action === 'new-expense') document.getElementById('addExpense')?.click();
      if (action === 'new-income') document.getElementById('addIncome')?.click();
      if (action === 'download-goals') download(currentMonth, 'goals');
      if (action === 'download-general') download(currentMonth, 'general');
      return;
    }
    const entryButton = event.target.closest('[data-rf-entry-action]');
    if (entryButton) {
      const source = document.querySelector(`#entriesList [data-action="${CSS.escape(entryButton.dataset.rfEntryAction)}"][data-id="${Number(entryButton.dataset.id)}"]`);
      if (source) source.click();
      else window.alert("Este lançamento foi atualizado. Recarregue a página e tente novamente.");
    }
  });
  root.addEventListener('input', event => {
    if (!event.target.matches('input[type="search"]')) return;
    applyEntryFilters();
  });
  root.addEventListener('change', event => {
    if (event.target.matches('select[id^="rfEntriesStatus-"]')) applyEntryFilters();
  });
  function applyEntryFilters() {
    for (const type of ['expense','income']) {
      const search = root.querySelector(`#rfEntriesSearch-${type}`)?.value.trim().toLowerCase() || '';
      const status = root.querySelector(`#rfEntriesStatus-${type}`)?.value || 'all';
      root.querySelectorAll(`#rfEntriesRows-${type} tr[data-id]`).forEach(row => {
        const matchName = !search || row.dataset.name.includes(search);
        const matchStatus = status === 'all' || row.dataset.paid === status;
        row.hidden = !(matchName && matchStatus);
      });
    }
  }
  document.addEventListener('rota-summary-loaded', event => { if (event.detail?.summary) { ++drawToken; currentMonth = event.detail.month; render(event.detail.summary); } else refresh(event.detail?.month); });
  document.addEventListener('rota-goal', () => window.setTimeout(attachMetaPanel, 0));
  document.addEventListener('rota-content-error', () => { body.innerHTML = '<p class="rf-view-error">Não foi possível carregar os dados. Verifique sua conexão e tente novamente.</p>'; });
  const sourceObserver = new MutationObserver(attachMetaPanel);
  sourceObserver.observe(container, { childList: true, subtree: false });
})();
