const TYPE_OPTIONS = [
  { label: '单选', value: 'single' },
  { label: '多选', value: 'multiple' },
  { label: '判断', value: 'judge' },
  { label: '填空', value: 'blank' },
  { label: '简答', value: 'short' }
];

const STATUS_OPTIONS = [
  { label: '已发布', value: 'published' },
  { label: '已下架', value: 'draft' }
];

Page({
  data: {
    loading: false,
    saving: false,
    banks: [],
    bankLabels: [],
    chapters: [],
    chapterPicker: [{ id: '', name: '默认章节' }],
    questions: [],
    selectedBankIndex: 0,
    typeLabels: TYPE_OPTIONS.map((item) => item.label),
    statusLabels: STATUS_OPTIONS.map((item) => item.label),
    typeIndex: 0,
    statusIndex: 0,
    chapterIndex: 0,
    initialBankId: '',
    form: emptyForm()
  },

  onLoad(options = {}) {
    this.setData({
      initialBankId: options.bankId || ''
    });
  },

  onShow() {
    this.loadOverview(this.data.initialBankId);
  },

  async loadOverview(bankId) {
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云开发', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'adminQuestionManage',
        data: {
          action: 'overview',
          bankId: bankId || this.currentBankId()
        }
      });
      const payload = result.result || {};
      const banks = payload.banks || [];
      const selectedBankId = payload.selectedBankId || (banks[0] && banks[0].id) || '';
      const selectedBankIndex = Math.max(0, banks.findIndex((item) => item.id === selectedBankId));
      const chapters = payload.chapters || [];

      this.setData({
        banks,
        bankLabels: banks.map((item) => item.name),
        selectedBankIndex,
        chapters,
        chapterPicker: [{ id: '', name: '默认章节' }].concat(chapters),
        questions: payload.questions || []
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '题目加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onBankChange(event) {
    const selectedBankIndex = Number(event.detail.value);
    const bank = this.data.banks[selectedBankIndex];
    this.setData({
      selectedBankIndex,
      form: emptyForm(),
      typeIndex: 0,
      statusIndex: 0,
      chapterIndex: 0
    });
    this.loadOverview(bank && bank.id);
  },

  async editQuestion(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) return;

    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'adminQuestionManage',
        data: {
          action: 'getQuestion',
          questionId: id
        }
      });
      const question = (result.result && result.result.question) || {};
      const typeIndex = Math.max(0, TYPE_OPTIONS.findIndex((item) => item.value === question.type));
      const statusIndex = Math.max(0, STATUS_OPTIONS.findIndex((item) => item.value === question.status));
      const chapterIndex = getChapterIndex(this.data.chapterPicker, question.chapterId);

      this.setData({
        typeIndex,
        statusIndex,
        chapterIndex,
        form: {
          questionId: question.id || '',
          stem: question.stem || '',
          groupStem: question.groupStem || '',
          optionsText: optionsToText(question.options || []),
          answerText: answerToText(question.answer || [], question.type),
          analysis: question.analysis || '',
          chapterName: question.chapterName || ''
        }
      });
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '题目详情加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  resetForm() {
    this.setData({
      form: emptyForm(),
      typeIndex: 0,
      statusIndex: 0,
      chapterIndex: 0
    });
  },

  onFieldInput(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({
      [`form.${field}`]: event.detail.value
    });
  },

  onTypeChange(event) {
    this.setData({
      typeIndex: Number(event.detail.value)
    });
  },

  onStatusChange(event) {
    this.setData({
      statusIndex: Number(event.detail.value)
    });
  },

  onChapterChange(event) {
    this.setData({
      chapterIndex: Number(event.detail.value)
    });
  },

  async saveQuestion() {
    const bankId = this.currentBankId();
    if (!bankId) {
      wx.showToast({ title: '请先选择题库', icon: 'none' });
      return;
    }

    const type = TYPE_OPTIONS[this.data.typeIndex].value;
    const status = STATUS_OPTIONS[this.data.statusIndex].value;
    const chapter = this.data.chapterPicker[this.data.chapterIndex] || { id: '', name: '' };
    const answer = parseAnswer(this.data.form.answerText, type);
    const options = parseOptions(this.data.form.optionsText);

    if (!this.data.form.stem.trim()) {
      wx.showToast({ title: '请填写题干', icon: 'none' });
      return;
    }

    if ((type === 'single' || type === 'multiple') && !options.length) {
      wx.showToast({ title: '请填写选项', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    try {
      await wx.cloud.callFunction({
        name: 'adminQuestionManage',
        data: {
          action: 'saveQuestion',
          questionId: this.data.form.questionId,
          bankId,
          chapterId: chapter.id,
          chapterName: chapter.name,
          type,
          status,
          stem: this.data.form.stem,
          groupStem: this.data.form.groupStem,
          options,
          answer,
          answerText: this.data.form.answerText,
          analysis: this.data.form.analysis
        }
      });
      wx.showToast({ title: '题目已保存', icon: 'success' });
      this.resetForm();
      await this.loadOverview(bankId);
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async toggleStatus(event) {
    const { id, status } = event.currentTarget.dataset;
    const nextStatus = status === 'published' ? 'draft' : 'published';
    const ok = await confirmModal(nextStatus === 'draft' ? '确定下架这道题吗？' : '确定重新发布这道题吗？');
    if (!ok) return;

    this.setData({ saving: true });

    try {
      await wx.cloud.callFunction({
        name: 'adminQuestionManage',
        data: {
          action: 'setQuestionStatus',
          questionId: id,
          status: nextStatus
        }
      });
      wx.showToast({ title: nextStatus === 'draft' ? '已下架' : '已发布', icon: 'success' });
      await this.loadOverview(this.currentBankId());
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  currentBankId() {
    const bank = this.data.banks[this.data.selectedBankIndex];
    return bank ? bank.id : '';
  }
});

function emptyForm() {
  return {
    questionId: '',
    stem: '',
    groupStem: '',
    optionsText: 'A. \nB. \nC. \nD. ',
    answerText: '',
    analysis: '',
    chapterName: ''
  };
}

function parseOptions(text) {
  return String(text || '')
    .split('\n')
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      const matched = trimmed.match(/^([A-Za-z])[\.\u3001\uFF0E\s]+(.+)$/);
      if (matched) {
        return {
          key: matched[1].toUpperCase(),
          text: matched[2].trim()
        };
      }
      return {
        key: String.fromCharCode(65 + index),
        text: trimmed
      };
    })
    .filter(Boolean);
}

function parseAnswer(text, type) {
  const value = String(text || '').trim();
  if (!value) return [];

  if (type === 'multiple') {
    return value.replace(/[,\uFF0C\u3001\s]/g, '').split('').map((item) => item.toUpperCase());
  }

  if (type === 'single') {
    return [value.slice(0, 1).toUpperCase()];
  }

  if (type === 'blank') {
    return value.split(/[,\uFF0C\n]/).map((item) => item.trim()).filter(Boolean);
  }

  return [value];
}

function optionsToText(options) {
  if (!options.length) return 'A. \nB. \nC. \nD. ';
  return options.map((item) => `${item.key}. ${item.text || ''}`).join('\n');
}

function answerToText(answer, type) {
  if (type === 'blank') return answer.join('\n');
  if (type === 'multiple') return answer.join('');
  return answer.join('');
}

function getChapterIndex(chapterPicker, chapterId) {
  const index = chapterPicker.findIndex((item) => item.id === chapterId);
  return index >= 0 ? index : 0;
}

function confirmModal(content) {
  return new Promise((resolve) => {
    wx.showModal({
      title: '提示',
      content,
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false)
    });
  });
}
