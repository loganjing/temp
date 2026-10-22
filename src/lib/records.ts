import type { CompletedFocus } from './pomodoro';

/** 一条当日专注记录：一个完整番茄钟的可观察事实。 */
export interface FocusRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

/** 记录存储的最小接口，便于在无浏览器环境下测试。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORAGE_KEY_PREFIX = 'focus_records_';
export const HOUR_MS = 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;

/** 以本地自然日为准的存储键；跨过本地零点后自动面向新的一天。 */
export function storageKeyFor(dateKey: string): string {
  return `${STORAGE_KEY_PREFIX}${dateKey}`;
}

export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 本地自然日的零点时间戳。 */
export function dayStartOf(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 由 `YYYY-MM-DD` 还原该本地自然日的零点时间戳。 */
export function dayStartFromKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  return new Date(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0).getTime();
}

function isFocusRecord(value: unknown): value is FocusRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<FocusRecord>;
  return (
    typeof record.id === 'string' &&
    typeof record.startedAt === 'number' &&
    Number.isFinite(record.startedAt) &&
    typeof record.endedAt === 'number' &&
    Number.isFinite(record.endedAt) &&
    typeof record.durationMs === 'number' &&
    Number.isFinite(record.durationMs) &&
    record.endedAt >= record.startedAt
  );
}

/** 读取某日的记录；数据缺失或损坏时返回空列表，不抛出异常。 */
export function loadRecords(storage: StorageLike, dateKey: string): FocusRecord[] {
  let raw: string | null = null;
  try {
    raw = storage.getItem(storageKeyFor(dateKey));
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isFocusRecord).sort((a, b) => a.endedAt - b.endedAt);
}

export function saveRecords(storage: StorageLike, dateKey: string, records: FocusRecord[]): void {
  try {
    storage.setItem(storageKeyFor(dateKey), JSON.stringify(records));
  } catch {
    // 存储不可用（隐私模式、配额超限）时保持页面可用，只是当次记录不落盘。
  }
}

export function appendRecord(
  storage: StorageLike,
  dateKey: string,
  record: FocusRecord,
): FocusRecord[] {
  const next = [...loadRecords(storage, dateKey), record].sort((a, b) => a.endedAt - b.endedAt);
  saveRecords(storage, dateKey, next);
  return next;
}

export function createFocusRecord(completed: CompletedFocus, now: number): FocusRecord {
  return {
    id: `${completed.endedAt}-${Math.round(now % 100000)}-${Math.round(completed.durationMs)}`,
    startedAt: completed.startedAt,
    endedAt: completed.endedAt,
    durationMs: completed.durationMs,
  };
}

export function totalFocusMs(records: FocusRecord[]): number {
  return records.reduce((sum, record) => sum + Math.max(0, record.durationMs), 0);
}

/** 内存存储，用于 localStorage 不可用时的降级，以及单元测试。 */
export function createMemoryStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

export function resolveStorage(): StorageLike {
  try {
    const storage = typeof window === 'undefined' ? null : window.localStorage;
    if (!storage) return createMemoryStorage();
    const probe = '__focus_timeline_probe__';
    storage.setItem(probe, '1');
    storage.getItem(probe);
    return storage;
  } catch {
    return createMemoryStorage();
  }
}