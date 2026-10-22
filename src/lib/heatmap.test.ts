import { describe, expect, it } from 'vitest';
import {
  HOURS_PER_DAY,
  buildHeatmap,
  formatBucketMinutes,
  formatHourRange,
  heatLevel,
  isEmptyHeatmap,
} from './heatmap';
import { HOUR_MS, MINUTE_MS, dayStartFromKey, type FocusRecord } from './records';

const DAY_KEY = '2026-10-22';
const DAY_START = dayStartFromKey(DAY_KEY);

function record(startedAt: number, endedAt: number): FocusRecord {
  return { id: `${startedAt}`, startedAt, endedAt, durationMs: endedAt - startedAt };
}

function at(hour: number, minute = 0): number {
  return DAY_START + hour * HOUR_MS + minute * MINUTE_MS;
}

describe('当日各时段热力图', () => {
  it('无记录时 24 个时段全为零并识别为空状态', () => {
    const buckets = buildHeatmap([], DAY_START);
    expect(buckets).toHaveLength(HOURS_PER_DAY);
    expect(buckets.every((bucket) => bucket.minutes === 0)).toBe(true);
    expect(isEmptyHeatmap(buckets)).toBe(true);
  });

  it('一个完整的 25 分钟专注落入其所在时段', () => {
    const buckets = buildHeatmap([record(at(10, 5), at(10, 30))], DAY_START);
    expect(buckets[10].minutes).toBeCloseTo(25, 5);
    expect(buckets[10].sessions).toBe(1);
    expect(buckets[9].minutes).toBe(0);
    expect(buckets[11].minutes).toBe(0);
    expect(isEmptyHeatmap(buckets)).toBe(false);
  });

  it('跨小时的专注时段按重叠时长分摊到相邻时段', () => {
    const buckets = buildHeatmap([record(at(10, 50), at(11, 15))], DAY_START);
    expect(buckets[10].minutes).toBeCloseTo(10, 5);
    expect(buckets[11].minutes).toBeCloseTo(15, 5);
    const total = buckets.reduce((sum, bucket) => sum + bucket.minutes, 0);
    expect(total).toBeCloseTo(25, 5);
  });

  it('跨本地零点的专注时段只统计当日部分', () => {
    const buckets = buildHeatmap([record(DAY_START - 10 * MINUTE_MS, DAY_START + 15 * MINUTE_MS)], DAY_START);
    expect(buckets[0].minutes).toBeCloseTo(15, 5);
    expect(buckets[23].minutes).toBe(0);
  });

  it('多条记录在同一时段累加', () => {
    const buckets = buildHeatmap([record(at(9, 0), at(9, 25)), record(at(9, 30), at(9, 55))], DAY_START);
    expect(buckets[9].minutes).toBeCloseTo(50, 5);
    expect(buckets[9].sessions).toBe(2);
  });

  it('末尾时段跨小时切分不越界', () => {
    const buckets = buildHeatmap([record(at(23, 40), DAY_START + 24 * HOUR_MS)], DAY_START);
    expect(buckets[23].minutes).toBeCloseTo(20, 5);
    expect(buckets).toHaveLength(HOURS_PER_DAY);
  });
});

describe('热力图颜色分级与文案', () => {
  it('按专注时长给出 5 个颜色级别', () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(Number.NaN)).toBe(0);
    expect(heatLevel(1)).toBe(1);
    expect(heatLevel(9.9)).toBe(1);
    expect(heatLevel(10)).toBe(2);
    expect(heatLevel(24.9)).toBe(2);
    expect(heatLevel(25)).toBe(3);
    expect(heatLevel(44.9)).toBe(3);
    expect(heatLevel(45)).toBe(4);
  });

  it('时段范围与时长文案可读', () => {
    expect(formatHourRange(0)).toBe('00:00–01:00');
    expect(formatHourRange(23)).toBe('23:00–00:00');
    expect(formatBucketMinutes(0)).toBe('0 分钟');
    expect(formatBucketMinutes(25.4)).toBe('25 分钟');
  });
});