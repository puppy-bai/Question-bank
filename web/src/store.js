export const defaultExamTemplate = {
  totalQuestions: 30,
  typeRatios: { single: 50, multiple: 20, judge: 30 },
  chapterRatios: {}
};

const storageKey = 'question_bank_web_state_v3';
const oldStorageKeys = ['question_bank_web_state_v2', 'question_bank_web_state_v1'];

const now = () => Date.now();

const sampleChapters = [
  { id: 'ch-basic', name: '基础知识' },
  { id: 'ch-safety', name: '安全规范' },
  { id: 'ch-maintenance', name: '设备维护' }
];

const initialState = {
  version: 3,
  currentUserId: '',
  adminPassword: 'admin123',
  users: [],
  banks: [
    {
      id: 'bank-electric',
      name: '电工理论练习题库',
      description: '覆盖基础知识、安全规范、设备维护等章节，适合日常刷题与模拟考试。',
      status: 'published',
      accessType: 'paid',
      price: 19.9,
      chapters: sampleChapters
    },
    {
      id: 'bank-demo',
      name: '免费体验题库',
      description: '用于体验登录、加入题库、练习、考试、错题和收藏流程。',
      status: 'published',
      accessType: 'free',
      price: 0,
      chapters: [{ id: 'demo-chapter', name: '体验章节' }]
    }
  ],
  questions: [
    q('q1', 'bank-electric', 'ch-basic', '基础知识', 'single', '电路中电流的单位是？', ['伏特', '安培', '欧姆', '瓦特'], ['B'], '安培是电流的国际单位。'),
    q('q2', 'bank-electric', 'ch-basic', '基础知识', 'multiple', '下列属于常见电路参数的是？', ['电压', '电流', '电阻', '湿度'], ['A', 'B', 'C'], '电压、电流、电阻都是常见电路参数。'),
    q('q3', 'bank-electric', 'ch-safety', '安全规范', 'judge', '发现有人触电时，应先切断电源再施救。', [], ['正确'], '先切断电源可以避免二次伤害。'),
    q('q4', 'bank-electric', 'ch-safety', '安全规范', 'single', '安全电压通常指不高于多少伏？', ['12V', '24V', '36V', '220V'], ['C'], '常见安全电压为 36V。'),
    q('q5', 'bank-electric', 'ch-maintenance', '设备维护', 'judge', '设备维护时可以带电拆卸防护罩。', [], ['错误'], '设备维护应遵守停电、验电、挂牌等安全流程。'),
    q('q6', 'bank-electric', 'ch-maintenance', '设备维护', 'single', '万用表测量电阻时应选择哪个档位？', ['Ω 档', 'A 档', 'V 档', 'Hz 档'], ['A'], '电阻测量应使用 Ω 档。'),
    q('q7', 'bank-demo', 'demo-chapter', '体验章节', 'single', '体验题：下面哪个选项是正确答案？', ['正确答案', '干扰项', '干扰项', '干扰项'], ['A'], '这是体验题解析。'),
    q('q8', 'bank-demo', 'demo-chapter', '体验章节', 'multiple', '体验题：可以同时选择哪些选项？', ['选项 A', '选项 B', '错误项', '错误项'], ['A', 'B'], '多选题需要点确认后再判题。'),
    q('q9', 'bank-demo', 'demo-chapter', '体验章节', 'judge', '判断题只显示“正确”和“错误”两个选项。', [], ['正确'], '判断题不再重复显示选项。')
  ],
  plans: [
    { id: 'plan-month', name: '月会员', type: 'membership', durationDays: 30, price: 29, enabled: true },
    { id: 'plan-year', name: '年会员', type: 'membership', durationDays: 365, price: 99, enabled: true },
    { id: 'plan-electric', name: '电工题库单库授权', type: 'bank', bankId: 'bank-electric', durationDays: 365, price: 19.9, enabled: true }
  ],
  userBanks: {},
  entitlements: {},
  activationCodes: [],
  orders: [],
  adminLogs: [],
  selectedUserDetail: null,
  attempts: [],
  wrongQuestions: {},
  favorites: {},
  examTemplates: {
    'bank-electric': {
      totalQuestions: 20,
      typeRatios: { single: 50, multiple: 20, judge: 30 },
      chapterRatios: { 'ch-basic': 35, 'ch-safety': 35, 'ch-maintenance': 30 }
    }
  },
  feedback: []
};

