(() => {
  'use strict';

  const state = {
    month: '',
    entries: [],
    restDays: [],
    data: [],
    chart: null,
    editingId: null,
    editingType: null
  };

  const money = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric'
  });

  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const $ = (id) => document.getElementById(id);
  const fmt = (value) => money.format(Number(value) || 0);

  function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function isoMonth(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function shiftMonth(month, delta) {
    const [year, monthNumber] = month.split('-').map(Number);
    const date = new Date(year, monthNumber - 1 + delta, 1);
    return isoMonth(date);
  }

  function monthLabel(month) {
    const [year, monthNumber] = month.split('-').map(Number);
    return monthFormatter.format(new Date(year, monthNumber - 1, 1));
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.error || 'Não foi possível concluir a operação.');
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  function feedback(message, type = '') {
    const el = $('feedback');
    if (!el) return;
    el.textContent = message || '';
    el.className = `notice ${type}`.trim();
  }

  function hideMenus() {
    $('menu')?.classList.remove('open');
  }

  function showModal(id) {
    $(id)?.classList.remove('hidden');
  }

  function hideModal(id) {
    $(id)?.classList.add('hidden');
  }

  function setMonth(month) {
    state.month = month;
    $('monthPicker').value = month;
    $('monthLabel').textContent = monthLabel(month);
    loadSummary();
  }


  function setLabelText(label, text) {
    if (!label) return;
    for (const node of label.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        node.textContent = `\n            ${text}\n\n            `;
        return;
      }
    }
    label.insertBefore(document.createTextNode(`${text} `), label.firstChild);
  }

  function syncExpenseRecurrenceUI(type, editing = false) {
    const modeLabel = $('expenseModeLabel');
    const mode = $('expenseRecurrence');
    const installmentLabel = $('installmentLabel');
    const installmentTotal = $('installmentTotal');

    if (!modeLabel || !mode) return;

    const isExpense = type === 'expense';
    modeLabel.classList.toggle('hidden', !isExpense);
    mode.disabled = editing || !isExpense;

    if (!isExpense) {
      installmentLabel?.classList.add('hidden');
      return;
    }

    const parcelada = mode.value === 'installment';
    installmentLabel?.classList.toggle('hidden', !parcelada);
    if (installmentTotal) installmentTotal.required = parcelada && !editing;
  }

  function syncExpenseRecurrenceFromEntry(entry) {
    if (!$('expenseRecurrence')) return;
    $('expenseRecurrence').value = entry.recurrence_type || 'single';
    $('installmentTotal').value = entry.installment_total || '';
    syncExpenseRecurrenceUI(entry.type, true);
  }

  function resetEntryForm(type) {
    state.editingId = null;
    state.editingType = type;
    $('entryId').value = '';
    $('entryType').value = type;
    $('entryName').value = '';
    $('entryAmount').value = '';
    if ($('expenseRecurrence')) $('expenseRecurrence').value = 'single';
    if ($('installmentTotal')) $('installmentTotal').value = '';
    syncExpenseRecurrenceUI(type, false);
    $('createdDate').value = todayLocal();
    $('dueDate').value = state.month === isoMonth() ? todayLocal() : `${state.month}-01`;
    $('modalEyebrow').textContent = type === 'income' ? 'Novo ganho' : 'Nova despesa';
    $('modalTitle').textContent = type === 'income' ? 'Cadastrar ganho' : 'Cadastrar despesa';
    const dueText = type === 'income' ? 'Data de recebimento' : 'Data de pagamento';
    $('dueLabel').querySelector('input').setAttribute('aria-label', dueText);
    setLabelText($('dueLabel'), dueText);
    showModal('modal');
    $('entryName').focus();
  }

  function editEntry(entry) {
    state.editingId = Number(entry.id);
    state.editingType = entry.type;
    $('entryId').value = entry.id;
    $('entryType').value = entry.type;
    $('entryName').value = entry.name || '';
    $('entryAmount').value = Number(entry.amount || 0).toFixed(2);
    syncExpenseRecurrenceFromEntry(entry);
    $('createdDate').value = entry.created_date || todayLocal();
    $('dueDate').value = entry.due_date || todayLocal();
    $('modalEyebrow').textContent = entry.type === 'income' ? 'Editar ganho' : 'Editar despesa';
    $('modalTitle').textContent = entry.type === 'income' ? 'Editar ganho' : 'Editar despesa';
    setLabelText($('dueLabel'), entry.type === 'income' ? 'Data de recebimento' : 'Data de pagamento');
    showModal('modal');
  }

