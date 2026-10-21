import type { DbClient } from '@commonapp/dbkit'

/** stats 模块：工单分布统计与运营仪表盘口径（契约 §7，只读聚合）。 */

export type DistributionDimension = 'company' | 'department'

export interface DistributionItem {
  key: string
  name: string
  count: number
}

export async function distributionStats(
  db: DbClient,
  dimension: DistributionDimension,
): Promise<{ dimension: string; items: DistributionItem[] }> {
  if (dimension === 'company') {
    const rows = await db.queryAll<{ company_id: number; name: string; count: number }>({
      text: `SELECT t.company_id, co.name, COUNT(*) AS count
             FROM tickets t
             JOIN companies co ON co.id = t.company_id
             GROUP BY t.company_id, co.name
             ORDER BY count DESC, co.name`,
    })
    return {
      dimension,
      items: rows.map((row) => ({ key: String(row.company_id), name: row.name, count: Number(row.count) })),
    }
  }
  const rows = await db.queryAll<{ department: string; count: number }>({
    text: `SELECT COALESCE(NULLIF(up.department, ''), '未填写') AS department, COUNT(*) AS count
           FROM tickets t
           LEFT JOIN user_profiles up ON up.user_id = t.submitter_id
           GROUP BY department
           ORDER BY count DESC, department`,
  })
  return {
    dimension,
    items: rows.map((row) => ({ key: row.department, name: row.department, count: Number(row.count) })),
  }
}

export interface DashboardStats {
  ticketVolume: { total: number; byStatus: Record<string, number> }
  avgResponseMinutes: number | null
  satisfaction: { average: number | null; ratedCount: number }
  hotCategories: { categoryId: number; name: string; count: number }[]
}

/** 平均响应时间：创建时间至首条 agent 回复的平均间隔（分钟，1 位小数）。 */
export async function dashboardStats(db: DbClient): Promise<DashboardStats> {
  const statusRows = await db.queryAll<{ status: string; count: number }>({
    text: 'SELECT status, COUNT(*) AS count FROM tickets GROUP BY status',
  })
  const byStatus: Record<string, number> = {
    created: 0,
    pending_assignment: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  }
  let total = 0
  for (const row of statusRows) {
    byStatus[row.status] = Number(row.count)
    total += Number(row.count)
  }
  const avg = await db.queryOne<{ avgMinutes: number | null }>({
    text: `SELECT ROUND(AVG((julianday(r.created_at) - julianday(t.created_at)) * 1440), 1) AS avgMinutes
           FROM tickets t
           JOIN (
             SELECT ticket_id, MIN(created_at) AS created_at
             FROM ticket_replies
             WHERE author_side = 'agent'
             GROUP BY ticket_id
           ) r ON r.ticket_id = t.id`,
  })
  const satisfaction = await db.queryOne<{ average: number | null; ratedCount: number }>({
    text: 'SELECT ROUND(AVG(rating), 2) AS average, COUNT(*) AS ratedCount FROM satisfaction_ratings',
  })
  const hotRows = await db.queryAll<{ categoryId: number; name: string; count: number }>({
    text: `SELECT t.category_id AS categoryId, c.name, COUNT(*) AS count
           FROM tickets t
           JOIN categories c ON c.id = t.category_id
           GROUP BY t.category_id, c.name
           ORDER BY count DESC, t.category_id
           LIMIT 5`,
  })
  return {
    ticketVolume: { total, byStatus },
    avgResponseMinutes: avg?.avgMinutes ?? null,
    satisfaction: {
      average: satisfaction?.average ?? null,
      ratedCount: Number(satisfaction?.ratedCount ?? 0),
    },
    hotCategories: hotRows.map((row) => ({ categoryId: Number(row.categoryId), name: row.name, count: Number(row.count) })),
  }
}
