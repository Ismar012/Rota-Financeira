'use strict';
// Shared scope: paid entries follow their effective date, pending entries their due date.
function selection(input) {
  const scope=input.scope, type=input.type||'expense', month=input.month;
  if(!['month','all'].includes(scope)||!['income','expense','all'].includes(type)||
    (scope==='month'&&!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month||'')))
    throw Object.assign(Error('Escolha o tipo e um período válido para excluir.'),{status:400});
  return {scope,type,month};
}
const protectedSql=`f.rest_day_id IS NULL AND f.house_expense_id IS NULL AND NOT EXISTS (SELECT 1 FROM challenge_deposits d WHERE d.entry_id=f.id)`;
function predicate(uid,s){
  const args=[uid];let sql='f.user_id=$1';
  if(s.type!=='all'){args.push(s.type);sql+=` AND f.type=$${args.length}`;}
  if(s.scope==='month'){args.push(s.month);sql+=` AND to_char(CASE WHEN f.paid=1 THEN COALESCE(f.paid_date,(f.paid_at AT TIME ZONE 'America/Bahia')::date,f.due_date) ELSE f.due_date END,'YYYY-MM')=$${args.length}`;}
  return {sql,args};
}
function create({pool,readBody,sendJson,recordClientChange}){
 return async function(req,res,url,parsed,uid){
  if(!((url==='/api/finance/entries-preview'&&req.method==='GET')||(url==='/api/finance/entries'&&req.method==='DELETE')))return false;
  let c;try{
   const input=req.method==='GET'?Object.fromEntries(parsed.searchParams):await readBody(req);const s=selection(input),p=predicate(uid,s);
   c=await pool.connect();await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock($1::bigint)',[uid]);
   const rows=await c.query(`SELECT f.id,f.amount,f.series_id,f.due_date,(${protectedSql}) AS removable FROM finance_entries f WHERE ${p.sql} FOR UPDATE`,p.args);
   const removable=rows.rows.filter(r=>r.removable),total=removable.reduce((n,r)=>n+Math.round(Number(r.amount)*100),0)/100;
   if(req.method==='GET'){await c.query('COMMIT');return sendJson(res,200,{count:removable.length,total,protectedCount:rows.rows.length-removable.length,scope:s.scope,month:s.month,type:s.type});}
   if(!Number.isInteger(input.expectedCount)||input.expectedCount!==removable.length||Number(input.expectedTotal)!==total){await c.query('ROLLBACK');return sendJson(res,409,{error:'Os lançamentos mudaram. Revise o resumo antes de confirmar novamente.'});}
   if(s.scope==='all'&&s.type!=='income')await c.query('UPDATE expense_schedules SET active=FALSE WHERE user_id=$1',[uid]);
   if(s.scope==='month')for(const r of removable.filter(r=>r.series_id))await c.query('INSERT INTO finance_deleted_occurrences(user_id,series_id,due_date) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[uid,r.series_id,r.due_date]);
   const ids=removable.map(r=>r.id);if(ids.length)await c.query('DELETE FROM finance_entries WHERE user_id=$1 AND id=ANY($2::bigint[])',[uid,ids]);
   // Keep an explicit audit history; remove stale daily-goal snapshots for deleted records' months.
   if(ids.length)await c.query(s.scope==='all'?'DELETE FROM goal_snapshots WHERE user_id=$1':"DELETE FROM goal_snapshots WHERE user_id=$1 AND to_char(goal_date,'YYYY-MM')=$2",s.scope==='all'?[uid]:[uid,s.month]);
   await c.query('COMMIT');
   return sendJson(res,200,{deletedCount:ids.length,protectedCount:rows.rows.length-removable.length,total});
  }catch(e){if(c)await c.query('ROLLBACK');return sendJson(res,e.status||500,{error:e.status?e.message:'Não foi possível excluir. Nenhuma alteração foi confirmada.'});}finally{c?.release();}
 };
}
module.exports={selection,predicate,create};
