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
      if (route === 'POST /api/auth/register') return register(request, env);
      if (route === 'POST /api/auth/login') return login(request, env);
      if (route === 'POST /api/admin/login') return adminLogin(request, env);
      if (route === 'GET /api/admin/users') return listAdminUsers(request, env);
      if (route === 'GET /api/admin/user-detail') return getAdminUserDetail(request, env);
      if (route === 'DELETE /api/admin/users') return deleteAdminUser(request, env);
      if (route === 'GET /api/admin/logs') return listAdminLogs(request, env);
      if (route === 'GET /api/banks') return listBanks(request, env);
      if (route === 'GET /api/questions') return listQuestions(request, env);
      if (route === 'POST /api/user-banks/join') return joinBank(request, env);
      if (route === 'POST /api/answers') return submitAnswer(request, env);
      if (route === 'POST /api/favorites/toggle') return toggleFavorite(request, env);
      if (route === 'POST /api/admin/import-bank') return importBank(request, env);
      if (route === 'POST /api/admin/activation-codes') return createActivationCodes(request, env);

      return fail('接口不存在', 404, env, { requestId });
    } catch (error) {
      if (error instanceof HttpError) return fail(error.message, error.status, env, { requestId });
      ctx.waitUntil(logError(error, requestId));
      return fail('服务器处理失败', 500, env, { requestId });
    }
  }
};

