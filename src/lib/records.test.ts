import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY_PREFIX,
  appendRecord,
  createFocusRecord,
  createMemoryStorage,
  dayStartFromKey,
  dayStartOf,
  loadRecords,
  localDateKey,
  saveRecords,
  storageKeyFor,
  totalFocusMs,
  type FocusRecord,
} from './records';

const MINUTE = 60 * 1000;
const FOCUS_MS = 25 * MINUTE;

function makeRecord(startedAt: number, endedAt: number, durationMs = FOCUS_MS): FocusRecord {
  return { id: `${endedAt}`, startedAt, endedAt, durationMs };
}

describe('当日记录的本地日期与存储键', () => {
  it('按本地自然日生成日期键，跨过本地零点后指向新的一天', () => {
    const morning = new Date(2026, 9, 22, 9, 5).getTime();
    const midnight = new Date(2026, 9, 22, 23, 59, 59).getTime();
    const nextDay = new Date(2026, 9, 23, 0, 0, 1).getTime();

    expect(localDateKey(morning)).toBe('2026-10-22');
    expect(localDateKey(midnight)).toBe('2026-10-22');
    expect(localDateKey(nextDay)).toBe('2026-10-23');
  });

  it('存储键以 focus_records_ 前缀按日期区分', () => {
    expect(storageKeyFor('2026-10-22')).toBe(`${STORAGE_KEY_PREFIX}2026-10-22`);
  });

  it('零点时间戳与日期键可互相还原', () => {
    const start = new Date(2026, 9, 22, 15, 30).getTime();
    expect(dayStartOf(start)).toBe(new Date(2026, 9, 22, 0, 0, 0, 0).getTime());
    expect(dayStartFromKey('2026-10-22')).toBe(dayStartOf(start));
  });
});

describe('当日记录的读写', () => {
  it('追加后可按时间顺序读回，累计时长为各记录之和', () => {
    const storage = createMemoryStorage();
    const first = makeRecord(new Date(2026, 9, 22, 14, 0).getTime(), new Date(2026, 9, 22, 14, 25).getTime());
    const second = makeRecord(
      new Date(2026, 9, 22, 9, 0).getTime(),
      new Date(2026, 9, 22, 9, 25).getTime(),
    );

    appendRecord(storage, '2026-10-22', first);
    const records = appendRecord(storage, '2026-10-22', second);

    expect(records.map((record) => record.id)).toEqual([second.id, first.id]);
    expect(loadRecords(storage, '2026-10-22')).toHaveLength(2);
    expect(totalFocusMs(records)).toBe(2 * FOCUS_MS);
  });

  it('不同日期的记录互不影响', () => {
    const storage = createMemoryStorage();
    appendRecord(storage, '2026-10-22', makeRecord(1_000, 1_000 + FOCUS_MS));
    appendRecord(storage, '2026-10-23', makeRecord(2_000, 2_000 + FOCUS_MS));

    expect(loadRecords(storage, '2026-10-22')).toHaveLength(1);
    expect(loadRecords(storage, '2026-10-23')).toHaveLength(1);
    expect(loadRecords(storage, '2026-10-24')).toHaveLength(0);
  });

  it('数据缺失、损坏或结构非法时返回空列表而不抛错', () => {
    const storage = createMemoryStorage();
    expect(loadRecords(storage, '2026-10-22')).toEqual([]);

    storage.setItem(storageKeyFor('2026-10-22'), '{not json');
    expect(loadRecords(storage, '2026-10-22')).toEqual([]);

    storage.setItem(storageKeyFor('2026-10-22'), JSON.stringify({ a: 1 }));
    expect(loadRecords(storage, '2026-10-22')).toEqual([]);

    storage.setItem(
      storageKeyFor('2026-10-22'),
      JSON.stringify([{ id: 'x' }, makeRecord(1_000, 1_000 + FOCUS_MS)]),
    );
    expect(loadRecords(storage, '2026-10-22')).toHaveLength(1);
  });

  it('存储写入失败时不抛出异常', () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() => saveRecords(failing, '2026-10-22', [])).not.toThrow();
    expect(appendRecord(failing, '2026-10-22', makeRecord(1_000, 1_000 + FOCUS_MS))).toHaveLength(1);
  });
});

describe('由完成事件生成记录', () => {
  it('保留开始时间、结束时间与时长', () => {
    const completed = { startedAt: 1_700_000_000_000, endedAt: 1_700_000_000_000 + FOCUS_MS, durationMs: FOCUS_MS };
    const record = createFocusRecord(completed, completed.endedAt);

    expect(record.startedAt).toBe(completed.startedAt);
    expect(record.endedAt).toBe(completed.endedAt);
    expect(record.durationMs).toBe(FOCUS_MS);
    expect(record.id.length).toBeGreaterThan(0);
  });

  it('同一时刻产生两条记录时 id 不同', () => {
    const completed = { startedAt: 1_700_000_000_000, endedAt: 1_700_000_000_000 + FOCUS_MS, durationMs: FOCUS_MS };
    const a = createFocusRecord(completed, completed.endedAt + 1);
    const b = createFocusRecord(completed, completed.endedAt + 2);
    expect(a.id).not.toBe(b.id);
  });
});