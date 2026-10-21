import type { DbClient } from '@commonapp/dbkit'
import { forbidden } from './errors'
import { ticketVisibilityClause, type Identity } from './org'

// 统计分析模块（契约第 5 节）：只读聚合。统计范围=该用户可见工单（成员组所辖 ∪ 本公司管理员的本公司全部）。
// 权限：业务组成员或公司配置管理员。

function assertStatsScope(identity: Identity): void {
  if (identity.groups.length === 0 && identity.org?.isCompanyAdmin !== true) {
    throw forbidden('Only group members or company admins can view statistics')
  }
}

function scopeFilters(identity: Identity, companyId?: number): { clause: string; params: unknown[] } {
  const visibility = ticketVisibilityClause(identity)
  const clauses = [visibility.clause]
  const params = [...visibility.params]
  if (companyId !== undefined) {
    clauses.push('t.company_id = ?')
    params.push(companyId)
  }
  return { clause: clauses.join(' AND '), params }
}

export async function distribution(
  db: DbClient,
  identity: Identity,
  query: { dimension: 'company' | 'department'; companyId?: number },
): Promise<{ items: { key: string; count: number }[] }> {
  assertStatsScope(identity)
  const scope = scopeFilters(identity, query.companyId)
  const rows =
    query.dimension === 'company'
      ? await db.queryAll<{ key: string; count: number }>({
          text: `SELECT comp.name AS key, COUNT(*) AS count
                 FROM tickets t JOIN companies comp ON comp.id = t.company_id
                 WHERE ${scope.clause} GROUP BY comp.name ORDER BY count DESC, key ASC`,
          params: scope.params,
        })
      : await db.queryAll<{ key: string; count: number }>({
          text: `SELECT COALESCE(uo.department, '') AS key, COUNT(*) AS count
                 FROM tickets t LEFT JOIN user_org uo ON uo.user_id = t.submitter_user_id
                 WHERE ${scope.clause} GROUP BY uo.department ORDER BY count DESC, key ASC`,
          params: scope.params,
        })
  return { items: rows.map((row) => ({ key: row.key, count: Number(row.count) })) }
}

export async function dashboard(
  db: DbClient,
  identity: Identity,
  query: { companyId?: number },
): Promise<{
  volume: number
  avgResponseSeconds: number | null
  satisfactionAvg: number | null
  ratedCount: number
  hotCategories: { category: string; count: number }[]
}> {
  assertStatsScope(identity)
  const scope = scopeFilters(identity, query.companyId)

  const volumeRow = await db.queryOne<{ total: number }>({
    text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${scope.clause}`,
    params: scope.params,
  })
  const responseRow = await db.queryOne<{ avg_seconds: number | null }>({
    text: `SELECT AVG((julianday(t.first_reply_at) - julianday(t.created_at)) * 86400) AS avg_seconds
           FROM tickets t WHERE ${scope.clause} AND t.first_reply_at IS NOT NULL`,
    params: scope.params,
  })
  const satisfactionRow = await db.queryOne<{ avg_score: number | null; rated: number }>({
    text: `SELECT AVG(tr.score) AS avg_score, COUNT(tr.score) AS rated
           FROM tickets t JOIN ticket_ratings tr ON tr.ticket_id = t.id
           WHERE ${scope.clause}`,
    params: scope.params,
  })
  const hotRows = await db.queryAll<{ category: string; count: number }>({
    text: `SELECT c.name AS category, COUNT(*) AS count
           FROM tickets t JOIN categories c ON c.id = t.category_id
           WHERE ${scope.clause} GROUP BY c.name ORDER BY count DESC, category ASC LIMIT 10`,
    params: scope.params,
  })

  const avgSeconds = responseRow?.avg_seconds
  return {
    volume: Number(volumeRow?.total ?? 0),
    avgResponseSeconds: avgSeconds === null || avgSeconds === undefined ? null : Number(avgSeconds),
    satisfactionAvg: satisfactionRow?.avg_score === null || satisfactionRow?.avg_score === undefined ? null : Number(satisfactionRow.avg_score),
    ratedCount: Number(satisfactionRow?.rated ?? 0),
    hotCategories: hotRows.map((row) => ({ category: row.category, count: Number(row.count) })),
  }
}
