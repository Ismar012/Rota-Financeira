const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);

const DEFAULT_SESSION_SECRET =
  'TROQUE-ESTE-SEGREDO-ANTES-DE-PUBLICAR';

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  DEFAULT_SESSION_SECRET;

const IS_PRODUCTION =
  process.env.NODE_ENV === 'production';


const PUBLIC_ROOT =
  path.resolve(process.env.PUBLIC_DIR || ROOT);

const COOKIE_NAME = 'rota_session';
const SESSION_DAYS = 7;

// E-mail autorizado a acessar a área administrativa.
// Defina ADMIN_EMAIL no ambiente de produção.
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();

/* =========================================================
   SEGURANÇA
========================================================= */

if (IS_PRODUCTION) {
  if (
    !SESSION_SECRET ||
    SESSION_SECRET === DEFAULT_SESSION_SECRET ||
    SESSION_SECRET.length < 32
  ) {
    console.error(
      'SESSION_SECRET inválido. Use um segredo aleatório com pelo menos 32 caracteres.'
    );
    process.exit(1);
  }

  if (!ADMIN_EMAIL || !/^\S+@\S+\.\S+$/.test(ADMIN_EMAIL)) {
    console.error(
      'ADMIN_EMAIL deve estar definido e ser um e-mail válido em produção.'
    );
    process.exit(1);
  }
}

/* =========================================================
   BANCO DE DADOS - POSTGRESQL / RENDER
========================================================= */

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.EXTERNAL_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  '';

if (!DATABASE_URL) {
  console.error('DATABASE_URL não foi definida.');
  process.exit(1);
}

const { Pool, types } = require('pg');

// Mantém DATE/TIMESTAMPTZ como texto ISO para preservar o comportamento do SQLite.
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1114, (value) => value);
types.setTypeParser(1184, (value) => value);

