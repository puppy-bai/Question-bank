Page({
  data: {
    bankId: '',
    chapterId: '',
    favorites: [],
    loading: false
  },

  onLoad(options) {
    this.setData({
      bankId: options.bankId || '',
      chapterId: options.chapterId || ''
    });
  },

  onShow() {
    this.loadFavorites();
  },

  async loadFavorites() {
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云开发', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'getFavorites',
        data: {
          bankId: this.data.bankId,
          chapterId: this.data.chapterId
        }
      });
      this.setData({
        favorites: (result.result && result.result.favorites) || []
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '收藏加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  openFavorite(event) {
    const { bankId, questionId } = event.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/practice/practice?bankId=${bankId}&questionId=${questionId}`
    });
  },

  async removeFavorite(event) {
    const { questionId } = event.currentTarget.dataset;
    if (!questionId) return;

    try {
      await wx.cloud.callFunction({
        name: 'toggleFavorite',
        data: {
          questionId,
          favorited: false
        }
      });
      wx.showToast({ title: '已取消收藏', icon: 'success' });
      this.loadFavorites();
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '取消失败', icon: 'none' });
    }
  }
});
