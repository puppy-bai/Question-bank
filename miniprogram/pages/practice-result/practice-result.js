Page({
  data: {
    bankId: '',
    bankName: '',
    total: 0,
    correctCount: 0,
    wrongCount: 0,
    unansweredCount: 0,
    correctRate: 0,
    durationText: '0 秒',
    sessionMode: 'practice',
    chapterIds: '',
    chapterName: '',
    questionLimit: 0,
    random: false,
    questionType: '',
    resultTitle: '练习完成'
  },

  onLoad(options) {
    const total = Number(options.total) || 0;
    const correctCount = Number(options.correctCount) || 0;
    const wrongCount = Number(options.wrongCount) || 0;
    const duration = Number(options.duration) || 0;
    const unansweredCount = Math.max(0, total - correctCount - wrongCount);
    const sessionMode = normalizeSessionMode(options.sessionMode);
    const chapterIds = options.chapterIds || '';
    const chapterName = decodeURIComponent(options.chapterName || '');
    const questionLimit = Number(options.questionLimit) || 0;
    const random = options.random === '1';
    const questionType = options.questionType || '';

    this.setData({
      bankId: options.bankId || '',
      bankName: decodeURIComponent(options.bankName || '练习结果'),
      total,
      correctCount,
      wrongCount,
      unansweredCount,
      correctRate: total ? Math.round((correctCount / total) * 100) : 0,
      durationText: formatDuration(duration),
      sessionMode,
      chapterIds,
      chapterName,
      questionLimit,
      random,
      questionType,
      resultTitle: getResultTitle(sessionMode, chapterName, { random, questionType })
    });
  },

  retry() {
    if (!this.data.bankId) return;
    const params = [
      `bankId=${this.data.bankId}`,
      'restart=1',
      `sessionMode=${this.data.sessionMode}`
    ];
    if (this.data.sessionMode !== 'practice') {
      params.push(`sessionSeed=${Date.now()}`);
      params.push(`questionLimit=${this.data.questionLimit || (this.data.sessionMode === 'test' ? 30 : 100)}`);
    }
    if (this.data.random) {
      params.push('random=1');
      params.push(`sessionSeed=${Date.now()}`);
    }
    if (this.data.questionType) {
      params.push(`questionType=${this.data.questionType}`);
    }
    if (this.data.chapterIds) {
      params.push(`chapterIds=${encodeURIComponent(this.data.chapterIds)}`);
    }
    if (this.data.chapterName) {
      params.push(`chapterName=${encodeURIComponent(this.data.chapterName)}`);
    }
    wx.redirectTo({ url: `/pages/practice/practice?${params.join('&')}` });
  },

  goWrong() {
    wx.navigateTo({ url: '/pages/wrong/wrong' });
  },

  goBanks() {
    wx.switchTab({ url: '/pages/banks/banks' });
  }
});

function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  if (!min) return `${sec} 秒`;
  return `${min} 分 ${sec} 秒`;
}

function normalizeSessionMode(mode) {
  return ['practice', 'test', 'exam'].includes(mode) ? mode : 'practice';
}

function getResultTitle(mode, chapterName, options = {}) {
  if (options.random) {
    return chapterName ? `随机练习完成 · ${chapterName}` : '随机练习完成';
  }
  if (options.questionType) {
    const typeLabel = {
      single: '单选专项完成',
      multiple: '多选专项完成',
      judge: '判断专项完成',
      blank: '填空专项完成',
      short: '简答专项完成'
    }[options.questionType] || '专项练习完成';
    return chapterName ? `${typeLabel} · ${chapterName}` : typeLabel;
  }
  const title = {
    practice: '练习完成',
    test: '测试完成',
    exam: '考试完成'
  }[mode] || '练习完成';
  return chapterName ? `${title} · ${chapterName}` : title;
}
