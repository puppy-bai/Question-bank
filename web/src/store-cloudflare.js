import { createApiClient } from './lib/apiClient.js';
import { defaultExamTemplate } from './store.js';

export function createCloudflareStore() {
  const api = createApiClient();
  let state = {
    currentUser: null,
    banks: [],
    questionsByBank: {},
    userBankIds: [],
    attempts: [],
    favorites: {},
    wrongQuestions: {},
    plans: [
      { id: 'plan-month', name: '月会员', type: 'membership', durationDays: 30, price: 29, enabled: true },
      { id: 'plan-year', name: '年会员', type: 'membership', durationDays: 365, price: 99, enabled: true },
      { id: 'plan-electric', name: '电工题库单库授权', type: 'bank', bankId: 'bank-electric', durationDays: 365, price: 19.9, enabled: true }
    ],
    activationCodes: [],
    orders: [],
    entitlements: {},
    entitlementsView: [],
    stats: { wrongCount: 0, favoriteCount: 0, joinedBankCount: 0, attemptCount: 0 }
  };

  function snapshot() {
    return {
      ...state,
      currentUserId: state.currentUser?.id || '',
      users: state.users?.length ? state.users : (state.currentUser ? [state.currentUser] : []),
      banks: state.banks.map((bank) => ({
        ...bank,
        questionCount: bank.questionCount ?? bank.question_count ?? 0,
        chapterCount: bank.chapterCount ?? bank.chapter_count ?? 0,
        accessType: bank.accessType || bank.access_type || 'free',
        joined: Boolean(bank.joined),
        hasAccess: (bank.accessType || bank.access_type) === 'free' || Boolean(bank.joined)
      })),
      userBankIds: state.userBankIds,
      stats: {
        ...state.stats,
        joinedBankCount: state.userBankIds.length,
        favoriteCount: Object.values(state.favorites).filter(Boolean).length
      }
    };
  }

  async function refreshBanks() {
    const result = await api.listBanks();
    state.banks = (result.banks || []).map(mapBankRow);
    state.userBankIds = state.banks.filter((bank) => bank.joined).map((bank) => bank.id);
  }

  async function ensureQuestions(bankId) {
    if (!state.questionsByBank[bankId]) {
      const result = await api.listQuestions(bankId);
      state.questionsByBank[bankId] = result.questions || [];
    }
    return state.questionsByBank[bankId];
  }

  return {
    isRemote: true,
    api,
    snapshot,
    async bootstrap() {
      await refreshBanks();
    },
    async registerUser(name, phone, password) {
      const result = await api.registerUser(name, phone, password);
      state.currentUser = result.user;
      api.setSession(result.user.id, '');
      await refreshBanks();
      return result.user;
    },
    async loginUser(name, phone, password) {
      const result = await api.loginUser(name, phone, password);
      state.currentUser = result.user;
      api.setSession(result.user.id, '');
      await refreshBanks();
      return result.user;
    },
    async loginAdmin(password) {
      const result = await api.loginAdmin(password);
      state.currentUser = result.user;
      api.setSession(result.user.id, result.token);
      await refreshBanks();
      const users = await api.listAdminUsers();
      state.users = users.users || [];
      return true;
    },
    async refreshAdminUsers() {
      const users = await api.listAdminUsers();
      state.users = users.users || [];
      return state.users;
    },
    logout() {
      api.clearSession();
      state.currentUser = null;
      state.userBankIds = [];
    },
    hasAccess(bankId) {
      const bank = state.banks.find((item) => item.id === bankId);
      return !bank || bank.accessType === 'free' || state.userBankIds.includes(bankId);
    },
    async joinBank(bankId) {
      await api.joinBank(bankId);
      await refreshBanks();
      return { ok: true, message: '已加入我的题库' };
    },
    leaveBank(bankId) {
      state.userBankIds = state.userBankIds.filter((id) => id !== bankId);
    },
    async getQuestions(bankId) {
      return ensureQuestions(bankId);
    },
    getCachedQuestions(bankId) {
      return state.questionsByBank[bankId] || [];
    },
    async submitAnswer(questionId, answer, source = 'practice') {
      const result = await api.submitAnswer(questionId, answer, source);
      state.attempts.push({ id: crypto.randomUUID(), questionId, answer, correct: result.correct, createdAt: Date.now() });
      if (!result.correct) state.stats.wrongCount += 1;
      return result;
    },
    async toggleFavorite(questionId) {
      const result = await api.toggleFavorite(questionId);
      state.favorites[questionId] = result.favorite;
      return result.favorite;
    },
    isFavorite(questionId) {
      return Boolean(state.favorites[questionId]);
    },
    async importBank({ name, description, chapters, questions, accessType = 'free', price = 0, status = 'published' }) {
      const result = await api.importBank({
        bank: { name, description, accessType, price, status },
        chapters,
        questions
      });
      await refreshBanks();
      return { ok: true, bankId: result.bankId, count: result.count };
    },
    async createActivationCodes(planId, count) {
      const result = await api.createActivationCodes(planId, count);
      state.activationCodes = [...state.activationCodes, ...(result.codes || [])];
      return result.codes || [];
    },
    getWrongQuestions(bankId) {
      return [];
    },
    getFavoriteQuestions(bankId) {
      const ids = Object.keys(state.favorites).filter((id) => state.favorites[id]);
      return (state.questionsByBank[bankId] || []).filter((question) => ids.includes(question.id));
    },
    getExamTemplate() {
      return structuredClone(defaultExamTemplate);
    },
    saveExamTemplate() {},
    buildExamPaper(bankId, config) {
      const pool = [...(state.questionsByBank[bankId] || [])];
      const total = Math.min(Number(config?.totalQuestions) || defaultExamTemplate.totalQuestions, pool.length);
      return shuffle(pool).slice(0, total);
    },
    async submitExam(questions, answerMap) {
      const results = {};
      for (const question of questions) {
        const answer = answerMap[question.id]?.answer || [];
        results[question.id] = await this.submitAnswer(question.id, answer, 'exam');
      }
      const correctCount = Object.values(results).filter((item) => item.correct).length;
      return { results, correctCount, wrongCount: questions.length - correctCount };
    },
    renameBank() {},
    updateBank() {},
    deleteBank() {},
    redeemActivationCode() {
      return { ok: false, message: '云端激活码兑换下一步接入' };
    },
    createOrder() {
      return { ok: false, message: '云端订单下一步接入' };
    },
    grantUserPlan() {
      return false;
    },
    async deleteUser(userId) {
      await api.deleteAdminUser(userId);
      state.users = state.users.filter((user) => user.id !== userId);
      return true;
    },
    saveFeedback() {},
    exportState() {
      return JSON.stringify(state, null, 2);
    },
    importState() {},
    resetDemoData() {}
  };
}

function mapBankRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    accessType: row.access_type || row.accessType || 'free',
    price: row.price || 0,
    chapterCount: row.chapter_count || row.chapterCount || 0,
    questionCount: row.question_count || row.questionCount || 0,
    joined: Boolean(row.joined),
    chapters: (row.chapters || []).map((chapter) => ({
      id: chapter.id,
      bankId: chapter.bank_id,
      name: chapter.name,
      sortOrder: chapter.sort_order
    }))
  };
}

function shuffle(list) {
  return [...list].sort(() => Math.random() - 0.5);
}
