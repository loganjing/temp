import { describe, it, expect } from 'vitest';
import { formatDateForTaskNo, formatTaskNo, buildTaskNo, generateTaskNo, } from '../taskNo.js';
import { createTestDb, insertPlot, insertTask } from './helpers.js';
describe('formatDateForTaskNo', () => {
    it('格式化日期为 YYYYMMDD', () => {
        const date = new Date('2026-10-23T00:00:00.000Z');
        // 使用本地时区构建以保持一致性
        const d = new Date(2026, 9, 23); // 月份从 0 开始
        expect(formatDateForTaskNo(d)).toBe('20261023');
    });
    it('个位数月和日补零', () => {
        const d = new Date(2026, 0, 5);
        expect(formatDateForTaskNo(d)).toBe('20260105');
    });
});
describe('formatTaskNo', () => {
    it('序号补零为 3 位', () => {
        expect(formatTaskNo('20261023', 1)).toBe('PT-20261023-001');
        expect(formatTaskNo('20261023', 12)).toBe('PT-20261023-012');
        expect(formatTaskNo('20261023', 999)).toBe('PT-20261023-999');
        expect(formatTaskNo('20260105', 3)).toBe('PT-20260105-003');
    });
});
describe('buildTaskNo', () => {
    it('序号 = 已有任务数 + 1', () => {
        const date = new Date(2026, 9, 23);
        expect(buildTaskNo(date, 0)).toBe('PT-20261023-001');
        expect(buildTaskNo(date, 2)).toBe('PT-20261023-003');
        expect(buildTaskNo(date, 99)).toBe('PT-20261023-100');
    });
});
describe('generateTaskNo', () => {
    it('无已有任务时序号为 001', () => {
        const db = createTestDb();
        const date = new Date(2026, 9, 23);
        expect(generateTaskNo(db, date)).toBe('PT-20261023-001');
    });
    it('已有任务时序号递增', () => {
        const db = createTestDb();
        const plotId = insertPlot(db);
        const date = new Date(2026, 9, 23);
        insertTask(db, plotId, { task_no: 'PT-20261023-001' });
        insertTask(db, plotId, { task_no: 'PT-20261023-002' });
        expect(generateTaskNo(db, date)).toBe('PT-20261023-003');
    });
    it('不同日期的任务不影响当日序号', () => {
        const db = createTestDb();
        const plotId = insertPlot(db);
        const date = new Date(2026, 9, 24);
        insertTask(db, plotId, { task_no: 'PT-20261023-001' });
        insertTask(db, plotId, { task_no: 'PT-20261023-002' });
        expect(generateTaskNo(db, date)).toBe('PT-20261024-001');
    });
});
