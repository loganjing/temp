import type { DbClient } from '@commonapp/dbkit'
import type { createAuditKit } from '@commonapp/auditkit'
import { ServiceError } from './errors'

type AuditKit = ReturnType<typeof createAuditKit>

interface Deps {
  db: DbClient
  auditKit: AuditKit
}

export function createQueryService(deps: Deps) {
  const { db, auditKit } = deps

  async function getUserProfile(userId: string) {
    const u = await db.queryOne<{ id: string; name: string; email: string; company_id: string; company_name: string; department_id: string | null; department_name: string | null }>({
      text: `SELECT u.id, u.name, u.email, u.company_id, c.name AS company_name, u.department_id, d.name AS department_name FROM users u LEFT JOIN companies c ON c.id = u.company_id LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`,
      params: [userId],
    })
    if (!u) throw new ServiceError(404, 'not_found', 'User not found')
    return {
      id: u.id, name: u.name, email: u.email,
      companyId: u.company_id ?? '', companyName: u.company_name ?? '',
      departmentId: u.department_id, departmentName: u.department_name,
    }
  }

  async function getUserTickets(userId: string, companyId: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize
    const [rows, countResult] = await Promise.all([
      db.queryAll<{ id: string; title: string; status: string; sla_priority: string; created_at: string }>({
        text: 'SELECT id, title, status, sla_priority, created_at FROM tickets WHERE submitter_id = ? AND company_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        params: [userId, companyId, pageSize, offset],
      }),
      db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM tickets WHERE submitter_id = ? AND company_id = ?', params: [userId, companyId] }),
    ])
    return {
      items: rows.map(r => ({ id: r.id, title: r.title, status: r.status, slaPriority: r.sla_priority, createdAt: r.created_at })),
      total: Number(countResult?.total ?? 0),
    }
  }

  async function getDistribution(dimension: string, companyId: string) {
    if (dimension === 'department') {
      const rows = await db.queryAll<{ name: string; count: number; pending_count: number; completed_count: number }>({
        text: `SELECT d.name, COUNT(t.id) AS count, SUM(CASE WHEN t.status IN ('pending_assignment', 'pending_processing') THEN 1 ELSE 0 END) AS pending_count, SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed_count FROM departments d LEFT JOIN users u ON u.department_id = d.id LEFT JOIN tickets t ON t.submitter_id = u.id AND t.company_id = d.company_id WHERE d.company_id = ? GROUP BY d.id, d.name ORDER BY count DESC`,
        params: [companyId],
      })
      return { items: rows.map(r => ({ name: r.name, count: Number(r.count), pendingCount: Number(r.pending_count), completedCount: Number(r.completed_count) })) }
    }
    const rows = await db.queryAll<{ name: string; count: number; pending_count: number; completed_count: number }>({
      text: `SELECT c.name, COUNT(t.id) AS count, SUM(CASE WHEN t.status IN ('pending_assignment', 'pending_processing') THEN 1 ELSE 0 END) AS pending_count, SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed_count FROM companies c LEFT JOIN tickets t ON t.company_id = c.id WHERE c.id = ? GROUP BY c.id, c.name ORDER BY count DESC`,
      params: [companyId],
    })
    return { items: rows.map(r => ({ name: r.name, count: Number(r.count), pendingCount: Number(r.pending_count), completedCount: Number(r.completed_count) })) }
  }

  async function getDashboard(companyId: string, startDate?: string, endDate?: string) {
    const conds: string[] = ['t.company_id = ?']
    const params: unknown[] = [companyId]
    if (startDate) { conds.push('t.created_at >= ?'); params.push(startDate) }
    if (endDate) { conds.push('t.created_at <= ?'); params.push(endDate) }
    const where = conds.join(' AND ')

    const [totalResult, responseTimeResult, satisfactionResult, hotCategories] = await Promise.all([
      db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`, params }),
      db.queryOne<{ avg_rt: number | null }>({
        text: `SELECT AVG(CAST((julianday(fr.created_at) - julianday(t.created_at)) * 86400 AS REAL)) AS avg_rt FROM tickets t JOIN (SELECT ticket_id, MIN(created_at) AS created_at FROM ticket_replies GROUP BY ticket_id) fr ON fr.ticket_id = t.id WHERE ${where}`,
        params,
      }),
      db.queryOne<{ avg_sat: number | null }>({
        text: `SELECT AVG(ts.rating) AS avg_sat FROM ticket_satisfactions ts JOIN tickets t ON t.id = ts.ticket_id WHERE ${where}`,
        params,
      }),
      db.queryAll<{ category_id: string; category_name: string; count: number }>({
        text: `SELECT tc.id AS category_id, tc.name AS category_name, COUNT(t.id) AS count FROM tickets t JOIN ticket_categories tc ON tc.id = t.category_id WHERE ${where} GROUP BY tc.id, tc.name ORDER BY count DESC LIMIT 5`,
        params,
      }),
    ])

    return {
      totalTickets: Number(totalResult?.total ?? 0),
      avgResponseTime: Math.round(Number(responseTimeResult?.avg_rt ?? 0)),
      avgSatisfaction: Math.round(Number(satisfactionResult?.avg_sat ?? 0) * 10) / 10,
      hotCategories: hotCategories.map(c => ({ categoryId: c.category_id, categoryName: c.category_name, count: Number(c.count) })),
    }
  }

  async function getLogs(filters: { ticketId?: string; action?: string; startDate?: string; endDate?: string; page: number; pageSize: number }) {
    const conds: string[] = ["event_type LIKE 'ticket_%'"]
    const params: unknown[] = []
    if (filters.action) { conds.push('event_type = ?'); params.push(filters.action) }
    if (filters.startDate) { conds.push('occurred_at >= ?'); params.push(filters.startDate) }
    if (filters.endDate) { conds.push('occurred_at <= ?'); params.push(filters.endDate) }
    if (filters.ticketId) { conds.push("json_extract(metadata_json, '$.ticketId') = ?"); params.push(filters.ticketId) }

    const where = `WHERE ${conds.join(' AND ')}`
    const offset = (filters.page - 1) * filters.pageSize

    const [rows, countResult] = await Promise.all([
      db.queryAll<{ id: string; event_type: string; actor_user_id: string; occurred_at: string; metadata_json: string; user_name: string }>({
        text: `SELECT ae.id, ae.event_type, ae.actor_user_id, ae.occurred_at, ae.metadata_json, u.name AS user_name FROM audit_events ae LEFT JOIN users u ON u.id = ae.actor_user_id ${where} ORDER BY ae.occurred_at DESC, ae.id DESC LIMIT ? OFFSET ?`,
        params: [...params, filters.pageSize, offset],
      }),
      db.queryOne<{ total: number }>({ text: `SELECT COUNT(*) AS total FROM audit_events ae ${where}`, params }),
    ])

    return {
      items: rows.map(r => {
        const details = JSON.parse(r.metadata_json ?? '{}')
        return {
          id: r.id, action: r.event_type, ticketId: String(details.ticketId ?? ''),
          userId: r.actor_user_id ?? '', userName: r.user_name ?? '',
          createdAt: r.occurred_at, details,
        }
      }),
      total: Number(countResult?.total ?? 0),
    }
  }

  return { getUserProfile, getUserTickets, getDistribution, getDashboard, getLogs }
}
