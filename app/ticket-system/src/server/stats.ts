import type { DbClient } from '@commonapp/dbkit'
import { validation } from './http'
import { TICKET_STATUSES } from './tickets'

// stats：公司/部门维度分布与运营仪表盘指标聚合（公司隔离范围内）。
export type Dashboard = {
  totalTickets: number
  statusBreakdown: Record<string, number>
  avgResponseMinutes: number | null
  avgRating: number | null
  ratedCount: number
  hotCategories: { category: string; count: number }[]
}

export type Distribution = {
  dimension: 'department' | 'company'
  items: { label: string; count: number }[]
}

export async function getDashboard(db: DbClient, companyId: number): Promise<Dashboard> {
  const total = await db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM tickets WHERE company_id = ?', params: [companyId] })
  const statusRows = await db.queryAll<{ status: string; total: number }>({
    text: 'SELECT status, COUNT(*) AS total FROM tickets WHERE company_id = ? GROUP BY status',
    params: [companyId],
  })
  const statusBreakdown: Record<string, number> = {}
  for (const status of TICKET_STATUSES) statusBreakdown[status] = 0
  for (const row of statusRows) statusBreakdown[row.status] = Number(row.total)
  // 平均响应时间：创建 → 首次回复的平均分钟数（无回复工单不计入；保留 1 位小数）。
  const responseRow = await db.queryOne<{ value: number | null }>({
    text: `SELECT ROUND(AVG((julianday(first_reply_at) - julianday(created_at)) * 1440), 1) AS value
           FROM tickets WHERE company_id = ? AND first_reply_at IS NOT NULL`,
    params: [companyId],
  })
  const ratingRow = await db.queryAll<{ score: number }>({ text: 'SELECT score FROM ratings WHERE company_id = ?', params: [companyId] })
  const ratedCount = ratingRow.length
  const avgRating = ratedCount > 0 ? Number((ratingRow.reduce((sum, row) => sum + Number(row.score), 0) / ratedCount).toFixed(2)) : null
  const hotRows = await db.queryAll<{ category: string; total: number }>({
    text: 'SELECT category, COUNT(*) AS total FROM tickets WHERE company_id = ? GROUP BY category ORDER BY total DESC, category ASC LIMIT 10',
    params: [companyId],
  })
  return {
    totalTickets: Number(total?.total ?? 0),
    statusBreakdown,
    avgResponseMinutes: responseRow?.value === null || responseRow?.value === undefined ? null : Number(responseRow.value),
    avgRating,
    ratedCount,
    hotCategories: hotRows.map((row) => ({ category: row.category, count: Number(row.total) })),
  }
}

export async function getDistribution(db: DbClient, companyId: number, dimension: string): Promise<Distribution> {
  if (dimension !== 'department' && dimension !== 'company') throw validation('dimension must be department or company')
  if (dimension === 'company') {
    // 公司维度在公司隔离范围内聚合：登录用户视角为本公司单行聚合，label 为公司名。
    const row = await db.queryOne<{ label: string; total: number }>({
      text: `SELECT c.name AS label, COUNT(t.id) AS total FROM companies c LEFT JOIN tickets t ON t.company_id = c.id WHERE c.id = ? GROUP BY c.id`,
      params: [companyId],
    })
    return { dimension, items: row ? [{ label: row.label, count: Number(row.total) }] : [] }
  }
  // 部门维度按提交人部门快照聚合，空部门归入「未填写」。
  const rows = await db.queryAll<{ label: string; total: number }>({
    text: `SELECT COALESCE(NULLIF(t.submitter_department, ''), '未填写') AS label, COUNT(*) AS total
           FROM tickets t WHERE t.company_id = ? GROUP BY label ORDER BY total DESC, label ASC`,
    params: [companyId],
  })
  return { dimension, items: rows.map((row) => ({ label: row.label, count: Number(row.total) })) }
}
