import type { DbClient } from '@commonapp/dbkit'

export async function getDistribution(
  db: DbClient,
  dimension: 'company' | 'department',
): Promise<{ label: string; total: number; pending: number; completed: number; cancelled: number }[]> {
  if (dimension === 'company') {
    const rows = await db.queryAll<{ label: string; total: number; pending: number; completed: number; cancelled: number }>({
      text: `SELECT c.name AS label,
              COUNT(*) AS total,
              SUM(CASE WHEN t.status IN ('pending_assignment', 'pending_processing') THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
             FROM tickets t
             JOIN companies c ON t.company_id = c.id
             GROUP BY c.name`,
    })
    return rows
  }
  const rows = await db.queryAll<{ label: string; total: number; pending: number; completed: number; cancelled: number }>({
    text: `SELECT u.department AS label,
            COUNT(*) AS total,
            SUM(CASE WHEN t.status IN ('pending_assignment', 'pending_processing') THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
           FROM tickets t
           JOIN users u ON t.submitter_id = u.id
           GROUP BY u.department`,
  })
  return rows
}

export async function getDashboard(
  db: DbClient,
  companyId?: string,
): Promise<{
  totalTickets: number
  pendingTickets: number
  completedTickets: number
  cancelledTickets: number
  avgResponseTimeHours: number
  satisfactionScore: number
  hotCategories: { category: string; count: number }[]
}> {
  const companyFilter = companyId ? 'WHERE company_id = ?' : ''
  const params = companyId ? [companyId] : []

  const counts = await db.queryOne<{
    total: number
    pending: number
    completed: number
    cancelled: number
  }>({
    text: `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status IN ('pending_assignment', 'pending_processing') THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
           FROM tickets ${companyFilter}`,
    params,
  })

  // Avg response time: from created_at to handled_at for completed tickets (hours)
  const avgRow = await db.queryOne<{ avg_hours: number | null }>({
    text: `SELECT AVG((julianday(handled_at) - julianday(created_at)) * 24) AS avg_hours
           FROM tickets ${companyFilter ? companyFilter + " AND status = 'completed'" : "WHERE status = 'completed'"}
             AND handled_at IS NOT NULL`,
    params,
  })

  // Satisfaction score: average rating
  const satRow = await db.queryOne<{ avg_rating: number | null }>({
    text: `SELECT AVG(e.rating) AS avg_rating
           FROM ticket_evaluations e
           JOIN tickets t ON e.ticket_id = t.id
           ${companyFilter ? 'WHERE ' + (companyId ? 't.company_id = ?' : '1=1') : ''}`,
    params: companyId ? [companyId] : [],
  })

  // Hot categories: top 5
  const hotRows = await db.queryAll<{ category: string; count: number }>({
    text: `SELECT category, COUNT(*) AS count
           FROM tickets ${companyFilter}
           GROUP BY category
           ORDER BY count DESC
           LIMIT 5`,
    params,
  })

  return {
    totalTickets: counts?.total ?? 0,
    pendingTickets: counts?.pending ?? 0,
    completedTickets: counts?.completed ?? 0,
    cancelledTickets: counts?.cancelled ?? 0,
    avgResponseTimeHours: Math.round((avgRow?.avg_hours ?? 0) * 100) / 100,
    satisfactionScore: Math.round((satRow?.avg_rating ?? 0) * 100) / 100,
    hotCategories: hotRows.map((r) => ({ category: r.category, count: r.count })),
  }
}
