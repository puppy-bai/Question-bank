Page({
  data: {
    banks: [],
    loading: false
  },

  onShow() {
    this.loadBanks();
  },

  async loadBanks() {
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云开发', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({ name: 'getBanks' });
      const banks = ((result.result && result.result.banks) || []).map((bank) => ({
        ...bank,
        tagText: bank.status === 'importing' ? '导入中' : (bank.joined ? '已加入' : bank.scope),
        metaText: `${bank.chapterCount || 0} 个章节 · ${bank.questionCount || 0} 道题`
      }));
      this.setData({ banks });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '题库加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  openBank(event) {
    const { id, status } = event.currentTarget.dataset;
    if (status === 'importing') {
      wx.showToast({ title: '题库还在导入中', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/bank-detail/bank-detail?bankId=${id}` });
  },

  async joinBank(event) {
    const { id, status } = event.currentTarget.dataset;
    if (!id || status === 'importing') return;
    if (!wx.cloud) return;

    try {
      await wx.cloud.callFunction({
        name: 'userBankManage',
        data: { action: 'join', bankId: id }
      });
      wx.showToast({ title: '已加入我的题库', icon: 'success' });
      this.loadBanks();
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '加入失败', icon: 'none' });
    }
  }
});
