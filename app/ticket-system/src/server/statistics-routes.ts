import type { Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { CurrentUser } from '../shared/types'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const getUser = (c: { get(name: string): unknown }): CurrentUser => c.get('currentUser') as CurrentUser

export function registerStatisticsRoutes(app: Hono, platform: Platform) {
  const { db } = platform

  // GET /api/statistics/distribution
  app.get('/api/statistics/distribution', async (c) => {
    const user = getUser(c)
    if (!user.companyId) return c.json(errorBody('FORBIDDEN', 'No company context'), 403)
    const dimension = c.req.query('dimension') ?? 'company'

    if (dimension === 'department') {
      const rows = await db.queryAll<{
        department_id: string
        department_name: string
        total: number
        pending_assignment: number
        pending_processing: number
        completed: number
        cancelled: number
      }>({
        text: `SELECT p.department_id, d.name AS department_name,
                      COUNT(t.id) AS total,
                      SUM(CASE WHEN t.status = 'pending_assignment' THEN 1 ELSE 0 END) AS pending_assignment,
                      SUM(CASE WHEN t.status = 'pending_processing' THEN 1 ELSE 0 END) AS pending_processing,
                      SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed,
                      SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
               FROM user_profiles p
               LEFT JOIN tickets t ON t.submitter_profile_id = p.id AND t.company_id = ?
               LEFT JOIN departments d ON d.id = p.department_id
               WHERE p.company_id = ? AND p.department_id IS NOT NULL
               GROUP BY p.department_id
               ORDER BY total DESC`,
        params: [user.companyId, user.companyId],
      })

      return c.json(
        rows.map((r) => ({
          dimensionKey: r.department_id,
          dimensionName: r.department_name,
          total: Number(r.total),
          pendingAssignment: Number(r.pending_assignment),
          pendingProcessing: Number(r.pending_processing),
          completed: Number(r.completed),
          cancelled: Number(r.cancelled),
        })),
      )
    }

    // dimension = company (default)
    const rows = await db.queryAll<{
      company_id: string
      company_name: string
      total: number
      pending_assignment: number
      pending_processing: number
      completed: number
      cancelled: number
    }>({
      text: `SELECT t.company_id, c.name AS company_name,
                    COUNT(t.id) AS total,
                    SUM(CASE WHEN t.status = 'pending_assignment' THEN 1 ELSE 0 END) AS pending_assignment,
                    SUM(CASE WHEN t.status = 'pending_processing' THEN 1 ELSE 0 END) AS pending_processing,
                    SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed,
                    SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
             FROM tickets t
             LEFT JOIN companies c ON c.id = t.company_id
             WHERE t.company_id = ?
             GROUP BY t.company_id`,
      params: [user.companyId],
    })

    return c.json(
      rows.map((r) => ({
        dimensionKey: r.company_id,
        dimensionName: r.company_name,
        total: Number(r.total),
        pendingAssignment: Number(r.pending_assignment),
        pendingProcessing: Number(r.pending_processing),
        completed: Number(r.completed),
        cancelled: Number(r.cancelled),
      })),
    )
  })

  // GET /api/statistics/dashboard
  app.get('/api/statistics/dashboard', async (c) => {
    const user = getUser(c)
    if (!user.companyId) return c.json(errorBody('FORBIDDEN', 'No company context'), 403)

    const totals = await db.queryOne<{
      total: number
      pending_assignment: number
      pending_processing: number
      completed: number
      cancelled: number
    }>({
      text: `SELECT COUNT(*) AS total,
                    SUM(CASE WHEN status = 'pending_assignment' THEN 1 ELSE 0 END) AS pending_assignment,
                    SUM(CASE WHEN status = 'pending_processing' THEN 1 ELSE 0 END) AS pending_processing,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
             FROM tickets WHERE company_id = ?`,
      params: [user.companyId],
    })

    const avgResponse = await db.queryOne<{ avg_minutes: number | null }>({
      text: `SELECT AVG((julianday(completed_at) - julianday(created_at)) * 24 * 60) AS avg_minutes
             FROM tickets WHERE company_id = ? AND completed_at IS NOT NULL`,
      params: [user.companyId],
    })

    const avgSatisfaction = await db.queryOne<{ avg_score: number | null }>({
      text: `SELECT AVG(e.satisfaction_score) AS avg_score
             FROM ticket_evaluations e
             JOIN tickets t ON t.id = e.ticket_id
             WHERE t.company_id = ?`,
      params: [user.companyId],
    })

    const hotCategories = await db.queryAll<{ category: string; count: number }>({
      text: `SELECT category, COUNT(*) AS count
             FROM tickets WHERE company_id = ?
             GROUP BY category ORDER BY count DESC LIMIT 5`,
      params: [user.companyId],
    })

    return c.json({
      totalTickets: Number(totals?.total ?? 0),
      pendingTickets: Number((totals?.pending_assignment ?? 0) + (totals?.pending_processing ?? 0)),
      completedTickets: Number(totals?.completed ?? 0),
      cancelledTickets: Number(totals?.cancelled ?? 0),
      avgResponseTimeMinutes: avgResponse?.avg_minutes ? Math.round(Number(avgResponse.avg_minutes) * 10) / 10 : 0,
      avgSatisfactionScore: avgSatisfaction?.avg_score ? Math.round(Number(avgSatisfaction.avg_score) * 10) / 10 : 0,
      hotCategories: hotCategories.map((r) => ({ category: r.category, count: Number(r.count) })),
    })
  })
}
