const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8'
};

export default {
  async fetch(request, env, ctx) {
    const requestId = crypto.randomUUID();
    try {
      if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), env);

      const url = new URL(request.url);
      const route = `${request.method} ${url.pathname}`;

      if (route === 'GET /api/health') return ok({ ok: true, service: 'question-bank-api', requestId }, env);
      if (route === 'POST /api/auth/login') return login(request, env);
      if (route === 'POST /api/admin/login') return adminLogin(request, env);
      if (route === 'GET /api/banks') return listBanks(request, env);
      if (route === 'GET /api/questions') return listQuestions(request, env);
      if (route === 'POST /api/user-banks/join') return joinBank(request, env);
      if (route === 'POST /api/answers') return submitAnswer(request, env);
      if (route === 'POST /api/favorites/toggle') return toggleFavorite(request, env);
      if (route === 'POST /api/admin/import-bank') return importBank(request, env);
      if (route === 'POST /api/admin/activation-codes') return createActivationCodes(request, env);

      return fail('接口不存在', 404, env, { requestId });
    } catch (error) {
      ctx.waitUntil(logError(error, requestId));
      return fail('服务器处理失败', 500, env, { requestId });
    }
  }
};

async function login(request, env) {
  const body = await readJson(request);
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  if (!name || !phone) return fail('请输入姓名和手机号', 400, env);

  const existing = await env.DB.prepare('SELECT * FROM users WHERE phone = ? AND role = ?').bind(phone, 'user').first();
  const timestamp = now();
  let user = existing;
  if (!user) {
    user = { id: id('user'), role: 'user', name, phone, created_at: timestamp, updated_at: timestamp };
    await env.DB.prepare('INSERT INTO users (id, role, name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(user.id, user.role, user.name, user.phone, timestamp, timestamp)
      .run();
  } else {
    await env.DB.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?').bind(name, timestamp, existing.id).run();
    user = { ...existing, name, updated_at: timestamp };
  }

  return ok({ user, token: makeSessionToken(user) }, env);
}

async function adminLogin(request, env) {
  const body = await readJson(request);
  const password = String(body.password || '');
  const expected = env.ADMIN_PASSWORD || 'admin123';
  if (password !== expected) return fail('管理员密码错误', 401, env);
  const admin = await env.DB.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').bind('admin').first();
  return ok({ user: admin || { id: 'admin-default', role: 'admin', name: '管理员', phone: 'admin' }, token: 'admin-demo-token' }, env);
}

async function listBanks(request, env) {
  const userId = getUserId(request);
  const banks = await env.DB.prepare(`
    SELECT b.*,
      COUNT(DISTINCT c.id) AS chapter_count,
      COUNT(DISTINCT q.id) AS question_count,
      CASE WHEN ub.user_id IS NULL THEN 0 ELSE 1 END AS joined
    FROM banks b
    LEFT JOIN chapters c ON c.bank_id = b.id
    LEFT JOIN questions q ON q.bank_id = b.id
    LEFT JOIN user_banks ub ON ub.bank_id = b.id AND ub.user_id = ?
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `).bind(userId || '').all();
  return ok({ banks: banks.results || [] }, env);
}

async function listQuestions(request, env) {
  const url = new URL(request.url);
  const bankId = url.searchParams.get('bankId');
  if (!bankId) return fail('缺少 bankId', 400, env);
  const rows = await env.DB.prepare('SELECT * FROM questions WHERE bank_id = ? ORDER BY sort_order ASC, created_at ASC').bind(bankId).all();
  return ok({ questions: (rows.results || []).map(readQuestionRow) }, env);
}

async function joinBank(request, env) {
  const userId = requireUserId(request);
  const body = await readJson(request);
  const bankId = String(body.bankId || '').trim();
  if (!bankId) return fail('缺少题库 ID', 400, env);
  await env.DB.prepare('INSERT OR IGNORE INTO user_banks (user_id, bank_id, created_at) VALUES (?, ?, ?)')
    .bind(userId, bankId, now())
    .run();
  return ok({ ok: true }, env);
}

async function submitAnswer(request, env) {
  const userId = requireUserId(request);
  const body = await readJson(request);
  const questionId = String(body.questionId || '').trim();
  const answer = normalizeAnswer(body.answer || []);
  const question = await env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(questionId).first();
  if (!question) return fail('题目不存在', 404, env);

  const expected = normalizeAnswer(JSON.parse(question.answer_json || '[]'));
  const correct = answer.length === expected.length && answer.every((item, index) => item === expected[index]);
  const timestamp = now();
  await env.DB.prepare(`
    INSERT INTO attempts (id, user_id, bank_id, question_id, answer_json, correct, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id('attempt'), userId, question.bank_id, question.id, JSON.stringify(answer), correct ? 1 : 0, body.source || 'practice', timestamp).run();

  if (!correct) {
    await env.DB.prepare(`
      INSERT INTO wrong_questions (user_id, question_id, bank_id, chapter_id, last_answer_json, resolved_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?)
      ON CONFLICT(user_id, question_id) DO UPDATE SET last_answer_json = excluded.last_answer_json, resolved_at = NULL, updated_at = excluded.updated_at
    `).bind(userId, question.id, question.bank_id, question.chapter_id, JSON.stringify(answer), timestamp).run();
  }

  return ok({ correct, answer: expected, answerText: question.answer_text, analysis: question.analysis }, env);
}

async function toggleFavorite(request, env) {
  const userId = requireUserId(request);
  const body = await readJson(request);
  const questionId = String(body.questionId || '').trim();
  const question = await env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(questionId).first();
  if (!question) return fail('题目不存在', 404, env);
  const existing = await env.DB.prepare('SELECT question_id FROM favorites WHERE user_id = ? AND question_id = ?').bind(userId, questionId).first();
  if (existing) {
    await env.DB.prepare('DELETE FROM favorites WHERE user_id = ? AND question_id = ?').bind(userId, questionId).run();
    return ok({ favorite: false }, env);
  }
  await env.DB.prepare('INSERT INTO favorites (user_id, question_id, bank_id, created_at) VALUES (?, ?, ?, ?)')
    .bind(userId, questionId, question.bank_id, now())
    .run();
  return ok({ favorite: true }, env);
}

async function importBank(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const bank = body.bank || {};
  const chapters = Array.isArray(body.chapters) ? body.chapters : [];
  const questions = Array.isArray(body.questions) ? body.questions : [];
  if (!bank.name || !questions.length) return fail('题库名称和题目不能为空', 400, env);

  const timestamp = now();
  const bankId = id('bank');
  const chapterMap = new Map();
  const statements = [
    env.DB.prepare(`
      INSERT INTO banks (id, name, description, status, access_type, price, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(bankId, bank.name, bank.description || '', bank.status || 'published', bank.accessType || 'free', Number(bank.price) || 0, timestamp, timestamp)
  ];

  const chapterNames = [...new Set([...chapters.map((item) => item.name), ...questions.map((item) => item.chapterName || '默认章节')].filter(Boolean))];
  chapterNames.forEach((name, index) => {
    const chapterId = id('ch');
    chapterMap.set(name, chapterId);
    statements.push(env.DB.prepare('INSERT INTO chapters (id, bank_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(chapterId, bankId, name, index + 1, timestamp));
  });

  questions.forEach((question, index) => {
    const chapterName = question.chapterName || chapterNames[0] || '默认章节';
    const answer = normalizeAnswer(question.answer || []);
    statements.push(env.DB.prepare(`
      INSERT INTO questions (id, bank_id, chapter_id, type, stem, options_json, answer_json, answer_text, analysis, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id('q'),
      bankId,
      chapterMap.get(chapterName),
      question.type || 'single',
      question.stem,
      JSON.stringify(question.options || []),
      JSON.stringify(answer),
      answer.join('、'),
      question.analysis || '',
      index + 1,
      timestamp
    ));
  });

  await env.DB.batch(statements);
  return ok({ ok: true, bankId, count: questions.length }, env);
}

async function createActivationCodes(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const planId = String(body.planId || '').trim();
  const count = Math.min(Math.max(Number(body.count) || 1, 1), 500);
  const plan = await env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(planId).first();
  if (!plan) return fail('套餐不存在', 404, env);
  const timestamp = now();
  const codes = Array.from({ length: count }, () => ({ id: id('code'), code: makeCode(), planId, createdAt: timestamp }));
  await env.DB.batch(codes.map((item) => env.DB.prepare('INSERT INTO activation_codes (id, code, plan_id, created_at) VALUES (?, ?, ?, ?)')
    .bind(item.id, item.code, item.planId, item.createdAt)));
  return ok({ codes }, env);
}

function readQuestionRow(row) {
  return {
    id: row.id,
    bankId: row.bank_id,
    chapterId: row.chapter_id,
    type: row.type,
    stem: row.stem,
    options: JSON.parse(row.options_json || '[]'),
    answer: JSON.parse(row.answer_json || '[]'),
    answerText: row.answer_text,
    analysis: row.analysis,
    sortOrder: row.sort_order
  };
}

async function readJson(request) {
  if (!request.headers.get('content-type')?.includes('application/json')) return {};
  return request.json();
}

function ok(data, env) {
  return withCors(Response.json(data, { headers: jsonHeaders }), env);
}

function fail(message, status, env, extra = {}) {
  return withCors(Response.json({ ok: false, message, ...extra }, { status, headers: jsonHeaders }), env);
}

function withCors(response, env) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', env.CORS_ORIGIN || '*');
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type,authorization,x-user-id,x-admin-token');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function getUserId(request) {
  return request.headers.get('x-user-id') || '';
}

function requireUserId(request) {
  const userId = getUserId(request);
  if (!userId) throw new HttpError('请先登录', 401);
  return userId;
}

function requireAdmin(request) {
  const token = request.headers.get('x-admin-token');
  if (token !== 'admin-demo-token') throw new HttpError('没有管理员权限', 401);
}

function normalizeAnswer(answer) {
  const list = Array.isArray(answer) ? answer : [answer];
  return list.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean).sort();
}

function makeSessionToken(user) {
  return `demo.${user.id}.${Date.now()}`;
}

function makeCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const text = [...bytes].map((byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 8).toUpperCase();
  return `QB-${text.slice(0, 4)}-${text.slice(4, 8)}`;
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function now() {
  return Date.now();
}

async function logError(error, requestId) {
  console.error(JSON.stringify({ level: 'error', requestId, message: error.message, stack: error.stack }));
}

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
