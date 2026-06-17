const TYPE_FIELDS = [
  { key: 'single', label: '单选占比' },
  { key: 'multiple', label: '多选占比' },
  { key: 'judge', label: '判断占比' },
  { key: 'blank', label: '填空占比' },
  { key: 'short', label: '简答占比' }
];

Page({
  data: {
    loading: false,
    saving: false,
    banks: [],
    bankLabels: [],
    selectedBankIndex: -1,
    form: {
      totalQuestions: 100,
      typeRatios: {
        single: 40,
        multiple: 20,
        judge: 40,
        blank: 0,
        short: 0
      },
      chapterRatios: {}
    },
    chapterFields: [],
    typeFields: TYPE_FIELDS
  },

  onShow() {
    this.loadTemplates();
  },

  async loadTemplates() {
    if (!wx.cloud) return;
    this.setData({ loading: true });
    try {
      const result = await wx.cloud.callFunction({
        name: 'examTemplateManage',
        data: { action: 'overview' }
      });
      const banks = (result.result && result.result.banks) || [];
      const selectedIndex = banks.length ? Math.max(this.data.selectedBankIndex, 0) : -1;
      this.setData({
        banks,
        bankLabels: banks.map((item) => item.name),
        selectedBankIndex: selectedIndex
      });
      if (selectedIndex >= 0) {
        this.fillForm(banks[selectedIndex]);
      }
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '考试模板加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onBankChange(event) {
    const selectedBankIndex = Number(event.detail.value);
    const bank = this.data.banks[selectedBankIndex];
    this.setData({ selectedBankIndex });
    this.fillForm(bank || null);
  },

  onTotalInput(event) {
    this.setData({
      'form.totalQuestions': event.detail.value
    });
  },

  onRatioInput(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({
      [`form.typeRatios.${field}`]: event.detail.value
    });
  },

  onChapterRatioInput(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({
      [`form.chapterRatios.${field}`]: event.detail.value
    });
  },

  async saveTemplate() {
    const bank = this.data.banks[this.data.selectedBankIndex];
    if (!bank) {
      wx.showToast({ title: '请选择题库', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    try {
      await wx.cloud.callFunction({
        name: 'examTemplateManage',
        data: {
          action: 'save',
          bankId: bank.id,
          totalQuestions: Number(this.data.form.totalQuestions) || 100,
          typeRatios: normalizeRatios(this.data.form.typeRatios),
          chapterRatios: normalizeChapterRatios(this.data.form.chapterRatios)
        }
      });
      wx.showToast({ title: '模板已保存', icon: 'success' });
      await this.loadTemplates();
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  fillForm(bank) {
    const template = bank ? bank.template : null;
    const chapters = bank ? (bank.chapters || []) : [];
    const next = template || {
      totalQuestions: 100,
      typeRatios: {
        single: 40,
        multiple: 20,
        judge: 40,
        blank: 0,
        short: 0
      },
      chapterRatios: {}
    };
    this.setData({
      chapterFields: chapters,
      form: {
        totalQuestions: Number(next.totalQuestions) || 100,
        typeRatios: {
          single: Number(next.typeRatios && next.typeRatios.single) || 0,
          multiple: Number(next.typeRatios && next.typeRatios.multiple) || 0,
          judge: Number(next.typeRatios && next.typeRatios.judge) || 0,
          blank: Number(next.typeRatios && next.typeRatios.blank) || 0,
          short: Number(next.typeRatios && next.typeRatios.short) || 0
        },
        chapterRatios: normalizeChapterFormRatios(chapters, next.chapterRatios || {})
      }
    });
  }
});

function normalizeRatios(ratios) {
  const output = {};
  TYPE_FIELDS.forEach((item) => {
    output[item.key] = Math.max(Number(ratios[item.key]) || 0, 0);
  });
  return output;
}

function normalizeChapterFormRatios(chapters, ratios) {
  const output = {};
  (chapters || []).forEach((chapter) => {
    output[chapter.id] = Number(ratios[chapter.id]) || '';
  });
  return output;
}

function normalizeChapterRatios(ratios) {
  const output = {};
  Object.keys(ratios || {}).forEach((chapterId) => {
    output[chapterId] = Math.max(Number(ratios[chapterId]) || 0, 0);
  });
  return output;
}
