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
      if (route === 'GET /api/auth/session') return getSession(request, env);
      if (route === 'POST /api/auth/register') return register(request, env);
      if (route === 'POST /api/auth/login') return login(request, env);
      if (route === 'POST /api/admin/login') return adminLogin(request, env);
      if (route === 'GET /api/admin/accounts') return listAdminAccounts(request, env);
      if (route === 'POST /api/admin/accounts') return createAdminAccount(request, env);
      if (route === 'PUT /api/admin/accounts') return updateAdminAccount(request, env);
      if (route === 'DELETE /api/admin/accounts') return deleteAdminAccount(request, env);
      if (route === 'GET /api/admin/users') return listAdminUsers(request, env);
      if (route === 'GET /api/admin/user-detail') return getAdminUserDetail(request, env);
      if (route === 'DELETE /api/admin/users') return deleteAdminUser(request, env);
      if (route === 'POST /api/admin/entitlements') return createAdminEntitlement(request, env);
      if (route === 'DELETE /api/admin/entitlements') return deleteAdminEntitlement(request, env);
      if (route === 'GET /api/admin/logs') return listAdminLogs(request, env);
      if (route === 'GET /api/admin/orders') return listAdminOrders(request, env);
      if (route === 'POST /api/admin/orders/mark-paid') return adminMarkOrderPaid(request, env);
      if (route === 'GET /api/banks') return listBanks(request, env);
      if (route === 'GET /api/questions') return listQuestions(request, env);
      if (route === 'POST /api/user-banks/join') return joinBank(request, env);
      if (route === 'GET /api/user/orders') return listUserOrders(request, env);
      if (route === 'POST /api/user/orders') return createUserOrder(request, env);
      if (route === 'POST /api/user/activation-codes/redeem') return redeemActivationCode(request, env);
      if (route === 'GET /api/pay/notify/epay') return handleEpayNotify(request, env);
      if (route === 'GET /api/pay/return/epay') return handleEpayReturn(request, env);
      if (route === 'POST /api/answers') return submitAnswer(request, env);
      if (route === 'POST /api/favorites/toggle') return toggleFavorite(request, env);
      if (route === 'POST /api/admin/import-bank') return importBank(request, env);
      if (route === 'PUT /api/admin/banks') return updateAdminBank(request, env);
      if (route === 'DELETE /api/admin/banks') return deleteAdminBank(request, env);
      if (route === 'POST /api/admin/chapters') return createAdminChapter(request, env);
      if (route === 'PUT /api/admin/chapters') return updateAdminChapter(request, env);
      if (route === 'DELETE /api/admin/chapters') return deleteAdminChapter(request, env);
      if (route === 'POST /api/admin/questions') return createAdminQuestion(request, env);
      if (route === 'PUT /api/admin/questions') return updateAdminQuestion(request, env);
      if (route === 'DELETE /api/admin/questions') return deleteAdminQuestion(request, env);
      if (route === 'POST /api/admin/activation-codes') return createActivationCodes(request, env);

      return fail('接口不存在', 404, env, { requestId });
    } catch (error) {
      if (error instanceof HttpError) return fail(error.message, error.status, env, { requestId });
      ctx.waitUntil(logError(error, requestId));
      return fail('服务器处理失败', 500, env, { requestId });
    }
  }
};

async function getSession(request, env) {
  const userId = getUserId(request);
  if (!userId) return fail('未登录', 401, env);
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!user) return fail('登录已失效，请重新登录', 401, env);
  if (user.role === 'admin') requireAdmin(request);
  return ok({ user: publicUser(user) }, env);
}

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
  const phone = String(body.phone || '').trim();
  const password = String(body.password || '');
  if (!phone || !password) return fail('\u8bf7\u8f93\u5165\u624b\u673a\u53f7\u548c\u5bc6\u7801', 400, env);

  const user = await env.DB.prepare('SELECT * FROM users WHERE phone = ? AND role = ?').bind(phone, 'user').first();
  if (!user) return fail('\u8d26\u53f7\u4e0d\u5b58\u5728\uff0c\u8bf7\u5148\u6ce8\u518c', 404, env);
  if (!user.password_hash) return fail('\u8be5\u8d26\u53f7\u5c1a\u672a\u8bbe\u7f6e\u5bc6\u7801\uff0c\u8bf7\u91cd\u65b0\u6ce8\u518c\u6216\u8054\u7cfb\u7ba1\u7406\u5458', 401, env);
  if (user.password_hash !== await hashPassword(password)) return fail('\u5bc6\u7801\u9519\u8bef', 401, env);

  return ok({ user: publicUser(user), token: makeSessionToken(user) }, env);
}

async function adminLogin(request, env) {
  const body = await readJson(request);
  const phone = String(body.phone || body.username || 'admin').trim();
  const password = String(body.password || '');
  const admin = await env.DB.prepare('SELECT * FROM users WHERE role = ? AND phone = ? LIMIT 1').bind('admin', phone).first();
  let user = admin;
  if (!user && phone === 'admin') {
    user = { id: 'admin-default', role: 'admin', name: '\u7ba1\u7406\u5458', phone: 'admin', admin_role: 'super_admin', admin_enabled: 1 };
  }
  if (!user || Number(user.admin_enabled ?? 1) !== 1) return fail('管理员账号不存在或已停用', 401, env);
  const expected = user.password_hash ? user.password_hash : await hashPassword(env.ADMIN_PASSWORD || 'admin123');
  if (expected !== await hashPassword(password)) return fail('\u7ba1\u7406\u5458\u5bc6\u7801\u9519\u8bef', 401, env);
  await env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(now(), now(), user.id).run().catch(() => {});
  await recordAdminLog(request, env, {
    adminId: user.id,
    action: 'admin.login',
    targetType: 'admin',
    targetId: user.id,
    detail: { phone: user.phone }
  });
  return ok({ user: publicUser(user), token: 'admin-demo-token' }, env);
}

