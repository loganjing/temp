import { describe, it, expect } from 'vitest';
import {
  isHarvestable,
  HARVESTABLE_LEVELS,
  getLatestMaturityLevel,
} from '../maturity.js';
import type { MaturityLevel } from '../../../shared/types.js';
import { createTestDb, insertPlot, insertAssessment } from './helpers.js';

describe('isHarvestable', () => {
  it('接近成熟 → true', () => {
    expect(isHarvestable('接近成熟')).toBe(true);
  });

  it('成熟 → true', () => {
    expect(isHarvestable('成熟')).toBe(true);
  });

  it('过熟 → true', () => {
    expect(isHarvestable('过熟')).toBe(true);
  });

  it('未成熟 → false', () => {
    expect(isHarvestable('未成熟')).toBe(false);
  });

  it('null（无评估记录）→ false', () => {
    expect(isHarvestable(null)).toBe(false);
  });

  it('HARVESTABLE_LEVELS 包含接近成熟、成熟、过熟', () => {
    expect(HARVESTABLE_LEVELS.has('接近成熟')).toBe(true);
    expect(HARVESTABLE_LEVELS.has('成熟')).toBe(true);
    expect(HARVESTABLE_LEVELS.has('过熟')).toBe(true);
    expect(HARVESTABLE_LEVELS.has('未成熟')).toBe(false);
  });
});

describe('getLatestMaturityLevel', () => {
  it('无评估记录时返回 null', () => {
    const db = createTestDb();
    const plotId = insertPlot(db);
    expect(getLatestMaturityLevel(db, plotId)).toBe(null);
  });

  it('单条评估记录返回该等级', () => {
    const db = createTestDb();
    const plotId = insertPlot(db);
    insertAssessment(db, plotId, { maturity_level: '成熟' });
    expect(getLatestMaturityLevel(db, plotId)).toBe('成熟');
  });

  it('多条评估记录返回最新一条（按 assessment_time 降序）', () => {
    const db = createTestDb();
    const plotId = insertPlot(db);
    insertAssessment(db, plotId, {
      maturity_level: '未成熟',
      assessment_time: '2026-10-20T10:00:00.000Z',
    });
    insertAssessment(db, plotId, {
      maturity_level: '成熟',
      assessment_time: '2026-10-23T10:00:00.000Z',
    });
    insertAssessment(db, plotId, {
      maturity_level: '接近成熟',
      assessment_time: '2026-10-22T10:00:00.000Z',
    });
    const latest = getLatestMaturityLevel(db, plotId);
    expect(latest).toBe('成熟');
  });

  it('assessment_time 相同时按 created_at 降序', () => {
    const db = createTestDb();
    const plotId = insertPlot(db);
    insertAssessment(db, plotId, {
      maturity_level: '接近成熟',
      assessment_time: '2026-10-23T10:00:00.000Z',
      created_at: '2026-10-23T09:00:00.000Z',
    });
    insertAssessment(db, plotId, {
      maturity_level: '过熟',
      assessment_time: '2026-10-23T10:00:00.000Z',
      created_at: '2026-10-23T11:00:00.000Z',
    });
    const latest = getLatestMaturityLevel(db, plotId);
    expect(latest).toBe('过熟');
  });
});
