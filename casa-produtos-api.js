'use strict';
function expense(b){
 const total=Math.round(Number(b.amount)*100), payer=b.payer;
 if(!Number.isSafeInteger(total)||total<=0||total>100000000||!['me','other','both'].includes(payer)||typeof b.description!=='string'||!b.description.trim()||b.description.length>160||!/^\d{4}-\d{2}-\d{2}$/.test(b.day)||Number.isNaN(Date.parse(b.day))||new Date(b.day).toISOString().slice(0,10)!==b.day)throw Error('Informe descrição, data, valor e quem pagou.');
 const mine=payer==='me'?total:payer==='other'?0:Math.ceil(total/2);
 return {total,mine,share:Math.ceil(total/2),description:b.description.trim(),day:b.day,payer};
}
async function install(pool){await pool.query(`
 CREATE TABLE IF NOT EXISTS product_permissions(user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,service_id BIGINT REFERENCES services(id) ON DELETE CASCADE,allowed BOOLEAN NOT NULL,PRIMARY KEY(user_id,service_id));
 CREATE TABLE IF NOT EXISTS product_requests(user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,service_id BIGINT REFERENCES services(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(user_id,service_id));
 CREATE TABLE IF NOT EXISTS house_expenses(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,description VARCHAR(160) NOT NULL,day DATE NOT NULL,total_cents INTEGER NOT NULL,mine_cents INTEGER NOT NULL,share_cents INTEGER NOT NULL,payer TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS house_settlements(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,day DATE NOT NULL,delta_cents INTEGER NOT NULL);
 INSERT INTO services(slug,name,description,price,default_acquired) VALUES('divisao-casa','Divisão de despesas da casa','Divida despesas entre duas pessoas e acompanhe os valores a devolver.',0,FALSE) ON CONFLICT(slug) DO NOTHING;
 `);await require('./casa-ledger').install(pool);}