async function listAdminAccounts(request, env) {
  requireAdmin(request);
  const rows = await env.DB.prepare(`
    SELECT id, role, name, phone, admin_role, admin_enabled, last_login_at, created_at, updated_at
    FROM users
    WHERE role = 'admin'
    ORDER BY created_at DESC
  `).all();
  return ok({ admins: rows.results || [] }, env);
}

async function createAdminAccount(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const password = String(body.password || '');
  const adminRole = String(body.adminRole || body.admin_role || 'operator').trim();
  if (!name || !phone || !password) return fail('请输入管理员姓名、账号和密码', 400, env);
  if (password.length < 6) return fail('密码至少需要 6 位', 400, env);
  const existing = await env.DB.prepare('SELECT id FROM users WHERE phone = ?').bind(phone).first();
  if (existing) return fail('该账号已存在', 409, env);
  const timestamp = now();
  const admin = { id: id('admin'), role: 'admin', name, phone, admin_role: adminRole, admin_enabled: 1, created_at: timestamp, updated_at: timestamp };
  await env.DB.prepare(`
    INSERT INTO users (id, role, name, phone, password_hash, admin_role, admin_enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(admin.id, admin.role, admin.name, admin.phone, await hashPassword(password), admin.admin_role, 1, timestamp, timestamp).run();
  await recordAdminLog(request, env, { action: 'admin.create', targetType: 'admin', targetId: admin.id, detail: { name, phone, adminRole } });
  return ok({ admin }, env);
}

async function updateAdminAccount(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const adminId = String(body.id || '').trim();
  const patch = body.patch || body;
  if (!adminId) return fail('缺少管理员 ID', 400, env);
  const admin = await env.DB.prepare('SELECT * FROM users WHERE id = ? AND role = ?').bind(adminId, 'admin').first();
  if (!admin) return fail('管理员不存在', 404, env);
  const nextName = String(patch.name ?? admin.name).trim();
  const nextRole = String(patch.adminRole ?? patch.admin_role ?? admin.admin_role ?? 'operator').trim();
  const nextEnabled = patch.adminEnabled ?? patch.admin_enabled ?? admin.admin_enabled ?? 1;
  const statements = [
    env.DB.prepare('UPDATE users SET name = ?, admin_role = ?, admin_enabled = ?, updated_at = ? WHERE id = ?')
      .bind(nextName, nextRole, Number(nextEnabled) ? 1 : 0, now(), adminId)
  ];
  if (patch.password) {
    if (String(patch.password).length < 6) return fail('密码至少需要 6 位', 400, env);
    statements.push(env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(await hashPassword(patch.password), now(), adminId));
  }
  await env.DB.batch(statements);
  await recordAdminLog(request, env, { action: 'admin.update', targetType: 'admin', targetId: adminId, detail: { name: nextName, adminRole: nextRole, adminEnabled: Number(nextEnabled) ? 1 : 0 } });
  return ok({ ok: true }, env);
}

async function deleteAdminAccount(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const adminId = String(body.id || '').trim();
  if (!adminId) return fail('缺少管理员 ID', 400, env);
  const admin = await env.DB.prepare('SELECT * FROM users WHERE id = ? AND role = ?').bind(adminId, 'admin').first();
  if (!admin) return fail('管理员不存在', 404, env);
  if (admin.phone === 'admin') return fail('默认管理员不能删除，只能停用其他管理员', 403, env);
  await env.DB.prepare('DELETE FROM users WHERE id = ? AND role = ?').bind(adminId, 'admin').run();
  await recordAdminLog(request, env, { action: 'admin.delete', targetType: 'admin', targetId: adminId, detail: { name: admin.name, phone: admin.phone } });
  return ok({ ok: true }, env);
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
      COUNT(DISTINCT CASE WHEN a.correct = 1 THEN a.id END) AS correct_count,
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
      COUNT(DISTINCT CASE WHEN a.correct = 1 THEN a.id END) AS correct_count,
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

  const entitlements = await env.DB.prepare(`
    SELECT e.*, p.name AS plan_name, b.name AS bank_name
    FROM entitlements e
    LEFT JOIN plans p ON p.id = e.plan_id
    LEFT JOIN banks b ON b.id = e.bank_id
    WHERE e.user_id = ?
    ORDER BY e.created_at DESC
  `).bind(userId).all();

  return ok({
    user,
    joinedBanks: joinedBanks.results || [],
    chapterStats: chapterStats.results || [],
    wrongQuestions: wrongQuestions.results || [],
    exams: exams.results || [],
    recentAttempts: recentAttempts.results || [],
    entitlements: (entitlements.results || []).map(readEntitlementRow)
  }, env);
}

async function createAdminEntitlement(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const userId = String(body.userId || body.user_id || '').trim();
  let planId = String(body.planId || body.plan_id || '').trim();
  const bankId = String(body.bankId || body.bank_id || '').trim();
  if (!userId || (!planId && !bankId)) return fail('缺少用户或授权项目', 400, env);
  const user = await env.DB.prepare('SELECT id, name, phone FROM users WHERE id = ? AND role = ?').bind(userId, 'user').first();
  if (!user) return fail('用户不存在', 404, env);
  let bank = null;
  if (bankId) {
    bank = await env.DB.prepare('SELECT * FROM banks WHERE id = ?').bind(bankId).first();
    if (!bank) return fail('题库不存在', 404, env);
    planId = await ensureBankPlan(env, bank);
  }
  const plan = await env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(planId).first();
  if (!plan) return fail('授权项目不存在', 404, env);
  const entitlement = await grantEntitlement(env, userId, {
    type: plan.type,
    bankId: plan.bank_id,
    planId: plan.id,
    durationDays: plan.duration_days,
    source: 'admin'
  });
  if (plan.type === 'bank' && plan.bank_id) {
    await env.DB.prepare('INSERT OR IGNORE INTO user_banks (user_id, bank_id, created_at) VALUES (?, ?, ?)')
      .bind(userId, plan.bank_id, now())
      .run();
  }
  await recordAdminLog(request, env, {
    action: 'user.grant',
    targetType: 'user',
    targetId: userId,
    detail: { userName: user.name, phone: user.phone, planId, planName: plan.name, bankId: plan.bank_id || '', bankName: bank?.name || '', entitlementId: entitlement.id }
  });
  return ok({ ok: true, entitlement }, env);
}

async function deleteAdminEntitlement(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const entitlementId = String(body.entitlementId || body.id || '').trim();
  if (!entitlementId) return fail('缺少授权 ID', 400, env);
  const entitlement = await env.DB.prepare(`
    SELECT e.*, p.name AS plan_name, u.name AS user_name, u.phone AS user_phone
    FROM entitlements e
    LEFT JOIN plans p ON p.id = e.plan_id
    LEFT JOIN users u ON u.id = e.user_id
    WHERE e.id = ?
  `).bind(entitlementId).first();
  if (!entitlement) return fail('授权不存在', 404, env);
  await env.DB.prepare('DELETE FROM entitlements WHERE id = ?').bind(entitlementId).run();
  if (entitlement.type === 'bank' && entitlement.bank_id && !await hasEntitlement(env, entitlement.user_id, entitlement.bank_id)) {
    await env.DB.prepare('DELETE FROM user_banks WHERE user_id = ? AND bank_id = ?').bind(entitlement.user_id, entitlement.bank_id).run();
  }
  await recordAdminLog(request, env, {
    action: 'user.revoke_grant',
    targetType: 'user',
    targetId: entitlement.user_id,
    detail: { userName: entitlement.user_name, phone: entitlement.user_phone, planName: entitlement.plan_name, entitlementId }
  });
  return ok({ ok: true }, env);
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

async function listAdminOrders(request, env) {
  requireAdmin(request);
  const rows = await env.DB.prepare(`
    SELECT o.*, u.name AS user_name, u.phone AS user_phone, p.name AS plan_name, p.type AS plan_type, p.bank_id, p.duration_days
    FROM orders o
    JOIN users u ON u.id = o.user_id
    JOIN plans p ON p.id = o.plan_id
    ORDER BY o.created_at DESC
    LIMIT 200
  `).all();
  return ok({ orders: (rows.results || []).map(readOrderRow) }, env);
}

async function adminMarkOrderPaid(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const orderId = String(body.orderId || body.id || '').trim();
  if (!orderId) return fail('缺少订单 ID', 400, env);
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) return fail('订单不存在', 404, env);
  const result = await payOrder(env, order, 'manual-admin');
  await recordAdminLog(request, env, {
    action: 'order.mark_paid',
    targetType: 'order',
    targetId: orderId,
    detail: { orderNo: order.order_no, amount: order.amount }
  });
  return ok({ ok: true, order: result.order, entitlement: result.entitlement }, env);
}

async function listBanks(request, env) {
  const userId = getUserId(request);
  const banks = await env.DB.prepare(`
    SELECT b.*,
      COUNT(DISTINCT c.id) AS chapter_count,
      COUNT(DISTINCT q.id) AS question_count,
      CASE WHEN ub.user_id IS NULL THEN 0 ELSE 1 END AS joined,
      CASE
        WHEN b.access_type = 'free' THEN 1
        WHEN EXISTS (
          SELECT 1 FROM entitlements e
          WHERE e.user_id = ?
            AND (e.expires_at IS NULL OR e.expires_at > ?)
            AND (e.type = 'membership' OR e.bank_id = b.id)
        ) THEN 1
        ELSE 0
      END AS has_access
    FROM banks b
    LEFT JOIN chapters c ON c.bank_id = b.id
    LEFT JOIN questions q ON q.bank_id = b.id
    LEFT JOIN user_banks ub ON ub.bank_id = b.id AND ub.user_id = ?
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `).bind(userId || '', now(), userId || '').all();
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
  const bank = await env.DB.prepare('SELECT * FROM banks WHERE id = ? AND status = ?').bind(bankId, 'published').first();
  if (!bank) return fail('题库不存在或未发布', 404, env);
  if (bank.access_type !== 'free' && !await hasEntitlement(env, userId, bankId)) return fail('该题库需要先购买或激活后才能加入', 403, env);
  await env.DB.prepare('INSERT OR IGNORE INTO user_banks (user_id, bank_id, created_at) VALUES (?, ?, ?)')
    .bind(userId, bankId, now())
    .run();
  return ok({ ok: true }, env);
}

async function listUserOrders(request, env) {
  const userId = requireUserId(request);
  const orders = await env.DB.prepare(`
    SELECT o.*, p.name AS plan_name, p.type AS plan_type, p.bank_id, p.duration_days
    FROM orders o
    JOIN plans p ON p.id = o.plan_id
    WHERE o.user_id = ?
    ORDER BY o.created_at DESC
    LIMIT 100
  `).bind(userId).all();
  const entitlements = await env.DB.prepare(`
    SELECT e.*, p.name AS plan_name, b.name AS bank_name
    FROM entitlements e
    LEFT JOIN plans p ON p.id = e.plan_id
    LEFT JOIN banks b ON b.id = e.bank_id
    WHERE e.user_id = ? AND (e.expires_at IS NULL OR e.expires_at > ?)
    ORDER BY e.created_at DESC
  `).bind(userId, now()).all();
  return ok({
    orders: (orders.results || []).map(readOrderRow),
    entitlements: (entitlements.results || []).map(readEntitlementRow)
  }, env);
}

async function createUserOrder(request, env) {
  const userId = requireUserId(request);
  const body = await readJson(request);
  const channel = normalizePayChannel(body.channel);
  const bankId = String(body.bankId || body.bank_id || '').trim();
  let planId = String(body.planId || body.plan_id || '').trim();

  if (bankId && !planId) {
    const bank = await env.DB.prepare('SELECT * FROM banks WHERE id = ? AND status = ?').bind(bankId, 'published').first();
    if (!bank) return fail('题库不存在或未发布', 404, env);
    if (bank.access_type === 'free' || Number(bank.price) <= 0) return fail('免费题库无需购买', 400, env);
    if (await hasEntitlement(env, userId, bankId)) return fail('你已经拥有该题库权限', 409, env);
    planId = await ensureBankPlan(env, bank);
  }

  if (!planId) return fail('缺少购买项目', 400, env);
  const plan = await env.DB.prepare('SELECT * FROM plans WHERE id = ? AND enabled = 1').bind(planId).first();
  if (!plan) return fail('套餐不存在或已下架', 404, env);
  if (plan.type === 'bank' && plan.bank_id && await hasEntitlement(env, userId, plan.bank_id)) return fail('你已经拥有该题库权限', 409, env);

  const timestamp = now();
  const order = {
    id: id('order'),
    orderNo: makeOrderNo(),
    userId,
    planId: plan.id,
    amount: Number(plan.price) || 0,
    status: Number(plan.price) > 0 ? 'pending' : 'paid',
    channel,
    createdAt: timestamp,
    paidAt: Number(plan.price) > 0 ? null : timestamp
  };

  await env.DB.prepare(`
    INSERT INTO orders (id, order_no, user_id, plan_id, amount, status, channel, created_at, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(order.id, order.orderNo, order.userId, order.planId, order.amount, order.status, order.channel, order.createdAt, order.paidAt).run();

  let entitlement = null;
  if (order.status === 'paid') {
    const paid = await payOrder(env, { id: order.id, plan_id: plan.id, user_id: userId, status: 'pending' }, 'free-order');
    entitlement = paid.entitlement;
  }

  return ok({
    ok: true,
    order: { ...order, planName: plan.name, planType: plan.type, bankId: plan.bank_id, durationDays: plan.duration_days },
    entitlement,
    payment: await buildPayment(order, plan, request, env)
  }, env);
}

async function redeemActivationCode(request, env) {
  const userId = requireUserId(request);
  const body = await readJson(request);
  const code = String(body.code || '').trim().toUpperCase();
  if (!code) return fail('请输入激活码', 400, env);
  const activation = await env.DB.prepare(`
    SELECT ac.*, p.name AS plan_name, p.type AS plan_type, p.bank_id, p.duration_days, p.price
    FROM activation_codes ac
    JOIN plans p ON p.id = ac.plan_id
    WHERE ac.code = ?
  `).bind(code).first();
  if (!activation) return fail('激活码不存在', 404, env);
  if (activation.used_by) return fail('激活码已被使用', 409, env);
  const timestamp = now();
  const order = {
    id: id('order'),
    orderNo: makeOrderNo(),
    userId,
    planId: activation.plan_id,
    amount: Number(activation.price) || 0,
    status: 'paid',
    channel: 'activation-code',
    createdAt: timestamp,
    paidAt: timestamp
  };
  await env.DB.batch([
    env.DB.prepare('UPDATE activation_codes SET used_by = ?, used_at = ? WHERE id = ?').bind(userId, timestamp, activation.id),
    env.DB.prepare(`
      INSERT INTO orders (id, order_no, user_id, plan_id, amount, status, channel, code, created_at, paid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(order.id, order.orderNo, userId, activation.plan_id, order.amount, order.status, order.channel, code, timestamp, timestamp)
  ]);
  const entitlement = await grantEntitlement(env, userId, {
    type: activation.plan_type,
    bankId: activation.bank_id,
    planId: activation.plan_id,
    durationDays: activation.duration_days,
    source: 'activation-code'
  });
  return ok({ ok: true, message: '激活成功', order, entitlement }, env);
}

async function handleEpayNotify(request, env) {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const verify = await verifyEpayParams(params, env);
  if (!verify.ok) return textResponse('fail', 400, env);
  if (!['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(String(params.trade_status || ''))) return textResponse('fail', 400, env);

  const orderNo = String(params.out_trade_no || '').trim();
  const order = await env.DB.prepare('SELECT * FROM orders WHERE order_no = ?').bind(orderNo).first();
  if (!order) return textResponse('fail', 404, env);
  const paidAmount = Number(params.money || params.total_fee || 0);
  if (Math.abs(Number(order.amount) - paidAmount) > 0.01) return textResponse('fail', 400, env);

  if (order.status !== 'paid') await payOrder(env, order, 'epay');
  return textResponse('success', 200, env);
}

async function handleEpayReturn(request, env) {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const verify = await verifyEpayParams(params, env);
  const target = new URL(env.FRONTEND_URL || 'https://www.090105.xyz');
  target.pathname = '/';
  target.searchParams.set('payment', verify.ok ? 'success' : 'failed');
  if (params.out_trade_no) target.searchParams.set('order', params.out_trade_no);
  return Response.redirect(target.toString(), 302);
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

async function updateAdminBank(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const bankId = String(body.id || body.bankId || '').trim();
  if (!bankId) return fail('缺少题库 ID', 400, env);
  const bank = await env.DB.prepare('SELECT * FROM banks WHERE id = ?').bind(bankId).first();
  if (!bank) return fail('题库不存在', 404, env);
  const name = String(body.name ?? bank.name).trim() || bank.name;
  const description = String(body.description ?? bank.description ?? '').trim();
  const status = ['published', 'hidden'].includes(body.status) ? body.status : bank.status;
  const accessType = ['free', 'paid'].includes(body.accessType || body.access_type) ? (body.accessType || body.access_type) : bank.access_type;
  const price = Number(body.price ?? bank.price) || 0;
  await env.DB.prepare(`
    UPDATE banks SET name = ?, description = ?, status = ?, access_type = ?, price = ?, updated_at = ? WHERE id = ?
  `).bind(name, description, status, accessType, price, now(), bankId).run();
  await recordAdminLog(request, env, { action: 'bank.update', targetType: 'bank', targetId: bankId, detail: { name, status, accessType, price } });
  return ok({ ok: true }, env);
}

async function deleteAdminBank(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const bankId = String(body.id || body.bankId || '').trim();
  if (!bankId) return fail('缺少题库 ID', 400, env);
  const bank = await env.DB.prepare('SELECT * FROM banks WHERE id = ?').bind(bankId).first();
  if (!bank) return fail('题库不存在', 404, env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM attempts WHERE bank_id = ?').bind(bankId),
    env.DB.prepare('DELETE FROM wrong_questions WHERE bank_id = ?').bind(bankId),
    env.DB.prepare('DELETE FROM favorites WHERE bank_id = ?').bind(bankId),
    env.DB.prepare('DELETE FROM user_banks WHERE bank_id = ?').bind(bankId),
    env.DB.prepare('DELETE FROM entitlements WHERE bank_id = ?').bind(bankId),
    env.DB.prepare('DELETE FROM questions WHERE bank_id = ?').bind(bankId),
    env.DB.prepare('DELETE FROM chapters WHERE bank_id = ?').bind(bankId),
    env.DB.prepare('DELETE FROM exam_templates WHERE bank_id = ?').bind(bankId),
    env.DB.prepare('DELETE FROM banks WHERE id = ?').bind(bankId)
  ]);
  await recordAdminLog(request, env, { action: 'bank.delete', targetType: 'bank', targetId: bankId, detail: { name: bank.name } });
  return ok({ ok: true }, env);
}

async function createAdminChapter(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const bankId = String(body.bankId || body.bank_id || '').trim();
  const name = String(body.name || '').trim();
  if (!bankId || !name) return fail('缺少题库 ID 或章节名称', 400, env);
  const bank = await env.DB.prepare('SELECT id FROM banks WHERE id = ?').bind(bankId).first();
  if (!bank) return fail('题库不存在', 404, env);
  const latest = await env.DB.prepare('SELECT MAX(sort_order) AS max_sort FROM chapters WHERE bank_id = ?').bind(bankId).first();
  const chapter = { id: id('ch'), bankId, name, sortOrder: Number(latest?.max_sort || 0) + 1, createdAt: now() };
  await env.DB.prepare('INSERT INTO chapters (id, bank_id, name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(chapter.id, chapter.bankId, chapter.name, chapter.sortOrder, chapter.createdAt)
    .run();
  await recordAdminLog(request, env, { action: 'chapter.create', targetType: 'chapter', targetId: chapter.id, detail: { bankId, name } });
  return ok({ chapter }, env);
}

async function updateAdminChapter(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const chapterId = String(body.id || body.chapterId || '').trim();
  if (!chapterId) return fail('缺少章节 ID', 400, env);
  const chapter = await env.DB.prepare('SELECT * FROM chapters WHERE id = ?').bind(chapterId).first();
  if (!chapter) return fail('章节不存在', 404, env);
  const name = String(body.name ?? chapter.name).trim() || chapter.name;
  const sortOrder = Number(body.sortOrder ?? body.sort_order ?? chapter.sort_order) || chapter.sort_order;
  await env.DB.prepare('UPDATE chapters SET name = ?, sort_order = ? WHERE id = ?').bind(name, sortOrder, chapterId).run();
  await recordAdminLog(request, env, { action: 'chapter.update', targetType: 'chapter', targetId: chapterId, detail: { bankId: chapter.bank_id, name, sortOrder } });
  return ok({ ok: true }, env);
}

async function deleteAdminChapter(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const chapterId = String(body.id || body.chapterId || '').trim();
  if (!chapterId) return fail('缺少章节 ID', 400, env);
  const chapter = await env.DB.prepare('SELECT * FROM chapters WHERE id = ?').bind(chapterId).first();
  if (!chapter) return fail('章节不存在', 404, env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM attempts WHERE question_id IN (SELECT id FROM questions WHERE chapter_id = ?)').bind(chapterId),
    env.DB.prepare('DELETE FROM wrong_questions WHERE chapter_id = ?').bind(chapterId),
    env.DB.prepare('DELETE FROM favorites WHERE question_id IN (SELECT id FROM questions WHERE chapter_id = ?)').bind(chapterId),
    env.DB.prepare('DELETE FROM questions WHERE chapter_id = ?').bind(chapterId),
    env.DB.prepare('DELETE FROM chapters WHERE id = ?').bind(chapterId)
  ]);
  await recordAdminLog(request, env, { action: 'chapter.delete', targetType: 'chapter', targetId: chapterId, detail: { bankId: chapter.bank_id, name: chapter.name } });
  return ok({ ok: true }, env);
}

async function createAdminQuestion(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const bankId = String(body.bankId || body.bank_id || '').trim();
  const chapterId = String(body.chapterId || body.chapter_id || '').trim();
  const type = String(body.type || 'single').trim();
  const stem = String(body.stem || '').trim();
  if (!bankId || !chapterId || !stem) return fail('缺少题库、章节或题干', 400, env);
  const chapter = await env.DB.prepare('SELECT id FROM chapters WHERE id = ? AND bank_id = ?').bind(chapterId, bankId).first();
  if (!chapter) return fail('章节不存在或不属于该题库', 404, env);
  const answer = normalizeAnswer(body.answer || body.answerText || []);
  if (!answer.length) return fail('请填写答案', 400, env);
  const latest = await env.DB.prepare('SELECT MAX(sort_order) AS max_sort FROM questions WHERE bank_id = ?').bind(bankId).first();
  const questionId = id('q');
  await env.DB.prepare(`
    INSERT INTO questions (id, bank_id, chapter_id, type, stem, options_json, answer_json, answer_text, analysis, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    questionId,
    bankId,
    chapterId,
    type,
    stem,
    JSON.stringify(normalizeOptionsPayload(body.options || [])),
    JSON.stringify(answer),
    body.answerText || answer.join('、'),
    String(body.analysis || '').trim(),
    Number(latest?.max_sort || 0) + 1,
    now()
  ).run();
  await recordAdminLog(request, env, { action: 'question.create', targetType: 'question', targetId: questionId, detail: { bankId, chapterId, type } });
  return ok({ questionId }, env);
}

async function updateAdminQuestion(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const questionId = String(body.id || body.questionId || '').trim();
  if (!questionId) return fail('缺少题目 ID', 400, env);
  const question = await env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(questionId).first();
  if (!question) return fail('题目不存在', 404, env);
  const nextChapterId = String(body.chapterId || body.chapter_id || question.chapter_id).trim();
  const chapter = await env.DB.prepare('SELECT id FROM chapters WHERE id = ? AND bank_id = ?').bind(nextChapterId, question.bank_id).first();
  if (!chapter) return fail('章节不存在或不属于该题库', 404, env);
  const type = String(body.type ?? question.type).trim();
  const stem = String(body.stem ?? question.stem).trim();
  const answer = normalizeAnswer(body.answer ?? parseJson(question.answer_json, []));
  if (!stem || !answer.length) return fail('题干和答案不能为空', 400, env);
  await env.DB.prepare(`
    UPDATE questions SET chapter_id = ?, type = ?, stem = ?, options_json = ?, answer_json = ?, answer_text = ?, analysis = ?, sort_order = ? WHERE id = ?
  `).bind(
    nextChapterId,
    type,
    stem,
    JSON.stringify(normalizeOptionsPayload(body.options ?? parseJson(question.options_json, []))),
    JSON.stringify(answer),
    body.answerText || answer.join('、'),
    String(body.analysis ?? question.analysis ?? '').trim(),
    Number(body.sortOrder ?? body.sort_order ?? question.sort_order) || question.sort_order,
    questionId
  ).run();
  await recordAdminLog(request, env, { action: 'question.update', targetType: 'question', targetId: questionId, detail: { bankId: question.bank_id, chapterId: nextChapterId, type } });
  return ok({ ok: true }, env);
}

async function deleteAdminQuestion(request, env) {
  requireAdmin(request);
  const body = await readJson(request);
  const questionId = String(body.id || body.questionId || '').trim();
  if (!questionId) return fail('缺少题目 ID', 400, env);
  const question = await env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(questionId).first();
  if (!question) return fail('题目不存在', 404, env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM attempts WHERE question_id = ?').bind(questionId),
    env.DB.prepare('DELETE FROM wrong_questions WHERE question_id = ?').bind(questionId),
    env.DB.prepare('DELETE FROM favorites WHERE question_id = ?').bind(questionId),
    env.DB.prepare('DELETE FROM questions WHERE id = ?').bind(questionId)
  ]);
  await recordAdminLog(request, env, { action: 'question.delete', targetType: 'question', targetId: questionId, detail: { bankId: question.bank_id, stem: question.stem } });
  return ok({ ok: true }, env);
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

function readOrderRow(row) {
  return {
    id: row.id,
    orderNo: row.order_no,
    userId: row.user_id,
    userName: row.user_name || '',
    userPhone: row.user_phone || '',
    planId: row.plan_id,
    planName: row.plan_name || '套餐',
    planType: row.plan_type || '',
    bankId: row.bank_id || '',
    durationDays: row.duration_days || 0,
    amount: row.amount,
    status: row.status,
    channel: row.channel,
    code: row.code || '',
    createdAt: row.created_at,
    paidAt: row.paid_at
  };
}

function readEntitlementRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    bankId: row.bank_id || '',
    bankName: row.bank_name || '',
    planId: row.plan_id || '',
    planName: row.plan_name || '授权',
    source: row.source,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

async function hasEntitlement(env, userId, bankId) {
  const timestamp = now();
  const row = await env.DB.prepare(`
    SELECT id FROM entitlements
    WHERE user_id = ?
      AND (expires_at IS NULL OR expires_at > ?)
      AND (type = 'membership' OR bank_id = ?)
    LIMIT 1
  `).bind(userId, timestamp, bankId).first();
  return Boolean(row);
}

async function ensureBankPlan(env, bank) {
  const planId = `plan-bank-${bank.id}`;
  const existing = await env.DB.prepare('SELECT id FROM plans WHERE id = ?').bind(planId).first();
  if (!existing) {
    await env.DB.prepare(`
      INSERT INTO plans (id, name, type, bank_id, duration_days, price, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(planId, `${bank.name} 单题库授权`, 'bank', bank.id, 365, Number(bank.price) || 0, 1, now()).run();
  } else {
    await env.DB.prepare('UPDATE plans SET name = ?, bank_id = ?, price = ?, enabled = 1 WHERE id = ?')
      .bind(`${bank.name} 单题库授权`, bank.id, Number(bank.price) || 0, planId)
      .run();
  }
  return planId;
}

async function grantEntitlement(env, userId, grant) {
  const timestamp = now();
  const expiresAt = Number(grant.durationDays) > 0 ? timestamp + Number(grant.durationDays) * 86400000 : null;
  const entitlement = {
    id: id('grant'),
    userId,
    type: grant.type || 'bank',
    bankId: grant.bankId || null,
    planId: grant.planId || null,
    source: grant.source || 'payment',
    createdAt: timestamp,
    expiresAt
  };
  await env.DB.prepare(`
    INSERT INTO entitlements (id, user_id, type, bank_id, plan_id, source, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(entitlement.id, entitlement.userId, entitlement.type, entitlement.bankId, entitlement.planId, entitlement.source, entitlement.createdAt, entitlement.expiresAt).run();
  return entitlement;
}

async function payOrder(env, order, source = 'payment') {
  const fullOrder = await env.DB.prepare(`
    SELECT o.*, p.name AS plan_name, p.type AS plan_type, p.bank_id, p.duration_days
    FROM orders o
    JOIN plans p ON p.id = o.plan_id
    WHERE o.id = ?
  `).bind(order.id).first();
  if (!fullOrder) throw new HttpError('订单不存在', 404);
  if (fullOrder.status === 'paid') return { order: readOrderRow(fullOrder), entitlement: null };
  const timestamp = now();
  await env.DB.prepare('UPDATE orders SET status = ?, channel = ?, paid_at = ? WHERE id = ?')
    .bind('paid', source === 'manual-admin' ? 'manual-admin' : fullOrder.channel, timestamp, fullOrder.id)
    .run();
  const entitlement = await grantEntitlement(env, fullOrder.user_id, {
    type: fullOrder.plan_type,
    bankId: fullOrder.bank_id,
    planId: fullOrder.plan_id,
    durationDays: fullOrder.duration_days,
    source
  });
  return { order: readOrderRow({ ...fullOrder, status: 'paid', paid_at: timestamp }), entitlement };
}

function normalizePayChannel(channel) {
  const value = String(channel || 'alipay').trim();
  return ['alipay', 'wechat', 'reserved-payment'].includes(value) ? value : 'alipay';
}

async function buildPayment(order, plan, request, env) {
  if (env.EPAY_GATEWAY && env.EPAY_PID && env.EPAY_KEY && Number(order.amount) > 0) {
    const baseUrl = new URL(request.url);
    const siteUrl = env.FRONTEND_URL || 'https://www.090105.xyz';
    const notifyUrl = `${baseUrl.origin}/api/pay/notify/epay`;
    const returnUrl = `${baseUrl.origin}/api/pay/return/epay`;
    const params = {
      pid: env.EPAY_PID,
      type: order.channel === 'wechat' ? 'wxpay' : 'alipay',
      out_trade_no: order.orderNo,
      notify_url: notifyUrl,
      return_url: returnUrl,
      name: plan.name,
      money: formatMoney(order.amount),
      sitename: env.EPAY_SITE_NAME || '题库练习平台'
    };
    params.sign = epaySign(params, env.EPAY_KEY);
    params.sign_type = 'MD5';
    return {
      mode: 'epay',
      channel: order.channel,
      gateway: normalizeGateway(env.EPAY_GATEWAY),
      paymentUrl: `${normalizeGateway(env.EPAY_GATEWAY)}/submit.php?${new URLSearchParams(params).toString()}`,
      notifyUrl,
      returnUrl,
      siteUrl,
      subject: plan.name,
      amount: order.amount
    };
  }
  return {
    mode: 'reserved',
    channel: order.channel,
    message: '易支付参数未配置；现在只生成待支付订单。',
    subject: plan.name,
    amount: order.amount
  };
}

async function verifyEpayParams(params, env) {
  if (!env.EPAY_KEY) return { ok: false, message: 'missing key' };
  const sign = String(params.sign || '').toLowerCase();
  if (!sign) return { ok: false, message: 'missing sign' };
  const expected = epaySign(params, env.EPAY_KEY).toLowerCase();
  return { ok: sign === expected, expected };
}

function epaySign(params, key) {
  const text = Object.keys(params)
    .filter((name) => params[name] !== undefined && params[name] !== null && params[name] !== '' && name !== 'sign' && name !== 'sign_type')
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join('&');
  return md5(`${text}${key}`);
}

function normalizeGateway(value) {
  return String(value || '').replace(/\/+$/, '');
}

function formatMoney(amount) {
  return (Math.round(Number(amount || 0) * 100) / 100).toFixed(2);
}

function textResponse(text, status, env) {
  return withCors(new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } }), env);
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
  headers.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
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

function normalizeOptionsPayload(options) {
  return (Array.isArray(options) ? options : [])
    .map((option, index) => {
      if (typeof option === 'string') {
        return { key: String.fromCharCode(65 + index), text: option.replace(/^[A-H][\.\、\)]\s*/i, '').trim() };
      }
      return {
        key: String(option.key || String.fromCharCode(65 + index)).trim().toUpperCase(),
        text: String(option.text || '').trim()
      };
    })
    .filter((option) => option.text);
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

function makeOrderNo() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `QB${Date.now()}${suffix}`;
}

function md5(input) {
  function rotateLeft(value, shift) {
    return (value << shift) | (value >>> (32 - shift));
  }
  function addUnsigned(x, y) {
    const x4 = x & 0x40000000;
    const y4 = y & 0x40000000;
    const x8 = x & 0x80000000;
    const y8 = y & 0x80000000;
    const result = (x & 0x3fffffff) + (y & 0x3fffffff);
    if (x4 & y4) return result ^ 0x80000000 ^ x8 ^ y8;
    if (x4 | y4) return (result & 0x40000000) ? result ^ 0xc0000000 ^ x8 ^ y8 : result ^ 0x40000000 ^ x8 ^ y8;
    return result ^ x8 ^ y8;
  }
  const f = (x, y, z) => (x & y) | (~x & z);
  const g = (x, y, z) => (x & z) | (y & ~z);
  const h = (x, y, z) => x ^ y ^ z;
  const i = (x, y, z) => y ^ (x | ~z);
  const transform = (func, a, b, c, d, x, s, ac) => addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, func(b, c, d)), addUnsigned(x, ac)), s), b);
  const utf8 = unescape(encodeURIComponent(String(input)));
  const words = [];
  let byteLength = utf8.length;
  for (let offset = 0; offset < byteLength; offset += 1) words[offset >> 2] |= utf8.charCodeAt(offset) << ((offset % 4) * 8);
  words[byteLength >> 2] |= 0x80 << ((byteLength % 4) * 8);
  words[(((byteLength + 8) >> 6) * 16) + 14] = byteLength * 8;
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;
  for (let k = 0; k < words.length; k += 16) {
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;
    a = transform(f, a, b, c, d, words[k + 0], 7, 0xd76aa478); d = transform(f, d, a, b, c, words[k + 1], 12, 0xe8c7b756); c = transform(f, c, d, a, b, words[k + 2], 17, 0x242070db); b = transform(f, b, c, d, a, words[k + 3], 22, 0xc1bdceee);
    a = transform(f, a, b, c, d, words[k + 4], 7, 0xf57c0faf); d = transform(f, d, a, b, c, words[k + 5], 12, 0x4787c62a); c = transform(f, c, d, a, b, words[k + 6], 17, 0xa8304613); b = transform(f, b, c, d, a, words[k + 7], 22, 0xfd469501);
    a = transform(f, a, b, c, d, words[k + 8], 7, 0x698098d8); d = transform(f, d, a, b, c, words[k + 9], 12, 0x8b44f7af); c = transform(f, c, d, a, b, words[k + 10], 17, 0xffff5bb1); b = transform(f, b, c, d, a, words[k + 11], 22, 0x895cd7be);
    a = transform(f, a, b, c, d, words[k + 12], 7, 0x6b901122); d = transform(f, d, a, b, c, words[k + 13], 12, 0xfd987193); c = transform(f, c, d, a, b, words[k + 14], 17, 0xa679438e); b = transform(f, b, c, d, a, words[k + 15], 22, 0x49b40821);
    a = transform(g, a, b, c, d, words[k + 1], 5, 0xf61e2562); d = transform(g, d, a, b, c, words[k + 6], 9, 0xc040b340); c = transform(g, c, d, a, b, words[k + 11], 14, 0x265e5a51); b = transform(g, b, c, d, a, words[k + 0], 20, 0xe9b6c7aa);
    a = transform(g, a, b, c, d, words[k + 5], 5, 0xd62f105d); d = transform(g, d, a, b, c, words[k + 10], 9, 0x02441453); c = transform(g, c, d, a, b, words[k + 15], 14, 0xd8a1e681); b = transform(g, b, c, d, a, words[k + 4], 20, 0xe7d3fbc8);
    a = transform(g, a, b, c, d, words[k + 9], 5, 0x21e1cde6); d = transform(g, d, a, b, c, words[k + 14], 9, 0xc33707d6); c = transform(g, c, d, a, b, words[k + 3], 14, 0xf4d50d87); b = transform(g, b, c, d, a, words[k + 8], 20, 0x455a14ed);
    a = transform(g, a, b, c, d, words[k + 13], 5, 0xa9e3e905); d = transform(g, d, a, b, c, words[k + 2], 9, 0xfcefa3f8); c = transform(g, c, d, a, b, words[k + 7], 14, 0x676f02d9); b = transform(g, b, c, d, a, words[k + 12], 20, 0x8d2a4c8a);
    a = transform(h, a, b, c, d, words[k + 5], 4, 0xfffa3942); d = transform(h, d, a, b, c, words[k + 8], 11, 0x8771f681); c = transform(h, c, d, a, b, words[k + 11], 16, 0x6d9d6122); b = transform(h, b, c, d, a, words[k + 14], 23, 0xfde5380c);
    a = transform(h, a, b, c, d, words[k + 1], 4, 0xa4beea44); d = transform(h, d, a, b, c, words[k + 4], 11, 0x4bdecfa9); c = transform(h, c, d, a, b, words[k + 7], 16, 0xf6bb4b60); b = transform(h, b, c, d, a, words[k + 10], 23, 0xbebfbc70);
    a = transform(h, a, b, c, d, words[k + 13], 4, 0x289b7ec6); d = transform(h, d, a, b, c, words[k + 0], 11, 0xeaa127fa); c = transform(h, c, d, a, b, words[k + 3], 16, 0xd4ef3085); b = transform(h, b, c, d, a, words[k + 6], 23, 0x04881d05);
    a = transform(h, a, b, c, d, words[k + 9], 4, 0xd9d4d039); d = transform(h, d, a, b, c, words[k + 12], 11, 0xe6db99e5); c = transform(h, c, d, a, b, words[k + 15], 16, 0x1fa27cf8); b = transform(h, b, c, d, a, words[k + 2], 23, 0xc4ac5665);
    a = transform(i, a, b, c, d, words[k + 0], 6, 0xf4292244); d = transform(i, d, a, b, c, words[k + 7], 10, 0x432aff97); c = transform(i, c, d, a, b, words[k + 14], 15, 0xab9423a7); b = transform(i, b, c, d, a, words[k + 5], 21, 0xfc93a039);
    a = transform(i, a, b, c, d, words[k + 12], 6, 0x655b59c3); d = transform(i, d, a, b, c, words[k + 3], 10, 0x8f0ccc92); c = transform(i, c, d, a, b, words[k + 10], 15, 0xffeff47d); b = transform(i, b, c, d, a, words[k + 1], 21, 0x85845dd1);
    a = transform(i, a, b, c, d, words[k + 8], 6, 0x6fa87e4f); d = transform(i, d, a, b, c, words[k + 15], 10, 0xfe2ce6e0); c = transform(i, c, d, a, b, words[k + 6], 15, 0xa3014314); b = transform(i, b, c, d, a, words[k + 13], 21, 0x4e0811a1);
    a = transform(i, a, b, c, d, words[k + 4], 6, 0xf7537e82); d = transform(i, d, a, b, c, words[k + 11], 10, 0xbd3af235); c = transform(i, c, d, a, b, words[k + 2], 15, 0x2ad7d2bb); b = transform(i, b, c, d, a, words[k + 9], 21, 0xeb86d391);
    a = addUnsigned(a, aa);
    b = addUnsigned(b, bb);
    c = addUnsigned(c, cc);
    d = addUnsigned(d, dd);
  }
  return [a, b, c, d].map((value) => {
    let output = '';
    for (let index = 0; index < 4; index += 1) output += ((value >>> (index * 8)) & 0xff).toString(16).padStart(2, '0');
    return output;
  }).join('').toLowerCase();
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
