/**
 * 将设备本地时间格式化为 24 小时制 HH:MM:SS（各部分两位补零）。
 */
export function formatClock(date: Date): string {
  const parts = [date.getHours(), date.getMinutes(), date.getSeconds()];
  return parts.map((value) => String(value).padStart(2, '0')).join(':');
}

/**
 * 计算从当前时间戳到下一个秒边界的延时（毫秒）。
 * 恰好处于秒边界时返回 1000：本秒刚刚更新，下一次更新在完整一秒之后。
 */
export function delayToNextSecond(nowMs: number): number {
  const msIntoSecond = nowMs % 1000;
  return 1000 - msIntoSecond;
}
