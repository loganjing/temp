import type { DbClient } from '@commonapp/dbkit'
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../../shared/ticket-domain'
import { forbidden, validationError } from './errors'
import { type Profile, visibleTicketScope } from './access'

type StatsQuery = Record<string, string | undefined>

function parseDateOnly(value: string | undefined, field: string): string | undefined {
  if (value === undefined || value === '') return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw validationError(`${field} 必须是 YYYY-MM-DD`, { [field]: '日期格式无效' })
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw validationError(`${field} 不是有效日期`, { [field]: '日期格式无效' })
  return value
}

function resolveRange(query: StatsQuery) {
  const today = new Date()
  const defaultTo = today.toISOString().slice(0, 10)
  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29)).toISOString().slice(0, 10)
  const from = parseDateOnly(query.from, 'from') ?? defaultFrom
  const to = parseDateOnly(query.to, 'to') ?? defaultTo
  const start = `${from}T00:00:00.000Z`
  const end = `${to}T23:59:59.999Z`
  if (start > end) throw validationError('from 不能晚于 to', { from: '时间范围无效' })
  return { from, to, start, end }
}

function scopedFilters(profile: Profile, query: StatsQuery, start: string, end: string) {
  const scope = visibleTicketScope(profile, 't')
  const filters = [scope.sql, 't.created_at >= ?', 't.created_at <= ?']
  const params: unknown[] = [...scope.params, start, end]
  if (query.companyId) {
    if (profile.role !== 'ops' && query.companyId !== profile.companyId) throw forbidden('只能统计本公司数据')
    filters.push('t.company_id = ?')
    params.push(query.companyId)
  }
  return { where: filters.join(' AND '), params }
}

function ratio(count: number, total: number) {
  return total === 0 ? 0 : Math.round((count / total) * 10000) / 10000
}

export async function getDistribution(db: DbClient, profile: Profile, query: StatsQuery) {
  const dimension = query.dimension
  if (dimension !== 'company' && dimension !== 'department')
    throw validationError('dimension 必须是 company 或 department', { dimension: 'dimension 取值无效' })
  const { start, end } = resolveRange(query)
  const { where, params } = scopedFilters(profile, query, start, end)

  if (dimension === 'company') {
    const rows = await db.queryAll<{ key: string; label: string; count: number }>({
      text: `SELECT t.company_id AS key, c.name AS label, COUNT(*) AS count
               FROM tickets t JOIN companies c ON c.id = t.company_id
              WHERE ${where}
              GROUP BY t.company_id, c.name
              ORDER BY count DESC, label ASC`,
      params,
    })
    const total = rows.reduce((sum, row) => sum + Number(row.count), 0)
    return {
      dimension,
      total,
      items: rows.map((row) => ({ key: row.key, label: row.label, count: Number(row.count), ratio: ratio(Number(row.count), total) })),
    }
  }

  const rows = await db.queryAll<{ key: string; department_name: string; company_name: string; count: number }>({
    text: `SELECT t.department_id AS key, d.name AS department_name, c.name AS company_name, COUNT(*) AS count
             FROM tickets t
             JOIN departments d ON d.id = t.department_id
             JOIN companies c ON c.id = t.company_id
            WHERE ${where}
            GROUP BY t.department_id, d.name, c.name
            ORDER BY count DESC, company_name ASC, department_name ASC`,
    params,
  })
  const total = rows.reduce((sum, row) => sum + Number(row.count), 0)
  return {
    dimension,
    total,
    items: rows.map((row) => ({
      key: row.key,
      label: query.companyId ? row.department_name : `${row.company_name} / ${row.department_name}`,
      count: Number(row.count),
      ratio: ratio(Number(row.count), total),
    })),
  }
}

export async function getDashboard(db: DbClient, profile: Profile, query: StatsQuery) {
  const range = resolveRange(query)
  const { where, params } = scopedFilters(profile, query, range.start, range.end)

  const [countRow, satisfactionRow, responseRows, categoryRows, statusRows, priorityRows] = await Promise.all([
    db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`, params }),
    db.queryOne<{ average: number | null; rated: number }>({
      text: `SELECT AVG(t.satisfaction_score) AS average, COUNT(*) AS rated
               FROM tickets t
              WHERE ${where} AND t.status = 'completed' AND t.satisfaction_score IS NOT NULL`,
      params,
    }),
    db.queryAll<{ created_at: string; first_response_at: string }>({
      text: `SELECT t.created_at, t.first_response_at
               FROM tickets t
              WHERE ${where} AND t.first_response_at IS NOT NULL`,
      params,
    }),
    db.queryAll<{ category_id: string; category_name: string; count: number }>({
      text: `SELECT t.category_id, c.name AS category_name, COUNT(*) AS count
               FROM tickets t JOIN categories c ON c.id = t.category_id
              WHERE ${where}
              GROUP BY t.category_id, c.name
              ORDER BY count DESC, category_name ASC
              LIMIT 5`,
      params,
    }),
    db.queryAll<{ status: string; count: number }>({
      text: `SELECT t.status, COUNT(*) AS count FROM tickets t WHERE ${where} GROUP BY t.status`,
      params,
    }),
    db.queryAll<{ priority: string; count: number }>({
      text: `SELECT t.priority, COUNT(*) AS count FROM tickets t WHERE ${where} GROUP BY t.priority`,
      params,
    }),
  ])

  const durations = responseRows
    .map((row) => (Date.parse(row.first_response_at) - Date.parse(row.created_at)) / 60000)
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0)
  const averageResponse = durations.length
    ? Math.round((durations.reduce((sum, minutes) => sum + minutes, 0) / durations.length) * 100) / 100
    : null
  const averageSatisfaction = satisfactionRow?.average === null || satisfactionRow?.average === undefined
    ? null
    : Math.round(Number(satisfactionRow.average) * 100) / 100

  const statusCounts = new Map(statusRows.map((row) => [row.status, Number(row.count)]))
  const priorityCounts = new Map(priorityRows.map((row) => [row.priority, Number(row.count)]))

  return {
    range: { from: range.from, to: range.to },
    ticketCount: Number(countRow?.total ?? 0),
    avgFirstResponseMinutes: averageResponse,
    satisfaction: { average: averageSatisfaction, ratedCount: Number(satisfactionRow?.rated ?? 0) },
    hotCategories: categoryRows.map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      count: Number(row.count),
    })),
    statusBreakdown: TICKET_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
    priorityBreakdown: TICKET_PRIORITIES.map((priority) => ({ priority, count: priorityCounts.get(priority) ?? 0 })),
  }
}
