'use strict';
const crypto = require('node:crypto');
const API = 'https://api.checkout.infinitepay.io';
// Valores sempre definidos no servidor, em centavos.
const CATALOG = Object.freeze({
  plataforma: {name:'Plataforma Rota Financeira', cents:2990, monthly:true, grants:['plataforma','planejamento','divisao-casa']},
  consultoria_diagnostica: {name:'Consultoria diagnóstica', cents:17990, monthly:false, grants:['consultoria']},
  sessao_mentoria: {name:'Sessão de mentoria avulsa/extra', cents:11990, monthly:false, grants:['acompanhamento']},
  mentoria_mensal: {name:'Mentoria mensal', cents:39990, monthly:true, grants:['acompanhamento']},
  premium: {name:'Premium', cents:49999, monthly:true, grants:['plataforma','planejamento','divisao-casa','consultoria','acompanhamento']},
  parceiros: {name:'Programa Parceiros', cents:14999, monthly:true, grants:['plataforma','planejamento','divisao-casa','consultoria','acompanhamento']}
});
function addDays30(date) { return new Date(new Date(date).getTime()+30*86400000); }
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
  await pool.query(`CREATE TABLE IF NOT EXISTS billing_one_time_credits (
    order_id UUID PRIMARY KEY REFERENCES billing_orders(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_code TEXT NOT NULL,
    remaining SMALLINT NOT NULL DEFAULT 1 CHECK(remaining IN (0,1)),
    appointment_id BIGINT,
    used_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS billing_credits_user ON billing_one_time_credits(user_id,plan_code,remaining);
  INSERT INTO billing_one_time_credits(order_id,user_id,plan_code)
    SELECT id,user_id,plan_code FROM billing_orders
    WHERE status='paid' AND plan_code IN ('consultoria_diagnostica','sessao_mentoria')
    ON CONFLICT(order_id) DO NOTHING;`);
}
function nextUrl(code){return code==='consultoria_diagnostica'?'/agendamento.html?service=consultoria':code==='sessao_mentoria'?'/agendamento.html?service=acompanhamento':'/servicos.html';}
function create({pool,getCurrentUser,requireAdmin,readBody,sendJson}){
  const reply=(res,code,body)=>sendJson(res,code,body);
  const base=String(process.env.PUBLIC_BASE_URL||'').replace(/\/$/,'');
  function configured(){return /^https:\/\/[^/?#]+$/i.test(base)&&!!process.env.INFINITEPAY_API_KEY&&!!process.env.INFINITEPAY_HANDLE;}
  async function confirm(id,slug,tx){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!/^[A-Za-z0-9_.-]{1,180}$/.test(slug)||!/^[A-Za-z0-9_.-]{1,180}$/.test(tx))return {error:'Identificadores da transação incompletos.',code:400};
    const o=await pool.query('SELECT * FROM billing_orders WHERE id=$1',[id]);const order=o.rows[0];
    if(!order)return {error:'Pedido não encontrado.',code:404};
    if(order.status==='paid')return {paid:true,plan_code:order.plan_code,next_url:nextUrl(order.plan_code)};
    const payload={order_nsu:id,slug,transaction_nsu:tx};
    payload.handle=process.env.INFINITEPAY_HANDLE;
    const check=await request('/payment_check',payload);
    if(check.success!==true||check.paid!==true||Number(check.amount)!==Number(order.amount_cents))return {paid:false};
    const client=await pool.connect();
    try {await client.query('BEGIN');const current=(await client.query('SELECT * FROM billing_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[current.user_id]);
      if(current.status==='paid'){await client.query('COMMIT');return {paid:true,plan_code:current.plan_code,next_url:nextUrl(current.plan_code)};}
      const plan=CATALOG[current.plan_code];if(!plan)throw Error('Plano desconhecido');
      await client.query('UPDATE billing_orders SET status=$2,paid_at=NOW(),invoice_slug=$3,transaction_nsu=$4 WHERE id=$1',[id,'paid',slug,tx]);
      if(plan.monthly){
        const prior=(await client.query('SELECT expires_at,anchor_day FROM billing_entitlements WHERE user_id=$1 AND plan_code=$2 FOR UPDATE',[current.user_id,current.plan_code])).rows[0];
        const now=new Date(); const start=prior?.expires_at && new Date(prior.expires_at)>now ? new Date(prior.expires_at) : now;
        const created=(await client.query('SELECT created_at FROM users WHERE id=$1',[current.user_id])).rows[0]?.created_at;
        const anchor=prior?.anchor_day || new Date(created||now).getUTCDate();const end=addDays30(start);
        await client.query(`INSERT INTO billing_entitlements(user_id,plan_code,expires_at,anchor_day)
          VALUES($1,$2,$3,$4) ON CONFLICT(user_id,plan_code) DO UPDATE SET expires_at=EXCLUDED.expires_at,updated_at=NOW()`,[current.user_id,current.plan_code,end,anchor]);
      }
      if(!plan.monthly){
        await client.query(`INSERT INTO billing_one_time_credits(order_id,user_id,plan_code)
          VALUES($1,$2,$3) ON CONFLICT(order_id) DO NOTHING`,[id,current.user_id,current.plan_code]);
      }
      // Nunca perpetuar permissões pagas em user_services/product_permissions.
      // A consulta de acesso resolve os direitos pela data da mensalidade.
      await client.query('COMMIT');return {paid:true,plan_code:current.plan_code,next_url:nextUrl(current.plan_code)};
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  async function handle(req,res,url,parsed){
    if(!url.startsWith('/api/billing/')&&!url.startsWith('/api/webhooks/infinitepay')&&!url.startsWith('/api/admin/billing/'))return false;
    try{
      if(url==='/api/webhooks/infinitepay' && req.method==='POST'){
        const b=await readBody(req);
        const id=String(b.order_nsu||'');const tx=String(b.transaction_nsu||'');const slug=String(b.invoice_slug||b.slug||'');
        const result=await confirm(id,slug,tx);return reply(res,result.code||200,result);
      }
      if(url.startsWith('/api/admin/billing/')){
        const admin=await requireAdmin(req,res);if(!admin)return true;
        if(url==='/api/admin/billing/orders'&&req.method==='GET'){
          const rows=await pool.query(`SELECT o.id,o.user_id,u.name,u.email,o.plan_code,o.amount_cents,o.status,o.created_at,o.paid_at,
            c.remaining,c.used_at,c.appointment_id
            FROM billing_orders o JOIN users u ON u.id=o.user_id
            LEFT JOIN billing_one_time_credits c ON c.order_id=o.id
            ORDER BY o.created_at DESC LIMIT 100`);
          return reply(res,200,{orders:rows.rows});
        }
        if(url==='/api/admin/billing/credits/use'&&req.method==='POST'){
          const b=await readBody(req);const id=String(b.order_nsu||'');
          if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return reply(res,400,{error:'Pedido inválido.'});
          const result=await pool.query(`UPDATE billing_one_time_credits SET remaining=0,used_at=NOW()
            WHERE order_id=$1 AND plan_code='sessao_mentoria' AND remaining=1 AND appointment_id IS NULL
            RETURNING order_id,user_id`,[id]);
          if(!result.rowCount)return reply(res,409,{error:'Crédito não encontrado ou já utilizado.'});
          await pool.query(`INSERT INTO client_change_log(user_id,actor_user_id,action,field_name,details)
            VALUES($1,$2,'Crédito de mentoria avulsa consumido','billing_one_time_credits',$3)`,[result.rows[0].user_id,admin.id,`Pedido ${id}`]);
          return reply(res,200,{ok:true,message:'Sessão marcada como realizada.'});
        }
        return reply(res,404,{error:'Rota de cobrança administrativa não encontrada.'});
      }
      const user=await getCurrentUser(req);if(!user)return reply(res,401,{error:'Entre na sua conta para continuar.'});
      if(url==='/api/billing/catalog'&&req.method==='GET')return reply(res,200,{plans:Object.entries(CATALOG).map(([code,p])=>({code,name:p.name,price_cents:p.cents,monthly:p.monthly,services:p.grants}))});
      if(url==='/api/billing/status'&&req.method==='GET'){
        const {getStatus}=require('./server-acesso');const state=await getStatus(pool,user);return reply(res,200,{...state});
      }
      if(url==='/api/billing/orders'&&req.method==='GET'){
        const rows=await pool.query(`SELECT id,plan_code,amount_cents,status,checkout_url,created_at,paid_at
          FROM billing_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,[user.id]);
        return reply(res,200,{orders:rows.rows});
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
        const b=await readBody(req);const id=String(b.order_nsu||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return reply(res,400,{error:'Identificador de pedido inválido.'});const o=await pool.query('SELECT user_id,status,plan_code FROM billing_orders WHERE id=$1',[id]);
        if(!o.rows.length||Number(o.rows[0].user_id)!==Number(user.id))return reply(res,404,{error:'Pedido não encontrado.'});
        if(o.rows[0].status==='paid')return reply(res,200,{paid:true,plan_code:o.rows[0].plan_code,next_url:nextUrl(o.rows[0].plan_code)});
        const result=await confirm(id,String(b.slug||''),String(b.transaction_nsu||''));return reply(res,result.code||200,result);
      }
      return reply(res,404,{error:'Rota de cobrança não encontrada.'});
    }catch(e){console.error('Falha cobrança:',e.message);return reply(res,502,{error:'Não foi possível processar a cobrança. Confira os dados e tente novamente.'});}
  }
  return {handle};
}
module.exports={CATALOG,addMonth,addDays30,install,create};