export function createStore() {
  let state = loadState();

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function currentUser() {
    return state.users.find((item) => item.id === state.currentUserId) || null;
  }

  function ensureUserBuckets(userId) {
    state.userBanks[userId] ||= [];
    state.entitlements[userId] ||= [];
    state.wrongQuestions[userId] ||= {};
    state.favorites[userId] ||= [];
  }

  function grantEntitlement(userId, grant) {
    ensureUserBuckets(userId);
    const createdAt = now();
    const expiresAt = grant.durationDays ? createdAt + Number(grant.durationDays) * 86400000 : 0;
    state.entitlements[userId].push({
      id: id('ent'),
      type: grant.type,
      bankId: grant.bankId || '',
      planId: grant.planId || '',
      source: grant.source || 'manual',
      createdAt,
      expiresAt
    });
    if (grant.bankId && !state.userBanks[userId].includes(grant.bankId)) {
      state.userBanks[userId].push(grant.bankId);
    }
  }

  const api = {
    snapshot() {
      const user = currentUser();
      if (user) ensureUserBuckets(user.id);
      const userBankIds = user ? state.userBanks[user.id] || [] : [];
      const favoriteIds = user ? state.favorites[user.id] || [] : [];
      const wrongIds = user ? Object.keys(state.wrongQuestions[user.id] || {}) : [];
      const banks = state.banks.map((bank) => ({
        ...bank,
        questionCount: state.questions.filter((item) => item.bankId === bank.id).length,
        chapterCount: bank.chapters.length,
        hasAccess: user ? api.hasAccess(bank.id, user.id) : bank.accessType === 'free',
        joined: userBankIds.includes(bank.id)
      }));
      return {
        ...state,
        currentUser: user,
        userBankIds,
        banks,
        stats: {
          wrongCount: wrongIds.length,
          favoriteCount: favoriteIds.length,
          joinedBankCount: userBankIds.length,
          attemptCount: user ? state.attempts.filter((item) => item.userId === user.id).length : 0
        },
        attempts: state.attempts.map((attempt) => ({
          ...attempt,
          userName: state.users.find((item) => item.id === attempt.userId)?.name || '用户',
          bankName: state.banks.find((bank) => bank.id === attempt.bankId)?.name || '题库',
          questionStem: state.questions.find((item) => item.id === attempt.questionId)?.stem || ''
        })),
        orders: state.orders.map((order) => ({
          ...order,
          userName: state.users.find((item) => item.id === order.userId)?.name || '用户',
          planName: state.plans.find((item) => item.id === order.planId)?.name || '套餐'
        })),
        entitlementsView: Object.entries(state.entitlements).flatMap(([userId, list]) => list.map((grant) => ({
          ...grant,
          userId,
          userName: state.users.find((item) => item.id === userId)?.name || '用户',
          planName: state.plans.find((item) => item.id === grant.planId)?.name || '授权',
          bankName: state.banks.find((item) => item.id === grant.bankId)?.name || (grant.type === 'membership' ? '全部题库' : '')
        }))),
        users: state.users.map((item) => {
          const userBankIds = state.userBanks[item.id] || [];
          const userAttempts = state.attempts.filter((attempt) => attempt.userId === item.id);
          const joinedBanks = state.banks.filter((bank) => userBankIds.includes(bank.id));
          return {
            ...item,
            joined_bank_count: userBankIds.length,
            joined_bank_names: joinedBanks.map((bank) => bank.name).join('、'),
            attempt_count: userAttempts.length,
            wrong_count: Object.values(state.wrongQuestions[item.id] || {}).filter((wrong) => !wrong.resolvedAt).length,
            favorite_count: (state.favorites[item.id] || []).length,
            grant_count: (state.entitlements[item.id] || []).length,
            last_attempt_at: Math.max(0, ...userAttempts.map((attempt) => attempt.createdAt || 0)),
            created_at: item.created_at || item.createdAt,
            updated_at: item.updated_at || item.updatedAt
          };
        }),
        adminAccounts: state.users.filter((item) => item.role === 'admin').map((item) => ({
          ...item,
          admin_role: item.admin_role || item.adminRole || 'super_admin',
          admin_enabled: item.admin_enabled ?? item.adminEnabled ?? 1,
          created_at: item.created_at || item.createdAt,
          updated_at: item.updated_at || item.updatedAt,
          last_login_at: item.last_login_at || item.lastLoginAt
        }))
      };
    },
    registerUser(name, phone, password) {
      const cleanName = String(name || '').trim();
      const cleanPhone = String(phone || '').trim();
      const cleanPassword = String(password || '');
      if (!cleanPassword) throw new Error('\u8bf7\u8f93\u5165\u5bc6\u7801');
      if (cleanPassword.length < 6) throw new Error('\u5bc6\u7801\u81f3\u5c11\u9700\u8981 6 \u4f4d');
      const existing = state.users.find((item) => item.phone === cleanPhone && item.role === 'user');
      if (existing) throw new Error('\u8be5\u624b\u673a\u53f7\u5df2\u6ce8\u518c\uff0c\u8bf7\u76f4\u63a5\u767b\u5f55');
      const user = { id: id('user'), role: 'user', name: cleanName, phone: cleanPhone, password: cleanPassword, createdAt: now() };
      state.users.push(user);
      ensureUserBuckets(user.id);
      state.currentUserId = user.id;
      save();
      return user;
    },
    loginUser(name, phone, password) {
      const cleanName = String(name || '').trim();
      const cleanPhone = String(phone || '').trim();
      const cleanPassword = String(password || '');
      const user = state.users.find((item) => item.phone === cleanPhone && item.role === 'user');
      if (!user) throw new Error('\u8d26\u53f7\u4e0d\u5b58\u5728\uff0c\u8bf7\u5148\u6ce8\u518c');
      if (String(user.name || '').trim() !== cleanName) throw new Error('\u59d3\u540d\u548c\u624b\u673a\u53f7\u4e0d\u5339\u914d');
      if (user.password !== cleanPassword) throw new Error('\u5bc6\u7801\u9519\u8bef');
      ensureUserBuckets(user.id);
      state.currentUserId = user.id;
      save();
      return user;
    },
    loginAdmin(phoneOrPassword, maybePassword) {
      const phone = maybePassword === undefined ? 'admin' : String(phoneOrPassword || 'admin').trim();
      const password = maybePassword === undefined ? phoneOrPassword : maybePassword;
      let admin = state.users.find((item) => item.role === 'admin' && item.phone === phone);
      if (!admin && phone === 'admin') {
        admin = state.users.find((item) => item.role === 'admin');
      }
      if (String(password || '') !== (admin?.password || state.adminPassword)) return false;
      if (!admin) {
        admin = { id: id('admin'), role: 'admin', name: '管理员', phone: 'admin', password: state.adminPassword, adminRole: 'super_admin', adminEnabled: 1, createdAt: now() };
        state.users.push(admin);
      }
      if ((admin.adminEnabled ?? admin.admin_enabled ?? 1) === 0) return false;
      admin.lastLoginAt = now();
      state.currentUserId = admin.id;
      state.adminLogs.unshift(makeAdminLog('admin.login', 'admin', admin.id, { phone: admin.phone }));
      save();
      return true;
    },
    refreshAdminAccounts() {
      return state.users.filter((item) => item.role === 'admin');
    },
    createAdminAccount(payload) {
      const phone = String(payload.phone || '').trim();
      if (!phone || !payload.name || !payload.password) throw new Error('请输入管理员姓名、账号和密码');
      if (state.users.some((item) => item.phone === phone)) throw new Error('该账号已存在');
      const admin = {
        id: id('admin'),
        role: 'admin',
        name: String(payload.name).trim(),
        phone,
        password: String(payload.password),
        adminRole: payload.adminRole || 'operator',
        adminEnabled: 1,
        createdAt: now(),
        updatedAt: now()
      };
      state.users.push(admin);
      state.adminLogs.unshift(makeAdminLog('admin.create', 'admin', admin.id, { name: admin.name, phone: admin.phone }));
      save();
      return admin;
    },
    updateAdminAccount(adminId, patch) {
      const admin = state.users.find((item) => item.id === adminId && item.role === 'admin');
      if (!admin) return false;
      admin.name = String(patch.name ?? admin.name).trim();
      admin.adminRole = patch.adminRole ?? patch.admin_role ?? admin.adminRole ?? 'operator';
      admin.adminEnabled = patch.adminEnabled ?? patch.admin_enabled ?? admin.adminEnabled ?? 1;
      if (patch.password) admin.password = String(patch.password);
      admin.updatedAt = now();
      state.adminLogs.unshift(makeAdminLog('admin.update', 'admin', admin.id, { name: admin.name, phone: admin.phone }));
      save();
      return true;
    },
    deleteAdminAccount(adminId) {
      const admin = state.users.find((item) => item.id === adminId && item.role === 'admin');
      if (!admin || admin.phone === 'admin') return false;
      state.users = state.users.filter((item) => item.id !== adminId);
      state.adminLogs.unshift(makeAdminLog('admin.delete', 'admin', adminId, { name: admin.name, phone: admin.phone }));
      save();
      return true;
    },
    logout() {
      state.currentUserId = '';
      save();
    },
    hasAccess(bankId, userId = state.currentUserId) {
      const bank = state.banks.find((item) => item.id === bankId);
      if (!bank || bank.status !== 'published') return false;
      if (bank.accessType === 'free') return true;
      const grants = state.entitlements[userId] || [];
      return grants.some((grant) => {
        const validTime = !grant.expiresAt || grant.expiresAt > now();
        const validScope = grant.type === 'membership' || grant.bankId === bankId;
        return validTime && validScope;
      });
    },
    joinBank(bankId) {
      const user = currentUser();
      if (!user) return { ok: false, message: '请先登录' };
      if (!api.hasAccess(bankId, user.id)) return { ok: false, message: '该题库需要购买或使用激活码解锁' };
      ensureUserBuckets(user.id);
      if (!state.userBanks[user.id].includes(bankId)) state.userBanks[user.id].push(bankId);
      save();
      return { ok: true, message: '已加入我的题库' };
    },
    leaveBank(bankId) {
      const user = currentUser();
      if (!user) return;
      ensureUserBuckets(user.id);
      state.userBanks[user.id] = state.userBanks[user.id].filter((idValue) => idValue !== bankId);
      save();
    },
    redeemActivationCode(code) {
      const user = currentUser();
      if (!user) return { ok: false, message: '请先登录' };
      const normalized = String(code || '').trim().toUpperCase();
      const found = state.activationCodes.find((item) => item.code === normalized);
      if (!found) return { ok: false, message: '激活码不存在' };
      if (found.usedBy) return { ok: false, message: '激活码已被使用' };
      const plan = state.plans.find((item) => item.id === found.planId);
      if (!plan) return { ok: false, message: '激活码对应套餐不存在' };
      found.usedBy = user.id;
      found.usedAt = now();
      grantEntitlement(user.id, {
        type: plan.type,
        bankId: plan.bankId,
        planId: plan.id,
        durationDays: plan.durationDays,
        source: 'activation-code'
      });
      state.orders.push({
        id: id('order'),
        userId: user.id,
        planId: plan.id,
        amount: plan.price,
        status: 'paid',
        channel: 'activation-code',
        code: found.code,
        createdAt: now(),
        paidAt: now()
      });
      save();
      return { ok: true, message: '激活成功' };
    },
    createActivationCodes(planId, count = 1) {
      const plan = state.plans.find((item) => item.id === planId);
      if (!plan) return [];
      const output = [];
      const size = Math.min(Math.max(Number(count) || 1, 1), 500);
      for (let index = 0; index < size; index += 1) {
        const item = { id: id('code'), code: makeCode(), planId, createdAt: now(), usedBy: '', usedAt: 0 };
        state.activationCodes.push(item);
        output.push(item);
      }
      save();
      return output;
    },
    createOrder(planId) {
      const user = currentUser();
      const plan = state.plans.find((item) => item.id === planId);
      if (!user || !plan) return { ok: false, message: '无法创建订单' };
      const order = {
        id: id('order'),
        orderNo: `QB${now()}${Math.floor(Math.random() * 900 + 100)}`,
        userId: user.id,
        planId: plan.id,
        amount: plan.price,
        status: 'pending',
        channel: 'reserved-payment',
        createdAt: now(),
        paidAt: 0
      };
      state.orders.push(order);
      save();
      return { ok: true, order, message: '订单已创建，支付接口待接入' };
    },
    markOrderPaid(orderId) {
      const order = state.orders.find((item) => item.id === orderId);
      if (!order) return false;
      const plan = state.plans.find((item) => item.id === order.planId);
      if (!plan) return false;
      order.status = 'paid';
      order.paidAt = now();
      grantEntitlement(order.userId, {
        type: plan.type,
        bankId: plan.bankId,
        planId: plan.id,
        durationDays: plan.durationDays,
        source: 'manual-order'
      });
      save();
      return true;
    },
    grantUserPlan(userId, planId) {
      const plan = state.plans.find((item) => item.id === planId);
      if (!plan) return false;
      grantEntitlement(userId, {
        type: plan.type,
        bankId: plan.bankId,
        planId: plan.id,
        durationDays: plan.durationDays,
        source: 'admin'
      });
      state.orders.push({
        id: id('order'),
        userId,
        planId,
        amount: plan.price,
        status: 'paid',
        channel: 'admin-grant',
        createdAt: now(),
        paidAt: now()
      });
      state.adminLogs.unshift(makeAdminLog('user.grant', 'user', userId, { planId, planName: plan.name }));
      save();
      return true;
    },
    getAdminUserDetail(userId) {
      const user = state.users.find((item) => item.id === userId && item.role === 'user');
      if (!user) return null;
      const userBankIds = state.userBanks[userId] || [];
      const joinedBanks = userBankIds.map((bankId) => {
        const bank = state.banks.find((item) => item.id === bankId);
        const attempts = state.attempts.filter((item) => item.userId === userId && item.bankId === bankId);
        const correctCount = attempts.filter((item) => item.correct).length;
        return {
          id: bankId,
          name: bank?.name || '题库',
          joined_at: user.createdAt,
          question_count: state.questions.filter((item) => item.bankId === bankId).length,
          attempt_count: attempts.length,
          correct_count: correctCount,
          wrong_count: Object.values(state.wrongQuestions[userId] || {}).filter((item) => item.bankId === bankId && !item.resolvedAt).length,
          favorite_count: (state.favorites[userId] || []).filter((questionId) => state.questions.find((question) => question.id === questionId)?.bankId === bankId).length,
          last_attempt_at: Math.max(0, ...attempts.map((item) => item.createdAt || 0))
        };
      });
      const chapterStats = state.banks.flatMap((bank) => bank.chapters.map((chapter) => {
        const questions = state.questions.filter((item) => item.bankId === bank.id && item.chapterId === chapter.id);
        const questionIds = questions.map((item) => item.id);
        const attempts = state.attempts.filter((item) => item.userId === userId && questionIds.includes(item.questionId));
        return {
          bank_id: bank.id,
          bank_name: bank.name,
          chapter_id: chapter.id,
          chapter_name: chapter.name,
          question_count: questions.length,
          attempt_count: attempts.length,
          correct_count: attempts.filter((item) => item.correct).length,
          wrong_count: Object.values(state.wrongQuestions[userId] || {}).filter((item) => item.chapterId === chapter.id && !item.resolvedAt).length
        };
      })).filter((item) => userBankIds.includes(item.bank_id));
      const wrongQuestions = Object.values(state.wrongQuestions[userId] || {}).filter((item) => !item.resolvedAt).map((wrong) => {
        const question = state.questions.find((item) => item.id === wrong.questionId);
        const bank = state.banks.find((item) => item.id === wrong.bankId);
        const chapter = bank?.chapters.find((item) => item.id === wrong.chapterId);
        return {
          question_id: wrong.questionId,
          bank_name: bank?.name || '题库',
          chapter_name: chapter?.name || '章节',
          type: question?.type || '',
          stem: question?.stem || '',
          answer_text: question?.answerText || '',
          updated_at: wrong.updatedAt
        };
      });
      const recentAttempts = state.attempts.filter((item) => item.userId === userId).slice(-30).reverse().map((attempt) => ({
        ...attempt,
        bank_name: state.banks.find((item) => item.id === attempt.bankId)?.name || '题库',
        question_stem: state.questions.find((item) => item.id === attempt.questionId)?.stem || ''
      }));
      const exams = state.attempts.filter((item) => item.userId === userId && item.source === 'exam').reduce((acc, attempt) => {
        const key = `${attempt.bankId}-${Math.floor(attempt.createdAt / 600000)}`;
        acc[key] ||= { bank_id: attempt.bankId, question_count: 0, correct_count: 0, started_at: attempt.createdAt, submitted_at: attempt.createdAt };
        acc[key].question_count += 1;
        acc[key].correct_count += attempt.correct ? 1 : 0;
        acc[key].started_at = Math.min(acc[key].started_at, attempt.createdAt);
        acc[key].submitted_at = Math.max(acc[key].submitted_at, attempt.createdAt);
        return acc;
      }, {});
      state.selectedUserDetail = { user, joinedBanks, chapterStats, wrongQuestions, recentAttempts, exams: Object.values(exams).reverse() };
      return state.selectedUserDetail;
    },
    refreshAdminLogs() {
      return state.adminLogs;
    },
    deleteUser(userId) {
      const user = state.users.find((item) => item.id === userId);
      if (!user || user.role !== 'user') return false;
      state.users = state.users.filter((item) => item.id !== userId);
      delete state.userBanks[userId];
      delete state.entitlements[userId];
      delete state.wrongQuestions[userId];
      delete state.favorites[userId];
      state.attempts = state.attempts.filter((item) => item.userId !== userId);
      state.orders = state.orders.filter((item) => item.userId !== userId);
      state.activationCodes.forEach((code) => {
        if (code.usedBy === userId) {
          code.usedBy = '';
          code.usedAt = 0;
        }
      });
      state.feedback.forEach((item) => {
        if (item.userId === userId) item.userId = '';
      });
      if (state.currentUserId === userId) state.currentUserId = '';
      state.adminLogs.unshift(makeAdminLog('user.delete', 'user', userId, { name: user.name, phone: user.phone }));
      save();
      return true;
    },
    savePlan(plan) {
      if (plan.id) {
        const found = state.plans.find((item) => item.id === plan.id);
        if (found) Object.assign(found, plan);
      } else {
        state.plans.push({ ...plan, id: id('plan'), enabled: true });
      }
      save();
    },
    deletePlan(planId) {
      state.plans = state.plans.filter((item) => item.id !== planId);
      save();
    },
    getQuestions(bankId) {
      return state.questions.filter((item) => item.bankId === bankId);
    },
    submitAnswer(questionId, answer, source = 'practice') {
      const user = currentUser();
      const question = state.questions.find((item) => item.id === questionId);
      if (!user || !question) return null;
      const result = judge(question, answer);
      state.attempts.push({
        id: id('attempt'),
        userId: user.id,
        bankId: question.bankId,
        questionId,
        answer: normalizeAnswer(answer, question.type),
        correct: result.correct,
        source,
        createdAt: now()
      });
      ensureUserBuckets(user.id);
      if (!result.correct) {
        state.wrongQuestions[user.id][questionId] = {
          questionId,
          bankId: question.bankId,
          chapterId: question.chapterId,
          lastAnswer: normalizeAnswer(answer, question.type),
          updatedAt: now()
        };
      } else if (state.wrongQuestions[user.id][questionId]) {
        state.wrongQuestions[user.id][questionId].resolvedAt = now();
      }
      save();
      return result;
    },
    submitExam(questions, answerMap) {
      const results = {};
      questions.forEach((question) => {
        const answer = answerMap[question.id]?.answer || [];
        results[question.id] = api.submitAnswer(question.id, answer, 'exam');
      });
      const correctCount = Object.values(results).filter((item) => item?.correct).length;
      return { results, correctCount, wrongCount: questions.length - correctCount };
    },
    getWrongQuestions(bankId, chapterId = '') {
      const user = currentUser();
      if (!user) return [];
      const ids = Object.keys(state.wrongQuestions[user.id] || {});
      return state.questions.filter((item) => ids.includes(item.id) && item.bankId === bankId && (!chapterId || item.chapterId === chapterId));
    },
    getFavoriteQuestions(bankId, chapterId = '') {
      const user = currentUser();
      if (!user) return [];
      const ids = state.favorites[user.id] || [];
      return state.questions.filter((item) => ids.includes(item.id) && item.bankId === bankId && (!chapterId || item.chapterId === chapterId));
    },
    isFavorite(questionId) {
      const user = currentUser();
      if (!user) return false;
      return (state.favorites[user.id] || []).includes(questionId);
    },
    toggleFavorite(questionId) {
      const user = currentUser();
      if (!user) return false;
      ensureUserBuckets(user.id);
      const list = state.favorites[user.id];
      state.favorites[user.id] = list.includes(questionId) ? list.filter((item) => item !== questionId) : [...list, questionId];
      save();
      return state.favorites[user.id].includes(questionId);
    },
    getExamTemplate(bankId) {
      return clone(state.examTemplates[bankId] || defaultExamTemplate);
    },
    saveExamTemplate(bankId, template) {
      state.examTemplates[bankId] = normalizeTemplate(template);
      save();
    },
    buildExamPaper(bankId, config) {
      const chosen = config?.useCustom ? config : (state.examTemplates[bankId] || defaultExamTemplate);
      const template = normalizeTemplate(chosen);
      const pool = state.questions.filter((item) => item.bankId === bankId);
      const total = Math.min(Math.max(Number(template.totalQuestions) || 20, 1), pool.length);
      const selected = selectByRatios(pool, total, template);
      return shuffle(selected);
    },
    renameBank(bankId, name) {
      const bank = state.banks.find((item) => item.id === bankId);
      if (bank) bank.name = String(name || '').trim() || bank.name;
      save();
    },
    updateBank(bankId, patch) {
      const bank = state.banks.find((item) => item.id === bankId);
      if (bank) Object.assign(bank, patch);
      state.adminLogs.unshift(makeAdminLog('bank.update', 'bank', bankId, patch));
      save();
    },
    deleteBank(bankId) {
      state.banks = state.banks.filter((item) => item.id !== bankId);
      state.questions = state.questions.filter((item) => item.bankId !== bankId);
      Object.keys(state.userBanks).forEach((userId) => {
        state.userBanks[userId] = state.userBanks[userId].filter((idValue) => idValue !== bankId);
      });
      delete state.examTemplates[bankId];
      state.adminLogs.unshift(makeAdminLog('bank.delete', 'bank', bankId, {}));
      save();
    },
    createChapter({ bankId, name }) {
      const bank = state.banks.find((item) => item.id === bankId);
      if (!bank) return null;
      const chapter = { id: id('ch'), name: String(name || '').trim() || '新章节' };
      bank.chapters.push(chapter);
      state.adminLogs.unshift(makeAdminLog('chapter.create', 'chapter', chapter.id, { bankId, name: chapter.name }));
      save();
      return chapter;
    },
    updateChapter({ id: chapterId, chapterId: altChapterId, bankId, name }) {
      const targetId = chapterId || altChapterId;
      const bank = state.banks.find((item) => item.id === bankId || item.chapters.some((chapter) => chapter.id === targetId));
      const chapter = bank?.chapters.find((item) => item.id === targetId);
      if (!chapter) return false;
      chapter.name = String(name || chapter.name).trim();
      state.questions.forEach((question) => {
        if (question.chapterId === targetId) question.chapterName = chapter.name;
      });
      state.adminLogs.unshift(makeAdminLog('chapter.update', 'chapter', targetId, { bankId: bank.id, name: chapter.name }));
      save();
      return true;
    },
    deleteChapter(chapterId) {
      const bank = state.banks.find((item) => item.chapters.some((chapter) => chapter.id === chapterId));
      if (!bank) return false;
      bank.chapters = bank.chapters.filter((chapter) => chapter.id !== chapterId);
      const questionIds = state.questions.filter((question) => question.chapterId === chapterId).map((question) => question.id);
      state.questions = state.questions.filter((question) => question.chapterId !== chapterId);
      state.attempts = state.attempts.filter((attempt) => !questionIds.includes(attempt.questionId));
      Object.keys(state.wrongQuestions).forEach((userId) => {
        questionIds.forEach((questionId) => delete state.wrongQuestions[userId][questionId]);
      });
      Object.keys(state.favorites).forEach((userId) => {
        state.favorites[userId] = state.favorites[userId].filter((questionId) => !questionIds.includes(questionId));
      });
      state.adminLogs.unshift(makeAdminLog('chapter.delete', 'chapter', chapterId, { bankId: bank.id }));
      save();
      return true;
    },
    createQuestion(payload) {
      const bank = state.banks.find((item) => item.id === payload.bankId);
      const chapter = bank?.chapters.find((item) => item.id === payload.chapterId);
      if (!bank || !chapter) return false;
      const answer = normalizeAnswer(payload.answer || payload.answerText || [], payload.type);
      state.questions.push({
        id: id('q'),
        bankId: bank.id,
        chapterId: chapter.id,
        chapterName: chapter.name,
        type: payload.type || 'single',
        stem: String(payload.stem || '').trim(),
        options: normalizeOptions(payload.options || []),
        answer,
        answerText: payload.answerText || answer.join('、'),
        analysis: payload.analysis || ''
      });
      state.adminLogs.unshift(makeAdminLog('question.create', 'question', bank.id, { bankId: bank.id, chapterId: chapter.id }));
      save();
      return true;
    },
    updateQuestion(payload) {
      const question = state.questions.find((item) => item.id === (payload.id || payload.questionId));
      if (!question) return false;
      const bank = state.banks.find((item) => item.id === question.bankId);
      const chapter = bank?.chapters.find((item) => item.id === (payload.chapterId || question.chapterId));
      question.chapterId = chapter?.id || question.chapterId;
      question.chapterName = chapter?.name || question.chapterName;
      question.type = payload.type || question.type;
      question.stem = String(payload.stem ?? question.stem).trim();
      question.options = normalizeOptions(payload.options ?? question.options);
      question.answer = normalizeAnswer(payload.answer ?? question.answer, question.type);
      question.answerText = payload.answerText || question.answer.join('、');
      question.analysis = String(payload.analysis ?? question.analysis ?? '');
      state.adminLogs.unshift(makeAdminLog('question.update', 'question', question.id, { bankId: question.bankId }));
      save();
      return true;
    },
    deleteQuestion(questionId) {
      const question = state.questions.find((item) => item.id === questionId);
      if (!question) return false;
      state.questions = state.questions.filter((item) => item.id !== questionId);
      state.attempts = state.attempts.filter((attempt) => attempt.questionId !== questionId);
      Object.keys(state.wrongQuestions).forEach((userId) => delete state.wrongQuestions[userId][questionId]);
      Object.keys(state.favorites).forEach((userId) => {
        state.favorites[userId] = state.favorites[userId].filter((idValue) => idValue !== questionId);
      });
      state.adminLogs.unshift(makeAdminLog('question.delete', 'question', questionId, { bankId: question.bankId }));
      save();
      return true;
    },
    importBank({ name, description, chapters, questions, accessType = 'free', price = 0, status = 'published' }) {
      const validQuestions = (questions || []).filter((item) => item.stem && item.answer?.length);
      if (!validQuestions.length) return { ok: false, message: '没有可导入的题目' };
      const bankId = id('bank');
      const chapterNames = [...new Set([
        ...(chapters || []).map((item) => item.name).filter(Boolean),
        ...validQuestions.map((item) => item.chapterName || '默认章节')
      ])];
      const savedChapters = chapterNames.map((chapterName) => ({ id: id('ch'), name: chapterName }));
      const chapterIdMap = Object.fromEntries(savedChapters.map((chapter) => [chapter.name, chapter.id]));
      state.banks.push({
        id: bankId,
        name: String(name || '').trim() || '新导入题库',
        description: String(description || '').trim() || '通过网站后台导入的题库。',
        status,
        accessType,
        price: Number(price) || 0,
        chapters: savedChapters
      });
      validQuestions.forEach((question, index) => {
        const chapterName = question.chapterName || savedChapters[0].name;
        state.questions.push({
          id: id(`q${index}`),
          bankId,
          chapterId: chapterIdMap[chapterName] || savedChapters[0].id,
          chapterName,
          type: question.type || inferType(question.answer, question.options),
          stem: question.stem,
          options: normalizeOptions(question.options || []),
          answer: normalizeAnswer(question.answer, question.type),
          answerText: normalizeAnswer(question.answer, question.type).join('、'),
          analysis: question.analysis || ''
        });
      });
      state.adminLogs.unshift(makeAdminLog('bank.import', 'bank', bankId, { name, questionCount: validQuestions.length, chapterCount: savedChapters.length }));
      save();
      return { ok: true, bankId, count: validQuestions.length };
    },
    importSampleBank() {
      return api.importBank({
        name: '新导入演示题库',
        description: '用于验证网站版导入流程的演示题库。',
        accessType: 'free',
        chapters: [{ name: '第一章' }],
        questions: [
          {
            chapterName: '第一章',
            type: 'single',
            stem: '演示题：以下哪个是正确答案？',
            options: normalizeOptions(['选项一', '选项二', '选项三', '选项四']),
            answer: ['A'],
            analysis: '这是演示解析。'
          }
        ]
      });
    },
    saveFeedback(content) {
      const user = currentUser();
      state.feedback.push({ id: id('fb'), userId: user?.id || '', content, createdAt: now(), status: 'new' });
      save();
    },
    exportState() {
      return JSON.stringify(state, null, 2);
    },
    importState(json) {
      const parsed = JSON.parse(json);
      state = migrateState(parsed);
      save();
    },
    resetDemoData() {
      state = clone(initialState);
      save();
    }
  };

  return api;
}

