'use strict';
const {TYPES}=require('./perfis-financeiros');const {date}=require('./server-importacao');
const cents=n=>Math.round(Number(n)*100);const iso=x=>String(x||'').slice(0,10);
async function install(pool){await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS finance_preferences JSONB; ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS cost_kind VARCHAR(20);`);}
function preferences(v){if(!v||typeof v!=='object')throw Error('Configuração inválida.');const result={};for(const scope of ['pessoal','profissional']){const x=v[scope];if(!x)continue;if(typeof x.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||!date(x.date)||!Number.isFinite(x.balance)||Math.abs(x.balance)>999999999999||Math.abs(x.balance*100-Math.round(x.balance*100))>.001)throw Error('Informe data e saldo inicial válidos para cada caixa.');result[scope]={date:x.date,balance:x.balance};}return result;}
function grossGoal(net,rate){if(!Number.isFinite(net)||net<0||!Number.isFinite(rate)||rate<0||rate>=100)throw Error('Informe uma necessidade positiva e um custo percentual de 0 até menos de 100.');return Math.ceil((net/(1-rate/100))*100-1e-8)/100;}
function cashflow(entries,prefs,scope,month,today){
  const start=month+'-01',end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
  const relevant=entries.filter(e=>(e.financial_scope||'nao_classificado')===scope);
  const setup=prefs?.[scope];let balance=setup&&setup.date<=start?cents(setup.balance):null;
  const days=[];let received=0,paid=0,pendingIncome=0,pendingExpense=0,overdueIncome=0,overdueExpense=0;
  const paidDate=e=>iso(e.paid_date)||iso(e.paid_at)||iso(e.due_date);
  if(balance!==null)for(const e of relevant)if(e.paid&&paidDate(e)>=setup.date&&paidDate(e)<start)balance+=(e.type==='income'?1:-1)*cents(e.amount);
  let projected=balance;
  for(let d=1;d<=Number(end.slice(-2));d++){
    const day=month+'-'+String(d).padStart(2,'0');let income=0,expense=0,incoming=0,outgoing=0;
    if(setup&&setup.date===day&&setup.date>start){balance=cents(setup.balance);projected=balance;}
    for(const e of relevant){const amount=cents(e.amount);if(e.paid&&paidDate(e)===day){if(e.type==='income')income+=amount;else expense+=amount;}
      if(!e.paid){const due=iso(e.due_date);if(due===day&&day>=today){if(e.type==='income')incoming+=amount;else outgoing+=amount;}if(due<today&&day===today&&e.type==='expense')outgoing+=amount;}}
    received+=income;paid+=expense;pendingIncome+=incoming;pendingExpense+=outgoing;
    if(balance!==null&&(!setup||day>=setup.date)){balance+=income-expense;projected+=income-expense+incoming-outgoing;}
    days.push({date:day,income:income/100,expense:expense/100,incoming:incoming/100,outgoing:outgoing/100,balance:balance===null?null:balance/100,projected:projected===null?null:projected/100});
  }
  for(const e of relevant)if(!e.paid&&iso(e.due_date)<today){if(e.type==='income')overdueIncome+=cents(e.amount);else overdueExpense+=cents(e.amount);}
  return {scope,setup:setup||null,days,received:received/100,paid:paid/100,pendingIncome:pendingIncome/100,pendingExpense:pendingExpense/100,overdueIncome:overdueIncome/100,overdueExpense:overdueExpense/100};
}
function create({pool,requireUser,requireAdmin,sendJson,readBody,getTodayLocal}){return {async handle(req,res,url){
  const adminMatch=url.match(/^\/api\/admin\/clients\/(\d+)\/activities$/);if(!url.startsWith('/api/finance/activities')&&!adminMatch)return false;
  const admin=!!adminMatch,user=await (admin?requireAdmin(req,res):requireUser(req,res));if(!user)return true;const userId=admin?Number(adminMatch[1]):user.id;
  if(admin&&req.method!=='GET')return sendJson(res,405,{error:'Somente leitura no administrador.'});
  try{
    if(req.method==='GET'){
      const month=new URL(req.url,'http://localhost').searchParams.get('month')||getTodayLocal().slice(0,7);if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return sendJson(res,400,{error:'Mês inválido.'});
      const config=(await pool.query('SELECT financial_profile,finance_preferences FROM users WHERE id=$1',[userId])).rows[0];if(!config)return sendJson(res,404,{error:'Cliente não encontrado.'});
      const entries=(await pool.query(`SELECT id,type,name,amount,created_date::text,due_date::text,paid,paid_date::text,paid_at::text,financial_scope,financial_activity,financial_category,cost_kind FROM finance_entries WHERE user_id=$1 ORDER BY due_date,id`,[userId])).rows;
      return sendJson(res,200,{month,today:getTodayLocal(),profile:config.financial_profile,preferences:config.finance_preferences||{},entries,flows:['pessoal','profissional','nao_classificado'].map(scope=>cashflow(entries,config.finance_preferences,scope,month,getTodayLocal()))});
    }
    if(req.method==='PUT'&&url==='/api/finance/activities/preferences'){
      const value=preferences(await readBody(req));await pool.query('UPDATE users SET finance_preferences=$1 WHERE id=$2',[JSON.stringify(value),userId]);return sendJson(res,200,{message:'Saldos iniciais salvos.'});
    }
    if(req.method==='PATCH'&&url==='/api/finance/activities/classify'){
      const b=await readBody(req);if(!Number.isSafeInteger(b.id)||!['pessoal','profissional','nao_classificado'].includes(b.scope)||!['','fixo','variavel'].includes(b.cost_kind||'')||typeof b.category!=='string'||b.category.length>60|| (b.activity&&!Object.hasOwn(TYPES,b.activity)))return sendJson(res,400,{error:'Classificação inválida.'});
      const profile=(await pool.query('SELECT financial_profile FROM users WHERE id=$1',[userId])).rows[0]?.financial_profile;if(b.activity&&!profile?.activities?.includes(b.activity))return sendJson(res,400,{error:'Selecione essa atividade no seu perfil primeiro.'});
      const r=await pool.query('UPDATE finance_entries SET financial_scope=$1,financial_activity=$2,financial_category=$3,cost_kind=$4 WHERE id=$5 AND user_id=$6 RETURNING id',[b.scope==='nao_classificado'?null:b.scope,b.activity||null,b.category.trim()||null,b.cost_kind||null,b.id,userId]);return sendJson(res,r.rowCount?200:404,r.rowCount?{message:'Classificação salva.'}:{error:'Lançamento não encontrado.'});
    }
    return sendJson(res,405,{error:'Método não permitido.'});
  }catch(e){console.error('Atividades:',e);return sendJson(res,400,{error:'Não foi possível concluir. Revise os dados e tente novamente.'});}
}};}
module.exports={install,create,cashflow,grossGoal,preferences};
