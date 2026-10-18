// SLA policy, work calendar and holiday configuration (contract §6).
import type { DbClient } from '@commonapp/dbkit'
import type { Locale, Ref } from '../../shared/domain'
import { notFound, validation } from '../core/errors'
import { localizedPair } from '../core/serialize'
import { parseHhMm, parseWeekdays } from '../core/calendar'
import type { CategoryRow } from '../core/rows'
import type { SessionUser } from '../core/session'
import { createConfigAudit, type ConfigAuditInput } from './audit'

function audit(db: DbClient, input: ConfigAuditInput): Promise<void> {
  return createConfigAudit(db).record(input)
}

interface CategoryJoined extends CategoryRow {
  department_name_zh: string | null
  department_name_en: string | null
}

const CATEGORY_SELECT = `SELECT c.*, d.name_zh AS department_name_zh, d.name_en AS department_name_en
  FROM categories c LEFT JOIN departments d ON d.id = c.department_id`

export async function listSlaPolicies(db: DbClient, locale: Locale) {
  const policies = await db.queryAll<{
    id: number
    category_id: number
    first_response_minutes: number
    resolution_minutes: number
    warn_threshold_percent: number
  }>({ text: 'SELECT id, category_id, first_response_minutes, resolution_minutes, warn_threshold_percent FROM sla_policies ORDER BY id' })
  const items = []
  for (const policy of policies) {
    const category = await db.queryOne<CategoryJoined>({
      text: `${CATEGORY_SELECT} WHERE c.id = ?`,
      params: [policy.category_id],
    })
    if (!category) continue
    const pair = localizedPair('zh', category.name_zh, category.name_en)
    items.push({
      id: policy.id,
      category: { id: category.id, nameZh: pair.nameZh, nameEn: pair.nameEn } satisfies Ref,
      firstResponseMinutes: policy.first_response_minutes,
      resolutionMinutes: policy.resolution_minutes,
      warnThresholdPercent: policy.warn_threshold_percent,
    })
  }
  const unconfiguredRows = await db.queryAll<CategoryJoined>({
    text: `${CATEGORY_SELECT} WHERE c.is_skeleton = 0 AND NOT EXISTS (
             SELECT 1 FROM sla_policies sp WHERE sp.category_id = c.id)
           ORDER BY c.sort_order, c.id`,
  })
  const unconfiguredCategories = unconfiguredRows.map((row) => {
    const pair = localizedPair('zh', row.name_zh, row.name_en)
    return { id: row.id, nameZh: pair.nameZh, nameEn: pair.nameEn }
  })
  return { items, unconfiguredCategories }
}

export interface SlaPolicyInput {
  categoryId: number
  firstResponseMinutes: number
  resolutionMinutes: number
  warnThresholdPercent?: number
}

function validatePolicyInput(input: SlaPolicyInput, locale: Locale): number {
  if (!Number.isInteger(input.firstResponseMinutes) || input.firstResponseMinutes < 0) {
    throw validation(locale === 'zh' ? '首次响应时限不合法' : 'Invalid firstResponseMinutes', ['firstResponseMinutes'])
  }
  if (!Number.isInteger(input.resolutionMinutes) || input.resolutionMinutes < 0) {
    throw validation(locale === 'zh' ? '解决时限不合法' : 'Invalid resolutionMinutes', ['resolutionMinutes'])
  }
  const warn = input.warnThresholdPercent ?? 80
  if (!Number.isInteger(warn) || warn < 0 || warn > 100) {
    throw validation(locale === 'zh' ? '预警阈值不合法' : 'Invalid warnThresholdPercent', ['warnThresholdPercent'])
  }
  return warn
}

async function assertCategoryForPolicy(db: DbClient, categoryId: number, locale: Locale): Promise<void> {
  const category = await db.queryOne<CategoryRow>({ text: 'SELECT * FROM categories WHERE id = ?', params: [categoryId] })
  if (!category || category.is_skeleton === 1) {
    throw validation(locale === 'zh' ? '分类不存在或不可用' : 'Category does not exist or is not usable', ['categoryId'])
  }
}

