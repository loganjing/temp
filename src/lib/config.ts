import { DEFAULT_DURATIONS, type PomodoroDurations } from './pomodoro';

/**
 * 验证辅助参数：仅当 URL 显式提供 `focusSeconds` / `breakSeconds` 时才生效，
 * 默认（无参数）始终使用需求约定的 25 分钟专注 + 5 分钟休息。
 * 该入口不改变产品默认行为，仅用于在可接受的等待时间内验证完整番茄钟流程。
 */
export const VERIFICATION_QUERY_PARAMS = {
  focusSeconds: 'focusSeconds',
  breakSeconds: 'breakSeconds',
} as const;

function readSeconds(raw: string | null, fallbackMs: number): number {
  if (raw === null) return fallbackMs;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return fallbackMs;
  return Math.round(seconds * 1000);
}

export function readDurations(search: string): PomodoroDurations {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  return {
    focusMs: readSeconds(params.get(VERIFICATION_QUERY_PARAMS.focusSeconds), DEFAULT_DURATIONS.focusMs),
    breakMs: readSeconds(params.get(VERIFICATION_QUERY_PARAMS.breakSeconds), DEFAULT_DURATIONS.breakMs),
  };
}

export function isDefaultDurations(durations: PomodoroDurations): boolean {
  return durations.focusMs === DEFAULT_DURATIONS.focusMs && durations.breakMs === DEFAULT_DURATIONS.breakMs;
}