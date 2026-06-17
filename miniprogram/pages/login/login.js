Page({
  data: {
    name: '',
    phone: '',
    loading: false
  },

  onNameInput(event) {
    this.setData({ name: event.detail.value });
  },

  onPhoneInput(event) {
    this.setData({ phone: event.detail.value });
  },

  async loginUser() {
    if (this.data.loading) return;
    const name = this.data.name.trim();
    const phone = this.data.phone.replace(/\s+/g, '').trim();

    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云开发', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const result = await wx.cloud.callFunction({
        name: 'login',
        data: { name, phone }
      });
      const app = getApp();
      app.globalData.user = result.result && result.result.user;
      wx.switchTab({ url: '/pages/index/index' });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '登录失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  loginAdmin() {
    wx.navigateTo({ url: '/pages/admin/admin' });
  }
});
