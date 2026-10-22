import type { DashboardStatsDTO, DistributionDTO, CategoryStatDTO, UserRole } from '../../shared/types'
import { type ServiceContext } from './context'

export function createStatsService(ctx: ServiceContext) {
  const { db } = ctx

  return {
    async getDashboardStats(companyId: string, startDate: string, endDate: string): Promise<DashboardStatsDTO> {
      const [counts, responseTime, satisfaction, hotCats] = await Promise.all([
        db.queryOne<{ total: number; pending: number; completed: number }>({
          text: `SELECT
                   COUNT(*) AS total,
                   SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
                   SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
                 FROM tickets WHERE company_id = ? AND created_at >= ? AND created_at <= ?`,
          params: [companyId, startDate, endDate],
        }),
        db.queryOne<{ avg_seconds: number | null }>({
          text: `SELECT AVG((julianday(first_reply.created_at) - julianday(t.created_at)) * 86400) AS avg_seconds
                 FROM tickets t
                 JOIN (
                   SELECT ticket_id, MIN(created_at) AS created_at
                   FROM ticket_replies GROUP BY ticket_id
                 ) first_reply ON first_reply.ticket_id = t.id
                 WHERE t.company_id = ? AND t.created_at >= ? AND t.created_at <= ?`,
          params: [companyId, startDate, endDate],
        }),
        db.queryOne<{ avg_rating: number | null }>({
          text: `SELECT AVG(e.rating) AS avg_rating
                 FROM ticket_evaluations e
                 JOIN tickets t ON e.ticket_id = t.id
                 WHERE t.company_id = ? AND t.created_at >= ? AND t.created_at <= ?`,
          params: [companyId, startDate, endDate],
        }),
        db.queryAll<{ category_id: string; category_name: string; ticket_count: number }>({
          text: `SELECT t.category_id, c.name AS category_name, COUNT(*) AS ticket_count
                 FROM tickets t
                 LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.company_id = ?
                 GROUP BY t.category_id, c.name
                 ORDER BY ticket_count DESC
                 LIMIT 10`,
          params: [companyId],
        }),
      ])

      return {
        totalTickets: Number(counts?.total ?? 0),
        pendingCount: Number(counts?.pending ?? 0),
        completedCount: Number(counts?.completed ?? 0),
        avgResponseTime: Math.round(Number(responseTime?.avg_seconds ?? 0)),
        satisfactionScore: Math.round(Number(satisfaction?.avg_rating ?? 0) * 10) / 10,
        hotCategories: (hotCats ?? []).map((c) => ({
          categoryId: c.category_id,
          categoryName: c.category_name ?? '',
          ticketCount: Number(c.ticket_count),
        })) as CategoryStatDTO[],
      }
    },

    async getDistribution(companyId: string, role: UserRole, dimension: string, status?: string): Promise<DistributionDTO[]> {
      const statusCondition = status ? ' AND t.status = ?' : ''
      const statusParams: unknown[] = status ? [status] : []

      if (dimension === 'company') {
        // Admin sees all companies; others see only their own
        if (role === 'admin') {
          const rows = await db.queryAll<{ label: string; count: number }>({
            text: `SELECT co.name AS label, COUNT(t.id) AS count
                   FROM tickets t
                   LEFT JOIN companies co ON t.company_id = co.id
                   WHERE 1=1${statusCondition}
                   GROUP BY t.company_id, co.name
                   ORDER BY count DESC`,
            params: statusParams,
          })
          return rows.map((r) => ({ label: r.label ?? '', count: Number(r.count) }))
        }
        // Non-admin: only own company
        const row = await db.queryOne<{ label: string; count: number }>({
          text: `SELECT co.name AS label, COUNT(t.id) AS count
                 FROM tickets t
                 LEFT JOIN companies co ON t.company_id = co.id
                 WHERE t.company_id = ?${statusCondition}
                 GROUP BY t.company_id, co.name`,
          params: [companyId, ...statusParams],
        })
        return row ? [{ label: row.label ?? '', count: Number(row.count) }] : []
      }

      // dimension === 'department'
      const rows = await db.queryAll<{ label: string; count: number }>({
        text: `SELECT u.department AS label, COUNT(t.id) AS count
               FROM tickets t
               LEFT JOIN users u ON t.submitter_id = u.id
               WHERE t.company_id = ?${statusCondition}
               GROUP BY u.department
               ORDER BY count DESC`,
        params: [companyId, ...statusParams],
      })
      return rows.map((r) => ({ label: r.label ?? '', count: Number(r.count) }))
    },
  }
}
