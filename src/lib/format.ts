const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 倒计时显示：不足 1 小时为 mm:ss，否则为 h:mm:ss；向上取整，归零显示 00:00。 */
export function formatClock(ms: number): string {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const totalSeconds = Math.ceil(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 时长的人类可读表达，例如 `1 小时 25 分`、`25 分钟`、`0 分钟`。 */
export function formatDuration(ms: number): string {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const totalMinutes = Math.floor(safe / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours} 小时 ${minutes} 分`;
  if (hours > 0) return `${hours} 小时`;
  return `${minutes} 分钟`;
}

/** 时刻显示，本地时间 HH:mm。 */
export function formatTimeOfDay(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 日期标题，例如 `2026年10月22日 周四`。 */
export function formatDateLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_LABELS[d.getDay()]}`;
}