function renderEntries() {
  const section = $('entriesSection');
  const list = $('entriesList');
  if (!section || !list) return;

  if (!state.entries.length) {
    section.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  section.classList.remove('hidden');

  const filter = $('entriesFilter')?.value || 'all';

const filteredEntries = state.entries.filter((entry) => {
  const isIncome = entry.type === 'income';
  const paid = Number(entry.paid) === 1;

  if (filter === 'income-paid') {
    return isIncome && paid ;
  }

  if (filter === 'income-pending') {
    return isIncome && !paid ;
  }


  if (filter === 'expense-paid') {
    return !isIncome && paid ;
  }

  if (filter === 'expense-pending') {
    return !isIncome && !paid ;
  }

  return true;
});
  if (!filteredEntries.length) {
    list.innerHTML = `
      <p class="muted">
        Nenhum lançamento encontrado neste filtro.
      </p>
    `;
    return;
  }

  list.innerHTML = filteredEntries.map((entry) => {
    const isIncome = entry.type === 'income';
    const paid = Number(entry.paid) === 1;
    const status = isIncome ? (paid ? 'Recebido' : 'Pendente') : (paid ? 'Pago' : 'Pendente');
    const date = entry.due_date ? dateFormatter.format(new Date(`${entry.due_date}T00:00:00`)) : '—';

    const action = paid
      ? `<button type="button" class="secondary-btn entry-status-btn" data-action="undo-${isIncome ? 'receive' : 'pay'}" data-id="${entry.id}">${isIncome ? 'Desfazer recebimento' : 'Desfazer pagamento'}</button>`
      : `<button type="button" class="secondary-btn entry-status-btn" data-action="${isIncome ? 'receive' : 'pay'}" data-id="${entry.id}">${isIncome ? 'Confirmar recebimento' : 'Confirmar pagamento'}</button>`;

    return `
      <article class="entry-row">
        <div class="entry-main">
          <strong>${esc(entry.name)}</strong>
          <small>${isIncome ? 'Ganho' : 'Despesa'} · ${esc(date)}</small>
        </div>

        <div class="entry-value ${isIncome ? 'positive' : 'negative'}">
          ${fmt(entry.amount)}
        </div>

        <span class="status-pill ${paid ? 'work' : 'weekend'}">
          ${status}
        </span>

        <div class="entry-actions">
          ${action}
          <button type="button" class="secondary-btn" data-action="edit" data-id="${entry.id}">Editar</button>
          <button type="button" class="secondary-btn danger" data-action="delete" data-id="${entry.id}">Excluir</button>
          ${!isIncome && (entry.recurrence_type === 'fixed' || entry.recurrence_type === 'installment') && entry.series_id ? `<button type="button" class="secondary-btn danger" data-action="delete-future" data-id="${entry.id}">Excluir próximas</button>` : ''}
        </div>
      </article>`;
  }).join('');
}

  function renderRestDays() {
    const section = $('restSection');
    const list = $('restList');
    if (!section || !list) return;

    if (!state.restDays.length) {
      section.classList.add('hidden');
      list.innerHTML = '';
      return;
    }

    section.classList.remove('hidden');
    list.innerHTML = state.restDays.map((rest) => `
      <article class="entry-row">
        <div class="entry-main">
          <strong>${esc(dateFormatter.format(new Date(`${rest.rest_date}T00:00:00`)))}</strong>
          <small>Dia de descanso</small>
        </div>
        <div class="entry-value negative">${fmt(rest.amount)}</div>
        <span class="status-pill rest">Descanso</span>
        <div class="entry-actions">
          <button type="button" class="secondary-btn danger" data-rest-delete="${rest.id}">Excluir</button>
        </div>
      </article>`).join('');
  }

  function renderSummary(data) {
    const totals = data.totals || {};
    $('dailyGoal').textContent = fmt(totals.dailyGoal);
    $('workingDays').textContent = `${Number(totals.availableWorkingDays ?? totals.workingDays ?? 0)} dias disponíveis`;
    $('totalIncome').textContent = fmt(totals.income);
    $('totalExpense').textContent = fmt(totals.expense);
    const moneyToday = Number(totals.availableBalance ?? totals.cashflow ?? 0);
    $('totalCashflow').textContent = fmt(moneyToday);
    $('totalCashflow').classList.toggle('negative', moneyToday < 0);
    $('totalCashflow').classList.toggle('positive', moneyToday >= 0);
  }

  function renderChart(data) {
    if (!window.Chart || !$('financeChart')) return;

    const labels = data.map((item) => item.day);

    const futureIncome = data.map(
      (item) => Number(item.futureIncome || 0)
    );

    const futureExpense = data.map(
      (item) => Number(item.futureExpense || 0)
    );

    const paidIncome = data.map(
      (item) => Number(item.paidIncome || 0)
    );

    const paidExpense = data.map(
      (item) => Number(item.paidExpense || 0)
    );

    if (state.chart) state.chart.destroy();

    state.chart = new Chart($('financeChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Ganho previsto',
            data: futureIncome,
            borderColor: '#3498DB',
            backgroundColor: '#3498DB',
            borderWidth: 2,
            tension: 0.25,
            pointRadius: 2
          },
          {
            label: 'Despesa prevista',
            data: futureExpense,
            borderColor: '#F59E0B',
            backgroundColor: '#F59E0B',
            borderWidth: 2,
            tension: 0.25,
            pointRadius: 2
          },
          {
            label: 'Ganho realizado',
            data: paidIncome,
            borderColor: '#27AE60',
            backgroundColor: '#27AE60',
            borderWidth: 2,
            tension: 0.25,
            pointRadius: 2
          },
          {
            label: 'Gasto realizado',
            data: paidExpense,
            borderColor: '#E74C3C',
            backgroundColor: '#E74C3C',
            borderWidth: 2,
            tension: 0.25,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => fmt(value)
            }
          }
        }
      }
    });
  }

  async function loadSummary() {
    if (!state.month) return;
    feedback('Carregando planejamento...');

    try {
      const data = await api(`/api/finance/summary?month=${encodeURIComponent(state.month)}`);
      state.entries = data.entries || [];
      state.restDays = data.restDays || [];
      state.data = data.data || [];
      renderSummary(data);
      renderEntries();
      renderRestDays();
      renderChart(state.data);
      feedback('');
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = '/login.html';
        return;
      }
      feedback(error.message, 'error');
    }
  }

