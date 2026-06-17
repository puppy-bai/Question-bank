Page({
  data: {
    password: '',
    setupToken: '',
    authed: false,
    loading: false
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value });
  },

  onSetupTokenInput(event) {
    this.setData({ setupToken: event.detail.value });
  },

  async login() {
    if (!this.data.password) {
      wx.showToast({ title: '请输入管理员密码', icon: 'none' });
      return;
    }

    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云开发', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'adminLogin',
        data: {
          password: this.data.password,
          setupToken: this.data.setupToken
        }
      });

      if (result.result && result.result.ok) {
        this.setData({ authed: true, password: '', setupToken: '' });
        wx.showToast({
          title: result.result.firstSetup ? '初始化成功' : '登录成功',
          icon: 'success'
        });
        wx.redirectTo({ url: '/pages/admin-home/admin-home' });
      }
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '登录失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goImport() {
    wx.navigateTo({ url: '/pages/admin-import/admin-import' });
  },

  goUsers() {
    wx.navigateTo({ url: '/pages/admin-users/admin-users' });
  },

  goBanks() {
    wx.navigateTo({ url: '/pages/admin-banks/admin-banks' });
  },

  goQuestions() {
    wx.navigateTo({ url: '/pages/admin-questions/admin-questions' });
  },

  goExamTemplates() {
    wx.navigateTo({ url: '/pages/admin-exam-templates/admin-exam-templates' });
  },

  goStats() {
    wx.navigateTo({ url: '/pages/admin-stats/admin-stats' });
  }
});