function create({pool,requireUser,requireAdmin,readBody,sendJson,buildHouseMonthlyReport,buildHouseReportPdf,sendPdf}){
 const house=require('./casa-ledger').create({pool,readBody,sendJson,expense});
 async function allowed(id,slug){const r=await pool.query(`SELECT COALESCE(p.allowed,s.default_acquired OR us.user_id IS NOT NULL) AS allowed FROM services s LEFT JOIN product_permissions p ON p.service_id=s.id AND p.user_id=$1 LEFT JOIN user_services us ON us.service_id=s.id AND us.user_id=$1 WHERE s.slug=$2 AND s.active=TRUE`,[id,slug]);return r.rows[0]?.allowed===true;}
 async function handle(req,res,url){
 const own=url==='/api/services'||/^\/api\/services\/\d+\/purchase$/.test(url)||url.startsWith('/api/house')||url.startsWith('/api/admin/products');
 if(!own)return false;
 const admin=url.startsWith('/api/admin/');const u=await(admin?requireAdmin(req,res):requireUser(req,res));if(!u)return;
 const uid=Number(u.id),reply=(data,status=200)=>sendJson(res,status,data);
 if(url==='/api/services'&&req.method==='GET'){const r=await pool.query(`SELECT s.*,COALESCE(p.allowed,s.default_acquired OR us.user_id IS NOT NULL) acquired,r.status request_status FROM services s LEFT JOIN product_permissions p ON p.service_id=s.id AND p.user_id=$1 LEFT JOIN user_services us ON us.service_id=s.id AND us.user_id=$1 LEFT JOIN product_requests r ON r.service_id=s.id AND r.user_id=$1 WHERE s.active=TRUE ORDER BY s.id`,[uid]);return reply({services:r.rows.map(s=>({...s,price:Number(s.price)}))});}
 const purchase=url.match(/^\/api\/services\/(\d+)\/purchase$/);
 if(purchase&&req.method==='POST'){const id=Number(purchase[1]);const s=await pool.query('SELECT slug FROM services WHERE id=$1 AND active=TRUE',[id]);if(!s.rows[0])return reply({error:'Produto não encontrado.'},404);if(await allowed(uid,s.rows[0].slug))return reply({message:'Produto já disponível.'});await pool.query(`INSERT INTO product_requests(user_id,service_id) VALUES($1,$2) ON CONFLICT(user_id,service_id) DO UPDATE SET status='pending',created_at=CASE WHEN product_requests.status='pending' THEN product_requests.created_at ELSE NOW() END`,[uid,id]);return reply({message:'Solicitação enviada. Aguarde aprovação do administrador.'});}
 if(admin){
 if(req.method==='GET'){const [users,services,permissions,requests]=await Promise.all([pool.query("SELECT id,name,email FROM users WHERE role='client' ORDER BY name"),pool.query('SELECT id,name,default_acquired FROM services WHERE active=TRUE ORDER BY id'),pool.query('SELECT * FROM product_permissions'),pool.query(`SELECT r.*,u.name,s.name product FROM product_requests r JOIN users u ON u.id=r.user_id JOIN services s ON s.id=r.service_id WHERE r.status='pending' ORDER BY created_at`)]);const acquired=await pool.query('SELECT user_id,service_id FROM user_services');return reply({users:users.rows,services:services.rows,permissions:permissions.rows,requests:requests.rows,acquired:acquired.rows});}
 if(req.method==='POST'){const b=await readBody(req);if(!['approve','revoke','reject'].includes(b.action)||!Number.isSafeInteger(Number(b.user_id))||!Number.isSafeInteger(Number(b.service_id)))return reply({error:'Ação inválida.'},400);
 const c=await pool.connect();try{await c.query('BEGIN');const target=await c.query("SELECT id FROM users WHERE id=$1 AND role='client'",[b.user_id]);const service=await c.query('SELECT id FROM services WHERE id=$1 AND active=TRUE',[b.service_id]);if(!target.rowCount||!service.rowCount){await c.query('ROLLBACK');return reply({error:'Cliente ou produto não encontrado.'},404);}if(b.action!=='reject')await c.query('INSERT INTO product_permissions(user_id,service_id,allowed) VALUES($1,$2,$3) ON CONFLICT(user_id,service_id) DO UPDATE SET allowed=EXCLUDED.allowed',[b.user_id,b.service_id,b.action==='approve']);await c.query('UPDATE product_requests SET status=$3 WHERE user_id=$1 AND service_id=$2',[b.user_id,b.service_id,b.action==='approve'?'approved':'rejected']);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}return reply({ok:true});}}
 if(url.startsWith('/api/house')){
 if(u.role!=='admin'&&(!await allowed(uid,'plataforma')||!await allowed(uid,'divisao-casa')))return reply({error:'Produto não liberado pelo administrador.'},403);
 if(url==='/api/house/report'&&req.method==='GET'){
   const month=new URL(req.url||'/api/house/report','http://localhost').searchParams.get('month')||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit'}).format(new Date());
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month.slice(0,4)==='0000')return reply({error:'Mês inválido.'},400);
   if(typeof buildHouseMonthlyReport!=='function'||typeof buildHouseReportPdf!=='function'||typeof sendPdf!=='function')return reply({error:'Relatório da casa indisponível.'},500);
   try{const data=await buildHouseMonthlyReport(uid,month,u.name||'Cliente');const pdf=buildHouseReportPdf(data);return sendPdf(res,200,pdf,`Resumo_da_Casa_${month}.pdf`);}catch(error){console.error('Erro ao gerar relatório do resumo da casa:',error);return reply({error:'Não foi possível gerar o relatório do resumo da casa.'},500);}
 }
 return house(req,res,url,uid);}

 return reply({error:'Rota não encontrada.'},404);
 }
 async function gate(req,res,url){let slug;if(url.startsWith('/api/finance/')||url.startsWith('/api/goals'))slug='planejamento';if(url.startsWith('/api/consultations'))slug='consultoria';if(!slug)return true;const u=await requireUser(req,res);if(!u)return false;if(u.role!=='admin'&&(!await allowed(u.id,'plataforma')||!await allowed(u.id,slug))){sendJson(res,403,{error:'Produto não liberado pelo administrador.'});return false;}const linked=url.match(/^\/api\/finance\/entries\/(\d+)/);if(linked&&req.method!=='GET'){const r=await pool.query('SELECT house_expense_id FROM finance_entries WHERE id=$1 AND user_id=$2',[linked[1],u.id]);if(r.rows[0]?.house_expense_id){sendJson(res,409,{error:'Altere ou confirme esta despesa no Resumo de casa.'});return false;}}await require('./casa-ledger').transaction(pool,u.id);return true;}
 return {handle,gate};
}
module.exports={install,create,expense};
