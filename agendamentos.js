'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const admin = location.pathname === '/agendamentos-admin.html';
  const nowMonth = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit'}).format(new Date());
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const monthState = new URLSearchParams(location.search).get('month');
  const dayState = new URLSearchParams(location.search).get('day');
  const state = { slots: [], bookings: [], month: /^\d{4}-(0[1-9]|1[0-2])$/.test(monthState||'') ? monthState : nowMonth(), selectedDay: /^\d{4}-\d{2}-\d{2}$/.test(dayState||'') ? dayState : today() };

  async function api(url, options={}) {
    const response = await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw Object.assign(new Error(data.error||'Não foi possível concluir a operação.'),{status:response.status});
    return data;
  }
  const post = (url,data) => api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const date = day => String(day||'').split('-').reverse().join('/');
  const monthTitle = value => { const [y,m]=value.split('-').map(Number);return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1))); };
  const formatDayLong = value => { if(!value)return 'Selecione uma data';const d=new Date(value+'T12:00:00Z');return new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'}).format(d); };
  const clear = element => element?.replaceChildren();
  function row(container,text,badge) { const r=document.createElement('div');r.className='row';const t=document.createElement('span');t.textContent=text;r.append(t);if(badge){const b=document.createElement('span');b.className='badge';b.textContent=badge;r.append(b);}container.append(r);return r; }
  function isFuture(item) { return Date.parse(`${item.day}T${item.start}:00-03:00`) > Date.now(); }
  function action(container,label,fn) { const button=document.createElement('button');button.type='button';button.className='outline';button.textContent=label;button.addEventListener('click',async()=>{button.disabled=true;try{await fn();}finally{button.disabled=false;}});container.append(button);return button; }
  async function mutate(url,body,message) {
    if(!window.confirm(message))return;
    const feedback=$('feedback');try{const data=await post(url,body);await load();if(feedback)feedback.textContent=data.message||'Alteração concluída.';window.dispatchEvent(new Event('rota-consultations-changed'));}
    catch(error){if(feedback)feedback.textContent=error.message;}
  }
  function option(element,value,text) { const node=document.createElement('option');node.value=value;node.textContent=text;element.append(node); }

  function activeBookingsForDay(day) {
    return state.bookings.filter(item=>item.day===day&&!item.cancelled_at).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
  }
  function getDaySlots(day) {
    return state.slots.filter(item=>item.day===day&&item.enabled&&!item.booking_id).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
  }
  function renderCalendar() {
    if(!admin||!$('monthCalendar'))return;
    const input=$('calendarMonth');if(input)input.value=state.month;
    if(!state.selectedDay.startsWith(state.month))state.selectedDay=`${state.month}-01`;
    const grid=$('monthCalendar');clear(grid);
    ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].forEach(label=>{const weekday=document.createElement('div');weekday.className='agenda-calendar-weekday';weekday.textContent=label;grid.append(weekday);});
    const [year,month]=state.month.split('-').map(Number);
    const firstWeekday=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
    const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
    for(let i=0;i<firstWeekday;i++){const empty=document.createElement('div');empty.className='agenda-calendar-empty';empty.setAttribute('aria-hidden','true');grid.append(empty);}
    for(let dayNum=1;dayNum<=daysInMonth;dayNum++){
      const key=`${year}-${String(month).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
      const appointments=activeBookingsForDay(key);const available=getDaySlots(key);
      const button=document.createElement('button');button.type='button';button.className='agenda-calendar-day';
      if(key===state.selectedDay)button.classList.add('is-selected');if(key===today())button.classList.add('is-today');if(appointments.length)button.classList.add('has-bookings');
      button.setAttribute('aria-pressed',String(key===state.selectedDay));button.setAttribute('aria-label',`${date(key)}, ${appointments.length} agendamento(s), ${available.length} horário(s) disponível(is)`);
      const num=document.createElement('span');num.className='agenda-calendar-day-number';const n=document.createElement('span');n.textContent=String(dayNum);num.append(n);
      if(appointments.length){const count=document.createElement('span');count.className='agenda-calendar-day-count';count.textContent=String(appointments.length);num.append(count);}
      button.append(num);
      const items=document.createElement('span');items.className='agenda-calendar-day-events';
      appointments.slice(0,2).forEach(booking=>{const event=document.createElement('span');event.className='agenda-calendar-mini-event';event.textContent=`${booking.start} ${booking.name||'Cliente'}`;event.title=`${booking.start} às ${booking.end} · ${booking.name||'Cliente'}`;items.append(event);});
      if(appointments.length>2){const more=document.createElement('span');more.className='agenda-calendar-more';more.textContent=`+${appointments.length-2} mais`;items.append(more);}
      else if(!appointments.length&&available.length){const free=document.createElement('span');free.className='agenda-calendar-mini-event available';free.textContent=`${available.length} livre(s)`;items.append(free);}
      button.append(items);button.addEventListener('click',()=>{state.selectedDay=key;renderCalendar();renderSelectedDay();});grid.append(button);
    }
    renderSelectedDay();renderCalendarMetrics();
  }
  function renderSelectedDay() {
    if(!admin||!$('calendarDayBookings'))return;
    const day=state.selectedDay;const heading=$('calendarDayTitle');if(heading)heading.textContent=formatDayLong(day);
    const container=$('calendarDayBookings');clear(container);
    const appointments=state.bookings.filter(item=>item.day===day).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
    if(!appointments.length){const p=document.createElement('p');p.textContent='Nenhum agendamento registrado neste dia.';container.append(p);const free=getDaySlots(day);if(free.length){const available=document.createElement('div');available.className='agenda-event-card';const name=document.createElement('strong');name.textContent=`${free.length} horário(s) disponível(is)`;const times=document.createElement('span');times.className='agenda-event-meta';times.textContent=free.map(s=>`${s.start}–${s.end}`).join(' · ');available.append(name,times);container.append(available);}return;}
    appointments.forEach(booking=>{
      const cancelled=Boolean(booking.cancelled_at);const card=document.createElement('article');card.className='agenda-event-card'+(cancelled?' is-cancelled':'');
      const time=document.createElement('span');time.className='agenda-event-time';time.textContent=`${booking.start}–${booking.end}`;
      const name=document.createElement('strong');name.className='agenda-event-name';name.textContent=booking.name||'Cliente';
      const email=document.createElement('span');email.className='agenda-event-meta';email.textContent=booking.email||'E-mail não informado';
      const status=document.createElement('span');status.className='agenda-event-status'+(cancelled?' cancelled':'');status.textContent=cancelled?'Cancelado':booking.seen_at?'Confirmado':'Novo agendamento';
      card.append(time,name,email,status);
      if(booking.phone&&!cancelled){const phone=document.createElement('span');phone.className='agenda-event-meta';phone.textContent='Telefone: '+booking.phone;card.append(phone);}
      if(!cancelled&&isFuture(booking)){const actions=document.createElement('div');actions.className='agenda-event-actions';action(actions,'Cancelar',()=>mutate('/api/admin/consultations/'+booking.id+'/cancel',{},`Cancelar o agendamento de ${booking.name||'este cliente'} em ${date(booking.day)} às ${booking.start}?`));card.append(actions);}
      container.append(card);
    });
  }
  function renderCalendarMetrics() {
    if(!admin)return;
    const current=state.bookings.filter(b=>String(b.day||'').slice(0,7)===state.month);
    $('agendaMonthCount').textContent=String(current.filter(b=>!b.cancelled_at).length);
    $('agendaUnreadCount').textContent=String(current.filter(b=>!b.seen_at&&!b.cancelled_at).length);
    $('agendaFreeCount').textContent=String(state.slots.filter(s=>String(s.day||'').slice(0,7)===state.month&&s.enabled&&!s.booking_id).length);
  }
  function renderAdminLists() {
    const bookingsEl=$('bookings');clear(bookingsEl);
    if(!state.bookings.length)addText(bookingsEl,'Nenhuma consultoria agendada.');
    const sorted=[...state.bookings].sort((a,b)=>String(b.day+' '+b.start).localeCompare(String(a.day+' '+a.start)));
    sorted.forEach(booking=>{
      const status=booking.cancelled_at?'Cancelado':!booking.seen_at?'Novo agendamento':'Visualizado';
      const r=row(bookingsEl,`${date(booking.day)} · ${booking.start} às ${booking.end} · ${booking.name||'Cliente'} · ${booking.email||''}${booking.phone?' · '+booking.phone:''}`,status);
      if(!booking.cancelled_at&&isFuture(booking))action(r,'Cancelar',()=>mutate(`/api/admin/consultations/${booking.id}/cancel`,{},`Cancelar esta consultoria de ${booking.name||'cliente'}? O horário poderá ser reservado novamente.`));
    });
    const slotsEl=$('slots');clear(slotsEl);const enabled=state.slots.filter(s=>s.enabled).sort((a,b)=>String(a.day+' '+a.start).localeCompare(String(b.day+' '+b.start)));
    if(!enabled.length)addText(slotsEl,'Nenhum horário futuro disponível cadastrado.');
    let lastDay='';enabled.forEach(slot=>{
      if(slot.day!==lastDay){lastDay=slot.day;const heading=row(slotsEl,date(slot.day));if(isFuture({day:slot.day,start:'23:59'}))action(heading,'Excluir dia',()=>mutate('/api/admin/consultations/availability/remove',{day:slot.day},'Excluir todos os horários futuros deste dia? Os agendamentos existentes também serão cancelados.'));}
      const line=row(slotsEl,`${slot.start} às ${slot.end}`,slot.booking_id?'Reservado':'Disponível');if(isFuture(slot))action(line,'Excluir horário',()=>mutate('/api/admin/consultations/availability/remove',{slotId:Number(slot.id)},slot.booking_id?'Excluir esta disponibilidade e cancelar o agendamento do cliente?':'Excluir este horário disponível?'));
    });
    $('markSeen').disabled=!state.bookings.some(b=>!b.seen_at&&!b.cancelled_at);
    renderCalendar();
  }
  function addText(container,text){if(!container)return;const p=document.createElement('p');p.className='agenda-empty';p.textContent=text;container.append(p);}
  function renderClientBooking() {
    const previous=$('day').value;clear($('day'));option($('day'),'','Selecione um dia');[...new Set(state.slots.map(s=>s.day))].forEach(d=>option($('day'),d,date(d)));$('day').disabled=!state.slots.length;if(state.slots.some(s=>s.day===previous))$('day').value=previous;renderTimes();if(!state.slots.length)$('feedback').textContent='Não há horários disponíveis no momento. Aguarde a equipe disponibilizar novos horários.';
  }
  function renderTimes(){clear($('slot'));option($('slot'),'','Selecione um horário');state.slots.filter(s=>s.day===$('day').value).forEach(s=>option($('slot'),s.id,`${s.start} às ${s.end}`));$('slot').disabled=!$('day').value;$('confirm').disabled=true;}
  function render(){if(admin)renderAdminLists();else renderClientBooking();}
  async function load(){const data=await api(admin?'/api/admin/consultations':'/api/consultations');state.slots=Array.isArray(data.slots)?data.slots:[];state.bookings=Array.isArray(data.bookings)?data.bookings:[];render();}

  async function init(){
    try{
      const me=await api('/api/auth/me');if(!me.authenticated){location.replace('/login.html');return;}
      if(admin&&me.user?.role!=='admin'){$('accessFeedback').textContent='Acesso restrito ao administrador.';return;}
      if(admin){
        $('adminContent').classList.remove('hidden');
        $('calendarMonth').value=state.month;
        if(!state.selectedDay.startsWith(state.month))state.selectedDay=`${state.month}-01`;
        const names=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];names.forEach((name,index)=>{const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=index;checkbox.checked=index>0&&index<6;label.append(checkbox,document.createTextNode(' '+name));$('weekdays').append(label);});
        const todayDate=today();$('from').min=todayDate;$('from').value=todayDate;$('to').min=todayDate;$('to').value=todayDate;
        $('mode').addEventListener('change',()=>{const single=$('mode').value==='single';$('toLabel').classList.toggle('hidden',single);$('to').required=!single;$('weekdays').classList.toggle('hidden',$('mode').value!=='repeat');});
        $('calendarPrev').addEventListener('click',()=>changeCalendarMonth(-1));$('calendarNext').addEventListener('click',()=>changeCalendarMonth(1));
        $('calendarMonth').addEventListener('change',()=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test($('calendarMonth').value)){state.month=$('calendarMonth').value;if(!state.selectedDay.startsWith(state.month))state.selectedDay=`${state.month}-01`;renderCalendar();}});
        $('availabilityForm').addEventListener('submit',async event=>{event.preventDefault();$('saveAvailability').disabled=true;$('feedback').textContent='Salvando…';try{const data=await post('/api/admin/consultations/availability',{from:$('from').value,to:$('mode').value==='single'?$('from').value:$('to').value,start:$('start').value,end:$('end').value,limit:Number($('limit').value),weekdays:$('mode').value==='repeat'?[...$('weekdays').querySelectorAll('input:checked')].map(el=>Number(el.value)):[0,1,2,3,4,5,6]});$('feedback').textContent=`Disponibilidade salva: ${data.days} dia(s), ${data.slots} horário(s).`;await load();window.dispatchEvent(new Event('rota-consultations-changed'));}catch(error){$('feedback').textContent=error.message;}finally{$('saveAvailability').disabled=false;}});
        $('refresh').addEventListener('click',()=>load().catch(error=>{$('feedback').textContent=error.message;}));
        $('markSeen').addEventListener('click',async()=>{const ids=state.bookings.filter(b=>!b.seen_at&&!b.cancelled_at).map(b=>b.id);$('markSeen').disabled=true;try{for(let i=0;i<ids.length;i+=1000)await post('/api/admin/consultations/seen',{ids:ids.slice(i,i+1000)});await load();$('feedback').textContent='Novidades marcadas como vistas.';window.dispatchEvent(new Event('rota-consultations-changed'));}catch(error){$('feedback').textContent=error.message;$('markSeen').disabled=false;}});
      }else{
        $('day').addEventListener('change',renderTimes);$('slot').addEventListener('change',()=>$('confirm').disabled=!$('slot').value);
        $('bookingForm').addEventListener('submit',async event=>{event.preventDefault();$('confirm').disabled=true;$('feedback').textContent='Confirmando…';try{await post('/api/consultations',{slotId:Number($('slot').value)});$('feedback').textContent='Agendamento confirmado.';$('confirmation').showModal();await load();}catch(error){$('feedback').textContent=error.message;if(error.status===409)await load().catch(()=>{});}finally{$('confirm').disabled=!$('slot').value;}});
      }
      await load();
    }catch(error){if(error.status===401)location.replace('/login.html');else (admin?$('accessFeedback'):$('feedback')).textContent=error.message;}
  }
  function changeCalendarMonth(delta){const [year,month]=state.month.split('-').map(Number);const dateValue=new Date(Date.UTC(year,month-1+delta,1));state.month=dateValue.toISOString().slice(0,7);state.selectedDay=`${state.month}-01`;const [y,m]=state.month.split('-').map(Number);const availableDays=new Date(Date.UTC(y,m,0)).getUTCDate();if(dayState&&state.month===monthState)state.selectedDay=dayState;else if(Number(state.selectedDay.slice(-2))>availableDays)state.selectedDay=`${state.month}-${String(availableDays).padStart(2,'0')}`;if($('calendarMonth'))$('calendarMonth').value=state.month;renderCalendar();}
  init();
})();
