'use strict';
// Fonte única de autorização: datas efetivas dos pagamentos, teste gratuito e exceções explícitas.
const { CATALOG } = require('./server-pagamentos');
const CORE = new Set(['plataforma','premium','parceiros']);
const MS_DAY = 86400000;
const parse = v => v instanceof Date ? v.getTime() : Date.parse(String(v || ''));
const active = (expires,now) => Number.isFinite(parse(expires)) && parse(expires)>now;

async function install(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS billing_manual_service_grants (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    allowed BOOLEAN NOT NULL,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(user_id,service_id)
  );
  CREATE TABLE IF NOT EXISTS billing_legacy_status_audit (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    old_status TEXT NOT NULL,
    migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  -- O checkout antigo marcava 'pagante' para sempre. Registrar e corrigir APENAS
  -- contas que realmente têm assinatura digital, sem tocar nas concessões manuais sem pagamento.
  WITH migrated AS (
    INSERT INTO billing_legacy_status_audit(user_id,old_status)
    SELECT u.id,u.billing_status FROM users u
    WHERE u.billing_status='pagante' AND EXISTS
      (SELECT 1 FROM billing_entitlements e WHERE e.user_id=u.id AND e.plan_code IN ('plataforma','premium','parceiros'))
    ON CONFLICT(user_id) DO NOTHING RETURNING user_id
  )
  UPDATE users SET billing_status=NULL WHERE id IN (SELECT user_id FROM migrated);
  `);
}

function decide(user, entitlements, now=Date.now()) {
  if(user.role==='admin') return { status:'admin',active:true,blocked:false,manual:true,daysRemaining:null,expires_at:null,subscriptions:[] };
  const manual = String(user.billing_status||'').trim().toLowerCase();
  const core = entitlements.filter(e=>CORE.has(e.plan_code));
  const current=core.filter(e=>active(e.expires_at,now)).sort((a,b)=>parse(b.expires_at)-parse(a.expires_at));
  const daysElapsed=Number.isFinite(parse(user.created_at))?Math.max(0,Math.floor((now-parse(user.created_at))/MS_DAY)):30;
  const daysRemaining=Math.max(0,30-daysElapsed);
  let status,source,allowed=false,expires_at=null;
  if(manual==='cancelado'||manual==='inadimplente') {status=manual;source='admin';}
  else if(current.length) {status='pagante';source='pagamento';allowed=true;expires_at=current[0].expires_at;}
  else if(manual==='pagante') {status='pagante';source='liberacao_manual';allowed=true;}
  else if(core.length) {status='inadimplente';source='mensalidade_vencida';expires_at=core.sort((a,b)=>parse(b.expires_at)-parse(a.expires_at))[0].expires_at;}
  else if(daysElapsed<30) {status=daysRemaining<=5?'trial':'free';source='teste_gratuito';allowed=true;expires_at=new Date(parse(user.created_at)+30*MS_DAY).toISOString();}
  else {status='cancelado';source='teste_encerrado';}
  return {status,source,active:allowed,blocked:!allowed,renewal_required:!allowed,manual:source==='admin'||source==='liberacao_manual',billingStatus:user.billing_status||null,daysElapsed,daysRemaining:allowed&&source==='teste_gratuito'?daysRemaining:0,expires_at,subscriptions:entitlements.map(e=>({plan_code:e.plan_code,expires_at:e.expires_at,active:active(e.expires_at,now)})),renewal_url:'/renovar.html'};
}
async function getStatus(pool,user) {
  const r=await pool.query('SELECT plan_code,expires_at FROM billing_entitlements WHERE user_id=$1 ORDER BY expires_at DESC NULLS LAST',[user.id]);
  const result=decide(user,r.rows);
  if(user.role==='admin')return result;
  const purchased=await pool.query(`SELECT DISTINCT plan_code FROM billing_one_time_credits WHERE user_id=$1 AND remaining>0 UNION SELECT DISTINCT plan_code FROM billing_session_credits WHERE user_id=$1 AND remaining>0 AND available_at<=NOW()`,[user.id]);
  result.one_time_products=purchased.rows.map(x=>x.plan_code);
  const schedule=await pool.query('SELECT plan_code,available_at,COUNT(*)::int AS quantity FROM billing_session_credits WHERE user_id=$1 AND remaining=1 GROUP BY plan_code,available_at ORDER BY available_at',[user.id]);result.scheduled_credits=schedule.rows;
  result.core_active=result.active;
  result.core_blocked=!result.core_active;
  const supplementary=r.rows.some(e=>e.plan_code==='mentoria_mensal'&&active(e.expires_at,Date.now()))||purchased.rows.length>0;
  if(supplementary && result.source!=='admin'){
    result.active=true;result.blocked=false;result.renewal_required=result.core_blocked;
    result.extra_services_active=true;
  }
  return result;
}
function grantByPlan(plan_code,slug) { return !!CATALOG[plan_code]?.grants.includes(slug); }
async function serviceAccess(pool,user,slug,access=null) {
  if(user.role==='admin') return {allowed:true,source:'administrador'};
  const s=access||await getStatus(pool,user);
  // Uma conta bloqueada não pode usar ferramentas digitais, nem com permissão antiga persistida.
  if(s.source==='admin' && s.blocked) return {allowed:false,source:'indisponivel'};
  if(['plataforma','planejamento','divisao-casa'].includes(slug) && (s.core_blocked ?? s.blocked)) return {allowed:false,source:'indisponivel'};
  const r=await pool.query(`SELECT s.id,s.default_acquired,us.user_id IS NOT NULL AS legacy_acquired,
    p.allowed AS legacy_override,m.allowed AS manual_override
    FROM services s
    LEFT JOIN user_services us ON us.user_id=$1 AND us.service_id=s.id
    LEFT JOIN product_permissions p ON p.user_id=$1 AND p.service_id=s.id
    LEFT JOIN billing_manual_service_grants m ON m.user_id=$1 AND m.service_id=s.id
    WHERE s.slug=$2 AND s.active=TRUE LIMIT 1`,[user.id,slug]);
  const item=r.rows[0];if(!item)return {allowed:false,source:'indisponivel'};
  if(item.manual_override!==null&&item.manual_override!==undefined) return {allowed:item.manual_override===true,source:'liberacao_manual'};
  if(item.legacy_override===false) return {allowed:false,source:'indisponivel'}; // Negação manual antiga permanece válida.
  const current=s.subscriptions.find(e=>e.active&&grantByPlan(e.plan_code,slug));
  if(current)return {allowed:true,source:'plano',plan_code:current.plan_code,expires_at:current.expires_at};
  if(slug==='consultoria'||slug==='acompanhamento') {
    const purchase=await pool.query(`SELECT 1 FROM billing_one_time_credits WHERE user_id=$1 AND remaining>0
      AND plan_code = ANY($2::text[]) UNION SELECT 1 FROM billing_session_credits WHERE user_id=$1 AND remaining>0 AND available_at<=NOW() AND plan_code=ANY($2::text[]) LIMIT 1`,[user.id,slug==='consultoria'?['consultoria_diagnostica']:['sessao_mentoria']]);
    if(purchase.rowCount)return {allowed:true,source:'credito_avulso'}; // Crédito avulso válido e ainda não utilizado.
    const history=await pool.query(`SELECT 1 FROM billing_orders WHERE user_id=$1 AND status='paid'
      AND plan_code=ANY($2::text[]) UNION SELECT 1 FROM billing_orders WHERE user_id=$1 AND status='paid' AND plan_code='personalizado' AND (custom_config->>($3::text))::integer>0 LIMIT 1`,[user.id,slug==='consultoria'?['consultoria_diagnostica']:['sessao_mentoria'],slug==='consultoria'?'consultations':'mentoring']);
    if(history.rowCount)return {allowed:false,source:'indisponivel'}; // Crédito foi consumido: não usar permissões legadas permanentes.
  }
  // Se um pagamento concedia o produto, um registro antigo de permissões não pode reativá-lo.
  const hadPaid=s.subscriptions.some(e=>grantByPlan(e.plan_code,slug));
  if(hadPaid&&s.source!=='liberacao_manual')return {allowed:false,source:'indisponivel'};
  if(item.legacy_override!==null&&item.legacy_override!==undefined)return {allowed:item.legacy_override===true,source:'liberacao_anterior'};
  return {allowed:item.default_acquired===true||item.legacy_acquired===true,source:s.source==='teste_gratuito'?'teste_gratuito':'liberacao_anterior'};
}
async function hasService(pool,user,slug,access=null){return (await serviceAccess(pool,user,slug,access)).allowed;}
module.exports={CORE,decide,getStatus,hasService,serviceAccess,install,grantByPlan};