async function saveEntry(event) {
  event.preventDefault();

  const form = event.currentTarget;

  // Impede clique duplo / envio duplicado.
  if (form.dataset.saving === 'true') {
    return;
  }

  const id = Number($('entryId').value || 0);

  const payload = {
    request_id: crypto.randomUUID(),
    type: $('entryType').value,
    name: $('entryName').value.trim(),
    amount: Number($('entryAmount').value),
    created_date: $('createdDate').value,
    due_date: $('dueDate').value,
    recurrence_type:
      $('entryType').value === 'expense'
        ? $('expenseRecurrence').value
        : 'single',
    installment_total:
      $('entryType').value === 'expense'
        ? Number($('installmentTotal').value || 0)
        : null
  };

  // Primeiro valida os dados.
  if (
    !payload.name ||
    !Number.isFinite(payload.amount) ||
    payload.amount <= 0 ||
    !payload.created_date ||
    !payload.due_date
  ) {
    feedback(
      'Preencha todos os campos corretamente.',
      'error'
    );
    return;
  }

  // A partir daqui somente o primeiro envio é aceito.
  form.dataset.saving = 'true';

  const submitButton =
    form.querySelector('button[type="submit"]');

  if (submitButton) {
    submitButton.disabled = true;
  }

  // Fecha o pop-up imediatamente após o primeiro clique válido.
  hideModal('modal');

  try {
    if (id) {
      await api(`/api/finance/entries/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      feedback(
        'Lançamento atualizado com sucesso.',
        'success'
      );
    } else {
      await api('/api/finance/entries', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      feedback(
        payload.type === 'income'
          ? 'Ganho cadastrado com sucesso.'
          : 'Despesa cadastrada com sucesso.',
        'success'
      );
    }

    // Atualiza os dados da tela depois da confirmação do servidor.
    await loadSummary();

  } catch (error) {
    if (
      error.status === 401 ||
      error.status === 403
    ) {
      window.location.href = '/login.html';
      return;
    }

    feedback(
      error.message ||
        'Não foi possível cadastrar.',
      'error'
    );

  } finally {
    form.dataset.saving = 'false';

    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

  
async function changeEntryStatus(id, action) {

  // Confirmação de ganho ou despesa:
  // primeiro abre o modal para informar a data efetiva.
  if (action === 'receive' || action === 'pay') {

    const entry = state.entries.find(
      (item) => Number(item.id) === Number(id)
    );

    if (!entry) return;

    $('confirmEntryId').value = id;
    $('confirmEntryAction').value = action;

    // Data atual preenchida automaticamente.
    $('confirmActualDate').value = todayLocal();

    if (action === 'receive') {

      $('confirmDateEyebrow').textContent = 'Confirmar recebimento';
      $('confirmDateTitle').textContent = 'Confirmar recebimento';

      $('confirmDateQuestion').textContent =
        'Em qual dia você recebeu este ganho?';

      $('confirmDateSubmit').textContent =
        'Confirmar recebimento';

    } else {

      $('confirmDateEyebrow').textContent = 'Confirmar pagamento';
      $('confirmDateTitle').textContent = 'Confirmar pagamento';

      $('confirmDateQuestion').textContent =
        'Em qual dia você pagou esta despesa?';

      $('confirmDateSubmit').textContent =
        'Confirmar pagamento';
    }

    showModal('confirmDateModal');
    return;
  }

  // Desfazer continua separado.
  const routes = {
    'undo-receive': `/api/finance/entries/${id}/unreceive`,
    'undo-pay': `/api/finance/entries/${id}/unpay`
  };

  const route = routes[action];
  if (!route) return;

  try {

    await api(route, {
      method: 'POST'
    });

    await loadSummary();

  } catch (error) {

    if (error.status === 401 || error.status === 403) {
      window.location.href = '/login.html';
      return;
    }

    feedback(
      error.message || 'Não foi possível atualizar o lançamento.',
      'error'
    );
  }
}


async function confirmEntryDate(event) {

  event.preventDefault();

  const form = event.currentTarget;

  // BLOQUEIO CONTRA CLIQUE DUPLO.
  if (form.dataset.saving === 'true') {
    return;
  }

  const id = Number($('confirmEntryId').value);
  const action = $('confirmEntryAction').value;
  const actualDate = $('confirmActualDate').value;

  if (
    !id ||
    !actualDate ||
    (action !== 'receive' && action !== 'pay')
  ) {
    feedback(
      'Informe uma data válida.',
      'error'
    );
    return;
  }

  form.dataset.saving = 'true';

  const submitButton = $('confirmDateSubmit');

  if (submitButton) {
    submitButton.disabled = true;
  }

  // Fecha imediatamente após o primeiro clique válido.
  hideModal('confirmDateModal');

  const route =
    action === 'receive'
      ? `/api/finance/entries/${id}/receive`
      : `/api/finance/entries/${id}/pay`;

  try {

    await api(route, {
      method: 'POST',
      body: JSON.stringify({
        actual_date: actualDate
      })
    });

    feedback(
      action === 'receive'
        ? 'Recebimento confirmado com sucesso.'
        : 'Pagamento confirmado com sucesso.',
      'success'
    );

    await loadSummary();

  } catch (error) {

    if (error.status === 401 || error.status === 403) {
      window.location.href = '/login.html';
      return;
    }

    feedback(
      error.message ||
        'Não foi possível confirmar o lançamento.',
      'error'
    );

  } finally {

    form.dataset.saving = 'false';

    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

  async function deleteEntry(id) {
    if (!window.confirm('Deseja realmente excluir este lançamento?')) return;

    try {
      await api(`/api/finance/entries/${id}`, { method: 'DELETE' });
      feedback('Lançamento excluído com sucesso.', 'success');
      await loadSummary();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = '/login.html';
        return;
      }
      feedback(error.message, 'error');
    }
  }

  async function deleteFutureEntries(entry) {
    const isFixed = entry.recurrence_type === 'fixed';
    const label = isFixed ? 'despesa fixa' : 'parcelas';
    if (!window.confirm(`Deseja excluir esta ${label} e todas as ocorrências futuras desta série? As ocorrências anteriores serão mantidas.`)) return;
    try {
      await api(`/api/finance/entries/${entry.id}?scope=future`, { method: 'DELETE' });
      feedback(isFixed ? 'A despesa fixa e as próximas ocorrências foram excluídas.' : 'Esta parcela e as próximas parcelas foram excluídas.', 'success');
      await loadSummary();
    } catch (error) {
      if (error.status === 401 || error.status === 403) { window.location.href = '/login.html'; return; }
      feedback(error.message, 'error');
    }
  }

  async function saveRest(event) {
    event.preventDefault();

    const payload = {
      rest_date: $('restDate').value,
      amount: Number($('restAmount').value)
    };

    if (!payload.rest_date || !Number.isFinite(payload.amount) || payload.amount < 0) {
      feedback('Informe uma data e um valor válidos.', 'error');
      return;
    }

    try {
      await api('/api/finance/rest-days', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      hideModal('restModal');
      feedback('Dia de descanso cadastrado com sucesso.', 'success');
      await loadSummary();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = '/login.html';
        return;
      }
      feedback(error.message, 'error');
    }
  }

  async function deleteRest(id) {
    if (!window.confirm('Deseja excluir este dia de descanso?')) return;

    try {
      await api(`/api/finance/rest-days/${id}`, { method: 'DELETE' });
      feedback('Dia de descanso excluído com sucesso.', 'success');
      await loadSummary();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = '/login.html';
        return;
      }
      feedback(error.message, 'error');
    }
  }

  function openRestModal() {
    $('restDate').value = state.month === isoMonth() ? todayLocal() : `${state.month}-01`;
    $('restAmount').value = '';
    showModal('restModal');
    $('restDate').focus();
  }

  async function checkAuth() {
    try {
      const data = await api('/api/auth/me');
      if (!data.authenticated) {
        window.location.href = '/login.html';
        return false;
      }

      // A opção administrativa só existe visualmente para quem tem role=admin.
      // A proteção real da área administrativa continua no servidor.
      const adminMenu = $('menuAdmin');
      if (adminMenu) {
        const isAdmin = String(data.user?.role || '').trim().toLowerCase() === 'admin';
        adminMenu.style.display = isAdmin ? 'block' : 'none';
        adminMenu.disabled = !isAdmin;
        adminMenu.setAttribute('aria-hidden', isAdmin ? 'false' : 'true');
      }

      return true;
    } catch (error) {
      window.location.href = '/login.html';
      return false;
    }
  }

  $('prevMonth')?.addEventListener('click', () => setMonth(shiftMonth(state.month, -1)));
  $('nextMonth')?.addEventListener('click', () => setMonth(shiftMonth(state.month, 1)));
  $('monthPicker')?.addEventListener('change', (event) => {
    if (event.target.value) setMonth(event.target.value);
  });

  $('addIncome')?.addEventListener('click', () => resetEntryForm('income'));
  $('addExpense')?.addEventListener('click', () => resetEntryForm('expense'));
  $('expenseRecurrence')?.addEventListener('change', () => syncExpenseRecurrenceUI('expense', false));
$('entryForm')?.addEventListener('submit', saveEntry);
$('restForm')?.addEventListener('submit', saveRest);
$('confirmDateForm')?.addEventListener('submit', confirmEntryDate);

$('closeModal')?.addEventListener('click', () => hideModal('modal'));
$('closeRestModal')?.addEventListener('click', () => hideModal('restModal'));
$('closeConfirmDateModal')?.addEventListener('click', () => {
  hideModal('confirmDateModal');
});

  $('modal')?.addEventListener('click', (event) => {
    if (event.target === $('modal')) hideModal('modal');
  });

  $('restModal')?.addEventListener('click', (event) => {
    if (event.target === $('restModal')) hideModal('restModal');
  });

  $('confirmDateModal')?.addEventListener('click', (event) => {
  if (event.target === $('confirmDateModal')) {
    hideModal('confirmDateModal');
  }
});
  
  $('menuBtn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    $('menu')?.classList.toggle('open');
  });

  document.addEventListener('click', () => hideMenus());

  $('menuEdit')?.addEventListener('click', (event) => {
    event.stopPropagation();
    hideMenus();
    $('entriesSection')?.classList.remove('hidden');
    $('entriesSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('menuRest')?.addEventListener('click', (event) => {
    event.stopPropagation();
    hideMenus();
    openRestModal();
  });

  $('menuManageRest')?.addEventListener('click', (event) => {
    event.stopPropagation();
    hideMenus();
    $('restSection')?.classList.remove('hidden');
    $('restSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('menuAdmin')?.addEventListener('click', (event) => {
    event.stopPropagation();
    hideMenus();
    window.location.href = '/admin.html';
  });

  $('entriesFilter')?.addEventListener('change', () => {
  renderEntries();
});
  
  $('entriesList')?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    const entry = state.entries.find((item) => Number(item.id) === id);
    if (!entry) return;

    if (action === 'edit') return editEntry(entry);
    if (action === 'delete') return deleteEntry(id);
    if (action === 'delete-future') return deleteFutureEntries(entry);
    return changeEntryStatus(id, action);
  });

  $('restList')?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-rest-delete]');
    if (!button) return;
    deleteRest(Number(button.dataset.restDelete));
  });

  $('logout')?.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login.html';
    }
  });

  (async function init() {
    if (!(await checkAuth())) return;
    setMonth(isoMonth());
  })();
})();
