const $=id=>document.getElementById(id);
async function api(url,options={}){const r=await fetch(url,{credentials:'same-origin',...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||'Não foi possível concluir a operação.'),{status:r.status});return d}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
async function load(){try{const me=await api('/api/auth/me');if(!me.authenticated){location.href='/login.html';return}const data=await api('/api/services');render(data.services||[],data.access||{})}catch(e){if(e.status===401)location.href='/login.html';else if(e.status===403)location.href='/renovar.html';else {$('feedback').textContent=e.message;document.dispatchEvent(new CustomEvent('rota-content-error'));}}}
function render(items,access){
 renderAccess(access);
 const paths={plataforma:'/planejamento.html',planejamento:'/planejamento.html','divisao-casa':'/resumo-casa.html',consultoria:'/agendamento.html?service=consultoria',acompanhamento:'/agendamento.html?service=acompanhamento'};
 const descriptions={plataforma:'Registre ganhos e despesas e acompanhe sua meta.',planejamento:'Organize compromissos e os próximos passos do mês.','divisao-casa':'Divida as contas da casa e acompanhe os acertos.',acompanhamento:'Acompanhe sua organização financeira com apoio da equipe.',consultoria:'Receba orientação para suas decisões financeiras.'};
 function card(s){const acquired=s.acquired,href=paths[s.slug];return `<article class="service-card ${acquired?'acquired':''}"><div class="service-top"><h3>${esc(s.name)}</h3>${!acquired?`<strong class="service-price">Consulte os planos</strong>`:''}</div><p class="service-summary">${esc(descriptions[s.slug]||s.description)}</p>${descriptions[s.slug]&&s.description?`<details class="service-details"><summary>Saiba mais</summary><p>${esc(s.description)}</p></details>`:''}${acquired?(href?`<a class="btn service-action acquired" href="${href}">Acessar →</a>`:'<span class="service-status">✓ Serviço liberado · atendimento pela equipe</span>'):`<a class="btn service-action" href="/planos.html">Ver planos e contratar</a>`}</article>`;}
 $('servicesGrid').classList.add('service-groups');$('servicesGrid').innerHTML=[[true,'Serviços liberados para você'],[false,'Serviços disponíveis para contratação']].map(([acquired,title])=>{const list=items.filter(s=>Boolean(s.acquired)===acquired);return `<section class="service-group"><h2>${title}</h2>${list.length?`<div class="services-grid">${list.map(card).join('')}</div>`:'<p>Nenhum produto nesta seção.</p>'}</section>`;}).join('');document.dispatchEvent(new CustomEvent('rota-content-ready'));
}
function renderAccess(access){
 const plans=(access.subscriptions||[]).filter(p=>p.active);
 const credits=access.one_time_products||[];
 let label=access.source==='admin'?'Acesso suspenso pelo administrador':plans.length?'Seus planos ativos':access.source==='liberacao_manual'?'Acesso liberado pelo administrador':access.source==='teste_gratuito'?'Período gratuito':access.source==='admin'?'Acesso suspenso pelo administrador':'Sem plano mensal ativo';
 const dates=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR',{timeZone:'America/Bahia'});};
 $('accessSummary').innerHTML=`<h2>${esc(label)}</h2>${plans.map(p=>`<p><strong>${esc(p.name)}</strong> · válido até ${esc(dates(p.expires_at))}</p>`).join('')}${access.source==='teste_gratuito'?`<p>${Number(access.daysRemaining)||0} dia(s) restante(s).</p>`:''}${credits.length?`<p>Créditos avulsos disponíveis: ${credits.map(p=>esc(p.name)).join(', ')}.</p>`:''}<p>Os serviços liberados aparecem abaixo. Pagamentos confirmados atualizam o acesso automaticamente; liberações extras são feitas pelo administrador.</p>`;
}
window.addEventListener('pageshow',e=>{if(e.persisted)load();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
$('logout').addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST'});location.href='/login.html'});load();