const pool = new Pool({
  connectionString: DATABASE_URL,
  // O banco do Render aceita conexões externas via SSL.
  // O teste direto com pg confirmou que rejectUnauthorized:false
  // é necessário também quando rodamos o servidor localmente.
  ssl: { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

function pgPlaceholders(sql) {
  let index = 0;
  return String(sql).replace(/\?/g, () => `$${++index}`);
}

/*
  Adaptador compatível com a API que o servidor antigo usava:
  prepare().get(), prepare().all() e prepare().run().

  PostgreSQL é assíncrono, por isso todas as chamadas ao banco
  no servidor convertido usam await.
*/
const db = {
  prepare(sql) {
    const baseSql = pgPlaceholders(sql);

    return {
      async get(...params) {
        let query = baseSql;

        if (
          /^\s*INSERT\b/i.test(query) &&
          !/\bRETURNING\b/i.test(query)
        ) {
          query += ' RETURNING id';
        }

        const result = await pool.query(query, params);
        return result.rows[0] || undefined;
      },

      async all(...params) {
        const result = await pool.query(baseSql, params);
        return result.rows;
      },

      async run(...params) {
        let query = baseSql;

        if (
          /^\s*INSERT\b/i.test(query) &&
          !/\bRETURNING\b/i.test(query)
        ) {
          query += ' RETURNING id';
        }

        const result = await pool.query(query, params);

        return {
          changes: result.rowCount,
          lastInsertRowid:
            result.rows[0]?.id ?? null
        };
      }
    };
  },

  async exec(sql) {
    const normalized = String(sql).trim().toUpperCase();

    // O servidor legado usava BEGIN/COMMIT/ROLLBACK do SQLite.
    // As consultas PostgreSQL usam pool; estes comandos isolados não
    // podem representar uma transação entre conexões diferentes.
    // Nos blocos de negócio, mantemos a sequência das operações.
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) {
      return { rows: [], rowCount: 0 };
    }

    return pool.query(sql);
  }
};

async function initializeDatabase() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(160) NOT NULL UNIQUE,
      phone VARCHAR(30),
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'client',
      billing_status VARCHAR(30),
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS services (
      id BIGSERIAL PRIMARY KEY,
      slug VARCHAR(80) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      description TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL DEFAULT 0,
      default_acquired BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_services (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      acquired_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, service_id)
    );

    CREATE TABLE IF NOT EXISTS client_change_log (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(80) NOT NULL,
      field_name VARCHAR(80),
      old_value TEXT,
      new_value TEXT,
      details TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS finance_entries (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL CHECK(type IN ('income', 'expense')),
      name VARCHAR(255) NOT NULL,
      amount NUMERIC(14,2) NOT NULL CHECK(amount > 0),
      created_date DATE NOT NULL,
      due_date DATE NOT NULL,
      paid SMALLINT NOT NULL DEFAULT 0 CHECK(paid IN (0,1)),
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      rest_day_id BIGINT,
      recurrence_type VARCHAR(30) NOT NULL DEFAULT 'single',
      series_id VARCHAR(100),
      installment_number INTEGER,
      installment_total INTEGER,
      recurrence_day INTEGER,
      recurrence_active SMALLINT NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS rest_days (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rest_date DATE NOT NULL,
      amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, rest_date)
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'client';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_status VARCHAR(30);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

    ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS paid SMALLINT NOT NULL DEFAULT 0;
    ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
    ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS paid_date DATE;
    ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS rest_day_id BIGINT;
    ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(30) NOT NULL DEFAULT 'single';
    ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS series_id VARCHAR(100);
    ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS installment_number INTEGER;
    ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS installment_total INTEGER;
    ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS recurrence_day INTEGER;
    ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS recurrence_active SMALLINT NOT NULL DEFAULT 1;

    ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS request_id VARCHAR(100);
    
    CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_entries_request_id
    ON finance_entries(user_id, request_id)
    WHERE request_id IS NOT NULL;
    
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_finance_entries_user ON finance_entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_finance_entries_due_date ON finance_entries(due_date);
    CREATE INDEX IF NOT EXISTS idx_finance_entries_paid ON finance_entries(paid);
    CREATE INDEX IF NOT EXISTS idx_finance_entries_rest_day ON finance_entries(rest_day_id);
    CREATE INDEX IF NOT EXISTS idx_finance_entries_series ON finance_entries(series_id);
    CREATE INDEX IF NOT EXISTS idx_finance_entries_recurrence ON finance_entries(recurrence_type);
    CREATE INDEX IF NOT EXISTS idx_rest_days_user ON rest_days(user_id);
    CREATE INDEX IF NOT EXISTS idx_rest_days_date ON rest_days(rest_date);
    CREATE INDEX IF NOT EXISTS idx_client_change_log_user ON client_change_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_client_change_log_created ON client_change_log(created_at);
  `);

  await db.prepare(`
    UPDATE finance_entries
    SET paid = 0
    WHERE paid IS NULL
  `).run();

  if (ADMIN_EMAIL) {
    await db.prepare(
      "UPDATE users SET role = CASE WHEN lower(email) = ? THEN 'admin' ELSE 'client' END"
    ).run(ADMIN_EMAIL);
  }

  await db.prepare(
    'DELETE FROM sessions WHERE expires_at <= ?'
  ).run(Date.now());

  const serviceCatalog = [
    ['acompanhamento', 'Acompanhamento financeiro', 'Acompanhamento contínuo da organização financeira do cliente, com leitura da evolução, metas, fluxo de caixa, despesas, ganhos, dias disponíveis para trabalho e ajustes de rota ao longo do período.', 0, false],
    ['consultoria', 'Consultoria financeira', 'Atendimento individual para diagnóstico da situação financeira, identificação dos principais pontos de atenção, definição de prioridades e orientação prática para tomada de decisão e reorganização financeira.', 0, false],
    ['planejamento', 'Planejamento financeiro', 'Estruturação do planejamento com ganhos, despesas, compromissos futuros, dias de descanso, metas diárias e projeção do fluxo de caixa para apoiar o cliente na execução do mês.', 0, true],
    ['plataforma', 'Uso da plataforma Rota Financeira', 'Acesso ao ambiente digital da Rota Financeira para registrar movimentações, acompanhar metas, visualizar projeções, organizar despesas e ganhos e consultar a evolução do planejamento financeiro.', 0, true]
  ];

  for (const item of serviceCatalog) {
    await pool.query(`
      INSERT INTO services (slug, name, description, price, default_acquired, active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        default_acquired = EXCLUDED.default_acquired,
        active = TRUE
    `, item);
  }
}

/* =========================================================
   RESPOSTAS
========================================================= */

function sendJson(
  res,
  status,
  data,
  extraHeaders = {}
) {
  const body = JSON.stringify(data);

  res.writeHead(status, {
    'Content-Type':
      'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...extraHeaders
  });

  res.end(body);
}


function pdfSafe(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function pdfAscii(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\xFF]/g, '?');
}

function pdfWrap(value, max = 92) {
  const text = pdfAscii(value);
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word.length > max ? word.slice(0, max) : word;
      if (word.length > max) {
        let rest = word.slice(max);
        while (rest.length > max) {
          lines.push(rest.slice(0, max));
          rest = rest.slice(max);
        }
        line = rest;
      }
      continue;
    }
    if ((line + ' ' + word).length <= max) line += ' ' + word;
    else { lines.push(line); line = word.length > max ? word.slice(0, max) : word; }
  }
  if (line) lines.push(line);
  return lines;
}

function pdfMoney(value) {
  const n = safeNumber(value);
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

function pdfDate(value) {
  if (!value) return '—';
  const raw = String(value).slice(0, 10);
  const parts = raw.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : raw;
}

function pdfMonth(value) {
  const [y, m] = String(value).split('-').map(Number);
  if (!y || !m) return value;
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

function pdfFileName(name, month) {
  const clean = String(name || 'Cliente')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Cliente';
  return `Relatorio_${clean}_${month}.pdf`;
}

function buildClientReportPdf(report) {
  const { client, period, totals, summary, monthly } = report;
  const pages = [];

  const esc = (value) => pdfSafe(pdfAscii(value));
  const money = (value) => pdfMoney(value);
  const statusMap = { free: 'Free', trial: 'Trial', pagante: 'Pagante', inadimplente: 'Inadimplente', cancelado: 'Cancelado', admin: 'Administrador' };
  const status = statusMap[publicClientStatus(client).status] || publicClientStatus(client).status;

  function newPage() {
    const commands = [];
    pages.push(commands);
    return commands;
  }

  function rect(c, x, y, w, h, r, g, b, fill = true) {
    c.push(`${r} ${g} ${b} rg`);
    c.push(`${x} ${y} ${w} ${h} re`);
    c.push(fill ? 'f' : 'S');
  }

  function line(c, x1, y1, x2, y2, r = 0.82, g = 0.84, b = 0.88) {
    c.push(`${r} ${g} ${b} RG`);
    c.push('0.7 w');
    c.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  }

  function text(c, x, y, value, size = 9, bold = false, r = 0.16, g = 0.18, b = 0.22) {
    c.push(`${r} ${g} ${b} rg`);
    c.push(`BT /F${bold ? 2 : 1} ${size} Tf ${x} ${y} Td (${esc(value)}) Tj ET`);
  }

  function header(c, pageNumber) {
    rect(c, 0, 790, 595, 52, 0.07, 0.10, 0.15);
    text(c, 38, 815, 'ROTA FINANCEIRA', 15, true, 1, 1, 1);
    text(c, 38, 798, 'RELATORIO FINANCEIRO DO CLIENTE', 8, false, 0.75, 0.80, 0.86);
    text(c, 520, 814, String(pageNumber).padStart(2, '0'), 9, true, 0.85, 0.88, 0.92);
  }

  function footer(c) {
    line(c, 38, 32, 557, 32, 0.85, 0.86, 0.89);
    text(c, 38, 19, 'Documento gerencial · ROTA FINANCEIRA', 7, false, 0.45, 0.48, 0.53);
    text(c, 405, 19, `Gerado em ${new Date(report.generated_at || Date.now()).toLocaleDateString('pt-BR')}`, 7, false, 0.45, 0.48, 0.53);
  }

  function dashboardCard(c, x, y, w, label, value) {
    rect(c, x, y, w, 52, 0.96, 0.97, 0.98);
    text(c, x + 9, y + 34, label, 7.2, false, 0.40, 0.43, 0.48);
    text(c, x + 9, y + 15, value, 10, true, 0.10, 0.14, 0.20);
  }

  // Página 1 — somente os indicadores solicitados do dashboard.
  let c = newPage();
  header(c, 1);
  text(c, 38, 758, client.name || 'Cliente', 20, true);
  text(c, 38, 742, client.email || '—', 9, false, 0.40, 0.43, 0.48);
  text(c, 38, 728, `Periodo analisado: ${pdfMonth(summary?.month || period.endMonth)}`, 8.5, false, 0.40, 0.43, 0.48);
  text(c, 435, 742, `Status: ${status}`, 8.5, true, 0.20, 0.40, 0.55);

  text(c, 38, 700, 'RESUMO DO DASHBOARD', 10, true);
  line(c, 38, 690, 557, 690, 0.80, 0.82, 0.86);

  const cardItems = [
    ['Ganhos do mes', money(totals.income)],
    ['Gastos liquidos do mes', money(totals.expense)],
    ['Fluxo de caixa', money(totals.cashflow)],
    ['Meta total prevista', money(totals.totalPlannedGoal)],
    ['Dias de trabalho', String(totals.workingDays)],
    ['Dias de descanso', String(totals.restDays)],
    ['Dias disponiveis', String(totals.availableWorkingDays)],
    ['Gastos pendentes', money(totals.pendingExpense)]
  ];

  cardItems.forEach((item, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    dashboardCard(c, 38 + col * 130, 610 - row * 70, 118, item[0], item[1]);
  });

  text(c, 38, 445, 'PLANEJAMENTO MENSAL', 10, true);
  line(c, 38, 435, 557, 435, 0.80, 0.82, 0.86);
  text(c, 38, 418, `Mes: ${pdfMonth(summary?.month || period.endMonth)}`, 8.5, true);
  text(c, 38, 402, 'O detalhamento abaixo mostra o fluxo diario previsto e realizado do mes selecionado.', 8, false, 0.42, 0.45, 0.50);
  footer(c);

  // Páginas 2+ — planejamento mensal / fluxo de caixa diário.
  const dailyRows = Array.isArray(summary?.data) ? summary.data : [];
  let index = 0;
  while (index < dailyRows.length) {
    c = newPage();
    header(c, pages.length);
    text(c, 38, 758, 'PLANEJAMENTO MENSAL · FLUXO DE CAIXA', 13, true);
    text(c, 38, 742, pdfMonth(summary?.month || period.endMonth), 8.5, false, 0.42, 0.45, 0.50);

    rect(c, 38, 708, 519, 22, 0.09, 0.12, 0.18);
    text(c, 46, 716, 'DATA', 7, true, 1, 1, 1);
    text(c, 92, 716, 'STATUS', 7, true, 1, 1, 1);
    text(c, 166, 716, 'META', 7, true, 1, 1, 1);
    text(c, 246, 716, 'GANHO PREV.', 7, true, 1, 1, 1);
    text(c, 334, 716, 'DESP. PREV.', 7, true, 1, 1, 1);
    text(c, 422, 716, 'REALIZADO', 7, true, 1, 1, 1);
    text(c, 500, 716, 'FLUXO', 7, true, 1, 1, 1);

    let y = 688;
    let count = 0;
    while (index < dailyRows.length && count < 25) {
      const d = dailyRows[index++];
      const statusText = d.isRestDay ? 'Descanso' : (d.isWeekend ? 'Disponivel' : 'Trabalho');
      const realized = safeNumber(d.paidIncome) - safeNumber(d.paidExpense);
      text(c, 46, y, pdfDate(d.date), 7.5, false);
      text(c, 92, y, statusText, 7.2, false);
      text(c, 166, y, money(d.dailyGoal), 7.2, false);
      text(c, 246, y, money(d.futureIncome), 7.2, false);
      text(c, 334, y, money(d.futureExpense), 7.2, false);
      text(c, 422, y, money(realized), 7.2, false);
      text(c, 500, y, money(safeNumber(d.cashflow) + safeNumber(d.realizedCashflow)), 7.2, true);
      line(c, 42, y - 8, 553, y - 8, 0.92, 0.93, 0.95);
      y -= 25;
      count++;
    }
    footer(c);
  }

  // Páginas finais — fechamento mensal resumido.
  c = newPage();
  header(c, pages.length);
  text(c, 38, 758, 'FECHAMENTO MENSAL', 14, true);
  text(c, 38, 742, 'Resumo por mes, sem os ganhos totais e gastos totais do cadastro.', 8.5, false, 0.42, 0.45, 0.50);

  rect(c, 38, 708, 519, 22, 0.09, 0.12, 0.18);
  text(c, 46, 716, 'MES', 7.2, true, 1, 1, 1);
  text(c, 160, 716, 'GANHOS', 7.2, true, 1, 1, 1);
  text(c, 260, 716, 'GASTOS', 7.2, true, 1, 1, 1);
  text(c, 360, 716, 'FLUXO DE CAIXA', 7.2, true, 1, 1, 1);
  text(c, 468, 716, 'DIAS', 7.2, true, 1, 1, 1);

  let y = 688;
  let rowCount = 0;
  for (const item of monthly || []) {
    if (rowCount > 24) {
      c = newPage();
      header(c, pages.length);
      text(c, 38, 758, 'FECHAMENTO MENSAL · CONTINUACAO', 14, true);
      rect(c, 38, 708, 519, 22, 0.09, 0.12, 0.18);
      text(c, 46, 716, 'MES', 7.2, true, 1, 1, 1);
      text(c, 160, 716, 'GANHOS', 7.2, true, 1, 1, 1);
      text(c, 260, 716, 'GASTOS', 7.2, true, 1, 1, 1);
      text(c, 360, 716, 'FLUXO DE CAIXA', 7.2, true, 1, 1, 1);
      text(c, 468, 716, 'DIAS', 7.2, true, 1, 1, 1);
      y = 688;
      rowCount = 0;
    }

    const daysInMonth = new Date(Number(item.month.slice(0, 4)), Number(item.month.slice(5, 7)), 0).getDate();
    const workingDays = Math.max(0, daysInMonth - Number(item.restDays || 0));
    text(c, 46, y, pdfMonth(item.month), 7.5, false);
    text(c, 160, y, money(item.income), 7.5, false);
    text(c, 260, y, money(item.expense), 7.5, false);
    text(c, 360, y, money(item.cashflow), 7.5, true);
    text(c, 468, y, `${workingDays}/${Number(item.restDays || 0)}`, 7.5, false);
    line(c, 42, y - 8, 553, y - 8, 0.92, 0.93, 0.95);
    y -= 25;
    rowCount++;
  }

  if (!(monthly || []).length) {
    text(c, 46, y, 'Nenhum fechamento mensal disponivel.', 8.5, false, 0.45, 0.48, 0.53);
  }

  text(c, 38, Math.max(70, y - 18), 'Legenda: Dias = dias de trabalho / dias de descanso registrados no mes.', 7.5, false, 0.45, 0.48, 0.53);
  footer(c);

  const objects = [];
  const addObject = (buffer) => { objects.push(buffer); return objects.length; };
  const catalog = addObject(Buffer.alloc(0));
  const pagesObj = addObject(Buffer.alloc(0));
  const fontRegular = addObject(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'latin1'));
  const fontBold = addObject(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>', 'latin1'));
  const pageRefs = [];

  for (const commands of pages) {
    const content = Buffer.from(commands.join('\n') + '\n', 'latin1');
    const contentObj = addObject(Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'));
    objects[contentObj - 1] = Buffer.concat([objects[contentObj - 1], content, Buffer.from('endstream', 'latin1')]);
    const pageObj = addObject(Buffer.from(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentObj} 0 R >>`, 'latin1'));
    pageRefs.push(pageObj);
  }

  objects[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`, 'latin1');
  objects[pagesObj - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`, 'latin1');

  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets = [0];
  let offset = chunks[0].length;
  objects.forEach((obj, index) => {
    offsets.push(offset);
    const header = Buffer.from(`${index + 1} 0 obj\n`, 'latin1');
    const footer = Buffer.from('\nendobj\n', 'latin1');
    chunks.push(header, obj, footer);
    offset += header.length + obj.length + footer.length;
  });
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

function sendPdf(res, status, buffer, filename) {
  res.writeHead(status, {
    'Content-Type': 'application/pdf',
    'Content-Length': buffer.length,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store'
  });
  res.end(buffer);
}

/* =========================================================
   COOKIES
========================================================= */

function parseCookies(req) {
  const raw = req.headers.cookie || '';

  return Object.fromEntries(
    raw
      .split(';')
      .filter(Boolean)
      .map((part) => {
        const i = part.indexOf('=');

        if (i === -1) {
          return [part.trim(), ''];
        }

        return [
          part.slice(0, i).trim(),
          decodeURIComponent(
            part.slice(i + 1).trim()
          )
        ];
      })
  );
}

function cookieHeader(
  value,
  maxAge
) {
  const secure = IS_PRODUCTION
    ? '; Secure'
    : '';

  return `${COOKIE_NAME}=${encodeURIComponent(
    value
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/* =========================================================
   CRIPTOGRAFIA
========================================================= */

function hashToken(token) {
  return crypto
    .createHmac(
      'sha256',
      SESSION_SECRET
    )
    .update(token)
    .digest('hex');
}

function passwordHash(password) {
  const salt = crypto
    .randomBytes(16)
    .toString('hex');

  const derived = crypto.scryptSync(
    password,
    salt,
    64,
    {
      N: 16384,
      r: 8,
      p: 1
    }
  );

  return `scrypt$${salt}$${derived.toString(
    'hex'
  )}`;
}

function passwordVerify(
  password,
  stored
) {
  const [
    algorithm,
    salt,
    hex
  ] = stored.split('$');

  if (
    algorithm !== 'scrypt' ||
    !salt ||
    !hex
  ) {
    return false;
  }

  const derived = crypto.scryptSync(
    password,
    salt,
    64,
    {
      N: 16384,
      r: 8,
      p: 1
    }
  );

  const expected = Buffer.from(
    hex,
    'hex'
  );

  return (
    expected.length ===
      derived.length &&
    crypto.timingSafeEqual(
      expected,
      derived
    )
  );
}

/* =========================================================
   BODY
========================================================= */

function readBody(req) {
  return new Promise(
    (resolve, reject) => {
      let data = '';
      let size = 0;
      let rejected = false;

      req.on(
        'data',
        (chunk) => {
          if (rejected) {
            return;
          }

          size += chunk.length;

          if (
            size >
            1024 * 1024
          ) {
            rejected = true;

            reject(
              new Error(
                'Payload muito grande.'
              )
            );

            req.destroy();
            return;
          }

          data += chunk;
        }
      );

      req.on(
        'end',
        () => {
          if (rejected) {
            return;
          }

          try {
            resolve(
              JSON.parse(
                data || '{}'
              )
            );
          } catch {
            reject(
              new Error(
                'JSON inválido.'
              )
            );
          }
        }
      );

      req.on(
        'error',
        reject
      );
    }
  );
}

/* =========================================================
   UTILITÁRIOS
========================================================= */

function clean(
  value,
  max
) {
  return String(
    value ?? ''
  )
    .trim()
    .slice(0, max);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(value || '')
  );
}

function validMonth(value) {
  return /^\d{4}-\d{2}$/.test(
    String(value || '')
  );
}

function normalizeAmount(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  if (
    typeof value === 'number'
  ) {
    if (
      Number.isFinite(value) &&
      value > 0
    ) {
      return value;
    }

    return null;
  }

  let text = String(value)
    .trim()
    .replace(/R\$/gi, '')
    .replace(/\s/g, '');

  if (!text) {
    return null;
  }

  if (
    text.includes(',') &&
    text.includes('.')
  ) {
    text = text
      .replace(/\./g, '')
      .replace(',', '.');
  } else if (
    text.includes(',')
  ) {
    text = text.replace(
      ',',
      '.'
    );
  }

  const amount = Number(text);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  return amount;
}

function safeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

/* =========================================================
   DATAS
========================================================= */

function parseDate(value) {
  if (!validDate(value)) {
    return null;
  }

  const [
    year,
    month,
    day
  ] = String(value)
    .split('-')
    .map(Number);

  const date = new Date(
    year,
    month - 1,
    day
  );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateLocal(date) {
  const year =
    date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0');

  const day = String(
    date.getDate()
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getTodayLocal() {
  return formatDateLocal(
    new Date()
  );
}

function addDays(
  dateString,
  days
) {
  const date =
    parseDate(dateString);

  if (!date) {
    return null;
  }

  date.setDate(
    date.getDate() + days
  );

  return formatDateLocal(
    date
  );
}

function addMonthsSameDay(
  dateString,
  months,
  preferredDay = null
) {
  const base = parseDate(dateString);
  if (!base) return null;

  const day = Number(preferredDay) || base.getDate();
  const target = new Date(
    base.getFullYear(),
    base.getMonth() + months,
    1
  );

  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();

  target.setDate(Math.min(day, lastDay));
  return formatDateLocal(target);
}

function compareDates(
  a,
  b
) {
  return String(a).localeCompare(
    String(b)
  );
}

function daysBetween(
  startDate,
  endDate
) {
  const start =
    parseDate(startDate);

  const end =
    parseDate(endDate);

  if (
    !start ||
    !end
  ) {
    return 0;
  }

  const milliseconds =
    end.getTime() -
    start.getTime();

  return Math.round(
    milliseconds /
      (24 * 60 * 60 * 1000)
  );
}

/* =========================================================
   STATUS DE ASSINATURA / ACESSO
========================================================= */

function daysSinceCreated(createdAt) {
  const created = new Date(String(createdAt || '').replace(' ', 'T') + 'Z');
  if (!Number.isFinite(created.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / (24 * 60 * 60 * 1000)));
}

function calculateClientStatus(client) {
  const manual = String(client.billing_status || '').trim().toLowerCase();
  if (manual === 'pagante') return { status: 'pagante', manual: true, daysElapsed: daysSinceCreated(client.created_at), daysRemaining: 0 };
  if (manual === 'inadimplente') return { status: 'inadimplente', manual: true, daysElapsed: daysSinceCreated(client.created_at), daysRemaining: 0 };

  const daysElapsed = daysSinceCreated(client.created_at);
  const daysRemaining = Math.max(0, 30 - daysElapsed);
  if (daysElapsed >= 30) return { status: 'cancelado', manual: false, daysElapsed, daysRemaining: 0 };
  if (daysElapsed >= 25) return { status: 'trial', manual: false, daysElapsed, daysRemaining };
  return { status: 'free', manual: false, daysElapsed, daysRemaining };
}

function isClientCancelled(client) {
  return String(client.billing_status || '').trim().toLowerCase() === 'cancelado';
}

function publicClientStatus(client) {
  const info = calculateClientStatus(client);
  return {
    status: info.status,
    manual: info.manual,
    daysElapsed: info.daysElapsed,
    daysRemaining: info.daysRemaining,
    billingStatus: client.billing_status || null
  };
}

/* =========================================================
   USUÁRIO LOGADO
========================================================= */

async function getCurrentUser(req) {
  const token =
    parseCookies(req)[
      COOKIE_NAME
    ];

  if (!token) {
    return null;
  }

  const row = await db
    .prepare(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.role,
        u.billing_status,
        u.last_login_at,
        u.created_at,
        s.expires_at

      FROM sessions s

      JOIN users u
        ON u.id = s.user_id

      WHERE
        s.token_hash = ?
        AND s.expires_at > ?
    `)
    .get(
      hashToken(token),
      Date.now()
    );

  if (!row) {
    return null;
  }

  /*
    Se o e-mail atual for o ADMIN_EMAIL, garanta também no banco
    que essa conta tenha role=admin. Isso cobre inclusive o caso
    em que a conta foi criada depois que ADMIN_EMAIL foi configurado.
  */
  if (
    ADMIN_EMAIL &&
    String(row.email || '').trim().toLowerCase() === ADMIN_EMAIL &&
    row.role !== 'admin'
  ) {
    await db.prepare(
      "UPDATE users SET role = 'admin' WHERE id = ?"
    ).run(row.id);
    row.role = 'admin';
  }

  return row;
}

async function requireUser(
      req,
      res
    ) {
  const user =
    await getCurrentUser(req);

  if (!user) {
    sendJson(
      res,
      401,
      {
        authenticated: false,
        error:
          'Sessão expirada.'
      }
    );

    return null;
  }

  if (user.role === 'client' && isClientCancelled(user)) {
    const token = parseCookies(req)[COOKIE_NAME];
    if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    sendJson(res, 403, {
      authenticated: false,
      cancelled: true,
      error: 'Seu período de acesso gratuito terminou. Atualize seu pagamento para continuar utilizando a plataforma.'
    }, { 'Set-Cookie': cookieHeader('', 0) });
    return null;
  }

  return user;
}

async function requireAdmin(
  req,
  res
) {
  const user = await getCurrentUser(req);

  if (!user) {
    sendJson(res, 401, {
      authenticated: false,
      error: 'Sessão expirada.'
    });
    return null;
  }

  if (user.role !== 'admin') {
    sendJson(res, 403, {
      error: 'Acesso restrito ao administrador.'
    });
    return null;
  }

  return user;
}

/* =========================================================
   LIMITADOR
========================================================= */

const attempts = new Map();

function tooManyAttempts(req) {
  const ip =
    req.socket.remoteAddress ||
    'unknown';

  const now = Date.now();

  const item =
    attempts.get(ip) || {
      count: 0,
      reset:
        now +
        15 * 60 * 1000
    };

  if (
    now > item.reset
  ) {
    item.count = 0;

    item.reset =
      now +
      15 * 60 * 1000;
  }

  item.count++;

  attempts.set(
    ip,
    item
  );

  return item.count > 25;
}

/* =========================================================
   AUTENTICAÇÃO
========================================================= */

async function handleAuthApi(
  req,
  res,
  url
) {
  /* =======================================================
     CADASTRO
  ======================================================= */

  if (
    req.method === 'POST' &&
    url === '/api/auth/register'
  ) {
    if (tooManyAttempts(req)) {
      return sendJson(
        res,
        429,
        {
          error:
            'Muitas tentativas. Aguarde alguns minutos.'
        }
      );
    }

    try {
      const body =
        await readBody(req);

      const name =
        clean(
          body.name,
          100
        );

      const email =
        clean(
          body.email,
          160
        ).toLowerCase();

      const phone =
        clean(
          body.phone,
          30
        );

      const password =
        String(
          body.password || ''
        );

      if (
        name.length < 2
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Informe seu nome completo.'
          }
        );
      }

      if (
        !validEmail(email)
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Informe um e-mail válido.'
          }
        );
      }

      if (
        password.length < 8
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'A senha deve ter pelo menos 8 caracteres.'
          }
        );
      }

      if (
        password.length > 128
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'A senha é muito longa.'
          }
        );
      }

      const exists =
        await db
          .prepare(
            'SELECT id FROM users WHERE email = ?'
          )
          .get(email);

      if (exists) {
        return sendJson(
          res,
          409,
          {
            error:
              'Este e-mail já possui cadastro. Faça login.'
          }
        );
      }

      const result =
        await db
          .prepare(`
            INSERT INTO users
            (
              name,
              email,
              phone,
              password_hash
            )
            VALUES (?, ?, ?, ?)
          `)
          .run(
            name,
            email,
            phone,
            passwordHash(
              password
            )
          );

      const token =
        crypto
          .randomBytes(32)
          .toString(
            'base64url'
          );

      const expires =
        Date.now() +
        SESSION_DAYS *
          24 *
          60 *
          60 *
          1000;

      await db.prepare(`
        INSERT INTO sessions
        (
          user_id,
          token_hash,
          expires_at
        )
        VALUES (?, ?, ?)
      `).run(
        Number(
          result.lastInsertRowid
        ),
        hashToken(token),
        expires
      );

      return sendJson(
        res,
        201,
        {
          message:
            'Cadastro realizado com sucesso.',

          user: {
            name,
            email
          }
        },
        {
          'Set-Cookie':
            cookieHeader(
              token,
              SESSION_DAYS *
                24 *
                60 *
                60
            )
        }
      );
    } catch (err) {
      console.error(
        'Erro no cadastro:',
        err
      );

      return sendJson(
        res,
        500,
        {
          error:
            'Não foi possível concluir o cadastro.'
        }
      );
    }
  }

  /* =======================================================
     LOGIN
  ======================================================= */

  if (
    req.method === 'POST' &&
    url === '/api/auth/login'
  ) {
    if (tooManyAttempts(req)) {
      return sendJson(
        res,
        429,
        {
          error:
            'Muitas tentativas. Aguarde alguns minutos.'
        }
      );
    }

    try {
      const body =
        await readBody(req);

      const email =
        clean(
          body.email,
          160
        ).toLowerCase();

      const password =
        String(
          body.password || ''
        );

      const user =
        await db
          .prepare(
            'SELECT * FROM users WHERE email = ?'
          )
          .get(email);

      if (
        !user ||
        !passwordVerify(
          password,
          user.password_hash
        )
      ) {
        return sendJson(
          res,
          401,
          {
            error:
              'E-mail ou senha inválidos.'
          }
        );
      }

      const accountStatus = calculateClientStatus(user);
      if (user.role === 'client' && isClientCancelled(user)) {
        return sendJson(res, 403, {
          authenticated: false,
          cancelled: true,
          status: 'cancelado',
          error: 'Seu período de acesso gratuito terminou. Atualize seu pagamento para continuar utilizando a plataforma.'
        });
      }

      await db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);

      const token =
        crypto
          .randomBytes(32)
          .toString(
            'base64url'
          );

      const expires =
        Date.now() +
        SESSION_DAYS *
          24 *
          60 *
          60 *
          1000;

      await db.prepare(`
        INSERT INTO sessions
        (
          user_id,
          token_hash,
          expires_at
        )
        VALUES (?, ?, ?)
      `).run(
        user.id,
        hashToken(token),
        expires
      );

      return sendJson(
        res,
        200,
        {
          message:
            'Login realizado com sucesso.',

          user: {
            name: user.name,
            email: user.email,
            role: user.role
          }
        },
        {
          'Set-Cookie':
            cookieHeader(
              token,
              SESSION_DAYS *
                24 *
                60 *
                60
            )
        }
      );
    } catch (err) {
      console.error(
        'Erro no login:',
        err
      );

      return sendJson(
        res,
        500,
        {
          error:
            'Não foi possível realizar o login.'
        }
      );
    }
  }

  /* =======================================================
     USUÁRIO ATUAL
  ======================================================= */

  if (
    req.method === 'GET' &&
    url === '/api/auth/me'
  ) {
    const user =
      await getCurrentUser(req);

    if (!user) {
      return sendJson(
        res,
        401,
        {
          authenticated:
            false
        }
      );
    }

    return sendJson(
      res,
      200,
      {
        authenticated:
          true,

        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.role === 'client' ? publicClientStatus(user) : { status: 'admin', manual: true }
        }
      }
    );
  }

  /* =======================================================
     LOGOUT
  ======================================================= */

  if (
    req.method === 'POST' &&
    url === '/api/auth/logout'
  ) {
    const token =
      parseCookies(req)[
        COOKIE_NAME
      ];

    if (token) {
      await db.prepare(
        'DELETE FROM sessions WHERE token_hash = ?'
      ).run(
        hashToken(token)
      );
    }

    return sendJson(
      res,
      200,
      {
        message:
          'Sessão encerrada.'
      },
      {
        'Set-Cookie':
          cookieHeader('', 0)
      }
    );
  }

  return false;
}

