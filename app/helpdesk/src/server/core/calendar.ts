// Work calendar engine: timezone wall-clock math, working-minute rolling
// deadlines, and the single "today" boundary used by every statistics query.
import type { DbClient } from '@commonapp/dbkit'

export interface WorkCalendarConfig {
  weekdays: number[] // 1=Monday .. 7=Sunday
  workStartTime: string // "HH:mm"
  workEndTime: string // "HH:mm"
  timezone: string
}

export interface CalendarBundle {
  config: WorkCalendarConfig
  holidays: Set<string> // "YYYY-MM-DD"
}

const MINUTE = 60_000

export function parseWeekdays(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((n) => typeof n === 'number' && n >= 1 && n <= 7)
    }
  } catch {
    // fall through to default
  }
  return [1, 2, 3, 4, 5]
}

export function parseHhMm(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 24 || minutes > 59) return null
  return { hours, minutes }
}

export async function loadCalendar(db: DbClient): Promise<CalendarBundle> {
  const row = await db.queryOne<{ weekdays: string; work_start_time: string; work_end_time: string; timezone: string }>(
    { text: 'SELECT weekdays, work_start_time, work_end_time, timezone FROM work_calendar WHERE id = 1' },
  )
  const holidayRows = await db.queryAll<{ date: string }>({ text: 'SELECT date FROM holidays' })
  const config: WorkCalendarConfig = row
    ? {
        weekdays: parseWeekdays(row.weekdays),
        workStartTime: row.work_start_time,
        workEndTime: row.work_end_time,
        timezone: row.timezone,
      }
    : { weekdays: [1, 2, 3, 4, 5], workStartTime: '09:00', workEndTime: '18:00', timezone: 'Asia/Kuala_Lumpur' }
  return { config, holidays: new Set(holidayRows.map((r) => r.date)) }
}

// --- Timezone wall-clock helpers (no external dependencies) ---

const wallClockFormatterCache = new Map<string, Intl.DateTimeFormat>()

function wallClockFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = wallClockFormatterCache.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hour12: false,
    })
    wallClockFormatterCache.set(timezone, formatter)
  }
  return formatter
}

export interface WallClock {
  year: number
  month: number // 1-12
  day: number
  hours: number
  minutes: number
  weekday: number // 1=Monday .. 7=Sunday
}

export function wallClockOf(date: Date, timezone: string): WallClock {
  const parts = wallClockFormatter(timezone).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  let hours = Number(get('hour'))
  if (hours === 24) hours = 0
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hours,
    minutes: Number(get('minute')),
    weekday: weekdayMap[get('weekday')] ?? 1,
  }
}

export function isoOfWallClock(wall: WallClock, timezone: string): string {
  // Guess with an approximate offset, then correct once. Exact for fixed-offset
  // zones like Asia/Kuala_Lumpur; correct within one DST step elsewhere.
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hours, wall.minutes, 0)
  const guess = new Date(naive)
  const probe = wallClockOf(guess, timezone)
  const driftMs =
    (probe.hours - wall.hours) * 3_600_000 + (probe.minutes - wall.minutes) * 60_000
  const corrected = new Date(naive - driftMs)
  return corrected.toISOString()
}

export function dateKeyOf(date: Date, timezone: string): string {
  const wall = wallClockOf(date, timezone)
  return `${String(wall.year).padStart(4, '0')}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`
}

/** UTC instants [start, end) of the calendar-timezone natural day of `date`. */
export function dayRangeOf(date: Date, timezone: string): { start: string; end: string } {
  const wall = wallClockOf(date, timezone)
  const start = isoOfWallClock({ ...wall, hours: 0, minutes: 0 }, timezone)
  const endWall =
    wall.day === 31 && wall.month === 12
      ? { year: wall.year + 1, month: 1, day: 1, hours: 0, minutes: 0, weekday: 1 }
      : { ...wall, day: wall.day + 1, hours: 0, minutes: 0 }
  // Normalize month overflow via Date arithmetic on the naive UTC value.
  const naiveEnd = Date.UTC(endWall.year, endWall.month - 1, endWall.day, 0, 0, 0)
  const probe = wallClockOf(new Date(naiveEnd), timezone)
  const end = isoOfWallClock(
    { year: probe.year, month: probe.month, day: probe.day, hours: 0, minutes: 0, weekday: probe.weekday },
    timezone,
  )
  return { start, end }
}

