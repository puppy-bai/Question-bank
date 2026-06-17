function call(name, data = {}) {
  if (!wx.cloud) {
    return Promise.reject(new Error('当前基础库不支持云开发'));
  }

  return wx.cloud.callFunction({ name, data }).then((res) => res.result);
}

module.exports = {
  call
};
