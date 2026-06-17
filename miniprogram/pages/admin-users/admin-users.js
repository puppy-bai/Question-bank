const ROLE_OPTIONS = [
  { label: '普通用户', value: 'user' },
  { label: '管理员', value: 'admin' }
];

Page({
  data: {
    loading: false,
    saving: false,
    summary: {
      userCount: 0,
      adminCount: 0,
      activeUserCount: 0,
      attemptCount: 0,
      avgCorrectRate: 0,
      wrongCount: 0,
      favoriteCount: 0
    },
    users: [],
    roleLabels: ROLE_OPTIONS.map((item) => item.label),
    roleIndex: 0,
    userForm: {
      openid: '',
      name: '',
      role: 'user'
    }
  },

  onShow() {
    this.loadOverview();
  },

  async loadOverview() {
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云开发', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const result = await wx.cloud.callFunction({
        name: 'adminBankManage',
        data: { action: 'userOverview' }
      });
      const payload = result.result || {};
      this.setData({
        summary: payload.summary || this.data.summary,
        users: (payload.users || []).map(formatUser)
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '用户数据加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onUserFieldInput(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({
      [`userForm.${field}`]: event.detail.value
    });
  },

  onRoleChange(event) {
    const roleIndex = Number(event.detail.value);
    this.setData({
      roleIndex,
      'userForm.role': ROLE_OPTIONS[roleIndex].value
    });
  },

  editUser(event) {
    const { openid } = event.currentTarget.dataset;
    const user = this.data.users.find((item) => item.openid === openid);
    if (!user) return;

    const roleIndex = Math.max(0, ROLE_OPTIONS.findIndex((item) => item.value === user.role));
    this.setData({
      roleIndex,
      userForm: {
        openid: user.openid,
        name: user.name || '',
        role: user.role || 'user'
      }
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  resetUserForm() {
    this.setData({
      roleIndex: 0,
      userForm: {
        openid: '',
        name: '',
        role: 'user'
      }
    });
  },

  async saveUser() {
    const { userForm } = this.data;
    if (!userForm.openid.trim()) {
      wx.showToast({ title: '请填写 OpenID', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    try {
      await wx.cloud.callFunction({
        name: 'adminBankManage',
        data: {
          action: 'saveUserProfile',
          openid: userForm.openid,
          name: userForm.name,
          role: userForm.role
        }
      });
      wx.showToast({ title: '用户已保存', icon: 'success' });
      this.resetUserForm();
      await this.loadOverview();
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});

function formatUser(user) {
  return {
    ...user,
    displayName: user.name || '未命名用户',
    roleLabel: user.role === 'admin' ? '管理员' : '普通用户',
    shortOpenid: shortOpenid(user.openid),
    lastActiveText: formatDate(user.lastActiveAt),
    createdText: formatDate(user.createdAt)
  };
}

function shortOpenid(openid) {
  if (!openid || openid.length <= 12) return openid || '';
  return `${openid.slice(0, 6)}...${openid.slice(-4)}`;
}

function formatDate(value) {
  if (!value) return '暂无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无记录';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
