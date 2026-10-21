import type { DbClient } from '@commonapp/dbkit'
import type { Hono } from 'hono'
import { invalidInput, notFound } from './errors'
import { requireSessionProfile, type SessionProfile } from './session'
import type { DashboardStats, DistributionItem } from './types'
import { queryEnum, queryInt } from './validate'

const round2 = (value: number): number => Math.round(value * 100) / 100

// 统计范围：公司内角色强制本公司（忽略 companyId 参数）；platform_ops 全平台或指定公司。
// 返回 null 表示全平台（仅 platform_ops 可为 null）。
async function resolveStatsScope(db: DbClient, profile: SessionProfile, rawCompanyId: string | undefined): Promise<number | null> {
  if (profile.role !== 'platform_ops') return profile.companyId
  if (rawCompanyId === undefined || rawCompanyId === '') return null
  const companyId = queryInt(rawCompanyId, 'companyId')
  if (companyId === undefined) return null
  const company = await db.queryOne({ text: 'SELECT id FROM companies WHERE id = ?', params: [companyId] })
  if (!company) throw notFound('公司不存在')
  return companyId
}

interface AggregateRow {
  total: number
  pending_assign: number | null
  processing: number | null
  completed: number | null
  cancelled: number | null
  responded: number | null
  avg_response: number | null
}

interface RatedRow {
  rated: number
  avg_score: number | null
}

export function registerStatsRoutes(app: Hono, db: DbClient): void {
  app.get('/api/stats/distribution', async (c) => {
    const profile = await requireSessionProfile(db, c)
    const dimension = queryEnum(c.req.query('dimension'), 'dimension', ['company', 'department'] as const)
    if (!dimension) throw invalidInput('dimension 必须是 company / department 之一')
    const companyId = await resolveStatsScope(db, profile, c.req.query('companyId'))
    if (dimension === 'department' && companyId === null) throw invalidInput('platform_ops 按部门统计必须指定 companyId')

    let items: DistributionItem[]
    if (dimension === 'company') {
      const rows = companyId === null
        ? await db.queryAll<{ id: number; name: string; count: number }>({
          text: `SELECT c.id, c.name, COUNT(t.id) AS count FROM companies c
            LEFT JOIN tickets t ON t.company_id = c.id
            GROUP BY c.id, c.name ORDER BY count DESC, c.id ASC`,
        })
        : await db.queryAll<{ id: number; name: string; count: number }>({
          text: `SELECT c.id, c.name, COUNT(t.id) AS count FROM companies c
            LEFT JOIN tickets t ON t.company_id = c.id
            WHERE c.id = ? GROUP BY c.id, c.name`,
          params: [companyId],
        })
      items = rows.map((row) => ({ key: String(row.id), label: row.name, count: Number(row.count) }))
    } else {
      const rows = await db.queryAll<{ department: string; count: number }>({
        text: `SELECT u.department AS department, COUNT(t.id) AS count FROM tickets t
          JOIN user_profiles u ON u.id = t.submitter_id
          WHERE t.company_id = ? GROUP BY u.department ORDER BY count DESC, department ASC`,
        params: [companyId],
      })
      items = rows.map((row) => ({ key: row.department, label: row.department, count: Number(row.count) }))
    }
    return c.json({ dimension, items })
  })

  app.get('/api/stats/dashboard', async (c) => {
    const profile = await requireSessionProfile(db, c)
    const companyId = await resolveStatsScope(db, profile, c.req.query('companyId'))
    const scopeSql = companyId === null ? '' : 'WHERE t.company_id = ?'
    const scopeParams: unknown[] = companyId === null ? [] : [companyId]

    const aggregate = await db.queryOne<AggregateRow>({
      text: `SELECT COUNT(*) AS total,
        SUM(CASE WHEN t.status = 'pending_assign' THEN 1 ELSE 0 END) AS pending_assign,
        SUM(CASE WHEN t.status = 'processing' THEN 1 ELSE 0 END) AS processing,
        SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN t.first_reply_at IS NOT NULL THEN 1 ELSE 0 END) AS responded,
        AVG((julianday(t.first_reply_at) - julianday(t.created_at)) * 86400) AS avg_response
        FROM tickets t ${scopeSql}`,
      params: scopeParams,
    })
    const rated = await db.queryOne<RatedRow>({
      text: `SELECT COUNT(*) AS rated, AVG(r.score) AS avg_score FROM ticket_ratings r
        JOIN tickets t ON t.id = r.ticket_id ${scopeSql}`,
      params: scopeParams,
    })
    const topCategories = await db.queryAll<{ category_id: number; name: string; count: number }>({
      text: `SELECT t.category_id, c.name AS name, COUNT(*) AS count FROM tickets t
        JOIN categories c ON c.id = t.category_id ${scopeSql}
        GROUP BY t.category_id, c.name ORDER BY count DESC, t.category_id ASC LIMIT 5`,
      params: scopeParams,
    })

    const stats: DashboardStats = {
      totalTickets: Number(aggregate?.total ?? 0),
      byStatus: {
        pending_assign: Number(aggregate?.pending_assign ?? 0),
        processing: Number(aggregate?.processing ?? 0),
        completed: Number(aggregate?.completed ?? 0),
        cancelled: Number(aggregate?.cancelled ?? 0),
      },
      respondedTickets: Number(aggregate?.responded ?? 0),
      avgResponseSeconds: aggregate && aggregate.avg_response !== null && aggregate.avg_response !== undefined
        ? round2(Number(aggregate.avg_response))
        : null,
      ratedTickets: Number(rated?.rated ?? 0),
      avgRating: rated && rated.avg_score !== null && rated.avg_score !== undefined ? round2(Number(rated.avg_score)) : null,
      topCategories: topCategories.map((row) => ({ categoryId: row.category_id, name: row.name, count: Number(row.count) })),
    }
    return c.json(stats)
  })
}
