(async function () {
  const form = document.getElementById('profileForm');
  const name = document.getElementById('name');
  const email = document.getElementById('email');
  const phone = document.getElementById('phone');
  const password = document.getElementById('password');
  const feedback = document.getElementById('feedback');

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

  try { await loadProfile(); }
  catch (error) { feedback.textContent = error.message; }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
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
  });

  document.getElementById('logout').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/login.html';
  });
})();
