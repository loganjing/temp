import type { DbClient } from '@commonapp/dbkit'
import type { StatsDimension, StatsDistribution, StatsOverview } from '../../shared/ticket-contracts'
import { STATS_DIMENSIONS } from '../../shared/ticket-contracts'
import { forbidden, validationFailed } from '../errors'
import type { Identity } from './identity'

const DEFAULT_RANGE_DAYS = 30
const roundOne = (value: number) => Math.round(value * 10) / 10

type Scope = { platform: boolean; companyId: string | null }

type AggregateRow = { total: number; cancelled: number; avg_minutes: number | null }
type SatisfactionRow = { average: number | null; count: number }
type HotCategoryRow = { category_id: string; name: string; count: number }
type DistributionRow = { key: string; label: string; count: number }

export function createStatsService(db: DbClient) {
  function resolveScope(identity: Identity, companyId?: string): Scope {
    if (identity.isPlatformStats) {
      return { platform: true, companyId: companyId?.trim() || null }
    }
    if (identity.isCompanyAdmin) {
      if (companyId && companyId !== identity.companyId) throw forbidden('只能查看本公司的统计数据')
      return { platform: false, companyId: identity.companyId }
    }
    throw forbidden('仅公司管理员或平台统计角色可查看统计')
  }

  function resolveRange(from?: string, to?: string): { from: string; to: string } {
    const now = new Date()
    const parse = (value: string | undefined, fallback: Date, field: string) => {
      if (!value) return fallback
      const parsed = new Date(value)
      if (Number.isNaN(parsed.getTime())) throw validationFailed('提交内容有误，请检查后重试', { [field]: '时间格式不正确' })
      return parsed
    }
    const fromDate = parse(from, new Date(now.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000), 'from')
    const toDate = parse(to, now, 'to')
    if (fromDate.getTime() > toDate.getTime()) throw validationFailed('提交内容有误，请检查后重试', { from: '开始时间不能晚于结束时间' })
    return { from: fromDate.toISOString(), to: toDate.toISOString() }
  }

  function scopeSql(scope: Scope, range: { from: string; to: string }) {
    const clauses = ['t.created_at >= ?', 't.created_at <= ?']
    const params: unknown[] = [range.from, range.to]
    if (scope.companyId) {
      clauses.push('t.company_id = ?')
      params.push(scope.companyId)
    }
    return { where: clauses.join(' AND '), params }
  }

  async function overview(identity: Identity, query: { from?: string; to?: string; companyId?: string }): Promise<StatsOverview> {
    const scope = resolveScope(identity, query.companyId)
    const range = resolveRange(query.from, query.to)
    const { where, params } = scopeSql(scope, range)

    const aggregate = await db.queryOne<AggregateRow>({
      text: `SELECT COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled,
                    AVG(CASE WHEN t.first_reply_at IS NOT NULL
                             THEN (julianday(t.first_reply_at) - julianday(t.created_at)) * 24 * 60 END) AS avg_minutes
             FROM tickets t WHERE ${where}`,
      params,
    })
    const satisfaction = await db.queryOne<SatisfactionRow>({
      text: `SELECT AVG(r.score) AS average, COUNT(*) AS count
             FROM ticket_ratings r
             JOIN tickets t ON t.id = r.ticket_id
             WHERE ${where} AND t.status = 'completed'`,
      params,
    })
    const hotCategories = await db.queryAll<HotCategoryRow>({
      text: `SELECT t.category_id, c.name, COUNT(*) AS count
             FROM tickets t
             JOIN ticket_categories c ON c.id = t.category_id
             WHERE ${where}
             GROUP BY t.category_id, c.name
             ORDER BY count DESC, c.name, t.category_id
             LIMIT 5`,
      params,
    })

    const average = aggregate?.avg_minutes === null || aggregate?.avg_minutes === undefined
      ? null
      : roundOne(Number(aggregate.avg_minutes))
    return {
      range,
      volume: Number(aggregate?.total ?? 0),
      cancelledCount: Number(aggregate?.cancelled ?? 0),
      avgFirstResponseMinutes: average,
      satisfaction: {
        average: satisfaction?.average === null || satisfaction?.average === undefined ? null : roundOne(Number(satisfaction.average)),
        count: Number(satisfaction?.count ?? 0),
      },
      hotCategories: hotCategories.map((row) => ({ categoryId: row.category_id, name: row.name, count: Number(row.count) })),
    }
  }

  async function distribution(
    identity: Identity,
    query: { dimension: string; from?: string; to?: string; companyId?: string },
  ): Promise<StatsDistribution> {
    if (!(STATS_DIMENSIONS as readonly string[]).includes(query.dimension)) {
      throw validationFailed('提交内容有误，请检查后重试', { dimension: '统计维度只能是 company 或 department' })
    }
    const dimension = query.dimension as StatsDimension
    const scope = resolveScope(identity, query.companyId)
    const range = resolveRange(query.from, query.to)
    const { where, params } = scopeSql(scope, range)

    const rows = dimension === 'company'
      ? await db.queryAll<DistributionRow>({
          text: `SELECT t.company_id AS key, co.name AS label, COUNT(*) AS count
                 FROM tickets t
                 JOIN companies co ON co.id = t.company_id
                 WHERE ${where}
                 GROUP BY t.company_id, co.name
                 ORDER BY count DESC, label, t.company_id`,
          params,
        })
      : await db.queryAll<DistributionRow>({
          text: `SELECT COALESCE(p.department, '未分配') AS key, COALESCE(p.department, '未分配') AS label, COUNT(*) AS count
                 FROM tickets t
                 LEFT JOIN user_profiles p ON p.user_id = t.submitter_id
                 WHERE ${where}
                 GROUP BY COALESCE(p.department, '未分配')
                 ORDER BY count DESC, label`,
          params,
        })
    const groups = rows.map((row) => ({ key: row.key, label: row.label, count: Number(row.count) }))
    return {
      dimension,
      total: groups.reduce((sum, group) => sum + group.count, 0),
      groups,
    }
  }

  return { overview, distribution }
}

export type StatsService = ReturnType<typeof createStatsService>
