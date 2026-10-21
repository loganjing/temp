import type { DbClient } from '@commonapp/dbkit'
import type { Hono } from 'hono'
import { conflict, isUniqueViolation, notFound } from './errors'
import { requireRole, requireSessionProfile, type SessionProfile } from './session'
import type { AssignmentRule, BusinessGroup, Category, UserProfileSummary } from './types'
import { pathInt, requiredBodyInt, requiredBodyString } from './validate'

function insertFailed(error: unknown): never {
  if (isUniqueViolation(error)) throw conflict('本司已存在同名或重复记录')
  throw error
}

export function registerOrgRoutes(app: Hono, db: DbClient): void {
  app.get('/api/groups', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'submitter', 'agent', 'company_admin')
    const withMembers = c.req.query('members') === '1'
    const rows = await db.queryAll<{ id: number; name: string; member_count: number }>({
      text: `SELECT g.id, g.name, (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count
        FROM business_groups g WHERE g.company_id = ? ORDER BY g.id ASC`,
      params: [profile.companyId],
    })

    let membersByGroup: Map<number, UserProfileSummary[]> | undefined
    if (withMembers && rows.length > 0) {
      const placeholders = rows.map(() => '?').join(', ')
      const memberRows = await db.queryAll<{
        group_id: number
        id: number
        display_name: string
        email: string
        department: string
        role: string
        company_name: string
      }>({
        text: `SELECT m.group_id, p.id, p.display_name, p.email, p.department, p.role, comp.name AS company_name
          FROM group_members m
          JOIN user_profiles p ON p.id = m.user_profile_id
          JOIN companies comp ON comp.id = p.company_id
          WHERE m.group_id IN (${placeholders}) ORDER BY p.id ASC`,
        params: rows.map((row) => row.id),
      })
      membersByGroup = new Map(rows.map((row) => [row.id, []]))
      for (const member of memberRows) {
        membersByGroup.get(member.group_id)?.push({
          id: member.id,
          displayName: member.display_name,
          email: member.email,
          department: member.department,
          companyName: member.company_name,
          role: member.role as UserProfileSummary['role'],
        })
      }
    }

    const items: BusinessGroup[] = rows.map((row) => ({
      id: row.id,
      companyId: profile.companyId,
      name: row.name,
      memberCount: Number(row.member_count),
      ...(membersByGroup ? { members: membersByGroup.get(row.id) ?? [] } : {}),
    }))
    return c.json({ items })
  })

  app.post('/api/groups', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'company_admin')
    const body = await c.req.json().catch(() => ({}))
    let name: string
    let group: { id: number } | null
    try {
      name = requiredBodyString(body.name, 'name', 50)
      group = await db.queryOne<{ id: number }>({
        text: 'INSERT INTO business_groups (company_id, name, created_at) VALUES (?, ?, ?) RETURNING id',
        params: [profile.companyId, name, new Date().toISOString()],
      })
    } catch (error) {
      return insertFailed(error)
    }
    if (!group) throw notFound('业务组不存在')
    const created: BusinessGroup = { id: group.id, companyId: profile.companyId, name, memberCount: 0 }
    return c.json(created, 201)
  })

  async function requireCompanyGroup(profile: SessionProfile, rawId: string): Promise<{ id: number }> {
    const groupId = pathInt(rawId)
    const group = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM business_groups WHERE id = ? AND company_id = ?',
      params: [groupId, profile.companyId],
    })
    if (!group) throw notFound('业务组不存在')
    return group
  }

  app.post('/api/groups/:id/members', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'company_admin')
    const group = await requireCompanyGroup(profile, c.req.param('id'))
    const body = await c.req.json().catch(() => ({}))
    const userProfileId = requiredBodyInt(body.userProfileId, 'userProfileId')
    const user = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM user_profiles WHERE id = ? AND company_id = ?',
      params: [userProfileId, profile.companyId],
    })
    if (!user) throw notFound('用户不存在')
    try {
      await db.run({
        text: 'INSERT INTO group_members (group_id, user_profile_id) VALUES (?, ?)',
        params: [group.id, user.id],
      })
    } catch (error) {
      return insertFailed(error)
    }
    return c.json({ ok: true }, 201)
  })

  app.delete('/api/groups/:id/members/:userProfileId', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'company_admin')
    const group = await requireCompanyGroup(profile, c.req.param('id'))
    const userProfileId = pathInt(c.req.param('userProfileId'), 'userProfileId')
    const result = await db.run({
      text: 'DELETE FROM group_members WHERE group_id = ? AND user_profile_id = ?',
      params: [group.id, userProfileId],
    })
    if (result.changes === 0) throw notFound('成员不存在')
    return c.body(null, 204)
  })

  app.get('/api/categories', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'submitter', 'agent', 'company_admin')
    const rows = await db.queryAll<{ id: number; name: string }>({
      text: 'SELECT id, name FROM categories WHERE company_id = ? ORDER BY id ASC',
      params: [profile.companyId],
    })
    const items: Category[] = rows.map((row) => ({ id: row.id, companyId: profile.companyId, name: row.name }))
    return c.json({ items })
  })

  app.post('/api/categories', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'company_admin')
    const body = await c.req.json().catch(() => ({}))
    let name: string
    let category: { id: number } | null
    try {
      name = requiredBodyString(body.name, 'name', 50)
      category = await db.queryOne<{ id: number }>({
        text: 'INSERT INTO categories (company_id, name) VALUES (?, ?) RETURNING id',
        params: [profile.companyId, name],
      })
    } catch (error) {
      return insertFailed(error)
    }
    if (!category) throw notFound('分类不存在')
    const created: Category = { id: category.id, companyId: profile.companyId, name }
    return c.json(created, 201)
  })

  app.get('/api/assignment-rules', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'company_admin')
    const rows = await db.queryAll<{ id: number; category_id: number; category_name: string; group_id: number; group_name: string }>({
      text: `SELECT r.id, r.category_id, c.name AS category_name, r.group_id, g.name AS group_name
        FROM assignment_rules r
        JOIN categories c ON c.id = r.category_id
        JOIN business_groups g ON g.id = r.group_id
        WHERE r.company_id = ? ORDER BY r.id ASC`,
      params: [profile.companyId],
    })
    const items: AssignmentRule[] = rows.map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      groupId: row.group_id,
      groupName: row.group_name,
    }))
    return c.json({ items })
  })

  app.post('/api/assignment-rules', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'company_admin')
    const body = await c.req.json().catch(() => ({}))
    const categoryId = requiredBodyInt(body.categoryId, 'categoryId')
    const groupId = requiredBodyInt(body.groupId, 'groupId')
    const category = await db.queryOne<{ id: number; name: string }>({
      text: 'SELECT id, name FROM categories WHERE id = ? AND company_id = ?',
      params: [categoryId, profile.companyId],
    })
    if (!category) throw notFound('分类不存在')
    const group = await db.queryOne<{ id: number; name: string }>({
      text: 'SELECT id, name FROM business_groups WHERE id = ? AND company_id = ?',
      params: [groupId, profile.companyId],
    })
    if (!group) throw notFound('业务组不存在')

    let rule: { id: number }
    try {
      rule = (await db.queryOne<{ id: number }>({
        text: 'INSERT INTO assignment_rules (company_id, category_id, group_id) VALUES (?, ?, ?) RETURNING id',
        params: [profile.companyId, category.id, group.id],
      }))!
    } catch (error) {
      return insertFailed(error)
    }
    const created: AssignmentRule = {
      id: rule.id,
      categoryId: category.id,
      categoryName: category.name,
      groupId: group.id,
      groupName: group.name,
    }
    return c.json(created, 201)
  })

  app.delete('/api/assignment-rules/:id', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'company_admin')
    const ruleId = pathInt(c.req.param('id'))
    const rule = await db.queryOne<{ id: number }>({
      text: 'SELECT id FROM assignment_rules WHERE id = ? AND company_id = ?',
      params: [ruleId, profile.companyId],
    })
    if (!rule) throw notFound('分配规则不存在')
    await db.run({ text: 'DELETE FROM assignment_rules WHERE id = ?', params: [rule.id] })
    return c.body(null, 204)
  })

  app.get('/api/companies', async (c) => {
    const profile = await requireSessionProfile(db, c)
    requireRole(profile, 'platform_ops')
    const rows = await db.queryAll<{ id: number; name: string }>({ text: 'SELECT id, name FROM companies ORDER BY id ASC' })
    return c.json({ items: rows.map((row) => ({ id: row.id, name: row.name })) })
  })
}
