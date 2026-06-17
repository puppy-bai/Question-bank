Page({
  data: {
    bankId: '',
    chapterId: '',
    wrongQuestions: [],
    loading: false
  },

  onLoad(options) {
    this.setData({
      bankId: options.bankId || '',
      chapterId: options.chapterId || ''
    });
  },

  onShow() {
    this.loadWrongQuestions();
  },

  async loadWrongQuestions() {
    if (!wx.cloud) return;

    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'getWrongQuestions',
        data: {
          bankId: this.data.bankId,
          chapterId: this.data.chapterId
        }
      });
      this.setData({
        wrongQuestions: (result.result && result.result.wrongQuestions) || []
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '错题加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  openWrong(event) {
    const { bankId, questionId } = event.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/practice/practice?bankId=${bankId}&questionId=${questionId}`
    });
  },

  async markMastered(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) return;

    wx.showModal({
      title: '提示',
      content: '确定把这道题标记为已掌握吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await wx.cloud.callFunction({
            name: 'markWrongQuestionMastered',
            data: { wrongId: id }
          });
          wx.showToast({ title: '已标记', icon: 'success' });
          this.loadWrongQuestions();
        } catch (error) {
          console.error(error);
          wx.showToast({ title: error.message || '操作失败', icon: 'none' });
        }
      }
    });
  }
});
