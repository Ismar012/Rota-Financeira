const state = { month: '', clients: [], selectedClientId: null, chart: null, categoryChart: null, clientsLoading: false, clientsError: '', detailRequest: 0, autoOpenedClientId: null };

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

function $(id) { return document.getElementById(id); }
function fmt(value) { return money.format(Number(value) || 0); }
function setText(id, value) { const el = $(id); if (el) el.textContent = value; return el; }
function setClass(id, value) { const el = $(id); if (el) el.className = value; return el; }
function isoMonth(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
function shiftMonth(month, delta) { const [y,m] = month.split('-').map(Number); const d = new Date(y, m-1+delta, 1); return isoMonth(d); }
function monthLabel(month) { const [y,m] = month.split('-').map(Number); return monthFmt.format(new Date(y,m-1,1)); }
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function cashClass(value) { return Number(value) >= 0 ? 'positive' : 'negative'; }

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Não foi possível concluir a operação.'), { status: res.status });
  return data;
}

async function checkAdmin() {
  try {
    const data = await api('/api/auth/me');
    if (!data.authenticated || data.user?.role !== 'admin') {
      window.location.href = '/login.html';
      return false;
    }
    const adminName = $('adminName');
    if (adminName) adminName.textContent = data.user.name || 'Administrador';
    return true;
  } catch (error) {
    window.location.href = '/login.html';
    return false;
  }
}

async function loadClients() {
  const clientsFeedback = $('clientsFeedback');
  state.clientsLoading = true;
  state.clientsError = '';
  if (clientsFeedback) clientsFeedback.textContent = 'Carregando clientes...';
  try {
    const data = await api(`/api/admin/clients?month=${encodeURIComponent(state.month)}`);
    state.clients = data.clients || [];
    renderAggregate(data.aggregate || {});
    state.clientsLoading = false;
    renderClients();
    const requestedClientId = new URLSearchParams(location.search).get('client');
    if (requestedClientId && state.autoOpenedClientId !== requestedClientId && state.clients.some(client => String(client.id) === requestedClientId)) {
      state.autoOpenedClientId = requestedClientId;
      window.setTimeout(() => openClient(Number(requestedClientId)), 80);
    }
  } catch (error) {
    state.clientsLoading = false;
    state.clientsError = error.message;
    if (error.status === 401 || error.status === 403) return checkAdmin();
    if (clientsFeedback) clientsFeedback.textContent = error.message;
  }
}

