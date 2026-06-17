export const defaultExamTemplate = {
  totalQuestions: 20,
  typeRatios: { single: 50, multiple: 20, judge: 30, blank: 0, short: 0 },
  chapterRatios: {}
};

const storageKey = 'question_bank_web_state_v1';

const initialState = {
  currentUserId: '',
  adminPassword: 'admin123',
  users: [],
  banks: [
    {
      id: 'bank-electric',
      name: '电工理论练习题',
      description: '用于电工理论知识练习、章节刷题和模拟考试。',
      status: 'published',
      chapters: [
        { id: 'ch-basic', name: '基础知识' },
        { id: 'ch-safety', name: '安全用电' },
        { id: 'ch-device', name: '设备维护' }
      ]
    }
  ],
  questions: [
    q('q1', 'bank-electric', 'ch-basic', '基础知识', 'single', '电路中电流的单位是？', ['A. 伏特', 'B. 安培', 'C. 欧姆', 'D. 瓦特'], ['B'], '安培是电流单位。'),
    q('q2', 'bank-electric', 'ch-basic', '基础知识', 'multiple', '下列属于常见电路参数的是？', ['A. 电压', 'B. 电流', 'C. 电阻', 'D. 温度'], ['A', 'B', 'C'], '电压、电流、电阻是常见电路参数。'),
    q('q3', 'bank-electric', 'ch-safety', '安全用电', 'judge', '发现有人触电时，应先切断电源再施救。', [], ['正确'], '先切断电源可以避免二次伤害。'),
    q('q4', 'bank-electric', 'ch-safety', '安全用电', 'single', '安全电压通常是指不高于多少伏？', ['A. 12V', 'B. 24V', 'C. 36V', 'D. 220V'], ['C'], '常见安全电压为 36V。'),
    q('q5', 'bank-electric', 'ch-device', '设备维护', 'judge', '设备维护时可以带电拆卸保护罩。', [], ['错误'], '设备维护应遵守停电、验电、挂牌等安全流程。'),
    q('q6', 'bank-electric', 'ch-device', '设备维护', 'single', '万用表测量电阻时应选择哪个档位？', ['A. Ω 档', 'B. A 档', 'C. V 档', 'D. Hz 档'], ['A'], '电阻测量使用 Ω 档。')
  ],
  userBanks: {},
  attempts: [],
  wrongQuestions: {},
  favorites: {},
  examTemplates: {}
};

