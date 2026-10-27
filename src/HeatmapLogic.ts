import { type SessionRecord, hourOf } from './types';

export const HOURS = 24;

export function getHourlyCounts(sessions: SessionRecord[]): number[] {
  const counts = new Array(HOURS).fill(0);
  for (const s of sessions) {
    const h = hourOf(s.completedAt);
    if (h >= 0 && h < HOURS) {
      counts[h]++;
    }
  }
  return counts;
}

export function getIntensity(count: number, max: number): number {
  if (max === 0 || count === 0) return 0;
  return Math.ceil((count / max) * 4); // 0-4
}

export const intensityColors = [
  '#f3f4f6', // 0: empty
  '#fed7aa', // 1: light
  '#fdba74', // 2: medium
  '#fb923c', // 3: medium-high
  '#ea580c', // 4: high
];
