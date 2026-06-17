Page({
  data: {
    openid: '',
    loading: false,
    student: null,
    summary: {
      attempts: 0,
      correctRate: 0,
      wrongCount: 0
    },
    attempts: [],
    wrongQuestions: []
  },

  onLoad(options) {
    this.setData({ openid: options.openid || '' });
    this.loadStudentStats();
  },

  async loadStudentStats() {
    if (!this.data.openid) {
      wx.showToast({ title: '缺少学生 OpenID', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'teacherGetStudentStats',
        data: {
          studentOpenid: this.data.openid
        }
      });
      const payload = result.result || {};
      this.setData({
        student: payload.student,
        summary: payload.summary || this.data.summary,
        attempts: payload.attempts || [],
        wrongQuestions: payload.wrongQuestions || []
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '学生数据加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
