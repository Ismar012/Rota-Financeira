'use strict';
const TZ = 'America/Bahia';
function today(now = new Date()) { return new Intl.DateTimeFormat('en-CA', {timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
function addDays(day,n) { const d=new Date(day+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10); }
function validDate(v) {return typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v+'T12:00:00Z')) && new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;}
function minutes(v) { if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))return NaN;const [h,m]=v.split(':').map(Number);return h*60+m; }
function clock(n) {return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function availability(body) {
 const {from,to=from,start,end,limit,weekdays=[0,1,2,3,4,5,6]}=body;
 const a=minutes(start),b=minutes(end),n=Number(limit);
 if(!validDate(from)||!validDate(to)||from<today()||to<from||to>addDays(from,365))throw Object.assign(new Error('Informe um período válido de até 366 dias, a partir de hoje.'),{status:400});
 if(!Number.isInteger(n)||n<1||!Number.isFinite(a)||!Number.isFinite(b)||b-a<60||n>Math.floor((b-a)/60))throw Object.assign(new Error('A quantidade deve caber no intervalo, com uma hora por consultoria.'),{status:400});
 if(!Array.isArray(weekdays)||!weekdays.length||weekdays.some(x=>!Number.isInteger(x)||x<0||x>6))throw Object.assign(new Error('Selecione os dias da semana disponíveis.'),{status:400});
 const rows=[];for(let day=from;day<=to;day=addDays(day,1)){if(!weekdays.includes(new Date(day+'T12:00:00Z').getUTCDay()))continue;for(let i=0;i<n;i++)rows.push({day,start:clock(a+i*60),end:clock(a+(i+1)*60)});}return rows;
}
function createScheduling({pool,requireUser,requireAdmin,readBody,sendJson}) {
 async function initialize(){const c=await pool.connect();try{await c.query('BEGIN');await c.query(`
 CREATE TABLE IF NOT EXISTS consultation_slots (
 id BIGSERIAL PRIMARY KEY, day DATE NOT NULL, start_time TIME NOT NULL, end_time TIME NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE, created_by BIGINT REFERENCES users(id),
 CHECK(end_time=start_time+INTERVAL '1 hour'), UNIQUE(day,start_time));
 CREATE TABLE IF NOT EXISTS consultation_bookings (
 id BIGSERIAL PRIMARY KEY, slot_id BIGINT NOT NULL UNIQUE REFERENCES consultation_slots(id),
 user_id BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 seen_at TIMESTAMPTZ);
 ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
 ALTER TABLE consultation_bookings ADD COLUMN IF NOT EXISTS cancelled_by BIGINT REFERENCES users(id);
 ALTER TABLE consultation_bookings DROP CONSTRAINT IF EXISTS consultation_bookings_slot_id_key;
 CREATE UNIQUE INDEX IF NOT EXISTS consultation_one_active_booking ON consultation_bookings(slot_id) WHERE cancelled_at IS NULL;
 CREATE INDEX IF NOT EXISTS consultation_slots_day ON consultation_slots(day);
 `);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 const selectSlots=`SELECT s.id,to_char(s.day,'YYYY-MM-DD') AS day,to_char(s.start_time,'HH24:MI') AS start,to_char(s.end_time,'HH24:MI') AS end,s.enabled,b.id AS booking_id FROM consultation_slots s LEFT JOIN consultation_bookings b ON b.slot_id=s.id AND b.cancelled_at IS NULL`;
 async function handle(req,res,url){
 if(!url.startsWith('/api/consultations')&&!url.startsWith('/api/admin/consultations'))return false;
 const admin=url.startsWith('/api/admin/');const user=await(admin?requireAdmin(req,res):requireUser(req,res));if(!user)return;
 try {
 if(!admin&&url==='/api/consultations'&&req.method==='GET'){
 const min=addDays(today(),2);const slots=await pool.query(selectSlots+' WHERE s.enabled AND b.id IS NULL AND s.day >= $1 ORDER BY s.day,s.start_time',[min]);
 const mine=await pool.query(`SELECT b.id,b.cancelled_at,to_char(s.day,'YYYY-MM-DD') AS day,to_char(s.start_time,'HH24:MI') AS start,to_char(s.end_time,'HH24:MI') AS end FROM consultation_bookings b JOIN consultation_slots s ON s.id=b.slot_id WHERE b.user_id=$1 ORDER BY s.day DESC,s.start_time DESC`,[user.id]);sendJson(res,200,{minDate:min,timezone:TZ,slots:slots.rows,bookings:mine.rows});return;}
 if(!admin&&url==='/api/consultations'&&req.method==='POST'){
 const body=await readBody(req);const id=Number(body.slotId);if(!Number.isSafeInteger(id)||id<1)throw Object.assign(new Error('Selecione um horário válido.'),{status:400});
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(74261001)');const r=await c.query('SELECT * FROM consultation_slots WHERE id=$1 FOR UPDATE',[id]);const s=r.rows[0];const min=addDays(today(),2);
 if(!s||!s.enabled||String(s.day).slice(0,10)<min)throw Object.assign(new Error('Escolha um horário disponível a partir de depois de amanhã.'),{status:400});
 const b=await c.query('INSERT INTO consultation_bookings(slot_id,user_id) VALUES($1,$2) RETURNING id',[id,user.id]);await c.query('COMMIT');console.info(JSON.stringify({event:'consultation_booked',bookingId:b.rows[0].id,userId:user.id}));sendJson(res,201,{id:b.rows[0].id,message:'Seu agendamento foi confirmado. Nossa equipe entrará em contato com você.'});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}return;}
 const cancelRoute=url.match(/^\/api\/(?:admin\/)?consultations\/(\d+)\/cancel$/);
 if(cancelRoute&&req.method==='POST'){
 const id=Number(cancelRoute[1]);if(!Number.isSafeInteger(id)||id<1)throw Object.assign(new Error('Agendamento inválido.'),{status:400});
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(74261001)');
 const r=await c.query(`SELECT b.id,b.cancelled_at, ((s.day+s.start_time) AT TIME ZONE 'America/Bahia') <= NOW() AS started FROM consultation_bookings b JOIN consultation_slots s ON s.id=b.slot_id WHERE b.id=$1 ${admin?'':'AND b.user_id=$2'} FOR UPDATE OF b`,admin?[id]:[id,user.id]);
 const b=r.rows[0];if(!b)throw Object.assign(new Error('Agendamento não encontrado.'),{status:404});
 if(!b.cancelled_at&&b.started)throw Object.assign(new Error('Só é possível cancelar uma consultoria antes do início.'),{status:409});
 if(!b.cancelled_at)await c.query('UPDATE consultation_bookings SET cancelled_at=NOW(),cancelled_by=$2 WHERE id=$1',[id,user.id]);
 await c.query('COMMIT');console.info(JSON.stringify({event:'consultation_cancelled',bookingId:id,userId:user.id}));sendJson(res,200,{ok:true,message:'Agendamento cancelado. O horário volta a ficar disponível se continuar habilitado.'});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}return;}
 if(admin&&url==='/api/admin/consultations/availability/remove'&&req.method==='POST'){
 const body=await readBody(req);const id=Number(body.slotId);const day=body.day;
 if(day!==undefined?!validDate(day):!Number.isSafeInteger(id)||id<1)throw Object.assign(new Error('Selecione um horário ou dia válido.'),{status:400});
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(74261001)');
 const r=await c.query(`SELECT id FROM consultation_slots WHERE ${day!==undefined?'day=$1':'id=$1'} AND enabled AND ((day+start_time) AT TIME ZONE 'America/Bahia') > NOW() FOR UPDATE`,[day!==undefined?day:id]);
 const ids=r.rows.map(x=>x.id);if(!ids.length)throw Object.assign(new Error('Nenhuma disponibilidade futura encontrada.'),{status:404});
 await c.query('UPDATE consultation_slots SET enabled=FALSE WHERE id=ANY($1::bigint[])',[ids]);
 const cancelled=await c.query('UPDATE consultation_bookings SET cancelled_at=NOW(),cancelled_by=$2 WHERE slot_id=ANY($1::bigint[]) AND cancelled_at IS NULL RETURNING id',[ids,user.id]);
 await c.query('COMMIT');console.info(JSON.stringify({event:'consultation_availability_removed',adminId:user.id,slots:ids.length,cancelled:cancelled.rowCount}));sendJson(res,200,{ok:true,removed:ids.length,cancelled:cancelled.rowCount,message:'Disponibilidade excluída. Reservas desses horários foram canceladas.'});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}return;}
 if(admin&&url==='/api/admin/consultations/notifications'&&req.method==='GET'){const r=await pool.query('SELECT COUNT(*)::int AS count FROM consultation_bookings WHERE seen_at IS NULL AND cancelled_at IS NULL');sendJson(res,200,r.rows[0]);return;}
 if(admin&&url==='/api/admin/consultations'&&req.method==='GET'){
 const r=await pool.query(`SELECT b.id,b.seen_at,b.created_at,b.cancelled_at,u.name,u.email,u.phone,to_char(s.day,'YYYY-MM-DD') AS day,to_char(s.start_time,'HH24:MI') AS start,to_char(s.end_time,'HH24:MI') AS end FROM consultation_bookings b JOIN consultation_slots s ON s.id=b.slot_id JOIN users u ON u.id=b.user_id ORDER BY s.day,s.start_time`);
 const slots=await pool.query(selectSlots+' WHERE s.day >= $1 ORDER BY s.day,s.start_time',[today()]);sendJson(res,200,{bookings:r.rows,slots:slots.rows,timezone:TZ});return;}
 if(admin&&url==='/api/admin/consultations/seen'&&req.method==='POST'){
 const body=await readBody(req);if(!Array.isArray(body.ids)||body.ids.length>1000||body.ids.some(x=>!Number.isSafeInteger(Number(x))||Number(x)<1))throw Object.assign(new Error('Lista de agendamentos inválida.'),{status:400});await pool.query('UPDATE consultation_bookings SET seen_at=NOW() WHERE id=ANY($1::bigint[]) AND seen_at IS NULL',[body.ids]);sendJson(res,200,{ok:true});return;}
 if(admin&&url==='/api/admin/consultations/availability'&&req.method==='POST'){
 const body=await readBody(req);const rows=availability(body);if(!rows.length)throw Object.assign(new Error('Nenhum dia corresponde à seleção.'),{status:400});const days=[...new Set(rows.map(r=>r.day))];const c=await pool.connect();
 try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(74261001)');
 // Preserva as reservas existentes; rejeita alterações que retirariam seus horários.
 const booked=await c.query(`SELECT to_char(s.day,'YYYY-MM-DD') AS day,to_char(s.start_time,'HH24:MI') AS start FROM consultation_slots s JOIN consultation_bookings b ON b.slot_id=s.id WHERE s.day=ANY($1::date[]) AND b.cancelled_at IS NULL`,[days]);
 const keys=new Set(rows.map(r=>r.day+' '+r.start));if(booked.rows.some(r=>!keys.has(r.day+' '+r.start)))throw Object.assign(new Error('O período contém reservas. Mantenha os horários já agendados.'),{status:409});
 await c.query('UPDATE consultation_slots SET enabled=FALSE WHERE day=ANY($1::date[])',[days]);
 // Desativa horários antigos não reservados e reaplica o modelo aos dias selecionados.
 for(const r of rows)await c.query(`INSERT INTO consultation_slots(day,start_time,end_time,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(day,start_time) DO UPDATE SET enabled=TRUE,end_time=EXCLUDED.end_time`,[r.day,r.start,r.end,user.id]);
 await c.query('COMMIT');console.info(JSON.stringify({event:'consultation_availability_updated',adminId:user.id,days:days.length,slots:rows.length}));sendJson(res,200,{days:days.length,slots:rows.length});
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}return;}
 sendJson(res,404,{error:'Operação de agendamento não encontrada.'});
 }catch(e){if(e.code==='23505')sendJson(res,409,{error:'Este horário acabou de ser reservado. Escolha outro horário.'});else if(e.status)sendJson(res,e.status,{error:e.message});else{console.error('Falha nos agendamentos:',e.code||e.name);sendJson(res,500,{error:'Não foi possível concluir o agendamento. Tente novamente.'});}}return;
 }
 return {initialize,handle};
}
module.exports={createScheduling,today,addDays,validDate,availability};
