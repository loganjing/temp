/**
 * localStorage 存储工具 — 当日专注记录按日期分 key 持久化。
 * key 格式: timeling.sessions.YYYY-MM-DD
 * value: JSON 数组 [{ completedAt: number, duration: number }]
 */

const PREFIX = 'timeling.sessions.'

export function todayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${PREFIX}${y}-${m}-${d}`
}

export function loadSessions(date = new Date()) {
  try {
    const raw = localStorage.getItem(todayKey(date))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveSession(session, date = new Date()) {
  const sessions = loadSessions(date)
  sessions.push(session)
  localStorage.setItem(todayKey(date), JSON.stringify(sessions))
  return sessions
}

/**
 * 将记录列表按小时分桶（0-23），统计每小时内完成的专注分钟数。
 */
export function buildHeatmap(sessions) {
  const buckets = new Array(24).fill(0)
  for (const s of sessions) {
    const hour = new Date(s.completedAt).getHours()
    buckets[hour] += s.duration
  }
  return buckets
}

/**
 * 累计专注时长（分钟）= 记录数 × 25
 */
export function totalFocusMinutes(sessions) {
  return sessions.reduce((sum, s) => sum + s.duration, 0)
}