export async function createSlaPolicy(db: DbClient, actor: SessionUser, input: SlaPolicyInput, locale: Locale): Promise<void> {
  const warn = validatePolicyInput(input, locale)
  await assertCategoryForPolicy(db, input.categoryId, locale)
  const existing = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM sla_policies WHERE category_id = ?',
    params: [input.categoryId],
  })
  if (existing) {
    throw validation(locale === 'zh' ? '该分类已配置 SLA 策略' : 'A policy already exists for the category', ['categoryId'])
  }
  const now = new Date().toISOString()
  await db.run({
    text: `INSERT INTO sla_policies (category_id, first_response_minutes, resolution_minutes, warn_threshold_percent, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
    params: [input.categoryId, input.firstResponseMinutes, input.resolutionMinutes, warn, now, now],
  })
  await audit(db, {
    type: 'sla_policy.create',
    actorId: actor.id,
    summaryZh: `新增 SLA 策略（分类 #${input.categoryId}）`,
    summaryEn: `SLA policy created (category #${input.categoryId})`,
  })
}

export async function updateSlaPolicy(
  db: DbClient,
  actor: SessionUser,
  id: number,
  input: Partial<SlaPolicyInput>,
  locale: Locale,
): Promise<void> {
  const existing = await db.queryOne<{
    id: number
    category_id: number
    first_response_minutes: number
    resolution_minutes: number
    warn_threshold_percent: number
  }>({
    text: 'SELECT id, category_id, first_response_minutes, resolution_minutes, warn_threshold_percent FROM sla_policies WHERE id = ?',
    params: [id],
  })
  if (!existing) throw notFound(locale === 'zh' ? 'SLA 策略不存在' : 'SLA policy not found')
  const merged: SlaPolicyInput = {
    categoryId: input.categoryId !== undefined ? input.categoryId : existing.category_id,
    firstResponseMinutes:
      input.firstResponseMinutes !== undefined ? input.firstResponseMinutes : existing.first_response_minutes,
    resolutionMinutes:
      input.resolutionMinutes !== undefined ? input.resolutionMinutes : existing.resolution_minutes,
    warnThresholdPercent: input.warnThresholdPercent,
  }
  const warn = validatePolicyInput(merged, locale)
  await assertCategoryForPolicy(db, merged.categoryId, locale)
  if (merged.categoryId !== existing.category_id) {
    const duplicate = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM sla_policies WHERE category_id = ? AND id != ?',
      params: [merged.categoryId, id],
    })
    if (duplicate) {
      throw validation(locale === 'zh' ? '该分类已配置 SLA 策略' : 'A policy already exists for the category', ['categoryId'])
    }
  }
  await db.run({
    text: `UPDATE sla_policies SET category_id = ?, first_response_minutes = ?, resolution_minutes = ?, warn_threshold_percent = ?, updated_at = ?
           WHERE id = ?`,
    params: [
      merged.categoryId,
      merged.firstResponseMinutes,
      merged.resolutionMinutes,
      warn,
      new Date().toISOString(),
      id,
    ],
  })
  await audit(db, {
    type: 'sla_policy.update',
    actorId: actor.id,
    summaryZh: `更新 SLA 策略 #${id}`,
    summaryEn: `SLA policy updated #${id}`,
  })
}

// --- Work calendar ---

export async function getCalendar(db: DbClient) {
  const row = await db.queryOne<{
    weekdays: string
    work_start_time: string
    work_end_time: string
    timezone: string
  }>({ text: 'SELECT weekdays, work_start_time, work_end_time, timezone FROM work_calendar WHERE id = 1' })
  if (!row) {
    return { weekdays: [1, 2, 3, 4, 5], workStartTime: '09:00', workEndTime: '18:00', timezone: 'Asia/Kuala_Lumpur' }
  }
  return {
    weekdays: parseWeekdays(row.weekdays),
    workStartTime: row.work_start_time,
    workEndTime: row.work_end_time,
    timezone: row.timezone,
  }
}

