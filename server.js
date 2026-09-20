const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  'TROQUE-ESTE-SEGREDO-ANTES-DE-PUBLICAR';

const IS_PRODUCTION =
  process.env.NODE_ENV === 'production';

const COOKIE_NAME = 'rota_session';
const SESSION_DAYS = 7;

// E-mail autorizado a acessar a área administrativa.
// Defina ADMIN_EMAIL no ambiente de produção.
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();

/* =========================================================
   SEGURANÇA
========================================================= */

if (
  SESSION_SECRET ===
    'TROQUE-ESTE-SEGREDO-ANTES-DE-PUBLICAR' &&
  IS_PRODUCTION
) {
  console.error(
    'Defina SESSION_SECRET antes de colocar o site em produção.'
  );

  process.exit(1);
}

/* =========================================================
   BANCO DE DADOS
========================================================= */

const db = new DatabaseSync(
  path.join(ROOT, 'rota_financeira.sqlite')
);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'client' CHECK(role IN ('client', 'admin')),
    billing_status TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token
  ON sessions(token_hash);

  CREATE TABLE IF NOT EXISTS finance_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,

    type TEXT NOT NULL
      CHECK(type IN ('income', 'expense')),

    name TEXT NOT NULL,

    amount REAL NOT NULL
      CHECK(amount > 0),

    created_date TEXT NOT NULL,
    due_date TEXT NOT NULL,

    paid INTEGER NOT NULL DEFAULT 0
      CHECK(paid IN (0, 1)),

    paid_at TEXT,

    created_at TEXT NOT NULL
      DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_finance_entries_user
  ON finance_entries(user_id);

  CREATE INDEX IF NOT EXISTS idx_finance_entries_due_date
  ON finance_entries(due_date);

  CREATE TABLE IF NOT EXISTS rest_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    rest_date TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL
      DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

    UNIQUE(user_id, rest_date)
  );

  CREATE INDEX IF NOT EXISTS idx_rest_days_user
  ON rest_days(user_id);

  CREATE INDEX IF NOT EXISTS idx_rest_days_date
  ON rest_days(rest_date);
`);

/* =========================================================
   MIGRAÇÃO DO BANCO EXISTENTE
========================================================= */

function ensureColumn(
  table,
  column,
  definition
) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all();

  const exists = columns.some(
    (item) => item.name === column
  );

  if (!exists) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );

    console.log(
      `Coluna adicionada: ${table}.${column}`
    );
  }
}

ensureColumn(
  'finance_entries',
  'paid',
  'INTEGER NOT NULL DEFAULT 0'
);

ensureColumn(
  'finance_entries',
  'paid_at',
  'TEXT'
);

ensureColumn(
  'users',
  'role',
  "TEXT NOT NULL DEFAULT 'client'"
);

ensureColumn(
  'users',
  'billing_status',
  'TEXT'
);

ensureColumn(
  'users',
  'last_login_at',
  'TEXT'
);

// O administrador é definido exclusivamente pelo ambiente.
// Isso evita que um cliente consiga escolher o próprio nível de acesso.
if (ADMIN_EMAIL) {
  db.prepare(
    "UPDATE users SET role = CASE WHEN lower(email) = ? THEN 'admin' ELSE role END"
  ).run(ADMIN_EMAIL);
}

/*
  Nova coluna para identificar de forma segura
  a despesa criada automaticamente por um dia
  de descanso.
*/
ensureColumn(
  'finance_entries',
  'rest_day_id',
  'INTEGER'
);

/*
  Recorrência/parcelamento. As colunas são opcionais para preservar
  integralmente os lançamentos antigos.
*/
ensureColumn(
  'finance_entries',
  'recurrence_type',
  "TEXT NOT NULL DEFAULT 'single'"
);

ensureColumn(
  'finance_entries',
  'series_id',
  'TEXT'
);

ensureColumn(
  'finance_entries',
  'installment_number',
  'INTEGER'
);

ensureColumn(
  'finance_entries',
  'installment_total',
  'INTEGER'
);

ensureColumn(
  'finance_entries',
  'recurrence_day',
  'INTEGER'
);

ensureColumn(
  'finance_entries',
  'recurrence_active',
  'INTEGER NOT NULL DEFAULT 1'
);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_finance_entries_paid
  ON finance_entries(paid);

  CREATE INDEX IF NOT EXISTS idx_finance_entries_rest_day
  ON finance_entries(rest_day_id);

  CREATE INDEX IF NOT EXISTS idx_finance_entries_series
  ON finance_entries(series_id);

  CREATE INDEX IF NOT EXISTS idx_finance_entries_recurrence
  ON finance_entries(recurrence_type);
`);

