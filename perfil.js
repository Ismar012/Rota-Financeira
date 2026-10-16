(async function () {
  const form = document.getElementById('profileForm');
  const name = document.getElementById('name');
  const email = document.getElementById('email');
  const phone = document.getElementById('phone');
  const password = document.getElementById('password');
  const feedback = document.getElementById('feedback');

  const submit = form.querySelector('[type=submit]');
  let saving=false;
  submit.disabled=true;
  async function loadProfile() {
    const response = await fetch('/api/profile', { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) window.location.href = '/login.html';
      throw new Error(data.error || 'Não foi possível carregar seu perfil.');
    }
    name.value = data.user?.name || '';
    email.value = data.user?.email || '';
    phone.value = data.user?.phone || '';
    password.value = '';
  }

  try { await loadProfile(); submit.disabled=false; }
  catch (error) { feedback.textContent = error.message; }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if(saving)return;
    saving=true;submit.disabled=true;feedback.setAttribute('role','status');
    feedback.textContent = 'Salvando...';
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: name.value, email: email.value, phone: phone.value, password: password.value })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      name.value = data.user?.name || '';
      email.value = data.user?.email || '';
      phone.value = data.user?.phone || '';
      password.value = '';
      feedback.textContent = data.message || 'Dados cadastrais atualizados com sucesso.';
    } catch (error) { feedback.textContent = error.message; }
    finally {saving=false;submit.disabled=false;}
  });

  document.getElementById('loadHistory').addEventListener('click', async function () {
    const content = document.getElementById('historyContent');
    content.hidden = !content.hidden; this.setAttribute('aria-expanded', String(!content.hidden));
    if (content.hidden) return;
    const message = document.getElementById('historyFeedback'); message.textContent = 'Carregando histórico...';
    try {
      const response = await fetch('/api/profile/change-history', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o histórico.');
      const rows = document.getElementById('historyRows'); rows.replaceChildren();
      for (const item of data.changes) {
        const tr = document.createElement('tr');
        for (const value of [new Date(item.created_at).toLocaleString('pt-BR', {timeZone:'America/Bahia'}), item.action, item.details || item.field_name || '—']) {
          const td = document.createElement('td'); td.textContent = value; tr.appendChild(td);
        }
        rows.appendChild(tr);
      }
      message.textContent = data.changes.length ? 'Alterações mais recentes. O PDF contém o histórico completo.' : 'Nenhuma alteração registrada ainda.';
    } catch (error) { message.textContent = error.message; }
  });

  document.getElementById('logout').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/login.html';
  });
})();