/* =========================================================
   DIAS DISPONÍVEIS
========================================================= */

function createWorkingDays(
  year,
  monthNumber,
  restSet
) {
  const daysInMonth =
    new Date(
      year,
      monthNumber,
      0
    ).getDate();

  const days = [];

  for (
    let day = 1;
    day <= daysInMonth;
    day++
  ) {
    const date =
      `${year}-${String(
        monthNumber
      ).padStart(
        2,
        '0'
      )}-${String(
        day
      ).padStart(
        2,
        '0'
      )}`;

    const weekend =
      isWeekend(date);

    const rest =
      restSet.has(date);

    /*
      Para o Rota Financeira, sábado e domingo
      continuam disponíveis para trabalho.

      O que retira um dia da meta é o cadastro
      explícito como dia de descanso.
    */

    days.push({
      day,
      date,
      isWeekend: weekend,
      isRestDay: rest,
      isWorkingDay: !rest
    });
  }

  return days;
}

function isWeekend(
  dateString
) {
  const date =
    parseDate(dateString);

  if (!date) {
    return false;
  }

  const weekday =
    date.getDay();

  return (
    weekday === 0 ||
    weekday === 6
  );
}

/* =========================================================
   DISTRIBUIÇÃO DE GANHOS
========================================================= */

function calculateIncomeDistribution(
  entry,
  workingDays
) {
  const amount =
    safeNumber(entry.amount);

  if (amount <= 0) {
    return {};
  }

  const createdDate =
    entry.created_date;

  const dueDate =
    entry.due_date;

  if (
    !validDate(createdDate) ||
    !validDate(dueDate)
  ) {
    return {};
  }

  if (
    compareDates(
      createdDate,
      dueDate
    ) === 0
  ) {
    return {
      [dueDate]: amount
    };
  }

  const eligibleDays =
    workingDays.filter(
      (day) =>
        compareDates(
          day.date,
          createdDate
        ) >= 0 &&
        compareDates(
          day.date,
          dueDate
        ) <= 0
    );

  if (
    eligibleDays.length === 0
  ) {
    return {
      [dueDate]: amount
    };
  }

  const daily =
    amount /
    eligibleDays.length;

  const result = {};

  eligibleDays.forEach(
    (day) => {
      result[day.date] =
        (
          result[day.date] ||
          0
        ) + daily;
    }
  );

  return result;
}

/* =========================================================
   DESPESAS FIXAS / PARCELADAS
========================================================= */

function createSeriesId() {
  return crypto.randomUUID();
}

function buildFixedDates(firstDueDate, count, recurrenceDay) {
  const dates = [];
  for (let i = 0; i < count; i++) {
    const date = addMonthsSameDay(
      firstDueDate,
      i,
      recurrenceDay
    );
    if (date) dates.push(date);
  }
  return dates;
}

async function ensureFixedSeriesHorizon(userId, seriesId, fromDate = getTodayLocal()) {
  if (!seriesId) return 0;

  const series = await db.prepare(`
    SELECT id, user_id, name, amount, recurrence_type, series_id, recurrence_day, paid, paid_at, due_date, recurrence_active
    FROM finance_entries
    WHERE user_id = ? AND series_id = ? AND recurrence_type = 'fixed'
      AND COALESCE(recurrence_active, 1) = 1
    ORDER BY due_date ASC, id ASC
  `).all(userId, seriesId);

  if (!series.length) return 0;

  const anchor = series[0];
  const recurrenceDay = Number(anchor.recurrence_day) || parseDate(series[0].due_date)?.getDate();
  let latest = series.reduce((max, item) => compareDates(item.due_date, max) > 0 ? item.due_date : max, series[0].due_date);
  let futureCount = series.filter((item) => compareDates(item.due_date, fromDate) > 0 && Number(item.paid) !== 1).length;
  let created = 0;

  while (futureCount < 3) {
    const next = addMonthsSameDay(latest, 1, recurrenceDay);
    if (!next || compareDates(next, latest) <= 0) break;

    const exists = await db.prepare(`
      SELECT id FROM finance_entries
      WHERE user_id = ? AND series_id = ? AND due_date = ?
      LIMIT 1
    `).get(userId, seriesId, next);

    if (!exists) {
      await db.prepare(`
        INSERT INTO finance_entries
        (user_id, type, name, amount, created_date, due_date, paid, paid_at, rest_day_id, recurrence_type, series_id, installment_number, installment_total, recurrence_day)
        VALUES (?, 'expense', ?, ?, ?, ?, 0, NULL, NULL, 'fixed', ?, NULL, NULL, ?)
      `).run(
        userId,
        anchor.name,
        anchor.amount,
        fromDate,
        next,
        seriesId,
        recurrenceDay
      );
      created++;
    }

    latest = next;
    futureCount++;
  }

  return created;
}

async function ensureAllFixedSeries(userId) {
  const rows = await db.prepare(`
    SELECT DISTINCT series_id
    FROM finance_entries
    WHERE user_id = ? AND recurrence_type = 'fixed' AND series_id IS NOT NULL
      AND COALESCE(recurrence_active, 1) = 1
  `).all(userId);

  let created = 0;
  for (const row of rows) {
    created += await ensureFixedSeriesHorizon(userId, row.series_id);
  }
  return created;
}

function getSeriesPreviousEntry(entries, entry) {
  if (!entry.series_id) return null;
  let previous = null;
  for (const candidate of entries) {
    if (candidate.id === entry.id || candidate.series_id !== entry.series_id) continue;
    if (compareDates(candidate.due_date, entry.due_date) >= 0) continue;
    if (!previous || compareDates(candidate.due_date, previous.due_date) > 0) previous = candidate;
  }
  return previous;
}

function getExpenseStartDate(entry, entries, currentDate) {
  const previous = getSeriesPreviousEntry(entries, entry);
  if (previous) {
    // A parcela/ocorrência seguinte só começa a formar a meta
    // depois que a anterior for efetivamente paga.
    if (Number(previous.paid) !== 1) return null;
    const paidDate = String(previous.paid_at || '').slice(0, 10);
    if (validDate(paidDate)) {
      return addDays(paidDate, 1);
    }
    return addDays(previous.due_date, 1);
  }

  const base = validDate(entry.created_date) ? entry.created_date : currentDate;
  return addDays(base, 1);
}

function buildWorkingDaysBetween(startDate, endDate, restSet = new Set()) {
  const days = [];
  if (!validDate(startDate) || !validDate(endDate) || compareDates(startDate, endDate) > 0) return days;

  let cursor = startDate;
  while (compareDates(cursor, endDate) <= 0) {
    days.push({
      date: cursor,
      isWorkingDay: !restSet.has(cursor),
      isRestDay: restSet.has(cursor),
      isWeekend: isWeekend(cursor)
    });
    cursor = addDays(cursor, 1);
  }
  return days;
}

/* =========================================================
   DISTRIBUIÇÃO DE DESPESAS
========================================================= */

function calculateExpenseDistribution(
  entry,
  workingDays
) {
  const amount =
    safeNumber(entry.amount);

  if (amount <= 0) {
    return {};
  }

  /*
    Despesa já paga não permanece como
    obrigação futura.
  */
  if (
    Number(entry.paid) === 1
  ) {
    return {};
  }

  const createdDate =
    entry.created_date;

  const dueDate =
    entry.due_date;

  if (
    !validDate(createdDate) ||
    !validDate(dueDate)
  ) {
    return {};
  }

  let startDate =
    addDays(
      createdDate,
      1
    );

  if (
    !startDate ||
    compareDates(
      startDate,
      dueDate
    ) > 0
  ) {
    return {
      [dueDate]: amount
    };
  }

  const eligibleDays =
    workingDays.filter(
      (day) =>
        compareDates(
          day.date,
          startDate
        ) >= 0 &&
        compareDates(
          day.date,
          dueDate
        ) <= 0
    );

  if (
    eligibleDays.length === 0
  ) {
    return {
      [dueDate]: amount
    };
  }

  const daily =
    amount /
    eligibleDays.length;

  const result = {};

  eligibleDays.forEach(
    (day) => {
      result[day.date] =
        (
          result[day.date] ||
          0
        ) + daily;
    }
  );

  return result;
}

/* =========================================================
   SOMAR DISTRIBUIÇÃO
========================================================= */

function mergeDistribution(
  target,
  source
) {
  Object.entries(
    source || {}
  ).forEach(
    ([date, value]) => {
      const number =
        safeNumber(value);

      if (
        !Number.isFinite(number)
      ) {
        return;
      }

      target[date] =
        (
          target[date] ||
          0
        ) + number;
    }
  );
}

/* =========================================================
   CÁLCULO DA META DINÂMICA
========================================================= */

