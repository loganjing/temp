import type { DbClient } from '@commonapp/dbkit'
import type { CurrentUser } from '../platform/auth'
import { ApiError, forbidden } from '../errors'
import { isStatsDimension } from '../../shared/contracts'
import type { DashboardResponse, DistributionResponse, StatsDimension } from '../../shared/contracts'

export interface StatsQuery {
  company?: string
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10
}

/** 统计域：只读聚合（公司/部门分布 + 仪表盘四类指标，契约 §7）。 */
export function createStatsService(db: DbClient) {
  function requireHandlerOrAdmin(user: CurrentUser) {
    if (user.role !== 'handler' && user.role !== 'admin') throw forbidden()
  }

  async function distribution(user: CurrentUser, dimension: unknown, query: StatsQuery): Promise<DistributionResponse> {
    requireHandlerOrAdmin(user)
    if (!isStatsDimension(dimension)) throw new ApiError(400, 'invalid_dimension')
    const companyFilter = query.company ? 'WHERE t.company_id = ?' : ''
    const params = query.company ? [query.company] : []
    if (dimension === 'company') {
      const rows = await db.queryAll<{ key: string; company_id: string; count: number }>({
        text: `SELECT c.name AS key, t.company_id AS company_id, COUNT(*) AS count
               FROM tickets t
               JOIN companies c ON c.id = t.company_id
               ${companyFilter}
               GROUP BY t.company_id, c.name
               ORDER BY count DESC, c.name ASC`,
        params,
      })
      return {
        dimension,
        items: rows.map((row) => ({ key: row.key, companyId: row.company_id, count: Number(row.count) })),
      }
    }
    const rows = await db.queryAll<{ key: string | null; count: number }>({
      text: `SELECT up.department AS key, COUNT(*) AS count
             FROM tickets t
             LEFT JOIN user_profiles up ON up.user_id = t.submitter_id
             ${companyFilter}
             GROUP BY up.department
             ORDER BY count DESC, key ASC`,
      params,
    })
    return {
      dimension,
      items: rows.map((row) => ({ key: row.key ?? null, count: Number(row.count) })),
    }
  }

  async function dashboard(user: CurrentUser, query: StatsQuery): Promise<DashboardResponse> {
    requireHandlerOrAdmin(user)
    const companyFilter = query.company ? 'WHERE t.company_id = ?' : ''
    const params = query.company ? [query.company] : []
    const totalRow = await db.queryOne<{ total: number }>({
      text: `SELECT COUNT(*) AS total FROM tickets t ${companyFilter}`,
      params,
    })
    const responseRow = await db.queryOne<{ minutes: number | null }>({
      text: `SELECT AVG((julianday(t.first_reply_at) - julianday(t.created_at)) * 1440.0) AS minutes
             FROM tickets t
             ${query.company ? 'WHERE t.company_id = ? AND t.first_reply_at IS NOT NULL' : 'WHERE t.first_reply_at IS NOT NULL'}`,
      params,
    })
    const satisfactionRow = await db.queryOne<{ avgScore: number | null; ratedCount: number }>({
      text: `SELECT AVG(r.score) AS avgScore, COUNT(*) AS ratedCount
             FROM ratings r
             JOIN tickets t ON t.id = r.ticket_id
             ${companyFilter}`,
      params,
    })
    const hotRows = await db.queryAll<{ category: string; count: number }>({
      text: `SELECT t.category AS category, COUNT(*) AS count
             FROM tickets t
             ${companyFilter}
             GROUP BY t.category
             ORDER BY count DESC, t.category ASC
             LIMIT 5`,
      params,
    })
    return {
      totalTickets: Number(totalRow?.total ?? 0),
      avgResponseMinutes:
        responseRow?.minutes == null ? null : roundTo1(Number(responseRow.minutes)),
      satisfaction: {
        avgScore: satisfactionRow?.avgScore == null ? null : roundTo1(Number(satisfactionRow.avgScore)),
        ratedCount: Number(satisfactionRow?.ratedCount ?? 0),
      },
      hotCategories: hotRows.map((row) => ({ category: row.category, count: Number(row.count) })),
    }
  }

  return { distribution, dashboard }
}

export type StatsService = ReturnType<typeof createStatsService>