async function register(request, env) {
  const body = await readJson(request);
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const password = String(body.password || '');
  if (!name || !phone || !password) return fail('\u8bf7\u8f93\u5165\u59d3\u540d\u3001\u624b\u673a\u53f7\u548c\u5bc6\u7801', 400, env);
  if (password.length < 6) return fail('\u5bc6\u7801\u81f3\u5c11\u9700\u8981 6 \u4f4d', 400, env);

  const existing = await env.DB.prepare('SELECT * FROM users WHERE phone = ? AND role = ?').bind(phone, 'user').first();
  if (existing?.password_hash) return fail('\u8be5\u624b\u673a\u53f7\u5df2\u6ce8\u518c\uff0c\u8bf7\u76f4\u63a5\u767b\u5f55', 409, env);

  const timestamp = now();
  const passwordHash = await hashPassword(password);
  if (existing) {
    await env.DB.prepare('UPDATE users SET name = ?, password_hash = ?, updated_at = ? WHERE id = ?')
      .bind(name, passwordHash, timestamp, existing.id)
      .run();
    return ok({ user: publicUser({ ...existing, name, password_hash: passwordHash, updated_at: timestamp }), token: makeSessionToken(existing) }, env);
  }
  const user = { id: id('user'), role: 'user', name, phone, password_hash: passwordHash, created_at: timestamp, updated_at: timestamp };
  await env.DB.prepare('INSERT INTO users (id, role, name, phone, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(user.id, user.role, user.name, user.phone, passwordHash, timestamp, timestamp)
    .run();

  return ok({ user: publicUser(user), token: makeSessionToken(user) }, env);
}

async function login(request, env) {
  const body = await readJson(request);
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const password = String(body.password || '');
  if (!name || !phone || !password) return fail('\u8bf7\u8f93\u5165\u59d3\u540d\u3001\u624b\u673a\u53f7\u548c\u5bc6\u7801', 400, env);

  const user = await env.DB.prepare('SELECT * FROM users WHERE phone = ? AND role = ?').bind(phone, 'user').first();
  if (!user) return fail('\u8d26\u53f7\u4e0d\u5b58\u5728\uff0c\u8bf7\u5148\u6ce8\u518c', 404, env);
  if (String(user.name || '').trim() !== name) return fail('\u59d3\u540d\u548c\u624b\u673a\u53f7\u4e0d\u5339\u914d', 401, env);
  if (!user.password_hash) return fail('\u8be5\u8d26\u53f7\u5c1a\u672a\u8bbe\u7f6e\u5bc6\u7801\uff0c\u8bf7\u91cd\u65b0\u6ce8\u518c\u6216\u8054\u7cfb\u7ba1\u7406\u5458', 401, env);
  if (user.password_hash !== await hashPassword(password)) return fail('\u5bc6\u7801\u9519\u8bef', 401, env);

  return ok({ user: publicUser(user), token: makeSessionToken(user) }, env);
}

async function adminLogin(request, env) {
  const body = await readJson(request);
  const password = String(body.password || '');
  const expected = env.ADMIN_PASSWORD || 'admin123';
  if (password !== expected) return fail('\u7ba1\u7406\u5458\u5bc6\u7801\u9519\u8bef', 401, env);
  const admin = await env.DB.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').bind('admin').first();
  const user = admin || { id: 'admin-default', role: 'admin', name: '\u7ba1\u7406\u5458', phone: 'admin' };
  await recordAdminLog(request, env, {
    adminId: user.id,
    action: 'admin.login',
    targetType: 'admin',
    targetId: user.id,
    detail: { phone: user.phone }
  });
  return ok({ user: publicUser(user), token: 'admin-demo-token' }, env);
}

async function listAdminUsers(request, env) {
  requireAdmin(request);
  const rows = await env.DB.prepare(`
    SELECT u.id, u.role, u.name, u.phone, u.created_at, u.updated_at,
      (SELECT COUNT(*) FROM user_banks ub WHERE ub.user_id = u.id) AS joined_bank_count,
      (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id) AS attempt_count,
      (SELECT COUNT(*) FROM wrong_questions wq WHERE wq.user_id = u.id AND wq.resolved_at IS NULL) AS wrong_count,
      (SELECT COUNT(*) FROM favorites f WHERE f.user_id = u.id) AS favorite_count,
      (SELECT COUNT(*) FROM entitlements e WHERE e.user_id = u.id) AS grant_count,
      (SELECT MAX(a.created_at) FROM attempts a WHERE a.user_id = u.id) AS last_attempt_at,
      COALESCE((
        SELECT group_concat(b.name, '、')
        FROM user_banks ub
        JOIN banks b ON b.id = ub.bank_id
        WHERE ub.user_id = u.id
      ), '') AS joined_bank_names
    FROM users u
    WHERE u.role = 'user'
    ORDER BY u.created_at DESC
  `).all();
  return ok({ users: rows.results || [] }, env);
}

async function getAdminUserDetail(request, env) {
  requireAdmin(request);
  const url = new URL(request.url);
  const userId = String(url.searchParams.get('userId') || '').trim();
  if (!userId) return fail('缺少用户 ID', 400, env);

  const user = await env.DB.prepare('SELECT id, role, name, phone, created_at, updated_at FROM users WHERE id = ? AND role = ?')
    .bind(userId, 'user')
    .first();
  if (!user) return fail('用户不存在', 404, env);

  const joinedBanks = await env.DB.prepare(`
    SELECT b.id, b.name, b.description, b.access_type, b.price, ub.created_at AS joined_at,
      COUNT(DISTINCT q.id) AS question_count,
      COUNT(DISTINCT a.id) AS attempt_count,
      SUM(CASE WHEN a.correct = 1 THEN 1 ELSE 0 END) AS correct_count,
      COUNT(DISTINCT wq.question_id) AS wrong_count,
      COUNT(DISTINCT f.question_id) AS favorite_count,
      MAX(a.created_at) AS last_attempt_at
    FROM user_banks ub
    JOIN banks b ON b.id = ub.bank_id
    LEFT JOIN questions q ON q.bank_id = b.id
    LEFT JOIN attempts a ON a.bank_id = b.id AND a.user_id = ub.user_id
    LEFT JOIN wrong_questions wq ON wq.bank_id = b.id AND wq.user_id = ub.user_id AND wq.resolved_at IS NULL
    LEFT JOIN favorites f ON f.bank_id = b.id AND f.user_id = ub.user_id
    WHERE ub.user_id = ?
    GROUP BY b.id, ub.created_at
    ORDER BY ub.created_at DESC
  `).bind(userId).all();

  const chapterStats = await env.DB.prepare(`
    SELECT b.id AS bank_id, b.name AS bank_name, c.id AS chapter_id, c.name AS chapter_name,
      COUNT(DISTINCT q.id) AS question_count,
      COUNT(DISTINCT a.id) AS attempt_count,
      SUM(CASE WHEN a.correct = 1 THEN 1 ELSE 0 END) AS correct_count,
      COUNT(DISTINCT wq.question_id) AS wrong_count
    FROM chapters c
    JOIN banks b ON b.id = c.bank_id
    LEFT JOIN questions q ON q.chapter_id = c.id
    LEFT JOIN attempts a ON a.question_id = q.id AND a.user_id = ?
    LEFT JOIN wrong_questions wq ON wq.question_id = q.id AND wq.user_id = ? AND wq.resolved_at IS NULL
    WHERE EXISTS (SELECT 1 FROM user_banks ub WHERE ub.user_id = ? AND ub.bank_id = b.id)
    GROUP BY c.id
    ORDER BY b.name ASC, c.sort_order ASC
  `).bind(userId, userId, userId).all();

  const wrongQuestions = await env.DB.prepare(`
    SELECT wq.question_id, wq.bank_id, wq.chapter_id, wq.updated_at,
      b.name AS bank_name, c.name AS chapter_name, q.type, q.stem, q.answer_text
    FROM wrong_questions wq
    JOIN questions q ON q.id = wq.question_id
    JOIN banks b ON b.id = wq.bank_id
    JOIN chapters c ON c.id = wq.chapter_id
    WHERE wq.user_id = ? AND wq.resolved_at IS NULL
    ORDER BY wq.updated_at DESC
    LIMIT 100
  `).bind(userId).all();

  const exams = await env.DB.prepare(`
    SELECT source, bank_id, COUNT(*) AS question_count,
      SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS correct_count,
      MIN(created_at) AS started_at,
      MAX(created_at) AS submitted_at
    FROM attempts
    WHERE user_id = ? AND source = 'exam'
    GROUP BY bank_id, source, CAST(created_at / 600000 AS INTEGER)
    ORDER BY submitted_at DESC
    LIMIT 20
  `).bind(userId).all();

  const recentAttempts = await env.DB.prepare(`
    SELECT a.id, a.bank_id, a.question_id, a.correct, a.source, a.created_at,
      b.name AS bank_name, q.stem AS question_stem
    FROM attempts a
    JOIN banks b ON b.id = a.bank_id
    JOIN questions q ON q.id = a.question_id
    WHERE a.user_id = ?
    ORDER BY a.created_at DESC
    LIMIT 30
  `).bind(userId).all();

  return ok({
    user,
    joinedBanks: joinedBanks.results || [],
    chapterStats: chapterStats.results || [],
    wrongQuestions: wrongQuestions.results || [],
    exams: exams.results || [],
    recentAttempts: recentAttempts.results || []
  }, env);
}

async function deleteAdminUser(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const userId = String(body.userId || '').trim();
  if (!userId) return fail('缺少用户 ID', 400, env);

  const user = await env.DB.prepare('SELECT id, role, name, phone FROM users WHERE id = ?').bind(userId).first();
  if (!user) return fail('用户不存在', 404, env);
  if (user.role !== 'user') return fail('不能删除管理员账号', 403, env);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM user_banks WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM attempts WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM wrong_questions WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM favorites WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM entitlements WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM orders WHERE user_id = ?').bind(userId),
    env.DB.prepare('UPDATE activation_codes SET used_by = NULL, used_at = NULL WHERE used_by = ?').bind(userId),
    env.DB.prepare('UPDATE feedback SET user_id = NULL WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId)
  ]);

  await recordAdminLog(request, env, {
    action: 'user.delete',
    targetType: 'user',
    targetId: userId,
    detail: { name: user.name, phone: user.phone }
  });

  return ok({ ok: true, deletedUserId: userId }, env);
}

