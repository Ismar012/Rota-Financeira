const $=id=>document.getElementById(id);
async function api(url,options={}){const r=await fetch(url,{credentials:'same-origin',...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||'Não foi possível concluir a operação.'),{status:r.status});return d}
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
async function load(){try{const me=await api('/api/auth/me');if(!me.authenticated){location.href='/login.html';return}const data=await api('/api/services');render(data.services||[])}catch(e){if(e.status===401||e.status===403)location.href='/login.html';else $('feedback').textContent=e.message}}
function render(items){$('servicesGrid').innerHTML=items.map(s=>{const acquired=s.acquired;return `<article class="service-card ${acquired?'acquired':''}"><div class="service-top"><div><div class="eyebrow small">Serviço</div><h2>${esc(s.name)}</h2></div><strong class="service-price">${s.price>0?money.format(s.price):'Sob consulta'}</strong></div><p>${esc(s.description)}</p><button class="btn service-action ${acquired?'acquired':''}" ${acquired?'disabled':''} data-id="${s.id}">${acquired?'✓ Serviço adquirido':'Solicitar contratação'}</button></article>`}).join('');document.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>purchase(Number(b.dataset.id))))}
async function purchase(id){
  const service = document.querySelector(`[data-id="${id}"]`)?.closest('article')?.querySelector('h2')?.textContent || 'serviço';
  const message = `Olá! Tenho interesse em ${service} da Rota Financeira. Gostaria de consultar valores e condições.`;
  window.open(`https://wa.me/5575981450079?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  $('feedback').textContent='Consulte valores e condições com nossa equipe. A contratação será confirmada após o atendimento.';
}
$('logout').addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST'});location.href='/login.html'});load();
