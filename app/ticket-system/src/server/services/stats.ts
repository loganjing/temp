import type { DbClient } from '@commonapp/dbkit'
import { forbidden } from '../api-error'
import type { DashboardResponse, DistributionDimension, DistributionResponse, Role, TicketStatus } from '../../shared/tickets'
import type { Actor } from './actor'

type StatusRow = { status: TicketStatus; count: number }

export function createStatsService(db: DbClient) {
  const companyFilter = (actor: Actor, companyId: number | null): { where: string; params: unknown[] } => {
    if (actor.role === 'ops') {
      if (companyId != null) return { where: ' WHERE t.company_id = ?', params: [companyId] }
      return { where: '', params: [] }
    }
    return { where: ' WHERE t.company_id = ?', params: [actor.companyId] }
  }

  // 分布统计（契约 8.1）：company 按公司计数，department 按提交人部门计数（NULL → 未填写）。
  const distribution = async (actor: Actor, dimension: DistributionDimension, companyId: number | null): Promise<DistributionResponse> => {
    assertStatsScope(actor, companyId)
    const filter = companyFilter(actor, companyId)
    if (dimension === 'company') {
      const rows = await db.queryAll<{ key: number; label: string; count: number }>({
        text: `SELECT t.company_id AS key, c.name AS label, COUNT(*) AS count FROM tickets t JOIN companies c ON c.id = t.company_id${filter.where} GROUP BY t.company_id ORDER BY count DESC, t.company_id ASC`,
        params: filter.params,
      })
      return { dimension, items: rows }
    }
    const rows = await db.queryAll<{ key: string; label: string; count: number }>({
      text: `SELECT COALESCE(t.submitter_department, '未填写') AS key, COALESCE(t.submitter_department, '未填写') AS label, COUNT(*) AS count FROM tickets t${filter.where} GROUP BY COALESCE(t.submitter_department, '未填写') ORDER BY count DESC, key ASC`,
      params: filter.params,
    })
    return { dimension, items: rows }
  }

  // 仪表盘（契约 8.2）：工单量、平均响应时间（创建 → 首条回复，分钟）、满意度、热点分类。
  const dashboard = async (actor: Actor, companyId: number | null): Promise<DashboardResponse> => {
    assertStatsScope(actor, companyId)
    const filter = companyFilter(actor, companyId)
    const [statusRows, totalRow, responseRow, satisfactionRow, completedRow, hotRows] = await Promise.all([
      db.queryAll<StatusRow>({ text: `SELECT t.status, COUNT(*) AS count FROM tickets t${filter.where} GROUP BY t.status`, params: filter.params }),
      db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t${filter.where}`, params: filter.params }),
      db.queryOne<{ average: number | null }>({
        text: `SELECT AVG((strftime('%s', r.first_created_at) - strftime('%s', t.created_at)) / 60.0) AS average
               FROM tickets t
               JOIN (SELECT ticket_id, MIN(created_at) AS first_created_at FROM ticket_replies GROUP BY ticket_id) r ON r.ticket_id = t.id${filter.where}`,
        params: filter.params,
      }),
      db.queryOne<{ average: number | null; rated_count: number }>({
        text: `SELECT AVG(g.score) AS average, COUNT(*) AS rated_count
               FROM ticket_ratings g JOIN tickets t ON t.id = g.ticket_id${filter.where}`,
        params: filter.params,
      }),
      db.queryOne<{ completed_count: number }>({
        text: `SELECT COUNT(*) AS completed_count FROM tickets t${filter.where ? `${filter.where} AND t.status = 'completed'` : " WHERE t.status = 'completed'"}`,
        params: filter.params,
      }),
      db.queryAll<{ category: string; count: number }>({
        text: `SELECT t.category, COUNT(*) AS count FROM tickets t${filter.where} GROUP BY t.category ORDER BY count DESC, t.category ASC LIMIT 10`,
        params: filter.params,
      }),
    ])
    const byStatus = { created: 0, pending_assignment: 0, in_progress: 0, completed: 0, cancelled: 0 }
    for (const row of statusRows) byStatus[row.status] = row.count
    return {
      ticket_volume: { total: totalRow?.total ?? 0, by_status: byStatus },
      avg_response_time_minutes:
        responseRow?.average != null ? Math.round(responseRow.average * 10) / 10 : null,
      satisfaction: {
        average: satisfactionRow?.average != null ? Math.round(satisfactionRow.average * 10) / 10 : null,
        rated_count: satisfactionRow?.rated_count ?? 0,
        completed_count: completedRow?.completed_count ?? 0,
      },
      hot_categories: hotRows,
    }
  }

  return { distribution, dashboard }
}

// 统计权限（契约 8 节）：ops（全量或过滤）；handler 本公司（传入须等于本公司，否则 403）；
// submitter → 403。
const assertStatsScope = (actor: { role: Role; companyId: number }, companyId: number | null): void => {
  if (actor.role === 'ops') return
  if (actor.role === 'handler') {
    if (companyId != null && companyId !== actor.companyId) throw forbidden('无权查看其他公司的统计数据')
    return
  }
  throw forbidden('无权查看统计数据')
}

export type StatsService = ReturnType<typeof createStatsService>