function calculateDailyGoal(
  dailyData,
  entries,
  workingDays,
  today,
  allRestDays = new Set()
) {
  const currentDate =
    validDate(today)
      ? today
      : getTodayLocal();

  const tomorrow =
    addDays(currentDate, 1);

  if (!tomorrow) {
    return 0;
  }

  /*
    Para despesas normais, mantemos todas as pendências que
    já fazem parte do planejamento atual.

    Para despesas fixas/parceladas, consideramos somente a
    próxima ocorrência ainda não paga. Assim a meta não soma
    simultaneamente três meses futuros da mesma obrigação.
  */
  const pendingSeries = new Set();
  const pendingExpenses = [];

  const orderedEntries = entries
    .filter((entry) =>
      entry.type === 'expense' &&
      Number(entry.paid) !== 1 &&
      safeNumber(entry.amount) > 0 &&
      validDate(entry.due_date)
    )
    .sort((a, b) => {
      const dateCompare = compareDates(a.due_date, b.due_date);
      return dateCompare !== 0 ? dateCompare : Number(a.id) - Number(b.id);
    });

  orderedEntries.forEach((entry) => {
    if (entry.recurrence_type === 'fixed' || entry.recurrence_type === 'installment') {
      const key = entry.series_id || `entry:${entry.id}`;
      if (pendingSeries.has(key)) return;
      pendingSeries.add(key);
    }

    pendingExpenses.push(entry);
  });

  if (pendingExpenses.length === 0) {
    return 0;
  }

  let realizedIncome = 0;
  let paidExpenses = 0;

  for (const entry of entries) {
    const amount = safeNumber(entry.amount);
    if (amount <= 0 || !validDate(entry.due_date)) continue;

    if (entry.type === 'income' && Number(entry.paid) === 1) {
      realizedIncome += amount;
    }

    if (entry.type === 'expense' && Number(entry.paid) === 1) {
      paidExpenses += amount;
    }
  }

  const availableBalance = Math.max(
    0,
    realizedIncome - paidExpenses
  );

  const totalPending = pendingExpenses.reduce(
    (sum, entry) => sum + safeNumber(entry.amount),
    0
  );

  if (totalPending <= 0) {
    return 0;
  }

  const proportionalPayment = Math.min(
    availableBalance,
    totalPending
  );

  const remainingFactor = Math.max(
    0,
    1 - proportionalPayment / totalPending
  );

  const restSet =
    allRestDays instanceof Set
      ? allRestDays
      : new Set();

  let requiredGoal = 0;

  pendingExpenses.forEach((expense) => {
    const originalAmount = safeNumber(expense.amount);
    const remainingAmount = originalAmount * remainingFactor;

    if (remainingAmount <= 0) {
      return;
    }

    /*
      Despesa vencida ou para hoje: mantém a regra existente,
      exigindo o valor restante imediatamente.
    */
    if (compareDates(expense.due_date, currentDate) <= 0) {
      requiredGoal += remainingAmount;
      return;
    }

    /*
      A janela começa no dia seguinte à referência.

      Para uma despesa fixa/parcelada que já teve uma ocorrência
      anterior paga, getExpenseStartDate() usa o dia seguinte ao
      pagamento anterior. Para a primeira ocorrência, usa o dia
      seguinte ao cadastro.
    */
    const startDate = getExpenseStartDate(
      expense,
      entries,
      currentDate
    );

    if (!startDate) {
      return;
    }

    const effectiveStart =
      compareDates(startDate, tomorrow) < 0
        ? tomorrow
        : startDate;

    const availableDays = buildWorkingDaysBetween(
      effectiveStart,
      expense.due_date,
      restSet
    ).filter((day) => day.isWorkingDay);

    if (availableDays.length === 0) {
      requiredGoal += remainingAmount;
      return;
    }

    requiredGoal +=
      remainingAmount / availableDays.length;
  });

  return Number.isFinite(requiredGoal) && requiredGoal > 0
    ? requiredGoal
    : 0;
}

/* =========================================================
   ADMINISTRADOR — RESUMO MENSAL
========================================================= */

function calculateAdminDailyGoals(
  entries,
  workingDays,
  today
) {
  const goals = {};
  const tomorrow = addDays(today, 1);

  const futureWorkingDays = workingDays.filter(
    (day) => compareDates(day.date, tomorrow) >= 0
  );

  if (!futureWorkingDays.length) {
    return goals;
  }

  let realizedIncome = 0;
  let paidExpenses = 0;

  for (const entry of entries) {
    const amount = safeNumber(entry.amount);
    if (amount <= 0 || !validDate(entry.due_date)) continue;

    if (entry.type === 'income' && Number(entry.paid) === 1) {
      realizedIncome += amount;
    }

    if (entry.type === 'expense' && Number(entry.paid) === 1) {
      paidExpenses += amount;
    }
  }

  const availableBalance = Math.max(0, realizedIncome - paidExpenses);
  const pendingExpenses = entries.filter(
    (entry) =>
      entry.type === 'expense' &&
      Number(entry.paid) !== 1 &&
      safeNumber(entry.amount) > 0 &&
      validDate(entry.due_date)
  );

  const totalPending = pendingExpenses.reduce(
    (sum, entry) => sum + safeNumber(entry.amount),
    0
  );

  if (totalPending <= 0) return goals;

  const proportionalPayment = Math.min(availableBalance, totalPending);
  const remainingFactor = Math.max(
    0,
    1 - proportionalPayment / totalPending
  );

  for (const expense of pendingExpenses) {
    const remaining = safeNumber(expense.amount) * remainingFactor;
    if (remaining <= 0) continue;

    const eligibleDays = futureWorkingDays.filter(
      (day) => compareDates(day.date, expense.due_date) <= 0
    );

    const days = eligibleDays.length
      ? eligibleDays
      : [futureWorkingDays[0]];

    const daily = remaining / days.length;

    for (const day of days) {
      goals[day.date] = (goals[day.date] || 0) + daily;
    }
  }

  return goals;
}

async function buildAdminClientSummary(userId, month) {
  // Os totais continuam sendo calculados pelo mês selecionado.
  // O gráfico, porém, precisa enxergar também lançamentos cujo intervalo
  // atravessa o mês selecionado (ex.: cadastro em setembro e recebimento em outubro).
  const entries = await db.prepare(`
    SELECT
      id, type, name, amount, created_date, due_date,
      paid, paid_at, rest_day_id, created_at,
      recurrence_type, series_id, installment_number,
      installment_total, recurrence_day
    FROM finance_entries
    WHERE user_id = ?
    ORDER BY due_date ASC, id ASC
  `).all(userId);

  const totals = await db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
      COALESCE(SUM(CASE WHEN type = 'expense' AND paid = 1 THEN amount ELSE 0 END), 0) AS paidExpense,
      COALESCE(SUM(CASE WHEN type = 'expense' AND paid = 0 THEN amount ELSE 0 END), 0) AS pendingExpense
    FROM finance_entries
    WHERE user_id = ? AND to_char(due_date, 'YYYY-MM') = ?
  `).get(userId, month);

  const restDays = await db.prepare(`
    SELECT id, rest_date, amount, created_at
    FROM rest_days
    WHERE user_id = ? AND to_char(rest_date, 'YYYY-MM') = ?
    ORDER BY rest_date ASC
  `).all(userId, month);

  const allRestDays = await db.prepare(`
    SELECT rest_date
    FROM rest_days
    WHERE user_id = ?
  `).all(userId);

  const allRestSet = new Set(allRestDays.map((item) => item.rest_date));
  const [year, monthNumber] = month.split('-').map(Number);
  const calendarDays = createWorkingDays(year, monthNumber, new Set(restDays.map((item) => item.rest_date)));
  const workingDays = calendarDays.filter((day) => day.isWorkingDay);

  const futureIncomeByDay = {};
  const futureExpenseByDay = {};
  const paidIncomeByDay = {};
  const paidExpenseByDay = {};

  const mergeDayValue = (target, date, amount) => {
    if (!validDate(date)) return;
    target[date] = (target[date] || 0) + safeNumber(amount);
  };

  for (const entry of entries) {
    const createdDate = String(entry.created_date || '').slice(0, 10);
    const dueDate = String(entry.due_date || '').slice(0, 10);
    const paid = Number(entry.paid) === 1;

    // Realizado = somente aquilo que foi manualmente confirmado como pago/recebido.
    if (paid) {
      const realizedDate = validDate(String(entry.paid_at || '').slice(0, 10))
        ? String(entry.paid_at).slice(0, 10)
        : dueDate;

      if (entry.type === 'income') {
        mergeDayValue(paidIncomeByDay, realizedDate, entry.amount);
      } else if (entry.type === 'expense') {
        mergeDayValue(paidExpenseByDay, realizedDate, entry.amount);
      }
      continue;
    }

    // Previsto = lançamento ainda não confirmado, com data de cadastro
    // e data de recebimento/pagamento em dias diferentes.
    if (
      !validDate(createdDate) ||
      !validDate(dueDate) ||
      compareDates(dueDate, createdDate) <= 0
    ) {
      continue;
    }

    const intervalDays = buildWorkingDaysBetween(
      createdDate,
      dueDate,
      allRestSet
    );

    if (!intervalDays.length) continue;

    if (entry.type === 'income') {
      mergeDistribution(
        futureIncomeByDay,
        calculateIncomeDistribution(entry, intervalDays)
      );
    } else if (entry.type === 'expense') {
      mergeDistribution(
        futureExpenseByDay,
        calculateExpenseDistribution(entry, intervalDays)
      );
    }
  }

  const today = getTodayLocal();
  const dailyGoals = calculateAdminDailyGoals(entries, workingDays, today);

  const data = calendarDays.map((day) => ({
    day: day.day,
    date: day.date,
    income: safeNumber(futureIncomeByDay[day.date]) + safeNumber(paidIncomeByDay[day.date]),
    expense: safeNumber(futureExpenseByDay[day.date]) + safeNumber(paidExpenseByDay[day.date]) + (day.isRestDay ? safeNumber(restDays.find((item) => item.rest_date === day.date)?.amount) : 0),
    futureIncome: safeNumber(futureIncomeByDay[day.date]),
    futureExpense: safeNumber(futureExpenseByDay[day.date]),
    paidIncome: safeNumber(paidIncomeByDay[day.date]),
    paidExpense: safeNumber(paidExpenseByDay[day.date]),
    cashflow: safeNumber(futureIncomeByDay[day.date]) - safeNumber(futureExpenseByDay[day.date]),
    realizedCashflow: safeNumber(paidIncomeByDay[day.date]) - safeNumber(paidExpenseByDay[day.date]),
    dailyGoal: safeNumber(dailyGoals[day.date]),
    isWorkingDay: day.isWorkingDay,
    isWeekend: day.isWeekend,
    isRestDay: day.isRestDay,
    restAmount: restDays.find((item) => item.rest_date === day.date)?.amount || 0
  }));

  const income = safeNumber(totals?.income);
  const expense = safeNumber(totals?.expense);
  const paidExpense = safeNumber(totals?.paidExpense);
  const pendingExpense = safeNumber(totals?.pendingExpense);
  const allTimeTotals = await db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS totalIncomeAllTime,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS totalExpenseAllTime
    FROM finance_entries
    WHERE user_id = ?
  `).get(userId);
  const totalIncomeAllTime = safeNumber(allTimeTotals?.totalIncomeAllTime);
  const totalExpenseAllTime = safeNumber(allTimeTotals?.totalExpenseAllTime);
  const cashflow = income - expense;

  // O saldo realizado nunca depende da data prevista: só entra quando paid = 1.
  const realizedIncome = entries.reduce((sum, entry) => {
    if (entry.type !== 'income' || Number(entry.paid) !== 1) return sum;
    return sum + safeNumber(entry.amount);
  }, 0);

  const availableBalance = Math.max(0, realizedIncome - paidExpense);
  const futureWorkingDays = workingDays.filter((day) => compareDates(day.date, addDays(today, 1)) >= 0);
  const totalPlannedGoal = futureWorkingDays.reduce((sum, day) => sum + safeNumber(dailyGoals[day.date]), 0);

  return {
    month,
    totals: {
      income,
      expense,
      cashflow,
      dailyGoal: calculateDailyGoal(data, entries, workingDays, today),
      totalPlannedGoal,
      workingDays: workingDays.length,
      restDays: restDays.length,
      availableWorkingDays: futureWorkingDays.length,
      today,
      tomorrow: addDays(today, 1),
      paidExpense,
      pendingExpense,
      realizedIncome,
      availableBalance,
      totalIncomeAllTime,
      totalExpenseAllTime
    },
    data,
    entries,
    restDays
  };
}

