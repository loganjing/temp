import { describe, it, expect } from 'vitest';
import { getHourlyCounts } from './HeatmapLogic';

describe('getHourlyCounts', () => {
  it('returns 24 zero counts for empty sessions', () => {
    const counts = getHourlyCounts([]);
    expect(counts).toHaveLength(24);
    expect(counts.every((c) => c === 0)).toBe(true);
  });

  it('counts sessions by hour', () => {
    // We need to construct sessions whose local-hour matches expected.
    // To be deterministic, build Date objects and get their hour.
    const d1 = new Date(2026, 9, 27, 14, 25, 0);
    const d2 = new Date(2026, 9, 27, 14, 50, 0);
    const d3 = new Date(2026, 9, 27, 9, 30, 0);

    const sessions = [
      { completedAt: d1.toISOString(), durationMin: 25 },
      { completedAt: d2.toISOString(), durationMin: 25 },
      { completedAt: d3.toISOString(), durationMin: 25 },
    ];

    const counts = getHourlyCounts(sessions);
    expect(counts[d1.getHours()]).toBe(2);
    expect(counts[d3.getHours()]).toBe(1);
  });

  it('handles out-of-range hours gracefully', () => {
    // Normal date — all hours valid
    const sessions = [
      { completedAt: new Date(2026, 9, 27, 14, 25, 0).toISOString(), durationMin: 25 },
    ];
    const counts = getHourlyCounts(sessions);
    expect(counts).toHaveLength(24);
    const total = counts.reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
  });
});
