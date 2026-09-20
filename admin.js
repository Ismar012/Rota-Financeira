const state = { month: '', clients: [], selectedClientId: null, chart: null };

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

function $(id) { return document.getElementById(id); }
function fmt(value) { return money.format(Number(value) || 0); }
function isoMonth(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
function shiftMonth(month, delta) { const [y,m] = month.split('-').map(Number); const d = new Date(y, m-1+delta, 1); return isoMonth(d); }
function monthLabel(month) { const [y,m] = month.split('-').map(Number); return monthFmt.format(new Date(y,m-1,1)); }
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function cashClass(value) { return Number(value) >= 0 ? 'positive' : 'negative'; }
function statusLabel(status) { return ({free:'Free', trial:'Trial', pagante:'Pagante', inadimplente:'Inadimplente', cancelado:'Cancelado', admin:'Administrador'})[status] || status; }
function statusClass(status) { return `status-${status}`; }

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Não foi possível concluir a operação.'), { status: res.status, data });
  return data;
}

async function checkAdmin() {
  try {
    const data = await api('/api/auth/me');
    if (!data.authenticated || data.user?.role !== 'admin') {
      window.location.href = '/login.html';
      return false;
    }
    $('adminName').textContent = data.user.name || 'Administrador';
    return true;
  } catch (error) {
    window.location.href = '/login.html';
    return false;
  }
}

async function loadClients() {
  $('clientsFeedback').textContent = 'Carregando clientes...';
  try {
    const data = await api(`/api/admin/clients?month=${encodeURIComponent(state.month)}`);
    state.clients = data.clients || [];
    renderAggregate(data.aggregate || {});
    renderClients();
    $('clientsFeedback').textContent = state.clients.length ? '' : 'Nenhum cliente cadastrado.';
  } catch (error) {
    if (error.status === 401 || error.status === 403) return checkAdmin();
    $('clientsFeedback').textContent = error.message;
  }
}

function renderAggregate(aggregate) {
  $('clientCount').textContent = aggregate.total ?? state.clients.length;
  $('activeCount').textContent = aggregate.active ?? 0;
  $('payingCount').textContent = aggregate.pagantes ?? 0;
  $('freeTrialCount').textContent = aggregate.freeTrial ?? 0;
}

function statusOptions(client) {
  const manual = client.status?.manual ? client.status.status : 'auto';
  return `
    <select class="status-select ${statusClass(client.status.status)}" data-status-id="${client.id}" aria-label="Status de ${esc(client.name)}">
      <option value="auto" ${manual === 'auto' ? 'selected' : ''}>Automático · ${statusLabel(client.status.status)}</option>
      <option value="pagante" ${manual === 'pagante' ? 'selected' : ''}>Pagante</option>
      <option value="inadimplente" ${manual === 'inadimplente' ? 'selected' : ''}>Inadimplente</option>
    </select>`;
}

function renderClients() {
  const query = $('clientSearch').value.trim().toLowerCase();
  const rows = state.clients.filter(c => `${c.name} ${c.email}`.toLowerCase().includes(query));
  $('clientsBody').innerHTML = rows.map(client => `
    <tr data-client-id="${client.id}">
      <td class="client-cell">
        <div class="client-name-line"><span class="client-name">${esc(client.name)}</span>${statusBadge(client)}</div>
        <span class="client-email">${esc(client.email)}</span>
      </td>
      <td class="status-control-cell" data-status-cell="${client.id}">${statusOptions(client)}</td>
      <td><span class="active-dot ${client.active ? 'is-active' : ''}"></span>${client.active ? 'Ativo' : 'Inativo'}</td>
      <td>${client.status.daysRemaining > 0 && !client.status.manual ? `${client.status.daysRemaining} dia(s)` : '—'}</td>
      <td class="client-date">${formatDateTime(client.created_at)}</td>
      <td class="client-date">${formatDateTime(client.last_login_at)}</td>
      <td class="row-arrow">→</td>
    </tr>`).join('');

  $('clientsBody').querySelectorAll('tr').forEach(row => row.addEventListener('click', event => {
    if (event.target.closest('.status-select')) return;
    openClient(Number(row.dataset.clientId));
  }));

  $('clientsBody').querySelectorAll('.status-select').forEach(select => select.addEventListener('change', async event => {
    event.stopPropagation();
    const id = Number(select.dataset.statusId);
    await updateClientStatus(id, select.value);
  }));
}

function statusBadge(client) {
  const s = client.status?.status || 'free';
  return `<span class="status-badge ${statusClass(s)}">${statusLabel(s)}</span>`;
}

