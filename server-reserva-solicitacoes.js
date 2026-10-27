'use strict';

async function install(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS challenge_access_requests (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected')),
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      decision_note VARCHAR(500)
    );
    CREATE INDEX IF NOT EXISTS challenge_access_requests_pending_idx
      ON challenge_access_requests(status, requested_at DESC);
    CREATE INDEX IF NOT EXISTS challenge_access_requests_user_idx
      ON challenge_access_requests(user_id, requested_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS challenge_access_requests_one_pending
      ON challenge_access_requests(user_id) WHERE status='pending';
  `);
}

function create({ pool, requireUser, requireAdmin, sendJson, readBody, getTodayLocal }) {
  const userRoute = '/api/finance/reserva-liberdade/solicitacao';
  const adminListRoute = '/api/admin/reserva-liberdade/solicitacoes';
  const adminCountRoute = '/api/admin/reserva-liberdade/notificacoes';

  async function handle(req, res, url) {
    const decisionMatch = url.match(/^\/api\/admin\/reserva-liberdade\/solicitacoes\/(\d+)\/decisao$/);
    const isUserRoute = url === userRoute;
    const isAdminList = url === adminListRoute;
    const isAdminCount = url === adminCountRoute;
    if (!decisionMatch && !isUserRoute && !isAdminList && !isAdminCount) return false;

    const adminPath = Boolean(decisionMatch || isAdminList || isAdminCount);
    const actor = await (adminPath ? requireAdmin(req, res) : requireUser(req, res));
    if (!actor) return true;

    try {
      if (isUserRoute && req.method === 'GET') {
        const row = (await pool.query(
          `SELECT id, status, requested_at::text AS requested_at,
                  reviewed_at::text AS reviewed_at
             FROM challenge_access_requests
            WHERE user_id=$1
            ORDER BY requested_at DESC, id DESC
            LIMIT 1`,
          [actor.id]
        )).rows[0] || null;
        return sendJson(res, 200, { request: row, status: row?.status || null });
      }

      if (isUserRoute && req.method === 'POST') {
        if (actor.role !== 'client') return sendJson(res, 403, { error: 'Somente contas de cliente podem solicitar acesso.' });
        const member = (await pool.query(
          'SELECT enabled FROM challenge_members WHERE user_id=$1', [actor.id]
        )).rows[0];
        if (member?.enabled) return sendJson(res, 409, { error: 'A Reserva da Liberdade já está liberada para esta conta.', status: 'approved' });

        const pending = (await pool.query(
          `SELECT id, status, requested_at::text AS requested_at
             FROM challenge_access_requests
            WHERE user_id=$1 AND status='pending'
            ORDER BY requested_at DESC LIMIT 1`,
          [actor.id]
        )).rows[0];
        if (pending) return sendJson(res, 200, { request: pending, status: 'pending', alreadyPending: true });

        try {
          const created = (await pool.query(
            `INSERT INTO challenge_access_requests(user_id,status)
             VALUES($1,'pending')
             RETURNING id,status,requested_at::text AS requested_at`,
            [actor.id]
          )).rows[0];
          return sendJson(res, 201, { request: created, status: 'pending' });
        } catch (error) {
          if (error.code === '23505') {
            const existing = (await pool.query(
              `SELECT id,status,requested_at::text AS requested_at FROM challenge_access_requests
                WHERE user_id=$1 AND status='pending' ORDER BY requested_at DESC LIMIT 1`, [actor.id]
            )).rows[0];
            if (existing) return sendJson(res, 200, { request: existing, status: 'pending', alreadyPending: true });
          }
          throw error;
        }
      }

      if (isAdminCount && req.method === 'GET') {
        const count = (await pool.query(
          `SELECT COUNT(*)::int AS count FROM challenge_access_requests WHERE status='pending'`
        )).rows[0].count;
        return sendJson(res, 200, { count: Number(count) || 0 });
      }

      if (isAdminList && req.method === 'GET') {
        const requests = (await pool.query(
          `SELECT r.id, r.status, r.requested_at::text AS requested_at,
                  u.id AS user_id, u.name, u.email, u.phone
             FROM challenge_access_requests r
             JOIN users u ON u.id=r.user_id
            WHERE r.status='pending'
            ORDER BY r.requested_at ASC, r.id ASC`
        )).rows;
        return sendJson(res, 200, { requests });
      }

      if (decisionMatch && req.method === 'POST') {
        const requestId = Number(decisionMatch[1]);
        if (!Number.isSafeInteger(requestId) || requestId < 1) return sendJson(res, 400, { error: 'Solicitação inválida.' });
        const body = await readBody(req);
        const decision = String(body.decision || '');
        if (!['approved', 'rejected'].includes(decision)) return sendJson(res, 400, { error: 'Escolha liberar ou não liberar o acesso.' });

        const client = await pool.connect();
        let decisionUserId = null;
        try {
          await client.query('BEGIN');
          const request = (await client.query(
            `SELECT r.id,r.user_id,r.status,u.name,u.email
               FROM challenge_access_requests r
               JOIN users u ON u.id=r.user_id
              WHERE r.id=$1
              FOR UPDATE OF r`, [requestId]
          )).rows[0];
          if (!request) {
            await client.query('ROLLBACK');
            return sendJson(res, 404, { error: 'Solicitação não encontrada.' });
          }
          if (request.status !== 'pending') {
            await client.query('ROLLBACK');
            return sendJson(res, 409, { error: 'Esta solicitação já foi analisada.' });
          }

          if (decision === 'approved') {
            const today = getTodayLocal();
            await client.query(
              `INSERT INTO challenge_members(user_id,start_date,target,enabled,accepted,timezone,state)
               VALUES($1,$2,50,TRUE,FALSE,'America/Bahia','active')
               ON CONFLICT(user_id) DO UPDATE SET
                 enabled=TRUE,
                 target=GREATEST(challenge_members.target,50),
                 timezone=COALESCE(NULLIF(challenge_members.timezone,''),'America/Bahia'),
                 state=CASE WHEN challenge_members.state='closed' THEN 'active' ELSE challenge_members.state END,
                 closed_at=CASE WHEN challenge_members.state='closed' THEN NULL ELSE challenge_members.closed_at END`,
              [request.user_id, today]
            );
          }

          await client.query(
            `UPDATE challenge_access_requests
                SET status=$2, reviewed_at=NOW(), reviewed_by=$3
              WHERE id=$1`,
            [requestId, decision, actor.id]
          );
          await client.query(
            `INSERT INTO challenge_events(user_id,actor_id,action,payload)
             VALUES($1,$2,$3,$4::jsonb)`,
            [request.user_id, actor.id,
             decision === 'approved' ? 'access_request_approved' : 'access_request_rejected',
             JSON.stringify({ request_id: requestId, decision, administrator: actor.email })]
          );
          decisionUserId = request.user_id;
          await client.query('COMMIT');
          return sendJson(res, 200, {
            status: decision,
            message: decision === 'approved'
              ? `A Reserva da Liberdade foi liberada para ${request.name}.`
              : `A solicitação de ${request.name} não foi liberada.`,
            user: { id: request.user_id, name: request.name, email: request.email }
          });
        } catch (error) {
          try { await client.query('ROLLBACK'); } catch {}
          throw error;
        } finally {
          client.release();
        }
      }

      if ((isUserRoute || isAdminList || isAdminCount || decisionMatch) && req.method !== 'GET' && req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Método não permitido.' });
      }
      return false;
    } catch (error) {
      console.error('Solicitações Reserva da Liberdade:', error);
      return sendJson(res, 500, { error: 'Não foi possível processar a solicitação da Reserva da Liberdade.' });
    }
  }

  return { handle };
}

module.exports = { install, create };
