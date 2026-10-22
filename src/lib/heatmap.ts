import { HOUR_MS, MINUTE_MS, type FocusRecord } from './records';

export const HOURS_PER_DAY = 24;

export interface HeatmapBucket {
  /** 0–23，表示当日第几个小时时段。 */
  hour: number;
  /** 该时段内已完成的专注时长（分钟，可能为小数）。 */
  minutes: number;
  /** 落入该时段的专注时段数量。 */
  sessions: number;
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export const HEATMAP_LEGEND: ReadonlyArray<{ level: HeatLevel; label: string }> = [
  { level: 0, label: '无专注记录' },
  { level: 1, label: '少于 10 分钟' },
  { level: 2, label: '10–25 分钟' },
  { level: 3, label: '25–45 分钟' },
  { level: 4, label: '45 分钟以上' },
];

export function heatLevel(minutes: number): HeatLevel {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  if (minutes < 10) return 1;
  if (minutes < 25) return 2;
  if (minutes < 45) return 3;
  return 4;
}

/**
 * 将当日已完成的专注时段按小时切分到全天 24 个时段。
 * 跨小时的专注时段按时间重叠比例分摊到对应时段；超出当日范围的部分不计入当日热力图。
 */
export function buildHeatmap(records: FocusRecord[], dayStart: number): HeatmapBucket[] {
  const buckets: HeatmapBucket[] = Array.from({ length: HOURS_PER_DAY }, (_, hour) => ({
    hour,
    minutes: 0,
    sessions: 0,
  }));
  const dayEnd = dayStart + HOURS_PER_DAY * HOUR_MS;

  for (const record of records) {
    const start = Math.max(record.startedAt, dayStart);
    const end = Math.min(record.endedAt, dayEnd);
    if (end <= start) continue;

    const firstHour = Math.max(0, Math.floor((start - dayStart) / HOUR_MS));
    const lastHour = Math.min(HOURS_PER_DAY - 1, Math.floor((end - 1 - dayStart) / HOUR_MS));

    for (let hour = firstHour; hour <= lastHour; hour += 1) {
      const hourStart = dayStart + hour * HOUR_MS;
      const overlap = Math.min(end, hourStart + HOUR_MS) - Math.max(start, hourStart);
      if (overlap > 0) {
        buckets[hour].minutes += overlap / MINUTE_MS;
        buckets[hour].sessions += 1;
      }
    }
  }

  return buckets;
}

export function isEmptyHeatmap(buckets: HeatmapBucket[]): boolean {
  return buckets.every((bucket) => bucket.minutes <= 0);
}

export function formatBucketMinutes(minutes: number): string {
  if (minutes <= 0) return '0 分钟';
  return `${Math.round(minutes)} 分钟`;
}

export function formatHourRange(hour: number): string {
  const from = String(hour).padStart(2, '0');
  const to = String((hour + 1) % HOURS_PER_DAY).padStart(2, '0');
  return `${from}:00–${to}:00`;
}