'use strict';
const division=require('./casa-divisao');
const iso=v=>v instanceof Date?v.toISOString().slice(0,10):String(v||'').slice(0,10);
const today=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=t=>p.find(x=>x.type===t).value;return `${g('year')}-${g('month')}-${g('day')}`;};
function occurrences(first,now=today()) {const start=iso(first);let [y,m,day]=start.split('-').map(Number);const end=new Date(now+'T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+3,1);const result=[];for(let n=y*12+m-1;n<=end.getUTCFullYear()*12+end.getUTCMonth();n++){const yy=Math.floor(n/12),mm=n%12;const last=new Date(Date.UTC(yy,mm+1,0)).getUTCDate();const due=`${yy}-${String(mm+1).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;if(due>=start)result.push(due);}return result;}
async function install(pool){await pool.query(`
 CREATE TABLE IF NOT EXISTS house_people(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,my_name VARCHAR(80) NOT NULL,other_name VARCHAR(80) NOT NULL);
 CREATE TABLE IF NOT EXISTS house_recurring(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,description VARCHAR(160) NOT NULL,total_cents INTEGER NOT NULL CHECK(total_cents>=2),first_due DATE NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE);
 ALTER TABLE house_expenses ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT TRUE;
 ALTER TABLE house_expenses ADD COLUMN IF NOT EXISTS due_date DATE;
 UPDATE house_expenses SET due_date=day WHERE due_date IS NULL;
 ALTER TABLE house_expenses ALTER COLUMN due_date SET NOT NULL;
 ALTER TABLE house_expenses ADD COLUMN IF NOT EXISTS recurring_id BIGINT REFERENCES house_recurring(id);
 ALTER TABLE house_expenses ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE;
 CREATE UNIQUE INDEX IF NOT EXISTS house_occurrence_unique ON house_expenses(recurring_id,due_date);
 ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS house_expense_id BIGINT UNIQUE REFERENCES house_expenses(id) ON DELETE CASCADE;
 ALTER TABLE house_people ADD COLUMN IF NOT EXISTS members JSONB;
 ALTER TABLE house_expenses ADD COLUMN IF NOT EXISTS allocations JSONB;
 ALTER TABLE house_settlements ADD COLUMN IF NOT EXISTS from_member TEXT;
 ALTER TABLE house_settlements ADD COLUMN IF NOT EXISTS to_member TEXT;
 ALTER TABLE house_settlements ADD COLUMN IF NOT EXISTS amount_cents INTEGER;
 `);}
async function sync(c,uid){
 const people=await division.members(c,uid),ids=people.filter(p=>p.active!==false).map(p=>p.id);
 const old=await c.query('SELECT * FROM house_expenses WHERE user_id=$1 AND allocations IS NULL',[uid]);for(const e of old.rows)await c.query('UPDATE house_expenses SET allocations=$3::jsonb WHERE id=$1 AND user_id=$2',[e.id,uid,JSON.stringify(division.legacy(e))]);
 const r=await c.query('SELECT *,first_due::text AS first_due FROM house_recurring WHERE user_id=$1 AND active=TRUE',[uid]);
 for(const t of r.rows){for(const day of occurrences(t.first_due)){const exists=await c.query('SELECT id FROM house_expenses WHERE recurring_id=$1 AND due_date=$2',[t.id,day]);if(exists.rowCount)continue;const allocation=await division.allocate(c,uid,t.total_cents,ids,day);await c.query(`INSERT INTO house_expenses(user_id,description,day,due_date,total_cents,mine_cents,share_cents,payer,paid,recurring_id,allocations) VALUES($1,$2,$3,$3,$4,0,$5,'both',FALSE,$6,$7::jsonb) ON CONFLICT(recurring_id,due_date) DO NOTHING`,[uid,t.description,day,t.total_cents,allocation.find(p=>p.id==='me').share_cents,t.id,JSON.stringify(allocation)]);}}
 await c.query(`DELETE FROM finance_entries f USING house_expenses h WHERE f.house_expense_id=h.id AND h.user_id=$1 AND h.deleted=TRUE`,[uid]);
 await c.query(`INSERT INTO finance_entries(user_id,type,name,amount,created_date,due_date,paid,paid_date,paid_at,house_expense_id)
 SELECT user_id,'expense','Casa · '||description,share_cents/100.0,CASE WHEN paid THEN day ELSE LEAST(due_date,(NOW() AT TIME ZONE 'America/Bahia')::date) END,due_date,CASE WHEN paid THEN 1 ELSE 0 END,CASE WHEN paid THEN day ELSE NULL END,CASE WHEN paid THEN NOW() ELSE NULL END,id FROM house_expenses WHERE user_id=$1 AND deleted=FALSE
 ON CONFLICT(house_expense_id) DO UPDATE SET name=EXCLUDED.name,amount=EXCLUDED.amount,due_date=EXCLUDED.due_date,paid=EXCLUDED.paid,paid_date=EXCLUDED.paid_date,paid_at=CASE WHEN EXCLUDED.paid=1 THEN COALESCE(finance_entries.paid_at,EXCLUDED.paid_at) ELSE NULL END`,[uid]);
}
async function transaction(pool,uid,fn=async()=>{}){const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock($1::bigint)',[uid]);await sync(c,uid);const result=await fn(c);await sync(c,uid);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function ledger(pool,id){const r=await pool.query(`SELECT day::text AS date,share_cents-mine_cents AS adjustment,mine_cents-share_cents AS balance_delta FROM house_expenses WHERE user_id=$1 AND paid=TRUE AND deleted=FALSE UNION ALL SELECT day::text,-delta_cents,delta_cents FROM house_settlements WHERE user_id=$1`,[id]);return r.rows.map(x=>({date:iso(x.date),adjustment:Number(x.adjustment),balanceDelta:Number(x.balance_delta)}));}
async function applySummary(pool,id,month,data,totals){const rows=await ledger(pool,id);let adjustment=0;for(const d of data){const n=rows.filter(x=>x.date===d.date).reduce((s,x)=>s+x.adjustment,0)/100;d.houseCashAdjustment=n;d.realizedCashflow=Number(d.realizedCashflow||0)+n;adjustment+=n;}totals.houseCashAdjustment=adjustment;totals.cashflow=Number(totals.cashflow||0)+adjustment;totals.houseBalance=rows.filter(x=>x.date<=today()).reduce((s,x)=>s+x.balanceDelta,0)/100;}
function create({pool,readBody,sendJson,expense}){
 const validate=b=>{try{return expense(b);}catch(e){e.status=400;throw e;}};
 return async function handle(req,res,url,uid){const reply=(d,s=200)=>sendJson(res,s,d),fail=message=>{throw Object.assign(Error(message),{status:400});};
 try{return await transaction(pool,uid,async c=>{
 if(url==='/api/house/people'&&req.method==='POST'){
 await division.save(c,uid,await readBody(req),today());return {ok:true};
 }
 if(url==='/api/house'&&req.method==='GET'){
 const month=new URL(req.url||'/api/house','http://localhost').searchParams.get('month')||today().slice(0,7);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month.slice(0,4)==='0000')fail('Mês inválido.');
 const [e,s,r]=await Promise.all([c.query('SELECT *,day::text AS day,due_date::text AS due_date FROM house_expenses WHERE user_id=$1 AND deleted=FALSE ORDER BY house_expenses.due_date DESC,id DESC',[uid]),c.query('SELECT *,day::text AS day FROM house_settlements WHERE user_id=$1 ORDER BY house_settlements.day DESC,id DESC',[uid]),c.query('SELECT *,first_due::text AS first_due FROM house_recurring WHERE user_id=$1 AND active=TRUE ORDER BY id',[uid])]);
 const movements=[...e.rows.filter(x=>x.paid).map(x=>({date:x.day,delta:x.mine_cents-x.share_cents})),...s.rows.map(x=>({date:x.day,delta:x.delta_cents}))];
 const balance=movements.filter(x=>x.date.slice(0,7)===month).reduce((n,x)=>n+x.delta,0);
 const previousBalance=movements.filter(x=>x.date.slice(0,7)<month).reduce((n,x)=>n+x.delta,0);
 const members=await division.members(c,uid),group=division.balances(e.rows,s.rows,members,month);const people={my_name:members.find(p=>p.id==='me')?.name||'Eu',other_name:members.find(p=>p.id!=='me')?.name||'Outra pessoa'};
 return {people,members:group.members,transfers:group.transfers,month,expenses:e.rows.filter(x=>x.due_date.slice(0,7)===month),settlements:s.rows.filter(x=>x.day.slice(0,7)===month),recurring:r.rows,balance,previousBalance,closingBalance:previousBalance+balance};
 }
 if(url==='/api/house'&&req.method==='POST'){
 const b=await readBody(req),e=validate({...b,payer:b.payer||'both'}),paid=b.paid!==false;const ids=(await division.members(c,uid)).filter(p=>p.active!==false).map(p=>p.id);const equal=b.equal_paid===true||(!Array.isArray(b.payments)&&(!b.payer||b.payer==='both'));const allocation=await division.allocate(c,uid,e.total,ids,e.day,division.payments(b,ids,e.total,paid),paid,equal),mine=allocation.find(p=>p.id==='me');
 if(e.day>today()&&paid)fail('Não confirme um pagamento futuro. Marque como previsto.');await c.query('INSERT INTO house_expenses(user_id,description,day,due_date,total_cents,mine_cents,share_cents,payer,paid,allocations) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9::jsonb)',[uid,e.description,e.day,e.total,mine.paid_cents,mine.share_cents,e.payer,paid,JSON.stringify(allocation)]);return {ok:true};}
 if(url==='/api/house/recurring'&&req.method==='POST'){const b=await readBody(req),e=validate({...b,payer:'both'});const ids=(await division.members(c,uid)).filter(p=>p.active!==false).map(p=>p.id);division.split(e.total,ids);if(e.day<today()||Date.parse(e.day)>Date.parse(today())+366*86400000)fail('Informe o primeiro vencimento a partir de hoje, até um ano à frente.');await c.query('INSERT INTO house_recurring(user_id,description,total_cents,first_due) VALUES($1,$2,$3,$4)',[uid,e.description,e.total,e.day]);return {ok:true};}
 const pay=url.match(/^\/api\/house\/expenses\/(\d+)\/pay$/);if(pay&&req.method==='POST'){const b=await readBody(req),x=await c.query('SELECT * FROM house_expenses WHERE id=$1 AND user_id=$2 AND deleted=FALSE FOR UPDATE',[pay[1],uid]);if(!x.rows[0])return {error:'Despesa não encontrada.',_status:404};const row=x.rows[0],e=validate({description:row.description,amount:row.total_cents/100,day:b.day,payer:b.payer||'both'}),ids=(row.allocations||division.legacy(row)).map(p=>p.id),allocation=(b.equal_paid===true||(!Array.isArray(b.payments)&&(!b.payer||b.payer==='both')))?(row.allocations||division.legacy(row)).map(p=>({...p,paid_cents:p.share_cents})):division.split(e.total,ids,division.payments(b,ids,e.total,true),true);
 for(const p of allocation)p.share_cents=(row.allocations||division.legacy(row)).find(x=>x.id===p.id).share_cents;if(e.day>today())fail('A data de pagamento não pode ser futura.');await c.query('UPDATE house_expenses SET paid=TRUE,day=$3,payer=$4,mine_cents=$5,allocations=$6::jsonb WHERE id=$1 AND user_id=$2',[pay[1],uid,e.day,e.payer,allocation.find(p=>p.id==='me').paid_cents,JSON.stringify(allocation)]);return {ok:true};}
 if(url==='/api/house/settle'&&req.method==='POST'){
 const b=await readBody(req),amount=Math.round(Number(b.amount)*100),members=await division.members(c,uid);const other=members.find(p=>p.id!=='me')?.id,from=b.from_member||(b.direction==='received'?other:'me'),to=b.to_member||(b.direction==='received'?'me':other);
 if(!Number.isSafeInteger(amount)||amount<=0||amount>100000000||from===to||!members.some(p=>p.id===from)||!members.some(p=>p.id===to))fail('Informe o valor, quem devolveu e quem recebeu.');const delta=from==='me'?amount:to==='me'?-amount:0;await c.query("INSERT INTO house_settlements(user_id,day,delta_cents,from_member,to_member,amount_cents) VALUES($1,(NOW() AT TIME ZONE 'America/Bahia')::date,$2,$3,$4,$5)",[uid,delta,from,to,amount]);return {ok:true};}

 const stop=url.match(/^\/api\/house\/recurring\/(\d+)$/);if(stop&&req.method==='DELETE'){const r=await c.query('UPDATE house_recurring SET active=FALSE WHERE id=$1 AND user_id=$2 RETURNING id',[stop[1],uid]);if(!r.rowCount)return {error:'Conta fixa não encontrada.',_status:404};await c.query('UPDATE house_expenses SET deleted=TRUE WHERE user_id=$1 AND recurring_id=$2 AND paid=FALSE AND due_date>=$3',[uid,stop[1],today()]);return {ok:true};}
 const del=url.match(/^\/api\/house\/(expenses|settlements)\/(\d+)$/);if(del&&req.method==='DELETE'){const r=del[1]==='expenses'?await c.query('UPDATE house_expenses SET deleted=TRUE WHERE id=$1 AND user_id=$2 AND deleted=FALSE',[del[2],uid]):await c.query('DELETE FROM house_settlements WHERE id=$1 AND user_id=$2',[del[2],uid]);return r.rowCount?{ok:true}:{error:'Registro não encontrado.',_status:404};}
 return {error:'Rota não encontrada.',_status:404};
 }).then(result=>{const status=result._status||200;delete result._status;return reply(result,status);});}catch(e){if(e.status===400)return reply({error:e.message},400);throw e;}
 };
}
module.exports={install,create,transaction,ledger,applySummary,occurrences,today};
