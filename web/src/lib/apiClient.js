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
    loginAdmin: (password) => request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
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
    createActivationCodes: (planId, count) => request('/api/admin/activation-codes', { method: 'POST', body: JSON.stringify({ planId, count }) })
  };
}
