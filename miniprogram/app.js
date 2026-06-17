const { envId } = require('./config/env');

App({
  globalData: {
    user: null,
    envId
  },

  onLaunch() {
    if (wx.cloud) {
      try {
        wx.cloud.init({
          env: envId || undefined,
          traceUser: false
        });
      } catch (error) {
        console.warn('cloud init failed', error);
      }
    }

    this.bootstrap();
  },

  async bootstrap() {
    if (!wx.cloud) return;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const result = await wx.cloud.callFunction({ name: 'login' });
        this.globalData.user = result.result && result.result.user;
        return;
      } catch (error) {
        console.warn(`login failed, attempt ${attempt}`, error);
        if (attempt === 3 || !isNetworkError(error)) return;
        await wait(1200 * attempt);
      }
    }
  }
});

function isNetworkError(error) {
  const message = (error && (error.errMsg || error.message)) || '';
  return /Failed to fetch|timeout|ECONNRESET/i.test(message);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
