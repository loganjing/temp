// Statistics service: role-scoped queries with the single "today" boundary
// and a shared ticket-scope predicate builder so KPI cards, alert counts and
// drill-down lists reconcile exactly (requirements §6.11 / AC-16).
import type { DbClient } from '@commonapp/dbkit'
import type { Locale, Paginated } from '../../shared/domain'
import type { SessionUser } from './session'
import { managerScope } from './guard'
import { validation } from './errors'
import { localizedPair } from './serialize'
import { todayRange } from './sla'
import { isSlaAlert } from './sla'
import { loadSlaPolicyForCategory } from './sla'
import type { SlaPolicyRow, TicketRow } from './rows'

export interface TicketFilters {
  status?: string[]
  category?: number
  priority?: string
  assignee?: number
  requester?: number
  department?: number
  team?: number
  slaAlert?: boolean
  q?: string
}

export interface TicketScope {
  where: string
  params: unknown[]
}

/**
 * Role data scope + draft privacy as a reusable WHERE fragment.
 * Drafts stay visible only to their creator for every role (requirements §8).
 */
export async function ticketScopeFor(db: DbClient, user: SessionUser): Promise<TicketScope> {
  const draftGuard = `(t.status != 'draft' OR t.requester_id = ?)`
  switch (user.role) {
    case 'requester':
      return { where: `t.requester_id = ? AND ${draftGuard}`, params: [user.id, user.id] }
    case 'agent':
      return {
        where: `((t.assignee_id = ? AND t.status != 'draft') OR (t.status = 'draft' AND t.requester_id = ?))`,
        params: [user.id, user.id],
      }
    case 'manager': {
      const scope = await managerScope(db, user.id)
      const departmentList = scope.departmentIds.length > 0 ? scope.departmentIds.join(',') : '-1'
      const teamList = scope.teamIds.length > 0 ? scope.teamIds.join(',') : '-1'
      return {
        where: `(
          (t.status != 'draft' AND (t.department_id IN (${departmentList}) OR t.team_id IN (${teamList})))
          OR (t.status = 'draft' AND t.requester_id = ?)
        )`,
        params: [user.id],
      }
    }
    default:
      return { where: draftGuard, params: [user.id] }
  }
}

export interface ListQueryInput extends TicketFilters {
  page: number
  pageSize: number
  sort: string
}

export function buildTicketFilterClauses(filters: TicketFilters, baseParams: unknown[]): { where: string; params: unknown[] } {
  const clauses: string[] = []
  const params = [...baseParams]
  if (filters.status && filters.status.length > 0) {
    clauses.push(`t.status IN (${filters.status.map(() => '?').join(',')})`)
    params.push(...filters.status)
  }
  if (filters.category !== undefined) {
    clauses.push('t.category_id = ?')
    params.push(filters.category)
  }
  if (filters.priority) {
    clauses.push('t.priority = ?')
    params.push(filters.priority)
  }
  if (filters.assignee !== undefined) {
    clauses.push('t.assignee_id = ?')
    params.push(filters.assignee)
  }
  if (filters.requester !== undefined) {
    clauses.push('t.requester_id = ?')
    params.push(filters.requester)
  }
  if (filters.department !== undefined) {
    clauses.push('t.department_id = ?')
    params.push(filters.department)
  }
  if (filters.team !== undefined) {
    clauses.push('t.team_id = ?')
    params.push(filters.team)
  }
  if (filters.q) {
    const like = `%${filters.q}%`
    clauses.push('(t.subject_zh LIKE ? OR t.subject_en LIKE ? OR t.ticket_no LIKE ?)')
    params.push(like, like, like)
  }
  return { where: clauses.length > 0 ? clauses.join(' AND ') : '1 = 1', params }
}

const SORT_FIELDS: Record<string, string> = {
  updated_at: 't.updated_at',
  created_at: 't.created_at',
  submitted_at: 't.submitted_at',
  closed_at: 't.closed_at',
}

