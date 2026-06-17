const MODE_OPTIONS = [
  { label: '公开可见', value: 'all' },
  { label: '指定分组', value: 'classes' }
];

Page({
  data: {
    loading: false,
    saving: false,
    banks: [],
    classes: [],
    bankLabels: [],
    modeLabels: MODE_OPTIONS.map((item) => item.label),
    selectedBankIndex: -1,
    selectedModeIndex: 0,
    classOptions: []
  },

  onShow() {
    this.loadOverview();
  },

  async loadOverview() {
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云开发', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'adminBankManage',
        data: { action: 'overview' }
      });
      const payload = result.result || {};
      const banks = (payload.banks || []).map(formatBank);
      const classes = payload.classes || [];
      const selectedBank = banks[this.data.selectedBankIndex] || null;
      this.setData({
        banks,
        classes,
        bankLabels: banks.map((item) => item.label),
        classOptions: buildClassOptions(classes, selectedBank),
        selectedModeIndex: selectedBank && selectedBank.visibilityMode === 'classes' ? 1 : 0
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '题库管理加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onBankChange(event) {
    this.selectBank(Number(event.detail.value));
  },

  editBank(event) {
    this.selectBank(Number(event.currentTarget.dataset.index));
  },

  selectBank(selectedBankIndex) {
    const bank = this.data.banks[selectedBankIndex];
    this.setData({
      selectedBankIndex,
      selectedModeIndex: bank && bank.visibilityMode === 'classes' ? 1 : 0,
      classOptions: buildClassOptions(this.data.classes, bank)
    });
  },

  onModeChange(event) {
    this.setData({ selectedModeIndex: Number(event.detail.value) });
  },

  onClassChange(event) {
    const selectedIds = event.detail.value || [];
    this.setData({
      classOptions: this.data.classOptions.map((item) => ({
        ...item,
        checked: selectedIds.includes(item.id)
      }))
    });
  },

  async saveVisibility() {
    const bank = this.selectedBank();
    if (!bank) {
      wx.showToast({ title: '请选择题库', icon: 'none' });
      return;
    }
    if (bank.status !== 'published') {
      wx.showToast({ title: '发布后再设置范围', icon: 'none' });
      return;
    }

    const mode = MODE_OPTIONS[this.data.selectedModeIndex].value;
    const classIds = this.data.classOptions.filter((item) => item.checked).map((item) => item.id);
    if (mode === 'classes' && !classIds.length) {
      wx.showToast({ title: '请选择分组', icon: 'none' });
      return;
    }

    await this.runBankAction({
      action: 'saveVisibility',
      payload: { bankId: bank.id, mode, classIds },
      loadingText: '正在保存...',
      successText: '可见范围已保存'
    });
  },

  manageQuestions(event) {
    const bank = this.bankFromEvent(event);
    if (!bank) return;
    wx.navigateTo({ url: `/pages/admin-questions/admin-questions?bankId=${bank.id}` });
  },

  async renameBank(event) {
    const bank = this.bankFromEvent(event);
    if (!bank) return;

    const result = await inputModal('重命名题库', bank.name);
    if (!result.confirm) return;
    const name = String(result.value || '').trim();
    if (!name) {
      wx.showToast({ title: '题库名称不能为空', icon: 'none' });
      return;
    }

    await this.runBankAction({
      action: 'renameBank',
      payload: { bankId: bank.id, name },
      loadingText: '正在重命名...',
      successText: '题库已重命名'
    });
  },

  async publishBank(event) {
    const bank = this.bankFromEvent(event);
    if (!bank) return;

    const ok = await confirmModal(
      bank.status === 'published'
        ? '重新统计题目数量并修复题库状态？'
        : '将该题库发布到可练习状态？'
    );
    if (!ok) return;

    await this.runBankAction({
      action: bank.status === 'published' ? 'refreshCount' : 'publishBank',
      payload: { bankId: bank.id },
      loadingText: '正在修复...',
      successText: bank.status === 'published' ? '统计已刷新' : '题库已发布'
    });
  },

  async deleteBank(event) {
    const bank = this.bankFromEvent(event);
    if (!bank) return;

    const ok = await confirmModal(`确定删除题库「${bank.name}」吗？题目会从列表隐藏。`);
    if (!ok) return;

    await this.runBankAction({
      action: 'deleteBank',
      payload: { bankId: bank.id },
      loadingText: '正在删除...',
      successText: '题库已删除'
    });
  },

  async runBankAction({ action, payload, loadingText, successText }) {
    this.setData({ saving: true });
    wx.showLoading({ title: loadingText || '处理中...' });
    try {
      await wx.cloud.callFunction({
        name: 'adminBankManage',
        data: { action, ...payload }
      });
      wx.showToast({ title: successText || '操作完成', icon: 'success' });
      await this.loadOverview();
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  },

  selectedBank() {
    return this.data.banks[this.data.selectedBankIndex] || null;
  },

  bankFromEvent(event) {
    const index = Number(event.currentTarget.dataset.index);
    return this.data.banks[index] || null;
  }
});

function formatBank(bank) {
  const status = bank.status || 'published';
  const totalQuestionCount = bank.totalQuestionCount || bank.questionCount || 0;
  const expectedQuestionCount = bank.expectedQuestionCount || totalQuestionCount || 0;
  const questionText = status === 'importing'
    ? `已导入 ${totalQuestionCount}/${expectedQuestionCount} 题`
    : `${bank.questionCount || 0} 道题`;

  return {
    ...bank,
    status,
    totalQuestionCount,
    expectedQuestionCount,
    label: status === 'importing' ? `${bank.name}（导入中）` : bank.name,
    metaText: `${bank.chapterCount || 0} 个章节 · ${questionText}`,
    statusText: status === 'importing'
      ? '导入中'
      : (bank.visibilityMode === 'all' ? '公开' : '定向')
  };
}

function buildClassOptions(classes, bank) {
  const selectedIds = bank && bank.classIds ? bank.classIds : [];
  return classes.map((item) => ({
    id: item.id,
    name: item.name,
    checked: selectedIds.includes(item.id)
  }));
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

function inputModal(title, value) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      editable: true,
      placeholderText: '请输入题库名称',
      content: value || '',
      success: (res) => resolve({ confirm: !!res.confirm, value: res.content }),
      fail: () => resolve({ confirm: false, value: '' })
    });
  });
}
