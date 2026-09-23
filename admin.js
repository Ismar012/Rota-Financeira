const state = { month: '', clients: [], selectedClientId: null, chart: null };

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
  if (clientsFeedback) clientsFeedback.textContent = 'Carregando clientes...';
  try {
    const data = await api(`/api/admin/clients?month=${encodeURIComponent(state.month)}`);
    state.clients = data.clients || [];
    renderAggregate(data.aggregate || {});
    renderClients();
    if (clientsFeedback) clientsFeedback.textContent = state.clients.length ? '' : 'Nenhum cliente cadastrado.';
  } catch (error) {
    if (error.status === 401 || error.status === 403) return checkAdmin();
    if (clientsFeedback) clientsFeedback.textContent = error.message;
  }
}

function renderAggregate(totals) {
  setText('clientCount', state.clients.length);
  setText('aggregateIncome', fmt(totals.income));
  setText('aggregateExpense', fmt(totals.expense));
  setText('aggregateCashflow', fmt(totals.cashflow));
  setClass('aggregateCashflow', cashClass(totals.cashflow));
}

function renderClients() {
  const search = $('clientSearch');
  const query = search ? search.value.trim().toLowerCase() : '';
  const rows = state.clients.filter(c => `${c.name} ${c.email}`.toLowerCase().includes(query));
  const clientsBody = $('clientsBody');
  if (!clientsBody) return;
  clientsBody.innerHTML = rows.map(client => `
    <tr data-client-id="${client.id}">
      <td><span class="client-name">${esc(client.name)}</span><span class="client-email">${esc(client.email)}</span></td>
      <td class="money">${fmt(client.totals.income)}</td>
      <td class="money">${fmt(client.totals.expense)}</td>
      <td class="money ${cashClass(client.totals.cashflow)}">${fmt(client.totals.cashflow)}</td>
      <td>${client.totals.workingDays}</td>
      <td>${client.totals.restDays}</td>
      <td class="row-arrow">→</td>
    </tr>`).join('');
  clientsBody.querySelectorAll('tr').forEach(row => row.addEventListener('click', () => openClient(Number(row.dataset.clientId))));
}

async function openClient(id) {
  state.selectedClientId = id;
  const clientDetail = $('clientDetail');
  if (clientDetail) {
    clientDetail.classList.remove('hidden');
    clientDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  try {
    const data = await api(`/api/admin/clients/${id}/summary?month=${encodeURIComponent(state.month)}`);
    renderDetail(data.client, data.summary);
  } catch (error) {
    setText('detailName', error.message);
  }
}

function renderDetail(client, summary) {
  const t = summary.totals || {};
  setText('detailName', client?.name || 'Cliente');
  setText('detailEmail', client?.email || '');
  setText('detailIncome', fmt(t.income));
  setText('detailExpense', fmt(t.expense));
  setText('detailCashflow', fmt(t.cashflow));
  setClass('detailCashflow', cashClass(t.cashflow));
  setText('detailGoal', fmt(t.totalPlannedGoal));
  setText('detailWorking', t.workingDays ?? 0);
  setText('detailRest', t.restDays ?? 0);
  setText('detailAvailable', t.availableWorkingDays ?? 0);
  setText('detailPending', fmt(t.pendingExpense));
  setText('detailTotalIncome', fmt(t.totalIncomeAllTime));
  setText('detailTotalExpense', fmt(t.totalExpenseAllTime));
  setText('detailMonthLabel', monthLabel(summary.month));
  renderChart(summary.data);
  renderDailyTable(summary.data);
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
function renderDailyTable(data) {
  const dailyBody = $('dailyBody');
  if (!dailyBody) return;
  const rows = Array.isArray(data) ? data : [];
  dailyBody.innerHTML = rows.map((d, index) => {
    const date = new Date(`${d.date}T00:00:00`);
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', '');
    const isPast = d.date < new Date().toISOString().slice(0,10);
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
      <td class="money gold">${fmt(goal)}</td>
      <td class="money">${fmt(d.expense)}</td>
      <td class="money">${fmt(d.paidIncome || d.income)}</td>
      <td class="money">${fmt(d.paidExpense)}</td>
      <td class="money ${cashClass(realizedFlow || d.cashflow)}">${fmt(realizedFlow || d.cashflow)}</td>
    </tr>`;
  }).join('');
}

function setMonth(month) {
  state.month = month;
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
if ($('closeDetail')) $('closeDetail').addEventListener('click', () => $('clientDetail')?.classList.add('hidden'));
if ($('exportReport')) $('exportReport').addEventListener('click', () => {
  if (!state.selectedClientId) return;
  window.location.href = `/api/admin/clients/${state.selectedClientId}/report?month=${encodeURIComponent(state.month)}`;
});
if ($('exportChangeHistory')) $('exportChangeHistory').addEventListener('click', () => {
  if (!state.selectedClientId) return;
  window.location.href = `/api/admin/clients/${state.selectedClientId}/change-history`;
});
if ($('logout')) $('logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); window.location.href = '/login.html'; });

(async function init() {
  if (!(await checkAdmin())) return;
  setMonth(isoMonth());
})();