export function parseSort(raw: string | undefined): { column: string; direction: 'ASC' | 'DESC' } {
  if (!raw) return { column: 't.updated_at', direction: 'DESC' }
  const [field, direction] = raw.split(':')
  const column = SORT_FIELDS[field]
  if (!column || (direction !== 'asc' && direction !== 'desc')) {
    return { column: '', direction: 'DESC' }
  }
  return { column, direction: direction === 'asc' ? 'ASC' : 'DESC' }
}

export interface TicketListRow extends TicketRow {
  category_name_zh: string
  category_name_en: string
  sub_category_name_zh: string | null
  sub_category_name_en: string | null
  team_name_zh: string | null
  team_name_en: string | null
  department_name_zh: string | null
  department_name_en: string | null
}

const TICKET_SELECT = `SELECT t.*,
  c.name_zh AS category_name_zh, c.name_en AS category_name_en,
  sc.name_zh AS sub_category_name_zh, sc.name_en AS sub_category_name_en,
  tm.name_zh AS team_name_zh, tm.name_en AS team_name_en,
  d.name_zh AS department_name_zh, d.name_en AS department_name_en
  FROM tickets t
  JOIN categories c ON c.id = t.category_id
  LEFT JOIN subcategories sc ON sc.id = t.sub_category_id
  LEFT JOIN teams tm ON tm.id = t.team_id
  LEFT JOIN departments d ON d.id = t.department_id`

/** Query tickets in the caller scope with filters, alert predicate, sorting, paging. */
export async function queryTickets(
  db: DbClient,
  scope: TicketScope,
  filters: TicketFilters,
  sort: { column: string; direction: 'ASC' | 'DESC' },
  page: number,
  pageSize: number,
): Promise<Paginated<TicketListRow>> {
  const filter = buildTicketFilterClauses(filters, scope.params)
  const where = `(${scope.where}) AND (${filter.where})`
  const params = filter.params
  const orderBy = sort.column ? ` ORDER BY ${sort.column} ${sort.direction}, t.id DESC` : ' ORDER BY t.updated_at DESC, t.id DESC'
  let rows = await db.queryAll<TicketListRow>({
    text: `${TICKET_SELECT} WHERE ${where}${orderBy}`,
    params,
  })
  if (filters.slaAlert) {
    const now = new Date()
    const policies = new Map<number, SlaPolicyRow | null>()
    const alertRows: TicketListRow[] = []
    for (const row of rows) {
      let policy = policies.get(row.category_id)
      if (policy === undefined) {
        policy = await loadSlaPolicyForCategory(db, row.category_id)
        policies.set(row.category_id, policy)
      }
      if (isSlaAlert(row, policy, now)) alertRows.push(row)
    }
    rows = alertRows
  }
  const total = rows.length
  const start = (page - 1) * pageSize
  return {
    items: rows.slice(start, start + pageSize),
    page,
    pageSize,
    total,
  }
}