export function parseQuestionsFromText(text) {
  const normalizedText = String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[：﹕]/g, ':')
    .replace(/[．。]/g, '.')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[【]/g, '[')
    .replace(/[】]/g, ']');
  const rawLines = normalizedText
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const chapters = [];
  const questions = [];
  let currentChapter = '默认章节';
  let currentMode = '';
  let current = null;

  function ensureChapter(name) {
    if (!chapters.some((item) => item.name === name)) chapters.push({ name });
  }

  function flush() {
    if (!current || !current.stem) return;
    const answer = normalizeImportedAnswer(current.answerRaw, current.type);
    const type = current.type || inferType(answer, current.options);
    if (!answer.length) {
      current = null;
      return;
    }
    questions.push({
      chapterName: current.chapterName,
      type,
      stem: cleanStem(current.stem),
      options: type === 'judge' ? [] : normalizeOptions(current.options),
      answer,
      answerText: answer.join('、'),
      analysis: current.analysis || ''
    });
    current = null;
  }

  ensureChapter(currentChapter);

  rawLines.forEach((line) => {
    const typeSection = line.match(/^(判断题|判断题格式|选择题|选择题格式|单选题|单选题格式|多选题|多选题格式|填空题|简答题)\s*$/);
    if (typeSection) {
      flush();
      currentMode = labelToType(typeSection[1]);
      return;
    }

    const chapterMatch = line.match(/^(第[一二三四五六七八九十百千万\d]+[章节][\s、:：.-]*.*|章节[:：].+|#+\s*.+)$/);
    if (chapterMatch && !isQuestionLine(line) && !isOptionLine(line) && !isAnswerLine(line)) {
      flush();
      currentChapter = line.replace(/^#+\s*/, '').replace(/^章节[:：]\s*/, '').trim();
      ensureChapter(currentChapter);
      return;
    }

    const answerMatch = line.match(/^(答案|正确答案|参考答案)\s*[:：]\s*(.+)$/);
    if (answerMatch && current) {
      current.answerRaw = answerMatch[2].trim();
      return;
    }

    const analysisMatch = line.match(/^(解析|答案解析|说明)\s*[:：]\s*(.+)$/);
    if (analysisMatch && current) {
      current.analysis = current.analysis ? `${current.analysis}\n${analysisMatch[2].trim()}` : analysisMatch[2].trim();
      return;
    }

    const inlineAnswer = line.match(/^(.*?)(?:\s+)?(?:答案|正确答案|参考答案)\s*[:：]\s*([A-Ha-h,，、\s正确错误对错√×]+)$/);
    if (inlineAnswer && current) {
      if (inlineAnswer[1].trim()) current.stem += ` ${inlineAnswer[1].trim()}`;
      current.answerRaw = inlineAnswer[2].trim();
      return;
    }

    const optionMatch = line.match(/^([A-Ha-h])[\.\、\)]\s*(.+)$/);
    if (optionMatch && current) {
      current.options.push({ key: optionMatch[1].toUpperCase(), text: optionMatch[2].trim() });
      return;
    }

    const numbered = line.match(/^(\d+)[\.\、\)]\s*(.+)$/);
    if (numbered) {
      flush();
      const parsed = splitStemAnswer(numbered[2]);
      current = {
        chapterName: currentChapter,
        stem: parsed.stem,
        type: parsed.type || currentMode,
        options: [],
        answerRaw: parsed.answerRaw,
        analysis: ''
      };
      if (current.type === 'judge' && !current.answerRaw) {
        const judgeAnswer = current.stem.match(/(正确|错误|对|错|√|×)$/);
        if (judgeAnswer) {
          current.answerRaw = judgeAnswer[1];
          current.stem = current.stem.slice(0, -judgeAnswer[1].length).trim();
        }
      }
      return;
    }

    if (current) {
      const parsed = splitStemAnswer(line);
      current.stem += ` ${parsed.stem}`;
      if (parsed.answerRaw && !current.answerRaw) current.answerRaw = parsed.answerRaw;
      if (parsed.type && !current.type) current.type = parsed.type;
    }
  });

  flush();
  return { chapters, questions };
}

