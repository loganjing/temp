/**
 * stats 模块：公司/部门工单分布与运营仪表盘聚合（契约第 7 节）。
 * 全部为实时 SQL 聚合查询，不落汇总表（架构基线 1.4）。
 */
import type { Hono } from 'hono'
import type { PlatformResources } from '../platform/bootstrap'
import { ApiError, currentProfile, resolveStatsScope, route } from '../http'

interface DistributionItem {
  key: number | string
  label: string
  count: number
}

export function registerStatsRoutes(app: Hono, platform: PlatformResources): void {
  const { db } = platform

  // 契约 7.1：工单分布统计。
  app.get(
    '/api/stats/distribution',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const dimension = context.req.query('dimension') ?? 'department'
      if (dimension !== 'company' && dimension !== 'department') {
        throw new ApiError(400, 'VALIDATION_ERROR', 'dimension 取值不合法')
      }
      // 公司维度按工单所属公司聚合，要求跨公司视角（R8）。
      if (dimension === 'company' && !me.crossCompanyView) {
        throw new ApiError(403, 'CROSS_COMPANY_REQUIRED', '公司维度统计需要跨公司视角')
      }
      const scope = resolveStatsScope(context, me)
      const companyId = scope === 'all' ? null : scope
      const singleCompany = companyId !== null
      let items: DistributionItem[]
      if (dimension === 'company') {
        const rows = await db.queryAll<{ key: number; label: string; count: number }>({
          text: `SELECT t.company_id AS key, c.name AS label, COUNT(*) AS count
                 FROM tickets t JOIN companies c ON c.id = t.company_id
                 ${singleCompany ? 'WHERE t.company_id = ?' : ''}
                 GROUP BY t.company_id ORDER BY count DESC, label ASC`,
          params: singleCompany ? [companyId] : [],
        })
        items = rows
      } else {
        // 部门维度取提交人所属部门；无部门计入「未分配部门」桶。
        const rows = await db.queryAll<{ key: number | null; label: string; count: number }>({
          text: `SELECT p.department_id AS key,
                        CASE WHEN p.department_id IS NULL THEN '未分配部门' ${
                          singleCompany
                            ? "ELSE COALESCE(d.name, '未分配部门')"
                            : "ELSE c.name || ' · ' || COALESCE(d.name, '未分配部门')"
                        } END AS label,
                        COUNT(*) AS count
                 FROM tickets t
                 JOIN user_profiles p ON p.id = t.submitter_user_id
                 JOIN companies c ON c.id = p.company_id
                 LEFT JOIN departments d ON d.id = p.department_id
                 ${singleCompany ? 'WHERE t.company_id = ?' : ''}
                  GROUP BY p.department_id ORDER BY count DESC, p.department_id IS NULL, label ASC`,
          params: singleCompany ? [companyId] : [],
        })
        items = rows.map((row) => ({ key: row.key ?? 'unassigned', label: row.label, count: row.count }))
      }
      return context.json({ dimension, items })
    }),
  )

  // 契约 7.2：运营仪表盘。
  app.get(
    '/api/stats/dashboard',
    route(async (context) => {
      const me = await currentProfile(db, context)
      const scope = resolveStatsScope(context, me)
      const companyId = scope === 'all' ? null : scope
      const companyCondition = companyId !== null ? 'WHERE t.company_id = ?' : ''
      const companyParams = companyId !== null ? [companyId] : []
      const statusRows = await db.queryAll<{ status: string; count: number }>({
        text: `SELECT t.status AS status, COUNT(*) AS count FROM tickets t ${companyCondition} GROUP BY t.status`,
        params: companyParams,
      })
      const byStatus: Record<string, number> = {
        created: 0,
        pending_assignment: 0,
        pending_processing: 0,
        completed: 0,
        cancelled: 0,
      }
      let total = 0
      for (const row of statusRows) {
        if (row.status in byStatus) byStatus[row.status] = row.count
        total += row.count
      }
      // 平均响应时间：创建到首次回复的分钟均值（仅统计已回复工单，R4）。
      const response = await db.queryOne<{ avg_minutes: number | null }>({
        text: `SELECT AVG((julianday(t.first_reply_at) - julianday(t.created_at)) * 1440.0) AS avg_minutes
               FROM tickets t WHERE t.first_reply_at IS NOT NULL ${companyId !== null ? 'AND t.company_id = ?' : ''}`,
        params: companyParams,
      })
      // 满意度：评价聚合（R3）。
      const satisfaction = await db.queryOne<{ avg_score: number | null; rated_count: number }>({
        text: `SELECT AVG(r.score) AS avg_score, COUNT(*) AS rated_count
               FROM ticket_ratings r JOIN tickets t ON t.id = r.ticket_id
               ${companyId !== null ? 'WHERE t.company_id = ?' : ''}`,
        params: companyParams,
      })
      // 热点问题：按分类聚合工单量排行，降序 Top 10（R5）。
      const hotCategories = await db.queryAll<{ category: string; count: number }>({
        text: `SELECT t.category AS category, COUNT(*) AS count FROM tickets t ${companyCondition}
               GROUP BY t.category ORDER BY count DESC, t.category ASC LIMIT 10`,
        params: companyParams,
      })
      return context.json({
        ticketCount: { total, byStatus },
        avgResponseMinutes: response?.avg_minutes ?? null,
        satisfaction: {
          avgScore: satisfaction?.avg_score ?? null,
          ratedCount: Number(satisfaction?.rated_count ?? 0),
        },
        hotCategories,
      })
    }),
  )
}
