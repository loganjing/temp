import type { DbClient } from '@commonapp/dbkit'
import type {
  DistributionItemDTO,
  DashboardDTO,
} from '../../shared/types'

export function createStatisticsService(db: DbClient) {
  async function getDistribution(companyId: string, dimension: 'company' | 'department'): Promise<DistributionItemDTO[]> {
    if (dimension === 'department') {
      const rows = await db.queryAll<{ dimension_key: string; dimension_name: string; total: number; pending_process: number; completed: number; cancelled: number }>({
        text: `SELECT d.id AS dimension_key, d.name AS dimension_name,
                 COUNT(t.id) AS total,
                 SUM(CASE WHEN t.status = 'pending_process' THEN 1 ELSE 0 END) AS pending_process,
                 SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed,
                 SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
               FROM departments d
               LEFT JOIN tickets t ON t.company_id = d.company_id
                 AND t.submitter_user_id IN (SELECT up.user_id FROM user_profiles up WHERE up.department_id = d.id)
               WHERE d.company_id = ?
               GROUP BY d.id, d.name
               ORDER BY total DESC`,
        params: [companyId],
      })
      return rows.map((r) => ({
        dimensionKey: r.dimension_key, dimensionName: r.dimension_name,
        total: Number(r.total), pendingProcess: Number(r.pending_process),
        completed: Number(r.completed), cancelled: Number(r.cancelled),
      }))
    }

    // dimension = company
    const rows = await db.queryAll<{ dimension_key: string; dimension_name: string; total: number; pending_process: number; completed: number; cancelled: number }>({
      text: `SELECT c.id AS dimension_key, c.name AS dimension_name,
               COUNT(t.id) AS total,
               SUM(CASE WHEN t.status = 'pending_process' THEN 1 ELSE 0 END) AS pending_process,
               SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed,
               SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
             FROM companies c
             LEFT JOIN tickets t ON t.company_id = c.id
             WHERE c.id = ?
             GROUP BY c.id, c.name
             ORDER BY total DESC`,
      params: [companyId],
    })
    return rows.map((r) => ({
      dimensionKey: r.dimension_key, dimensionName: r.dimension_name,
      total: Number(r.total), pendingProcess: Number(r.pending_process),
      completed: Number(r.completed), cancelled: Number(r.cancelled),
    }))
  }

  async function getDashboard(companyId: string): Promise<DashboardDTO> {
    const ticketCount = await db.queryOne<{
      total: number; created: number; pending_assign: number; pending_process: number; completed: number; cancelled: number
    }>({
      text: `SELECT
               COUNT(*) AS total,
               SUM(CASE WHEN status = 'created' THEN 1 ELSE 0 END) AS created,
               SUM(CASE WHEN status = 'pending_assign' THEN 1 ELSE 0 END) AS pending_assign,
               SUM(CASE WHEN status = 'pending_process' THEN 1 ELSE 0 END) AS pending_process,
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
               SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
             FROM tickets WHERE company_id = ?`,
      params: [companyId],
    })

    const avgResponse = await db.queryOne<{ avg_ms: number | null }>({
      text: `SELECT AVG(processed_at - created_at) AS avg_ms
             FROM tickets WHERE company_id = ? AND status = 'completed' AND processed_at IS NOT NULL`,
      params: [companyId],
    })

    const satisfaction = await db.queryOne<{ average: number | null; count: number }>({
      text: `SELECT AVG(e.rating) AS average, COUNT(*) AS count
             FROM ticket_evaluations e
             JOIN tickets t ON t.id = e.ticket_id
             WHERE t.company_id = ?`,
      params: [companyId],
    })

    const hotCategories = await db.queryAll<{ category: string; count: number }>({
      text: `SELECT category, COUNT(*) AS count
             FROM tickets WHERE company_id = ?
             GROUP BY category ORDER BY count DESC LIMIT 10`,
      params: [companyId],
    })

    return {
      ticketCount: {
        total: Number(ticketCount?.total ?? 0),
        created: Number(ticketCount?.created ?? 0),
        pendingAssign: Number(ticketCount?.pending_assign ?? 0),
        pendingProcess: Number(ticketCount?.pending_process ?? 0),
        completed: Number(ticketCount?.completed ?? 0),
        cancelled: Number(ticketCount?.cancelled ?? 0),
      },
      avgResponseTimeMs: Math.round(Number(avgResponse?.avg_ms ?? 0)) || 0,
      satisfaction: {
        average: Math.round(Number(satisfaction?.average ?? 0) * 100) / 100 || 0,
        count: Number(satisfaction?.count ?? 0),
      },
      hotCategories: hotCategories.map((r) => ({ category: r.category, count: Number(r.count) })),
    }
  }

  return { getDistribution, getDashboard }
}
