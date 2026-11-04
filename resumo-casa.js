'use strict';
const el=id=>document.getElementById(id),money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=t=>p.find(x=>x.type===t).value;return `${g('year')}-${g('month')}-${g('day')}`;};
async function api(url,options={}){const r=await fetch(url,{credentials:'same-origin',...options});const d=await r.json();if(!r.ok)throw Error(d.error||'Não foi possível concluir.');return d;}
const post=(url,body)=>api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
let state={members:[],expenses:[]},paying=null;
const houseCategoryNames=()=>window.RotaFinanceCategories?.get('expense')||['Casa','Veículo','Lazer','Alimentação','Outros','Estudos'];
const bulkHouseCategoryOptions=()=>houseCategoryNames().map(n=>`<option value="${esc(n)}"${n==='Outros'?' selected':''}>${esc(n)}</option>`).join('');
function fillHouseCategorySelect(select,selected='Outros'){
 if(window.RotaFinanceCategories)window.RotaFinanceCategories.fill(select,'expense',selected);
 else {select.replaceChildren(...houseCategoryNames().map(n=>new Option(n,n)));if(!houseCategoryNames().includes(selected))select.add(new Option(selected+' (categoria anterior)',selected));select.value=selected;}
}
async function loadHouseCategoryCatalog(){try{await window.RotaFinanceCategories?.load();fillHouseCategorySelect(el('houseCategory'),el('houseCategory')?.value||'Outros');document.querySelectorAll('[data-house-bulk-field="financial_category"]').forEach(select=>fillHouseCategorySelect(select,select.value));}catch(error){console.warn('Não foi possível consultar catálogo de categorias:',error.message);}}
const active=()=>state.members.filter(p=>p.active!==false),name=id=>state.members.find(p=>p.id===id)?.name||id,owner=()=>name('me');
function shareText(n){return money(Math.abs(n))+(n>0?' a receber':n<0?' a devolver':' — acertado');}
function options(select,people){const previous=select.value;select.innerHTML='<option value="equal">Todos pagaram sua parte</option>'+people.map(p=>`<option value="person:${esc(p.id)}">${p.id==='me'?'Paguei tudo':esc(p.name)+' pagou tudo'}</option>`).join('')+'<option value="custom">Informar quanto cada pessoa pagou</option>';if([...select.options].some(x=>x.value===previous))select.value=previous;}
function paymentFields(container,people){container.innerHTML=people.map(p=>`<label>${esc(p.name)} pagou (R$)<input type="number" data-person="${esc(p.id)}" min="0" max="1000000" step="0.01" value="0"></label>`).join('');}
function payments(select,container,ids,total){if(select.value==='custom')return [...container.querySelectorAll('[data-person]')].map(i=>({id:i.dataset.person,amount:Number(i.value)}));if(select.value.startsWith('person:'))return [{id:select.value.slice(7),amount:total/100}];const base=Math.floor(total/ids.length),extra=total%ids.length;return ids.map((id,i)=>({id,amount:(base+(i<extra?1:0))/100}));}
function mode(){const fixed=el('recurrence').value==='fixed';el('paid').disabled=fixed;if(fixed)el('paid').value='false';const paid=!fixed&&el('paid').value==='true';el('payer').disabled=!paid;el('expensePayments').hidden=!paid||el('payer').value!=='custom';}
function paymentDescription(x){if(!x.paid)return 'Prevista — aguardando pagamento';return (x.allocations||[]).filter(p=>p.paid_cents>0).map(p=>(p.id==='me'?'Você pagou':name(p.id)+' pagou')+' '+money(p.paid_cents)).join(' · ');}
function render(){const d=state;el('houseDivision').textContent='Divisão: '+active().map(p=>((p.percentage_bp??5000)/100).toLocaleString('pt-BR')+'%').join(' / ');el('total').textContent=money(d.expenses.reduce((a,x)=>a+x.total_cents,0));el('share').textContent=money(d.expenses.reduce((a,x)=>a+x.share_cents,0));el('balance').textContent=money(Math.abs(d.balance));el('direction').textContent=d.balance>0?(owner()==='Eu'?'Você':owner())+' tem valor a receber neste mês':d.balance<0?(owner()==='Eu'?'Você':owner())+' tem valor a devolver neste mês':'Nenhuma diferença gerada neste mês';el('previousBalance').textContent='Saldo de acertos anterior ao mês: '+shareText(d.previousBalance||0);el('closingBalance').textContent='Saldo de acertos de '+owner()+' ao fim do mês: '+shareText(d.closingBalance||0);
el('memberBalances').innerHTML=d.members.map(p=>{const balance=Number(p.balance||0);const status=balance>0?'Tem a receber':balance<0?'Deve devolver':'Acertado';const statusClass=balance>0?'receive':balance<0?'return':'settled';return `<div class="entry"><div class="rf-member-identity"><strong>${esc(p.name)}${p.id==='me'?' (você)':''}${p.active===false?' · inativo':''}</strong><small>Morador</small></div><div class="rf-member-stat"><span>Anterior</span><strong>${shareText(p.previous||0)}</strong></div><div class="rf-member-stat"><span>No mês</span><strong>${shareText(p.month||0)}</strong></div><div class="rf-member-stat"><span>Saldo</span><strong>${shareText(p.balance||0)}</strong></div><span class="rf-member-status ${statusClass}">${status}</span></div>`;}).join('');el('transfers').innerHTML=(d.transfers||[]).map((t,i)=>`<div class="entry"><p>${esc(name(t.from))} devolve <strong>${money(t.amount_cents)}</strong> a ${esc(name(t.to))}</p><button type="button" data-transfer="${i}" style="float:none">Preencher devolução</button></div>`).join('')||'<p>Todos acertados até o fim deste mês.</p>';el('transfers').querySelectorAll('[data-transfer]').forEach(b=>b.onclick=()=>{const t=d.transfers[Number(b.dataset.transfer)];el('settleFrom').value=t.from;el('settleTo').value=t.to;el('settleAmount').value=(t.amount_cents/100).toFixed(2);el('settleAmount').focus();el('settleDialog')?.showModal();});
for(const id of ['settleFrom','settleTo'])el(id).innerHTML=d.members.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');el('settleTo').value=d.members.find(p=>p.id!=='me')?.id||'';
options(el('payer'),active());paymentFields(el('expensePayments'),active());mode();
el('recurringEntries').innerHTML=(d.recurring||[]).map(x=>`<div class="entry"><button data-stop="${x.id}">Encerrar repetição</button><strong>${esc(x.description)}</strong><p>${money(x.total_cents)} por mês · divisão entre ${active().length} pessoas<br>Vencimento: dia ${Number(x.first_due.slice(8,10))}</p></div>`).join('')||'<p>Nenhuma conta fixa ativa.</p>';
el('entries').innerHTML=[...d.expenses.map(x=>({...x,kind:'expenses'})),...d.settlements.map(x=>({...x,kind:'settlements'}))].sort((a,b)=>String(b.due_date||b.day).localeCompare(String(a.due_date||a.day))).map(x=>`<div class="entry house-entry"><div class="house-entry-content"><small>${esc(x.due_date||x.day)}${x.recurring_id?' · Fixa':''}</small><strong>${esc(x.description||'Devolução registrada')}</strong><p>${x.kind==='expenses'?money(x.total_cents)+' · '+esc(paymentDescription(x))+' · Categoria: '+esc(x.financial_category||'Outros')+'<br>Minha parte no planejamento: '+money(x.share_cents)+'<br>Dividida entre '+(x.allocations||[]).length+' pessoas':money(x.amount_cents??Math.abs(x.delta_cents))+' · '+esc(name(x.from_member||(x.delta_cents>0?'me':'other')))+' devolveu a '+esc(name(x.to_member||(x.delta_cents>0?'other':'me')))}</p></div><div class="house-entry-actions">${x.kind==='expenses'&&!x.paid?`<button type="button" data-pay="${x.id}">Confirmar pagamento</button>`:''}${x.kind==='expenses'?`<button type="button" data-house-edit="${x.id}">Editar</button>`:``}<button type="button" data-kind="${x.kind}" data-id="${x.id}">Excluir</button></div></div>`).join('')||'<p>Nenhum lançamento neste mês.</p>';
el('entries').querySelectorAll('[data-id]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir este registro e recalcular o planejamento e o acerto?'))return;await action(()=>api('/api/house/'+b.dataset.kind+'/'+b.dataset.id,{method:'DELETE'}));});el('entries').querySelectorAll('[data-house-edit]').forEach(b=>b.onclick=()=>openHouseEdit(d.expenses.find(x=>String(x.id)===b.dataset.houseEdit)));el('entries').querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>openHousePayment(d.expenses.find(x=>String(x.id)===b.dataset.pay)));el('recurringEntries').querySelectorAll('[data-stop]').forEach(b=>b.onclick=async()=>{if(!confirm('Encerrar repetição? Parcelas não pagas de hoje em diante serão removidas.'))return;await action(()=>api('/api/house/recurring/'+b.dataset.stop,{method:'DELETE'}));});}
function openHousePayment(entry){if(!entry)return;paying=entry;el('payDate').value=today();const people=(entry.allocations||[]).map(p=>({id:p.id,name:name(p.id)}));options(el('payPayer'),people);paymentFields(el('confirmationPayments'),people);el('confirmationPayments').hidden=el('payPayer').value!=='custom';el('payDialog').showModal();}
let houseMonthlyChart,housePeopleChart;
function renderHouseDashboard(){
 const list=el('housePendingList'); const pending=state.pending||[];
 list.innerHTML=pending.length?pending.map(x=>`<div class="house-pending-row"><div><strong>${esc(x.description)}</strong><small>Pagamento pendente</small></div><strong>${money(x.total_cents)}</strong><span>${esc(String(x.due_date).split('-').reverse().join('/'))}</span><div class="house-pending-actions"><button type="button" data-pending-pay="${Number(x.id)}">Confirmar pagamento</button><button type="button" data-pending-delete="${Number(x.id)}">Excluir</button></div></div>`).join(''):'<p>Nenhuma despesa pendente.</p>';
 list.querySelectorAll('[data-pending-pay]').forEach(b=>b.onclick=()=>openHousePayment(pending.find(x=>String(x.id)===b.dataset.pendingPay)));
 list.querySelectorAll('[data-pending-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Excluir esta despesa da casa e recalcular o planejamento e o acerto?')) await action(()=>api('/api/house/expenses/'+b.dataset.pendingDelete,{method:'DELETE'}));});
 const people=(state.paidByCategory||[]).map(x=>({...x,id:x.category})); const total=people.reduce((n,x)=>n+Number(x.amount),0);
 el('housePeopleLegend').innerHTML=people.map(x=>`<div class="house-legend-row"><span>${esc(x.id)}</span><strong>${money(x.amount)}</strong><span>${total?(100*x.amount/total).toFixed(1).replace('.',','):0}%</span></div>`).join('');
 el('housePieEmpty').hidden=total>0;el('housePeopleChart').hidden=total===0;
 if(!window.Chart){el('houseChartError').hidden=false;return;}
 houseMonthlyChart?.destroy();housePeopleChart?.destroy();
 const months=state.monthlyExpenses||[];const formatMonth=m=>{const [y,n]=m.split('-');return n+'/'+y.slice(2);};
 houseMonthlyChart=new Chart(el('houseMonthlyChart'),{type:'bar',data:{labels:months.map(x=>formatMonth(x.month)),datasets:[{label:'Despesa paga',data:months.map(x=>x.paid/100),backgroundColor:'#55b77b'},{label:'Despesa prevista',data:months.map(x=>x.pending/100),backgroundColor:'#e3ad39'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#d7dfe9'}}},scales:{x:{stacked:true,ticks:{color:'#aeb9c7'},grid:{display:false}},y:{stacked:true,beginAtZero:true,ticks:{color:'#aeb9c7',callback:v=>'R$ '+Number(v).toLocaleString('pt-BR')},grid:{color:'#26323b'}}}}});
 if(total)housePeopleChart=new Chart(el('housePeopleChart'),{type:'pie',data:{labels:people.map(x=>x.id),datasets:[{data:people.map(x=>x.amount/100),backgroundColor:['#e4b64c','#4c9c8c','#5685bb','#c57565','#9f83b9','#77ad60','#ca985b','#5ba6ac','#b4789c','#8f9d64'],borderColor:'#121820',borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#d7dfe9'}}}}});
}
el('houseSeeAll')?.addEventListener('click',()=>{const section=el('houseAllEntries');section.open=true;section.scrollIntoView({behavior:'smooth',block:'start'});});
async function load(){try{state=await api('/api/house?month='+encodeURIComponent(el('houseMonth').value));render();renderHouseDashboard();}catch(e){el('feedback').textContent=e.message;if(/não liberado/.test(e.message))document.querySelectorAll('main button').forEach(b=>{b.disabled=true;b.title='Solicite a liberação deste serviço em Meus serviços.';});}}
async function action(fn){try{await fn();await load();el('feedback').textContent='Registro salvo. Planejamento e acertos atualizados.';}catch(e){el('feedback').textContent=e.message;}}
el('clearHouseEntries')?.addEventListener('click',()=>{
 el('houseOptions').open=false;window.RotaCleanup.open({title:'Excluir lançamentos da casa',month:el('houseMonth').value,chooseType:false,periodHelp:'Na casa, despesas são selecionadas pelo vencimento e devoluções pela data de registro.',
 preview:s=>api('/api/house/entries-preview?'+new URLSearchParams(s)),remove:s=>api('/api/house/entries',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)}),
 done:async r=>{await load();el('feedback').textContent=`Limpeza concluída: ${r.expenses} despesas e ${r.settlements} devoluções excluídas.`;}});
});
document.addEventListener('click', event => { const menu=el('houseOptions'); if (menu?.open && !menu.contains(event.target)) menu.open=false; });
el('recurrence').onchange=mode;el('paid').onchange=mode;el('payer').onchange=mode;el('payPayer').onchange=()=>el('confirmationPayments').hidden=el('payPayer').value!=='custom';
el('expense').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;try{const data=Object.fromEntries(new FormData(e.target)),fixed=data.recurrence==='fixed';data.paid=!fixed&&data.paid==='true';delete data.payer;data.equal_paid=el('payer').value==='equal';data.payments=data.paid?payments(el('payer'),el('expensePayments'),active().map(p=>p.id),Math.round(Number(data.amount)*100)):[];await post(fixed?'/api/house/recurring':'/api/house',data);e.target.reset();el('day').value=today();el('expenseDialog')?.close();await load();el('feedback').textContent='Despesa salva e integrada ao planejamento.';}catch(err){el('feedback').textContent=err.message;}finally{b.disabled=false;}};
el('settle').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;try{await post('/api/house/settle',Object.fromEntries(new FormData(e.target)));await load();el('settleDialog')?.close();el('feedback').textContent='Devolução registrada e acertos atualizados.';}catch(err){el('feedback').textContent=err.message;}finally{b.disabled=false;}};
el('payForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;try{await post('/api/house/expenses/'+paying.id+'/pay',{day:el('payDate').value,equal_paid:el('payPayer').value==='equal',payments:payments(el('payPayer'),el('confirmationPayments'),paying.allocations.map(p=>p.id),paying.total_cents)});el('payDialog').close();await load();el('feedback').textContent='Pagamento confirmado.';}catch(err){el('feedback').textContent=err.message;el('payDialog').close();}finally{b.disabled=false;}};el('closePay').onclick=()=>el('payDialog').close();
function personRow(p){const row=document.createElement('div');row.className='entry row';const label=document.createElement('label');label.textContent=p.id==='me'?'Seu nome':'Nome da pessoa';const input=document.createElement('input');input.value=p.name;input.required=true;input.maxLength=80;input.dataset.member=p.id;label.append(input);row.append(label);if(p.id!=='me'&&!p.connected){const b=document.createElement('button');b.type='button';b.textContent='Remover';b.onclick=()=>row.remove();row.append(b);}el('peopleRows').append(row);}
el('openPeople').onclick=()=>{el('peopleRows').replaceChildren();active().forEach(personRow);el('peopleError').textContent='';el('peopleDialog').showModal();};el('addPerson').onclick=()=>{if(el('peopleRows').querySelectorAll('input').length>=20){el('peopleError').textContent='Limite de 20 pessoas.';return;}personRow({id:'p-'+crypto.randomUUID(),name:''});};el('closePeople').onclick=()=>el('peopleDialog').close();el('peopleForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('.primary');b.disabled=true;try{const members=[...el('peopleRows').querySelectorAll('[data-member]')].map(i=>({id:i.dataset.member,name:i.value}));await post('/api/house/people',{members});await load();el('peopleDialog').close();el('feedback').textContent='Pessoas da casa atualizadas.';}catch(err){el('peopleError').textContent=err.message;}finally{b.disabled=false;}};


// Ações compactas da tela: os formulários individuais abrem em diálogo.
el('openExpenseModal')?.addEventListener('click',()=>el('expenseDialog')?.showModal());
el('closeExpenseDialog')?.addEventListener('click',()=>el('expenseDialog')?.close());
el('cancelExpenseDialog')?.addEventListener('click',()=>el('expenseDialog')?.close());
el('openSettleModal')?.addEventListener('click',()=>el('settleDialog')?.showModal());
el('closeSettleDialog')?.addEventListener('click',()=>el('settleDialog')?.close());
el('cancelSettleDialog')?.addEventListener('click',()=>el('settleDialog')?.close());
el('cancelPay')?.addEventListener('click',()=>el('payDialog')?.close());
el('closeHouseHelpDone')?.addEventListener('click',()=>el('houseHelpDialog')?.close());
el('closeHouseHelpDialog')?.addEventListener('click',()=>el('houseHelpDialog')?.close());
el('houseHelpBtn')?.addEventListener('click',()=>el('houseHelpDialog')?.showModal());
el('cancelPeople')?.addEventListener('click',()=>el('peopleDialog')?.close());

function bulkHousePayerOptions(){
  const people=active();
  return '<option value="equal">Todos pagaram sua parte</option>'+people.map(p=>`<option value="person:${esc(p.id)}">${p.id==='me'?'Paguei tudo':esc(p.name)+' pagou tudo'}</option>`).join('');
}
function updateHouseBulkRow(row){
  if(!row)return;
  const fixed=row.querySelector('[data-house-bulk-field="recurrence"]')?.value==='fixed';
  const paid=row.querySelector('[data-house-bulk-field="paid"]');
  const payer=row.querySelector('[data-house-bulk-field="payer"]');
  if(paid){paid.disabled=fixed;if(fixed)paid.value='false';}
  if(payer)payer.disabled=fixed||paid?.value!=='true';
}
function addHouseBulkRow(values={}){
  const tbody=el('bulkHouseExpenseRows');if(!tbody)return null;
  const tr=document.createElement('tr');tr.dataset.houseBulkRow='';
  const idx=tbody.querySelectorAll('tr').length+1;
  tr.innerHTML=`
    <td class="rf-house-bulk-number">${idx}</td>
    <td><input class="rf-bulk-description" data-house-bulk-field="description" maxlength="160" placeholder="Ex.: mercado" value="${esc(values.description||'')}" aria-label="Descrição da despesa ${idx}"></td>
    <td><select data-house-bulk-field="financial_category" aria-label="Categoria da despesa ${idx}">${bulkHouseCategoryOptions()}</select></td>
    <td><input class="rf-bulk-amount" data-house-bulk-field="amount" type="number" min="0.02" max="1000000" step="0.01" placeholder="0,00" value="${esc(values.amount||'')}" aria-label="Valor total da despesa ${idx}"></td>
    <td><select class="rf-bulk-recurrence" data-house-bulk-field="recurrence" aria-label="Repetição da despesa ${idx}"><option value="single">Uma única vez</option><option value="fixed">Fixa</option></select></td>
    <td><input class="rf-bulk-date" data-house-bulk-field="day" type="date" value="${esc(values.day||today())}" aria-label="Data ou primeiro vencimento da despesa ${idx}"></td>
    <td><select class="rf-bulk-paid" data-house-bulk-field="paid" aria-label="Situação da despesa ${idx}"><option value="true">Já foi paga</option><option value="false">Prevista</option></select></td>
    <td><select class="rf-bulk-payer" data-house-bulk-field="payer" aria-label="Quem pagou a despesa ${idx}">${bulkHousePayerOptions()}</select></td>
    <td><button type="button" class="rf-bulk-remove" data-house-bulk-remove aria-label="Remover linha ${idx}">×</button></td>`;
  tbody.append(tr);
  if(values.recurrence)tr.querySelector('[data-house-bulk-field="recurrence"]').value=values.recurrence;
  if(values.paid!=null)tr.querySelector('[data-house-bulk-field="paid"]').value=String(values.paid);
  if(values.payer)tr.querySelector('[data-house-bulk-field="payer"]').value=values.payer;
  updateHouseBulkRow(tr);renumberHouseBulkRows();return tr;
}
function renumberHouseBulkRows(){
  const rows=[...el('bulkHouseExpenseRows').querySelectorAll('[data-house-bulk-row]')];
  rows.forEach((row,index)=>{const n=index+1;const number=row.querySelector('.rf-house-bulk-number');if(number)number.textContent=n;row.querySelectorAll('[aria-label]').forEach(control=>{const label=control.getAttribute('aria-label').replace(/\s+\d+$/,'');control.setAttribute('aria-label',`${label} ${n}`)});});
  el('bulkHouseExpenseMeta').textContent=`${rows.length} ${rows.length===1?'linha':'linhas'} na tabela. Linhas incompletas não serão cadastradas.`;
}
function houseBulkRowValues(row){
  const get=name=>row.querySelector(`[data-house-bulk-field="${name}"]`)?.value??'';
  return {financial_category:get('financial_category').trim()||'Outros',description:get('description').trim(),amount:Number(get('amount')),recurrence:get('recurrence')||'single',day:get('day'),paid:get('paid')==='true',payer:get('payer')||'equal'};
}
function validateHouseBulkRow(row){
  const v=houseBulkRowValues(row);const fields=['description','amount','day'];let valid=true;
  row.querySelectorAll('[data-house-bulk-field]').forEach(input=>input.removeAttribute('aria-invalid'));
  for(const key of fields){
    const field=row.querySelector(`[data-house-bulk-field="${key}"]`);
    const ok=key==='description'?v.description.length>0:key==='amount'?Number.isFinite(v.amount)&&v.amount>=0.02&&v.amount<=1000000:/^\d{4}-\d{2}-\d{2}$/.test(v.day);
    if(!ok){valid=false;field?.setAttribute('aria-invalid','true');}
  }
  row.classList.toggle('rf-row-incomplete',!valid);row.classList.remove('rf-row-error');
  return valid;
}
function openBulkHouseExpenses(){
  const tbody=el('bulkHouseExpenseRows');if(!tbody)return;
  tbody.replaceChildren();for(let i=0;i<3;i++)addHouseBulkRow();
  el('bulkHouseExpenseStatus').textContent='';el('bulkHouseExpenseDialog')?.showModal();
  tbody.querySelector('[data-house-bulk-field="description"]')?.focus();
}
el('openBulkHouseExpense')?.addEventListener('click',openBulkHouseExpenses);
el('closeBulkHouseExpenseDialog')?.addEventListener('click',()=>el('bulkHouseExpenseDialog')?.close());
el('cancelBulkHouseExpenseDialog')?.addEventListener('click',()=>el('bulkHouseExpenseDialog')?.close());
el('addHouseBulkRow')?.addEventListener('click',()=>{const row=addHouseBulkRow();row?.querySelector('[data-house-bulk-field="description"]')?.focus();el('bulkHouseExpenseStatus').textContent='';});
el('bulkHouseExpenseRows')?.addEventListener('click',event=>{const remove=event.target.closest('[data-house-bulk-remove]');if(!remove)return;remove.closest('[data-house-bulk-row]')?.remove();renumberHouseBulkRows();});
el('bulkHouseExpenseRows')?.addEventListener('change',event=>{const row=event.target.closest('[data-house-bulk-row]');if(!row)return;if(event.target.matches('[data-house-bulk-field="recurrence"],[data-house-bulk-field="paid"]'))updateHouseBulkRow(row);if(event.target.matches('[data-house-bulk-field]'))validateHouseBulkRow(row);});
el('bulkHouseExpenseRows')?.addEventListener('input',event=>{const row=event.target.closest('[data-house-bulk-row]');if(row&&event.target.matches('[data-house-bulk-field="description"],[data-house-bulk-field="amount"],[data-house-bulk-field="day"]'))validateHouseBulkRow(row);});
async function submitHouseBulkExpenses(){
  const button=el('submitHouseBulkExpenses');const rows=[...el('bulkHouseExpenseRows').querySelectorAll('[data-house-bulk-row]')].filter(row=>{const v=houseBulkRowValues(row);if(v.description||v.amount)return true;row.remove();return false;});
  const ready=rows.filter(validateHouseBulkRow);
  if(!ready.length){el('bulkHouseExpenseStatus').textContent='Preencha descrição, valor e data em pelo menos uma linha completa.';return;}
  button.disabled=true;button.textContent='Salvando despesas…';let saved=0,failed=0;
  try{
    for(const row of ready){
      const v=houseBulkRowValues(row);const fixed=v.recurrence==='fixed';const paid=!fixed&&v.paid;const ids=active().map(p=>p.id);const cents=Math.round(v.amount*100);
      let paymentRows=[];
      if(paid&&ids.length){
        if(v.payer.startsWith('person:'))paymentRows=[{id:v.payer.slice(7),amount:v.amount}];
        else{const base=Math.floor(cents/ids.length),extra=cents%ids.length;paymentRows=ids.map((id,index)=>({id,amount:(base+(index<extra?1:0))/100}));}
      }
      const payload={financial_category:v.financial_category,recurrence:v.recurrence,description:v.description,day:v.day,amount:v.amount,paid,equal_paid:paid&&v.payer==='equal',payments:paymentRows};
      try{await post(fixed?'/api/house/recurring':'/api/house',payload);row.remove();saved++;}
      catch(error){failed++;row.classList.add('rf-row-error');row.dataset.error=error.message;row.title=error.message;}
    }
    await load();renumberHouseBulkRows();
    const remaining=el('bulkHouseExpenseRows').querySelectorAll('[data-house-bulk-row]').length;
    const parts=[];if(saved)parts.push(`${saved} ${saved===1?'despesa cadastrada':'despesas cadastradas'}`);if(remaining)parts.push(`${remaining} ${remaining===1?'linha ficou':'linhas ficaram'} na tabela para correção ou preenchimento`);
    el('bulkHouseExpenseStatus').textContent=parts.join('. ')+(parts.length?'.':'');
    if(failed&&remaining)el('bulkHouseExpenseStatus').textContent+=` ${failed} ${failed===1?'linha apresentou erro':'linhas apresentaram erro'}; confira os campos destacados.`;
    if(saved)el('feedback').textContent=`${saved} ${saved===1?'despesa da casa cadastrada':'despesas da casa cadastradas'}.`;
    if(saved&&remaining===0)el('bulkHouseExpenseDialog')?.close();
  }finally{button.disabled=false;button.textContent='Salvar despesas preenchidas';}
}
el('submitHouseBulkExpenses')?.addEventListener('click',submitHouseBulkExpenses);

el('day').value=today();el('houseMonth').value=sessionStorage.getItem('rf-house-month')||today().slice(0,7);el('houseMonth').onchange=()=>{sessionStorage.setItem('rf-house-month',el('houseMonth').value);load();};loadHouseCategoryCatalog();el('downloadHouseReport')?.addEventListener('click',()=>{const month=el('houseMonth')?.value||today().slice(0,7);window.rotaDownload('/api/house/report?month='+encodeURIComponent(month),'Resumo_da_Casa_'+month+'.pdf').catch(e=>el('feedback').textContent=e.message);});mode();load();

el('entries').addEventListener('click',e=>{const b=e.target.closest('[data-edit-category]');if(!b)return;const entry=state.expenses.find(x=>String(x.id)===b.dataset.editCategory);if(!entry)return;const d=document.createElement('dialog');d.className='rf-cleanup';d.innerHTML='<h2>Editar categoria</h2><form><label>Categoria<select name="category" required></select></label><div class="rf-cleanup-actions"><button type="button">Cancelar</button><button type="submit">Salvar categoria</button></div><p role="alert"></p></form>';document.body.append(d);const categorySelect=d.querySelector('select[name="category"]');const previous=entry.financial_category||'Outros';fillHouseCategorySelect(categorySelect,previous);d.querySelector('[type=button]').onclick=()=>d.close();d.onclose=()=>d.remove();d.querySelector('form').onsubmit=async e=>{e.preventDefault();const submit=d.querySelector('[type=submit]');submit.disabled=true;try{await api('/api/house/expenses/'+entry.id+'/category',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({financial_category:categorySelect.value})});d.close();await load();}catch(err){d.querySelector('[role=alert]').textContent=err.message;submit.disabled=false;}};d.showModal();});

function houseDialog(title,html){const d=document.createElement('dialog');d.className='rf-share-dialog';d.innerHTML='<div class="rf-share-heading"><h2>'+esc(title)+'</h2><button type="button" data-close aria-label="Fechar">×</button></div>'+html;document.body.append(d);d.querySelector('[data-close]').onclick=()=>d.close();d.onclose=()=>d.remove();d.showModal();return d;}
function openHouseEdit(entry){if(!entry)return;const d=houseDialog('Editar despesa da casa','<form><label>Descrição<input name="description" maxlength="160" required></label><label>Categoria<select name="financial_category"></select></label><div class="rf-share-grid"><label>Valor total<input name="amount" type="number" min="0.02" max="1000000" step="0.01" required></label><label>Vencimento<input name="due_date" type="date" required></label></div><label class="rf-edit-check"><input name="paid" type="checkbox">Despesa paga</label><div data-paid-fields><label>Data efetiva do pagamento<input name="paid_date" type="date" max="'+today()+'"></label><label>Quem pagou?<select name="payer"></select></label><div data-payments></div></div><p>Esta edição altera somente este lançamento. A divisão registrada da despesa é preservada.</p><p role="alert"></p><button type="submit" class="primary">Salvar alterações</button></form>');const f=d.querySelector('form');f.elements.description.value=entry.description;f.elements.amount.value=(entry.total_cents/100).toFixed(2);f.elements.due_date.value=entry.due_date;fillHouseCategorySelect(f.elements.financial_category,entry.financial_category||'Outros');f.elements.paid.checked=entry.paid;f.elements.paid_date.value=entry.paid?entry.day:today();const people=entry.allocations.map(p=>({id:p.id,name:name(p.id)}));options(f.elements.payer,people);paymentFields(d.querySelector('[data-payments]'),people);for(const p of entry.allocations)d.querySelectorAll('[data-person]').forEach(i=>{if(i.dataset.person===p.id)i.value=(p.paid_cents/100).toFixed(2)});const payers=entry.allocations.filter(p=>p.paid_cents>0);f.elements.payer.value=entry.paid?(payers.length===1&&payers[0].paid_cents===entry.total_cents?'person:'+payers[0].id:entry.allocations.every(p=>p.paid_cents===p.share_cents)?'equal':'custom'):'equal';const update=()=>{d.querySelector('[data-paid-fields]').hidden=!f.elements.paid.checked;f.elements.paid_date.required=f.elements.paid.checked;d.querySelector('[data-payments]').hidden=f.elements.payer.value!=='custom'};f.elements.paid.onchange=update;f.elements.payer.onchange=update;update();f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('[type=submit]');b.disabled=true;try{const amount=Number(f.elements.amount.value),paid=f.elements.paid.checked;await api('/api/house/expenses/'+entry.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({description:f.elements.description.value,financial_category:f.elements.financial_category.value,amount,due_date:f.elements.due_date.value,paid,paid_date:paid?f.elements.paid_date.value:null,day:f.elements.due_date.value,equal_paid:f.elements.payer.value==='equal',payments:paid?payments(f.elements.payer,d.querySelector('[data-payments]'),people.map(p=>p.id),Math.round(amount*100)):[]})});d.close();await load();el('feedback').textContent='Despesa e situação de pagamento atualizadas.';}catch(e){f.querySelector('[role=alert]').textContent=e.message;}finally{b.disabled=false}};}
el('houseDivision').onclick=()=>{const people=active(),d=houseDialog('Divisão das despesas','<form><p>Defina a participação de cada pessoa. A soma precisa ser 100%.</p><div data-percentages></div><p>Vale para novos lançamentos e próximas contas fixas ainda não pagas. Despesas anteriores mantêm a divisão registrada.</p><p role="alert"></p><button type="submit" class="primary">Salvar divisão</button></form>');const box=d.querySelector('[data-percentages]');for(const p of people){const label=document.createElement('label');label.textContent=p.name+' (%)';const i=document.createElement('input');i.type='number';i.min='0';i.max='100';i.step='0.01';i.required=true;i.value=String((p.percentage_bp??5000)/100);i.dataset.id=p.id;label.append(i);box.append(label);}d.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=d.querySelector('[type=submit]');b.disabled=true;try{const members=people.map(p=>({...p,percentage_bp:Math.round(Number([...box.querySelectorAll('input')].find(i=>i.dataset.id===p.id).value)*100)}));if(members.reduce((n,p)=>n+p.percentage_bp,0)!==10000)throw Error('As porcentagens precisam somar 100%.');await post('/api/house/people',{members});d.close();await load();}catch(e){d.querySelector('[role=alert]').textContent=e.message;}finally{b.disabled=false}};};
el('houseInvite').onclick=()=>{const eligible=active().filter(p=>!p.connected&&p.id!=='me'),d=houseDialog('Convidar pessoa para a casa','<form><label>E-mail cadastrado<input name="email" type="email" required maxlength="254"></label><label>Vincular a<select name="member"><option value="">Nova pessoa da casa</option>'+eligible.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select></label><p>A pessoa verá o convite ao atualizar a plataforma. Apenas despesas da casa serão compartilhadas. Os lançamentos pessoais continuam privados.</p><p role="alert"></p><button class="primary" type="submit">Gerar convite</button></form>');if(eligible.length)d.querySelector('[name=member]').value=eligible[0].id;d.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('[type=submit]');b.disabled=true;try{const r=await post('/api/house/invites',{email:f.elements.email.value,member_id:f.elements.member.value||null});f.innerHTML='<p>Compartilhe o código somente com a pessoa convidada.</p><strong class="rf-invite-code">'+esc(r.code)+'</strong><p class="rf-share-warning">Não compartilhe este código com qualquer pessoa.</p><p data-countdown></p><p>A pessoa convidada deve atualizar a página (F5) e informar o código. Convite individual, válido por 5 minutos.</p>';const tick=()=>{const left=Math.max(0,Math.ceil((Date.parse(r.expires_at)-Date.now())/1000));const label=f.querySelector('[data-countdown]');if(label)label.textContent=left?'Expira em '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0'):'Código expirado. Feche esta janela e gere um novo convite.';};tick();const timer=setInterval(tick,1000);d.addEventListener('close',()=>clearInterval(timer),{once:true});}catch(e){f.querySelector('[role=alert]').textContent=e.message;b.disabled=false}};};
