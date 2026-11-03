import { randomUUID } from 'node:crypto'
import type { DbClient } from '@commonapp/dbkit'
import { ServiceError } from './errors'

export function createOrgService(db: DbClient) {
  async function listBusinessGroups(companyId: string) {
    const groups = await db.queryAll<{ id: string; name: string; company_id: string }>({
      text: 'SELECT id, name, company_id FROM business_groups WHERE company_id = ? ORDER BY name',
      params: [companyId],
    })
    const items = []
    for (const g of groups) {
      const members = await db.queryAll<{ user_id: string; name: string }>({
        text: 'SELECT bgm.user_id, u.name FROM business_group_members bgm JOIN users u ON u.id = bgm.user_id WHERE bgm.business_group_id = ? ORDER BY u.name',
        params: [g.id],
      })
      items.push({ id: g.id, name: g.name, companyId: g.company_id, members: members.map(m => ({ userId: m.user_id, displayName: m.name })) })
    }
    return { items }
  }

  async function createBusinessGroup(name: string, companyId: string) {
    const id = randomUUID()
    const now = new Date().toISOString()
    await db.run({ text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [id, companyId, name, now] })
    return { id, name, companyId, members: null }
  }

  async function addMember(groupId: string, userId: string, companyId: string) {
    const group = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?', params: [groupId, companyId] })
    if (!group) throw new ServiceError(404, 'not_found', 'Business group not found')

    const user = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM users WHERE id = ?', params: [userId] })
    if (!user) throw new ServiceError(404, 'not_found', 'User not found')

    const existing = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_group_members WHERE business_group_id = ? AND user_id = ?', params: [groupId, userId] })
    if (existing) throw new ServiceError(409, 'already_member', 'User is already a member')

    const id = randomUUID()
    const now = new Date().toISOString()
    await db.run({ text: 'INSERT INTO business_group_members (id, business_group_id, user_id, created_at) VALUES (?, ?, ?, ?)', params: [id, groupId, userId, now] })
    return { id, businessGroupId: groupId, userId }
  }

  async function removeMember(groupId: string, userId: string, companyId: string) {
    const group = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?', params: [groupId, companyId] })
    if (!group) throw new ServiceError(404, 'not_found', 'Business group not found')
    const result = await db.run({ text: 'DELETE FROM business_group_members WHERE business_group_id = ? AND user_id = ?', params: [groupId, userId] })
    if (result.changes === 0) throw new ServiceError(404, 'not_found', 'Member not found')
  }

  async function listCategories(companyId: string) {
    const rows = await db.queryAll<{ id: string; name: string; company_id: string }>({
      text: 'SELECT id, name, company_id FROM ticket_categories WHERE company_id = ? ORDER BY name', params: [companyId],
    })
    return { items: rows.map(r => ({ id: r.id, name: r.name, companyId: r.company_id })) }
  }

  async function createCategory(name: string, companyId: string) {
    const id = randomUUID()
    const now = new Date().toISOString()
    await db.run({ text: 'INSERT INTO ticket_categories (id, company_id, name, created_at) VALUES (?, ?, ?, ?)', params: [id, companyId, name, now] })
    return { id, name, companyId }
  }

  async function listAssignmentRules(companyId: string) {
    const rows = await db.queryAll<{ id: string; category_id: string; category_name: string; business_group_id: string; business_group_name: string }>({
      text: `SELECT r.id, r.category_id, tc.name AS category_name, r.business_group_id, bg.name AS business_group_name FROM category_assignment_rules r JOIN ticket_categories tc ON tc.id = r.category_id JOIN business_groups bg ON bg.id = r.business_group_id WHERE r.company_id = ? ORDER BY tc.name`,
      params: [companyId],
    })
    return { items: rows.map(r => ({ id: r.id, categoryId: r.category_id, categoryName: r.category_name, businessGroupId: r.business_group_id, businessGroupName: r.business_group_name })) }
  }

  async function createAssignmentRule(categoryId: string, businessGroupId: string, companyId: string) {
    const category = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM ticket_categories WHERE id = ? AND company_id = ?', params: [categoryId, companyId] })
    if (!category) throw new ServiceError(400, 'invalid_input', 'Category not found in your company')

    const group = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?', params: [businessGroupId, companyId] })
    if (!group) throw new ServiceError(400, 'invalid_input', 'Business group not found in your company')

    const existing = await db.queryOne<{ id: string }>({ text: 'SELECT id FROM category_assignment_rules WHERE category_id = ? AND company_id = ?', params: [categoryId, companyId] })
    if (existing) throw new ServiceError(409, 'rule_exists', 'A rule already exists for this category')

    const id = randomUUID()
    const now = new Date().toISOString()
    await db.run({ text: 'INSERT INTO category_assignment_rules (id, company_id, category_id, business_group_id, created_at) VALUES (?, ?, ?, ?, ?)', params: [id, companyId, categoryId, businessGroupId, now] })

    const catRow = await db.queryOne<{ name: string }>({ text: 'SELECT name FROM ticket_categories WHERE id = ?', params: [categoryId] })
    const grpRow = await db.queryOne<{ name: string }>({ text: 'SELECT name FROM business_groups WHERE id = ?', params: [businessGroupId] })
    return { id, categoryId, categoryName: catRow?.name ?? '', businessGroupId, businessGroupName: grpRow?.name ?? '' }
  }

  return { listBusinessGroups, createBusinessGroup, addMember, removeMember, listCategories, createCategory, listAssignmentRules, createAssignmentRule }
}