function splitStemAnswer(raw) {
  let stem = String(raw || '').trim();
  let answerRaw = '';
  let type = '';

  const typeMatch = stem.match(/[\(\[]\s*(单选|单项选择|多选|多项选择|判断|填空|简答)\s*[\)\]]\s*$/);
  if (typeMatch) {
    type = labelToType(typeMatch[1]);
    stem = stem.slice(0, typeMatch.index).trim();
  }

  const answerMatch = stem.match(/[\(\[]\s*([A-Ha-h]{1,8}|正确|错误|对|错|√|×|true|false)\s*[\)\]]\s*$/i);
  if (answerMatch) {
    answerRaw = answerMatch[1].trim();
    stem = stem.slice(0, answerMatch.index).trim();
  }

  return { stem, answerRaw, type };
}

function q(idValue, bankId, chapterId, chapterName, type, stem, optionTexts, answer, analysis) {
  return {
    id: idValue,
    bankId,
    chapterId,
    chapterName,
    type,
    stem,
    options: normalizeOptions(optionTexts),
    answer,
    answerText: answer.join('、'),
    analysis
  };
}

function judge(question, answer) {
  const userAnswer = normalizeAnswer(answer, question.type);
  const expected = normalizeAnswer(question.answer, question.type);
  const correct = question.type !== 'short' && userAnswer.length === expected.length && userAnswer.every((item, index) => item === expected[index]);
  return { correct, answer: expected, answerText: expected.join('、'), analysis: question.analysis || '' };
}

