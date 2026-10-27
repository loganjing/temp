import { describe, it, expect, beforeEach } from 'vitest';
import {
  FOCUS_DURATION_SEC,
  REST_DURATION_SEC,
  FOCUS_DURATION_MIN,
  todayKey,
  loadSessions,
  saveSessions,
  formatTime,
  formatDuration,
  hourOf,
} from './types';

describe('constants', () => {
  it('focus duration is 25 minutes', () => {
    expect(FOCUS_DURATION_SEC).toBe(25 * 60);
    expect(FOCUS_DURATION_MIN).toBe(25);
  });

  it('rest duration is 5 minutes', () => {
    expect(REST_DURATION_SEC).toBe(5 * 60);
  });
});

describe('todayKey', () => {
  it('formats key as timeling:YYYY-MM-DD', () => {
    const date = new Date(2026, 9, 27); // Oct 27 2026
    expect(todayKey(date)).toBe('timeling:2026-10-27');
  });

  it('pads single-digit months and days', () => {
    const date = new Date(2026, 0, 5); // Jan 5 2026
    expect(todayKey(date)).toBe('timeling:2026-01-05');
  });
});

describe('loadSessions / saveSessions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when key does not exist', () => {
    expect(loadSessions('timeling:2026-10-27')).toEqual([]);
  });

  it('round-trips session records', () => {
    const sessions = [
      { completedAt: '2026-10-27T14:25:00.000Z', durationMin: 25 },
      { completedAt: '2026-10-27T15:10:00.000Z', durationMin: 25 },
    ];
    saveSessions('timeling:2026-10-27', sessions);
    expect(loadSessions('timeling:2026-10-27')).toEqual(sessions);
  });

  it('filters out malformed entries', () => {
    const malformed: unknown[] = [
      { completedAt: '2026-10-27T14:25:00.000Z', durationMin: 25 },
      { completedAt: 'bad' },
      { durationMin: 25 },
      null,
    ];
    saveSessions('timeling:2026-10-27', malformed as Parameters<typeof saveSessions>[1]);
    const loaded = loadSessions('timeling:2026-10-27');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].completedAt).toBe('2026-10-27T14:25:00.000Z');
  });

  it('returns empty array for invalid JSON', () => {
    localStorage.setItem('timeling:2026-10-27', '{bad json');
    expect(loadSessions('timeling:2026-10-27')).toEqual([]);
  });
});

describe('formatTime', () => {
  it('formats seconds as MM:SS', () => {
    expect(formatTime(25 * 60)).toBe('25:00');
    expect(formatTime(5 * 60)).toBe('05:00');
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(90)).toBe('01:30');
  });
});

describe('formatDuration', () => {
  it('formats 0 minutes', () => {
    expect(formatDuration(0)).toBe('0分钟');
  });

  it('formats minutes only', () => {
    expect(formatDuration(25)).toBe('25分钟');
    expect(formatDuration(5)).toBe('5分钟');
  });

  it('formats hours only', () => {
    expect(formatDuration(60)).toBe('1小时');
    expect(formatDuration(120)).toBe('2小时');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(75)).toBe('1小时15分钟');
    expect(formatDuration(110)).toBe('1小时50分钟');
  });
});

describe('hourOf', () => {
  it('extracts hour from ISO timestamp', () => {
    // Use a known UTC time and check local hour extraction
    const ts = '2026-10-27T14:25:00.000Z';
    const hour = hourOf(ts);
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  });
});
