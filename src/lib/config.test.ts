import { describe, expect, it } from 'vitest';
import { isDefaultDurations, readDurations } from './config';
import { BREAK_DURATION_MS, FOCUS_DURATION_MS } from './pomodoro';

describe('番茄钟时长配置', () => {
  it('默认始终使用 25 分钟专注与 5 分钟休息', () => {
    const durations = readDurations('');
    expect(durations.focusMs).toBe(FOCUS_DURATION_MS);
    expect(durations.breakMs).toBe(BREAK_DURATION_MS);
    expect(isDefaultDurations(durations)).toBe(true);
  });

  it('仅在显式提供验证参数时缩短时长', () => {
    const durations = readDurations('?focusSeconds=3&breakSeconds=2');
    expect(durations.focusMs).toBe(3000);
    expect(durations.breakMs).toBe(2000);
    expect(isDefaultDurations(durations)).toBe(false);
  });

  it('非法或非正数参数回退到默认时长', () => {
    expect(readDurations('?focusSeconds=abc').focusMs).toBe(FOCUS_DURATION_MS);
    expect(readDurations('?focusSeconds=0').focusMs).toBe(FOCUS_DURATION_MS);
    expect(readDurations('?focusSeconds=-5').focusMs).toBe(FOCUS_DURATION_MS);
    expect(readDurations('?breakSeconds=').breakMs).toBe(BREAK_DURATION_MS);
  });
});