function formatDateTime(value) {
  if (!value) return 'Nunca';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

async function updateClientStatus(id, value) {
  const select = document.querySelector(`.status-select[data-status-id="${id}"]`);
  if (select) select.disabled = true;
  try {
    const data = await api(`/api/admin/clients/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: value })
    });
    const client = state.clients.find(c => c.id === id);
    if (client) {
      client.status = data.client.status;
      renderClients();
    }
    $('clientsFeedback').textContent = 'Status do cliente atualizado.';
    setTimeout(() => { if ($('clientsFeedback').textContent === 'Status do cliente atualizado.') $('clientsFeedback').textContent = ''; }, 2500);
  } catch (error) {
    if (select) select.value = state.clients.find(c => c.id === id)?.status?.manual ? state.clients.find(c => c.id === id).status.status : 'auto';
    $('clientsFeedback').textContent = error.message;
  } finally {
    if (select) select.disabled = false;
  }
}

async function openClient(id) {
  state.selectedClientId = id;
  $('clientDetail').classList.remove('hidden');
  $('clientDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const data = await api(`/api/admin/clients/${id}/summary?month=${encodeURIComponent(state.month)}`);
    renderDetail(data.client, data.summary);
  } catch (error) {
    $('detailName').textContent = error.message;
  }
}

function renderDetail(client, summary) {
  const t = summary.totals;
  $('detailName').textContent = client.name;
  $('detailEmail').textContent = client.email;
  $('detailStatus').innerHTML = statusBadge(client);
  $('detailMeta').textContent = client.status.manual ? 'Status definido manualmente pelo administrador.' : `Status automático · ${client.status.daysRemaining} dia(s) restante(s) até completar 30 dias.`;
  $('detailIncome').textContent = fmt(t.income);
  $('detailExpense').textContent = fmt(t.expense);
  $('detailCashflow').textContent = fmt(t.cashflow);
  $('detailCashflow').className = cashClass(t.cashflow);
  $('detailGoal').textContent = fmt(t.totalPlannedGoal);
  $('detailWorking').textContent = t.workingDays;
  $('detailRest').textContent = t.restDays;
  $('detailAvailable').textContent = t.availableWorkingDays;
  $('detailPending').textContent = fmt(t.pendingExpense);
  $('detailMonthLabel').textContent = monthLabel(summary.month);
  renderChart(summary.data);
  renderDailyTable(summary.data);
}

function renderChart(data) {
  const labels = data.map(d => dateFmt.format(new Date(`${d.date}T00:00:00`)));
  const goal = data.map(d => d.dailyGoal);
  const cashflow = data.map(d => d.cashflow);
  if (state.chart) state.chart.destroy();
  state.chart = new Chart($('clientChart'), {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Meta prevista', data: goal, borderWidth: 2, tension: .3, pointRadius: 2 },
      { label: 'Fluxo de caixa previsto', data: cashflow, borderWidth: 2, tension: .3, pointRadius: 2 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#aaa' } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } } },
      scales: {
        x: { ticks: { color: '#777', maxRotation: 0, autoSkip: true }, grid: { color: 'rgba(255,255,255,.04)' } },
        y: { ticks: { color: '#777', callback: value => fmt(value) }, grid: { color: 'rgba(255,255,255,.05)' } }
      }
    }
  });
}

function renderDailyTable(data) {
  $('dailyBody').innerHTML = data.map(d => {
    const date = new Date(`${d.date}T00:00:00`);
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', '');
    const isPast = d.date < new Date().toISOString().slice(0,10);
    const status = d.isRestDay ? '<span class="status-pill rest">Descanso</span>' : (d.isWeekend ? '<span class="status-pill weekend">Disponível</span>' : '<span class="status-pill work">Trabalho</span>');
    const work = d.isRestDay ? '<span class="rest-mark">—</span>' : '<span class="work-check">✓</span>';
    const realizedFlow = d.realizedCashflow;
    const rowClass = `${d.isRestDay ? 'rest-row' : ''} ${isPast ? 'past-row' : ''}`;
    return `<tr class="${rowClass}">
      <td>${dateFmt.format(date)}</td><td>${esc(weekday)}</td><td>${status}</td><td>${work}</td>
      <td class="money gold">${fmt(d.dailyGoal)}</td><td class="money">${fmt(d.expense)}</td>
      <td class="money">${fmt(d.paidIncome || d.income)}</td><td class="money">${fmt(d.paidExpense)}</td>
      <td class="money ${cashClass(realizedFlow || d.cashflow)}">${fmt(realizedFlow || d.cashflow)}</td>
    </tr>`;
  }).join('');
}


function reportStatusLabel(client) {
  const s = client?.status?.status || 'free';
  return statusLabel(s);
}

function reportDate(value) {
  if (!value) return '—';
  const raw = String(value).slice(0, 10);
  const parts = raw.split('-');
  if (parts.length !== 3) return String(value);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function reportDateTime(value) {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return reportDate(value);
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function reportMonth(value) {
  const [y, m] = String(value).split('-').map(Number);
  if (!y || !m) return value;
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

function reportMoney(value) {
  return money.format(Number(value) || 0);
}

function buildReportHtml(report) {
  const { client, period, totals, entries, restDays, monthly } = report;
  const generated = new Date(report.generated_at || Date.now()).toLocaleString('pt-BR');
  const positive = Number(totals.cashflow) >= 0;
  const status = reportStatusLabel(client);
  const movementRows = entries.length ? entries.map(entry => {
    const income = entry.type === 'income';
    const paid = Number(entry.paid) === 1;
    return `<tr>
      <td>${esc(reportDate(entry.due_date))}</td>
      <td>${esc(reportDate(entry.created_date))}</td>
      <td>${income ? 'Entrada' : 'Saída'}</td>
      <td>${esc(entry.name)}</td>
      <td class="${income ? 'income' : 'expense'}">${income ? '+' : '-'} ${esc(reportMoney(entry.amount))}</td>
      <td>${paid ? 'Confirmado' : (income ? 'Pendente' : 'Não pago')}</td>
      <td>${esc(reportDateTime(entry.paid_at))}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="empty">Nenhuma movimentação registrada.</td></tr>';

  const monthlyRows = monthly.map(item => `<tr>
    <td>${esc(reportMonth(item.month))}</td>
    <td class="income">${esc(reportMoney(item.income))}</td>
    <td class="expense">${esc(reportMoney(item.expense))}</td>
    <td class="${Number(item.cashflow) >= 0 ? 'positive' : 'negative'}">${esc(reportMoney(item.cashflow))}</td>
  </tr>`).join('');

  const restRows = restDays.length ? restDays.map(day => `<tr><td>${esc(reportDate(day.rest_date))}</td><td>${esc(reportMoney(day.amount))}</td></tr>`).join('') : '<tr><td colspan="2" class="empty">Nenhum dia de descanso registrado.</td></tr>';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Relatório Financeiro - ${esc(client.name)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f4f4f2;color:#202020;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45}.page{width:min(1100px,94%);margin:0 auto;padding:28px 0 50px}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:3px solid #b88a18;padding-bottom:18px;margin-bottom:20px}.brand{font-size:20px;font-weight:900;letter-spacing:2px}.brand span{color:#b88a18}.title{margin:8px 0 0;font-size:27px}.muted{color:#666}.actions{display:flex;gap:8px}.actions button{border:1px solid #c5c5c5;background:#fff;padding:9px 13px;border-radius:6px;cursor:pointer}.actions .primary{background:#b88a18;color:#fff;border-color:#b88a18}.info{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}.card{background:#fff;border:1px solid #ddd;border-radius:9px;padding:13px}.card small{display:block;color:#777;text-transform:uppercase;font-size:9px;letter-spacing:.7px;margin-bottom:5px}.card strong{font-size:17px}.positive{color:#28733a}.negative{color:#b33b3b}.income{color:#28733a}.expense{color:#b33b3b}.section{background:#fff;border:1px solid #ddd;border-radius:9px;padding:16px;margin-top:16px}.section h2{margin:0 0 4px;font-size:17px}.section p{margin:0 0 12px;color:#666}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:700px}th{text-align:left;background:#f0f0ee;color:#555;text-transform:uppercase;font-size:9px;letter-spacing:.5px}th,td{padding:8px 9px;border-bottom:1px solid #e4e4e4;vertical-align:top}.empty{text-align:center;color:#888;padding:18px}.footer{margin-top:18px;color:#777;font-size:10px;display:flex;justify-content:space-between;gap:15px}.status{display:inline-block;border:1px solid #ccc;border-radius:999px;padding:4px 8px;font-weight:700;font-size:10px}.no-print{display:block}@media(max-width:700px){.info{grid-template-columns:1fr 1fr}.top{flex-direction:column}.footer{flex-direction:column}}@media print{body{background:#fff}.page{width:100%;padding:0}.no-print{display:none!important}.section,.card{break-inside:avoid}.top{margin-top:0}.actions{display:none}a{color:inherit;text-decoration:none}}
  </style></head><body><div class="page">
  <div class="top"><div><div class="brand">ROTA <span>FINANCEIRA</span></div><h1 class="title">Relatório financeiro do cliente</h1><div class="muted">Período analisado: ${esc(reportDate(period.start))} até ${esc(reportDate(period.end))}</div></div><div class="actions no-print"><button class="primary" onclick="window.print()">Salvar / imprimir PDF</button><button onclick="window.close()">Fechar</button></div></div>
  <div class="section"><h2>${esc(client.name)}</h2><p>${esc(client.email)}${client.phone ? ' · ' + esc(client.phone) : ''}</p><span class="status">Status: ${esc(status)}</span></div>
  <div class="info">
    <div class="card"><small>Total de ganhos</small><strong>${esc(reportMoney(totals.income))}</strong></div>
    <div class="card"><small>Total de gastos</small><strong>${esc(reportMoney(totals.expense))}</strong></div>
    <div class="card"><small>Fluxo de caixa</small><strong class="${positive ? 'positive' : 'negative'}">${esc(reportMoney(totals.cashflow))}</strong></div>
    <div class="card"><small>Fluxo confirmado</small><strong class="${Number(totals.confirmedCashflow) >= 0 ? 'positive' : 'negative'}">${esc(reportMoney(totals.confirmedCashflow))}</strong></div>
    <div class="card"><small>Ganhos confirmados</small><strong>${esc(reportMoney(totals.paidIncome))}</strong></div>
    <div class="card"><small>Gastos pagos</small><strong>${esc(reportMoney(totals.paidExpense))}</strong></div>
    <div class="card"><small>Gastos pendentes</small><strong>${esc(reportMoney(totals.pendingExpense))}</strong></div>
    <div class="card"><small>Movimentações</small><strong>${entries.length}</strong></div>
  </div>
  <div class="section"><h2>Resumo mês a mês</h2><p>Somente os meses que fazem parte do período de cadastro do cliente.</p><div class="table-wrap"><table><thead><tr><th>Mês</th><th>Ganhos</th><th>Gastos</th><th>Fluxo de caixa</th></tr></thead><tbody>${monthlyRows || '<tr><td colspan="4" class="empty">Nenhum mês disponível.</td></tr>'}</tbody></table></div></div>
  <div class="section"><h2>Todas as movimentações</h2><p>Entradas e saídas registradas para este cliente.</p><div class="table-wrap"><table><thead><tr><th>Vencimento</th><th>Cadastro</th><th>Tipo</th><th>Descrição</th><th>Valor</th><th>Status</th><th>Confirmação</th></tr></thead><tbody>${movementRows}</tbody></table></div></div>
  <div class="section"><h2>Dias de descanso</h2><div class="table-wrap"><table><thead><tr><th>Data</th><th>Valor associado</th></tr></thead><tbody>${restRows}</tbody></table></div></div>
  <div class="footer"><span>Relatório gerado em ${esc(generated)}.</span><span>ROTA FINANCEIRA · Área administrativa</span></div>
  </div></body></html>`;
}

function exportClientReport() {
  if (!state.selectedClientId) {
    $('clientsFeedback').textContent = 'Selecione um cliente antes de baixar o relatório.';
    return;
  }

  const button = $('exportReport');
  const oldText = button.textContent;
  const href = `/api/admin/clients/${encodeURIComponent(state.selectedClientId)}/report`;

  button.disabled = true;
  button.textContent = 'Gerando relatório...';

  // A rota responde com Content-Disposition: attachment.
  // A navegação direta mantém a autenticação por cookie e deixa o próprio
  // navegador iniciar o download do PDF, inclusive em localhost.
  window.location.href = href;

  // O download não navega para outra página quando o servidor envia
  // Content-Disposition: attachment, mas o botão precisa ser reativado.
  setTimeout(() => {
    button.disabled = false;
    button.textContent = oldText;
  }, 1800);
}

function setMonth(month) {
  state.month = month;
  $('monthPicker').value = month;
  $('clientDetail').classList.add('hidden');
  loadClients();
}

$('prevMonth').addEventListener('click', () => setMonth(shiftMonth(state.month, -1)));
$('nextMonth').addEventListener('click', () => setMonth(shiftMonth(state.month, 1)));
$('monthPicker').addEventListener('change', e => e.target.value && setMonth(e.target.value));
$('clientSearch').addEventListener('input', renderClients);
$('closeDetail').addEventListener('click', () => $('clientDetail').classList.add('hidden'));
$('exportReport').addEventListener('click', exportClientReport);
$('logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); window.location.href = '/login.html'; });

(async function init() {
  if (!(await checkAdmin())) return;
  setMonth(isoMonth());
})();
