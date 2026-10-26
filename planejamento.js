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
    const input = label.querySelector('input');
    if (input) input.setAttribute('aria-label', text);
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
    $('openBulkExpenses')?.classList.toggle('hidden', !isExpense || editing);
    $('categoryLabel')?.classList.toggle('hidden', !isExpense);
    $('secondDayLabel')?.classList.toggle('hidden', !isExpense || editing || mode.value !== 'fortnightly');
    if ($('secondDay')) {$('secondDay').required=isExpense && !editing && mode.value==='fortnightly';$('secondDay').disabled=!isExpense || editing || mode.value!=='fortnightly';}
    const amountLabel = type === 'expense' && mode.value === 'installment'
      ? 'Valor de cada parcela'
      : type === 'expense' && mode.value === 'daily' ? 'Valor por dia' : type === 'expense' && ['weekly','fortnightly'].includes(mode.value) ? 'Valor de cada pagamento' : 'Valor';
    setLabelText($('entryAmount')?.closest('label'), amountLabel);
    modeLabel.classList.toggle('hidden', !isExpense);
    mode.disabled = editing || !isExpense;

    if (!isExpense) {
      installmentLabel?.classList.add('hidden');
      return;
    }

    const parcelada = mode.value === 'installment';
    installmentLabel?.classList.toggle('hidden', !parcelada);
    if (installmentTotal) installmentTotal.required = parcelada && !editing;

    const diaria = mode.value === 'daily';

    if (diaria) {
      setLabelText($('createdDate')?.closest('label'), 'Data de início');
      setLabelText($('dueLabel'), 'Data final');
    } else {
      setLabelText(
        $('createdDate')?.closest('label'),
        'Data do cadastro'
      );

      setLabelText(
        $('dueLabel'),
        type === 'income'
          ? 'Data de recebimento'
          : 'Data de pagamento'
      );
    }
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
    $('entryCategory').value = 'Outros';
    $('secondDay').value = '';
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
    $('entryCategory').value = entry.financial_category || 'Outros';
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

  const navView = window.__rotaNavigationView || new URLSearchParams(window.location.search).get('view') || '';
  const keepEntryPanelOpen = navView === 'despesas' || navView === 'receitas';
  if (!state.entries.length && !keepEntryPanelOpen) {
    section.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  section.classList.remove('hidden');

  const filter = $('entriesFilter')?.value || 'all';

const filteredEntries = state.entries.filter((entry) => {
  const isIncome = entry.type === 'income';
  const paid = Number(entry.paid) === 1;

  if (filter === 'income-all') {
    return isIncome;
  }

  if (filter === 'income-paid') {
    return isIncome && paid ;
  }

  if (filter === 'income-pending') {
    return isIncome && !paid ;
  }


  if (filter === 'expense-all') {
    return !isIncome;
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
          ${!isIncome && ['fixed','installment','weekly','fortnightly'].includes(entry.recurrence_type) && entry.series_id ? `<button type="button" class="secondary-btn danger" data-action="delete-future" data-id="${entry.id}">Excluir próximas</button>` : ''}
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

  document.addEventListener('rota-goal-reload', () => loadSummary());

  function renderSummary(data) {
    const totals = data.totals || {};
    $('dailyGoal').textContent = totals.dailyGoal == null ? (data.goalPlan?.status === 'needs_setup' ? 'Configure seu planejamento' : 'Revisar planejamento') : fmt(totals.dailyGoal);
    window.rotaGoalContext = {plan:data.goalPlan, admin:false};
    document.dispatchEvent(new CustomEvent('rota-goal', {detail:window.rotaGoalContext}));
    $('workingDays').textContent = `${Number(totals.availableWorkingDays ?? totals.workingDays ?? 0)} dias disponíveis`;
    $('totalIncome').textContent = fmt(totals.realizedIncome ?? totals.income);
    $('totalExpense').textContent = fmt(totals.expense);
    const moneyToday = Number(totals.goalCashBalance ?? totals.availableBalance ?? totals.cashflow ?? 0);
    $('totalCashflow').textContent = fmt(moneyToday);
    $('totalCashflow').classList.toggle('negative', moneyToday < 0);
    $('totalCashflow').classList.toggle('positive', moneyToday >= 0);
  }

  function renderChart(data) {
    const empty = !data.some(item => ['futureIncome','futureExpense','paidIncome','paidExpense'].some(key => Number(item[key] || 0) !== 0));
    if ($('chartEmpty')) $('chartEmpty').hidden = !empty;
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
    document.dispatchEvent(new CustomEvent('rota-content-loading'));
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
      document.dispatchEvent(new CustomEvent('rota-summary-loaded',{detail:{month:state.month}}));
      feedback('');
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = '/login.html';
        return;
      }
      document.dispatchEvent(new CustomEvent('rota-content-error'));
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
    financial_category: $('entryCategory').value.trim() || 'Outros',
    recurrence_day_second: Number($('secondDay').value) || null,
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

  
const BULK_EXPENSE_ROW_LIMIT = 50;
let bulkExpenseSaving = false;

function makeBulkControl(tagName, className, attributes = {}) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'textContent') element.textContent = value;
    else if (key === 'value') element.value = value;
    else if (key === 'checked') element.checked = Boolean(value);
    else if (value !== null && value !== undefined) element.setAttribute(key, String(value));
  }
  return element;
}

function appendBulkCell(row, className, content) {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  if (content instanceof Node) cell.append(content);
  else if (content !== undefined && content !== null) cell.textContent = String(content);
  row.append(cell);
  return cell;
}

function addBulkExpenseRow() {
  const body = $('bulkExpenseRows');
  if (!body || body.children.length >= BULK_EXPENSE_ROW_LIMIT) {
    showBulkExpenseFeedback(`O limite é de ${BULK_EXPENSE_ROW_LIMIT} linhas por envio.`, 'error');
    return null;
  }

  const row = document.createElement('tr');
  row.className = 'bulk-expense-row';

  const number = makeBulkControl('span', 'bulk-row-number', {'aria-hidden': 'true', textContent: String(body.children.length + 1)});
  appendBulkCell(row, 'bulk-number-cell bulk-col-number', number);

  const name = makeBulkControl('input', 'bulk-name', {
    type: 'text', maxlength: '120', placeholder: 'Ex.: Aluguel',
    'aria-label': `Nome da despesa — linha ${body.children.length + 1}`
  });
  appendBulkCell(row, 'bulk-name-cell', name);

  const amount = makeBulkControl('input', 'bulk-amount', {
    type: 'number', min: '0.01', step: '0.01', placeholder: '0,00', inputmode: 'decimal',
    'aria-label': `Valor da despesa — linha ${body.children.length + 1}`
  });
  appendBulkCell(row, 'bulk-amount-cell', amount);

  const recurrence = makeBulkControl('select', 'bulk-recurrence', {
    'aria-label': `Tipo de despesa — linha ${body.children.length + 1}`
  });
  for (const [value, label] of [
    ['single', 'Única'], ['fixed', 'Despesa fixa'], ['installment', 'Parcelada'],
    ['daily', 'Diária'], ['weekly', 'Semanal'], ['fortnightly', 'Quinzenal (2 dias)']
  ]) recurrence.append(makeBulkControl('option', '', {value, textContent: label}));
  appendBulkCell(row, 'bulk-type-cell', recurrence);

  const category = makeBulkControl('input', 'bulk-category', {
    type: 'text', maxlength: '60', value: 'Outros', list: 'bulkExpenseCategories',
    'aria-label': `Categoria da despesa — linha ${body.children.length + 1}`
  });
  appendBulkCell(row, 'bulk-category-cell', category);

  const createdDate = makeBulkControl('input', 'bulk-created-date', {
    type: 'date', value: todayLocal(),
    'aria-label': `Data do cadastro — linha ${body.children.length + 1}`
  });
  appendBulkCell(row, 'bulk-date-cell', createdDate);

  const dueDate = makeBulkControl('input', 'bulk-due-date', {
    type: 'date', value: todayLocal(),
    'aria-label': `Data de pagamento — linha ${body.children.length + 1}`
  });
  appendBulkCell(row, 'bulk-date-cell', dueDate);

  const extraCell = appendBulkCell(row, 'bulk-extra-cell');
  extraCell.append(makeBulkControl('div', 'bulk-extra-wrap'));
  appendBulkExtra(row);

  const remove = makeBulkControl('button', 'bulk-delete-row', {
    type: 'button', 'aria-label': `Remover linha ${body.children.length + 1}`, title: 'Remover linha', textContent: '×'
  });
  remove.addEventListener('click', () => {
    row.remove();
    if (!$('bulkExpenseRows').children.length) addBulkExpenseRow();
    renumberBulkExpenseRows();
    showBulkExpenseFeedback('');
  });
  appendBulkCell(row, 'bulk-actions-cell', remove);

  recurrence.addEventListener('change', () => appendBulkExtra(row));
  row.addEventListener('input', (event) => {
    event.target.removeAttribute('aria-invalid');
    row.classList.remove('bulk-row-error');
    if (row.dataset.apiError) delete row.dataset.apiError;
  });
  row.addEventListener('change', (event) => {
    event.target.removeAttribute('aria-invalid');
    row.classList.remove('bulk-row-error');
    if (row.dataset.apiError) delete row.dataset.apiError;
  });

  body.append(row);
  renumberBulkExpenseRows();
  return row;
}

function appendBulkExtra(row) {
  const cell = row.querySelector('.bulk-extra-cell');
  const wrap = cell?.querySelector('.bulk-extra-wrap');
  const recurrence = row.querySelector('.bulk-recurrence')?.value;
  if (!cell || !wrap) return;
  wrap.replaceChildren();

  let label = '';
  let className = '';
  let min = '';
  let max = '';
  let placeholder = '';
  let ariaLabel = '';
  if (recurrence === 'installment') {
    label = 'Nº parcelas'; className = 'bulk-installment-total'; min = '2'; max = '120'; placeholder = 'Ex.: 6';
    ariaLabel = 'Número de parcelas';
  } else if (recurrence === 'fortnightly') {
    label = '2º dia'; className = 'bulk-second-day'; min = '1'; max = '31'; placeholder = 'Dia';
    ariaLabel = 'Segundo dia fixo do mês';
  } else {
    const dash = makeBulkControl('span', 'bulk-extra-empty', {textContent: '—'});
    wrap.append(dash);
    return;
  }

  const labelElement = makeBulkControl('label', '', {textContent: label});
  const input = makeBulkControl('input', className, {
    type: 'number', min, max, step: '1', placeholder, 'aria-label': ariaLabel
  });
  labelElement.append(input);
  wrap.append(labelElement);
}

function renumberBulkExpenseRows() {
  const rows = [...($('bulkExpenseRows')?.querySelectorAll('.bulk-expense-row') || [])];
  rows.forEach((row, index) => {
    const position = index + 1;
    row.querySelector('.bulk-row-number').textContent = String(position);
    row.querySelector('.bulk-name')?.setAttribute('aria-label', `Nome da despesa — linha ${position}`);
    row.querySelector('.bulk-amount')?.setAttribute('aria-label', `Valor da despesa — linha ${position}`);
    row.querySelector('.bulk-recurrence')?.setAttribute('aria-label', `Tipo de despesa — linha ${position}`);
    row.querySelector('.bulk-category')?.setAttribute('aria-label', `Categoria da despesa — linha ${position}`);
    row.querySelector('.bulk-created-date')?.setAttribute('aria-label', `Data do cadastro — linha ${position}`);
    row.querySelector('.bulk-due-date')?.setAttribute('aria-label', `Data de pagamento — linha ${position}`);
    row.querySelector('.bulk-delete-row')?.setAttribute('aria-label', `Remover linha ${position}`);
  });
  const count = $('bulkRowCounter');
  if (count) count.textContent = `${rows.length} ${rows.length === 1 ? 'linha' : 'linhas'}`;
  const addButton = $('bulkAddRow');
  if (addButton) addButton.disabled = rows.length >= BULK_EXPENSE_ROW_LIMIT || bulkExpenseSaving;
}

function showBulkExpenseFeedback(message, type = '') {
  const element = $('bulkExpenseFeedback');
  if (!element) return;
  element.textContent = message || '';
  element.className = `notice ${type}`.trim();
}

function bulkRowHasContent(row) {
  return Boolean(row.querySelector('.bulk-name')?.value.trim() || row.querySelector('.bulk-amount')?.value.trim());
}

function bulkDateIsValid(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateBulkExpenseRow(row) {
  const controls = {
    name: row.querySelector('.bulk-name'),
    amount: row.querySelector('.bulk-amount'),
    recurrence: row.querySelector('.bulk-recurrence'),
    category: row.querySelector('.bulk-category'),
    createdDate: row.querySelector('.bulk-created-date'),
    dueDate: row.querySelector('.bulk-due-date'),
    installmentTotal: row.querySelector('.bulk-installment-total'),
    secondDay: row.querySelector('.bulk-second-day')
  };
  for (const control of Object.values(controls)) control?.removeAttribute('aria-invalid');
  row.classList.remove('bulk-row-incomplete', 'bulk-row-error');
  delete row.dataset.apiError;

  if (!bulkRowHasContent(row)) return {empty: true, row};

  const errors = [];
  const markInvalid = (element, message) => {
    element?.setAttribute('aria-invalid', 'true');
    errors.push(message);
  };
  const name = controls.name.value.trim();
  if (!name) markInvalid(controls.name, 'informe o nome');
  const amount = Number(controls.amount.value);
  if (!controls.amount.value.trim() || !Number.isFinite(amount) || amount <= 0) markInvalid(controls.amount, 'informe um valor maior que zero');
  const category = controls.category.value.trim();
  if (!category) markInvalid(controls.category, 'informe a categoria');
  const createdDate = controls.createdDate.value;
  const dueDate = controls.dueDate.value;
  if (!bulkDateIsValid(createdDate)) markInvalid(controls.createdDate, 'informe uma data de cadastro válida');
  if (!bulkDateIsValid(dueDate)) markInvalid(controls.dueDate, 'informe uma data de pagamento válida');
  const recurrenceType = controls.recurrence.value;

  if (recurrenceType === 'daily' && createdDate && dueDate && createdDate > dueDate) {
    markInvalid(controls.dueDate, 'a data final da despesa diária deve ser igual ou posterior à data inicial');
  }

  let installmentTotal = null;
  if (recurrenceType === 'installment') {
    installmentTotal = Number(controls.installmentTotal?.value);
    if (!controls.installmentTotal?.value.trim() || !Number.isInteger(installmentTotal) || installmentTotal < 2 || installmentTotal > 120) {
      markInvalid(controls.installmentTotal, 'informe de 2 a 120 parcelas');
    }
  }

  let secondDay = null;
  if (recurrenceType === 'fortnightly') {
    secondDay = Number(controls.secondDay?.value);
    const firstDay = Number(dueDate.slice(-2));
    if (!controls.secondDay?.value.trim() || !Number.isInteger(secondDay) || secondDay < 1 || secondDay > 31 || secondDay === firstDay) {
      markInvalid(controls.secondDay, 'escolha um segundo dia entre 1 e 31, diferente do primeiro');
    }
  }

  if (errors.length) {
    row.classList.add('bulk-row-incomplete');
    return {empty: false, ready: false, row, errors};
  }

  return {
    empty: false,
    ready: true,
    row,
    payload: {
      request_id: crypto.randomUUID(),
      type: 'expense',
      name,
      amount,
      created_date: createdDate,
      due_date: dueDate,
      recurrence_type: recurrenceType,
      financial_category: category,
      recurrence_day_second: recurrenceType === 'fortnightly' ? secondDay : null,
      installment_total: recurrenceType === 'installment' ? installmentTotal : null
    }
  };
}

function setBulkExpenseBusy(busy) {
  bulkExpenseSaving = busy;
  const submit = $('bulkSubmitExpenses');
  if (submit) {
    submit.disabled = busy;
    submit.textContent = busy ? 'Cadastrando...' : 'Cadastrar despesas preenchidas';
  }
  $('bulkBackToIndividual') && ($('bulkBackToIndividual').disabled = busy);
  $('closeBulkExpenseModal') && ($('closeBulkExpenseModal').disabled = busy);
  $('bulkExpenseRows')?.querySelectorAll('input,select,button').forEach((element) => { element.disabled = busy; });
  renumberBulkExpenseRows();
}

async function submitBulkExpenses() {
  if (bulkExpenseSaving) return;
  const rows = [...($('bulkExpenseRows')?.querySelectorAll('.bulk-expense-row') || [])];
  const results = rows.map(validateBulkExpenseRow);
  const ready = results.filter((result) => result.ready);
  const incomplete = results.filter((result) => !result.empty && !result.ready);

  if (!ready.length) {
    const message = incomplete.length
      ? `Nenhuma despesa cadastrada. Complete os campos destacados em ${incomplete.length} ${incomplete.length === 1 ? 'linha' : 'linhas'} e tente novamente.`
      : 'Preencha pelo menos uma linha com nome e valor para cadastrar uma despesa.';
    showBulkExpenseFeedback(message, 'error');
    return;
  }

  setBulkExpenseBusy(true);
  showBulkExpenseFeedback(`Cadastrando ${ready.length} ${ready.length === 1 ? 'despesa' : 'despesas'}...`);
  const succeeded = [];
  const failed = [];

  try {
    for (const result of ready) {
      try {
        await api('/api/finance/entries', {
          method: 'POST',
          body: JSON.stringify(result.payload)
        });
        succeeded.push(result.row);
      } catch (error) {
        result.row.classList.add('bulk-row-error');
        result.row.dataset.apiError = error.message || 'Não foi possível cadastrar esta linha.';
        failed.push({row: result.row, message: error.message || 'Não foi possível cadastrar esta linha.'});
      }
    }

    for (const row of succeeded) row.remove();
    renumberBulkExpenseRows();
    await loadSummary();

    const pending = [...($('bulkExpenseRows')?.querySelectorAll('.bulk-expense-row') || [])]
      .filter(bulkRowHasContent);
    if (!pending.length) {
      hideModal('bulkExpenseModal');
      hideModal('modal');
      const message = failed.length
        ? `${succeeded.length} despesa(s) cadastrada(s). ${failed.length} linha(s) tiveram erro e permaneceram no formulário.`
        : `${succeeded.length} despesa(s) cadastrada(s) com sucesso.`;
      feedback(message, failed.length ? 'error' : 'success');
    } else {
      const parts = [];
      if (succeeded.length) parts.push(`${succeeded.length} despesa(s) cadastrada(s)`);
      if (incomplete.length) parts.push(`${incomplete.length} linha(s) incompleta(s) mantida(s) sem cadastro`);
      if (failed.length) parts.push(`${failed.length} linha(s) com erro mantida(s) para revisão`);
      showBulkExpenseFeedback(`${parts.join('. ')}. Revise as linhas destacadas e envie novamente.`, failed.length || incomplete.length ? 'error' : 'success');
    }
  } finally {
    setBulkExpenseBusy(false);
  }
}

function openBulkExpenseModal() {
  if ($('entryType')?.value !== 'expense' || $('entryId')?.value) return;
  hideModal('modal');
  const body = $('bulkExpenseRows');
  if (body && !body.children.length) {
    for (let i = 0; i < 4; i++) addBulkExpenseRow();
  }
  showBulkExpenseFeedback('');
  showModal('bulkExpenseModal');
  body?.querySelector('.bulk-name')?.focus();
}

function returnToIndividualExpenseForm() {
  hideModal('bulkExpenseModal');
  showBulkExpenseFeedback('');
  showModal('modal');
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

  $('confirmDateEyebrow').textContent = '';
  $('confirmDateTitle').textContent = 'Confirmar recebimento';

  $('confirmDateQuestion').textContent =
    'Em qual dia você recebeu este ganho?';

  $('confirmDateSubmit').textContent = 'Confirmar';

} else {

  $('confirmDateEyebrow').textContent = '';
  $('confirmDateTitle').textContent = 'Confirmar pagamento';

  $('confirmDateQuestion').textContent =
    'Em qual dia você pagou esta despesa?';

  $('confirmDateSubmit').textContent = 'Confirmar';
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

  function suggestSecondDay(){if($('expenseRecurrence').value!=='fortnightly' || state.editingId)return;const day=Number($('dueDate').value.slice(-2));const date=new Date($('dueDate').value+'T12:00:00Z');const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();$('secondDay').value=day+15<=last?String(day+15):'';}
  $('dueDate').addEventListener('change',suggestSecondDay);
  $('expenseRecurrence').addEventListener('change',suggestSecondDay);
  $('prevMonth')?.addEventListener('click', () => setMonth(shiftMonth(state.month, -1)));
  $('nextMonth')?.addEventListener('click', () => setMonth(shiftMonth(state.month, 1)));
  $('monthPicker')?.addEventListener('change', (event) => {
    if (event.target.value) setMonth(event.target.value);
  });

  $('addIncome')?.addEventListener('click', () => resetEntryForm('income'));
  $('addExpense')?.addEventListener('click', () => resetEntryForm('expense'));
  $('openBulkExpenses')?.addEventListener('click', openBulkExpenseModal);
  $('bulkAddRow')?.addEventListener('click', () => {
    const row = addBulkExpenseRow();
    if (row) {
      showBulkExpenseFeedback('');
      row.querySelector('.bulk-name')?.focus();
    }
  });
  $('bulkSubmitExpenses')?.addEventListener('click', submitBulkExpenses);
  $('bulkBackToIndividual')?.addEventListener('click', returnToIndividualExpenseForm);
  $('closeBulkExpenseModal')?.addEventListener('click', () => hideModal('bulkExpenseModal'));
  $('bulkExpenseModal')?.addEventListener('click', (event) => {
    if (!bulkExpenseSaving && event.target === $('bulkExpenseModal')) hideModal('bulkExpenseModal');
  });
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
    if ($('entriesDisclosure')) $('entriesDisclosure').open=true;
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
    const requestedView = new URLSearchParams(window.location.search).get('view');
    if (requestedView === 'despesas' || requestedView === 'receitas') {
      window.__rotaNavigationView = requestedView;
      const filter = $('entriesFilter');
      if (filter) filter.value = requestedView === 'despesas' ? 'expense-all' : 'income-all';
      const disclosure = $('entriesDisclosure');
      if (disclosure) disclosure.open = true;
      $('entriesSection')?.classList.remove('hidden');
    }
    setMonth(isoMonth());
  })();
})();