db.prepare(`
  UPDATE finance_entries
  SET paid = 0
  WHERE paid IS NULL
`).run();

db.prepare(
  'DELETE FROM sessions WHERE expires_at <= ?'
).run(Date.now());

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
  const { client, period, totals, entries, restDays, monthly } = report;
  const pages = [];

  const esc = (value) => pdfSafe(pdfAscii(value));
  const money = (value) => pdfMoney(value);
  const statusMap = { free: 'Free', trial: 'Trial', pagante: 'Pagante', inadimplente: 'Inadimplente', cancelado: 'Cancelado', admin: 'Administrador' };
  const status = statusMap[publicClientStatus(client).status] || publicClientStatus(client).status;
  const performance = Number(totals.cashflow) >= 0 ? 'POSITIVO' : 'NEGATIVO';

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

  function wrapped(c, x, y, value, maxChars, size = 8.5, leading = 12, bold = false) {
    const lines = pdfWrap(value, maxChars);
    lines.forEach((lineText, index) => text(c, x, y - index * leading, lineText, size, bold));
    return y - lines.length * leading;
  }

  function header(c, pageNumber) {
    rect(c, 0, 790, 595, 52, 0.07, 0.10, 0.15);
    text(c, 38, 815, 'ROTA FINANCEIRA', 15, true, 1, 1, 1);
    text(c, 38, 798, 'RELATORIO EXECUTIVO DO CLIENTE', 8, false, 0.75, 0.80, 0.86);
    text(c, 520, 814, String(pageNumber).padStart(2, '0'), 9, true, 0.85, 0.88, 0.92);
  }

  function footer(c) {
    line(c, 38, 32, 557, 32, 0.85, 0.86, 0.89);
    text(c, 38, 19, 'Documento gerencial · ROTA FINANCEIRA', 7, false, 0.45, 0.48, 0.53);
    text(c, 405, 19, `Gerado em ${new Date(report.generated_at || Date.now()).toLocaleDateString('pt-BR')}`, 7, false, 0.45, 0.48, 0.53);
  }

  // Página 1 — visão executiva
  let c = newPage();
  header(c, 1);
  text(c, 38, 758, client.name || 'Cliente', 20, true);
  text(c, 38, 742, client.email || '—', 9, false, 0.40, 0.43, 0.48);
  text(c, 38, 728, `Telefone: ${client.phone || '—'}`, 8.5, false, 0.40, 0.43, 0.48);
  text(c, 38, 714, `Cadastro: ${pdfDate(client.created_at)}`, 8.5, false, 0.40, 0.43, 0.48);
  text(c, 435, 742, `Status: ${status}`, 8.5, true, 0.20, 0.40, 0.55);
  text(c, 435, 728, `Resultado: ${performance}`, 8.5, true, performance === 'POSITIVO' ? 0.08 : 0.65, performance === 'POSITIVO' ? 0.45 : 0.16, performance === 'POSITIVO' ? 0.28 : 0.12);
  text(c, 435, 714, `Periodo: ${pdfDate(period.start)} a ${pdfDate(period.end)}`, 8.0, false, 0.40, 0.43, 0.48);

  text(c, 38, 698, 'RESUMO FINANCEIRO', 10, true);
  line(c, 38, 688, 557, 688, 0.80, 0.82, 0.86);

  const cards = [
    ['Ganhos', money(totals.income)],
    ['Gastos', money(totals.expense)],
    ['Fluxo de caixa', money(totals.cashflow)],
    ['Fluxo confirmado', money(totals.confirmedCashflow)]
  ];
  cards.forEach((item, i) => {
    const x = 38 + i * 130;
    rect(c, x, 615, 118, 56, 0.96, 0.97, 0.98);
    text(c, x + 9, 654, item[0], 7.5, false, 0.40, 0.43, 0.48);
    text(c, x + 9, 635, item[1], 11, true, 0.10, 0.14, 0.20);
  });

  const second = [
    ['Ganhos confirmados', money(totals.paidIncome)],
    ['Gastos pagos', money(totals.paidExpense)],
    ['Gastos pendentes', money(totals.pendingExpense)],
    ['Movimentacoes', String(entries.length)]
  ];
  second.forEach((item, i) => {
    const x = 38 + i * 130;
    rect(c, x, 548, 118, 50, 1, 1, 1);
    line(c, x, 548, x + 118, 548, 0.88, 0.89, 0.92);
    text(c, x + 9, 578, item[0], 7.2, false, 0.45, 0.48, 0.53);
    text(c, x + 9, 559, item[1], 10, true);
  });

  text(c, 38, 514, 'RESUMO MES A MES', 10, true);
  line(c, 38, 504, 557, 504, 0.80, 0.82, 0.86);
  rect(c, 38, 478, 519, 22, 0.09, 0.12, 0.18);
  text(c, 48, 486, 'MES', 7.5, true, 1, 1, 1);
  text(c, 220, 486, 'GANHOS', 7.5, true, 1, 1, 1);
  text(c, 330, 486, 'GASTOS', 7.5, true, 1, 1, 1);
  text(c, 440, 486, 'FLUXO DE CAIXA', 7.5, true, 1, 1, 1);
  let y = 462;
  for (const item of monthly) {
    text(c, 48, y, pdfMonth(item.month), 8.2, false);
    text(c, 220, y, money(item.income), 8.2, false);
    text(c, 330, y, money(item.expense), 8.2, false);
    text(c, 440, y, money(item.cashflow), 8.2, true, item.cashflow >= 0 ? 0.08 : 0.65, item.cashflow >= 0 ? 0.45 : 0.16, item.cashflow >= 0 ? 0.28 : 0.12);
    line(c, 38, y - 8, 557, y - 8, 0.92, 0.93, 0.95);
    y -= 22;
    if (y < 120) break;
  }
  if (!monthly.length) text(c, 48, 462, 'Nenhum mes disponivel no periodo de cadastro.', 8.5, false, 0.45, 0.48, 0.53);

  text(c, 38, 92, 'Leitura executiva', 9, true);
  wrapped(c, 38, 78, `Resultado financeiro acumulado no periodo: ${performance}. O fluxo de caixa corresponde aos ganhos menos os gastos registrados. O relatorio considera somente a janela entre o cadastro do cliente e a data atual.`, 108, 7.8, 11, false);
  footer(c);

  // Páginas de movimentações
  const movementLines = [];
  for (const entry of entries) {
    const type = entry.type === 'income' ? 'ENTRADA' : 'SAIDA';
    const state = Number(entry.paid) === 1 ? 'CONFIRMADO' : (entry.type === 'income' ? 'PENDENTE' : 'NAO PAGO');
    movementLines.push({
      title: `${pdfDate(entry.due_date)} · ${type} · ${money(entry.amount)} · ${state}`,
      desc: `Descricao: ${entry.name || '—'}`,
      meta: `Cadastro: ${pdfDate(entry.created_date)} · Confirmacao: ${pdfDate(entry.paid_at)}`
    });
  }

  if (movementLines.length) {
    let index = 0;
    while (index < movementLines.length) {
      c = newPage();
      header(c, pages.length);
      text(c, 38, 758, 'TODAS AS MOVIMENTACOES', 14, true);
      text(c, 38, 742, 'Entradas e saidas registradas dentro da janela de cadastro.', 8.5, false, 0.42, 0.45, 0.50);
      let yy = 710;
      let count = 0;
      while (index < movementLines.length && count < 13) {
        const item = movementLines[index++];
        text(c, 42, yy, item.title, 8.5, true);
        yy -= 14;
        yy = wrapped(c, 42, yy, item.desc, 92, 7.8, 10, false);
        text(c, 42, yy, item.meta, 7.3, false, 0.48, 0.51, 0.56);
        yy -= 16;
        line(c, 42, yy, 553, yy, 0.90, 0.91, 0.94);
        yy -= 16;
        count++;
      }
      footer(c);
    }
  } else {
    c = newPage();
    header(c, pages.length);
    text(c, 38, 758, 'MOVIMENTACOES', 14, true);
    text(c, 38, 730, 'Nenhuma movimentacao foi registrada para este cliente no periodo analisado.', 9, false, 0.42, 0.45, 0.50);
    footer(c);
  }

  // Dias de descanso — última seção, somente quando houver registros.
  if (restDays.length) {
    c = newPage();
    header(c, pages.length);
    text(c, 38, 758, 'DIAS DE DESCANSO', 14, true);
    text(c, 38, 742, 'Registros associados ao planejamento financeiro.', 8.5, false, 0.42, 0.45, 0.50);
    let yy = 710;
    for (const day of restDays.slice(0, 24)) {
      text(c, 48, yy, pdfDate(day.rest_date), 8.5, true);
      text(c, 250, yy, `Valor associado: ${money(day.amount)}`, 8.5, false);
      line(c, 42, yy - 10, 553, yy - 10, 0.90, 0.91, 0.94);
      yy -= 25;
    }
    footer(c);
  }

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

