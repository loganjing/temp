import { useEffect, useState } from 'react'
import { api } from '../domain/api'
import { errorText } from '../domain/format'
import { useAsync } from '../domain/hooks'
import type { WorkCalendar } from '../domain/types'
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  TableShell,
  Td,
  Th,
  useToast,
} from '../components/ui'
import { usePlatformText } from '../platform/i18n'

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/** 工作日历与节假日（需求 §6.9）：每周工作日、工作时段、时区 + 法定节假日维护 */
export function CalendarPage() {
  const t = usePlatformText()
  const toast = useToast()
  const [version, setVersion] = useState(0)
  const calendar = useAsync(() => api.getCalendar(), [version])
  const holidays = useAsync(() => api.holidays(), [version])
  const [form, setForm] = useState<WorkCalendar | null>(null)
  const [saving, setSaving] = useState(false)
  const [newHoliday, setNewHoliday] = useState({ date: '', nameZh: '', nameEn: '' })

  useEffect(() => {
    if (calendar.data) setForm({ ...calendar.data })
  }, [calendar.data])

  function toggleWeekday(day: number) {
    if (!form) return
    const next = form.weekdays.includes(day)
      ? form.weekdays.filter((value) => value !== day)
      : [...form.weekdays, day].sort((a, b) => a - b)
    setForm({ ...form, weekdays: next })
  }

  async function saveCalendar() {
    if (!form || saving) return
    if (form.weekdays.length === 0) {
      toast.error(t('calendar.weekdaysRequired'))
      return
    }
    setSaving(true)
    try {
      await api.putCalendar(form)
      toast.success(t('common.saved'))
      setVersion((value) => value + 1)
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    } finally {
      setSaving(false)
    }
  }

  async function addHoliday() {
    if (!newHoliday.date || !newHoliday.nameZh.trim()) {
      toast.error(t('form.validation.missing'))
      return
    }
    try {
      await api.createHoliday({ date: newHoliday.date, nameZh: newHoliday.nameZh.trim(), nameEn: newHoliday.nameEn.trim() })
      toast.success(t('common.saved'))
      setNewHoliday({ date: '', nameZh: '', nameEn: '' })
      setVersion((value) => value + 1)
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    }
  }

  async function removeHoliday(id: number) {
    try {
      await api.deleteHoliday(id)
      toast.success(t('common.saved'))
      setVersion((value) => value + 1)
    } catch (reason) {
      toast.error(errorText(reason, t('common.error.generic')))
    }
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-lg font-semibold text-slate-800">{t('calendar.title')}</h1>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-700">{t('calendar.workCalendar')}</h2>
        {calendar.loading && !form ? (
          <LoadingBlock label={t('common.loading')} />
        ) : calendar.error ? (
          <ErrorBlock error={calendar.error} onRetry={calendar.reload} retryLabel={t('common.retry')} />
        ) : form ? (
          <div className="mt-4 space-y-4">
            <Field label={t('calendar.workdays')} required>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_KEYS.map((key, index) => {
                  const day = index + 1
                  const active = form.weekdays.includes(day)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleWeekday(day)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {t(`common.weekday.${key}`)}
                    </button>
                  )
                })}
              </div>
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={t('calendar.workStart')}>
                <Input
                  type="time"
                  value={form.workStartTime}
                  onChange={(event) => setForm({ ...form, workStartTime: event.target.value })}
                />
              </Field>
              <Field label={t('calendar.workEnd')}>
                <Input
                  type="time"
                  value={form.workEndTime}
                  onChange={(event) => setForm({ ...form, workEndTime: event.target.value })}
                />
              </Field>
              <Field label={t('calendar.timezone')}>
                <Input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" icon="check" disabled={saving} onClick={() => void saveCalendar()}>
                {saving ? t('common.busy') : t('common.save')}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-700">{t('calendar.holidays')}</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label={t('calendar.holidayDate')} required>
            <Input type="date" value={newHoliday.date} onChange={(event) => setNewHoliday({ ...newHoliday, date: event.target.value })} />
          </Field>
          <Field label={t('common.nameZh')} required>
            <Input value={newHoliday.nameZh} onChange={(event) => setNewHoliday({ ...newHoliday, nameZh: event.target.value })} />
          </Field>
          <Field label={t('common.nameEn')}>
            <Input value={newHoliday.nameEn} onChange={(event) => setNewHoliday({ ...newHoliday, nameEn: event.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button icon="plus" onClick={() => void addHoliday()}>
              {t('calendar.addHoliday')}
            </Button>
          </div>
        </div>
        {holidays.loading && !holidays.data ? (
          <LoadingBlock label={t('common.loading')} />
        ) : holidays.error ? (
          <ErrorBlock error={holidays.error} onRetry={holidays.reload} retryLabel={t('common.retry')} />
        ) : !holidays.data || holidays.data.length === 0 ? (
          <EmptyBlock label={t('calendar.holidayEmpty')} icon="calendar" />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>{t('calendar.holidayDate')}</Th>
                <Th>{t('common.nameZh')}</Th>
                <Th>{t('common.nameEn')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {holidays.data.map((holiday) => (
                <tr key={holiday.id}>
                  <Td className="font-mono text-xs text-slate-500">{holiday.date}</Td>
                  <Td>{holiday.nameZh}</Td>
                  <Td className="text-slate-500">{holiday.nameEn || '—'}</Td>
                  <Td>
                    <Button variant="danger" icon="trash" onClick={() => void removeHoliday(holiday.id)}>
                      {t('common.delete')}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </section>
    </div>
  )
}
