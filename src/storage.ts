import type { FocusRecord, PomodoroDurations } from './types'

export const FOCUS_DURATION_SECONDS = 25 * 60
export const REST_DURATION_SECONDS = 5 * 60
export const FOCUS_DURATION_MINUTES = 25

/** 测试模式默认压缩时长 */
export const TEST_FOCUS_SECONDS = 5
export const TEST_REST_SECONDS = 2

export function isTestMode(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('test') === '1'
}

export function defaultDurations(): PomodoroDurations {
  return isTestMode()
    ? { focusSeconds: TEST_FOCUS_SECONDS, restSeconds: TEST_REST_SECONDS }
    : { focusSeconds: FOCUS_DURATION_SECONDS, restSeconds: REST_DURATION_SECONDS }
}

export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `focus-records-${y}-${m}-${d}`
}

export function loadRecords(date: Date = new Date()): FocusRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(todayKey(date))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is FocusRecord =>
        r &&
        typeof r.id === 'string' &&
        typeof r.completedAt === 'string' &&
        typeof r.durationMinutes === 'number',
    )
  } catch {
    return []
  }
}

export function saveRecords(records: FocusRecord[], date: Date = new Date()): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(todayKey(date), JSON.stringify(records))
  } catch {
    // ignore quota / serialization errors
  }
}

export function clearRecords(date: Date = new Date()): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(todayKey(date))
  } catch {
    // ignore
  }
}

export function appendRecord(record: FocusRecord, date: Date = new Date()): FocusRecord[] {
  const records = loadRecords(date)
  const next = [...records, record].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
  )
  saveRecords(next, date)
  return next
}
