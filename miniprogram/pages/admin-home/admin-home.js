Page({
  data: {
    stats: {
      bankCount: 0,
      questionCount: 0
    },
    loading: false
  },

  onShow() {
    this.loadStats();
  },

  async loadStats() {
    if (!wx.cloud) return;
    this.setData({ loading: true });
    try {
      const result = await wx.cloud.callFunction({
        name: 'adminBankManage',
        data: { action: 'overview' }
      });
      const banks = result.result && result.result.banks ? result.result.banks : [];
      const questionCount = banks.reduce((sum, bank) => sum + Number(bank.questionCount || 0), 0);
      this.setData({
        stats: {
          bankCount: banks.length,
          questionCount
        }
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '后台数据加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goBanks() {
    wx.navigateTo({ url: '/pages/admin-banks/admin-banks' });
  },

  goImport() {
    wx.navigateTo({ url: '/pages/admin-import/admin-import' });
  },

  goQuestions() {
    wx.navigateTo({ url: '/pages/admin-questions/admin-questions' });
  },

  goUsers() {
    wx.navigateTo({ url: '/pages/admin-users/admin-users' });
  },

  goStats() {
    wx.navigateTo({ url: '/pages/admin-stats/admin-stats' });
  },

  goExamTemplates() {
    wx.navigateTo({ url: '/pages/admin-exam-templates/admin-exam-templates' });
  }
});