export function createStore() {
  let state = loadState();

  function save() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function currentUser() {
    return state.users.find((item) => item.id === state.currentUserId) || null;
  }

  return {
    snapshot() {
      const user = currentUser();
      const userBankIds = user ? (state.userBanks[user.id] || []) : [];
      const favoriteIds = user ? (state.favorites[user.id] || []) : [];
      const wrongIds = user ? Object.keys(state.wrongQuestions[user.id] || {}) : [];
      return {
        ...state,
        currentUser: user,
        userBankIds,
        stats: {
          wrongCount: wrongIds.length,
          favoriteCount: favoriteIds.length
        },
        banks: state.banks.map((bank) => ({
          ...bank,
          questionCount: state.questions.filter((item) => item.bankId === bank.id).length
        })),
        attempts: state.attempts.map((attempt) => ({
          ...attempt,
          userName: state.users.find((userItem) => userItem.id === attempt.userId)?.name || '用户',
          bankName: state.banks.find((bank) => bank.id === attempt.bankId)?.name || '题库'
        }))
      };
    },
    loginUser(name, phone) {
      let user = state.users.find((item) => item.phone === phone);
      if (!user) {
        user = { id: id('user'), role: 'user', name, phone };
        state.users.push(user);
      } else {
        user.name = name;
      }
      state.currentUserId = user.id;
      save();
    },
    loginAdmin(password) {
      if (password !== state.adminPassword) return false;
      let admin = state.users.find((item) => item.role === 'admin');
      if (!admin) {
        admin = { id: id('admin'), role: 'admin', name: '管理员', phone: 'admin' };
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
    joinBank(bankId) {
      const user = currentUser();
      if (!user) return;
      const list = state.userBanks[user.id] || [];
      if (!list.includes(bankId)) state.userBanks[user.id] = [...list, bankId];
      save();
    },
    getQuestions(bankId) {
      return state.questions.filter((item) => item.bankId === bankId);
    },
    submitAnswer(questionId, answer) {
      const user = currentUser();
      const question = state.questions.find((item) => item.id === questionId);
      if (!user || !question) return null;
      const result = judge(question, answer);
      state.attempts.push({ id: id('attempt'), userId: user.id, bankId: question.bankId, questionId, answer, correct: result.correct, createdAt: Date.now() });
      if (!result.correct) {
        state.wrongQuestions[user.id] = state.wrongQuestions[user.id] || {};
        state.wrongQuestions[user.id][questionId] = { questionId, lastAnswer: answer, updatedAt: Date.now() };
      }
      save();
      return result;
    },
    submitExam(questions, answerMap) {
      const results = {};
      questions.forEach((question) => {
        const answer = answerMap[question.id]?.answer || [];
        results[question.id] = this.submitAnswer(question.id, answer);
      });
      const correctCount = Object.values(results).filter((item) => item.correct).length;
      return { results, correctCount, wrongCount: questions.length - correctCount };
    },
    getWrongQuestions(bankId) {
      const user = currentUser();
      if (!user) return [];
      const ids = Object.keys(state.wrongQuestions[user.id] || {});
      return state.questions.filter((item) => ids.includes(item.id) && item.bankId === bankId);
    },
    getFavoriteQuestions(bankId) {
      const user = currentUser();
      if (!user) return [];
      const ids = state.favorites[user.id] || [];
      return state.questions.filter((item) => ids.includes(item.id) && item.bankId === bankId);
    },
    toggleFavorite(questionId) {
      const user = currentUser();
      if (!user) return;
      const list = state.favorites[user.id] || [];
      state.favorites[user.id] = list.includes(questionId) ? list.filter((item) => item !== questionId) : [...list, questionId];
      save();
    },
    getExamTemplate(bankId) {
      return state.examTemplates[bankId] || { ...defaultExamTemplate, typeRatios: { ...defaultExamTemplate.typeRatios }, chapterRatios: {} };
    },
    saveExamTemplate(bankId, template) {
      state.examTemplates[bankId] = template;
      save();
    },
    buildExamPaper(bankId, config) {
      const template = config.useCustom ? config : (state.examTemplates[bankId] || defaultExamTemplate);
      const pool = state.questions.filter((item) => item.bankId === bankId);
      const total = Math.min(Number(template.totalQuestions) || 20, pool.length);
      const typeQuota = quotas(template.typeRatios || defaultExamTemplate.typeRatios, total);
      const chapterQuota = Object.keys(template.chapterRatios || {}).some((key) => Number(template.chapterRatios[key]) > 0)
        ? quotas(template.chapterRatios, total)
        : quotas(countBy(pool, 'chapterId'), total);
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
    },
    renameBank(bankId, name) {
      const bank = state.banks.find((item) => item.id === bankId);
      if (bank) bank.name = name;
      save();
    },
    deleteBank(bankId) {
      state.banks = state.banks.filter((item) => item.id !== bankId);
      state.questions = state.questions.filter((item) => item.bankId !== bankId);
      save();
    },
    importSampleBank() {
      const bankId = id('bank');
      state.banks.push({
        id: bankId,
        name: '新导入演示题库',
        description: '用于验证网站版导入流程的演示题库。',
        status: 'published',
        chapters: [{ id: `${bankId}-ch1`, name: '第一章' }]
      });
      state.questions.push(q(id('q'), bankId, `${bankId}-ch1`, '第一章', 'single', '演示题：以下哪个是正确答案？', ['A. 选项一', 'B. 选项二', 'C. 选项三', 'D. 选项四'], ['A'], '这是演示解析。'));
      save();
    }
  };
}

function q(idValue, bankId, chapterId, chapterName, type, stem, optionTexts, answer, analysis) {
  return {
    id: idValue,
    bankId,
    chapterId,
    chapterName,
    type,
    stem,
    options: optionTexts.map((text, index) => ({ key: String.fromCharCode(65 + index), text })),
    answer,
    answerText: answer.join(''),
    analysis
  };
}

function judge(question, answer) {
  const user = normalize(answer, question.type);
  const expected = normalize(question.answer, question.type);
  const correct = question.type !== 'short' && user.length === expected.length && user.every((item, index) => item === expected[index]);
  return { correct, answer: question.answer, answerText: question.answerText, analysis: question.analysis };
}

function normalize(answer, type) {
  const list = Array.isArray(answer) ? answer : [answer];
  return list.map((item) => String(item || '').trim().replace(/\s+/g, '').toUpperCase()).filter(Boolean).sort();
}

function quotas(ratios, total) {
  const entries = Object.keys(ratios || {}).map((key) => ({ key, value: Math.max(Number(ratios[key]) || 0, 0) })).filter((item) => item.value > 0);
  if (!entries.length) return {};
  const sum = entries.reduce((acc, item) => acc + item.value, 0);
  const output = {};
  let used = 0;
  entries.forEach((item) => {
    output[item.key] = Math.floor(total * item.value / sum);
    used += output[item.key];
  });
  entries.sort((a, b) => (total * b.value / sum % 1) - (total * a.value / sum % 1)).forEach((item) => {
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

function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || structuredClone(initialState);
  } catch {
    return structuredClone(initialState);
  }
}
