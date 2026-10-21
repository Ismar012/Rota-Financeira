(() => {
 'use strict';
 const $=id=>document.getElementById(id),money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
 const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!=null)n.textContent=txt;if(cls)n.className=cls;return n;};
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 // Use the browser's ordinary navigation, with an immediate visible state and no artificial delay.
 document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||e.defaultPrevented||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.target==='_blank'||a.hasAttribute('download'))return;const u=new URL(a.href,location.href);if(u.origin!==location.origin||u.pathname===location.pathname||u.pathname.startsWith('/api/'))return;document.body.classList.add('page-leaving');});
 window.addEventListener('pageshow',()=>document.body.classList.remove('page-leaving'));
 if(document.body.classList.contains('client-settings')){$('feedback')?.setAttribute('role','status');const hint=el('p','Preencha uma nova senha somente se quiser alterá-la.','screen-hint');$('profileForm')?.before(hint);}
 if(document.body.classList.contains('client-services')){$('servicesGrid')?.setAttribute('aria-label','Serviços disponíveis');$('feedback')?.setAttribute('role','status');const hint=el('p','Solicitações são avaliadas pela equipe. O envio não confirma contratação nem pagamento.','screen-hint');$('servicesGrid')?.before(hint);}
 if(!$('clientDetail'))return;
 const detail=$('clientDetail');let panel;
 const wrap=(node,label)=>{if(!node)return;const d=el('details',null,'consult-disclosure');d.append(el('summary',label));node.before(d);d.append(node);return d;};
 wrap(detail.querySelector('.detail-summary'),'Indicadores completos e histórico acumulado');
 wrap(detail.querySelector('.daily-card'),'Consultar a tabela diária');
 const toggle=$('presentationToggle');function present(on){document.body.classList.toggle('presentation-mode',on);toggle.setAttribute('aria-pressed',String(on));toggle.textContent=on?'Encerrar apresentação':'Modo apresentação';}
 toggle?.addEventListener('click',()=>present(!document.body.classList.contains('presentation-mode')));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')present(false);});
 document.addEventListener('rota-client-loading',()=>{panel?.remove();panel=null;detail.classList.remove('consult-error');});
 document.addEventListener('rota-client-error',()=>{detail.classList.add('consult-error');});
 function card(label,value,help){const a=el('article',null,'consult-stat');a.append(el('span',label),el('strong',value),el('small',help));return a;}
 document.addEventListener('rota-goal',()=>queueMicrotask(()=>{const meta=$('metaMensalPanel');if(!meta||$('consultMetaView'))return;const box=el('details',null,'consult-meta-details');box.id='consultMetaView';box.append(el('summary','Composição da meta e ajustes do planejamento'));meta.before(box);box.append(meta);}));
 document.addEventListener('rota-consultation',event=>{
  panel?.remove();panel=el('section',null,'consult-panel');const {summary}=event.detail,p=summary.goalPlan,t=summary.totals||{},entries=summary.entries||[];
  const ref=p?.referenceDate||today(),cash=p?.cashBalance??t.goalCashBalance;
  const asMoney=v=>v==null?'Não disponível':money(v);
  const now=el('section',null,'consult-now');now.append(el('div','POSIÇÃO CONFIRMADA','consult-eyebrow'),el('h2','Onde o cliente está'),el('p','Referência: '+ref.split('-').reverse().join('/')+'. Caixa do planejamento; não é saldo consultado em banco.','consult-caption'));
  const current=el('div',null,'consult-grid');current.append(card('Saldo do planejamento',asMoney(cash),'Saldo inicial + recebimentos − pagamentos'),card('Recebido no mês',asMoney(t.realizedIncome),'Somente recebimentos confirmados'),card('Pago no mês',asMoney(t.paidExpense),'Somente pagamentos confirmados'));now.append(current);
  const next=el('section',null,'consult-next');next.append(el('div','COMPROMISSOS E ESFORÇO NECESSÁRIO','consult-eyebrow'),el('h2','O que precisa acontecer'));
  const future=el('div',null,'consult-grid');future.append(card('Obrigações da meta',asMoney(p?.pendingTotal),'Janela mensal e vencidos considerados na meta'),card('Falta produzir',asMoney(p?.remainingTotal),'Depois do caixa considerado, sem abatê-lo novamente'),card('Meta diária',asMoney(p?.displayDailyGoal),(p?.availableWorkingDays??'—')+' dias disponíveis'));
  next.append(future);const explain=el('button','Explicar a meta','consult-button');explain.type='button';explain.onclick=()=>{if($('consultMetaView'))$('consultMetaView').open=true;const button=$('detailGoal')?.closest('article')?.querySelector('.meta-card-link');button?.click();};next.append(explain);
  if(p&&p.status!=='ready')next.append(el('p','A meta precisa de revisão: '+({needs_setup:'configure a base do planejamento',needs_regularization:'defina os prazos dos vencidos',no_working_days:'existem prazos sem dias disponíveis',cash_inconsistent:'confira o caixa negativo',past:'mês encerrado'}[p.status]||'confira a composição')+'.','consult-alert'));
  panel.append(now,next);
  const scenario=el('section',null,'consult-scenario');scenario.append(el('h2','Cenário dos próximos três meses'),el('p','Hipótese: todos os lançamentos em aberto são recebidos ou pagos nos prazos cadastrados. Vencidos entram no primeiro mês. Não inclui renda ainda não cadastrada nem presume que a meta será atingida.','consult-caption'));
  let balance=cash==null?null:Math.round(Number(cash)*100);const scroll=el('div',null,'consult-scroll'),table=el('table'),head=el('thead'),hr=el('tr');for(const name of ['Período','A receber','A pagar','Saldo após compromissos'])hr.append(el('th',name));head.append(hr);table.append(head);const body=el('tbody');
  const start=ref.slice(0,7),[year,month]=start.split('-').map(Number);
  for(let i=0;i<3;i++){const d=new Date(Date.UTC(year,month-1+i,1)),key=d.toISOString().slice(0,7);let incoming=0,outgoing=0;for(const entry of entries){if(Number(entry.paid)===1)continue;const due=String(entry.due_date||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(due))continue;const target=due.slice(0,7)<start?start:due.slice(0,7);if(target!==key)continue;const cents=Math.round((Number(entry.amount)||0)*100);if(entry.type==='income')incoming+=cents;else if(entry.type==='expense')outgoing+=cents;}
   if(balance!==null)balance+=incoming-outgoing;const row=el('tr');for(const v of [new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'}).format(d),money(incoming/100),money(outgoing/100),balance==null?'Revisar base':money(balance/100)])row.append(el('td',v));if(balance!==null&&balance<0)row.className='consult-negative';body.append(row);
  }
  table.append(body);scroll.append(table);scenario.append(scroll,el('p','O saldo projetado é acumulado entre as linhas. Valores previstos não são dinheiro disponível hoje. Ausência de lançamentos futuros não significa ausência de despesas. Ao selecionar outro mês, esta visão usa os registros atuais e não reconstrói um extrato histórico.','consult-caption'));panel.append(scenario);
  const open=entries.filter(e=>e.type==='expense'&&Number(e.paid)!==1&&String(e.due_date).slice(0,10)<ref);if(open.length)panel.prepend(el('p',open.length+' despesa(s) vencida(s) em aberto. Confirme pagamentos ou revise os prazos antes de apresentar a meta.','consult-alert'));
  detail.querySelector('.detail-head').after(panel);
 });
})();