function getCurrentUser(req) {
  const token =
    parseCookies(req)[
      COOKIE_NAME
    ];

  if (!token) {
    return null;
  }

  const row = db
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
    db.prepare(
      "UPDATE users SET role = 'admin' WHERE id = ?"
    ).run(row.id);
    row.role = 'admin';
  }

  return row;
}

function requireUser(
  req,
  res
) {
  const user =
    getCurrentUser(req);

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
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    sendJson(res, 403, {
      authenticated: false,
      cancelled: true,
      error: 'Seu período de acesso gratuito terminou. Atualize seu pagamento para continuar utilizando a plataforma.'
    }, { 'Set-Cookie': cookieHeader('', 0) });
    return null;
  }

  return user;
}

function requireAdmin(
  req,
  res
) {
  const user = getCurrentUser(req);

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
        db
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
        db
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

      db.prepare(`
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
        db
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

      db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);

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

      db.prepare(`
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
      getCurrentUser(req);

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
      db.prepare(
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

function ensureFixedSeriesHorizon(userId, seriesId, fromDate = getTodayLocal()) {
  if (!seriesId) return 0;

  const series = db.prepare(`
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

    const exists = db.prepare(`
      SELECT id FROM finance_entries
      WHERE user_id = ? AND series_id = ? AND due_date = ?
      LIMIT 1
    `).get(userId, seriesId, next);

    if (!exists) {
      db.prepare(`
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

function ensureAllFixedSeries(userId) {
  const rows = db.prepare(`
    SELECT DISTINCT series_id
    FROM finance_entries
    WHERE user_id = ? AND recurrence_type = 'fixed' AND series_id IS NOT NULL
      AND COALESCE(recurrence_active, 1) = 1
  `).all(userId);

  let created = 0;
  for (const row of rows) {
    created += ensureFixedSeriesHorizon(userId, row.series_id);
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

    if (entry.type === 'income') {
      const reached = compareDates(entry.due_date, currentDate) <= 0;
      const futureConfirmed =
        compareDates(entry.due_date, currentDate) > 0 &&
        Number(entry.paid) === 1;

      if (reached || futureConfirmed) {
        realizedIncome += amount;
      }
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

    if (entry.type === 'income') {
      const reached = compareDates(entry.due_date, today) <= 0;
      const futureConfirmed =
        compareDates(entry.due_date, today) > 0 && Number(entry.paid) === 1;
      if (reached || futureConfirmed) realizedIncome += amount;
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

function buildAdminClientSummary(userId, month) {
  const entries = db.prepare(`
    SELECT
      id, type, name, amount, created_date, due_date,
      paid, paid_at, rest_day_id, created_at
    FROM finance_entries
    WHERE user_id = ?
      AND (substr(due_date, 1, 7) = ? OR (recurrence_type = 'single' AND substr(created_date, 1, 7) = ?))
    ORDER BY due_date ASC, id ASC
  `).all(userId, month, month);

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
      COALESCE(SUM(CASE WHEN type = 'expense' AND paid = 1 THEN amount ELSE 0 END), 0) AS paidExpense,
      COALESCE(SUM(CASE WHEN type = 'expense' AND paid = 0 THEN amount ELSE 0 END), 0) AS pendingExpense
    FROM finance_entries
    WHERE user_id = ? AND substr(due_date, 1, 7) = ?
  `).get(userId, month);

  const restDays = db.prepare(`
    SELECT id, rest_date, amount, created_at
    FROM rest_days
    WHERE user_id = ? AND substr(rest_date, 1, 7) = ?
    ORDER BY rest_date ASC
  `).all(userId, month);

  const restSet = new Set(restDays.map((item) => item.rest_date));
  const [year, monthNumber] = month.split('-').map(Number);
  const calendarDays = createWorkingDays(year, monthNumber, restSet);
  const workingDays = calendarDays.filter((day) => day.isWorkingDay);

  const incomeDistribution = {};
  const expenseDistribution = {};
  const paidExpenseByDay = {};
  const paidIncomeByDay = {};

  for (const entry of entries) {
    if (entry.type === 'income') {
      mergeDistribution(
        incomeDistribution,
        calculateIncomeDistribution(entry, workingDays)
      );

      if (Number(entry.paid) === 1 && validDate(entry.due_date)) {
        paidIncomeByDay[entry.due_date] =
          (paidIncomeByDay[entry.due_date] || 0) + safeNumber(entry.amount);
      }
    }

    if (entry.type === 'expense') {
      mergeDistribution(
        expenseDistribution,
        calculateExpenseDistribution(entry, workingDays)
      );

      if (Number(entry.paid) === 1 && validDate(entry.due_date)) {
        paidExpenseByDay[entry.due_date] =
          (paidExpenseByDay[entry.due_date] || 0) + safeNumber(entry.amount);
      }
    }
  }

  const today = getTodayLocal();
  const dailyGoals = calculateAdminDailyGoals(entries, workingDays, today);

  const data = calendarDays.map((day) => ({
    day: day.day,
    date: day.date,
    income: safeNumber(incomeDistribution[day.date]),
    expense: safeNumber(expenseDistribution[day.date]) + (day.isRestDay ? safeNumber(restDays.find((item) => item.rest_date === day.date)?.amount) : 0),
    paidIncome: safeNumber(paidIncomeByDay[day.date]),
    paidExpense: safeNumber(paidExpenseByDay[day.date]),
    cashflow: safeNumber(incomeDistribution[day.date]) - safeNumber(expenseDistribution[day.date]),
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
  const cashflow = income - expense;
  const realizedIncome = entries.reduce((sum, entry) => {
    if (entry.type !== 'income' || !validDate(entry.due_date)) return sum;
    const reached = compareDates(entry.due_date, today) <= 0;
    const futureConfirmed = compareDates(entry.due_date, today) > 0 && Number(entry.paid) === 1;
    return sum + (reached || futureConfirmed ? safeNumber(entry.amount) : 0);
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
      availableBalance
    },
    data,
    entries,
    restDays
  };
}

async function handleAdminApi(req, res, url, parsedUrl) {
  const admin = requireAdmin(req, res);
  if (!admin) return true;

  const month = parsedUrl.searchParams.get('month');

  if (req.method === 'GET' && url === '/api/admin/clients') {
    if (!validMonth(month)) {
      return sendJson(res, 400, { error: 'Mês inválido.' });
    }
    const clients = db.prepare(`
      SELECT id, name, email, phone, created_at, billing_status, last_login_at
      FROM users
      WHERE role = 'client'
      ORDER BY name COLLATE NOCASE ASC
    `).all();

    const result = clients.map((client) => {
      const summary = buildAdminClientSummary(client.id, month);
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
    });

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
    const client = db.prepare(`
      SELECT id, name, email, phone, created_at, billing_status, last_login_at
      FROM users
      WHERE id = ? AND role = 'client'
    `).get(clientId);

    if (!client) {
      return sendJson(res, 404, { error: 'Cliente não encontrado.' });
    }

    const entries = db.prepare(`
      SELECT id, type, name, amount, created_date, due_date, paid, paid_at, rest_day_id, created_at
      FROM finance_entries
      WHERE user_id = ?
      ORDER BY due_date ASC, id ASC
    `).all(clientId);

    const restDays = db.prepare(`
      SELECT id, rest_date, amount, created_at
      FROM rest_days
      WHERE user_id = ?
      ORDER BY rest_date ASC, id ASC
    `).all(clientId);

    const createdDate = String(client.created_at || '').slice(0, 10);
    const today = getTodayLocal();
    const createdMonth = createdDate.slice(0, 7);
    const currentMonth = today.slice(0, 7);

    const totals = entries.reduce((acc, entry) => {
      const amount = safeNumber(entry.amount);
      if (entry.type === 'income') {
        acc.income += amount;
        if (Number(entry.paid) === 1) acc.paidIncome += amount;
      } else if (entry.type === 'expense') {
        acc.expense += amount;
        if (Number(entry.paid) === 1) acc.paidExpense += amount;
        else acc.pendingExpense += amount;
      }
      return acc;
    }, { income: 0, expense: 0, paidIncome: 0, paidExpense: 0, pendingExpense: 0 });

    totals.cashflow = totals.income - totals.expense;
    totals.confirmedCashflow = totals.paidIncome - totals.paidExpense;

    const monthly = [];
    if (validMonth(createdMonth) && validMonth(currentMonth)) {
      let cursor = createdMonth;
      while (cursor <= currentMonth) {
        const monthEntries = entries.filter(entry => { const date = String(entry.due_date || '').slice(0, 10); return date >= createdDate && date <= today && date.slice(0, 7) === cursor; });
        const income = monthEntries.filter(e => e.type === 'income').reduce((sum, e) => sum + safeNumber(e.amount), 0);
        const expense = monthEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + safeNumber(e.amount), 0);
        const paidIncome = monthEntries.filter(e => e.type === 'income' && Number(e.paid) === 1).reduce((sum, e) => sum + safeNumber(e.amount), 0);
        const paidExpense = monthEntries.filter(e => e.type === 'expense' && Number(e.paid) === 1).reduce((sum, e) => sum + safeNumber(e.amount), 0);
        const pendingExpense = monthEntries.filter(e => e.type === 'expense' && Number(e.paid) !== 1).reduce((sum, e) => sum + safeNumber(e.amount), 0);
        const restCount = restDays.filter(r => { const date = String(r.rest_date || '').slice(0, 10); return date >= createdDate && date <= today && date.slice(0, 7) === cursor; }).length;

        monthly.push({
          month: cursor,
          income,
          expense,
          cashflow: income - expense,
          paidIncome,
          paidExpense,
          confirmedCashflow: paidIncome - paidExpense,
          pendingExpense,
          restDays: restCount
        });

        const [year, monthNumber] = cursor.split('-').map(Number);
        const next = new Date(year, monthNumber, 1);
        cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
      }
    }

    // O relatório considera exclusivamente a janela de cadastro do cliente.
    const periodEntries = entries.filter((entry) => {
      const date = String(entry.due_date || '').slice(0, 10);
      return validDate(date) && date >= createdDate && date <= today;
    });
    const periodRestDays = restDays.filter((day) => {
      const date = String(day.rest_date || '').slice(0, 10);
      return validDate(date) && date >= createdDate && date <= today;
    });

    const periodTotals = periodEntries.reduce((acc, entry) => {
      const amount = safeNumber(entry.amount);
      if (entry.type === 'income') {
        acc.income += amount;
        if (Number(entry.paid) === 1) acc.paidIncome += amount;
      } else if (entry.type === 'expense') {
        acc.expense += amount;
        if (Number(entry.paid) === 1) acc.paidExpense += amount;
        else acc.pendingExpense += amount;
      }
      return acc;
    }, { income: 0, expense: 0, paidIncome: 0, paidExpense: 0, pendingExpense: 0 });
    periodTotals.cashflow = periodTotals.income - periodTotals.expense;
    periodTotals.confirmedCashflow = periodTotals.paidIncome - periodTotals.paidExpense;

    const report = {
      generated_at: new Date().toISOString(),
      client: { ...client, status: publicClientStatus(client) },
      period: { start: createdDate, end: today, startMonth: createdMonth, endMonth: currentMonth },
      totals: periodTotals,
      entries: periodEntries,
      restDays: periodRestDays,
      monthly
    };

    try {
      const pdf = buildClientReportPdf(report);
      return sendPdf(res, 200, pdf, pdfFileName(client.name, currentMonth));
    } catch (error) {
      console.error('Erro ao gerar relatório PDF:', error);
      return sendJson(res, 500, { error: 'Não foi possível gerar o relatório PDF.' });
    }
  }

  const statusMatch = url.match(/^\/api\/admin\/clients\/(\d+)\/status$/);
  if (req.method === 'PATCH' && statusMatch) {
    const clientId = Number(statusMatch[1]);
    const client = db.prepare(`
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
      db.prepare('UPDATE users SET billing_status = ? WHERE id = ?').run(billingStatus, clientId);

      const updated = db.prepare(`
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
    const client = db.prepare(`
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
      summary: buildAdminClientSummary(clientId, month)
    });
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
    requireUser(
      req,
      res
    );

  if (!user) {
    return true;
  }

  const userId =
    Number(user.id);

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
            user_id = ?
            AND substr(
              due_date,
              1,
              7
            ) = ?

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

      db.exec('BEGIN');
      try {
        const insert = db.prepare(`
          INSERT INTO finance_entries
          (user_id, type, name, amount, created_date, due_date, paid, paid_at, rest_day_id, recurrence_type, series_id, installment_number, installment_total, recurrence_day)
          VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?, ?, ?, ?)
        `);

        for (const row of rowsToCreate) {
          const result = insert.run(
            userId, type, name, amount, createdDate, row.date,
            recurrenceType, seriesId, row.installmentNumber, row.installmentTotal, recurrenceDay
          );
          if (firstEntryId === null) firstEntryId = Number(result.lastInsertRowid);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      const entry = db.prepare(`
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

      db
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

      db
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

      db
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
        ensureFixedSeriesHorizon(userId, entry.series_id, getTodayLocal());
      }

      const updatedEntry =
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

      db
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
        db
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
        db
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
      const existing = db.prepare(`
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

      db.exec('BEGIN');
      try {
        db.prepare(`UPDATE finance_entries SET recurrence_active = 0 WHERE user_id = ? AND series_id = ?`).run(userId, existing.series_id);
        const result = db.prepare(`
          DELETE FROM finance_entries
          WHERE user_id = ? AND series_id = ? AND due_date >= ? AND rest_day_id IS NULL
        `).run(userId, existing.series_id, existing.due_date);
        db.exec('COMMIT');
        return sendJson(res, 200, { message: 'Esta despesa e todas as ocorrências futuras foram excluídas.', deleted: Number(result.changes || 0) });
      } catch (err) {
        db.exec('ROLLBACK');
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
        db
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
        db
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

    ensureAllFixedSeries(userId);

    const entries =
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
              substr(
                due_date,
                1,
                7
              ) = ?

              OR (
                recurrence_type = 'single'
                AND substr(
                  created_date,
                  1,
                  7
                ) = ?
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
      db
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

            AND substr(
              due_date,
              1,
              7
            ) = ?
        `)
        .get(
          userId,
          month
        );

    const restDays =
      db
        .prepare(`
          SELECT
            id,
            rest_date,
            amount,
            created_at

          FROM rest_days

          WHERE
            user_id = ?

            AND substr(
              rest_date,
              1,
              7
            ) = ?

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

    const goalEntries = db.prepare(`
      SELECT id, type, name, amount, created_date, due_date, paid, paid_at,
             recurrence_type, series_id, installment_number, installment_total, recurrence_day
      FROM finance_entries
      WHERE user_id = ?
      ORDER BY due_date ASC, id ASC
    `).all(userId);

    const goalRestRows = db.prepare(`
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
            'income'
          ) {
            return total;
          }

          if (
            !validDate(
              entry.due_date
            )
          ) {
            return total;
          }

          const dateAlreadyReached =
            compareDates(
              entry.due_date,
              today
            ) <= 0;

          const futureConfirmed =
            compareDates(
              entry.due_date,
              today
            ) > 0 &&
            Number(entry.paid) === 1;

          if (
            !dateAlreadyReached &&
            !futureConfirmed
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
      db
        .prepare(`
          SELECT
            id,
            rest_date,
            amount,
            created_at

          FROM rest_days

          WHERE
            user_id = ?

            AND substr(
              rest_date,
              1,
              7
            ) = ?

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
        db
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

      db.exec('BEGIN');

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

        db.exec('COMMIT');

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
        db.exec('ROLLBACK');

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
        db
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

      db.exec('BEGIN');

      try {
        db
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
          db.exec('ROLLBACK');

          return sendJson(
            res,
            404,
            {
              error:
                'Dia de descanso não encontrado.'
            }
          );
        }

        db.exec('COMMIT');

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
        db.exec('ROLLBACK');

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
   API PRINCIPAL
========================================================= */

async function handleApi(
  req,
  res,
  parsedUrl
) {
  const url =
    parsedUrl.pathname;

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
  let pathname =
    decodeURIComponent(
      url.pathname
    );

  if (
    pathname === '/'
  ) {
    pathname =
      '/index.html';
  }

  if (
    pathname.includes('..')
  ) {
    return sendJson(
      res,
      400,
      {
        error:
          'Caminho inválido.'
      }
    );
  }

  const file =
    path.join(
      ROOT,
      pathname
    );

  const allowed =
    path
      .resolve(file)
      .startsWith(
        path.resolve(ROOT)
      );

  if (!allowed) {
    return sendJson(
      res,
      403,
      {
        error:
          'Acesso negado.'
      }
    );
  }

  fs.stat(
    file,
    (err, stat) => {
      if (
        err ||
        !stat.isFile()
      ) {
        res.writeHead(
          404,
          {
            'Content-Type':
              'text/html; charset=utf-8'
          }
        );

        return res.end(
          '<h1>404</h1><p>Página não encontrada.</p>'
        );
      }

      const ext =
        path
          .extname(file)
          .toLowerCase();

      const types = {
        '.html':
          'text/html; charset=utf-8',

        '.css':
          'text/css; charset=utf-8',

        '.js':
          'application/javascript; charset=utf-8',

        '.png':
          'image/png',

        '.jpg':
          'image/jpeg',

        '.jpeg':
          'image/jpeg',

        '.webp':
          'image/webp',

        '.ico':
          'image/x-icon'
      };

      const headers = {
        'Content-Type':
          types[ext] ||
          'application/octet-stream',

        'X-Content-Type-Options':
          'nosniff',

        'X-Frame-Options':
          'SAMEORIGIN',

        'Referrer-Policy':
          'strict-origin-when-cross-origin'
      };

      /*
        Controle visual da Área do Administrador.
        A autorização real continua sendo feita por requireAdmin();
        este trecho apenas garante que o link administrativo não
        apareça para clientes comuns.
      */
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
      if (adminItem) {
        el.style.display = isAdmin ? '' : 'none';
      }
    });
  } catch (_) {}
})();
</script>`;

          const output = html.includes('</body>')
            ? html.replace('</body>', adminVisibilityScript + '\n</body>')
            : html + adminVisibilityScript;

          res.writeHead(200, headers);
          res.end(output);
        });
        return;
      }

      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(res);
    }
  );
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

server.listen(
  PORT,
  () => {
    console.log(
      `Rota Financeira rodando em http://localhost:${PORT}`
    );
  }
);