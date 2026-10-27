'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const money = new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'});
  const state = { month: '', clients: [], filtered: [] };
  const isoMonth = (date=new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  const shiftMonth = (month, delta) => { const [y,m]=month.split('-').map(Number);const d=new Date(y,m-1+delta,1);return isoMonth(d); };
  const fmt = n => money.format(Number(n)||0);
  async function api(url) { const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||'Não foi possível carregar os dados.'),{status:response.status});return data; }
  const set = (id,value) => { const node=$(id);if(node)node.textContent=value; };
  function showFeedback(message, error=false){ const node=$('reportFeedback');if(node){node.textContent=message;node.classList.toggle('is-error',error);} }
  function option(value,label){const o=document.createElement('option');o.value=String(value);o.textContent=label;return o;}
  function statusLabel(status){return ({free:'Free',trial:'Trial',pagante:'Pagante',inadimplente:'Inadimplente',cancelado:'Cancelado'})[status]||status||'—';}
  function filterClients(){
    const q=$('reportSearch').value.trim().toLocaleLowerCase('pt-BR');
    const selected=$('reportClient').value;
    state.filtered=state.clients.filter(c=>`${c.name||''} ${c.email||''}`.toLocaleLowerCase('pt-BR').includes(q));
    const select=$('reportClient');select.replaceChildren(option('','Selecione um cliente…'));
    state.filtered.forEach(c=>select.append(option(c.id,`${c.name} — ${c.email}`)));
    if(state.filtered.some(c=>String(c.id)===selected))select.value=selected;
    else if(state.filtered.length===1)select.value=String(state.filtered[0].id);
    renderSelected();
  }
  function renderSelected(){
    const c=state.filtered.find(item=>String(item.id)===$('reportClient').value);
    const panel=$('reportClientSummary');panel.hidden=!c;
    if(!c)return;
    const t=c.totals||{};const s=c.status||{};
    set('reportSelectedName',c.name||'Cliente');set('reportSelectedEmail',c.email||'');set('reportSelectedStatus',statusLabel(s.status));
    $('reportSelectedStatus').className=`status-badge status-${s.status||'free'}`;
    set('reportIncome',fmt(t.income));set('reportExpenses',fmt(t.expense));set('reportCashflow',fmt(t.cashflow));set('reportGoal',fmt(t.totalPlannedGoal));
    $('openClientAnalysis').href=`/admin.html?client=${encodeURIComponent(c.id)}#clients`;
  }
  async function load(){
    state.month=$('reportMonth').value||isoMonth();$('reportMonth').value=state.month;
    showFeedback('Carregando clientes…');$('reportClient').disabled=true;
    try{
      const data=await api(`/api/admin/clients?month=${encodeURIComponent(state.month)}`);
      state.clients=Array.isArray(data.clients)?data.clients:[];state.clients.sort((a,b)=>(a.name||'').localeCompare(b.name||'','pt-BR'));
      const urlClient=new URLSearchParams(location.search).get('client');
      filterClients();
      if(urlClient&&state.filtered.some(c=>String(c.id)===urlClient))$('reportClient').value=urlClient;
      else if(state.filtered.length===1)$('reportClient').value=String(state.filtered[0].id);
      renderSelected();$('reportClient').disabled=false;showFeedback(`${state.clients.length} cliente(s) disponível(is) para emissão de relatório.`);
    }catch(error){if(error.status===401||error.status===403){location.href='/login.html';return;}showFeedback(error.message,true);$('reportClient').replaceChildren(option('','Não foi possível carregar os clientes'));}
  }
  $('reportSearch').addEventListener('input',filterClients);
  $('reportClient').addEventListener('change',renderSelected);
  $('reportMonth').addEventListener('change',()=>{if($('reportMonth').value)load();});
  $('reportPrevMonth').addEventListener('click',()=>{$('reportMonth').value=shiftMonth(state.month,-1);load();});
  $('reportNextMonth').addEventListener('click',()=>{$('reportMonth').value=shiftMonth(state.month,1);load();});
  $('exportClientReport').addEventListener('click',()=>{const id=$('reportClient').value;if(!id){showFeedback('Selecione um cliente antes de exportar o relatório.',true);return;}location.href=`/api/admin/clients/${encodeURIComponent(id)}/report?month=${encodeURIComponent(state.month)}`;});
  $('exportClientHistory').addEventListener('click',()=>{const id=$('reportClient').value;if(!id){showFeedback('Selecione um cliente antes de exportar o histórico.',true);return;}location.href=`/api/admin/clients/${encodeURIComponent(id)}/change-history`;});
  (async()=>{try{const me=await api('/api/auth/me');if(!me.authenticated||me.user?.role!=='admin'){location.href='/login.html';return;}}catch{location.href='/login.html';return;}await load();})();
})();
