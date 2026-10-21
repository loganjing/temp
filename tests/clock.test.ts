import { describe, expect, it } from 'vitest';
import { delayToNextSecond, formatClock } from '../src/lib/clock';

describe('formatClock', () => {
  it('时、分、秒各部分两位补零（09:05:03）', () => {
    expect(formatClock(new Date(2026, 0, 1, 9, 5, 3, 128))).toBe('09:05:03');
  });

  it('一天起点显示 00:00:00', () => {
    expect(formatClock(new Date(2026, 0, 1, 0, 0, 0, 0))).toBe('00:00:00');
  });

  it('一天终点显示 23:59:59（24 小时制，不回绕）', () => {
    expect(formatClock(new Date(2026, 0, 1, 23, 59, 59, 999))).toBe('23:59:59');
  });

  it('正午显示 12:00:00（24 小时制，无上午/下午后缀）', () => {
    expect(formatClock(new Date(2026, 0, 1, 12, 0, 0, 0))).toBe('12:00:00');
  });

  it('输出始终匹配 HH:MM:SS 结构', () => {
    expect(formatClock(new Date(2026, 0, 1, 18, 44, 7, 1))).toMatch(
      /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/,
    );
  });
});

describe('delayToNextSecond', () => {
  const base = new Date(2026, 0, 1, 10, 15, 31, 0).getTime();

  it('秒内 250ms 时，距下一秒边界 750ms', () => {
    expect(delayToNextSecond(base + 250)).toBe(750);
  });

  it('秒内 999ms 时，距下一秒边界 1ms', () => {
    expect(delayToNextSecond(base + 999)).toBe(1);
  });

  it('恰在秒边界时返回 1000ms（本秒已更新，下一次在完整一秒后）', () => {
    expect(delayToNextSecond(base)).toBe(1000);
  });
});
