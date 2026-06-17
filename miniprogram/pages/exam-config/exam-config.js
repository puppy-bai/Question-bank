const TYPE_FIELDS = [
  { key: 'single', label: '单选' },
  { key: 'multiple', label: '多选' },
  { key: 'judge', label: '判断' },
  { key: 'blank', label: '填空' },
  { key: 'short', label: '简答' }
];

Page({
  data: {
    bankId: '',
    bank: null,
    loading: false,
    useCustom: false,
    totalQuestions: 100,
    typeFields: TYPE_FIELDS.map((item) => ({
      ...item,
      ratio: item.key === 'single' ? 40 : (item.key === 'multiple' ? 20 : (item.key === 'judge' ? 40 : 0))
    })),
    chapters: []
  },

  onLoad(options) {
    this.setData({ bankId: options.bankId || '' });
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
      const chapters = (payload.chapters || []).map((chapter) => ({
        id: chapter.id,
        name: chapter.name,
        questionCount: chapter.questionCount || 0,
        ratio: ''
      }));
      this.setData({
        bank: payload.bank || null,
        chapters
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '考试配置加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  switchMode(event) {
    this.setData({ useCustom: event.currentTarget.dataset.custom === '1' });
  },

  onTotalInput(event) {
    this.setData({ totalQuestions: event.detail.value });
  },

  onTypeRatioInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({
      [`typeFields[${index}].ratio`]: event.detail.value
    });
  },

  onChapterRatioInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({
      [`chapters[${index}].ratio`]: event.detail.value
    });
  },

  startExam() {
    if (!this.data.bankId) return;
    const seed = Date.now();
    const totalQuestions = clamp(Number(this.data.totalQuestions) || 100, 1, 200);
    const params = [
      `bankId=${this.data.bankId}`,
      'sessionMode=exam',
      `sessionSeed=${seed}`,
      `questionLimit=${totalQuestions}`,
      'restart=1'
    ];

    if (this.data.useCustom) {
      const configKey = `pending_exam_config_${this.data.bankId}_${seed}`;
      wx.setStorageSync(configKey, {
        totalQuestions,
        typeRatios: ratiosFromList(this.data.typeFields),
        chapterRatios: ratiosFromList(this.data.chapters),
        chapterMode: 'custom',
        scoreMode: 'average',
        totalScore: 100
      });
      params.push(`examConfigKey=${encodeURIComponent(configKey)}`);
    }

    wx.navigateTo({ url: `/pages/practice/practice?${params.join('&')}` });
  }
});

function ratiosFromList(list) {
  const output = {};
  (list || []).forEach((item) => {
    const value = Math.max(Number(item.ratio) || 0, 0);
    if (value > 0) {
      output[item.key || item.id] = value;
    }
  });
  return output;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