async function recordClientChange(userId, actorUserId, action, fieldName = null, oldValue = null, newValue = null, details = null) {
  await db.prepare(`
    INSERT INTO client_change_log
      (user_id, actor_user_id, action, field_name, old_value, new_value, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(userId),
    actorUserId ? Number(actorUserId) : null,
    clean(action, 80),
    fieldName ? clean(fieldName, 80) : null,
    oldValue == null ? null : String(oldValue).slice(0, 500),
    newValue == null ? null : String(newValue).slice(0, 500),
    details == null ? null : String(details).slice(0, 1000)
  );
}

function buildChangeHistoryPdf(client, changes) {
  const pages = [];
  const esc = (v) => pdfSafe(pdfAscii(v));
  const labels = { name: 'Nome', email: 'E-mail', phone: 'WhatsApp', password: 'Senha', billing_status: 'Status', service: 'Serviço' };
  const formatDateTime = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('pt-BR', { timeZone: 'America/Bahia' });
  };
  const objects = [];
  const addObject = (buffer) => { objects.push(buffer); return objects.length; };
  const catalog = addObject(Buffer.alloc(0));
  const pagesObj = addObject(Buffer.alloc(0));
  const fontRegular = addObject(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'latin1'));
  const fontBold = addObject(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>', 'latin1'));
  const pageRefs = [];

  const makePage = (pageNo) => {
    const c = [];
    c.push('0.07 0.10 0.15 rg', '0 790 595 52 re f');
    c.push(`1 1 1 rg BT /F2 15 Tf 38 815 Td (${esc('ROTA FINANCEIRA')}) Tj ET`);
    c.push(`0.75 0.80 0.86 rg BT /F1 8 Tf 38 798 Td (${esc('HISTORICO DE ALTERACOES DO CLIENTE')}) Tj ET`);
    c.push(`0.85 0.88 0.92 rg BT /F2 9 Tf 520 814 Td (${String(pageNo).padStart(2,'0')}) Tj ET`);
    c.push(`0.10 0.14 0.20 rg BT /F2 18 Tf 38 758 Td (${esc(client.name || 'Cliente')}) Tj ET`);
    c.push(`0.40 0.43 0.48 rg BT /F1 9 Tf 38 742 Td (${esc(client.email || '—')}) Tj ET`);
    c.push(`0.40 0.43 0.48 rg BT /F1 8 Tf 38 726 Td (${esc('Gerado em: ' + formatDateTime(new Date().toISOString()))}) Tj ET`);
    return c;
  };

  let pageNo = 1, c = makePage(pageNo), y = 690;
  const pushLine = (line, bold=false) => {
    if (y < 65) { pages.push(c); c = makePage(++pageNo); y = 690; }
    for (const wrapped of pdfWrap(line, 96)) {
      if (y < 65) { pages.push(c); c = makePage(++pageNo); y = 690; }
      c.push(`0.16 0.18 0.22 rg BT /F${bold?2:1} ${bold?9:8} Tf 42 ${y} Td (${esc(wrapped)}) Tj ET`);
      y -= 13;
    }
  };

  if (!changes.length) pushLine('Nenhuma alteracao registrada para este cliente.', true);
  for (const item of changes) {
    const field = labels[item.field_name] || item.field_name || 'Registro';
    pushLine(`${formatDateTime(item.created_at)} — ${item.action}`, true);
    if (item.field_name) pushLine(`Campo: ${field}`);
    if (item.field_name === 'password') pushLine('A senha foi alterada. Os valores de senha nao sao armazenados no historico.');
    else {
      if (item.old_value != null) pushLine(`Anterior: ${item.old_value || '—'}`);
      if (item.new_value != null) pushLine(`Novo: ${item.new_value || '—'}`);
    }
    if (item.details) pushLine(`Detalhes: ${item.details}`);
    y -= 7;
  }
  pages.push(c);

  for (const commands of pages) {
    const content = Buffer.from(commands.join('\n') + '\n', 'latin1');
    const contentObj = addObject(Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'));
    objects[contentObj - 1] = Buffer.concat([objects[contentObj - 1], content, Buffer.from('endstream', 'latin1')]);
    const pageObj = addObject(Buffer.from(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentObj} 0 R >>`, 'latin1'));
    pageRefs.push(pageObj);
  }
  objects[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`, 'latin1');
  objects[pagesObj - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`, 'latin1');
  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets = [0]; let offset = chunks[0].length;
  objects.forEach((obj, index) => { offsets.push(offset); const h=Buffer.from(`${index+1} 0 obj\n`,'latin1'); const f=Buffer.from('\nendobj\n','latin1'); chunks.push(h,obj,f); offset += h.length+obj.length+f.length; });
  const xrefOffset=offset; let xref=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i++) xref += `${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref,'latin1'));
  return Buffer.concat(chunks);
}

async function handleAdminApi(req, res, url, parsedUrl) {
  const admin = await requireAdmin(req, res);
  if (!admin) return true;

  const month = parsedUrl.searchParams.get('month');

  if (req.method === 'GET' && url === '/api/admin/clients') {
    if (!validMonth(month)) {
      return sendJson(res, 400, { error: 'Mês inválido.' });
    }
    const clients = await db.prepare(`
      SELECT id, name, email, phone, created_at, billing_status, last_login_at
      FROM users
      WHERE role = 'client'
      ORDER BY lower(name) ASC
    `).all();

    const result = await Promise.all(clients.map(async (client) => {
      const summary = await buildAdminClientSummary(client.id, month);
      const status = publicClientStatus(client);
      const active = !!client.last_login_at &&
        (Date.now() - new Date(String(client.last_login_at).replace(' ', 'T')).getTime()) <= 30 * 24 * 60 * 60 * 1000;
      return {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        created_at: client.created_at,
        last_login_at: client.last_login_at,
        status,
        active,
        totals: summary.totals
      };
    }));

    const aggregate = result.reduce((acc, client) => {
      acc.total += 1;
      acc.active += client.active ? 1 : 0;
      acc.pagantes += client.status.status === 'pagante' ? 1 : 0;
      acc.freeTrial += ['free', 'trial'].includes(client.status.status) ? 1 : 0;
      return acc;
    }, { total: 0, active: 0, pagantes: 0, freeTrial: 0 });

    return sendJson(res, 200, { month, clients: result, aggregate });
  }

  const reportMatch = url.match(/^\/api\/admin\/clients\/(\d+)\/report$/);
  if (req.method === 'GET' && reportMatch) {
    const clientId = Number(reportMatch[1]);
    const requestedMonth = parsedUrl.searchParams.get('month') || getTodayLocal().slice(0, 7);
    if (!validMonth(requestedMonth)) {
      return sendJson(res, 400, { error: 'Mês inválido.' });
    }

    const client = await db.prepare(`
      SELECT id, name, email, phone, created_at, billing_status, last_login_at
      FROM users
      WHERE id = ? AND role = 'client'
    `).get(clientId);

    if (!client) {
      return sendJson(res, 404, { error: 'Cliente não encontrado.' });
    }

    const today = getTodayLocal();
    const createdDate = String(client.created_at || '').slice(0, 10);
    const createdMonth = createdDate.slice(0, 7);
    const summary = await buildAdminClientSummary(clientId, requestedMonth);

    const entries = await db.prepare(`
      SELECT type, amount, due_date
      FROM finance_entries
      WHERE user_id = ?
      ORDER BY due_date ASC, id ASC
    `).all(clientId);

    const restDays = await db.prepare(`
      SELECT rest_date
      FROM rest_days
      WHERE user_id = ?
      ORDER BY rest_date ASC, id ASC
    `).all(clientId);

    const monthly = [];
    if (validMonth(createdMonth) && validMonth(today.slice(0, 7))) {
      let cursor = createdMonth;
      const lastMonth = today.slice(0, 7);
      while (cursor <= lastMonth) {
        const monthEntries = entries.filter((entry) => String(entry.due_date || '').slice(0, 7) === cursor);
        const income = monthEntries.filter((e) => e.type === 'income').reduce((sum, e) => sum + safeNumber(e.amount), 0);
        const expense = monthEntries.filter((e) => e.type === 'expense').reduce((sum, e) => sum + safeNumber(e.amount), 0);
        const restCount = restDays.filter((r) => String(r.rest_date || '').slice(0, 7) === cursor).length;

        monthly.push({
          month: cursor,
          income,
          expense,
          cashflow: income - expense,
          restDays: restCount
        });

        const [year, monthNumber] = cursor.split('-').map(Number);
        const next = new Date(year, monthNumber, 1);
        cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
      }
    }

    const report = {
      generated_at: new Date().toISOString(),
      client: { ...client, status: publicClientStatus(client) },
      period: {
        start: createdDate,
        end: today,
        startMonth: createdMonth,
        endMonth: today.slice(0, 7)
      },
      totals: summary.totals,
      summary,
      monthly
    };

    try {
      const pdf = buildClientReportPdf(report);
      return sendPdf(res, 200, pdf, pdfFileName(client.name, requestedMonth));
    } catch (error) {
      console.error('Erro ao gerar relatório PDF:', error);
      return sendJson(res, 500, { error: 'Não foi possível gerar o relatório PDF.' });
    }
  }

  const historyMatch = url.match(/^\/api\/admin\/clients\/(\d+)\/change-history$/);
  if (req.method === 'GET' && historyMatch) {
    const clientId = Number(historyMatch[1]);
    const client = await db.prepare(`
      SELECT id, name, email, phone, created_at
      FROM users WHERE id = ? AND role = 'client'
    `).get(clientId);
    if (!client) return sendJson(res, 404, { error: 'Cliente não encontrado.' });
    const changes = await db.prepare(`
      SELECT action, field_name, old_value, new_value, details, created_at
      FROM client_change_log
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(clientId);
    try {
      const pdf = buildChangeHistoryPdf(client, changes);
      const base = String(client.name || 'Cliente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,'') || 'Cliente';
      return sendPdf(res, 200, pdf, `Historico_Alteracoes_${base}.pdf`);
    } catch (error) {
      console.error('Erro ao gerar histórico de alterações:', error);
      return sendJson(res, 500, { error: 'Não foi possível gerar o histórico de alterações.' });
    }
  }

  const statusMatch = url.match(/^\/api\/admin\/clients\/(\d+)\/status$/);
  if (req.method === 'PATCH' && statusMatch) {
    const clientId = Number(statusMatch[1]);
    const client = await db.prepare(`
      SELECT id, name, email, phone, created_at, billing_status, last_login_at
      FROM users
      WHERE id = ? AND role = 'client'
    `).get(clientId);

    if (!client) {
      return sendJson(res, 404, { error: 'Cliente não encontrado.' });
    }

    try {
      const body = await readBody(req);
      const requested = String(body.status || '').trim().toLowerCase();
      const allowed = new Set(['auto', 'pagante', 'inadimplente', 'cancelado']);
      if (!allowed.has(requested)) {
        return sendJson(res, 400, { error: 'Status inválido. Use automático, pagante, inadimplente ou cancelado.' });
      }

      const billingStatus = requested === 'auto' ? null : requested;
      const oldBillingStatus = client.billing_status || null;
      await db.prepare('UPDATE users SET billing_status = ? WHERE id = ?').run(billingStatus, clientId);
      if (String(oldBillingStatus || '') !== String(billingStatus || '')) {
        await recordClientChange(clientId, admin.id, 'Status do cliente alterado pelo administrador', 'billing_status', oldBillingStatus || 'Automático', billingStatus || 'Automático');
      }

      const updated = await db.prepare(`
        SELECT id, name, email, phone, created_at, billing_status, last_login_at
        FROM users WHERE id = ? AND role = 'client'
      `).get(clientId);

      return sendJson(res, 200, {
        message: 'Status atualizado com sucesso.',
        client: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          created_at: updated.created_at,
          last_login_at: updated.last_login_at,
          status: publicClientStatus(updated)
        }
      });
    } catch (err) {
      console.error('Erro ao atualizar status do cliente:', err);
      return sendJson(res, 500, { error: 'Não foi possível atualizar o status do cliente.' });
    }
  }

  const match = url.match(/^\/api\/admin\/clients\/(\d+)\/summary$/);
  if (req.method === 'GET' && match) {
    if (!validMonth(month)) {
      return sendJson(res, 400, { error: 'Mês inválido.' });
    }
    const clientId = Number(match[1]);
    const client = await db.prepare(`
      SELECT id, name, email, phone, created_at, billing_status, last_login_at
      FROM users
      WHERE id = ? AND role = 'client'
    `).get(clientId);

    if (!client) {
      return sendJson(res, 404, { error: 'Cliente não encontrado.' });
    }

    return sendJson(res, 200, {
      client: {
        ...client,
        status: publicClientStatus(client)
      },
      summary: await buildAdminClientSummary(clientId, month)
    });
  }

  return false;
}

/* =========================================================
   PERFIL DO CLIENTE
========================================================= */

async function handleProfileApi(req, res, url) {
  if (url !== '/api/profile') return false;

  const user = await requireUser(req, res);
  if (!user) return true;
  const userId = Number(user.id);

  if (req.method === 'GET') {
    const current = await db.prepare(`
      SELECT id, name, email, phone, role
      FROM users WHERE id = ?
    `).get(userId);
    return sendJson(res, 200, { user: current });
  }

  if (req.method === 'PUT') {
    try {
      const body = await readBody(req);
      const name = clean(body.name, 100);
      const email = clean(body.email, 160).toLowerCase();
      const phone = clean(body.phone, 30);
      const newPassword = String(body.password || '');

      if (name.length < 2) return sendJson(res, 400, { error: 'Informe um nome válido.' });
      if (!validEmail(email)) return sendJson(res, 400, { error: 'Informe um e-mail válido.' });
      if (newPassword && (newPassword.length < 8 || newPassword.length > 128)) {
        return sendJson(res, 400, { error: 'A nova senha deve ter entre 8 e 128 caracteres.' });
      }

      const current = await db.prepare(`SELECT id, name, email, phone FROM users WHERE id = ?`).get(userId);
      const duplicate = await db.prepare(`SELECT id FROM users WHERE lower(email) = lower(?) AND id <> ?`).get(email, userId);
      if (duplicate) return sendJson(res, 409, { error: 'Este e-mail já está sendo utilizado por outra conta.' });

      if (newPassword) {
        await db.prepare('UPDATE users SET name = ?, email = ?, phone = ?, password_hash = ? WHERE id = ?').run(
          name, email, phone, passwordHash(newPassword), userId
        );
      } else {
        await db.prepare('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?').run(name, email, phone, userId);
      }

      if (String(current.name || '') !== name) await recordClientChange(userId, userId, 'Dados cadastrais atualizados pelo cliente', 'name', current.name || '', name);
      if (String(current.email || '') !== email) await recordClientChange(userId, userId, 'Dados cadastrais atualizados pelo cliente', 'email', current.email || '', email);
      if (String(current.phone || '') !== phone) await recordClientChange(userId, userId, 'Dados cadastrais atualizados pelo cliente', 'phone', current.phone || '', phone);
      if (newPassword) await recordClientChange(userId, userId, 'Senha alterada pelo cliente', 'password', null, null, 'Alteração de senha concluída. O conteúdo da senha não é registrado.');

      const updated = await db.prepare(`SELECT id, name, email, phone, role FROM users WHERE id = ?`).get(userId);
      return sendJson(res, 200, { message: 'Dados cadastrais atualizados com sucesso.', user: updated });
    } catch (err) {
      console.error('Erro ao atualizar perfil:', err);
      return sendJson(res, 500, { error: 'Não foi possível atualizar os dados cadastrais.' });
    }
  }

  return false;
}

/* =========================================================
   SERVIÇOS DO CLIENTE
========================================================= */

async function handleServicesApi(req, res, url) {
  const user = await requireUser(req, res);
  if (!user) return true;
  const userId = Number(user.id);

  if (req.method === 'GET' && url === '/api/services') {
    const services = await pool.query(`
      SELECT
        s.id, s.slug, s.name, s.description, s.price,
        CASE
          WHEN s.default_acquired = TRUE OR us.user_id IS NOT NULL THEN TRUE
          ELSE FALSE
        END AS acquired
      FROM services s
      LEFT JOIN user_services us
        ON us.service_id = s.id AND us.user_id = $1
      WHERE s.active = TRUE
      ORDER BY s.id ASC
    `, [userId]);

    return sendJson(res, 200, {
      services: services.rows.map((item) => ({
        ...item,
        price: Number(item.price || 0),
        acquired: item.acquired === true
      }))
    });
  }

  const purchaseMatch = url.match(/^\/api\/services\/(\d+)\/purchase$/);
  if (req.method === 'POST' && purchaseMatch) {
    const serviceId = Number(purchaseMatch[1]);
    const service = await db.prepare(`
      SELECT id, active FROM services WHERE id = ?
    `).get(serviceId);

    if (!service || service.active !== true) {
      return sendJson(res, 404, { error: 'Serviço não encontrado.' });
    }

    const existingService = await db.prepare('SELECT user_id FROM user_services WHERE user_id = ? AND service_id = ?').get(userId, serviceId);
    await pool.query(`
      INSERT INTO user_services (user_id, service_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, service_id) DO NOTHING
    `, [userId, serviceId]);
    if (!existingService) {
      const serviceInfo = await db.prepare('SELECT name FROM services WHERE id = ?').get(serviceId);
      await recordClientChange(userId, userId, 'Serviço adquirido pelo cliente', 'service', null, serviceInfo?.name || `Serviço ${serviceId}`);
    }

    return sendJson(res, 200, { message: 'Serviço adquirido com sucesso.' });
  }

  return false;
}

/* =========================================================
   FINANCEIRO
========================================================= */

