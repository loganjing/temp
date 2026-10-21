import type { DbClient } from '@commonapp/dbkit'

export interface DistributionRow {
  key: string
  label: string
  count: number
}

export async function distribution(
  db: DbClient,
  companyId: number,
  dimension: 'company' | 'department',
): Promise<{ dimension: string; rows: DistributionRow[] }> {
  let rows: DistributionRow[]
  if (dimension === 'department') {
    rows = await db.queryAll<DistributionRow>({
      text: `SELECT COALESCE(u.department, '') AS key, COALESCE(u.department, '未设置') AS label, COUNT(*) AS count
             FROM tickets t JOIN users u ON u.id = t.submitter_id
             WHERE t.company_id = ?
             GROUP BY COALESCE(u.department, '')
             ORDER BY count DESC, key ASC`,
      params: [companyId],
    })
  } else {
    rows = await db.queryAll<DistributionRow>({
      text: `SELECT CAST(t.company_id AS TEXT) AS key, c.name AS label, COUNT(*) AS count
             FROM tickets t JOIN companies c ON c.id = t.company_id
             WHERE t.company_id = ?
             GROUP BY t.company_id, c.name
             ORDER BY count DESC`,
      params: [companyId],
    })
  }
  return { dimension, rows }
}

export interface Dashboard {
  ticketCount: number
  avgResponseMinutes: number | null
  satisfaction: number | null
  topCategories: { category: string; count: number }[]
}

export async function dashboard(db: DbClient, companyId: number): Promise<Dashboard> {
  const countRow = await db.queryOne<{ total: number }>({
    text: 'SELECT COUNT(*) AS total FROM tickets WHERE company_id = ?',
    params: [companyId],
  })
  const responseRow = await db.queryOne<{ avg_min: number | null }>({
    text: `SELECT AVG((julianday(r.earliest) - julianday(t.created_at)) * 24 * 60) AS avg_min
           FROM tickets t
           JOIN (
             SELECT r.ticket_id, MIN(r.created_at) AS earliest
             FROM replies r
             JOIN tickets tt ON tt.id = r.ticket_id
             WHERE r.author_id <> tt.submitter_id AND tt.company_id = ?
             GROUP BY r.ticket_id
           ) r ON r.ticket_id = t.id
           WHERE t.company_id = ?`,
    params: [companyId, companyId],
  })
  const satisfactionRow = await db.queryOne<{ avg_score: number | null }>({
    text: `SELECT AVG(r.score) AS avg_score
           FROM ratings r
           JOIN tickets t ON t.id = r.ticket_id
           WHERE t.company_id = ? AND t.status = 'completed'`,
    params: [companyId],
  })
  const topRows = await db.queryAll<{ category: string; count: number }>({
    text: `SELECT category, COUNT(*) AS count
           FROM tickets
           WHERE company_id = ?
           GROUP BY category
           ORDER BY count DESC, category ASC
           LIMIT 10`,
    params: [companyId],
  })
  return {
    ticketCount: Number(countRow?.total ?? 0),
    avgResponseMinutes: responseRow?.avg_min != null ? Number(responseRow.avg_min) : null,
    satisfaction: satisfactionRow?.avg_score != null ? Number(satisfactionRow.avg_score) : null,
    topCategories: topRows.map((r) => ({ category: r.category, count: r.count })),
  }
}
