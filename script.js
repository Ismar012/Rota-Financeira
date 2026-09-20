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

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const COOKIE_NAME = 'rota_session';
const SESSION_DAYS = 7;

/* =========================================================
   SEGURANÇA
========================================================= */

if (
  SESSION_SECRET === 'TROQUE-ESTE-SEGREDO-ANTES-DE-PUBLICAR' &&
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

  /* =======================================================
     LANÇAMENTOS FINANCEIROS
  ======================================================= */

  CREATE TABLE IF NOT EXISTS finance_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    name TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    created_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_finance_entries_user
  ON finance_entries(user_id);

  CREATE INDEX IF NOT EXISTS idx_finance_entries_due_date
  ON finance_entries(due_date);

  /* =======================================================
     DIAS DE DESCANSO
  ======================================================= */

  CREATE TABLE IF NOT EXISTS rest_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    rest_date TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

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

/* Remove sessões expiradas ao iniciar */
db.prepare(
  'DELETE FROM sessions WHERE expires_at <= ?'
).run(Date.now());

/* =========================================================
   RESPOSTAS
========================================================= */

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);

  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders
  });

  res.end(body);
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

        return [
          part.slice(0, i).trim(),
          decodeURIComponent(
            part.slice(i + 1).trim()
          )
        ];
      })
  );
}

function cookieHeader(value, maxAge) {
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
    .createHmac('sha256', SESSION_SECRET)
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

  return `scrypt$${salt}$${derived.toString('hex')}`;
}

function passwordVerify(password, stored) {
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
    expected.length === derived.length &&
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
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;

      if (size > 1024 * 1024) {
        reject(
          new Error('Payload muito grande.')
        );

        req.destroy();
        return;
      }

      data += chunk;
    });

    req.on('end', () => {
      try {
        resolve(
          JSON.parse(data || '{}')
        );
      } catch {
        reject(
          new Error('JSON inválido.')
        );
      }
    });

    req.on('error', reject);
  });
}

/* =========================================================
   UTILITÁRIOS
========================================================= */

function clean(value, max) {
  return String(value ?? '')
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
  const amount = Number(value);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  return amount;
}

/* =========================================================
   USUÁRIO LOGADO
========================================================= */

function getCurrentUser(req) {
  const token =
    parseCookies(req)[COOKIE_NAME];

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

  return row || null;
}

function requireUser(req, res) {
  const user = getCurrentUser(req);

  if (!user) {
    sendJson(res, 401, {
      authenticated: false,
      error: 'Sessão expirada.'
    });

    return null;
  }

  return user;
}