async function handleFinanceApi(
  req,
  res,
  url,
  parsedUrl
) {
  const user =
    await requireUser(
      req,
      res
    );

  if (!user) {
    return true;
  }

  const userId =
    Number(user.id);

  /* =======================================================
     LEMBRETES DE LANÇAMENTOS VENCIDOS / VENCENDO HOJE
  ======================================================= */

  if (
    req.method === 'GET' &&
    url === '/api/finance/reminders'
  ) {
    const today = getTodayLocal();

    const entries = await db.prepare(`
      SELECT
        id,
        type,
        name,
        amount,
        due_date,
        paid
      FROM finance_entries
      WHERE
        user_id = ?
        AND paid = 0
        AND due_date <= ?
      ORDER BY
        due_date ASC,
        id ASC
    `).all(userId, today);

    const income = entries.filter((entry) => entry.type === 'income');
    const expense = entries.filter((entry) => entry.type === 'expense');

    return sendJson(res, 200, {
      today,
      hasReminders: entries.length > 0,
      income,
      expense,
      total: entries.length
    });
  }

  /* =======================================================
     LISTAR LANÇAMENTOS
  ======================================================= */

  if (
    req.method === 'GET' &&
    url === '/api/finance/entries'
  ) {
    const month =
      parsedUrl.searchParams.get(
        'month'
      );

    if (
      !validMonth(month)
    ) {
      return sendJson(
        res,
        400,
        {
          error:
            'Mês inválido.'
        }
      );
    }

    const entries =
      await db
        .prepare(`
          SELECT
            id,
            type,
            name,
            amount,
            created_date,
            due_date,
            paid,
            paid_at,
            rest_day_id,
            created_at

          FROM finance_entries

          WHERE
            user_id = ?
            AND to_char(due_date, 'YYYY-MM') = ?

          ORDER BY
            due_date ASC,
            id ASC
        `)
        .all(
          userId,
          month
        );

    return sendJson(
      res,
      200,
      {
        month,
        entries
      }
    );
  }

  /* =======================================================
     CADASTRAR GANHO / DESPESA
  ======================================================= */

  if (
    req.method === 'POST' &&
    url === '/api/finance/entries'
  ) {
    try {
      const body =
        await readBody(req);

      const requestId =
  clean(
    body.request_id,
    100
  );
      
      const type =
        clean(
          body.type,
          20
        );

      const name =
        clean(
          body.name,
          200
        );

      const amount =
        normalizeAmount(
          body.amount
        );

      const createdDate =
        clean(
          body.created_date,
          10
        );

      const dueDate =
        clean(
          body.due_date,
          10
        );

      const recurrenceType =
        type === 'expense'
          ? clean(body.recurrence_type, 20).toLowerCase() || 'single'
          : 'single';

      const installmentTotal =
        recurrenceType === 'installment'
          ? Number(body.installment_total)
          : null;

      if (!requestId) {
  return sendJson(
    res,
    400,
    {
      error:
        'Identificador da operação não informado.'
    }
  );
}
      
      if (
        type !== 'income' &&
        type !== 'expense'
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Tipo de lançamento inválido.'
          }
        );
      }

      if (!name) {
        return sendJson(
          res,
          400,
          {
            error:
              'Informe o nome do lançamento.'
          }
        );
      }

      if (
        amount === null
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Informe um valor válido.'
          }
        );
      }

      if (type === 'expense' && !['single', 'fixed', 'installment'].includes(recurrenceType)) {
        return sendJson(res, 400, { error: 'Tipo de despesa recorrente inválido.' });
      }

      if (type === 'expense' && recurrenceType === 'installment' && (!Number.isInteger(installmentTotal) || installmentTotal < 2 || installmentTotal > 120)) {
        return sendJson(res, 400, { error: 'Informe um número de parcelas entre 2 e 120.' });
      }

      if (
        !validDate(createdDate) ||
        !validDate(dueDate)
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Informe datas válidas.'
          }
        );
      }

      const seriesId = recurrenceType === 'single' ? null : createSeriesId();
      const recurrenceDay = parseDate(dueDate).getDate();
      const rowsToCreate = [];
      let firstEntryId = null;

      if (type === 'expense' && recurrenceType === 'fixed') {
        const dates = buildFixedDates(dueDate, 3, recurrenceDay);
        dates.forEach((date) => rowsToCreate.push({ date, installmentNumber: null, installmentTotal: null }));
      } else if (type === 'expense' && recurrenceType === 'installment') {
        for (let i = 0; i < installmentTotal; i++) {
          rowsToCreate.push({
            date: addMonthsSameDay(dueDate, i, recurrenceDay),
            installmentNumber: i + 1,
            installmentTotal
          });
        }
      } else {
        rowsToCreate.push({ date: dueDate, installmentNumber: null, installmentTotal: null });
      }

      await db.exec('BEGIN');
      try {
const insert = await db.prepare(`
  INSERT INTO finance_entries
  (
    user_id,
    type,
    name,
    amount,
    created_date,
    due_date,
    paid,
    paid_at,
    rest_day_id,
    recurrence_type,
    series_id,
    installment_number,
    installment_total,
    recurrence_day,
    request_id
  )
  VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?, ?, ?, ?, ?)
`);

for (let i = 0; i < rowsToCreate.length; i++) {
  const row = rowsToCreate[i];

  const result = await insert.run(
    userId,
    type,
    name,
    amount,
    createdDate,
    row.date,
    recurrenceType,
    seriesId,
    row.installmentNumber,
    row.installmentTotal,
    recurrenceDay,

    // A chave identifica a operação inteira.
    // Somente a primeira linha recebe o request_id.
    i === 0 ? requestId : null
  );

  if (firstEntryId === null) {
    firstEntryId =
      Number(result.lastInsertRowid);
  }
}

await db.exec('COMMIT');
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }

      const entry = await db.prepare(`
        SELECT id, type, name, amount, created_date, due_date, paid, paid_at, rest_day_id,
               recurrence_type, series_id, installment_number, installment_total, recurrence_day, created_at
        FROM finance_entries
        WHERE id = ? AND user_id = ?
      `).get(firstEntryId, userId);

      console.log(
        `Novo ${type}:`,
        entry
      );

      return sendJson(
        res,
        201,
        {
          message:
            type === 'income'
              ? 'Ganho cadastrado com sucesso.'
              : recurrenceType === 'fixed'
                ? 'Despesa fixa cadastrada para os próximos 3 meses.'
                : recurrenceType === 'installment'
                  ? `Despesa parcelada cadastrada em ${installmentTotal} parcelas.`
                  : 'Despesa cadastrada com sucesso.',

          entry
        }
      );
    } catch (err) {
    if (
  err?.code === '23505' &&
  requestId
) {
  const existingEntry =
    await db.prepare(`
      SELECT
        id,
        type,
        name,
        amount,
        created_date,
        due_date,
        paid,
        paid_at,
        rest_day_id,
        recurrence_type,
        series_id,
        installment_number,
        installment_total,
        recurrence_day,
        created_at

      FROM finance_entries

      WHERE
        user_id = ?
        AND request_id = ?

      LIMIT 1
    `).get(
      userId,
      requestId
    );

  if (existingEntry) {
    return sendJson(
      res,
      200,
      {
        message:
          'Lançamento já cadastrado.',
        entry: existingEntry,
        duplicate: true
      }
    );
  }
}
      console.error(
        'Erro ao cadastrar lançamento:',
        err
      );

      return sendJson(
        res,
        500,
        {
          error:
            'Não foi possível cadastrar o lançamento.'
        }
      );
    }
  }

  /* =======================================================
     RECEBER GANHO
  ======================================================= */

  const receiveMatch =
    url.match(
      /^\/api\/finance\/entries\/(\d+)\/receive$/
    );

  if (
    (
      req.method === 'POST' ||
      req.method === 'PUT' ||
      req.method === 'PATCH'
    ) &&
    receiveMatch
  ) {
    const id =
      Number(
        receiveMatch[1]
      );

    try {
      const entry =
        await db
          .prepare(`
            SELECT
              id,
              type,
              name,
              amount,
              created_date,
              due_date,
              paid,
              paid_at,
              rest_day_id,
              recurrence_type,
              series_id,
              installment_number,
              installment_total,
              recurrence_day,
              created_at

            FROM finance_entries

            WHERE
              id = ?
              AND user_id = ?
          `)
          .get(
            id,
            userId
          );

      if (!entry) {
        return sendJson(
          res,
          404,
          {
            error:
              'Ganho não encontrado.'
          }
        );
      }

      if (
        entry.type !== 'income'
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Somente ganhos podem ser confirmados como recebidos.'
          }
        );
      }

      if (
        Number(entry.paid) === 1
      ) {
        return sendJson(
          res,
          200,
          {
            message:
              'Este ganho já está marcado como recebido.',
            entry
          }
        );
      }

      const today =
        getTodayLocal();

      const paidAt =
        new Date().toISOString();

      await db
        .prepare(`
          UPDATE finance_entries

          SET
            due_date = ?,
            paid = 1,
            paid_at = ?

          WHERE
            id = ?
            AND user_id = ?
        `)
        .run(
          today,
          paidAt,
          id,
          userId
        );

      const updatedEntry =
        await db
          .prepare(`
            SELECT
              id,
              type,
              name,
              amount,
              created_date,
              due_date,
              paid,
              paid_at,
              rest_day_id,
              recurrence_type,
              series_id,
              installment_number,
              installment_total,
              recurrence_day,
              created_at

            FROM finance_entries

            WHERE
              id = ?
              AND user_id = ?
          `)
          .get(
            id,
            userId
          );

      console.log(
        'Ganho recebido:',
        updatedEntry
      );

      return sendJson(
        res,
        200,
        {
          message:
            'Ganho marcado como recebido e data atualizada para hoje.',

          entry:
            updatedEntry,

          received: true
        }
      );
    } catch (err) {
      console.error(
        'Erro ao confirmar recebimento:',
        err
      );

      return sendJson(
        res,
        500,
        {
          error:
            'Não foi possível confirmar o recebimento.'
        }
      );
    }
  }

  /* =======================================================
     DESFAZER RECEBIMENTO
  ======================================================= */

  const unreceiveMatch =
    url.match(
      /^\/api\/finance\/entries\/(\d+)\/unreceive$/
    );

  if (
    (
      req.method === 'POST' ||
      req.method === 'PUT' ||
      req.method === 'PATCH'
    ) &&
    unreceiveMatch
  ) {
    const id =
      Number(
        unreceiveMatch[1]
      );

    try {
      const body =
        await readBody(req);

      const newDueDate =
        clean(
          body.due_date,
          10
        );

      if (
        !validDate(newDueDate)
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Informe uma nova data de recebimento válida.'
          }
        );
      }

      const entry =
        await db
          .prepare(`
            SELECT
              id,
              type,
              name,
              amount,
              created_date,
              due_date,
              paid,
              paid_at,
              rest_day_id,
              recurrence_type,
              series_id,
              installment_number,
              installment_total,
              recurrence_day,
              created_at

            FROM finance_entries

            WHERE
              id = ?
              AND user_id = ?
          `)
          .get(
            id,
            userId
          );

      if (!entry) {
        return sendJson(
          res,
          404,
          {
            error:
              'Ganho não encontrado.'
          }
        );
      }

      if (
        entry.type !== 'income'
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Somente ganhos podem ter o recebimento desfeito.'
          }
        );
      }

      await db
        .prepare(`
          UPDATE finance_entries

          SET
            due_date = ?,
            paid = 0,
            paid_at = NULL

          WHERE
            id = ?
            AND user_id = ?
        `)
        .run(
          newDueDate,
          id,
          userId
        );

      const updatedEntry =
        await db
          .prepare(`
            SELECT
              id,
              type,
              name,
              amount,
              created_date,
              due_date,
              paid,
              paid_at,
              rest_day_id,
              recurrence_type,
              series_id,
              installment_number,
              installment_total,
              recurrence_day,
              created_at

            FROM finance_entries

            WHERE
              id = ?
              AND user_id = ?
          `)
          .get(
            id,
            userId
          );

      console.log(
        'Recebimento desfeito:',
        updatedEntry
      );

      return sendJson(
        res,
        200,
        {
          message:
            'Recebimento desfeito e nova data registrada com sucesso.',

          entry:
            updatedEntry,

          received: false
        }
      );
    } catch (err) {
      console.error(
        'Erro ao desfazer recebimento:',
        err
      );

      return sendJson(
        res,
        500,
        {
          error:
            'Não foi possível desfazer o recebimento.'
        }
      );
    }
  }

  /* =======================================================
     PAGAR DESPESA
  ======================================================= */

  const paymentMatch =
    url.match(
      /^\/api\/finance\/entries\/(\d+)\/pay$/
    );

  if (
    (
      req.method === 'POST' ||
      req.method === 'PUT' ||
      req.method === 'PATCH'
    ) &&
    paymentMatch
  ) {
    const id =
      Number(
        paymentMatch[1]
      );

    try {
      const entry =
        await db
          .prepare(`
            SELECT
              id,
              type,
              name,
              amount,
              created_date,
              due_date,
              paid,
              paid_at,
              rest_day_id,
              recurrence_type,
              series_id

            FROM finance_entries

            WHERE
              id = ?
              AND user_id = ?
          `)
          .get(
            id,
            userId
          );

      if (!entry) {
        return sendJson(
          res,
          404,
          {
            error:
              'Lançamento não encontrado.'
          }
        );
      }

      if (
        entry.type !== 'expense'
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Somente despesas podem ser confirmadas como pagas.'
          }
        );
      }

      if (
        Number(entry.paid) === 1
      ) {
        return sendJson(
          res,
          200,
          {
            message:
              'Esta despesa já está marcada como paga.',
            entry
          }
        );
      }

      const paidAt =
        new Date().toISOString();

      await db
        .prepare(`
          UPDATE finance_entries

          SET
            paid = 1,
            paid_at = ?

          WHERE
            id = ?
            AND user_id = ?
        `)
        .run(
          paidAt,
          id,
          userId
        );

      if (entry.recurrence_type === 'fixed' && entry.series_id) {
        await ensureFixedSeriesHorizon(userId, entry.series_id, getTodayLocal());
      }

      const updatedEntry =
        await db
          .prepare(`
            SELECT
              id,
              type,
              name,
              amount,
              created_date,
              due_date,
              paid,
              paid_at,
              rest_day_id,
              recurrence_type,
              series_id,
              installment_number,
              installment_total,
              recurrence_day,
              created_at

            FROM finance_entries

            WHERE
              id = ?
              AND user_id = ?
          `)
          .get(
            id,
            userId
          );

      console.log(
        'Pagamento confirmado:',
        updatedEntry
      );

      return sendJson(
        res,
        200,
        {
          message:
            'Pagamento confirmado com sucesso.',

          entry:
            updatedEntry,

          paid: true
        }
      );
    } catch (err) {
      console.error(
        'Erro ao confirmar pagamento:',
        err
      );

      return sendJson(
        res,
        500,
        {
          error:
            'Não foi possível confirmar o pagamento.'
        }
      );
    }
  }

  /* =======================================================
     DESFAZER PAGAMENTO
  ======================================================= */

  const unpayMatch =
    url.match(
      /^\/api\/finance\/entries\/(\d+)\/unpay$/
    );

  if (
    (
      req.method === 'POST' ||
      req.method === 'PUT' ||
      req.method === 'PATCH'
    ) &&
    unpayMatch
  ) {
    const id =
      Number(
        unpayMatch[1]
      );

    try {
      const entry =
        await db
          .prepare(`
            SELECT
              id,
              type,
              name,
              amount,
              created_date,
              due_date,
              paid,
              paid_at,
              rest_day_id

            FROM finance_entries

            WHERE
              id = ?
              AND user_id = ?
          `)
          .get(
            id,
            userId
          );

      if (!entry) {
        return sendJson(
          res,
          404,
          {
            error:
              'Lançamento não encontrado.'
          }
        );
      }

      if (
        entry.type !== 'expense'
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Somente despesas podem ter o pagamento desfeito.'
          }
        );
      }

      await db
        .prepare(`
          UPDATE finance_entries

          SET
            paid = 0,
            paid_at = NULL

          WHERE
            id = ?
            AND user_id = ?
        `)
        .run(
          id,
          userId
        );

      const updatedEntry =
        await db
          .prepare(`
            SELECT
              id,
              type,
              name,
              amount,
              created_date,
              due_date,
              paid,
              paid_at,
              rest_day_id,
              recurrence_type,
              series_id,
              installment_number,
              installment_total,
              recurrence_day,
              created_at

            FROM finance_entries

            WHERE
              id = ?
              AND user_id = ?
          `)
          .get(
            id,
            userId
          );

      console.log(
        'Pagamento desfeito:',
        updatedEntry
      );

      return sendJson(
        res,
        200,
        {
          message:
            'Pagamento desfeito com sucesso.',

          entry:
            updatedEntry,

          paid: false
        }
      );
    } catch (err) {
      console.error(
        'Erro ao desfazer pagamento:',
        err
      );

      return sendJson(
        res,
        500,
        {
          error:
            'Não foi possível desfazer o pagamento.'
        }
      );
    }
  }

  /* =======================================================
     EDITAR LANÇAMENTO
  ======================================================= */

  const entryMatch =
    url.match(
      /^\/api\/finance\/entries\/(\d+)$/
    );

  if (
    req.method === 'PUT' &&
    entryMatch
  ) {
    const id =
      Number(
        entryMatch[1]
      );

    try {
      const body =
        await readBody(req);

      const type =
        clean(
          body.type,
          20
        );

      const name =
        clean(
          body.name,
          200
        );

      const amount =
        normalizeAmount(
          body.amount
        );

      const createdDate =
        clean(
          body.created_date,
          10
        );

      const dueDate =
        clean(
          body.due_date,
          10
        );

      if (
        type !== 'income' &&
        type !== 'expense'
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Tipo de lançamento inválido.'
          }
        );
      }

      if (!name) {
        return sendJson(
          res,
          400,
          {
            error:
              'Informe o nome do lançamento.'
          }
        );
      }

      if (
        amount === null
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Informe um valor válido.'
          }
        );
      }

      if (
        !validDate(createdDate) ||
        !validDate(dueDate)
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Informe datas válidas.'
          }
        );
      }

      const existing =
        await db
          .prepare(`
            SELECT
              id,
              paid,
              paid_at,
              rest_day_id

            FROM finance_entries

            WHERE
              id = ?
              AND user_id = ?
          `)
          .get(
            id,
            userId
          );

      if (!existing) {
        return sendJson(
          res,
          404,
          {
            error:
              'Lançamento não encontrado.'
          }
        );
      }

      /*
        Não permitimos transformar uma despesa
        automática de descanso em outro tipo
        de lançamento.
      */

      if (
        existing.rest_day_id !== null &&
        existing.rest_day_id !== undefined
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'A despesa automática de dia de descanso deve ser alterada pelo cadastro do descanso.'
          }
        );
      }

      const result =
        await db
          .prepare(`
            UPDATE finance_entries

            SET
              type = ?,
              name = ?,
              amount = ?,
              created_date = ?,
              due_date = ?

            WHERE
              id = ?
              AND user_id = ?
          `)
          .run(
            type,
            name,
            amount,
            createdDate,
            dueDate,
            id,
            userId
          );

      if (
        Number(
          result.changes || 0
        ) === 0
      ) {
        return sendJson(
          res,
          404,
          {
            error:
              'Lançamento não encontrado.'
          }
        );
      }

      const entry =
        await db
          .prepare(`
            SELECT
              id,
              type,
              name,
              amount,
              created_date,
              due_date,
              paid,
              paid_at,
              rest_day_id,
              recurrence_type,
              series_id,
              installment_number,
              installment_total,
              recurrence_day,
              created_at

            FROM finance_entries

            WHERE
              id = ?
              AND user_id = ?
          `)
          .get(
            id,
            userId
          );

      return sendJson(
        res,
        200,
        {
          message:
            'Lançamento atualizado com sucesso.',

          entry
        }
      );
    } catch (err) {
      console.error(
        'Erro ao editar lançamento:',
        err
      );

      return sendJson(
        res,
        500,
        {
          error:
            'Não foi possível atualizar o lançamento.'
        }
      );
    }
  }

  /* =======================================================
     EXCLUIR LANÇAMENTO E OCORRÊNCIAS FUTURAS
  ======================================================= */

  if (
    req.method === 'DELETE' &&
    entryMatch &&
    parsedUrl.searchParams.get('scope') === 'future'
  ) {
    const id = Number(entryMatch[1]);

    try {
      const existing = await db.prepare(`
        SELECT id, type, due_date, recurrence_type, series_id, rest_day_id
        FROM finance_entries
        WHERE id = ? AND user_id = ?
      `).get(id, userId);

      if (!existing) return sendJson(res, 404, { error: 'Lançamento não encontrado.' });
      if (existing.type !== 'expense' || !['fixed', 'installment'].includes(existing.recurrence_type) || !existing.series_id) {
        return sendJson(res, 400, { error: 'A exclusão das despesas futuras está disponível somente para despesas fixas ou parceladas.' });
      }
      if (existing.rest_day_id !== null && existing.rest_day_id !== undefined) {
        return sendJson(res, 400, { error: 'A despesa automática de dia de descanso deve ser removida pelo cadastro do descanso.' });
      }

      await db.exec('BEGIN');
      try {
        await db.prepare(`UPDATE finance_entries SET recurrence_active = 0 WHERE user_id = ? AND series_id = ?`).run(userId, existing.series_id);
        const result = await db.prepare(`
          DELETE FROM finance_entries
          WHERE user_id = ? AND series_id = ? AND due_date >= ? AND rest_day_id IS NULL
        `).run(userId, existing.series_id, existing.due_date);
        await db.exec('COMMIT');
        return sendJson(res, 200, { message: 'Esta despesa e todas as ocorrências futuras foram excluídas.', deleted: Number(result.changes || 0) });
      } catch (err) {
        await db.exec('ROLLBACK');
        throw err;
      }
    } catch (err) {
      console.error('Erro ao excluir ocorrências futuras:', err);
      return sendJson(res, 500, { error: 'Não foi possível excluir as despesas futuras.' });
    }
  }

  /* =======================================================
     EXCLUIR LANÇAMENTO
  ======================================================= */

  if (
    req.method === 'DELETE' &&
    entryMatch
  ) {
    const id =
      Number(
        entryMatch[1]
      );

    try {
      const existing =
        await db
          .prepare(`
            SELECT
              id,
              rest_day_id

            FROM finance_entries

            WHERE
              id = ?
              AND user_id = ?
          `)
          .get(
            id,
            userId
          );

      if (!existing) {
        return sendJson(
          res,
          404,
          {
            error:
              'Lançamento não encontrado.'
          }
        );
      }

      if (
        existing.rest_day_id !== null &&
        existing.rest_day_id !== undefined
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'A despesa automática de dia de descanso deve ser removida pelo cadastro do descanso.'
          }
        );
      }

      const result =
        await db
          .prepare(`
            DELETE FROM finance_entries

            WHERE
              id = ?
              AND user_id = ?
          `)
          .run(
            id,
            userId
          );

      if (
        Number(
          result.changes || 0
        ) === 0
      ) {
        return sendJson(
          res,
          404,
          {
            error:
              'Lançamento não encontrado.'
          }
        );
      }

      return sendJson(
        res,
        200,
        {
          message:
            'Lançamento excluído com sucesso.'
        }
      );
    } catch (err) {
      console.error(
        'Erro ao excluir lançamento:',
        err
      );

      return sendJson(
        res,
        500,
        {
          error:
            'Não foi possível excluir o lançamento.'
        }
      );
    }
  }

  /* =======================================================
     RESUMO MENSAL
  ======================================================= */

  if (
    req.method === 'GET' &&
    url === '/api/finance/summary'
  ) {
    const month =
      parsedUrl.searchParams.get(
        'month'
      );

    if (
      !validMonth(month)
    ) {
      return sendJson(
        res,
        400,
        {
          error:
            'Mês inválido.'
        }
      );
    }

    await ensureAllFixedSeries(userId);

    const entries =
      await db
        .prepare(`
          SELECT
            id,
            type,
            name,
            amount,
            created_date,
            due_date,
            paid,
            paid_at,
            rest_day_id,
            recurrence_type,
            series_id,
            installment_number,
            installment_total,
            recurrence_day,
            created_at

          FROM finance_entries

          WHERE
            user_id = ?

            AND (
              to_char(due_date, 'YYYY-MM') = ?

              OR (
                recurrence_type = 'single'
                AND to_char(created_date, 'YYYY-MM') = ?
              )
            )

          ORDER BY
            due_date ASC,
            id ASC
        `)
        .all(
          userId,
          month,
          month
        );

    const totals =
      await db
        .prepare(`
          SELECT

            COALESCE(
              SUM(
                CASE
                  WHEN type = 'income'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS income,

            COALESCE(
              SUM(
                CASE
                  WHEN type = 'expense'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS expense,

            COALESCE(
              SUM(
                CASE
                  WHEN
                    type = 'expense'
                    AND paid = 1
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS paidExpense,

            COALESCE(
              SUM(
                CASE
                  WHEN
                    type = 'expense'
                    AND paid = 0
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS pendingExpense

          FROM finance_entries

          WHERE
            user_id = ?

            AND to_char(due_date, 'YYYY-MM') = ?
        `)
        .get(
          userId,
          month
        );

    const restDays =
      await db
        .prepare(`
          SELECT
            id,
            rest_date,
            amount,
            created_at

          FROM rest_days

          WHERE
            user_id = ?

            AND to_char(rest_date, 'YYYY-MM') = ?

          ORDER BY
            rest_date ASC
        `)
        .all(
          userId,
          month
        );

    const restSet =
      new Set(
        restDays.map(
          (item) =>
            item.rest_date
        )
      );

    const [
      year,
      monthNumber
    ] =
      month
        .split('-')
        .map(Number);

    const calendarDays =
      createWorkingDays(
        year,
        monthNumber,
        restSet
      );

    const workingDays =
      calendarDays.filter(
        (day) =>
          day.isWorkingDay
      );

    const goalEntries = await db.prepare(`
      SELECT id, type, name, amount, created_date, due_date, paid, paid_at,
             recurrence_type, series_id, installment_number, installment_total, recurrence_day
      FROM finance_entries
      WHERE user_id = ?
      ORDER BY due_date ASC, id ASC
    `).all(userId);

    const goalRestRows = await db.prepare(`
      SELECT rest_date FROM rest_days
      WHERE user_id = ?
    `).all(userId);
    const goalRestSet = new Set(goalRestRows.map((row) => row.rest_date));

    const incomeDistribution =
      {};

    const expenseDistribution =
      {};

    entries.forEach(
      (entry) => {
        if (
          entry.type ===
          'income'
        ) {
          mergeDistribution(
            incomeDistribution,
            calculateIncomeDistribution(
              entry,
              workingDays
            )
          );
        }

        if (
          entry.type ===
          'expense'
        ) {
          mergeDistribution(
            expenseDistribution,
            calculateExpenseDistribution(
              entry,
              workingDays
            )
          );
        }
      }
    );

    const dailyData =
      calendarDays.map(
        (day) => {
          const income =
            safeNumber(
              incomeDistribution[
                day.date
              ]
            );

          const expense =
            safeNumber(
              expenseDistribution[
                day.date
              ]
            );

          const cashflow =
            income -
            expense;

          return {
            day: day.day,
            date: day.date,
            income,
            expense,
            cashflow,
            isWorkingDay:
              day.isWorkingDay,
            isWeekend:
              day.isWeekend,
            isRestDay:
              day.isRestDay
          };
        }
      );

    const today =
      getTodayLocal();

    const dailyGoal =
      calculateDailyGoal(
        dailyData,
        goalEntries,
        workingDays,
        today,
        goalRestSet
      );

    const income =
      safeNumber(
        totals?.income
      );

    const expense =
      safeNumber(
        totals?.expense
      );

    const paidExpense =
      safeNumber(
        totals?.paidExpense
      );

    const pendingExpense =
      safeNumber(
        totals?.pendingExpense
      );

    const cashflow =
      income -
      expense;

    const realizedIncome =
      entries.reduce(
        (
          total,
          entry
        ) => {
          if (
            entry.type !==
            'income' ||
            Number(entry.paid) !== 1
          ) {
            return total;
          }

          return (
            total +
            safeNumber(
              entry.amount
            )
          );
        },
        0
      );

    const availableBalance =
      Math.max(
        0,
        realizedIncome -
          paidExpense
      );

    return sendJson(
      res,
      200,
      {
        month,

        totals: {
          income,
          expense,
          cashflow,
          dailyGoal,

          workingDays:
            workingDays.length,

          today,

          tomorrow:
            addDays(
              today,
              1
            ),

          paidExpense,
          pendingExpense,
          realizedIncome,
          availableBalance
        },

        data:
          dailyData,

        entries,

        restDays
      }
    );
  }

  /* =======================================================
     LISTAR DIAS DE DESCANSO
  ======================================================= */

  if (
    req.method === 'GET' &&
    url === '/api/finance/rest-days'
  ) {
    const month =
      parsedUrl.searchParams.get(
        'month'
      );

    if (
      !validMonth(month)
    ) {
      return sendJson(
        res,
        400,
        {
          error:
            'Mês inválido.'
        }
      );
    }

    const restDays =
      await db
        .prepare(`
          SELECT
            id,
            rest_date,
            amount,
            created_at

          FROM rest_days

          WHERE
            user_id = ?

            AND to_char(rest_date, 'YYYY-MM') = ?

          ORDER BY
            rest_date ASC
        `)
        .all(
          userId,
          month
        );

    return sendJson(
      res,
      200,
      {
        month,
        restDays
      }
    );
  }

  /* =======================================================
     CADASTRAR DIA DE DESCANSO
  ======================================================= */

  if (
    req.method === 'POST' &&
    url === '/api/finance/rest-days'
  ) {
    try {
      const body =
        await readBody(req);

      const restDate =
        clean(
          body.rest_date,
          10
        );

      const amount =
        normalizeAmount(
          body.amount
        ) || 0;

      if (
        !validDate(restDate)
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Informe uma data válida.'
          }
        );
      }

      if (
        !Number.isFinite(
          amount
        ) ||
        amount < 0
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              'Informe um valor válido.'
          }
        );
      }

      const existing =
        await db
          .prepare(`
            SELECT
              id

            FROM rest_days

            WHERE
              user_id = ?
              AND rest_date = ?
          `)
          .get(
            userId,
            restDate
          );

      if (existing) {
        return sendJson(
          res,
          409,
          {
            error:
              'Este dia de descanso já está cadastrado.'
          }
        );
      }

      const createdDate =
        getTodayLocal();

      /*
        =====================================================
        TRANSAÇÃO

        O descanso e sua despesa automática precisam
        ser criados juntos.
      =====================================================
      */

      await db.exec('BEGIN');

      try {
        const result =
          db
            .prepare(`
              INSERT INTO rest_days
              (
                user_id,
                rest_date,
                amount
              )
              VALUES (?, ?, ?)
            `)
            .run(
              userId,
              restDate,
              amount
            );

        const restDayId =
          Number(
            result.lastInsertRowid
          );

        const restDay =
          db
            .prepare(`
              SELECT
                id,
                rest_date,
                amount,
                created_at

              FROM rest_days

              WHERE
                id = ?
                AND user_id = ?
            `)
            .get(
              restDayId,
              userId
            );

        let generatedExpense =
          null;

        if (
          amount > 0
        ) {
          const expenseResult =
            db
              .prepare(`
                INSERT INTO finance_entries
                (
                  user_id,
                  type,
                  name,
                  amount,
                  created_date,
                  due_date,
                  paid,
                  paid_at,
                  rest_day_id
                )
                VALUES (
                  ?,
                  'expense',
                  ?,
                  ?,
                  ?,
                  ?,
                  0,
                  NULL,
                  ?
                )
              `)
              .run(
                userId,
                `Dia de descanso - ${restDate}`,
                amount,
                createdDate,
                restDate,
                restDayId
              );

          generatedExpense =
            db
              .prepare(`
                SELECT
                  id,
                  type,
                  name,
                  amount,
                  created_date,
                  due_date,
                  paid,
                  paid_at,
                  rest_day_id,
                  created_at

                FROM finance_entries

                WHERE
                  id = ?
                  AND user_id = ?
              `)
              .get(
                Number(
                  expenseResult.lastInsertRowid
                ),
                userId
              );
        }

        await db.exec('COMMIT');

        console.log(
          'Dia de descanso cadastrado:',
          restDay
        );

        if (
          generatedExpense
        ) {
          console.log(
            'Despesa automática criada:',
            generatedExpense
          );
        }

        return sendJson(
          res,
          201,
          {
            message:
              amount > 0
                ? 'Dia de descanso cadastrado e despesa criada automaticamente.'
                : 'Dia de descanso cadastrado com sucesso.',

            restDay,

            generatedExpense
          }
        );
      } catch (transactionError) {
        await db.exec('ROLLBACK');

        throw transactionError;
      }
    } catch (err) {
      console.error(
        'Erro ao cadastrar descanso:',
        err
      );

      return sendJson(
        res,
        500,
        {
          error:
            'Não foi possível cadastrar o dia de descanso.'
        }
      );
    }
  }

  /* =======================================================
     EXCLUIR DIA DE DESCANSO
  ======================================================= */

  const restMatch =
    url.match(
      /^\/api\/finance\/rest-days\/(\d+)$/
    );

  if (
    req.method === 'DELETE' &&
    restMatch
  ) {
    const id =
      Number(
        restMatch[1]
      );

    try {
      const restDay =
        await db
          .prepare(`
            SELECT
              id,
              rest_date,
              amount

            FROM rest_days

            WHERE
              id = ?
              AND user_id = ?
          `)
          .get(
            id,
            userId
          );

      if (!restDay) {
        return sendJson(
          res,
          404,
          {
            error:
              'Dia de descanso não encontrado.'
          }
        );
      }

      /*
        =====================================================
        TRANSAÇÃO

        Primeiro removemos a despesa vinculada
        exatamente ao rest_day_id.

        Isso impede que uma despesa manual
        seja apagada por engano.
      =====================================================
      */

      await db.exec('BEGIN');

      try {
        await db
          .prepare(`
            DELETE FROM finance_entries

            WHERE
              user_id = ?
              AND rest_day_id = ?
          `)
          .run(
            userId,
            id
          );

        const result =
          db
            .prepare(`
              DELETE FROM rest_days

              WHERE
                id = ?
                AND user_id = ?
            `)
            .run(
              id,
              userId
            );

        if (
          Number(
            result.changes || 0
          ) === 0
        ) {
          await db.exec('ROLLBACK');

          return sendJson(
            res,
            404,
            {
              error:
                'Dia de descanso não encontrado.'
            }
          );
        }

        await db.exec('COMMIT');

        console.log(
          'Dia de descanso excluído:',
          restDay.rest_date
        );

        return sendJson(
          res,
          200,
          {
            message:
              'Dia de descanso e despesa automática excluídos com sucesso.'
          }
        );
      } catch (transactionError) {
        await db.exec('ROLLBACK');

        throw transactionError;
      }
    } catch (err) {
      console.error(
        'Erro ao excluir descanso:',
        err
      );

      return sendJson(
        res,
        500,
        {
          error:
            'Não foi possível excluir o dia de descanso.'
        }
      );
    }
  }

  return false;
}