function renderAggregate(totals) {
  setText('clientCount', totals.total ?? state.clients.length);
  setText('activeCount', totals.active ?? 0);
  setText('payingCount', totals.pagantes ?? 0);
  setText('freeTrialCount', totals.freeTrial ?? 0);
}
function renderClients() {
  const query = $('clientSearch')?.value.trim().toLowerCase() || '';
  const rows = state.clients.filter(c => `${c.name} ${c.email}`.toLowerCase().includes(query));
  const feedback = $('clientsFeedback');
  if (feedback) feedback.textContent = state.clientsLoading ? 'Carregando clientes...'
    : state.clientsError || (rows.length ? '' : state.clients.length
      ? 'Nenhum cliente encontrado para esta busca.' : 'Nenhum cliente cadastrado.');
  const body=$('clientsBody');if(!body)return;
  const labels={free:'Free',trial:'Trial',pagante:'Pagante',inadimplente:'Inadimplente',cancelado:'Cancelado'};
  const actions = [
    ['Analisar cliente','analyze'],
    ['Exportar relatório do cliente','report'],
    ['Gerenciar produtos','products'],
    ['Histórico de alterações','history']
  ].sort((a,b)=>a[0].localeCompare(b[0],'pt-BR'));
  body.innerHTML=rows.map(c=>{const status=c.status||{};const id=Number(c.id);return `<tr data-client-id="${id}">
  <td><span class="client-name">${esc(c.name)}</span><span class="client-email">${esc(c.email)}</span></td>
  <td><span class="status-badge status-${esc(status.status)}">${esc(labels[status.status]||status.status)}</span><br><select class="status-select" data-status-id="${id}" aria-label="Status de ${esc(c.name)}">${[['auto','Automático'],['pagante','Pagante'],['inadimplente','Inadimplente'],['cancelado','Cancelado']].map(([v,l])=>`<option value="${v}" ${v===(status.billingStatus||'auto')?'selected':''}>${l}</option>`).join('')}</select></td>
  <td><span class="admin-access-status ${c.active?'is-active':''}">${c.active?'Ativo':'Sem acesso recente'}</span></td><td>${status.manual?'Manual':`${Number(status.daysRemaining)||0} dias`}</td><td>${esc(String(c.created_at||'').slice(0,10))}</td><td>${esc(String(c.last_login_at||'—').slice(0,16))}</td>
  <td><div class="client-row-actions"><button type="button" class="open-client" aria-label="Analisar ${esc(c.name)}">Analisar <span aria-hidden="true">→</span></button><div class="row-kebab"><button type="button" class="row-kebab-toggle" aria-label="Mais ações para ${esc(c.name)}" aria-haspopup="true" aria-expanded="false">⋮</button><div class="row-kebab-menu hidden" role="menu">${actions.map(([label,action])=>`<button type="button" role="menuitem" data-client-action="${action}" data-client-id="${id}">${label}</button>`).join('')}</div></div></div></td></tr>`;}).join('');
  body.querySelectorAll('tr').forEach(row=>row.onclick=e=>{if(e.target.closest('select,.client-row-actions'))return;openClient(Number(row.dataset.clientId));});
  body.querySelectorAll('.open-client').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();openClient(Number(button.closest('tr').dataset.clientId));}));
  body.querySelectorAll('.row-kebab-toggle').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();const menu=button.parentElement.querySelector('.row-kebab-menu');const opening=menu.classList.contains('hidden');body.querySelectorAll('.row-kebab-menu').forEach(m=>m.classList.add('hidden'));body.querySelectorAll('.row-kebab-toggle').forEach(b=>b.setAttribute('aria-expanded','false'));menu.classList.toggle('hidden',!opening);button.setAttribute('aria-expanded',String(opening));}));
  body.querySelectorAll('[data-client-action]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();const id=Number(button.dataset.clientId||button.closest('tr')?.dataset.clientId);const action=button.dataset.clientAction;if(!id)return;body.querySelectorAll('.row-kebab-menu').forEach(m=>m.classList.add('hidden'));body.querySelectorAll('.row-kebab-toggle').forEach(b=>b.setAttribute('aria-expanded','false'));if(action==='analyze')openClient(id);else if(action==='report')window.location.href=`/api/admin/clients/${id}/report?month=${encodeURIComponent(state.month)}`;else if(action==='history')window.location.href=`/api/admin/clients/${id}/change-history`;else if(action==='products')window.location.href=`/produtos-admin.html?client=${encodeURIComponent(id)}`;}));
  body.querySelectorAll('select').forEach(select=>select.onchange=async()=>{select.disabled=true;try{await api(`/api/admin/clients/${select.dataset.statusId}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:select.value})});await loadClients();}catch(e){setText('clientsFeedback',e.message);await loadClients();}finally{select.disabled=false;}});
}

async function openClient(id) {
  state.selectedClientId = id;
  const request = ++state.detailRequest;
  document.body.classList.add('viewing-client');
  document.dispatchEvent(new CustomEvent('rota-client-loading'));
  setText('detailName', 'Carregando cliente…');
  setText('detailEmail', '');
  $('clientDetail')?.setAttribute('aria-busy', 'true');
  const clientDetail = $('clientDetail');
  if (clientDetail) {
    clientDetail.classList.remove('hidden');
    clientDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  try {
    const data = await api(`/api/admin/clients/${id}/summary?month=${encodeURIComponent(state.month)}`);
    if (request !== state.detailRequest) return;
    renderDetail(data.client, data.summary);
    $('clientDetail')?.setAttribute('aria-busy', 'false');
  } catch (error) {
    if (request !== state.detailRequest) return;
    setText('detailName', error.message);
    $('clientDetail')?.setAttribute('aria-busy', 'false');
    document.dispatchEvent(new CustomEvent('rota-client-error'));
  }
}

function renderDetail(client, summary) {
  const t = summary.totals || {};
  setText('detailName', client?.name || 'Cliente');
  setText('detailEmail', client?.email || '');
  setText('detailStatus', client?.status?.status || '');
  setText('detailIncome', fmt(t.realizedIncome ?? t.income));
  setText('detailExpense', fmt(t.expense));
  const currentCash = summary.goalPlan?.cashBalance ?? t.goalCashBalance;
  setText('detailCashflow', currentCash == null ? 'Revisar planejamento' : fmt(currentCash));
  setClass('detailCashflow', currentCash == null ? '' : cashClass(currentCash));
  const cashCard = $('detailCashflow')?.closest('article');
  if (cashCard?.querySelector('span')) cashCard.querySelector('span').textContent = 'Saldo do planejamento';
  if (cashCard?.querySelector('small')) cashCard.querySelector('small').textContent = 'saldo inicial + recebimentos − pagamentos';
  setText('detailGoal', fmt(t.totalPlannedGoal));
  const goalCard = $('detailGoal')?.closest('article');
  if (goalCard?.querySelector('span')) goalCard.querySelector('span').textContent = 'Falta produzir no mês';
  if (goalCard?.querySelector('small')) goalCard.querySelector('small').textContent = 'obrigações da janela mensal menos caixa';
  setText('detailWorking', t.workingDays ?? 0);
  setText('detailRest', t.restDays ?? 0);
  setText('detailAvailable', t.availableWorkingDays ?? 0);
  setText('detailPending', fmt(t.pendingExpense));
  setText('detailTotalIncome', fmt(t.totalIncomeAllTime));
  setText('detailTotalExpense', fmt(t.totalExpenseAllTime));
  setText('detailMonthLabel', monthLabel(summary.month));
  document.dispatchEvent(new CustomEvent('rota-consultation', {detail:{client,summary}}));
  renderChart(summary.data);
  renderCategoryChart(summary.entries || [], summary.month);
  renderDailyTable(summary.data);
  window.rotaGoalContext = {plan:summary.goalPlan, admin:true, clientId:state.selectedClientId};
  document.dispatchEvent(new CustomEvent('rota-goal', {detail:window.rotaGoalContext}));
}

function renderChart(data) {
  const canvas = $('clientChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const rows = Array.isArray(data) ? data : [];
  const labels = rows.map(d => dateFmt.format(new Date(`${d.date}T00:00:00`)));
  const futureIncome = rows.map(d => Number(d.futureIncome) || 0);
  const futureExpense = rows.map(d => Number(d.futureExpense) || 0);
  const paidIncome = rows.map(d => Number(d.paidIncome) || 0);
  const paidExpense = rows.map(d => Number(d.paidExpense) || 0);

  if (state.chart) state.chart.destroy();

  state.chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Ganho previsto', data: futureIncome, borderColor: '#2f80ed', backgroundColor: 'rgba(47,128,237,.08)', borderWidth: 2, tension: .3, pointRadius: 2, spanGaps: true },
        { label: 'Despesa prevista', data: futureExpense, borderColor: '#ff8a00', backgroundColor: 'rgba(255,138,0,.08)', borderWidth: 2, tension: .3, pointRadius: 2, spanGaps: true },
        { label: 'Ganho realizado', data: paidIncome, borderColor: '#35c759', backgroundColor: 'rgba(53,199,89,.08)', borderWidth: 2, tension: .3, pointRadius: 2, spanGaps: true },
        { label: 'Gasto realizado', data: paidExpense, borderColor: '#ff1f1f', backgroundColor: 'rgba(255,31,31,.08)', borderWidth: 2, tension: .3, pointRadius: 2, spanGaps: true }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#aaa' } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } }
      },
      scales: {
        x: { ticks: { color: '#777', maxRotation: 0, autoSkip: true }, grid: { color: 'rgba(255,255,255,.04)' } },
        y: { ticks: { color: '#777', callback: value => fmt(value) }, grid: { color: 'rgba(255,255,255,.05)' } }
      }
    }
  });
}
function renderCategoryChart(entries, month) {
  const canvas = $('clientCategoryChart');
  const body = $('clientCategoryTable');
  const totalLabel = $('clientCategoryTotal');
  setText('detailCategoryMonth', monthLabel(month));
  const paid = (Array.isArray(entries) ? entries : []).filter(entry => {
    if (entry.type !== 'expense' || Number(entry.paid) !== 1) return false;
    const actualDate = String(entry.paid_date || entry.paid_at || entry.due_date || '').slice(0, 10);
    return actualDate.slice(0, 7) === month;
  });
  const byCategory = new Map();
  for (const entry of paid) {
    const category = String(entry.financial_category || '').trim() || 'Outros';
    byCategory.set(category, (byCategory.get(category) || 0) + (Number(entry.amount) || 0));
  }
  const categories = [...byCategory.entries()].map(([label, value]) => ({label, value})).sort((a,b)=>b.value-a.value || a.label.localeCompare(b.label,'pt-BR'));
  const total = categories.reduce((sum, item) => sum + item.value, 0);
  if (totalLabel) totalLabel.textContent = `Total pago no mês: ${fmt(total)}`;
  if (body) {
    body.innerHTML = categories.length ? categories.map(item => `<tr><td>${esc(item.label)}</td><td>${fmt(item.value)}</td><td>${total ? (item.value / total * 100).toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1})+'%' : '0%'}</td></tr>`).join('') : '<tr><td colspan="3" class="category-empty">Nenhuma despesa paga neste mês.</td></tr>';
  }
  if (!canvas || typeof Chart === 'undefined') return;
  if (state.categoryChart) { state.categoryChart.destroy(); state.categoryChart = null; }
  const palette = ['#e24b4b','#35c78a','#2f91e8','#e7b83f','#9a7be7','#e68a48','#54bcc7','#b0bdce','#dc6ba1','#8abf52'];
  const chartLabels = categories.length ? categories.map(item=>item.label) : ['Sem despesas pagas'];
  const values = categories.length ? categories.map(item=>item.value) : [1];
  state.categoryChart = new Chart(canvas, {
    type: 'doughnut',
    data: { labels: chartLabels, datasets: [{ data: values, backgroundColor: categories.length ? categories.map((_,i)=>palette[i%palette.length]) : ['#263542'], borderColor: '#111923', borderWidth: 2, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => categories.length ? `${ctx.label}: ${fmt(ctx.parsed)} (${total ? (ctx.parsed/total*100).toLocaleString('pt-BR',{maximumFractionDigits:1}) : '0'}%)` : 'Nenhuma despesa paga' } } } }
  });
}

function renderDailyTable(data) {
  const dailyBody = $('dailyBody');
  if (!dailyBody) return;
  const rows = Array.isArray(data) ? data : [];
  dailyBody.innerHTML = rows.map((d, index) => {
    const date = new Date(`${d.date}T00:00:00`);
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', '');
    const isPast = d.date < new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const status = d.isRestDay ? '<span class="status-pill rest">Descanso</span>' : (d.isWeekend ? '<span class="status-pill weekend">Disponível</span>' : '<span class="status-pill work">Trabalho</span>');
    const work = d.isRestDay ? '<span class="rest-mark">—</span>' : '<span class="work-check">✓</span>';
    const goal = d.dailyGoal;
    const realizedFlow = d.realizedCashflow;
    const rowClass = `${d.isRestDay ? 'rest-row' : ''} ${isPast ? 'past-row' : ''}`;
    return `<tr class="${rowClass}">
      <td>${dateFmt.format(date)}</td>
      <td>${esc(weekday)}</td>
      <td>${status}</td>
      <td>${work}</td>
      <td class="money gold">${goal == null ? 'Sem registro' : `<button type="button" class="meta-day-button" data-goal-date="${d.date}">${fmt(goal)}</button>`}${d.goalRevised != null ? '<small>Revisão disponível</small>' : ''}</td>
      <td class="money">${fmt(d.expense)}</td>
      <td class="money">${fmt(d.paidIncome ?? d.income)}</td>
      <td class="money">${fmt(d.paidExpense)}</td>
      <td class="money ${cashClass(realizedFlow ?? d.cashflow)}">${fmt(realizedFlow ?? d.cashflow)}</td>
    </tr>`;
  }).join('');
}

function setMonth(month) {
  state.month = month;
  state.detailRequest++;
  document.body.classList.remove('viewing-client','presentation-mode');
  $('presentationToggle')?.setAttribute('aria-pressed','false');
  if ($('presentationToggle')) $('presentationToggle').textContent='Modo apresentação';
  const monthPicker = $('monthPicker');
  if (monthPicker) monthPicker.value = month;
  const clientDetail = $('clientDetail');
  if (clientDetail) clientDetail.classList.add('hidden');
  loadClients();
}

if ($('prevMonth')) $('prevMonth').addEventListener('click', () => setMonth(shiftMonth(state.month, -1)));
if ($('nextMonth')) $('nextMonth').addEventListener('click', () => setMonth(shiftMonth(state.month, 1)));
if ($('monthPicker')) $('monthPicker').addEventListener('change', e => e.target.value && setMonth(e.target.value));
if ($('clientSearch')) $('clientSearch').addEventListener('input', renderClients);

if ($('adminOverviewMoreToggle')) $('adminOverviewMoreToggle').addEventListener('click', () => {
  const menu = $('adminOverviewMoreMenu'); if (!menu) return;
  const opening = menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !opening);
  $('adminOverviewMoreToggle').setAttribute('aria-expanded', String(opening));
});

document.addEventListener('click', event => { if (!event.target.closest('.row-kebab')) { document.querySelectorAll('.row-kebab-menu').forEach(menu=>menu.classList.add('hidden')); document.querySelectorAll('.row-kebab-toggle').forEach(button=>button.setAttribute('aria-expanded','false')); } if (!event.target.closest('.admin-global-more')) { $('adminOverviewMoreMenu')?.classList.add('hidden'); $('adminOverviewMoreToggle')?.setAttribute('aria-expanded','false'); } });
if ($('closeDetail')) $('closeDetail').addEventListener('click', () => {state.detailRequest++;document.body.classList.remove('viewing-client','presentation-mode');$('presentationToggle')?.setAttribute('aria-pressed','false');$('presentationToggle').textContent='Modo apresentação';$('clientDetail')?.classList.add('hidden');$('clientSearch')?.focus();});
if ($('exportReport')) $('exportReport').addEventListener('click', () => {
  if (!state.selectedClientId) return;
  window.location.href = `/api/admin/clients/${state.selectedClientId}/report?month=${encodeURIComponent(state.month)}`;
});
if ($('exportChangeHistory')) $('exportChangeHistory').addEventListener('click', () => {
  if (!state.selectedClientId) return;
  window.location.href = `/api/admin/clients/${state.selectedClientId}/change-history`;
});
if ($('adminMoreToggle')) $('adminMoreToggle').addEventListener('click', () => {
  const menu = $('adminMoreMenu');
  if (!menu) return;
  const opening = menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !opening);
  $('adminMoreToggle').setAttribute('aria-expanded', String(opening));
});
document.addEventListener('click', event => {
  if (!event.target.closest('.admin-more-actions')) {
    $('adminMoreMenu')?.classList.add('hidden');
    $('adminMoreToggle')?.setAttribute('aria-expanded', 'false');
  }
});
if ($('clearClientEntries')) $('clearClientEntries').addEventListener('click', async () => {
  const clientId = state.selectedClientId;
  if (!clientId) return;
  const client = state.clients.find(item => Number(item.id) === Number(clientId));
  const name = client?.name || $('detailName')?.textContent || 'este cliente';
  const confirmed = window.confirm(`ATENÇÃO: todos os lançamentos financeiros de ${name} serão apagados permanentemente, incluindo ganhos, despesas, parcelas, recorrências e pendências. Esta ação não pode ser desfeita.

A conta, os dados cadastrais e os dias de descanso serão preservados. Deseja continuar?`);
  if (!confirmed) return;
  const secondConfirmation = window.confirm(`Confirma novamente a exclusão de TODOS os lançamentos financeiros de ${name}?`);
  if (!secondConfirmation) return;
  const button = $('clearClientEntries');
  button.disabled = true;
  try {
    const result = await api(`/api/admin/clients/${clientId}/entries`, { method: 'DELETE' });
    window.alert(result.message || 'Lançamentos financeiros removidos.');
    $('adminMoreMenu')?.classList.add('hidden');
    $('adminMoreToggle')?.setAttribute('aria-expanded', 'false');
    await openClient(clientId);
    await loadClients();
  } catch (error) {
    window.alert(error.message || 'Não foi possível limpar os lançamentos.');
  } finally {
    button.disabled = false;
  }
});
if ($('logout')) $('logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); window.location.href = '/login.html'; });

(async function init() {
  if (!(await checkAdmin())) return;
  setMonth(isoMonth());
})();

document.addEventListener('rota-goal-reload', e => {
  if (e.detail?.summary) renderDetail(e.detail.client, e.detail.summary);
});
