'use strict';
const el=id=>document.getElementById(id),money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=t=>p.find(x=>x.type===t).value;return `${g('year')}-${g('month')}-${g('day')}`;};
async function api(url,options={}){const r=await fetch(url,{credentials:'same-origin',...options});const d=await r.json();if(!r.ok)throw Error(d.error||'Não foi possível concluir.');return d;}
const post=(url,body)=>api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
let state={members:[],expenses:[]},paying=null;const active=()=>state.members.filter(p=>p.active!==false),name=id=>state.members.find(p=>p.id===id)?.name||id,owner=()=>name('me');
function shareText(n){return money(Math.abs(n))+(n>0?' a receber':n<0?' a devolver':' — acertado');}
function options(select,people){const previous=select.value;select.innerHTML='<option value="equal">Todos pagaram sua parte</option>'+people.map(p=>`<option value="person:${esc(p.id)}">${esc(p.name)} pagou tudo</option>`).join('')+'<option value="custom">Informar quanto cada pessoa pagou</option>';if([...select.options].some(x=>x.value===previous))select.value=previous;}
function paymentFields(container,people){container.innerHTML=people.map(p=>`<label>${esc(p.name)} pagou (R$)<input type="number" data-person="${esc(p.id)}" min="0" max="1000000" step="0.01" value="0"></label>`).join('');}
function payments(select,container,ids,total){if(select.value==='custom')return [...container.querySelectorAll('[data-person]')].map(i=>({id:i.dataset.person,amount:Number(i.value)}));if(select.value.startsWith('person:'))return [{id:select.value.slice(7),amount:total/100}];const base=Math.floor(total/ids.length),extra=total%ids.length;return ids.map((id,i)=>({id,amount:(base+(i<extra?1:0))/100}));}
function mode(){const fixed=el('recurrence').value==='fixed';el('paid').disabled=fixed;if(fixed)el('paid').value='false';const paid=!fixed&&el('paid').value==='true';el('payer').disabled=!paid;el('expensePayments').hidden=!paid||el('payer').value!=='custom';}
function paymentDescription(x){if(!x.paid)return 'Prevista — aguardando pagamento';return (x.allocations||[]).filter(p=>p.paid_cents>0).map(p=>name(p.id)+' pagou '+money(p.paid_cents)).join(' · ');}
function render(){const d=state;el('total').textContent=money(d.expenses.reduce((a,x)=>a+x.total_cents,0));el('share').textContent=money(d.expenses.reduce((a,x)=>a+x.share_cents,0));el('balance').textContent=money(Math.abs(d.balance));el('direction').textContent=d.balance>0?owner()+' tem valor a receber neste mês':d.balance<0?owner()+' tem valor a devolver neste mês':'Nenhuma diferença gerada neste mês';el('previousBalance').textContent='Saldo de acertos anterior ao mês: '+shareText(d.previousBalance||0);el('closingBalance').textContent='Saldo de acertos de '+owner()+' ao fim do mês: '+shareText(d.closingBalance||0);
el('memberBalances').innerHTML=d.members.map(p=>{const balance=Number(p.balance||0);const status=balance>0?'Tem a receber':balance<0?'Deve devolver':'Acertado';const statusClass=balance>0?'receive':balance<0?'return':'settled';return `<div class="entry"><div class="rf-member-identity"><strong>${esc(p.name)}${p.id==='me'?' (você)':''}${p.active===false?' · inativo':''}</strong><small>Morador</small></div><div class="rf-member-stat"><span>Anterior</span><strong>${shareText(p.previous||0)}</strong></div><div class="rf-member-stat"><span>No mês</span><strong>${shareText(p.month||0)}</strong></div><div class="rf-member-stat"><span>Saldo</span><strong>${shareText(p.balance||0)}</strong></div><span class="rf-member-status ${statusClass}">${status}</span></div>`;}).join('');el('transfers').innerHTML=(d.transfers||[]).map((t,i)=>`<div class="entry"><p>${esc(name(t.from))} devolve <strong>${money(t.amount_cents)}</strong> a ${esc(name(t.to))}</p><button type="button" data-transfer="${i}" style="float:none">Preencher devolução</button></div>`).join('')||'<p>Todos acertados até o fim deste mês.</p>';el('transfers').querySelectorAll('[data-transfer]').forEach(b=>b.onclick=()=>{const t=d.transfers[Number(b.dataset.transfer)];el('settleFrom').value=t.from;el('settleTo').value=t.to;el('settleAmount').value=(t.amount_cents/100).toFixed(2);el('settleAmount').focus();el('settleDialog')?.showModal();});
for(const id of ['settleFrom','settleTo'])el(id).innerHTML=d.members.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');el('settleTo').value=d.members.find(p=>p.id!=='me')?.id||'';
options(el('payer'),active());paymentFields(el('expensePayments'),active());mode();
el('recurringEntries').innerHTML=(d.recurring||[]).map(x=>`<div class="entry"><button data-stop="${x.id}">Encerrar repetição</button><strong>${esc(x.description)}</strong><p>${money(x.total_cents)} por mês · divisão entre ${active().length} pessoas<br>Vencimento: dia ${Number(x.first_due.slice(8,10))}</p></div>`).join('')||'<p>Nenhuma conta fixa ativa.</p>';
el('entries').innerHTML=[...d.expenses.map(x=>({...x,kind:'expenses'})),...d.settlements.map(x=>({...x,kind:'settlements'}))].sort((a,b)=>String(b.due_date||b.day).localeCompare(String(a.due_date||a.day))).map(x=>`<div class="entry"><button data-kind="${x.kind}" data-id="${x.id}">Excluir</button><small>${esc(x.due_date||x.day)}${x.recurring_id?' · Fixa':''}</small><br><strong>${esc(x.description||'Devolução registrada')}</strong><p>${x.kind==='expenses'?money(x.total_cents)+' · '+esc(paymentDescription(x))+'<br>Minha parte no planejamento: '+money(x.share_cents)+'<br>Dividida entre '+(x.allocations||[]).length+' pessoas':money(x.amount_cents??Math.abs(x.delta_cents))+' · '+esc(name(x.from_member||(x.delta_cents>0?'me':'other')))+' devolveu a '+esc(name(x.to_member||(x.delta_cents>0?'other':'me')))}</p>${x.kind==='expenses'&&!x.paid?`<button data-pay="${x.id}" style="float:none">Confirmar pagamentos</button>`:''}</div>`).join('')||'<p>Nenhum lançamento neste mês.</p>';
el('entries').querySelectorAll('[data-id]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir este registro e recalcular o planejamento e o acerto?'))return;await action(()=>api('/api/house/'+b.dataset.kind+'/'+b.dataset.id,{method:'DELETE'}));});el('entries').querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>{paying=d.expenses.find(x=>String(x.id)===b.dataset.pay);el('payDate').value=today();const people=paying.allocations.map(p=>({id:p.id,name:name(p.id)}));options(el('payPayer'),people);paymentFields(el('confirmationPayments'),people);el('confirmationPayments').hidden=el('payPayer').value!=='custom';el('payDialog').showModal();});el('recurringEntries').querySelectorAll('[data-stop]').forEach(b=>b.onclick=async()=>{if(!confirm('Encerrar repetição? Parcelas não pagas de hoje em diante serão removidas.'))return;await action(()=>api('/api/house/recurring/'+b.dataset.stop,{method:'DELETE'}));});}
async function load(){try{state=await api('/api/house?month='+encodeURIComponent(el('houseMonth').value));render();}catch(e){el('feedback').textContent=e.message;}}
async function action(fn){try{await fn();await load();el('feedback').textContent='Registro salvo. Planejamento e acertos atualizados.';}catch(e){el('feedback').textContent=e.message;}}
el('recurrence').onchange=mode;el('paid').onchange=mode;el('payer').onchange=mode;el('payPayer').onchange=()=>el('confirmationPayments').hidden=el('payPayer').value!=='custom';
el('expense').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;try{const data=Object.fromEntries(new FormData(e.target)),fixed=data.recurrence==='fixed';data.paid=!fixed&&data.paid==='true';delete data.payer;data.equal_paid=el('payer').value==='equal';data.payments=data.paid?payments(el('payer'),el('expensePayments'),active().map(p=>p.id),Math.round(Number(data.amount)*100)):[];await post(fixed?'/api/house/recurring':'/api/house',data);e.target.reset();el('day').value=today();el('expenseDialog')?.close();await load();el('feedback').textContent='Despesa salva e integrada ao planejamento.';}catch(err){el('feedback').textContent=err.message;}finally{b.disabled=false;}};
el('settle').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;try{await post('/api/house/settle',Object.fromEntries(new FormData(e.target)));await load();el('settleDialog')?.close();el('feedback').textContent='Devolução registrada e acertos atualizados.';}catch(err){el('feedback').textContent=err.message;}finally{b.disabled=false;}};
el('payForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;try{await post('/api/house/expenses/'+paying.id+'/pay',{day:el('payDate').value,equal_paid:el('payPayer').value==='equal',payments:payments(el('payPayer'),el('confirmationPayments'),paying.allocations.map(p=>p.id),paying.total_cents)});el('payDialog').close();await load();el('feedback').textContent='Pagamento confirmado.';}catch(err){el('feedback').textContent=err.message;el('payDialog').close();}finally{b.disabled=false;}};el('closePay').onclick=()=>el('payDialog').close();
function personRow(p){const row=document.createElement('div');row.className='entry row';const label=document.createElement('label');label.textContent=p.id==='me'?'Seu nome':'Nome da pessoa';const input=document.createElement('input');input.value=p.name;input.required=true;input.maxLength=80;input.dataset.member=p.id;label.append(input);row.append(label);if(p.id!=='me'){const b=document.createElement('button');b.type='button';b.textContent='Remover';b.onclick=()=>row.remove();row.append(b);}el('peopleRows').append(row);}
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
  return '<option value="equal">Todos pagaram sua parte</option>'+people.map(p=>`<option value="person:${esc(p.id)}">${esc(p.name)} pagou tudo</option>`).join('');
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
  return {description:get('description').trim(),amount:Number(get('amount')),recurrence:get('recurrence')||'single',day:get('day'),paid:get('paid')==='true',payer:get('payer')||'equal'};
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
  const button=el('submitHouseBulkExpenses');const rows=[...el('bulkHouseExpenseRows').querySelectorAll('[data-house-bulk-row]')];
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
      const payload={recurrence:v.recurrence,description:v.description,day:v.day,amount:v.amount,paid,equal_paid:paid&&v.payer==='equal',payments:paymentRows};
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

el('day').value=today();el('houseMonth').value=today().slice(0,7);el('houseMonth').onchange=load;el('downloadHouseReport')?.addEventListener('click',()=>{const month=el('houseMonth')?.value||today().slice(0,7);location.href='/api/house/report?month='+encodeURIComponent(month);});mode();load();
