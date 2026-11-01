'use strict';
const crypto = require('node:crypto');
const API = 'https://api.checkout.infinitepay.io';
// Valores sempre definidos no servidor, em centavos.
const CATALOG = Object.freeze({
  plataforma: {name:'Plataforma Rota Financeira', cents:2990, monthly:true, grants:['plataforma','planejamento','divisao-casa']},
  consultoria_diagnostica: {name:'Consultoria diagnóstica', cents:17990, monthly:false, grants:['consultoria']},
  sessao_mentoria: {name:'Sessão de mentoria avulsa/extra', cents:11990, monthly:false, grants:[]},
  mentoria_mensal: {name:'Mentoria mensal', cents:39990, monthly:true, grants:['acompanhamento']},
  premium: {name:'Premium', cents:49999, monthly:true, grants:['plataforma','planejamento','divisao-casa','consultoria','acompanhamento']},
  parceiros: {name:'Programa Parceiros', cents:14999, monthly:true, grants:['plataforma','planejamento','divisao-casa','consultoria','acompanhamento']}
});
function addMonth(date, originalDay) {
  const d = new Date(date);
  const nextYear = d.getUTCFullYear() + (d.getUTCMonth()===11?1:0);
  const nextMonth = (d.getUTCMonth()+1)%12;
  const last = new Date(Date.UTC(nextYear,nextMonth+1,0)).getUTCDate();
  return new Date(Date.UTC(nextYear,nextMonth,Math.min(originalDay,last),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds()));
}
async function request(path,payload) {
  const key=process.env.INFINITEPAY_API_KEY;
  if(!key)throw Error('INFINITEPAY_API_KEY ausente no servidor.');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
  try {const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json','X-Api-Key':key},body:JSON.stringify(payload),signal:controller.signal});
    const body=await r.json().catch(()=>({}));if(!r.ok)throw Error('Falha na InfinitePay (HTTP '+r.status+').');return body;
  }finally{clearTimeout(timeout);}
}
async function install(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS billing_orders (
    id UUID PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_code TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    status TEXT NOT NULL DEFAULT 'pending',checkout_url TEXT,invoice_slug TEXT,transaction_nsu TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),paid_at TIMESTAMPTZ,
    CHECK (status IN ('pending','paid'))
  );
  CREATE TABLE IF NOT EXISTS billing_entitlements (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,plan_code TEXT NOT NULL,
    expires_at TIMESTAMPTZ,anchor_day INTEGER NOT NULL CHECK(anchor_day BETWEEN 1 AND 31),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(user_id,plan_code)
  );`);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS billing_transaction_uniq ON billing_orders(transaction_nsu) WHERE transaction_nsu IS NOT NULL');
}
function create({pool,getCurrentUser,readBody,sendJson}){
  const reply=(res,code,body)=>sendJson(res,code,body);
  const base=String(process.env.PUBLIC_BASE_URL||'').replace(/\/$/,'');
  function configured(){return /^https:\/\/[^/?#]+$/i.test(base)&&!!process.env.INFINITEPAY_API_KEY&&!!process.env.INFINITEPAY_HANDLE;}
  async function confirm(id,slug,tx){
    if(!/^[0-9a-f-]{36}$/i.test(id)||!slug||!tx)return {error:'Identificadores da transação incompletos.',code:400};
    const o=await pool.query('SELECT * FROM billing_orders WHERE id=$1',[id]);const order=o.rows[0];
    if(!order)return {error:'Pedido não encontrado.',code:404};
    if(order.status==='paid')return {paid:true};
    const payload={order_nsu:id,slug,transaction_nsu:tx};
    payload.handle=process.env.INFINITEPAY_HANDLE;
    const check=await request('/payment_check',payload);
    if(check.success!==true||check.paid!==true||Number(check.amount)!==Number(order.amount_cents))return {paid:false};
    const client=await pool.connect();
    try {await client.query('BEGIN');const current=(await client.query('SELECT * FROM billing_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(current.status==='paid'){await client.query('COMMIT');return {paid:true};}
      const plan=CATALOG[current.plan_code];if(!plan)throw Error('Plano desconhecido');
      await client.query('UPDATE billing_orders SET status=$2,paid_at=NOW(),invoice_slug=$3,transaction_nsu=$4 WHERE id=$1',[id,'paid',slug,tx]);
      if(plan.monthly){
        const prior=(await client.query('SELECT expires_at,anchor_day FROM billing_entitlements WHERE user_id=$1 AND plan_code=$2 FOR UPDATE',[current.user_id,current.plan_code])).rows[0];
        const now=new Date(); const start=prior?.expires_at && new Date(prior.expires_at)>now ? new Date(prior.expires_at) : now;
        const created=(await client.query('SELECT created_at FROM users WHERE id=$1',[current.user_id])).rows[0]?.created_at;
        const anchor=prior?.anchor_day || new Date(created||now).getUTCDate();const end=addMonth(start,anchor);
        await client.query(`INSERT INTO billing_entitlements(user_id,plan_code,expires_at,anchor_day)
          VALUES($1,$2,$3,$4) ON CONFLICT(user_id,plan_code) DO UPDATE SET expires_at=EXCLUDED.expires_at,updated_at=NOW()`,[current.user_id,current.plan_code,end,anchor]);
      }
      // Sessões avulsas não concedem automaticamente um mês adicional.
      for(const slugToGrant of plan.grants){
        await client.query(`INSERT INTO user_services(user_id,service_id) SELECT $1,id FROM services WHERE slug=$2 ON CONFLICT DO NOTHING`,[current.user_id,slugToGrant]);
        await client.query(`INSERT INTO product_permissions(user_id,service_id,allowed) SELECT $1,id,TRUE FROM services WHERE slug=$2 ON CONFLICT(user_id,service_id) DO UPDATE SET allowed=TRUE`,[current.user_id,slugToGrant]);
      }
      if(plan.monthly && ['plataforma','premium','parceiros'].includes(current.plan_code)){
        await client.query("UPDATE users SET billing_status='pagante' WHERE id=$1",[current.user_id]);
      }
      await client.query('COMMIT');return {paid:true};
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  async function handle(req,res,url,parsed){
    if(!url.startsWith('/api/billing/')&&!url.startsWith('/api/webhooks/infinitepay'))return false;
    try{
      if(url==='/api/webhooks/infinitepay' && req.method==='POST'){
        const b=await readBody(req);
        const id=String(b.order_nsu||'');const tx=String(b.transaction_nsu||'');const slug=String(b.invoice_slug||b.slug||'');
        const result=await confirm(id,slug,tx);return reply(res,result.code||200,result);
      }
      const user=await getCurrentUser(req);if(!user)return reply(res,401,{error:'Entre na sua conta para continuar.'});
      if(url==='/api/billing/catalog'&&req.method==='GET')return reply(res,200,{plans:Object.entries(CATALOG).map(([code,p])=>({code,name:p.name,price_cents:p.cents,monthly:p.monthly}))});
      if(url==='/api/billing/status'&&req.method==='GET'){
        const r=await pool.query('SELECT plan_code,expires_at FROM billing_entitlements WHERE user_id=$1 ORDER BY expires_at DESC NULLS LAST',[user.id]);return reply(res,200,{subscriptions:r.rows});
      }
      if(url==='/api/billing/checkout'&&req.method==='POST'){
        if(!configured())return reply(res,503,{error:'Checkout não configurado. Informe PUBLIC_BASE_URL, INFINITEPAY_API_KEY e INFINITEPAY_HANDLE no Render.'});
        const b=await readBody(req);const p=CATALOG[String(b.plan||'')];if(!p)return reply(res,400,{error:'Plano inválido.'});
        const id=crypto.randomUUID();await pool.query('INSERT INTO billing_orders(id,user_id,plan_code,amount_cents) VALUES($1,$2,$3,$4)',[id,user.id,b.plan,p.cents]);
        const payload={order_nsu:id,items:[{description:p.name,quantity:1,price:p.cents}],redirect_url:base+'/pagamento-retorno.html',webhook_url:base+'/api/webhooks/infinitepay',options:{single_payment:true,valid_until:new Date(Date.now()+24*60*60*1000).toISOString()}};
        payload.handle=process.env.INFINITEPAY_HANDLE;
        const created=await request('/links',payload);const link=created.url||created.link||created.checkout_url;
        if(typeof link!=='string'||!/^https:\/\//i.test(link))return reply(res,502,{error:'InfinitePay não retornou um link válido.'});
        await pool.query('UPDATE billing_orders SET checkout_url=$2 WHERE id=$1',[id,link]);return reply(res,200,{checkout_url:link,order_nsu:id});
      }
      if(url==='/api/billing/verify'&&req.method==='POST'){
        const b=await readBody(req);const id=String(b.order_nsu||'');const o=await pool.query('SELECT user_id,status FROM billing_orders WHERE id=$1',[id]);
        if(!o.rows.length||Number(o.rows[0].user_id)!==Number(user.id))return reply(res,404,{error:'Pedido não encontrado.'});
        if(o.rows[0].status==='paid')return reply(res,200,{paid:true});
        const result=await confirm(id,String(b.slug||''),String(b.transaction_nsu||''));return reply(res,result.code||200,result);
      }
      return reply(res,404,{error:'Rota de cobrança não encontrada.'});
    }catch(e){console.error('Falha cobrança:',e.message);return reply(res,502,{error:'Não foi possível processar a cobrança. Confira os dados e tente novamente.'});}
  }
  return {handle};
}
module.exports={CATALOG,addMonth,install,create};
