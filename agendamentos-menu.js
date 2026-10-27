(() => {
  'use strict';

  async function init() {
    const authResponse = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    if (!authResponse.ok) return;
    const me = await authResponse.json();
    if (!me.authenticated) return;

    const admin = me.user?.role === 'admin';
    const serviceResponse = await fetch('/api/services', { credentials: 'same-origin' });
    const serviceData = serviceResponse.ok ? await serviceResponse.json() : { services: [] };
    const house = admin || (serviceData.services || []).some(service => service.slug === 'divisao-casa' && service.acquired);
    const menu = document.getElementById('menu');
    const item = (label, url) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => { location.href = url; });
      return button;
    };

    if (menu && !document.getElementById('consultationMenuItem')) {
      const consult = item('Agendar consultoria', '/agendamento.html');
      consult.id = 'consultationMenuItem';
      menu.append(consult);
      if (admin) menu.append(item('Área de agendamentos', '/agendamentos-admin.html'));
    }
    if (menu && house && !menu.querySelector('[data-house-menu-item]')) {
      const houseItem = item('Resumo de casa', '/resumo-casa.html');
      houseItem.dataset.houseMenuItem = 'true';
      menu.append(houseItem);
    }
    if (!admin) {
      if (house && !menu) {
        const nav = document.querySelector('.header .nav');
        if (nav) {
          const details = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = '⋮';
          summary.setAttribute('aria-label', 'Mais opções');
          details.append(summary, item('Resumo de casa', '/resumo-casa.html'));
          nav.append(details);
        }
      }
      return;
    }

    const nav = document.querySelector('.header .nav');
    const logo = nav?.querySelector('.logo-text');
    if (!nav || !logo) return;

    const style = document.createElement('style');
    style.textContent = `
      .rota-schedule-brand{display:flex;align-items:center;gap:12px;min-width:0}
      .rota-schedule-tools{display:flex;align-items:center;gap:8px;flex-shrink:0}
      .rota-schedule-link{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:3px;border:1px solid rgba(217,169,40,.4);border-radius:8px;padding:9px 12px;background:#0b0d0f;color:#f2cb5b;text-decoration:none;cursor:pointer;font-size:18px}
      .rota-schedule-count{font-size:11px;background:#f2cb5b;color:#080808;border-radius:20px;padding:2px 5px;margin-left:4px}
      .notification-panel{position:relative}.notification-panel summary{list-style:none}.notification-panel summary::-webkit-details-marker{display:none}
      .notification-list{position:absolute;top:48px;right:0;z-index:12000;width:min(310px,calc(100vw - 32px));box-sizing:border-box;background:#101821;border:1px solid #514221;border-radius:12px;padding:9px;box-shadow:0 18px 46px #000b}
      .notification-list a,.notification-list button{display:block;width:100%;box-sizing:border-box;padding:12px;border:0;border-radius:8px;background:transparent;color:#e8edf3;text-align:left;text-decoration:none;cursor:pointer;font:500 12px/1.4 system-ui,sans-serif;white-space:normal}
      .notification-list a:hover,.notification-list button:hover{background:#202a34;color:#f2cc59}
      .rota-schedule-dropdown{position:relative}.rota-schedule-dropdown summary{list-style:none}.rota-schedule-dropdown summary::-webkit-details-marker{display:none}
      .rota-schedule-dropdown>a{position:absolute;right:0;top:45px;min-width:190px;z-index:40;background:#0b0d0f;color:#f2cb5b;padding:14px;border:1px solid #514221;border-radius:8px;text-decoration:none;font-size:13px}
      .rf-reserve-review-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:#02060bd1;backdrop-filter:blur(7px)}
      .rf-reserve-review-dialog{position:relative;width:min(500px,100%);box-sizing:border-box;padding:28px;border:1px solid #655223;border-radius:17px;background:radial-gradient(ellipse at 0 0,#d7a92919,transparent 55%),#101820;color:#edf2f7;box-shadow:0 28px 80px #000b}
      .rf-reserve-review-eyebrow{color:#eac34d;font-size:10px;font-weight:800;letter-spacing:1.8px}
      .rf-reserve-review-dialog h2{margin:9px 26px 12px 0;font-size:25px;line-height:1.2;letter-spacing:-.4px}
      .rf-reserve-review-dialog p{font-size:13px;color:#aebccc;line-height:1.55}
      .rf-reserve-review-client{padding:13px 14px;border:1px solid #263b4b;border-radius:10px;background:#0a121a;margin:15px 0}
      .rf-reserve-review-client strong,.rf-reserve-review-client span{display:block;overflow-wrap:anywhere}.rf-reserve-review-client strong{font-size:15px;color:#f2f5f8}.rf-reserve-review-client span{font-size:12px;color:#9eafc0;margin-top:4px}
      .rf-reserve-review-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}
      .rf-reserve-review-actions button{min-height:42px;border-radius:9px;font:650 12px system-ui,sans-serif;cursor:pointer}
      .rf-reserve-review-actions .rf-reserve-deny{border:1px solid #44515d;background:transparent;color:#dbe4ec}
      .rf-reserve-review-actions .rf-reserve-approve{border:1px solid #e8bc3d;background:linear-gradient(135deg,#f2cb59,#c69420);color:#11161c}
      .rf-reserve-review-close{position:absolute;right:12px;top:12px;width:32px;height:32px;min-height:32px;border:0;background:transparent;color:#aebccc;font-size:25px;cursor:pointer}
      .rf-reserve-review-feedback{min-height:0;margin-bottom:0;color:#f0c851!important}
      .rf-reserve-review-toast{position:fixed;right:22px;bottom:22px;z-index:100001;max-width:calc(100vw - 44px);padding:12px 16px;border:1px solid #35634a;border-radius:10px;background:#10251a;color:#c2f1cf;font:600 12px system-ui,sans-serif;box-shadow:0 14px 35px #0008}
      @media(max-width:540px){.rota-schedule-tools{gap:5px}.rf-reserve-review-dialog{padding:23px 18px}.rf-reserve-review-actions{grid-template-columns:1fr}.notification-list{right:-28px}}
    `;
    document.head.appendChild(style);

    const tools = document.createElement('div');
    tools.className = 'rota-schedule-tools';
    const notifications = document.createElement('details');
    notifications.className = 'notification-panel';
    const bell = document.createElement('summary');
    bell.className = 'rota-schedule-link';
    bell.setAttribute('aria-label', 'Notificações administrativas');
    bell.title = 'Notificações administrativas';
    bell.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
    const count = document.createElement('span');
    count.className = 'rota-schedule-count';
    count.hidden = true;
    bell.append(count);
    notifications.append(bell);
    const list = document.createElement('div');
    list.className = 'notification-list';
    const agenda = document.createElement('a');
    agenda.href = '/agendamentos-admin.html';
    const products = document.createElement('a');
    products.href = '/produtos-admin.html';
    const reserveRequests = document.createElement('button');
    reserveRequests.type = 'button';
    list.append(agenda, products, reserveRequests);
    notifications.append(list);
    tools.append(notifications);

    let agendaCount = null;
    let productCount = null;
    let reserveCount = null;
    function update() {
      const total = (agendaCount || 0) + (productCount || 0) + (reserveCount || 0);
      count.textContent = String(total);
      count.hidden = !total;
      bell.setAttribute('aria-label', total + ' notificações administrativas');
      agenda.textContent = 'Agendamentos' + (agendaCount === null ? ' — indisponível' : ' · ' + agendaCount + ' novos');
      products.textContent = 'Solicitações de produtos' + (productCount === null ? ' — indisponível' : ' · ' + productCount + ' pendentes');
      reserveRequests.textContent = 'Reserva da Liberdade' + (reserveCount === null ? ' — verificar solicitações' : ' · ' + reserveCount + ' pendentes');
      reserveRequests.disabled = reserveCount === 0;
      reserveRequests.style.opacity = reserveCount === 0 ? '.72' : '1';
    }

    let reviewOverlay = null;
    let reviewBusy = false;
    let reviewQueue = [];
    function closeReview() { reviewOverlay?.remove(); reviewOverlay = null; reviewBusy = false; }
    function showAdminToast(message, isError = false) {
      document.querySelector('.rf-reserve-review-toast')?.remove();
      const toast = document.createElement('div');
      toast.className = 'rf-reserve-review-toast';
      toast.textContent = message;
      if (isError) { toast.style.borderColor = '#7f4141'; toast.style.background = '#2a1515'; toast.style.color = '#ffd1d1'; }
      document.body.append(toast);
      setTimeout(() => toast.remove(), 4500);
    }
    function renderRequestReview() {
      closeReview();
      const request = reviewQueue[0];
      if (!request) {
        showAdminToast('Não há solicitações pendentes da Reserva da Liberdade.');
        return;
      }
      reviewOverlay = document.createElement('div');
      reviewOverlay.className = 'rf-reserve-review-overlay';
      reviewOverlay.setAttribute('role', 'dialog');
      reviewOverlay.setAttribute('aria-modal', 'true');
      reviewOverlay.setAttribute('aria-labelledby', 'rfReserveReviewTitle');
      const dialog = document.createElement('section');
      dialog.className = 'rf-reserve-review-dialog';
      const close = document.createElement('button');
      close.type = 'button'; close.className = 'rf-reserve-review-close'; close.textContent = '×'; close.setAttribute('aria-label', 'Fechar');
      close.addEventListener('click', closeReview);
      const eyebrow = document.createElement('div'); eyebrow.className = 'rf-reserve-review-eyebrow'; eyebrow.textContent = 'SOLICITAÇÃO DE ACESSO';
      const title = document.createElement('h2'); title.id = 'rfReserveReviewTitle'; title.textContent = 'Liberar a Reserva da Liberdade?';
      const intro = document.createElement('p'); intro.textContent = 'Este cliente solicitou acesso à Reserva da Liberdade. Você deseja liberar o serviço?';
      const identity = document.createElement('div'); identity.className = 'rf-reserve-review-client';
      const name = document.createElement('strong'); name.textContent = request.name || 'Cliente';
      const email = document.createElement('span'); email.textContent = request.email || 'E-mail não informado';
      const when = document.createElement('span'); when.textContent = 'Solicitado em ' + (request.requested_at ? new Date(request.requested_at).toLocaleString('pt-BR') : 'data não informada');
      identity.append(name,email,when);
      const feedback = document.createElement('p'); feedback.className = 'rf-reserve-review-feedback'; feedback.setAttribute('role','status');
      const actions = document.createElement('div'); actions.className = 'rf-reserve-review-actions';
      const deny = document.createElement('button'); deny.type = 'button'; deny.className = 'rf-reserve-deny'; deny.textContent = 'Não liberar';
      const approve = document.createElement('button'); approve.type = 'button'; approve.className = 'rf-reserve-approve'; approve.textContent = 'Sim, liberar acesso';
      async function decide(decision) {
        if (reviewBusy) return;
        reviewBusy = true; approve.disabled = true; deny.disabled = true; close.disabled = true;
        feedback.textContent = 'Salvando decisão…';
        try {
          const r = await fetch('/api/admin/reserva-liberdade/solicitacoes/' + encodeURIComponent(request.id) + '/decisao', {
            method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({decision})
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw Error(data.error || 'Não foi possível salvar a decisão.');
          closeReview();
          showAdminToast(data.message || 'Decisão registrada.');
          await refreshReserve();
        } catch (error) {
          feedback.textContent = error.message || 'Não foi possível salvar a decisão.';
          reviewBusy = false; approve.disabled = false; deny.disabled = false; close.disabled = false;
        }
      }
      deny.addEventListener('click', () => decide('rejected'));
      approve.addEventListener('click', () => decide('approved'));
      actions.append(deny,approve);
      dialog.append(close,eyebrow,title,intro,identity,feedback,actions);
      reviewOverlay.append(dialog);
      reviewOverlay.addEventListener('click', event => { if (event.target === reviewOverlay && !reviewBusy) closeReview(); });
      document.body.append(reviewOverlay);
      close.focus();
    }
    async function openReserveRequest() {
      notifications.open = false;
      try {
        const response = await fetch('/api/admin/reserva-liberdade/solicitacoes', { credentials:'same-origin', cache:'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw Error(data.error || 'Não foi possível carregar as solicitações.');
        reviewQueue = Array.isArray(data.requests) ? data.requests : [];
        renderRequestReview();
      } catch (error) {
        showAdminToast(error.message || 'Não foi possível carregar as solicitações.', true);
      }
    }
    reserveRequests.addEventListener('click', openReserveRequest);

    if (location.pathname === '/admin.html') {
      const details = document.createElement('details');
      details.className = 'rota-schedule-dropdown';
      const summary = document.createElement('summary'); summary.className = 'rota-schedule-link'; summary.textContent = '⋮'; summary.setAttribute('aria-label', 'Mais opções');
      details.appendChild(summary);
      for (const [label, url] of [['Área de agendamentos','/agendamentos-admin.html'],['Resumo de casa','/resumo-casa.html'],['Produtos por cliente','/produtos-admin.html'],['Desafios e reservas','/desafio-admin.html']]) {
        const anchor = document.createElement('a'); anchor.href = url; anchor.textContent = label; details.appendChild(anchor);
      }
      const dropdownStyle = document.createElement('style');
      dropdownStyle.textContent = '.rota-schedule-dropdown[open]{background:#0b0d0f}.rota-schedule-dropdown[open]>a{position:static;display:block;min-width:190px}';
      document.head.appendChild(dropdownStyle);
      tools.append(details);
    }

    const brand = document.createElement('div');
    brand.className = 'rota-schedule-brand';
    logo.before(brand);
    brand.append(logo, tools);

    async function refreshAgenda() {
      try {
        const r = await fetch('/api/admin/consultations/notifications', { credentials:'same-origin', cache:'no-store' });
        if (!r.ok) throw Error();
        const d = await r.json(); agendaCount = Number(d.count) || 0;
      } catch (_) { agendaCount = null; }
      update();
    }
    async function refreshProducts() {
      try {
        const r = await fetch('/api/admin/products', { credentials:'same-origin', cache:'no-store' });
        if (!r.ok) throw Error();
        const d = await r.json(); productCount = (d.requests || []).length;
      } catch (_) { productCount = null; }
      update();
    }
    async function refreshReserve() {
      try {
        const r = await fetch('/api/admin/reserva-liberdade/notificacoes', { credentials:'same-origin', cache:'no-store' });
        if (!r.ok) throw Error();
        const d = await r.json(); reserveCount = Number(d.count) || 0;
      } catch (_) { reserveCount = null; }
      update();
    }
    window.addEventListener('rota-consultations-changed', refreshAgenda);
    await Promise.all([refreshAgenda(),refreshProducts(),refreshReserve()]);
    setInterval(() => { if (!document.hidden) { refreshAgenda(); refreshProducts(); refreshReserve(); } }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshAgenda(); refreshProducts(); refreshReserve(); } });
  }

  init().catch(() => {});
})();
