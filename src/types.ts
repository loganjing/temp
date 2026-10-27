export type TimerPhase = 'idle' | 'focusing' | 'paused-focusing' | 'resting' | 'paused-resting';

export interface SessionRecord {
  completedAt: string;  // ISO 8601 timestamp
  durationMin: number;  // focus duration in minutes, fixed at 25
}

export const FOCUS_DURATION_SEC = 25 * 60;
export const REST_DURATION_SEC = 5 * 60;
export const FOCUS_DURATION_MIN = 25;

/** Format key for localStorage: timeling:YYYY-MM-DD */
export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `timeling:${y}-${m}-${d}`;
}

/** Load sessions for a given date key from localStorage */
export function loadSessions(key: string): SessionRecord[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s: unknown): s is SessionRecord =>
        typeof s === 'object' && s !== null &&
        typeof (s as SessionRecord).completedAt === 'string' &&
        typeof (s as SessionRecord).durationMin === 'number'
    );
  } catch {
    return [];
  }
}

/** Save sessions for a given date key to localStorage */
export function saveSessions(key: string, sessions: SessionRecord[]): void {
  localStorage.setItem(key, JSON.stringify(sessions));
}

/** Format seconds as MM:SS */
export function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Format cumulative minutes as "X小时Y分钟" */
export function formatDuration(totalMin: number): string {
  if (totalMin === 0) return '0分钟';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}分钟`;
  if (m === 0) return `${h}小时`;
  return `${h}小时${m}分钟`;
}

/** Get hour (0-23) from an ISO timestamp */
export function hourOf(isoTs: string): number {
  return new Date(isoTs).getHours();
}
