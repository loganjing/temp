/**
 * 分类与分配规则服务：问题分类管理、分类分配规则配置。
 */
import type { Platform } from './helpers.js'
import type { DbClient } from '@commonapp/dbkit'
import { conflict, notFound, now, uuid } from './helpers.js'

export async function listCategories(db: DbClient) {
  return db.queryAll({
    text: 'SELECT id, name, created_at FROM categories ORDER BY created_at ASC',
  })
}

export async function createCategory(db: DbClient, name: string) {
  const id = uuid()
  const createdAt = now()
  await db.run({
    text: 'INSERT INTO categories (id, name, created_at) VALUES (?, ?, ?)',
    params: [id, name, createdAt],
  })
  return { id, name, created_at: createdAt }
}

export async function listAssignmentRules(db: DbClient, companyId: string) {
  return db.queryAll({
    text: `SELECT r.id, r.company_id, r.category_id, c.name AS category_name,
              r.group_id, bg.name AS group_name, r.created_at
           FROM category_assignment_rules r
           JOIN categories c ON c.id = r.category_id
           JOIN business_groups bg ON bg.id = r.group_id
           WHERE r.company_id = ?
           ORDER BY r.created_at ASC`,
    params: [companyId],
  })
}

export async function createAssignmentRule(db: DbClient, companyId: string, categoryId: string, groupId: string) {
  const company = await db.queryOne({ text: 'SELECT id FROM companies WHERE id = ?', params: [companyId] })
  if (!company) throw notFound('公司不存在')
  const category = await db.queryOne({ text: 'SELECT id FROM categories WHERE id = ?', params: [categoryId] })
  if (!category) throw notFound('分类不存在')
  const group = await db.queryOne({ text: 'SELECT id FROM business_groups WHERE id = ?', params: [groupId] })
  if (!group) throw notFound('业务组不存在')
  const existing = await db.queryOne({
    text: 'SELECT id FROM category_assignment_rules WHERE company_id = ? AND category_id = ?',
    params: [companyId, categoryId],
  })
  if (existing) throw conflict('该公司该分类已有分配规则')
  const id = uuid()
  const createdAt = now()
  await db.run({
    text: 'INSERT INTO category_assignment_rules (id, company_id, category_id, group_id, created_at) VALUES (?, ?, ?, ?, ?)',
    params: [id, companyId, categoryId, groupId, createdAt],
  })
  return { id, company_id: companyId, category_id: categoryId, group_id: groupId, created_at: createdAt }
}
