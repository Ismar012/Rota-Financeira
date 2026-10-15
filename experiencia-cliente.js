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
  $('quickRest')?.addEventListener('click',()=> $('menuRest')?.click());
  if($('entriesList')){
    const panel=text('section','');panel.className='ux-panel';panel.setAttribute('aria-labelledby','uxPendingTitle');const title=text('h2','Próximos compromissos');title.id='uxPendingTitle';panel.append(title,text('p','Confirme apenas o que já recebeu ou pagou.'));
    const list=text('div','');panel.append(list);const all=text('button','Ver todos os lançamentos');all.type='button';all.className='secondary-btn';all.addEventListener('click',()=>{const section=$('entriesSection');$('entriesDisclosure').open=true;section.classList.remove('hidden');section.scrollIntoView({behavior:'smooth',block:'start'});$('entriesFilter')?.focus({preventScroll:true});});panel.append(all);
    const overview=text('div','');overview.className='ux-overview';document.querySelector('.summary-grid').after(overview);overview.append(chart,panel);
    document.addEventListener('rota-entries', event => {
      list.replaceChildren();
      const rows=(event.detail||[]).filter(e=>Number(e.paid)!==1).sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date)));
      title.textContent='Próximos compromissos'+(rows.length?' · '+rows.length:'');
      for(const entry of rows.slice(0,3)){
        const item=text('div','');item.className='ux-pending-row';
        const info=text('div','');const due=String(entry.due_date).slice(0,10);info.append(text('strong',entry.name),text('small',(due<today()?'Vencido · ':'')+(entry.type==='income'?'A receber':'A pagar')+' · '+dateLabel(due)));
        const value=text('strong',fmt(entry.amount));value.className=entry.type==='income'?'positive':'negative';
        const button=text('button',entry.type==='income'?'Confirmar recebimento':'Confirmar pagamento');button.type='button';button.className='secondary-btn';
        button.addEventListener('click',()=>{const filter=$('entriesFilter');filter.value='all';filter.dispatchEvent(new Event('change'));$('entriesList').querySelector('[data-id="'+Number(entry.id)+'"][data-action="'+(entry.type==='income'?'receive':'pay')+'"]').click();});
        item.append(info,value,button);list.append(item);
      }
      if(!rows.length)list.append(text('p',(event.detail||[]).length?'Tudo confirmado neste mês. Continue registrando suas movimentações.':'Nenhum compromisso cadastrado neste mês. Comece pelos botões de ganho ou despesa.'));
      if(rows.length>3)list.append(text('p','Mostrando 3 de '+rows.length+' pendências. Consulte a lista completa abaixo.'));
    });
  }
  // Complete keyboard navigation for existing dialogs without changing form handlers.
  const dialogs=[...document.querySelectorAll('.modal')];const previousFocus=new WeakMap();let outsideFocus=document.activeElement;document.addEventListener('focusin',event=>{if(!event.target.closest('.modal'))outsideFocus=event.target;});
  for(const modal of dialogs){modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.tabIndex=-1;const heading=modal.querySelector('h2');if(heading){if(!heading.id)heading.id=modal.id+'Title';modal.setAttribute('aria-labelledby',heading.id);}let open=!modal.classList.contains('hidden');new MutationObserver(()=>{const next=!modal.classList.contains('hidden');if(next===open)return;open=next;if(open){previousFocus.set(modal,outsideFocus);(modal.querySelector('input:not([type="hidden"]):not([disabled]),button')||modal).focus();}else{const prior=previousFocus.get(modal);if(prior?.isConnected)prior.focus();}}).observe(modal,{attributes:true,attributeFilter:['class']});}
  document.addEventListener('keydown',e=>{const modal=dialogs.find(d=>!d.classList.contains('hidden'));if(!modal)return;if(e.key==='Escape'){e.preventDefault();modal.querySelector('.modal-close')?.click();}if(e.key==='Tab'){const items=[...modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=items[0],last=items[items.length-1];if(!first){e.preventDefault();modal.focus();}else if(e.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){e.preventDefault();first.focus();}}});
  if(location.pathname.endsWith('/dashboard.html')){
    const root=document.querySelector('.cards');if(!root)return;const panel=text('section','');panel.className='ux-panel';panel.append(text('h2','Seu planejamento de hoje'));const content=text('p','Carregando resumo…');content.setAttribute('role','status');panel.append(content);root.before(panel);
    summary().then(data=>{content.remove();const p=data.goalPlan,t=data.totals||{};const entries=(data.entries||[]).filter(e=>e.type==='expense'&&Number(e.paid)!==1&&String(e.due_date).slice(0,10)>=today()&&String(e.due_date).slice(0,7)===today().slice(0,7)).sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date)));const next=entries[0];const grid=text('div','');grid.className='ux-home-grid';const goal=p?.displayDailyGoal??t.dailyGoal;for(const [label,value,help] of [['Meta de hoje',goal==null?'Revisar planejamento':fmt(goal),(p?.availableWorkingDays??t.availableWorkingDays??0)+' dias disponíveis'],['Saldo disponível',p?fmt(p.availableBalance):'Consultar planejamento','Dinheiro considerado na meta'],['Próximo vencimento',next?fmt(next.amount):'Nenhum neste mês',next?next.name+' · '+dateLabel(String(next.due_date).slice(0,10)):'Consulte também as pendências vencidas']]){const a=text('a','');a.href='/planejamento.html';a.append(text('span',label),text('strong',value),text('small',help));grid.append(a);}panel.append(grid);}).catch(error=>{content.textContent=error.message;});
  }
})();
