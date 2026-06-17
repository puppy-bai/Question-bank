Page({
  data: {
    bankId: '',
    bank: null,
    chapters: [],
    focusChapter: false,
    loading: false,
    joining: false
  },

  onLoad(options) {
    this.setData({
      bankId: options.bankId || '',
      focusChapter: options.focus === 'chapter'
    });
    this.loadDetail();
  },

  async loadDetail() {
    if (!this.data.bankId) {
      wx.showToast({ title: '缺少题库 ID', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const result = await wx.cloud.callFunction({
        name: 'getBankDetail',
        data: { bankId: this.data.bankId }
      });
      const payload = result.result || {};
      this.setData({
        bank: payload.bank || null,
        chapters: payload.chapters || []
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '题库详情加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  startAllPractice() {
    if (!this.ensureJoined()) return;
    this.openPractice({ sessionMode: 'practice' });
  },

  startRandomTest() {
    if (!this.ensureJoined()) return;
    this.openPractice({ sessionMode: 'practice', random: true, restart: true });
  },

  startExam() {
    if (!this.ensureJoined()) return;
    wx.navigateTo({ url: `/pages/exam-config/exam-config?bankId=${this.data.bankId}` });
  },

  startChapter(event) {
    if (!this.ensureJoined()) return;
    const { id, name } = event.currentTarget.dataset;
    this.openPractice({
      sessionMode: 'practice',
      chapterIds: [id],
      chapterName: name
    });
  },

  async joinBank() {
    if (!this.data.bankId || this.data.joining) return;
    this.setData({ joining: true });
    try {
      await wx.cloud.callFunction({
        name: 'userBankManage',
        data: { action: 'join', bankId: this.data.bankId }
      });
      wx.showToast({ title: '已加入我的题库', icon: 'success' });
      await this.loadDetail();
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '加入失败', icon: 'none' });
    } finally {
      this.setData({ joining: false });
    }
  },

  ensureJoined() {
    if (this.data.bank && this.data.bank.joined) return true;
    wx.showToast({ title: '请先加入我的题库', icon: 'none' });
    return false;
  },

  openPractice({ sessionMode, chapterIds = [], chapterName = '', questionLimit = 0, random = false, restart = false }) {
    const params = [
      `bankId=${this.data.bankId}`,
      `sessionMode=${sessionMode || 'practice'}`
    ];
    if (random) {
      params.push('random=1');
      params.push(`sessionSeed=${Date.now()}`);
    }
    if (sessionMode === 'test' || sessionMode === 'exam') {
      params.push(`sessionSeed=${Date.now()}`);
      params.push(`questionLimit=${questionLimit || (sessionMode === 'test' ? 30 : 100)}`);
      params.push('restart=1');
    }
    if (restart) {
      params.push('restart=1');
    }
    if (chapterIds.length) {
      params.push(`chapterIds=${encodeURIComponent(chapterIds.join(','))}`);
    }
    if (chapterName) {
      params.push(`chapterName=${encodeURIComponent(chapterName)}`);
    }
    wx.navigateTo({ url: `/pages/practice/practice?${params.join('&')}` });
  }
});
