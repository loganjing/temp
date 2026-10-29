/**
 * 组织管理服务：公司、业务组、业务组成员。
 */
import type { Platform } from './helpers.js'
import { conflict, notFound, now, uuid } from './helpers.js'
import type { DbClient } from '@commonapp/dbkit'

export async function createCompany(db: DbClient, name: string) {
  const id = uuid()
  const createdAt = now()
  await db.run({
    text: 'INSERT INTO companies (id, name, created_at) VALUES (?, ?, ?)',
    params: [id, name, createdAt],
  })
  return { id, name, created_at: createdAt }
}

export async function listCompanies(db: DbClient) {
  return db.queryAll({
    text: 'SELECT id, name, created_at FROM companies ORDER BY created_at ASC',
  })
}

export async function listBusinessGroups(db: DbClient, companyId: string) {
  return db.queryAll({
    text: `SELECT bg.id, bg.company_id, bg.name, bg.created_at,
              (SELECT COUNT(*) FROM business_group_members m WHERE m.group_id = bg.id) AS member_count
           FROM business_groups bg
           WHERE bg.company_id = ?
           ORDER BY bg.created_at ASC`,
    params: [companyId],
  })
}

export async function createBusinessGroup(db: DbClient, companyId: string, name: string) {
  const company = await db.queryOne({ text: 'SELECT id FROM companies WHERE id = ?', params: [companyId] })
  if (!company) throw notFound('公司不存在')
  const id = uuid()
  const createdAt = now()
  await db.run({
    text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
    params: [id, companyId, name, createdAt],
  })
  return { id, company_id: companyId, name, created_at: createdAt }
}

export async function listMembers(db: DbClient, groupId: string) {
  const group = await db.queryOne({ text: 'SELECT id FROM business_groups WHERE id = ?', params: [groupId] })
  if (!group) throw notFound('业务组不存在')
  return db.queryAll({
    text: `SELECT m.id, m.group_id, m.user_id, u.name AS user_name, u.email AS user_email, m.created_at
           FROM business_group_members m
           JOIN users u ON u.id = m.user_id
           WHERE m.group_id = ?
           ORDER BY m.created_at ASC`,
    params: [groupId],
  })
}

export async function addMember(db: DbClient, groupId: string, userId: string) {
  const group = await db.queryOne({ text: 'SELECT id FROM business_groups WHERE id = ?', params: [groupId] })
  if (!group) throw notFound('业务组不存在')
  const user = await db.queryOne({ text: 'SELECT id FROM users WHERE id = ?', params: [userId] })
  if (!user) throw notFound('用户不存在')
  const existing = await db.queryOne({
    text: 'SELECT id FROM business_group_members WHERE group_id = ? AND user_id = ?',
    params: [groupId, userId],
  })
  if (existing) throw conflict('用户已是该组成员')
  const id = uuid()
  const createdAt = now()
  await db.run({
    text: 'INSERT INTO business_group_members (id, group_id, user_id, created_at) VALUES (?, ?, ?, ?)',
    params: [id, groupId, userId, createdAt],
  })
  return { id, group_id: groupId, user_id: userId, created_at: createdAt }
}

export async function removeMember(db: DbClient, groupId: string, userId: string) {
  const result = await db.run({
    text: 'DELETE FROM business_group_members WHERE group_id = ? AND user_id = ?',
    params: [groupId, userId],
  })
  return { removed: result.changes > 0 }
}
