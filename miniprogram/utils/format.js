function percent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0%';
  return `${Math.round(value * 100)}%`;
}

function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  if (!min) return `${sec} 秒`;
  return `${min} 分 ${sec} 秒`;
}

module.exports = {
  percent,
  formatDuration
};