function normalizeAnswer(answer, type = '') {
  const list = Array.isArray(answer) ? answer : [answer];
  return list
    .flatMap((item) => String(item || '').split(/[,，、\s]+/))
    .map((item) => normalizeJudge(item.trim().toUpperCase()))
    .filter(Boolean)
    .map((item) => (type === 'judge' ? item : item.replace(/[^A-H]/g, '') || item))
    .filter(Boolean)
    .sort();
}

function normalizeJudge(value) {
  const text = String(value || '').trim().toUpperCase();
  if (['正确', '对', 'TRUE', 'T', '√', 'YES', 'Y'].includes(text)) return '正确';
  if (['错误', '错', 'FALSE', 'F', '×', 'X', 'NO', 'N'].includes(text)) return '错误';
  return text;
}

function normalizeImportedAnswer(raw, type = '') {
  const text = String(raw || '').trim();
  if (!text) return [];
  if (type === 'judge' || /^(正确|错误|对|错|true|false|t|f|√|×)$/i.test(text)) {
    return [normalizeJudge(text)];
  }
  return normalizeAnswer(text, type);
}

function normalizeOptions(options) {
  return (options || []).map((option, index) => {
    if (typeof option === 'string') return { key: String.fromCharCode(65 + index), text: option.replace(/^[A-H][\.\、\)]\s*/i, '').trim() };
    return { key: String(option.key || String.fromCharCode(65 + index)).toUpperCase(), text: String(option.text || '').trim() };
  }).filter((item) => item.text);
}

