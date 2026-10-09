'use strict';
// Valores monetários em centavos. Nenhuma projeção de ganho vira recebimento.
const iso = value => String(value || '').slice(0, 10);
const valid = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d+'T12:00:00Z')) && new Date(d+'T12:00:00Z').toISOString().slice(0,10) === d;
const cents = v => Math.round((Number(v) || 0) * 100);
const money = v => v / 100;
const add = (d,n) => new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const monthEnd = m => new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0,12)).toISOString().slice(0,10);
function todayBahia() { const p = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); const get=t=>p.find(x=>x.type===t).value; return `${get('year')}-${get('month')}-${get('day')}`; }
function compute({entries,restDays=[],settings,regularizations=[],month,today=todayBahia()}) {
  const first=month+'-01',last=monthEnd(month), reference=today>last?last:(today<first?first:today);
  const start=settings?iso(settings.start_date):reference;
  const from=reference>start?reference:start;
  const rest=new Set(restDays.map(x=>iso(x.rest_date)));
  const days=[]; if(from<=last)for(let d=from;d<=last;d=add(d,1))if(!rest.has(d))days.push(d);
  const reg=new Map(regularizations.map(x=>[String(x.entry_id),iso(x.regularize_date)]));
  // paid_date é a data contábil efetiva; confirmação posterior não muda o dia de caixa.
  const effective=e=>{const d=iso(e.paid_date)||iso(e.paid_at)||iso(e.due_date);return d;};
  const cutoff=reference>today?today:reference;
  const exists=e=>valid(iso(e.created_date))&&iso(e.created_date)<=cutoff;
  const isPaid=e=>Number(e.paid)===1&&valid(effective(e))&&effective(e)<=cutoff;
  let received=0,spent=0;
  for(const e of entries){if(!exists(e)||!isPaid(e))continue;const d=effective(e);if(d<start||d>reference)continue;if(e.type==='income')received+=cents(e.amount);if(e.type==='expense')spent+=cents(e.amount);}
  const cash=cents(settings?.initial_balance)+received-spent,available=Math.max(0,cash);
  let credit=available,total=0,excluded=0;const debts=[],unresolved=[];
  for(const e of entries){if(e.type!=='expense'||cents(e.amount)<=0||!exists(e)||isPaid(e)||!valid(iso(e.due_date)))continue;const due=iso(e.due_date);if(due>last){excluded+=cents(e.amount);continue;}let deadline=due,reason=null;
    if(due<reference){deadline=reg.get(String(e.id));if(!valid(deadline)||deadline<reference)reason='Definir prazo de regularização';}
    if(!reason && deadline>last)reason='Regularização fora do mês';
    const debt={id:e.id,name:e.name,dueDate:due,deadline:valid(deadline)?deadline:null,amount:money(cents(e.amount)),overdue:due<reference,reason};
    total+=cents(e.amount);debts.push(debt);
  }
  debts.sort((a,b)=>String(a.deadline||a.dueDate).localeCompare(String(b.deadline||b.dueDate))||Number(a.id)-Number(b.id));
  let cumulative=0,maxRate=0;const checks=[];
  for(const d of debts){const amount=cents(d.amount),cover=Math.min(credit,amount);credit-=cover;d.cashAllocated=money(cover);d.remaining=money(amount-cover);d.availableDays=d.deadline?days.filter(x=>x<=d.deadline).length:0;
    if(d.reason){if(d.remaining>0)unresolved.push(d);continue;}
    cumulative+=amount-cover;
    const count=days.filter(x=>x<=d.deadline).length;const daily=count?Math.ceil(cumulative/count):0;
    const previous=checks[checks.length-1];const check={deadline:d.deadline,remaining:money(cumulative),days:count,dailyGoal:money(daily),blocked:count===0&&cumulative>0};if(previous&&previous.deadline===d.deadline)checks[checks.length-1]=check;else checks.push(check);
  }
  for(const c of checks)maxRate=Math.max(maxRate,cents(c.dailyGoal));
  const blocked=checks.some(c=>c.blocked);
  const status=today>last?'past':!settings?'needs_setup':unresolved.length?'needs_regularization':blocked?'no_working_days':reference>last?'past':cash<0?'cash_inconsistent':'ready';
  const goal=money(maxRate);const remaining=money(Math.max(0,total-available));
  // Plano constante suficiente para todos os prazos; último dia ajusta centavos.
  let planned=Math.max(0,total-available);const daily=days.map(date=>{const amount=Math.min(maxRate,planned);planned-=amount;return{date,dailyGoal:money(amount),goalState:'projected'};});
  return{version:2,month,referenceDate:reference,startDate:settings?start:null,initialBalance:money(cents(settings?.initial_balance)),received:money(received),paid:money(spent),cashBalance:money(cash),availableBalance:money(available),pendingTotal:money(total),remainingTotal:remaining,excludedFutureTotal:money(excluded),availableWorkingDays:days.length,dailyGoal:goal,displayDailyGoal:status==='ready'?goal:null,status,debts,checks,unresolved,daily,settings:settings?{start_date:start,initial_balance:Number(settings.initial_balance)}:null};
}
function createGoals({pool,requireUser,requireAdmin,readBody,sendJson,recordClientChange}) {
  async function initialize(){await pool.query(`CREATE TABLE IF NOT EXISTS goal_settings(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,start_date DATE NOT NULL,initial_balance NUMERIC(14,2) NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS goal_regularizations(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,entry_id BIGINT NOT NULL REFERENCES finance_entries(id) ON DELETE CASCADE,regularize_date DATE NOT NULL,PRIMARY KEY(user_id,entry_id));
CREATE TABLE IF NOT EXISTS goal_snapshots(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,goal_date DATE NOT NULL,payload JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,goal_date));`);}
  async function sources(id){const [e,r,s,g]=await Promise.all([pool.query('SELECT * FROM finance_entries WHERE user_id=$1 ORDER BY due_date,id',[id]),pool.query('SELECT rest_date FROM rest_days WHERE user_id=$1',[id]),pool.query('SELECT * FROM goal_settings WHERE user_id=$1',[id]),pool.query('SELECT * FROM goal_regularizations WHERE user_id=$1',[id])]);return{entries:e.rows,restDays:r.rows,settings:s.rows[0],regularizations:g.rows};}
  async function plan(id,month){const source=await sources(id),today=todayBahia();const p=compute({...source,month,today});
    if(month===today.slice(0,7)&&p.settings)await pool.query(`INSERT INTO goal_snapshots(user_id,goal_date,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(user_id,goal_date) DO UPDATE SET payload=EXCLUDED.payload,updated_at=CURRENT_TIMESTAMP WHERE goal_snapshots.goal_date=$4::date`,[id,today,JSON.stringify(p),today]);
    const snapshots=await pool.query('SELECT goal_date,payload,updated_at FROM goal_snapshots WHERE user_id=$1 AND goal_date BETWEEN $2 AND $3 ORDER BY goal_date',[id,month+'-01',monthEnd(month)]);
    p.history=snapshots.rows.filter(x=>iso(x.goal_date)<today).map(x=>{const recorded=typeof x.payload==='string'?JSON.parse(x.payload):x.payload;const revised=compute({...source,month,today:iso(x.goal_date)});return{date:iso(x.goal_date),dailyGoal:recorded.displayDailyGoal,goalState:'recorded',recorded,revised:JSON.stringify([recorded.debts,recorded.cashBalance,recorded.checks,recorded.status,recorded.availableWorkingDays])!==JSON.stringify([revised.debts,revised.cashBalance,revised.checks,revised.status,revised.availableWorkingDays])?revised:null,recordedAt:x.updated_at};});return p;
  }
  async function apply(id,month,data,totals){const p=await plan(id,month);const projected=new Map(p.daily.map(x=>[x.date,x]));const history=new Map(p.history.map(x=>[x.date,x]));const today=todayBahia();for(const d of data){const h=history.get(d.date);if(d.date<today){d.dailyGoal=h?.dailyGoal??null;d.goalState=h?'recorded':'unrecorded';d.goalRevised=h?.revised?.displayDailyGoal??null;}else{d.dailyGoal=p.displayDailyGoal===null?null:(projected.get(d.date)?.dailyGoal??0);d.goalState=d.date===today?'current':'projected';}}
    Object.assign(totals,{dailyGoal:p.displayDailyGoal,goalStatus:p.status,availableWorkingDays:p.availableWorkingDays,pendingExpense:p.pendingTotal,totalPlannedGoal:p.remainingTotal,availableBalance:p.availableBalance,goalCashBalance:p.cashBalance});return p;}
  async function handle(req,res,url){const adminMatch=url.match(/^\/api\/admin\/clients\/(\d+)\/goal-(settings|regularization)$/),clientMatch=url.match(/^\/api\/finance\/goal-(settings|regularization)$/);if(!adminMatch&&!clientMatch)return false;
    const actor=adminMatch?await requireAdmin(req,res):await requireUser(req,res);if(!actor)return true;const id=adminMatch?Number(adminMatch[1]):Number(actor.id),kind=adminMatch?adminMatch[2]:clientMatch[1];
    const target=await pool.query('SELECT id FROM users WHERE id=$1',[id]);if(!target.rows.length)return sendJson(res,404,{error:'Cliente não encontrado.'});
    if(req.method!=='PUT')return sendJson(res,405,{error:'Método não permitido.'});let body;try{body=await readBody(req);}catch{return sendJson(res,400,{error:'Dados inválidos.'});}
    if(kind==='settings'){const d=iso(body.start_date),balance=Number(body.initial_balance);if(!valid(d)||d>todayBahia()||!Number.isFinite(balance)||balance<0||balance>999999999999)return sendJson(res,400,{error:'Informe uma data inicial até hoje e um saldo não negativo.'});await pool.query(`INSERT INTO goal_settings(user_id,start_date,initial_balance) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET start_date=EXCLUDED.start_date,initial_balance=EXCLUDED.initial_balance,updated_at=CURRENT_TIMESTAMP`,[id,d,money(cents(balance))]);await recordClientChange(id,actor.id,'Base da meta mensal atualizada',null,null,null,JSON.stringify({start_date:d,initial_balance:balance}));}
    else{const entryId=Number(body.entry_id),d=iso(body.regularize_date);if(!Number.isSafeInteger(entryId)||!valid(d)||d<todayBahia())return sendJson(res,400,{error:'Informe uma despesa e um prazo a partir de hoje.'});const result=await pool.query("SELECT id FROM finance_entries WHERE id=$1 AND user_id=$2 AND type='expense' AND paid=0",[entryId,id]);if(!result.rows.length)return sendJson(res,404,{error:'Despesa pendente não encontrada.'});await pool.query(`INSERT INTO goal_regularizations(user_id,entry_id,regularize_date) VALUES($1,$2,$3) ON CONFLICT(user_id,entry_id) DO UPDATE SET regularize_date=EXCLUDED.regularize_date`,[id,entryId,d]);await recordClientChange(id,actor.id,'Prazo de regularização da meta atualizado',null,null,null,JSON.stringify({entry_id:entryId,regularize_date:d}));}
    return sendJson(res,200,{message:'Planejamento atualizado.'});
  }
  // Salva a meta do dia enquanto o processo está ativo. Não inventa registros de dias offline.
  let running=false;async function capture(){if(running)return;running=true;try{const ids=await pool.query('SELECT user_id FROM goal_settings');for(const row of ids.rows)await plan(row.user_id,todayBahia().slice(0,7));}catch(e){console.error('Registro diário das metas:',e.message);}finally{running=false;}}
  function start(){const timer=setInterval(capture,60000);timer.unref();}
  return{initialize,handle,apply,plan,start};
}
module.exports={compute,createGoals,todayBahia};
