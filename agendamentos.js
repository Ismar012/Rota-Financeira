(() => {'use strict';
const $=id=>document.getElementById(id);const admin=location.pathname==='/agendamentos-admin.html';let state={slots:[],bookings:[]};
async function api(url,options={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||'Não foi possível concluir a operação.'),{status:r.status});return d;}
function post(url,data){return api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});}
function date(day){return day.split('-').reverse().join('/');}function clear(el){el.replaceChildren();}
function row(el,text,badge){const r=document.createElement('div');r.className='row';const t=document.createElement('span');t.textContent=text;r.appendChild(t);if(badge){const b=document.createElement('span');b.className='badge';b.textContent=badge;r.appendChild(b);}el.appendChild(r);return r;}
function isFuture(x){return Date.parse(x.day+'T'+x.start+':00-03:00')>Date.now();}
function action(r,label,fn){const b=document.createElement('button');b.type='button';b.className='outline';b.textContent=label;b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}finally{b.disabled=false;}});r.appendChild(b);}
async function mutate(url,body,message){if(!window.confirm(message))return;const f=$('feedback');try{const d=await post(url,body);await load();f.textContent=d.message||'Alteração concluída.';window.dispatchEvent(new Event('rota-consultations-changed'));}catch(e){f.textContent=e.message;}}
function option(el,value,text){const o=document.createElement('option');o.value=value;o.textContent=text;el.appendChild(o);}
function render(){const b=$('bookings');clear(b);if(!state.bookings.length)b.textContent='Nenhuma consultoria agendada.';
 state.bookings.forEach(x=>{
 const r=row(b,`${date(x.day)} · ${x.start} às ${x.end}${admin?' · '+x.name+' · '+x.email+(x.phone?' · '+x.phone:''):''}`,x.cancelled_at?'Cancelado':admin&&!x.seen_at?'Novo agendamento':null);
 if(!x.cancelled_at&&isFuture(x))action(r,'Cancelar agendamento',()=>mutate(`${admin?'/api/admin':'/api'}/consultations/${x.id}/cancel`,{},'Cancelar esta consultoria? O horário poderá ser reservado novamente.'));
 });
 if(admin){clear($('slots'));const enabled=state.slots.filter(s=>s.enabled);if(!enabled.length)$('slots').textContent='Nenhum horário disponível cadastrado.';
 let lastDay='';enabled.forEach(s=>{
 if(s.day!==lastDay){lastDay=s.day;const heading=row($('slots'),date(s.day));if(isFuture({day:s.day,start:'23:59'}))action(heading,'Excluir disponibilidade do dia',()=>mutate('/api/admin/consultations/availability/remove',{day:s.day},'Excluir todos os horários futuros deste dia? Os agendamentos existentes nesses horários também serão cancelados.'));
 }
 const r=row($('slots'),`${s.start} às ${s.end}`,s.booking_id?'Reservado':'Disponível');if(isFuture(s))action(r,'Excluir disponibilidade',()=>mutate('/api/admin/consultations/availability/remove',{slotId:Number(s.id)},s.booking_id?'Este horário está reservado. Excluir a disponibilidade e cancelar o agendamento do cliente?':'Excluir este horário disponível?'));
 });$('markSeen').disabled=!state.bookings.some(b=>!b.seen_at&&!b.cancelled_at);return;}
 const previous=$('day').value;clear($('day'));option($('day'),'','Selecione um dia');[...new Set(state.slots.map(s=>s.day))].forEach(d=>option($('day'),d,date(d)));$('day').disabled=!state.slots.length;if(state.slots.some(s=>s.day===previous))$('day').value=previous;renderTimes();if(!state.slots.length)$('feedback').textContent='Não há horários disponíveis no momento. Aguarde a equipe disponibilizar novos horários.';
}
function renderTimes(){clear($('slot'));option($('slot'),'','Selecione um horário');state.slots.filter(s=>s.day===$('day').value).forEach(s=>option($('slot'),s.id,`${s.start} às ${s.end}`));$('slot').disabled=!$('day').value;$('confirm').disabled=true;}
async function load(){state=await api(admin?'/api/admin/consultations':'/api/consultations');render();}
async function init(){try{const me=await api('/api/auth/me');if(!me.authenticated){location.replace('/login.html');return;}if(admin&&me.user?.role!=='admin'){$('accessFeedback').textContent='Acesso restrito ao administrador.';return;}
 if(admin){$('adminContent').classList.remove('hidden');const names=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];names.forEach((n,i)=>{const l=document.createElement('label');const c=document.createElement('input');c.type='checkbox';c.value=i;c.checked=i>0&&i<6;l.append(c,document.createTextNode(n));$('weekdays').appendChild(l);});
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('from').min=parts;$('from').value=parts;$('to').min=parts;$('to').value=parts;
 $('mode').addEventListener('change',()=>{const single=$('mode').value==='single';$('toLabel').classList.toggle('hidden',single);$('to').required=!single;$('weekdays').classList.toggle('hidden',$('mode').value!=='repeat');});
 $('availabilityForm').addEventListener('submit',async e=>{e.preventDefault();$('saveAvailability').disabled=true;$('feedback').textContent='Salvando…';try{const d=await post('/api/admin/consultations/availability',{from:$('from').value,to:$('mode').value==='single'?$('from').value:$('to').value,start:$('start').value,end:$('end').value,limit:Number($('limit').value),weekdays:$('mode').value==='repeat'?[...$('weekdays').querySelectorAll('input:checked')].map(x=>Number(x.value)):[0,1,2,3,4,5,6]});$('feedback').textContent=`Disponibilidade salva: ${d.days} dia(s), ${d.slots} horário(s).`;await load();}catch(err){$('feedback').textContent=err.message;}finally{$('saveAvailability').disabled=false;}});
 $('refresh').addEventListener('click',()=>load().catch(e=>{$('feedback').textContent=e.message;}));$('markSeen').addEventListener('click',async()=>{const ids=state.bookings.filter(b=>!b.seen_at&&!b.cancelled_at).map(b=>b.id);$('markSeen').disabled=true;try{for(let i=0;i<ids.length;i+=1000)await post('/api/admin/consultations/seen',{ids:ids.slice(i,i+1000)});await load();}catch(e){$('feedback').textContent=e.message;$('markSeen').disabled=false;}});
 }else{$('day').addEventListener('change',renderTimes);$('slot').addEventListener('change',()=>{$('confirm').disabled=!$('slot').value;});$('bookingForm').addEventListener('submit',async e=>{e.preventDefault();$('confirm').disabled=true;$('feedback').textContent='Confirmando…';try{await post('/api/consultations',{slotId:Number($('slot').value)});$('feedback').textContent='Agendamento confirmado.';$('confirmation').showModal();await load();}catch(err){$('feedback').textContent=err.message;if(err.status===409)await load().catch(()=>{});}finally{$('confirm').disabled=!$('slot').value;}});}
 await load();
 }catch(e){if(e.status===401)location.replace('/login.html');else (admin?$('accessFeedback'):$('feedback')).textContent=e.message;}}
 init();})();
