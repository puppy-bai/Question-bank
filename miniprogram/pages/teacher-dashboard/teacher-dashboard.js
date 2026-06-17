Page({
  data: {
    loading: false,
    summary: {
      studentCount: 0,
      attempts: 0,
      correctRate: 0,
      wrongCount: 0
    },
    students: [],
    hotWrongs: []
  },

  onShow() {
    this.loadDashboard();
  },

  async loadDashboard() {
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云开发', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({ name: 'teacherGetDashboard' });
      const payload = result.result || {};
      this.setData({
        summary: payload.summary || this.data.summary,
        students: payload.students || [],
        hotWrongs: payload.hotWrongs || []
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '老师数据加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  openStudent(event) {
    const { openid } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/teacher-student/teacher-student?openid=${openid}` });
  }
});
