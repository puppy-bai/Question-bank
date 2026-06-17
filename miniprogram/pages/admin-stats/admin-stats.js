Page({
  data: {
    loading: false,
    summary: {
      bankCount: 0,
      questionCount: 0,
      attemptCount: 0,
      correctRate: 0,
      activeUserCount: 0,
      activeBankCount: 0,
      wrongCount: 0,
      favoriteCount: 0,
      sessionCount: 0
    },
    bankStats: [],
    typeStats: [],
    topWrongQuestions: [],
    recentAttempts: []
  },

  onShow() {
    this.loadStats();
  },

  async loadStats() {
    if (!wx.cloud) {
      wx.showToast({ title: '当前基础库不支持云开发', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const result = await wx.cloud.callFunction({
        name: 'adminBankManage',
        data: { action: 'statsOverview' }
      });
      const payload = result.result || {};
      this.setData({
        summary: payload.summary || this.data.summary,
        bankStats: (payload.bankStats || []).map(formatBankStat),
        typeStats: payload.typeStats || [],
        topWrongQuestions: (payload.topWrongQuestions || []).map(formatWrongQuestion),
        recentAttempts: (payload.recentAttempts || []).map(formatAttempt)
      });
    } catch (error) {
      console.error(error);
      wx.showToast({ title: error.message || '统计数据加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  refresh() {
    this.loadStats();
  }
});

function formatBankStat(item) {
  return {
    ...item,
    metaText: `${item.attemptCount || 0} 次作答 · ${item.userCount || 0} 个用户 · 正确率 ${item.correctRate || 0}%`
  };
}

function formatWrongQuestion(item) {
  return {
    ...item,
    shortStem: ellipsis(item.stem || '题干缺失', 52),
    metaText: `${item.bankName || '未知题库'} · ${item.userCount || 0} 个用户出错`
  };
}

function formatAttempt(item) {
  return {
    ...item,
    resultText: item.correct ? '正确' : '错误',
    resultClass: item.correct ? 'ok' : 'bad',
    shortOpenid: shortOpenid(item.openid),
    createdText: formatDate(item.createdAt),
    durationText: `${item.duration || 0} 秒`
  };
}

function shortOpenid(openid) {
  if (!openid || openid.length <= 12) return openid || '';
  return `${openid.slice(0, 6)}...${openid.slice(-4)}`;
}

function ellipsis(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';
  return `${text.slice(0, maxLength)}...`;
}

function formatDate(value) {
  if (!value) return '暂无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无记录';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