function inferType(answer, options) {
  const normalized = normalizeAnswer(answer);
  if (normalized[0] === '正确' || normalized[0] === '错误') return 'judge';
  if ((options || []).length && normalized.length > 1) return 'multiple';
  if ((options || []).length) return 'single';
  return 'blank';
}

function labelToType(label = '') {
  const text = String(label);
  if (/多/.test(text)) return 'multiple';
  if (/判/.test(text)) return 'judge';
  if (/填/.test(text)) return 'blank';
  if (/简/.test(text)) return 'short';
  if (/单/.test(text)) return 'single';
  return '';
}

function cleanStem(stem) {
  return String(stem || '').replace(/^\d+[\.\、\)]\s*/, '').trim();
}

function isOptionLine(line) {
  return /^[A-Ha-h][\.\、\)]\s*/.test(line);
}

function isQuestionLine(line) {
  return /^\d+[\.\、\)]\s+/.test(line);
}

function isAnswerLine(line) {
  return /^(答案|正确答案|参考答案)\s*[:：]/.test(line);
}

function normalizeTemplate(template) {
  return {
    totalQuestions: Math.max(Number(template?.totalQuestions) || defaultExamTemplate.totalQuestions, 1),
    typeRatios: { ...defaultExamTemplate.typeRatios, ...(template?.typeRatios || {}) },
    chapterRatios: { ...(template?.chapterRatios || {}) },
    useCustom: Boolean(template?.useCustom)
  };
}