export async function putCalendar(
  db: DbClient,
  actor: SessionUser,
  input: { weekdays: number[]; workStartTime: string; workEndTime: string; timezone: string },
  locale: Locale,
): Promise<void> {
  if (
    !Array.isArray(input.weekdays) ||
    input.weekdays.length === 0 ||
    new Set(input.weekdays).size !== input.weekdays.length ||
    input.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
  ) {
    throw validation(locale === 'zh' ? '工作日不合法' : 'Invalid weekdays', ['weekdays'])
  }
  if (!parseHhMm(input.workStartTime ?? '')) {
    throw validation(locale === 'zh' ? '开始时间不合法' : 'Invalid workStartTime', ['workStartTime'])
  }
  if (!parseHhMm(input.workEndTime ?? '')) {
    throw validation(locale === 'zh' ? '结束时间不合法' : 'Invalid workEndTime', ['workEndTime'])
  }
  if (!input.timezone?.trim()) {
    throw validation(locale === 'zh' ? '时区必填' : 'timezone is required', ['timezone'])
  }
  await db.run({
    text: 'UPDATE work_calendar SET weekdays = ?, work_start_time = ?, work_end_time = ?, timezone = ?, updated_at = ? WHERE id = 1',
    params: [
      JSON.stringify(input.weekdays),
      input.workStartTime,
      input.workEndTime,
      input.timezone.trim(),
      new Date().toISOString(),
    ],
  })
  await audit(db, {
    type: 'calendar.update',
    actorId: actor.id,
    summaryZh: '更新工作日历',
    summaryEn: 'Work calendar updated',
  })
}

// --- Holidays ---

export async function listHolidays(db: DbClient, locale: Locale) {
  const rows = await db.queryAll<{ id: number; date: string; name_zh: string; name_en: string }>({
    text: 'SELECT id, date, name_zh, name_en FROM holidays ORDER BY date',
  })
  return {
    items: rows.map((row) => {
      const pair = localizedPair('zh', row.name_zh, row.name_en)
      return { id: row.id, date: row.date, nameZh: pair.nameZh, nameEn: pair.nameEn }
    }),
  }
}

export async function createHoliday(
  db: DbClient,
  actor: SessionUser,
  input: { date: string; nameZh: string; nameEn?: string | null },
  locale: Locale,
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '')) {
    throw validation(locale === 'zh' ? '日期格式不合法' : 'Invalid date', ['date'])
  }
  if (!input.nameZh?.trim()) {
    throw validation(locale === 'zh' ? '中文名必填' : 'nameZh is required', ['nameZh'])
  }
  const duplicate = await db.queryOne<{ id: number }>({
    text: 'SELECT id FROM holidays WHERE date = ?',
    params: [input.date],
  })
  if (duplicate) throw validation(locale === 'zh' ? '节假日日期已存在' : 'Holiday date already exists', ['date'])
  await db.run({
    text: 'INSERT INTO holidays (date, name_zh, name_en, created_at) VALUES (?, ?, ?, ?)',
    params: [input.date, input.nameZh.trim(), input.nameEn?.trim() ?? '', new Date().toISOString()],
  })
  await audit(db, {
    type: 'holiday.create',
    actorId: actor.id,
    summaryZh: `新增节假日 ${input.date}`,
    summaryEn: `Holiday created: ${input.date}`,
  })
}

export async function deleteHoliday(db: DbClient, actor: SessionUser, id: number, locale: Locale): Promise<void> {
  const existing = await db.queryOne<{ id: number }>({ text: 'SELECT id FROM holidays WHERE id = ?', params: [id] })
  if (!existing) throw notFound(locale === 'zh' ? '节假日不存在' : 'Holiday not found')
  await db.run({ text: 'DELETE FROM holidays WHERE id = ?', params: [id] })
  await audit(db, {
    type: 'holiday.delete',
    actorId: actor.id,
    summaryZh: `删除节假日 #${id}`,
    summaryEn: `Holiday deleted #${id}`,
  })
}
