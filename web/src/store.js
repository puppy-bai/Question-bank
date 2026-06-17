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
        })))
      };
    },
    loginUser(name, phone) {
      const cleanName = String(name || '').trim();
      const cleanPhone = String(phone || '').trim();
      let user = state.users.find((item) => item.phone === cleanPhone && item.role === 'user');
      if (!user) {
        user = { id: id('user'), role: 'user', name: cleanName, phone: cleanPhone, createdAt: now() };
        state.users.push(user);
      } else {
        user.name = cleanName;
        user.updatedAt = now();
      }
      ensureUserBuckets(user.id);
      state.currentUserId = user.id;
      save();
      return user;
    },
    loginAdmin(password) {
      if (String(password || '') !== state.adminPassword) return false;
      let admin = state.users.find((item) => item.role === 'admin');
      if (!admin) {
        admin = { id: id('admin'), role: 'admin', name: '管理员', phone: 'admin', createdAt: now() };
        state.users.push(admin);
      }
      state.currentUserId = admin.id;
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
      save();
    },
    deleteBank(bankId) {
      state.banks = state.banks.filter((item) => item.id !== bankId);
      state.questions = state.questions.filter((item) => item.bankId !== bankId);
      Object.keys(state.userBanks).forEach((userId) => {
        state.userBanks[userId] = state.userBanks[userId].filter((idValue) => idValue !== bankId);
      });
      delete state.examTemplates[bankId];
      save();
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
    .replace(/[：]/g, ':')
    .replace(/[．]/g, '.');
  const rawLines = normalizedText.split('\n').map((line) => line.trim()).filter(Boolean);
  const chapters = [];
  const questions = [];
  let currentChapter = '默认章节';
  let current = null;

  function ensureChapter(name) {
    if (!chapters.some((item) => item.name === name)) chapters.push({ name });
  }

  function flush() {
    if (!current || !current.stem) return;
    const answer = normalizeImportedAnswer(current.answerRaw, current.type);
    const type = current.type || inferType(answer, current.options);
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
    const compact = line.replace(/\s+/g, '');
    const chapterMatch = line.match(/^(第[一二三四五六七八九十百千万\d]+[章节].*|章节[:：].+|#+\s*.+)$/);
    if (chapterMatch && !isOptionLine(line) && !isAnswerLine(line)) {
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

    const inlineAnswer = line.match(/^(.*?)(?:\s+)?(?:答案|正确答案)\s*[:：]\s*([A-Ha-h,，、\s正确错误对错√×]+)$/);
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

    const stemMatch = line.match(/^(?:\d+[\.\、\)]\s*)?(.+?)(?:\s*[\(（【\[]\s*(单选|单项选择|多选|多项选择|判断|填空|简答)\s*[\)）】\]])?$/);
    if (stemMatch && (/[?？。]$/.test(compact) || stemMatch[2] || !current)) {
      if (current && (current.answerRaw || current.options.length)) flush();
      current = {
        chapterName: currentChapter,
        stem: stemMatch[1].trim(),
        type: labelToType(stemMatch[2]),
        options: [],
        answerRaw: '',
        analysis: ''
      };
      return;
    }

    if (current) current.stem += ` ${line}`;
  });

  flush();
  return { chapters, questions };
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