/** Count + aggregate helpers for the dashboard (drafts excluded beyond own). */
export async function dashboardSummary(db: DbClient, user: SessionUser) {
  const scope = await ticketScopeFor(db, user)
  const nonDraft = `(${scope.where}) AND t.status != 'draft'`
  const today = await todayRange(db)
  const countWhere = async (extra: string, params: unknown[] = []): Promise<number> => {
    const row = await db.queryOne<{ total: number }>({
      text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${nonDraft} ${extra ? `AND (${extra})` : ''}`,
      params: [...scope.params, ...params],
    })
    return Number(row?.total ?? 0)
  }
  const total = await countWhere('')
  const todayCreated = await countWhere('t.submitted_at >= ? AND t.submitted_at < ?', [today.start, today.end])
  const inProgress = await countWhere(`t.status = 'in_progress'`)
  const onHold = await countWhere(`t.status = 'on_hold'`)
  const closed = await countWhere(`t.status = 'closed'`)
  const alerts = await countSlaAlerts(db, user)
  return {
    kpis: { total, todayCreated, inProgress, onHold, closed },
    slaAlerts: { count: alerts },
  }
}

export async function countSlaAlerts(db: DbClient, user: SessionUser): Promise<number> {
  const scope = await ticketScopeFor(db, user)
  const rows = await db.queryAll<TicketRow>({
    text: `SELECT t.* FROM tickets t WHERE (${scope.where}) AND t.status IN ('pending_assign','assigned','in_progress')`,
    params: scope.params,
  })
  const now = new Date()
  const policies = new Map<number, SlaPolicyRow | null>()
  let count = 0
  for (const row of rows) {
    let policy = policies.get(row.category_id)
    if (policy === undefined) {
      policy = await loadSlaPolicyForCategory(db, row.category_id)
      policies.set(row.category_id, policy)
    }
    if (isSlaAlert(row, policy, now)) count += 1
  }
  return count
}

export type { Locale }

const PRIORITY_LABELS: Record<string, { zh: string; en: string }> = {
  low: { zh: '低', en: 'Low' },
  medium: { zh: '中', en: 'Medium' },
  high: { zh: '高', en: 'High' },
  urgent: { zh: '紧急', en: 'Urgent' },
}

export interface BreakdownItem {
  key: string
  labelZh: string
  labelEn: string
  count: number
}

/** Grouped counts for the dashboard chart; same role scope, drafts excluded (§8). */
export async function dashboardBreakdown(
  db: DbClient,
  user: SessionUser,
  dimension: string | undefined,
  locale: Locale,
): Promise<BreakdownItem[]> {
  if (dimension !== 'category' && dimension !== 'priority' && dimension !== 'department') {
    throw validation(locale === 'zh' ? '维度不合法' : 'Invalid dimension', ['dimension'])
  }
  const scope = await ticketScopeFor(db, user)
  const where = `(${scope.where}) AND t.status != 'draft'`
  if (dimension === 'priority') {
    const rows = await db.queryAll<{ priority: string }>({
      text: `SELECT t.priority FROM tickets t WHERE ${where}`,
      params: scope.params,
    })
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.priority, (counts.get(row.priority) ?? 0) + 1)
    return [...counts.entries()].map(([key, count]) => ({
      key,
      labelZh: PRIORITY_LABELS[key]?.zh ?? key,
      labelEn: PRIORITY_LABELS[key]?.en ?? key,
      count,
    }))
  }
  if (dimension === 'category') {
    const rows = await db.queryAll<{ id: number; name_zh: string; name_en: string }>({
      text: `SELECT t.category_id AS id, c.name_zh, c.name_en FROM tickets t
             JOIN categories c ON c.id = t.category_id WHERE ${where}`,
      params: scope.params,
    })
    const counts = new Map<number, number>()
    for (const row of rows) counts.set(row.id, (counts.get(row.id) ?? 0) + 1)
    return [...counts.entries()].map(([id, count]) => {
      const row = rows.find((r) => r.id === id)
      const pair = localizedPair(locale, row?.name_zh, row?.name_en)
      return { key: String(id), labelZh: pair.nameZh, labelEn: pair.nameEn, count }
    })
  }
  const rows = await db.queryAll<{ id: number | null; name_zh: string | null; name_en: string | null }>({
    text: `SELECT t.department_id AS id, d.name_zh, d.name_en FROM tickets t
           LEFT JOIN departments d ON d.id = t.department_id WHERE ${where}`,
    params: scope.params,
  })
  const counts = new Map<number | null, number>()
  for (const row of rows) counts.set(row.id, (counts.get(row.id) ?? 0) + 1)
  return [...counts.entries()].map(([id, count]) => {
    if (id === null) {
      return {
        key: 'none',
        labelZh: locale === 'zh' ? '未分配部门' : 'No department',
        labelEn: locale === 'zh' ? '未分配部门' : 'No department',
        count,
      }
    }
    const row = rows.find((r) => r.id === id)
    const pair = localizedPair(locale, row?.name_zh, row?.name_en)
    return { key: String(id), labelZh: pair.nameZh, labelEn: pair.nameEn, count }
  })
}
