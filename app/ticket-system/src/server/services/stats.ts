import type { DbClient } from '@commonapp/dbkit'

export type Dashboard = {
  volume: number
  avgResponseMinutes: number | null
  satisfaction: { average: number | null; ratedCount: number }
  hotCategories: Array<{ categoryId: number; categoryName: string; count: number }>
  byCompany: Array<{ companyId: number; companyName: string; count: number }>
  byDepartment: Array<{ companyId: number; companyName: string; department: string; count: number }>
}

const round2 = (value: number | null): number | null => (value === null ? null : Math.round(value * 100) / 100)

// 统计口径（技术契约 §6）：过滤作用于全部指标与分布；部门口径为提交人所属部门。
export async function getDashboard(db: DbClient, filter: { companyId?: number; department?: string }): Promise<Dashboard> {
  const conditions: string[] = []
  const params: unknown[] = []
  if (filter.companyId !== undefined) {
    conditions.push('t.company_id = ?')
    params.push(filter.companyId)
  }
  if (filter.department !== undefined) {
    conditions.push('u.department = ?')
    params.push(filter.department)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const base = 'FROM tickets t JOIN users u ON u.id = t.submitter_id'

  const volumeRow = await db.queryOne<{ count: number }>({ text: `SELECT COUNT(*) AS count ${base} ${where}`, params })
  const responseRow = await db.queryOne<{ average: number | null }>({
    text: `SELECT AVG(CASE WHEN t.first_reply_at IS NOT NULL THEN (julianday(t.first_reply_at) - julianday(t.created_at)) * 1440 END) AS average ${base} ${where}`,
    params,
  })
  const satisfactionRow = await db.queryOne<{ average: number | null; ratedCount: number }>({
    text: `SELECT AVG(r.rating) AS average, COUNT(r.rating) AS ratedCount
      FROM tickets t JOIN users u ON u.id = t.submitter_id JOIN ticket_ratings r ON r.ticket_id = t.id ${where}`,
    params,
  })
  const hotCategories = await db.queryAll<{ categoryId: number; categoryName: string; count: number }>({
    text: `SELECT t.category_id AS categoryId, c.name AS categoryName, COUNT(*) AS count
      ${base} JOIN categories c ON c.id = t.category_id ${where}
      GROUP BY t.category_id, c.name
      ORDER BY count DESC, c.name ASC
      LIMIT 5`,
    params,
  })
  const byCompany = await db.queryAll<{ companyId: number; companyName: string; count: number }>({
    text: `SELECT t.company_id AS companyId, co.name AS companyName, COUNT(*) AS count
      ${base} JOIN companies co ON co.id = t.company_id ${where}
      GROUP BY t.company_id, co.name
      ORDER BY count DESC, co.name ASC`,
    params,
  })
  const byDepartment = await db.queryAll<{ companyId: number; companyName: string; department: string; count: number }>({
    text: `SELECT t.company_id AS companyId, co.name AS companyName, u.department AS department, COUNT(*) AS count
      ${base} JOIN companies co ON co.id = t.company_id ${where}
      GROUP BY t.company_id, co.name, u.department
      ORDER BY count DESC, co.name ASC, u.department ASC`,
    params,
  })
  return {
    volume: volumeRow?.count ?? 0,
    avgResponseMinutes: round2(responseRow?.average ?? null),
    satisfaction: { average: round2(satisfactionRow?.average ?? null), ratedCount: satisfactionRow?.ratedCount ?? 0 },
    hotCategories,
    byCompany,
    byDepartment,
  }
}
