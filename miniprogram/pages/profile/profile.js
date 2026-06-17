Page({
  data: {
    user: {},
    stats: {
      myBankCount: 0,
      wrongCount: 0,
      favoriteCount: 0
    },
    loading: false
  },

  onShow() {
    const app = getApp();
    this.setData({ user: app.globalData.user || {} });
    this.loadStats();
  },

  async loadStats() {
    if (!wx.cloud) return;
    this.setData({ loading: true });
    try {
      const [banksResult, wrongResult, favoriteResult] = await Promise.all([
        wx.cloud.callFunction({ name: 'getBanks', data: { joinedOnly: true } }),
        wx.cloud.callFunction({ name: 'getWrongQuestions' }),
        wx.cloud.callFunction({ name: 'getFavorites' })
      ]);
      this.setData({
        stats: {
          myBankCount: ((banksResult.result && banksResult.result.banks) || []).length,
          wrongCount: ((wrongResult.result && wrongResult.result.wrongQuestions) || []).length,
          favoriteCount: ((favoriteResult.result && favoriteResult.result.favorites) || []).length
        }
      });
    } catch (error) {
      console.error(error);
    } finally {
      this.setData({ loading: false });
    }
  },

  goMyBanks() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  goStats() {
    wx.showToast({ title: '练习统计已在本页展示，后续可展开明细', icon: 'none' });
  },

  goFeedback() {
    wx.showModal({
      title: '意见反馈',
      content: '第一版可先联系管理员反馈；后续会增加在线反馈表单。',
      showCancel: false
    });
  },

  manageAccount() {
    wx.showModal({
      title: '账号管理',
      content: `姓名：${this.data.user.name || '未填写'}\n手机号：${this.data.user.phone || '未填写'}`,
      showCancel: false
    });
  },

  logout() {
    const app = getApp();
    app.globalData.user = null;
    wx.reLaunch({ url: '/pages/login/login' });
  }
});