/* =========================================================
   LIMITADOR DE TENTATIVAS
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

  if (now > item.reset) {
    item.count = 0;
    item.reset =
      now +
      15 * 60 * 1000;
  }

  item.count++;

  attempts.set(ip, item);

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
  /* -----------------------------------------
     CADASTRO
  ----------------------------------------- */

  if (
    req.method === 'POST' &&
    url === '/api/auth/register'
  ) {
    if (tooManyAttempts(req)) {
      return sendJson(res, 429, {
        error:
          'Muitas tentativas. Aguarde alguns minutos.'
      });
    }

    try {
      const body =
        await readBody(req);

      const name = clean(
        body.name,
        100
      );

      const email = clean(
        body.email,
        160
      ).toLowerCase();

      const phone = clean(
        body.phone,
        30
      );

      const password =
        String(body.password || '');

      if (name.length < 2) {
        return sendJson(res, 400, {
          error:
            'Informe seu nome completo.'
        });
      }

      if (!validEmail(email)) {
        return sendJson(res, 400, {
          error:
            'Informe um e-mail válido.'
        });
      }

      if (password.length < 8) {
        return sendJson(res, 400, {
          error:
            'A senha deve ter pelo menos 8 caracteres.'
        });
      }

      if (password.length > 128) {
        return sendJson(res, 400, {
          error:
            'A senha é muito longa.'
        });
      }

      const exists = db
        .prepare(
          'SELECT id FROM users WHERE email = ?'
        )
        .get(email);

      if (exists) {
        return sendJson(res, 409, {
          error:
            'Este e-mail já possui cadastro. Faça login.'
        });
      }

      const result = db
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
          passwordHash(password)
        );

      const token =
        crypto
          .randomBytes(32)
          .toString('base64url');

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

      return sendJson(res, 500, {
        error:
          'Não foi possível concluir o cadastro.'
      });
    }
  }

  /* -----------------------------------------
     LOGIN
  ----------------------------------------- */

  if (
    req.method === 'POST' &&
    url === '/api/auth/login'
  ) {
    if (tooManyAttempts(req)) {
      return sendJson(res, 429, {
        error:
          'Muitas tentativas. Aguarde alguns minutos.'
      });
    }

    try {
      const body =
        await readBody(req);

      const email = clean(
        body.email,
        160
      ).toLowerCase();

      const password =
        String(body.password || '');

      const user = db
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
        return sendJson(res, 401, {
          error:
            'E-mail ou senha inválidos.'
        });
      }

      const token =
        crypto
          .randomBytes(32)
          .toString('base64url');

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
            email: user.email
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

      return sendJson(res, 500, {
        error:
          'Não foi possível realizar o login.'
      });
    }
  }

  /* -----------------------------------------
     USUÁRIO ATUAL
  ----------------------------------------- */

  if (
    req.method === 'GET' &&
    url === '/api/auth/me'
  ) {
    const user =
      getCurrentUser(req);

    if (!user) {
      return sendJson(res, 401, {
        authenticated: false
      });
    }

    return sendJson(res, 200, {
      authenticated: true,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  }

  /* -----------------------------------------
     LOGOUT
  ----------------------------------------- */

  if (
    req.method === 'POST' &&
    url === '/api/auth/logout'
  ) {
    const token =
      parseCookies(req)[COOKIE_NAME];

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
   FINANCEIRO
========================================================= */

async function handleFinanceApi(
  req,
  res,
  url,
  parsedUrl
) {
  const user =
    requireUser(req, res);

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

    if (!validMonth(month)) {
      return sendJson(res, 400, {
        error:
          'Mês inválido.'
      });
    }

    const entries =
      db.prepare(`
        SELECT
          id,
          type,
          name,
          amount,
          created_date,
          due_date,
          created_at

        FROM finance_entries

        WHERE
          user_id = ?
          AND substr(due_date, 1, 7) = ?

        ORDER BY
          due_date ASC,
          id ASC
      `).all(
        userId,
        month
      );

    return sendJson(res, 200, {
      month,
      entries
    });
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
        clean(body.type, 20);

      const name =
        clean(body.name, 200);

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
        return sendJson(res, 400, {
          error:
            'Tipo de lançamento inválido.'
        });
      }

      if (!name) {
        return sendJson(res, 400, {
          error:
            'Informe o nome do lançamento.'
        });
      }

      if (amount === null) {
        return sendJson(res, 400, {
          error:
            'Informe um valor válido.'
        });
      }

      if (
        !validDate(createdDate) ||
        !validDate(dueDate)
      ) {
        return sendJson(res, 400, {
          error:
            'Informe datas válidas.'
        });
      }

      const result =
        db.prepare(`
          INSERT INTO finance_entries
          (
            user_id,
            type,
            name,
            amount,
            created_date,
            due_date
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          type,
          name,
          amount,
          createdDate,
          dueDate
        );

      const entry =
        db.prepare(`
          SELECT
            id,
            type,
            name,
            amount,
            created_date,
            due_date,
            created_at

          FROM finance_entries

          WHERE
            id = ?
            AND user_id = ?
        `).get(
          Number(
            result.lastInsertRowid
          ),
          userId
        );

      console.log(
        `Novo ${type}:`,
        entry
      );

      return sendJson(res, 201, {
        message:
          type === 'income'
            ? 'Ganho cadastrado com sucesso.'
            : 'Despesa cadastrada com sucesso.',

        entry
      });
    } catch (err) {
      console.error(
        'Erro ao cadastrar lançamento:',
        err
      );

      return sendJson(res, 500, {
        error:
          'Não foi possível cadastrar o lançamento.'
      });
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
      Number(entryMatch[1]);

    try {
      const body =
        await readBody(req);

      const type =
        clean(body.type, 20);

      const name =
        clean(body.name, 200);

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
        return sendJson(res, 400, {
          error:
            'Tipo de lançamento inválido.'
        });
      }

      if (!name) {
        return sendJson(res, 400, {
          error:
            'Informe o nome do lançamento.'
        });
      }

      if (amount === null) {
        return sendJson(res, 400, {
          error:
            'Informe um valor válido.'
        });
      }

      if (
        !validDate(createdDate) ||
        !validDate(dueDate)
      ) {
        return sendJson(res, 400, {
          error:
            'Informe datas válidas.'
        });
      }

      const result =
        db.prepare(`
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
        `).run(
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
        return sendJson(res, 404, {
          error:
            'Lançamento não encontrado.'
        });
      }

      const entry =
        db.prepare(`
          SELECT
            id,
            type,
            name,
            amount,
            created_date,
            due_date,
            created_at

          FROM finance_entries

          WHERE
            id = ?
            AND user_id = ?
        `).get(
          id,
          userId
        );

      return sendJson(res, 200, {
        message:
          'Lançamento atualizado com sucesso.',

        entry
      });
    } catch (err) {
      console.error(
        'Erro ao editar lançamento:',
        err
      );

      return sendJson(res, 500, {
        error:
          'Não foi possível atualizar o lançamento.'
      });
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
      Number(entryMatch[1]);

    try {
      const result =
        db.prepare(`
          DELETE FROM finance_entries

          WHERE
            id = ?
            AND user_id = ?
        `).run(
          id,
          userId
        );

      if (
        Number(
          result.changes || 0
        ) === 0
      ) {
        return sendJson(res, 404, {
          error:
            'Lançamento não encontrado.'
        });
      }

      return sendJson(res, 200, {
        message:
          'Lançamento excluído com sucesso.'
      });
    } catch (err) {
      console.error(
        'Erro ao excluir lançamento:',
        err
      );

      return sendJson(res, 500, {
        error:
          'Não foi possível excluir o lançamento.'
      });
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

    if (!validMonth(month)) {
      return sendJson(res, 400, {
        error:
          'Mês inválido.'
      });
    }

    const totals =
      db.prepare(`
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
          ) AS expense

        FROM finance_entries

        WHERE
          user_id = ?
          AND substr(due_date, 1, 7) = ?
      `).get(
        userId,
        month
      );

    const restDays =
      db.prepare(`
        SELECT
          rest_date

        FROM rest_days

        WHERE
          user_id = ?
          AND substr(rest_date, 1, 7) = ?
      `).all(
        userId,
        month
      );

    const income =
      Number(
        totals?.income || 0
      );

    const expense =
      Number(
        totals?.expense || 0
      );

    const cashflow =
      income - expense;

    /* -----------------------------------------
       DIAS DO MÊS
    ----------------------------------------- */

    const [
      year,
      monthNumber
    ] = month
      .split('-')
      .map(Number);

    const daysInMonth =
      new Date(
        year,
        monthNumber,
        0
      ).getDate();

    const restSet =
      new Set(
        restDays.map(
          (item) =>
            item.rest_date
        )
      );

    const dailyData = [];

    let workingDays = 0;

    for (
      let day = 1;
      day <= daysInMonth;
      day++
    ) {
      const date =
        `${year}-${String(
          monthNumber
        ).padStart(2, '0')}-${String(
          day
        ).padStart(2, '0')}`;

      const dateObj =
        new Date(
          `${date}T00:00:00`
        );

      const weekday =
        dateObj.getDay();

      /*
        Domingo = 0
        Sábado = 6

        Dias úteis:
        segunda a sexta.
      */

      const isWeekend =
        weekday === 0 ||
        weekday === 6;

      const isRestDay =
        restSet.has(date);

      if (
        !isWeekend &&
        !isRestDay
      ) {
        workingDays++;
      }

      const dayTotals =
        db.prepare(`
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
            ) AS expense

          FROM finance_entries

          WHERE
            user_id = ?
            AND due_date = ?
        `).get(
          userId,
          date
        );

      const dayIncome =
        Number(
          dayTotals?.income || 0
        );

      const dayExpense =
        Number(
          dayTotals?.expense || 0
        );

      dailyData.push({
        day,
        date,
        income: dayIncome,
        expense: dayExpense,
        cashflow:
          dayIncome -
          dayExpense
      });
    }

    /*
      Neste momento o sistema não possui
      uma tabela específica para meta diária.

      Por isso deixamos dailyGoal como 0
      até conectarmos a meta ao módulo de
      planejamento.
    */

    const dailyGoal = 0;

    return sendJson(res, 200, {
      month,

      totals: {
        income,
        expense,
        cashflow,
        dailyGoal,
        workingDays
      },

      data: dailyData,

      entries: [],

      restDays
    });
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

    if (!validMonth(month)) {
      return sendJson(res, 400, {
        error:
          'Mês inválido.'
      });
    }

    const restDays =
      db.prepare(`
        SELECT
          id,
          rest_date,
          amount,
          created_at

        FROM rest_days

        WHERE
          user_id = ?
          AND substr(rest_date, 1, 7) = ?

        ORDER BY
          rest_date ASC
      `).all(
        userId,
        month
      );

    return sendJson(res, 200, {
      month,
      restDays
    });
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
        Number(
          body.amount || 0
        );

      if (
        !validDate(restDate)
      ) {
        return sendJson(res, 400, {
          error:
            'Informe uma data válida.'
        });
      }

      if (
        !Number.isFinite(amount) ||
        amount < 0
      ) {
        return sendJson(res, 400, {
          error:
            'Informe um valor válido.'
        });
      }

      const existing =
        db.prepare(`
          SELECT id
          FROM rest_days

          WHERE
            user_id = ?
            AND rest_date = ?
        `).get(
          userId,
          restDate
        );

      if (existing) {
        return sendJson(res, 409, {
          error:
            'Este dia de descanso já está cadastrado.'
        });
      }

      const result =
        db.prepare(`
          INSERT INTO rest_days
          (
            user_id,
            rest_date,
            amount
          )
          VALUES (?, ?, ?)
        `).run(
          userId,
          restDate,
          amount
        );

      const restDay =
        db.prepare(`
          SELECT
            id,
            rest_date,
            amount,
            created_at

          FROM rest_days

          WHERE
            id = ?
            AND user_id = ?
        `).get(
          Number(
            result.lastInsertRowid
          ),
          userId
        );

      return sendJson(res, 201, {
        message:
          'Dia de descanso cadastrado com sucesso.',

        restDay
      });
    } catch (err) {
      console.error(
        'Erro ao cadastrar descanso:',
        err
      );

      return sendJson(res, 500, {
        error:
          'Não foi possível cadastrar o dia de descanso.'
      });
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
      Number(restMatch[1]);

    try {
      const result =
        db.prepare(`
          DELETE FROM rest_days

          WHERE
            id = ?
            AND user_id = ?
        `).run(
          id,
          userId
        );

      if (
        Number(
          result.changes || 0
        ) === 0
      ) {
        return sendJson(res, 404, {
          error:
            'Dia de descanso não encontrado.'
        });
      }

      return sendJson(res, 200, {
        message:
          'Dia de descanso excluído com sucesso.'
      });
    } catch (err) {
      console.error(
        'Erro ao excluir descanso:',
        err
      );

      return sendJson(res, 500, {
        error:
          'Não foi possível excluir o dia de descanso.'
      });
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

  /*
    Primeiro tentamos autenticação.
  */

  if (
    url.startsWith('/api/auth/')
  ) {
    const result =
      await handleAuthApi(
        req,
        res,
        url
      );

    if (result !== false) {
      return;
    }
  }

  /*
    Depois tentamos financeiro.
  */

  if (
    url.startsWith('/api/finance/')
  ) {
    const result =
      await handleFinanceApi(
        req,
        res,
        url,
        parsedUrl
      );

    if (result !== false) {
      return;
    }
  }

  /*
    Se chegou aqui,
    realmente não existe a rota.
  */

  return sendJson(res, 404, {
    error:
      'Rota não encontrada.'
  });
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

  if (pathname === '/') {
    pathname = '/index.html';
  }

  if (
    pathname.includes('..')
  ) {
    return sendJson(res, 400, {
      error:
        'Caminho inválido.'
    });
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
    return sendJson(res, 403, {
      error:
        'Acesso negado.'
    });
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
        path.extname(
          file
        ).toLowerCase();

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

      res.writeHead(
        200,
        {
          'Content-Type':
            types[ext] ||
            'application/octet-stream',

          'X-Content-Type-Options':
            'nosniff',

          'X-Frame-Options':
            'SAMEORIGIN',

          'Referrer-Policy':
            'strict-origin-when-cross-origin'
        }
      );

      fs
        .createReadStream(file)
        .pipe(res);
    }
  );
}

/* =========================================================
   SERVIDOR
========================================================= */

const server =
  http.createServer(
    async (req, res) => {
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
          sendJson(res, 500, {
            error:
              'Erro interno do servidor.'
          });
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