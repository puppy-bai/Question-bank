import { createApiClient } from './lib/apiClient.js';
import { defaultExamTemplate } from './store.js';

export function createCloudflareStore() {
  const api = createApiClient();
  const savedUserId = api.getUserId();
  const savedAdminToken = api.getAdminToken?.() || '';
  let state = {
    currentUser: savedUserId ? { id: savedUserId, role: savedAdminToken ? 'admin' : 'user', name: savedAdminToken ? '管理员' : '用户', phone: '' } : null,
    banks: [],
    questionsByBank: {},
    examTemplatesByBank: {},
    userBankIds: [],
    attempts: [],
    favorites: {},
    wrongQuestions: {},
    selectedUserDetail: null,
    adminLogs: [],
    adminAccounts: [],
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
        hasAccess: bank.hasAccess ?? (bank.has_access !== undefined ? Boolean(bank.has_access) : (bank.accessType || bank.access_type) === 'free')
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

  async function refreshOrders() {
    if (!state.currentUser?.id) return;
    if (state.currentUser.role === 'admin') {
      const result = await api.listAdminOrders();
      state.orders = result.orders || [];
      return;
    }
    const result = await api.listUserOrders();
    state.orders = result.orders || [];
    state.entitlementsView = result.entitlements || [];
    state.entitlements = { [state.currentUser.id]: state.entitlementsView };
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
      if (api.getUserId()) {
        try {
          const result = await api.getSession();
          state.currentUser = result.user;
        } catch (error) {
          api.clearSession();
          state.currentUser = null;
        }
      }
      await Promise.all([refreshBanks(), refreshOrders()]);
    },
    async registerUser(name, phone, password) {
      const result = await api.registerUser(name, phone, password);
      state.currentUser = result.user;
      api.setSession(result.user.id, '');
      await Promise.all([refreshBanks(), refreshOrders()]);
      return result.user;
    },
    async loginUser(phone, password) {
      const result = await api.loginUser(phone, password);
      state.currentUser = result.user;
      api.setSession(result.user.id, '');
      await Promise.all([refreshBanks(), refreshOrders()]);
      return result.user;
    },
    async loginAdmin(phone, password) {
      const result = await api.loginAdmin(phone, password);
      state.currentUser = result.user;
      api.setSession(result.user.id, result.token);
      const [users, admins] = await Promise.all([
        api.listAdminUsers(),
        api.listAdminAccounts(),
        refreshBanks(),
        refreshOrders()
      ]);
      state.users = users.users || [];
      state.adminAccounts = admins.admins || [];
      return true;
    },
    async refreshAdminAccounts() {
      const result = await api.listAdminAccounts();
      state.adminAccounts = result.admins || [];
      return state.adminAccounts;
    },
    async createAdminAccount(payload) {
      await api.createAdminAccount(payload);
      return this.refreshAdminAccounts();
    },
    async updateAdminAccount(id, patch) {
      await api.updateAdminAccount(id, patch);
      return this.refreshAdminAccounts();
    },
    async deleteAdminAccount(id) {
      await api.deleteAdminAccount(id);
      return this.refreshAdminAccounts();
    },
    async refreshAdminUsers() {
      const users = await api.listAdminUsers();
      state.users = users.users || [];
      return state.users;
    },
    async getAdminUserDetail(userId) {
      const detail = await api.getAdminUserDetail(userId);
      state.selectedUserDetail = detail;
      return detail;
    },
    async refreshAdminLogs() {
      const result = await api.listAdminLogs();
      state.adminLogs = result.logs || [];
      return state.adminLogs;
    },
    async refreshOrders() {
      await refreshOrders();
      return state.orders;
    },
    logout() {
      api.clearSession();
      state.currentUser = null;
      state.userBankIds = [];
    },
    hasAccess(bankId) {
      const bank = state.banks.find((item) => item.id === bankId);
      return !bank || bank.accessType === 'free' || Boolean(bank.hasAccess);
    },
    async joinBank(bankId) {
      await api.joinBank(bankId);
      await refreshBanks();
      return { ok: true, message: '已加入我的题库' };
    },
    async leaveBank(bankId) {
      await api.leaveBank(bankId);
      state.userBankIds = state.userBankIds.filter((id) => id !== bankId);
      await refreshBanks();
      return true;
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
      state.stats.attemptCount += 1;
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
    async getWrongQuestions(bankId, chapterId = '') {
      const result = await api.listWrongQuestions(bankId, chapterId);
      const questions = result.questions || [];
      state.questionsByBank[bankId] ||= [];
      const known = new Map(state.questionsByBank[bankId].map((question) => [question.id, question]));
      questions.forEach((question) => known.set(question.id, question));
      state.questionsByBank[bankId] = [...known.values()];
      return questions;
    },
    async getFavoriteQuestions(bankId, chapterId = '') {
      const result = await api.listFavoriteQuestions(bankId, chapterId);
      const questions = result.questions || [];
      questions.forEach((question) => { state.favorites[question.id] = true; });
      state.questionsByBank[bankId] ||= [];
      const known = new Map(state.questionsByBank[bankId].map((question) => [question.id, question]));
      questions.forEach((question) => known.set(question.id, question));
      state.questionsByBank[bankId] = [...known.values()];
      return questions;
    },
    async getExamTemplates(bankId) {
      const result = await api.listExamTemplates(bankId);
      state.examTemplatesByBank[bankId] = result.templates || [];
      return state.examTemplatesByBank[bankId];
    },
    getExamTemplatesCached(bankId) {
      return state.examTemplatesByBank[bankId] || [];
    },
    getExamTemplate(bankId, templateId = '') {
      const templates = state.examTemplatesByBank[bankId] || [];
      const found = templates.find((item) => item.id === templateId) || templates.find((item) => item.isDefault) || templates[0];
      return structuredClone(found || { ...defaultExamTemplate, id: '', bankId, name: '默认模拟考试', isDefault: true });
    },
    async ensureExamTemplates(bankId) {
      if (!state.examTemplatesByBank[bankId]?.length) await this.getExamTemplates(bankId);
      return state.examTemplatesByBank[bankId];
    },
    async saveExamTemplate(bankId, template) {
      const payload = { ...template, bankId };
      const result = template.id ? await api.updateExamTemplate(payload) : await api.createExamTemplate(payload);
      await this.getExamTemplates(bankId);
      return result.template;
    },
    async createExamTemplate(bankId, template = {}) {
      const result = await api.createExamTemplate({ ...template, bankId });
      await this.getExamTemplates(bankId);
      return result.template;
    },
    async deleteExamTemplates(bankId, templateIds) {
      await api.deleteExamTemplates(bankId, templateIds);
      await this.getExamTemplates(bankId);
      return true;
    },
    buildExamPaper(bankId, config) {
      const pool = [...(state.questionsByBank[bankId] || [])];
      const chosen = config?.useCustom ? config : this.getExamTemplate(bankId, config?.templateId);
      const total = Math.min(Number(chosen?.totalQuestions) || defaultExamTemplate.totalQuestions, pool.length);
      return selectByRatios(pool, total, normalizeTemplate(chosen));
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
    async renameBank(bankId, name) {
      await api.updateBank({ id: bankId, name });
      await refreshBanks();
      return true;
    },
    async updateBank(bankId, patch) {
      await api.updateBank({ id: bankId, ...patch });
      await refreshBanks();
      return true;
    },
    async bulkUpdateBanks(bankIds, patch) {
      const ids = [...new Set(bankIds || [])];
      await Promise.all(ids.map((bankId) => api.updateBank({ id: bankId, ...patch })));
      await refreshBanks();
      return true;
    },
    async deleteBank(bankId) {
      await api.deleteBank(bankId);
      delete state.questionsByBank[bankId];
      await refreshBanks();
      return true;
    },
    async bulkDeleteBanks(bankIds) {
      const ids = [...new Set(bankIds || [])];
      await Promise.all(ids.map((bankId) => api.deleteBank(bankId)));
      ids.forEach((bankId) => delete state.questionsByBank[bankId]);
      await refreshBanks();
      return true;
    },
    async createChapter(payload) {
      const result = await api.createChapter(payload);
      await refreshBanks();
      return result.chapter;
    },
    async updateChapter(payload) {
      await api.updateChapter(payload);
      await refreshBanks();
      return true;
    },
    async deleteChapter(chapterId, bankId) {
      await api.deleteChapter(chapterId);
      if (bankId) delete state.questionsByBank[bankId];
      await refreshBanks();
      return true;
    },
    async createQuestion(payload) {
      await api.createQuestion(payload);
      delete state.questionsByBank[payload.bankId];
      await refreshBanks();
      return true;
    },
    async updateQuestion(payload) {
      await api.updateQuestion(payload);
      delete state.questionsByBank[payload.bankId];
      await refreshBanks();
      return true;
    },
    async deleteQuestion(questionId, bankId) {
      await api.deleteQuestion(questionId);
      if (bankId) delete state.questionsByBank[bankId];
      await refreshBanks();
      return true;
    },
    async redeemActivationCode(code) {
      const result = await api.redeemActivationCode(code);
      await refreshBanks();
      await refreshOrders();
      return { ok: true, message: result.message || '激活成功' };
    },
    async createOrder(planIdOrPayload) {
      const payload = typeof planIdOrPayload === 'string' ? { planId: planIdOrPayload } : planIdOrPayload;
      const result = await api.createOrder(payload);
      await refreshOrders();
      return { ok: true, order: result.order, payment: result.payment };
    },
    async markOrderPaid(orderId) {
      await api.markOrderPaid(orderId);
      await refreshOrders();
      await refreshBanks();
      return true;
    },
    async grantUserPlan(userId, grant) {
      const payload = typeof grant === 'string' ? { userId, planId: grant } : { userId, ...(grant || {}) };
      await api.createAdminEntitlement(payload);
      await this.refreshAdminUsers();
      if (state.selectedUserDetail?.user?.id === userId) await this.getAdminUserDetail(userId);
      await refreshBanks();
      return true;
    },
    async deleteUserEntitlement(entitlementId, userId) {
      await api.deleteAdminEntitlement(entitlementId);
      await this.refreshAdminUsers();
      if (userId) await this.getAdminUserDetail(userId);
      await refreshBanks();
      return true;
    },
    async deleteUser(userId) {
      await api.deleteAdminUser(userId);
      state.users = state.users.filter((user) => user.id !== userId);
      if (state.selectedUserDetail?.user?.id === userId) state.selectedUserDetail = null;
      return true;
    },
    async saveFeedback(content) {
      await api.saveFeedback(content);
      return true;
    },
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
    hasAccess: row.hasAccess ?? (row.has_access !== undefined ? Boolean(row.has_access) : (row.access_type || row.accessType) === 'free'),
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

function normalizeTemplate(template) {
  return {
    totalQuestions: Math.max(Number(template?.totalQuestions) || defaultExamTemplate.totalQuestions, 1),
    typeRatios: { ...defaultExamTemplate.typeRatios, ...(template?.typeRatios || {}) },
    chapterRatios: { ...(template?.chapterRatios || {}) }
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

  return shuffle(selected);
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
