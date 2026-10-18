import { useState } from 'react'
import { usePlatformText } from '../platform/i18n'
import { Icon } from './icons'

// 日历区间选择器：点第一下定开始、第二下定结束，自动排序（需求 §6.6）。
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function isoOf(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

export function RangeCalendar({
  start,
  end,
  onSelect,
}: {
  start: string | null
  end: string | null
  onSelect: (start: string, end: string) => void
}) {
  const t = usePlatformText()
  const [view, setView] = useState(() => {
    const base = start ? parseISO(start) : new Date()
    return { year: base.getFullYear(), month: base.getMonth() }
  })
  const [pendingStart, setPendingStart] = useState<string | null>(null)

  const first = new Date(view.year, view.month, 1)
  const leadDays = (first.getDay() + 6) % 7 // 周一为一周起点
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array.from({ length: leadDays }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => isoOf(new Date(view.year, view.month, index + 1))),
  ]

  const today = isoOf(new Date())
  const rangeStart = start
  const rangeEnd = end

  function shiftMonth(delta: number) {
    setView((current) => {
      const next = new Date(current.year, current.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  function pick(iso: string) {
    if (pendingStart === null) {
      setPendingStart(iso)
      onSelect(iso, iso)
      return
    }
    const [low, high] = [pendingStart, iso].sort((a, b) => (a < b ? -1 : 1))
    setPendingStart(null)
    onSelect(low, high)
  }

  return (
    <div className="w-72 rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shiftMonth(-1)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="prev-month">
          <Icon name="chevronLeft" className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-slate-700">
          {view.year}-{String(view.month + 1).padStart(2, '0')}
        </span>
        <button type="button" onClick={() => shiftMonth(1)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="next-month">
          <Icon name="chevronRight" className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => (
          <span key={day} className="py-1 text-xs font-medium text-slate-400">
            {t(`common.weekday.${day}`)}
          </span>
        ))}
        {cells.map((iso, index) => {
          if (iso === null) return <span key={`blank-${index}`} />
          const inRange = rangeStart !== null && rangeEnd !== null && iso >= rangeStart && iso <= rangeEnd
          const isEdge = iso === rangeStart || iso === rangeEnd
          return (
            <button
              key={iso}
              type="button"
              onClick={() => pick(iso)}
              className={`h-8 rounded-lg text-sm transition-colors ${
                isEdge
                  ? 'bg-indigo-600 font-semibold text-white'
                  : inRange
                    ? 'bg-indigo-50 text-indigo-700'
                    : iso === today
                      ? 'text-indigo-600 ring-1 ring-indigo-300'
                      : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {Number(iso.slice(8))}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-slate-400">{t('org.vacation.rangeHint')}</p>
    </div>
  )
}
