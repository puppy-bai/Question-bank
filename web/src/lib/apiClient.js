const defaultBaseUrl = 'https://api.090105.xyz';

export function createApiClient(options = {}) {
  const runtimeBaseUrl = typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:8787'
    : defaultBaseUrl;
  const baseUrl = (options.baseUrl || import.meta.env.VITE_API_BASE_URL || runtimeBaseUrl).replace(/\/$/, '');
  const isAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
  const legacyUserId = localStorage.getItem('question_bank_user_id') || '';
  const savedAdminToken = localStorage.getItem('question_bank_admin_token') || '';
  let userSessionId = localStorage.getItem('question_bank_user_session_id') || (!savedAdminToken ? legacyUserId : '');
  let adminSessionId = localStorage.getItem('question_bank_admin_session_id') || (savedAdminToken ? legacyUserId : '');
  let adminToken = savedAdminToken;
  let userId = isAdminPath ? adminSessionId : userSessionId;

  async function request(path, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('content-type', 'application/json');
    if (userId) headers.set('x-user-id', userId);
    if (adminToken) headers.set('x-admin-token', adminToken);

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `请求失败：${response.status}`);
    return data;
  }

  return {
    baseUrl,
    getUserId: () => userId,
    getAdminToken: () => (isAdminPath ? adminToken : ''),
    setSession(nextUserId, nextAdminToken = '') {
      userId = nextUserId || '';
      if (nextAdminToken) {
        adminSessionId = userId;
        adminToken = nextAdminToken;
        localStorage.setItem('question_bank_admin_session_id', adminSessionId);
        localStorage.setItem('question_bank_admin_token', adminToken);
        localStorage.setItem('question_bank_user_id', adminSessionId);
      } else {
        userSessionId = userId;
        if (userSessionId) {
          localStorage.setItem('question_bank_user_session_id', userSessionId);
          localStorage.setItem('question_bank_user_id', userSessionId);
        } else {
          localStorage.removeItem('question_bank_user_session_id');
          if (!adminToken) localStorage.removeItem('question_bank_user_id');
        }
      }
    },
    clearSession() {
      userId = '';
      if (isAdminPath) {
        adminSessionId = '';
        adminToken = '';
        localStorage.removeItem('question_bank_admin_session_id');
        localStorage.removeItem('question_bank_admin_token');
        if (userSessionId) localStorage.setItem('question_bank_user_id', userSessionId);
        else localStorage.removeItem('question_bank_user_id');
      } else {
        userSessionId = '';
        localStorage.removeItem('question_bank_user_session_id');
        if (adminSessionId) localStorage.setItem('question_bank_user_id', adminSessionId);
        else localStorage.removeItem('question_bank_user_id');
      }
    },
    health: () => request('/api/health', { method: 'GET' }),
    getSession: () => request('/api/auth/session', { method: 'GET' }),
    registerUser: (name, phone, password) => request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, phone, password }) }),
    loginUser: (phone, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
    loginAdmin: (phone, password) => request('/api/admin/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
    listAdminAccounts: () => request('/api/admin/accounts', { method: 'GET' }),
    createAdminAccount: (payload) => request('/api/admin/accounts', { method: 'POST', body: JSON.stringify(payload) }),
    updateAdminAccount: (id, patch) => request('/api/admin/accounts', { method: 'PUT', body: JSON.stringify({ id, patch }) }),
    deleteAdminAccount: (id) => request('/api/admin/accounts', { method: 'DELETE', body: JSON.stringify({ id }) }),
    listAdminUsers: () => request('/api/admin/users', { method: 'GET' }),
    getAdminUserDetail: (userId) => request(`/api/admin/user-detail?userId=${encodeURIComponent(userId)}`, { method: 'GET' }),
    deleteAdminUser: (userId) => request('/api/admin/users', { method: 'DELETE', body: JSON.stringify({ userId }) }),
    createAdminEntitlement: (payload) => request('/api/admin/entitlements', { method: 'POST', body: JSON.stringify(payload) }),
    deleteAdminEntitlement: (entitlementId) => request('/api/admin/entitlements', { method: 'DELETE', body: JSON.stringify({ entitlementId }) }),
    listAdminLogs: () => request('/api/admin/logs', { method: 'GET' }),
    listAdminOrders: () => request('/api/admin/orders', { method: 'GET' }),
    markOrderPaid: (orderId) => request('/api/admin/orders/mark-paid', { method: 'POST', body: JSON.stringify({ orderId }) }),
    listBanks: () => request('/api/banks', { method: 'GET' }),
    listQuestions: (bankId) => request(`/api/questions?bankId=${encodeURIComponent(bankId)}`, { method: 'GET' }),
    listExamTemplates: (bankId) => request(`/api/exam-templates?bankId=${encodeURIComponent(bankId)}`, { method: 'GET' }),
    joinBank: (bankId) => request('/api/user-banks/join', { method: 'POST', body: JSON.stringify({ bankId }) }),
    leaveBank: (bankId) => request('/api/user-banks/leave', { method: 'POST', body: JSON.stringify({ bankId }) }),
    listWrongQuestions: (bankId, chapterId = '') => request(`/api/wrong-questions?bankId=${encodeURIComponent(bankId)}&chapterId=${encodeURIComponent(chapterId)}`, { method: 'GET' }),
    listFavoriteQuestions: (bankId, chapterId = '') => request(`/api/favorites?bankId=${encodeURIComponent(bankId)}&chapterId=${encodeURIComponent(chapterId)}`, { method: 'GET' }),
    listUserOrders: () => request('/api/user/orders', { method: 'GET' }),
    createOrder: (payload) => request('/api/user/orders', { method: 'POST', body: JSON.stringify(payload) }),
    redeemActivationCode: (code) => request('/api/user/activation-codes/redeem', { method: 'POST', body: JSON.stringify({ code }) }),
    submitAnswer: (questionId, answer, source = 'practice') => request('/api/answers', { method: 'POST', body: JSON.stringify({ questionId, answer, source }) }),
    toggleFavorite: (questionId) => request('/api/favorites/toggle', { method: 'POST', body: JSON.stringify({ questionId }) }),
    saveFeedback: (content) => request('/api/feedback', { method: 'POST', body: JSON.stringify({ content }) }),
    importBank: (payload) => request('/api/admin/import-bank', { method: 'POST', body: JSON.stringify(payload) }),
    updateBank: (payload) => request('/api/admin/banks', { method: 'PUT', body: JSON.stringify(payload) }),
    deleteBank: (bankId) => request('/api/admin/banks', { method: 'DELETE', body: JSON.stringify({ bankId }) }),
    createChapter: (payload) => request('/api/admin/chapters', { method: 'POST', body: JSON.stringify(payload) }),
    updateChapter: (payload) => request('/api/admin/chapters', { method: 'PUT', body: JSON.stringify(payload) }),
    deleteChapter: (chapterId) => request('/api/admin/chapters', { method: 'DELETE', body: JSON.stringify({ chapterId }) }),
    createQuestion: (payload) => request('/api/admin/questions', { method: 'POST', body: JSON.stringify(payload) }),
    updateQuestion: (payload) => request('/api/admin/questions', { method: 'PUT', body: JSON.stringify(payload) }),
    deleteQuestion: (questionId) => request('/api/admin/questions', { method: 'DELETE', body: JSON.stringify({ questionId }) }),
    createExamTemplate: (payload) => request('/api/admin/exam-templates', { method: 'POST', body: JSON.stringify(payload) }),
    updateExamTemplate: (payload) => request('/api/admin/exam-templates', { method: 'PUT', body: JSON.stringify(payload) }),
    deleteExamTemplates: (bankId, templateIds) => request('/api/admin/exam-templates', { method: 'DELETE', body: JSON.stringify({ bankId, templateIds }) }),
    createActivationCodes: (planId, count) => request('/api/admin/activation-codes', { method: 'POST', body: JSON.stringify({ planId, count }) })
  };
}