async function listAdminLogs(request, env) {
  requireAdmin(request);
  const rows = await env.DB.prepare(`
    SELECT id, admin_id, action, target_type, target_id, detail_json, ip, user_agent, created_at
    FROM admin_logs
    ORDER BY created_at DESC
    LIMIT 100
  `).all();
  return ok({ logs: (rows.results || []).map((row) => ({ ...row, detail: parseJson(row.detail_json, {}) })) }, env);
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
  const rows = banks.results || [];
  const chapters = await env.DB.prepare('SELECT id, bank_id, name, sort_order FROM chapters ORDER BY sort_order ASC').all();
  const chaptersByBank = groupBy(chapters.results || [], 'bank_id');
  return ok({ banks: rows.map((bank) => ({ ...bank, chapters: chaptersByBank[bank.id] || [] })) }, env);
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
  await recordAdminLog(request, env, {
    action: 'bank.import',
    targetType: 'bank',
    targetId: bankId,
    detail: { name: bank.name, questionCount: questions.length, chapterCount: chapterNames.length }
  });
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
  await recordAdminLog(request, env, {
    action: 'activation_codes.create',
    targetType: 'plan',
    targetId: planId,
    detail: { count, planName: plan.name }
  });
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
  headers.set('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS');
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

function groupBy(list, field) {
  return list.reduce((acc, item) => {
    const key = item[field];
    acc[key] ||= [];
    acc[key].push(item);
    return acc;
  }, {});
}

function publicUser(user) {
  if (!user) return null;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text || '');
  } catch {
    return fallback;
  }
}

async function recordAdminLog(request, env, { adminId = '', action, targetType = '', targetId = '', detail = {} }) {
  try {
    const actorId = adminId || request.headers.get('x-user-id') || '';
    const ip = request.headers.get('cf-connecting-ip') || '';
    const userAgent = request.headers.get('user-agent') || '';
    await env.DB.prepare(`
      INSERT INTO admin_logs (id, admin_id, action, target_type, target_id, detail_json, ip, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id('log'), actorId, action, targetType, targetId, JSON.stringify(detail), ip, userAgent.slice(0, 300), now()).run();
  } catch (error) {
    console.warn('recordAdminLog failed', error.message);
  }
}

async function hashPassword(password) {
  const bytes = new TextEncoder().encode(String(password));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
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