/* =========================================================
   PROTEÇÃO DE ORIGEM / CSRF
========================================================= */

function isSameOriginRequest(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;

  const host = String(req.headers.host || '').trim();
  if (!host) return false;

  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.host === host;
  } catch {
    return false;
  }
}

function requireSameOrigin(req, res) {
  if (isSameOriginRequest(req)) return true;

  sendJson(res, 403, {
    error: 'Origem da requisição não autorizada.'
  });
  return false;
}

function isStateChangingMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());
}

/* =========================================================
   API PRINCIPAL
========================================================= */

async function handleApi(
  req,
  res,
  parsedUrl
) {
  const url =
    parsedUrl.pathname;

  if (isStateChangingMethod(req.method) && !requireSameOrigin(req, res)) {
    return;
  }

  if (
    url.startsWith(
      '/api/auth/'
    )
  ) {
    const result =
      await handleAuthApi(
        req,
        res,
        url
      );

    if (
      result !== false
    ) {
      return;
    }
  }

  if (url === '/api/profile') {
    const result = await handleProfileApi(req, res, url);
    if (result !== false) return;
  }

  if (url === '/api/services' || url.startsWith('/api/services/')) {
    const result = await handleServicesApi(req, res, url);
    if (result !== false) return;
  }

  if (
    url.startsWith(
      '/api/admin/'
    )
  ) {
    const result =
      await handleAdminApi(
        req,
        res,
        url,
        parsedUrl
      );

    if (result !== false) {
      return;
    }
  }

  if (
    url.startsWith(
      '/api/finance/'
    )
  ) {
    const result =
      await handleFinanceApi(
        req,
        res,
        url,
        parsedUrl
      );

    if (
      result !== false
    ) {
      return;
    }
  }

  return sendJson(
    res,
    404,
    {
      error:
        'Rota não encontrada.'
    }
  );
}

