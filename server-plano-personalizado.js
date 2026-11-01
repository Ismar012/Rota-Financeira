'use strict';
const crypto=require('node:crypto');
function quote(input={}){
 const months=Number(input.months),consultations=Number(input.consultations??0),mentoring=Number(input.mentoring??0);
 if(typeof input.platform!=='boolean'||!Number.isInteger(months)||months<1||months>12||![consultations,mentoring].every(n=>Number.isInteger(n)&&n>=0&&n<=12))throw Error('Escolha de 1 a 12 meses e até 12 atendimentos de cada tipo por mês.');
 const config={months,platform:input.platform,consultations,mentoring};
 const unit=months>1?2691:2990;
 const items=[];
 if(config.platform)items.push({description:`Plataforma por ${months*30} dias${months>1?' · 10% de desconto na mensalidade':''}`,quantity:months,price:unit});
 if(consultations)items.push({description:`Consultoria · ${consultations} por período de 30 dias, durante ${months} período(s)`,quantity:consultations*months,price:17990});
 if(mentoring)items.push({description:`Sessão de mentoria · ${mentoring} por período de 30 dias, durante ${months} período(s)`,quantity:mentoring*months,price:11990});
 const cents=items.reduce((n,x)=>n+x.quantity*x.price,0);
 if(!cents)throw Error('Selecione pelo menos um serviço para contratar.');
 return {config,items,cents,name:'Plano personalizado'};
}
async function install(pool){await pool.query(`
 ALTER TABLE billing_orders ADD COLUMN IF NOT EXISTS custom_config JSONB;
 CREATE TABLE IF NOT EXISTS billing_session_credits (
 id UUID PRIMARY KEY,order_id UUID NOT NULL REFERENCES billing_orders(id) ON DELETE CASCADE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,plan_code TEXT NOT NULL,
 available_at TIMESTAMPTZ NOT NULL,remaining SMALLINT NOT NULL DEFAULT 1 CHECK(remaining IN (0,1)),
 appointment_id BIGINT,used_at TIMESTAMPTZ);
 CREATE INDEX IF NOT EXISTS billing_sessions_user ON billing_session_credits(user_id,plan_code,available_at,remaining);
 CREATE TABLE IF NOT EXISTS billing_partner_applications (
 user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),reviewed_at TIMESTAMPTZ,reviewed_by BIGINT REFERENCES users(id));
 `);}
async function fulfill(client,order){
 const q=quote(typeof order.custom_config==='string'?JSON.parse(order.custom_config):order.custom_config);
 if(q.cents!==Number(order.amount_cents))throw Error('Configuração do pedido divergente.');
 const now=new Date(),days=30*86400000;
 if(q.config.platform){
  const prior=(await client.query("SELECT expires_at FROM billing_entitlements WHERE user_id=$1 AND plan_code='plataforma' FOR UPDATE",[order.user_id])).rows[0];
  const start=prior?.expires_at&&new Date(prior.expires_at)>now?new Date(prior.expires_at):now;
  await client.query(`INSERT INTO billing_entitlements(user_id,plan_code,expires_at,anchor_day) VALUES($1,'plataforma',$2,$3)
  ON CONFLICT(user_id,plan_code) DO UPDATE SET expires_at=EXCLUDED.expires_at,updated_at=NOW()`,[order.user_id,new Date(start.getTime()+q.config.months*days),now.getUTCDate()]);
 }
 for(let m=0;m<q.config.months;m++)for(const [code,count] of [['consultoria_diagnostica',q.config.consultations],['sessao_mentoria',q.config.mentoring]])for(let i=0;i<count;i++){
  await client.query('INSERT INTO billing_session_credits(id,order_id,user_id,plan_code,available_at) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),order.id,order.user_id,code,new Date(now.getTime()+m*days)]);
 }
}
module.exports={quote,install,fulfill};
