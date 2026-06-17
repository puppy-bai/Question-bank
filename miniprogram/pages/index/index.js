const MODE_OPTIONS = [
  { key: 'sequence', title: '顺序练习', desc: '按题库原顺序完整练习，可答题也可背题。' },
  { key: 'random', title: '随机练习', desc: '打乱题目顺序随机抽取，不强调原始题号。' },
  { key: 'special', title: '专项练习', desc: '只练单选、多选或判断中的一种题型。' },
  { key: 'chapter', title: '章节练习', desc: '选择题库章节，集中练习某一章节。' },
  { key: 'exam', title: '模拟考试', desc: '按模板组卷，提交后统一批卷计分。' },
  { key: 'wrong', title: '答错的题', desc: '按题库归总以往答错的题目。' },
  { key: 'favorite', title: '收藏的题', desc: '复习答题时收藏的重要题目。' }
];

const TYPE_OPTIONS = [
  { key: 'single', label: '单选' },
  { key: 'multiple', label: '多选' },
  { key: 'judge', label: '判断' }
];

Page({
  data: {
    loading: false,
    modeOptions: MODE_OPTIONS,
    typeOptions: TYPE_OPTIONS,
    selectedMode: 'sequence',
    selectedType: 'single',
    joinedBanks: [],
    stats: {
      myBankCount: 0,
      wrongCount: 0
    }
  },

  onShow() {
    this.loadPracticeHome();
  },

  async loadPracticeHome() {
    if (!wx.cloud) return;

    this.setData({ loading: true });
    try {
      const banksResult = await wx.cloud.callFunction({ name: 'getBanks', data: { joinedOnly: true } });
      const banks = ((banksResult.result && banksResult.result.banks) || []).map(formatBank);
      this.setData({
        joinedBanks: banks,
        stats: {
          myBankCount: banks.length,
          wrongCount: this.data.stats.wrongCount || 0
        }
      });
      this.loadWrongCount();
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '练习数据加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadWrongCount() {
    try {
      const wrongResult = await wx.cloud.callFunction({ name: 'getWrongQuestions' });
      const wrongQuestions = (wrongResult.result && wrongResult.result.wrongQuestions) || [];
      this.setData({ 'stats.wrongCount': wrongQuestions.length });
    } catch (error) {
      console.error(error);
    }
  },

  selectMode(event) {
    this.setData({ selectedMode: event.currentTarget.dataset.mode });
  },

  selectType(event) {
    this.setData({ selectedType: event.currentTarget.dataset.type });
  },

  startWithBank(event) {
    const { bankId } = event.currentTarget.dataset;
    const mode = this.data.selectedMode;
    if (!bankId) return;

    if (mode === 'chapter') {
      wx.navigateTo({ url: `/pages/bank-detail/bank-detail?bankId=${bankId}&focus=chapter` });
      return;
    }

    if (mode === 'wrong') {
      wx.navigateTo({ url: `/pages/wrong/wrong?bankId=${bankId}` });
      return;
    }

    if (mode === 'favorite') {
      wx.navigateTo({ url: `/pages/favorites/favorites?bankId=${bankId}` });
      return;
    }

    if (mode === 'exam') {
      wx.navigateTo({ url: `/pages/exam-config/exam-config?bankId=${bankId}` });
      return;
    }

    const params = [
      `bankId=${bankId}`,
      `sessionMode=${mode === 'exam' ? 'exam' : 'practice'}`
    ];

    if (mode === 'random') {
      params.push(`sessionSeed=${Date.now()}`);
      params.push('random=1');
      params.push('restart=1');
    }
    if (mode === 'special') {
      params.push(`questionType=${this.data.selectedType}`);
      params.push('restart=1');
    }
    wx.navigateTo({ url: `/pages/practice/practice?${params.join('&')}` });
  },

  goBanks() {
    wx.switchTab({ url: '/pages/banks/banks' });
  },

  goWrong() {
    wx.navigateTo({ url: '/pages/wrong/wrong' });
  },

  goFavorites() {
    wx.navigateTo({ url: '/pages/favorites/favorites' });
  }
});

function formatBank(bank) {
  return {
    ...bank,
    metaText: `${bank.chapterCount || 0} 个章节 · ${bank.questionCount || 0} 道题 · 进度 ${bank.progress || 0}%`
  };
}
