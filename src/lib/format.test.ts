import { describe, expect, it } from 'vitest';
import { formatClock, formatDateLabel, formatDuration, formatTimeOfDay } from './format';

const MINUTE = 60 * 1000;

describe('倒计时显示', () => {
  it('不足一小时显示 mm:ss', () => {
    expect(formatClock(25 * MINUTE)).toBe('25:00');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(59 * MINUTE + 59 * 1000)).toBe('59:59');
  });

  it('剩余时间向上取整，不会提前显示 00:00', () => {
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(999)).toBe('00:01');
    expect(formatClock(1000)).toBe('00:01');
    expect(formatClock(1001)).toBe('00:02');
  });

  it('超过一小时显示 h:mm:ss', () => {
    expect(formatClock(60 * MINUTE)).toBe('1:00:00');
  });

  it('负数或非法值按 0 处理', () => {
    expect(formatClock(-5)).toBe('00:00');
    expect(formatClock(Number.NaN)).toBe('00:00');
  });
});

describe('时长显示', () => {
  it('按分钟与小时组合显示', () => {
    expect(formatDuration(0)).toBe('0 分钟');
    expect(formatDuration(25 * MINUTE)).toBe('25 分钟');
    expect(formatDuration(85 * MINUTE)).toBe('1 小时 25 分');
    expect(formatDuration(120 * MINUTE)).toBe('2 小时');
    expect(formatDuration(25 * MINUTE + 59 * 1000)).toBe('25 分钟');
  });
});

describe('时刻与日期显示', () => {
  it('时刻使用本地 HH:mm', () => {
    expect(formatTimeOfDay(new Date(2026, 9, 22, 9, 5).getTime())).toBe('09:05');
    expect(formatTimeOfDay(new Date(2026, 9, 22, 23, 59).getTime())).toBe('23:59');
  });

  it('日期标题包含本地日期与星期', () => {
    expect(formatDateLabel(new Date(2026, 9, 22, 12, 0).getTime())).toBe('2026年10月22日 周四');
    expect(formatDateLabel(new Date(2026, 0, 4, 12, 0).getTime())).toBe('2026年1月4日 周日');
  });
});