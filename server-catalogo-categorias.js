'use strict';

// Catálogo global: todos os clientes podem consultar; só o administrador pode criar.
const DEFAULTS = {
  income: ['Salário','Benefício','Diária','Extra','Outros'],
  expense: ['Casa','Veículo','Lazer','Alimentação','Outros','Estudos']
};
const makeKey = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
const cleanName = value => typeof value === 'string' ? value.trim().replace(/\s+/g,' ') : '';
const validName = name => !!name && name.length <= 60 && /^[\p{L}\p{N}][\p{L}\p{N} ()&+.,'/-]*$/u.test(name);

async function install(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS finance_category_catalog (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL CHECK (type IN ('income','expense')),
    name VARCHAR(60) NOT NULL,
    name_key VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(type,name_key)
  )`);
  for (const [type, items] of Object.entries(DEFAULTS)) {
    for (const name of items) {
      await pool.query(`INSERT INTO finance_category_catalog (type,name,name_key)
        VALUES ($1,$2,$3) ON CONFLICT(type,name_key) DO NOTHING`, [type,name,makeKey(name)]);
    }
  }
}
async function resolveName(client, type, name) {
  if (!['income','expense'].includes(type)) return null;
  const key = makeKey(name || 'Outros');
  const result = await client.query('SELECT name FROM finance_category_catalog WHERE type=$1 AND name_key=$2 LIMIT 1', [type,key]);
  return result.rows[0]?.name || null;
}
async function list(pool) {
  const result = await pool.query('SELECT id,type,name FROM finance_category_catalog ORDER BY id ASC');
  return {income:result.rows.filter(row=>row.type==='income').map(row=>row.name),expense:result.rows.filter(row=>row.type==='expense').map(row=>row.name)};
}
function create({pool,requireUser,requireAdmin,readBody,sendJson}) {
  return async (req,res,url) => {
    if (url !== '/api/finance/categories' && url !== '/api/admin/finance-categories') return false;
    const adminRoute = url.startsWith('/api/admin/');
    const user = await (adminRoute ? requireAdmin(req,res) : requireUser(req,res));
    if (!user) return true;
    if (req.method === 'GET') {
      try {return sendJson(res,200,{categories:await list(pool)});}
      catch (error) {console.error('Categorias:',error);return sendJson(res,500,{error:'Não foi possível carregar as categorias.'});}
    }
    if (!adminRoute || req.method !== 'POST') return sendJson(res,405,{error:'Método não permitido.'});
    const body = await readBody(req);
    const type = String(body.type||'').trim();
    const name = cleanName(body.name);
    if (!['income','expense'].includes(type)) return sendJson(res,400,{error:'Selecione Ganho ou Despesa.'});
    if (!validName(name)) return sendJson(res,400,{error:'Nome inválido. Use até 60 caracteres, sem símbolos especiais.'});
    try {
      const found = await pool.query(`INSERT INTO finance_category_catalog(type,name,name_key,created_by)
        VALUES ($1,$2,$3,$4) ON CONFLICT(type,name_key) DO NOTHING RETURNING id,type,name`,[type,name,makeKey(name),user.id]);
      if (!found.rowCount) return sendJson(res,409,{error:'Essa categoria já existe para esse tipo de lançamento.'});
      return sendJson(res,201,{category:found.rows[0],categories:await list(pool)});
    } catch (error) {console.error('Cadastrar categoria:',error);return sendJson(res,500,{error:'Não foi possível adicionar a categoria.'});}
  };
}
const isAllowed = async (pool,type,name) => !!(await resolveName(pool,type,name));
module.exports = {DEFAULTS,makeKey,cleanName,validName,install,isAllowed,resolveName,list,create};