/* =========================================================
   ARQUIVOS ESTÁTICOS
========================================================= */

function serveStatic(
  req,
  res,
  url
) {
  let pathname;

  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendJson(res, 400, { error: 'Caminho inválido.' });
  }

  if (pathname === '/') pathname = '/index.html';

  // Nunca exponha arquivos internos, ocultos, bancos, logs ou configuração.
  const normalized = pathname.replace(/\\/g, '/');
  const relative = normalized.replace(/^\/+/, '');

  if (
    !relative ||
    relative.includes('..') ||
    relative.split('/').some((part) => part.startsWith('.')) ||
    /(^|\/)(node_modules|\.git)(\/|$)/i.test(relative) ||
    /(?:^|\/)(?:\.env(?:\..*)?|package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|server[^/]*\.js|rota_financeira\.sqlite(?:-[^/]*)?|.*\.(?:sqlite|sqlite3|db|db3|wal|shm|log|bak|backup|pem|key|crt))$/i.test(relative)
  ) {
    return sendJson(res, 404, { error: 'Página não encontrada.' });
  }

  const file = path.resolve(PUBLIC_ROOT, relative);
  const root = path.resolve(PUBLIC_ROOT);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;

  if (file !== root && !file.startsWith(prefix)) {
    return sendJson(res, 403, { error: 'Acesso negado.' });
  }

  const ext = path.extname(file).toLowerCase();
  const allowedTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf'
  };

  if (!Object.prototype.hasOwnProperty.call(allowedTypes, ext)) {
    return sendJson(res, 404, { error: 'Página não encontrada.' });
  }

  const headers = {
    'Content-Type': allowedTypes[ext],
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600'
  };

  if (IS_PRODUCTION) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, headers);
      return res.end('<h1>404</h1><p>Página não encontrada.</p>');
    }

    if (ext === '.html') {
      fs.readFile(file, 'utf8', (readErr, html) => {
        if (readErr) {
          res.writeHead(500, headers);
          return res.end('<h1>500</h1><p>Não foi possível carregar a página.</p>');
        }

        const adminVisibilityScript = `
<script data-rota-admin-visibility>
(async function(){
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const d = await r.json().catch(() => ({}));
    const isAdmin = !!(d && d.authenticated && d.user && d.user.role === 'admin');
    document.querySelectorAll('a,button,[role="button"]').forEach(function(el){
      const href = String(el.getAttribute('href') || '').toLowerCase();
      const text = String(el.textContent || '').trim().toLowerCase();
      const adminItem =
        href.includes('/admin.html') ||
        href === '/admin' ||
        text.includes('área do administrador') ||
        text.includes('área administrativa') ||
        text === 'administrador';
      if (adminItem) el.style.display = isAdmin ? '' : 'none';
    });
  } catch (_) {}
})();
</script>
<script data-rota-finance-reminders>
(async function(){
  try {
      // O lembrete financeiro só pode ser executado no Dashboard.
    if (window.location.pathname !== '/dashboard.html') return;
    
    const auth = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const session = await auth.json().catch(() => ({}));
    if (!session || !session.authenticated || !session.user) return;

    // O aviso só pode aparecer uma vez após um novo login.
    if (sessionStorage.getItem('rotaShowFinanceReminder') !== '1') return;

    // Consome a autorização para impedir que apareça novamente
    // ao navegar entre dashboard, planejamento, perfil ou serviços.
    sessionStorage.removeItem('rotaShowFinanceReminder');

    const response = await fetch('/api/finance/reminders', { credentials: 'same-origin' });
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    if (!data.hasReminders) return;

    const existing = document.getElementById('rotaFinanceReminder');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'rotaFinanceReminder';
    overlay.style.cssText = ['position:fixed','inset:0','z-index:99999','display:flex','align-items:center','justify-content:center','padding:20px','background:rgba(0,0,0,.58)','box-sizing:border-box'].join(';');

    const box = document.createElement('div');
    box.style.cssText = ['width:min(520px,100%)','background:#fff','border-radius:16px','padding:26px','box-sizing:border-box','box-shadow:0 20px 60px rgba(0,0,0,.25)','font-family:Arial,sans-serif','color:#172033','position:relative'].join(';');

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Fechar');
    close.style.cssText = 'position:absolute;right:14px;top:10px;border:0;background:transparent;font-size:28px;cursor:pointer;color:#667085;line-height:1';
    close.addEventListener('click', function(){ overlay.remove(); });

    const title = document.createElement('div');
    title.textContent = 'Atenção ao seu planejamento';
    title.style.cssText = 'font-size:20px;font-weight:700;margin:0 32px 10px 0';

    const intro = document.createElement('p');
    intro.textContent = 'Você tem lançamentos que precisam ser confirmados ou atualizados:';
    intro.style.cssText = 'margin:0 0 16px;color:#667085;line-height:1.5';

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-bottom:18px';

    function addGroup(label, items) {
      if (!items || !items.length) return;
      const group = document.createElement('div');
      group.style.cssText = 'padding:12px 14px;border-radius:10px;background:#f7f8fa';
      const heading = document.createElement('strong');
      heading.textContent = label;
      heading.style.cssText = 'display:block;margin-bottom:6px';
      group.appendChild(heading);
      items.forEach(function(item){
        const row = document.createElement('div');
        const date = String(item.due_date || '');
        const amount = Number(item.amount || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
        row.textContent = item.name + ' — ' + amount + (date === data.today ? ' — vence hoje' : ' — vencido');
        row.style.cssText = 'font-size:14px;line-height:1.45;margin-top:5px;color:#344054';
        group.appendChild(row);
      });
      list.appendChild(group);
    }

    addGroup('Ganhos', data.income);
    addGroup('Despesas', data.expense);

    const note = document.createElement('p');
    note.textContent = 'Acesse “Meu planejamento” para confirmar o recebimento/pagamento ou editar a informação. Esta mensagem é apenas um lembrete e não bloqueia a plataforma.';
    note.style.cssText = 'margin:0;color:#667085;font-size:13px;line-height:1.5';

    box.appendChild(close);
    box.appendChild(title);
    box.appendChild(intro);
    box.appendChild(list);
    box.appendChild(note);
    overlay.appendChild(box);
    overlay.addEventListener('click', function(event){ if (event.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  } catch (_) {}
})();
</script>`;

let scriptToInject = adminVisibilityScript;

// O lembrete financeiro só deve existir no Dashboard.
// Nas demais páginas, removemos apenas o bloco do lembrete,
// mantendo normalmente o controle de visibilidade do administrador.
if (pathname !== '/dashboard.html') {
  scriptToInject = scriptToInject.replace(
    /<script data-rota-finance-reminders>[\s\S]*?<\/script>/,
    ''
  );
}

const output = html.includes('</body>')
  ? html.replace('</body>', scriptToInject + '\n</body>')
  : html + scriptToInject;

res.writeHead(200, headers);
res.end(output);
      });
      return;
    }

    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}

/* =========================================================
   SERVIDOR
========================================================= */

const server =
  http.createServer(
    async (
      req,
      res
    ) => {
      try {
        const parsedUrl =
          new URL(
            req.url,
            `http://${
              req.headers.host ||
              'localhost'
            }`
          );

        if (
          parsedUrl.pathname.startsWith(
            '/api/'
          )
        ) {
          return await handleApi(
            req,
            res,
            parsedUrl
          );
        }

        return serveStatic(
          req,
          res,
          parsedUrl
        );
      } catch (err) {
        console.error(
          'Erro interno:',
          err
        );

        if (
          !res.headersSent
        ) {
          sendJson(
            res,
            500,
            {
              error:
                'Erro interno do servidor.'
            }
          );
        }
      }
    }
  );

initializeDatabase()
  .then(() => {
    server.listen(
      PORT,
      () => {
        console.log(
          `Rota Financeira rodando em http://localhost:${PORT}`
        );
      }
    );
  })
  .catch((err) => {
    console.error('Falha ao inicializar o PostgreSQL:', err);
    process.exit(1);
  });
