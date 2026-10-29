/**
 * 用户信息服务：提交人信息查询、历史工单查询。
 */
import type { DbClient } from '@commonapp/dbkit'
import { notFound } from './helpers.js'

export async function getUser(db: DbClient, userId: string) {
  const user = await db.queryOne({
    text: `SELECT u.id, u.name, u.email, u.company_id, c.name AS company_name,
              u.department, u.created_at
           FROM users u
           LEFT JOIN companies c ON c.id = u.company_id
           WHERE u.id = ?`,
    params: [userId],
  })
  if (!user) throw notFound('用户不存在')
  return user
}

export async function listUserTickets(db: DbClient, userId: string) {
  const user = await db.queryOne({ text: 'SELECT id FROM users WHERE id = ?', params: [userId] })
  if (!user) throw notFound('用户不存在')
  return db.queryAll({
    text: `SELECT t.id, t.title, c.name AS category_name, t.priority, t.status,
              u.name AS submitter_name, bg.name AS assigned_group_name, t.created_at
           FROM tickets t
           LEFT JOIN categories c ON c.id = t.category_id
           LEFT JOIN users u ON u.id = t.submitter_id
           LEFT JOIN business_groups bg ON bg.id = t.assigned_group_id
           WHERE t.submitter_id = ?
           ORDER BY t.created_at DESC`,
    params: [userId],
  })
}
