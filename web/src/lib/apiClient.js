const defaultBaseUrl = 'http://127.0.0.1:8787';

export function createApiClient(options = {}) {
  const baseUrl = (options.baseUrl || import.meta.env.VITE_API_BASE_URL || defaultBaseUrl).replace(/\/$/, '');
  let userId = localStorage.getItem('question_bank_user_id') || '';
  let adminToken = localStorage.getItem('question_bank_admin_token') || '';

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
    setSession(nextUserId, nextAdminToken = '') {
      userId = nextUserId || '';
      adminToken = nextAdminToken || '';
      if (userId) localStorage.setItem('question_bank_user_id', userId);
      else localStorage.removeItem('question_bank_user_id');
      if (adminToken) localStorage.setItem('question_bank_admin_token', adminToken);
      else localStorage.removeItem('question_bank_admin_token');
    },
    clearSession() {
      userId = '';
      adminToken = '';
      localStorage.removeItem('question_bank_user_id');
      localStorage.removeItem('question_bank_admin_token');
    },
    health: () => request('/api/health', { method: 'GET' }),
    registerUser: (name, phone, password) => request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, phone, password }) }),
    loginUser: (name, phone, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ name, phone, password }) }),
    loginAdmin: (phone, password) => request('/api/admin/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
    listAdminAccounts: () => request('/api/admin/accounts', { method: 'GET' }),
    createAdminAccount: (payload) => request('/api/admin/accounts', { method: 'POST', body: JSON.stringify(payload) }),
    updateAdminAccount: (id, patch) => request('/api/admin/accounts', { method: 'PUT', body: JSON.stringify({ id, patch }) }),
    deleteAdminAccount: (id) => request('/api/admin/accounts', { method: 'DELETE', body: JSON.stringify({ id }) }),
    listAdminUsers: () => request('/api/admin/users', { method: 'GET' }),
    getAdminUserDetail: (userId) => request(`/api/admin/user-detail?userId=${encodeURIComponent(userId)}`, { method: 'GET' }),
    deleteAdminUser: (userId) => request('/api/admin/users', { method: 'DELETE', body: JSON.stringify({ userId }) }),
    listAdminLogs: () => request('/api/admin/logs', { method: 'GET' }),
    listBanks: () => request('/api/banks', { method: 'GET' }),
    listQuestions: (bankId) => request(`/api/questions?bankId=${encodeURIComponent(bankId)}`, { method: 'GET' }),
    joinBank: (bankId) => request('/api/user-banks/join', { method: 'POST', body: JSON.stringify({ bankId }) }),
    submitAnswer: (questionId, answer, source = 'practice') => request('/api/answers', { method: 'POST', body: JSON.stringify({ questionId, answer, source }) }),
    toggleFavorite: (questionId) => request('/api/favorites/toggle', { method: 'POST', body: JSON.stringify({ questionId }) }),
    importBank: (payload) => request('/api/admin/import-bank', { method: 'POST', body: JSON.stringify(payload) }),
    updateBank: (payload) => request('/api/admin/banks', { method: 'PUT', body: JSON.stringify(payload) }),
    deleteBank: (bankId) => request('/api/admin/banks', { method: 'DELETE', body: JSON.stringify({ bankId }) }),
    createChapter: (payload) => request('/api/admin/chapters', { method: 'POST', body: JSON.stringify(payload) }),
    updateChapter: (payload) => request('/api/admin/chapters', { method: 'PUT', body: JSON.stringify(payload) }),
    deleteChapter: (chapterId) => request('/api/admin/chapters', { method: 'DELETE', body: JSON.stringify({ chapterId }) }),
    createQuestion: (payload) => request('/api/admin/questions', { method: 'POST', body: JSON.stringify(payload) }),
    updateQuestion: (payload) => request('/api/admin/questions', { method: 'PUT', body: JSON.stringify(payload) }),
    deleteQuestion: (questionId) => request('/api/admin/questions', { method: 'DELETE', body: JSON.stringify({ questionId }) }),
    createActivationCodes: (planId, count) => request('/api/admin/activation-codes', { method: 'POST', body: JSON.stringify({ planId, count }) })
  };
}