function selectByRatios(pool, total, template) {
  const chapterRatios = Object.values(template.chapterRatios || {}).some((value) => Number(value) > 0)
    ? template.chapterRatios
    : countBy(pool, 'chapterId');
  const typeQuota = quotas(template.typeRatios, total);
  const chapterQuota = quotas(chapterRatios, total);
  const selected = [];
  const selectedIds = new Set();
  const typeCount = {};
  const chapterCount = {};

  shuffle(pool).forEach((question) => {
    if (selected.length >= total) return;
    if ((typeCount[question.type] || 0) >= (typeQuota[question.type] || 0)) return;
    if ((chapterCount[question.chapterId] || 0) >= (chapterQuota[question.chapterId] || 0)) return;
    selected.push(question);
    selectedIds.add(question.id);
    typeCount[question.type] = (typeCount[question.type] || 0) + 1;
    chapterCount[question.chapterId] = (chapterCount[question.chapterId] || 0) + 1;
  });

  shuffle(pool).forEach((question) => {
    if (selected.length >= total || selectedIds.has(question.id)) return;
    selected.push(question);
  });

  return selected;
}

function quotas(ratios, total) {
  const entries = Object.entries(ratios || {})
    .map(([key, value]) => ({ key, value: Math.max(Number(value) || 0, 0) }))
    .filter((item) => item.value > 0);
  if (!entries.length) return {};
  const sum = entries.reduce((acc, item) => acc + item.value, 0);
  const output = {};
  let used = 0;
  entries.forEach((item) => {
    output[item.key] = Math.floor((total * item.value) / sum);
    used += output[item.key];
  });
  entries
    .sort((a, b) => ((total * b.value) / sum) % 1 - (((total * a.value) / sum) % 1))
    .forEach((item) => {
      if (used < total) {
        output[item.key] += 1;
        used += 1;
      }
    });
  return output;
}

