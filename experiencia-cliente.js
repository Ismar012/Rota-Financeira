(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fmt = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dateLabel = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? new Intl.DateTimeFormat('pt-BR').format(new Date(d+'T12:00:00Z')) : 'Data não informada';
  const text = (tag,value) => { const el=document.createElement(tag); el.textContent=value; return el; };
  async function summary(){const res=await fetch('/api/finance/summary?month='+encodeURIComponent(today().slice(0,7)),{credentials:'same-origin'});if(!res.ok)throw new Error('Não foi possível carregar o resumo. Abra o planejamento para tentar novamente.');return res.json();}
  const toast=text('div','');toast.className='ux-toast';toast.setAttribute('role','status');document.body.append(toast);
  let toastTimer;
  const feedback=$('feedback');
  if(feedback){feedback.setAttribute('role','status');new MutationObserver(()=>{if(feedback.classList.contains('success')&&feedback.textContent){toast.textContent=feedback.textContent;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.textContent='';},7000);}}).observe(feedback,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});}
  const chart=document.querySelector('.chart-card');
  const actions=document.querySelector('.action-grid');
  if(chart&&actions){
    chart.before(actions);
    if (!$('quickChallenge')) {const link=text('a','');link.id='quickChallenge';link.className='action-card';link.href='/desafio.html';const icon=text('span','🏆');icon.className='action-icon';icon.setAttribute('aria-hidden','true');const copy=text('span','');copy.append(text('strong','Reserva da Liberdade'),text('small','Sua jornada para guardar dinheiro'));link.append(icon,copy);actions.append(link);}

    (async()=>{try{
      const response=await fetch('/api/auth/me',{credentials:'same-origin'});if(!response.ok)return;
      const me=await response.json();if(!me.authenticated)return;
      let allowed=me.user?.role==='admin';
      if(!allowed){const r=await fetch('/api/services',{credentials:'same-origin'});if(!r.ok)return;const data=await r.json();const services=Array.isArray(data.services)?data.services:[];allowed=services.some(s=>s.slug==='divisao-casa'&&s.acquired===true)&&services.some(s=>s.slug==='plataforma'&&s.acquired===true);}
      if(!allowed||$('quickHouse'))return;
      const link=text('a','');link.id='quickHouse';link.className='action-card';link.href='/resumo-casa.html';
      const icon=text('span','⌂');icon.className='action-icon';icon.setAttribute('aria-hidden','true');
      const copy=text('span','');copy.append(text('strong','Despesas da casa'),text('small','Divida despesas e confira os acertos'));link.append(icon,copy);actions.append(link);
    }catch{/* Falha ao consultar permissões mantém o atalho oculto. */}})();
  }
  if ($('entriesList')) {
    const panel = text('section', '');
    panel.className = 'ux-panel';
    panel.setAttribute('aria-labelledby', 'uxPendingTitle');
    const title = text('h2', 'Pendências para confirmar');
    title.id = 'uxPendingTitle';
    const intro = text('p', 'Confirme somente valores que você realmente recebeu ou pagou.');
    const tableHead = text('div', '');
    tableHead.className = 'ux-pending-table-head';
    ['Tipo', 'Descrição', 'Valor', 'Vencimento', 'Ações'].forEach(label => tableHead.append(text('span', label)));
    const list = text('div', '');
    list.className = 'ux-pending-list';
    panel.append(title, intro, tableHead, list);
    const all = text('button', 'Ver todos os lançamentos');
    all.type = 'button';
    all.className = 'secondary-btn ux-pending-see-all';
    all.addEventListener('click', () => {
      const disclosure = $('entriesDisclosure');
      if (disclosure) {
        disclosure.open = true;
        disclosure.scrollIntoView({behavior:'smooth', block:'start'});
        disclosure.querySelector('summary')?.focus();
      }
    });
    panel.append(all);
    (actions || chart).after(panel);

    function refresh() {
      list.replaceChildren();
      const rows = [...$('entriesList').querySelectorAll('.entry-row')]
        .filter(row => row.querySelector('[data-action="receive"],[data-action="pay"]'));
      for (const row of rows.slice(0, 5)) {
        const original = row.querySelector('[data-action="receive"],[data-action="pay"]');
        const isIncome = original?.dataset.action === 'receive';
        const meta = row.querySelector('.entry-main small')?.textContent || '';
        const [typeLabel, dueText] = meta.split('·').map(part => part.trim());
        const item = text('div', '');
        item.className = 'ux-pending-row';
        const type = text('span', typeLabel || (isIncome ? 'Ganho' : 'Despesa'));
        type.className = 'ux-pending-type' + (isIncome ? ' is-income' : '');
        const details = text('div', '');
        details.className = 'ux-pending-description';
        details.append(text('strong', row.querySelector('.entry-main strong')?.textContent || 'Lançamento'));
        details.append(text('small', isIncome ? 'Recebimento pendente' : 'Pagamento pendente'));
        const amount = text('strong', row.querySelector('.entry-value')?.textContent.trim() || '—');
        amount.className = 'ux-pending-amount';
        const due = text('span', dueText || 'Data não informada');
        due.className = 'ux-pending-date';
        const rowActions = text('div', '');
        rowActions.className = 'ux-pending-actions';
        const confirm = text('button', 'Confirmar');
        confirm.type = 'button';
        confirm.className = 'ux-pending-confirm';
        confirm.addEventListener('click', () => original.click());
        rowActions.append(confirm);
        const deleteOriginal = row.querySelector('[data-action="delete"]');
        if (deleteOriginal) {
          const remove = text('button', 'Excluir');
          remove.type = 'button';
          remove.className = 'ux-pending-delete';
          remove.addEventListener('click', () => deleteOriginal.click());
          rowActions.append(remove);
        }
        item.append(type, details, amount, due, rowActions);
        list.append(item);
      }
      if (!rows.length) {
        tableHead.hidden = true;
        list.append(text('p', 'Nenhuma pendência neste mês. Consulte todos os lançamentos para revisar o período.'));
      } else {
        tableHead.hidden = false;
      }
    }
    new MutationObserver(refresh).observe($('entriesList'), {childList:true});
    refresh();
  }
  // Complete keyboard navigation for existing dialogs without changing form handlers.
  const dialogs=[...document.querySelectorAll('.modal')];const previousFocus=new WeakMap();let outsideFocus=document.activeElement;document.addEventListener('focusin',event=>{if(!event.target.closest('.modal'))outsideFocus=event.target;});
  for(const modal of dialogs){modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.tabIndex=-1;const heading=modal.querySelector('h2');if(heading){if(!heading.id)heading.id=modal.id+'Title';modal.setAttribute('aria-labelledby',heading.id);}let open=!modal.classList.contains('hidden');new MutationObserver(()=>{const next=!modal.classList.contains('hidden');if(next===open)return;open=next;if(open){previousFocus.set(modal,outsideFocus);(modal.querySelector('input:not([type="hidden"]):not([disabled]),button')||modal).focus();}else{const prior=previousFocus.get(modal);if(prior?.isConnected)prior.focus();}}).observe(modal,{attributes:true,attributeFilter:['class']});}
  document.addEventListener('keydown',e=>{const modal=dialogs.find(d=>!d.classList.contains('hidden'));if(!modal)return;if(e.key==='Escape'){e.preventDefault();modal.querySelector('.modal-close')?.click();}if(e.key==='Tab'){const items=[...modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=items[0],last=items[items.length-1];if(!first){e.preventDefault();modal.focus();}else if(e.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){e.preventDefault();first.focus();}}});
  if(location.pathname.endsWith('/dashboard.html')){
    const grid=$('homeSummaryGrid');
    const pendingRoot=$('pendingConfirmationList');
    const periodLabel=$('homePeriodLabel');
    const metricIcons={
      goal:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.5"/><path d="m13.5 10.5 5-5M16 5.5h2.5V8"/>',
      cash:'<rect x="3" y="5" width="18" height="15" rx="2.5"/><path d="M3 9h18M7 5V3h10v2M14 13h4v3h-4z"/>',
      expenses:'<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 8h10M7 12h4M7 16h7M16 12h1"/>',
      calendar:'<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M7.5 13h3M13.5 13h3"/>',
      pending:'<rect x="4" y="3.5" width="13" height="17" rx="2"/><path d="M8 8h5M8 12h5M8 16h3M17 7l3 3-3 3"/>',
      check:'<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-6"/>',
    };
    const icon=(name,className)=>{const el=text('span','');el.className=className;el.setAttribute('aria-hidden','true');el.innerHTML=`<svg viewBox="0 0 24 24">${metricIcons[name]||metricIcons.pending}</svg>`;return el;};
    const dateSort=(entry)=>String(entry.due_date||'9999-12-31').slice(0,10);
    const goToConfirmation=(entry)=>{
      const action=entry.type==='income'?'receive':'pay';
      const view=entry.type==='income'?'receitas':'despesas';
      window.location.href=`/planejamento.html?view=${view}&confirmEntry=${encodeURIComponent(entry.id)}&confirmAction=${action}`;
    };
    if(periodLabel){periodLabel.textContent=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'America/Bahia'}).format(new Date());}
    summary().then(data=>{
      const plan=data.goalPlan,t=data.totals||{};
      const entries=(data.entries||[]).filter(e=>e&&Number(e.paid)!==1&&(e.type==='expense'||e.type==='income')).sort((a,b)=>dateSort(a).localeCompare(dateSort(b)));
      const upcomingExpenses=entries.filter(e=>e.type==='expense'&&dateSort(e)>=today().slice(0,10)&&dateSort(e).slice(0,7)===today().slice(0,7));
      const next=upcomingExpenses[0];
      const goal=plan?.displayDailyGoal??t.dailyGoal;
      if(grid){
        grid.replaceChildren();
        const metrics=[
          ['goal','Meta de hoje',goal==null?'Revisar planejamento':fmt(goal),(plan?.availableWorkingDays??t.availableWorkingDays??0)+' dias disponíveis'],
          ['cash','Saldo em caixa',plan?fmt(plan.cashBalance):'Consultar planejamento','Inclui adiantamentos e devoluções da casa'],
          ['expenses','Despesas do mês',fmt(t.expense||0),'Inclui sua parte das contas da casa'],
          ['calendar','Próximo vencimento',next?fmt(next.amount):'Nenhum neste mês',next?`${next.name} · ${dateLabel(dateSort(next))}`:'Consulte as pendências para ver os próximos lançamentos']
        ];
        for(const [iconName,label,value,help] of metrics){
          const a=text('a','');a.href='/planejamento.html';a.className='ux-home-metric';
          const labelEl=text('span',label);labelEl.className='ux-home-metric-label';
          const valueEl=text('strong',value);valueEl.className='ux-home-metric-value';
          const helpEl=text('small',help);helpEl.className='ux-home-metric-help';
          a.append(icon(iconName,'ux-home-metric-icon'),labelEl,valueEl,helpEl);grid.append(a);
        }
      }
      if(pendingRoot){
        pendingRoot.replaceChildren();
        if(!entries.length){
          const empty=text('div','');empty.className='ux-home-empty';empty.append(icon('check','ux-home-empty-icon'),text('p','Tudo em dia — não há lançamentos pendentes para confirmar neste mês.'));pendingRoot.append(empty);
        }else{
          for(const entry of entries.slice(0,3)){
            const row=text('article','');row.className='ux-home-pending-row';
            const iconWrap=icon('pending','ux-home-pending-icon');
            const details=text('div','');details.className='ux-home-pending-details';
            details.append(text('strong',entry.name|| (entry.type==='income'?'Recebimento':'Despesa')));
            details.append(text('small',`${entry.type==='income'?'Ganho':'Despesa'} · ${fmt(entry.amount)}`));
            const due=text('div','');due.className='ux-home-pending-date';
            due.append(icon('calendar','ux-home-date-icon'),text('span','Vencimento'),text('strong',dateSort(entry)!=='9999-12-31'?dateLabel(dateSort(entry)):'Data não informada'));
            const action=text('a',entry.type==='income'?'Confirmar recebimento':'Confirmar pagamento');action.className='ux-home-confirm-btn';action.href='#';action.addEventListener('click',event=>{event.preventDefault();goToConfirmation(entry);});
            row.append(iconWrap,details,due,action);pendingRoot.append(row);
          }
          if(entries.length>3){const more=text('a',`Ver mais ${entries.length-3} pendências →`);more.href='/planejamento.html';more.className='ux-home-more-pending';pendingRoot.append(more);}
        }
      }
      document.dispatchEvent(new CustomEvent('rota-content-ready'));
    }).catch(error=>{
      if(grid){grid.replaceChildren();const errorText=text('p',error.message||'Não foi possível carregar os indicadores.');errorText.className='ux-home-error';grid.append(errorText);}
      if(pendingRoot){pendingRoot.replaceChildren();const errorText=text('p','Não foi possível carregar as pendências. Abra o planejamento para consultar seus lançamentos.');errorText.className='ux-home-error';pendingRoot.append(errorText);}
      document.dispatchEvent(new CustomEvent('rota-content-error'));
    });
  }
})();
