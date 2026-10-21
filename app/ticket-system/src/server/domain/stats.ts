import type { Context, Hono } from 'hono'
import type { DbClient } from '@commonapp/dbkit'
import { currentAuthUser, requireCompanyContext, validationFailed } from './support'

// 统计域（契约第 4 节）：跨公司聚合（需求 5.3/5.8 授权），仅输出聚合结果。

export type DistributionItem = { key: string; label: string; count: number }

export type DashboardView = {
  totalTickets: number
  statusBreakdown: { created: number; pendingAssignment: number; pendingProcessing: number; completed: number; cancelled: number }
  avgResponseMinutes: number | null
  avgSatisfaction: number | null
  hotCategories: Array<{ category: string; count: number }>
}

export type StatsDeps = { db: DbClient }

export function registerStatsRoutes(app: Hono, deps: StatsDeps) {
  // 4.1 工单分布：company 维度 label=公司名；department 维度 label=提交人部门（空部门归入"未填写"）；按 count 降序。
  app.get('/api/stats/distribution', async (context: Context) => {
    await requireCompanyContext(deps.db, currentAuthUser(context))
    const dimension = context.req.query('dimension')
    if (dimension !== 'company' && dimension !== 'department') {
      throw validationFailed([{ field: 'dimension', message: 'dimension 必须是 company 或 department' }])
    }
    const rows =
      dimension === 'company'
        ? await deps.db.queryAll<{ item_key: string; item_label: string; item_count: number }>({
            text: `SELECT c.name AS item_key, c.name AS item_label, COUNT(*) AS item_count
                   FROM tickets t JOIN companies c ON c.id = t.company_id
                   GROUP BY c.id, c.name
                   ORDER BY item_count DESC, item_label ASC`,
          })
        : await deps.db.queryAll<{ item_key: string; item_label: string; item_count: number }>({
            text: `SELECT COALESCE(NULLIF(u.department, ''), '未填写') AS item_key,
                          COALESCE(NULLIF(u.department, ''), '未填写') AS item_label,
                          COUNT(*) AS item_count
                   FROM tickets t JOIN users u ON u.user_no = t.submitter_no
                   GROUP BY item_key
                   ORDER BY item_count DESC, item_key ASC`,
          })
    const items = rows.map((row) => ({ key: row.item_key, label: row.item_label, count: Number(row.item_count) }))
    return context.json({ dimension, items })
  })

  // 4.2 运营仪表盘：工单量、状态分布、平均响应时间、满意度、热点问题（口径见契约）。
  app.get('/api/stats/dashboard', async (context: Context) => {
    await requireCompanyContext(deps.db, currentAuthUser(context))
    const [totalRow, statusRows, responseRow, satisfactionRow, hotRows] = await Promise.all([
      deps.db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM tickets' }),
      deps.db.queryAll<{ status: string; cnt: number }>({
        text: 'SELECT status, COUNT(*) AS cnt FROM tickets GROUP BY status',
      }),
      deps.db.queryOne<{ avg_response: number | null }>({
        text: `SELECT AVG(elapsed_minutes) AS avg_response FROM (
                 SELECT (julianday((SELECT MIN(r.replied_at) FROM ticket_replies r WHERE r.ticket_id = t.id)) - julianday(t.created_at)) * 1440.0 AS elapsed_minutes
                 FROM tickets t
                 WHERE EXISTS (SELECT 1 FROM ticket_replies r WHERE r.ticket_id = t.id)
               )`,
      }),
      deps.db.queryOne<{ avg_score: number | null }>({
        text: 'SELECT ROUND(AVG(score), 2) AS avg_score FROM ticket_ratings',
      }),
      deps.db.queryAll<{ category: string; cnt: number }>({
        text: 'SELECT category, COUNT(*) AS cnt FROM tickets GROUP BY category ORDER BY cnt DESC, category ASC LIMIT 5',
      }),
    ])
    const statusBreakdown = { created: 0, pendingAssignment: 0, pendingProcessing: 0, completed: 0, cancelled: 0 }
    for (const row of statusRows) {
      if (row.status === 'created') statusBreakdown.created = Number(row.cnt)
      else if (row.status === 'pending_assignment') statusBreakdown.pendingAssignment = Number(row.cnt)
      else if (row.status === 'pending_processing') statusBreakdown.pendingProcessing = Number(row.cnt)
      else if (row.status === 'completed') statusBreakdown.completed = Number(row.cnt)
      else if (row.status === 'cancelled') statusBreakdown.cancelled = Number(row.cnt)
    }
    const view: DashboardView = {
      totalTickets: Number(totalRow?.total ?? 0),
      statusBreakdown,
      avgResponseMinutes: responseRow?.avg_response === null || responseRow?.avg_response === undefined ? null : Number(responseRow.avg_response),
      avgSatisfaction: satisfactionRow?.avg_score === null || satisfactionRow?.avg_score === undefined ? null : Number(satisfactionRow.avg_score),
      hotCategories: hotRows.map((row) => ({ category: row.category, count: Number(row.cnt) })),
    }
    return context.json(view)
  })
}