function countBy(list, field) {
  return list.reduce((acc, item) => {
    acc[item[field]] = (acc[item[field]] || 0) + 1;
    return acc;
  }, {});
}

function shuffle(list) {
  return [...list].sort(() => Math.random() - 0.5);
}

function makeCode() {
  return `QB-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function id(prefix) {
  return `${prefix}-${now()}-${Math.random().toString(16).slice(2)}`;
}

function makeAdminLog(action, targetType, targetId, detail = {}) {
  return {
    id: id('log'),
    admin_id: 'local-admin',
    action,
    target_type: targetType,
    target_id: targetId,
    detail,
    created_at: now()
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function migrateState(input) {
  const state = { ...clone(initialState), ...(input || {}) };
  state.version = 3;
  state.users ||= [];
  state.banks ||= [];
  state.questions ||= [];
  state.plans ||= [];
  state.userBanks ||= {};
  state.entitlements ||= {};
  state.activationCodes ||= [];
  state.orders ||= [];
  state.adminLogs ||= [];
  state.selectedUserDetail ||= null;
  state.attempts ||= [];
  state.wrongQuestions ||= {};
  state.favorites ||= {};
  state.examTemplates ||= {};
  state.feedback ||= [];
  state.banks = state.banks.map((bank) => ({
    accessType: 'free',
    price: 0,
    status: 'published',
    chapters: [],
    ...bank
  }));
  state.questions = state.questions.map((question) => ({
    ...question,
    options: normalizeOptions(question.options || []),
    answer: normalizeAnswer(question.answer || question.answerText || [], question.type),
    answerText: normalizeAnswer(question.answer || question.answerText || [], question.type).join('、')
  }));
  return state;
}

function loadState() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return migrateState(JSON.parse(saved));
    for (const key of oldStorageKeys) {
      const old = localStorage.getItem(key);
      if (old) return migrateState(JSON.parse(old));
    }
    return clone(initialState);
  } catch {
    return clone(initialState);
  }
}