// --- Working-time rolling deadline ---

function isWorkingDay(wall: WallClock, calendar: CalendarBundle): boolean {
  if (!calendar.config.weekdays.includes(wall.weekday)) return false
  const key = `${String(wall.year).padStart(4, '0')}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`
  return !calendar.holidays.has(key)
}

/**
 * Adds `minutes` of working time to `startIso`, rolling across the work
 * calendar (working weekdays, work-time window, holidays, timezone).
 * Returns the deadline as a UTC ISO string.
 */
export function addWorkingMinutes(startIso: string, minutes: number, calendar: CalendarBundle): string {
  if (minutes <= 0) return startIso
  let remaining = minutes
  const timezone = calendar.config.timezone
  const start = new Date(startIso)
  const startWall = wallClockOf(start, timezone)
  const workStart = parseHhMm(calendar.config.workStartTime) ?? { hours: 9, minutes: 0 }
  const workEnd = parseHhMm(calendar.config.workEndTime) ?? { hours: 18, minutes: 0 }
  const workStartMinutes = workStart.hours * 60 + workStart.minutes
  const workEndMinutes = workEnd.hours * 60 + workEnd.minutes
  const dailyCapacity = Math.max(0, workEndMinutes - workStartMinutes)
  if (dailyCapacity === 0) return startIso

  let cursor = start
  let wall = startWall
  const nowMinutes = wall.hours * 60 + wall.minutes
  if (!isWorkingDay(wall, calendar) || nowMinutes >= workEndMinutes) {
    // Move to the start of the next working day.
    wall = nextWorkingDayStart(wall, calendar)
    cursor = new Date(isoOfWallClock({ ...wall, hours: workStart.hours, minutes: workStart.minutes }, timezone))
  } else if (nowMinutes < workStartMinutes) {
    cursor = new Date(isoOfWallClock({ ...wall, hours: workStart.hours, minutes: workStart.minutes }, timezone))
  }

  while (remaining > 0) {
    const wallNow = wallClockOf(cursor, timezone)
    const cursorMinutes = wallNow.hours * 60 + wallNow.minutes
    const availableToday = workEndMinutes - cursorMinutes
    if (availableToday <= 0) {
      const next = nextWorkingDayStart(wallNow, calendar)
      cursor = new Date(
        isoOfWallClock({ ...next, hours: workStart.hours, minutes: workStart.minutes }, timezone),
      )
      wall = next
      continue
    }
    if (remaining <= availableToday) {
      const deadlineMinutes = cursorMinutes + remaining
      const hours = Math.floor(deadlineMinutes / 60)
      const minutesPart = deadlineMinutes % 60
      return isoOfWallClock({ ...wallNow, hours, minutes: minutesPart }, timezone)
    }
    remaining -= availableToday
    const next = nextWorkingDayStart(wallNow, calendar)
    cursor = new Date(isoOfWallClock({ ...next, hours: workStart.hours, minutes: workStart.minutes }, timezone))
  }
  return cursor.toISOString()
}

function nextWorkingDayStart(wall: WallClock, calendar: CalendarBundle): WallClock {
  let candidate = addDays(wall, 1)
  for (let guard = 0; guard < 400 && !isWorkingDay(candidate, calendar); guard += 1) {
    candidate = addDays(candidate, 1)
  }
  return candidate
}

function addDays(wall: WallClock, days: number): WallClock {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day + days)
  const shifted = new Date(naive)
  const nextWall = wallClockOf(shifted, 'UTC')
  return {
    year: nextWall.year,
    month: nextWall.month,
    day: nextWall.day,
    hours: wall.hours,
    minutes: wall.minutes,
    weekday: (((wall.weekday - 1 + days) % 7) + 7) % 7 + 1,
  }
}

/** Shifts an ISO deadline by an absolute duration (hold/resume deferral). */
export function shiftIso(iso: string, durationMs: number): string {
  return new Date(new Date(iso).getTime() + durationMs).toISOString()
}

export function diffMs(aIso: string, bIso: string): number {
  return new Date(aIso).getTime() - new Date(bIso).getTime()
}
