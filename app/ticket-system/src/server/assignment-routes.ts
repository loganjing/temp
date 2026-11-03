import { randomUUID } from 'node:crypto'
import type { Hono } from 'hono'
import type { initializePlatform } from './platform/bootstrap'
import type { CurrentUser } from '../shared/types'

type Platform = Awaited<ReturnType<typeof initializePlatform>>
const errorBody = (code: string, message: string) => ({ error: { code, message } })
const getUser = (c: { get(name: string): unknown }): CurrentUser => c.get('currentUser') as CurrentUser
const now = () => new Date().toISOString()

export function registerAssignmentRoutes(app: Hono, platform: Platform) {
  const { db } = platform

  // GET /api/business-groups
  app.get('/api/business-groups', async (c) => {
    const user = getUser(c)
    if (!user.companyId) return c.json(errorBody('FORBIDDEN', 'No company context'), 403)

    const groups = await db.queryAll<{ id: string; name: string; company_id: string }>({
      text: 'SELECT id, name, company_id FROM business_groups WHERE company_id = ? ORDER BY created_at ASC',
      params: [user.companyId],
    })

    const result = await Promise.all(
      groups.map(async (g) => {
        const members = await db.queryAll<{
          m_id: string
          profile_id: string
          display_name: string
          email: string
        }>({
          text: `SELECT m.id AS m_id, m.profile_id, p.display_name, p.email
                 FROM business_group_members m
                 JOIN user_profiles p ON p.id = m.profile_id
                 WHERE m.group_id = ? ORDER BY m.created_at ASC`,
          params: [g.id],
        })
        return {
          id: g.id,
          name: g.name,
          companyId: g.company_id,
          memberCount: members.length,
          members: members.map((m) => ({
            id: m.m_id,
            profileId: m.profile_id,
            displayName: m.display_name,
            email: m.email,
          })),
        }
      }),
    )

    return c.json(result)
  })

  // POST /api/business-groups
  app.post('/api/business-groups', async (c) => {
    const user = getUser(c)
    if (user.role !== 'admin') return c.json(errorBody('FORBIDDEN', 'Admin only'), 403)
    if (!user.companyId) return c.json(errorBody('FORBIDDEN', 'No company context'), 403)

    const body = await c.req.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return c.json(errorBody('VALIDATION_ERROR', 'name is required'), 400)

    const id = randomUUID()
    const ts = now()
    await db.run({
      text: 'INSERT INTO business_groups (id, company_id, name, created_at) VALUES (?, ?, ?, ?)',
      params: [id, user.companyId, name, ts],
    })

    return c.json({ id, name, companyId: user.companyId, memberCount: 0, members: [] }, 201)
  })

  // POST /api/business-groups/:id/members
  app.post('/api/business-groups/:id/members', async (c) => {
    const user = getUser(c)
    if (user.role !== 'admin') return c.json(errorBody('FORBIDDEN', 'Admin only'), 403)

    const groupId = c.req.param('id')
    const group = await db.queryOne<{ id: string; company_id: string }>({
      text: 'SELECT id, company_id FROM business_groups WHERE id = ? AND company_id = ?',
      params: [groupId, user.companyId],
    })
    if (!group) return c.json(errorBody('NOT_FOUND', 'Business group not found'), 404)

    const body = await c.req.json().catch(() => ({}))
    const profileId = typeof body.profileId === 'string' ? body.profileId.trim() : ''
    if (!profileId) return c.json(errorBody('VALIDATION_ERROR', 'profileId is required'), 400)

    const profile = await db.queryOne<{ id: string; display_name: string }>({
      text: 'SELECT id, display_name FROM user_profiles WHERE id = ? AND company_id = ?',
      params: [profileId, user.companyId],
    })
    if (!profile) return c.json(errorBody('NOT_FOUND', 'User profile not found'), 404)

    const existing = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM business_group_members WHERE group_id = ? AND profile_id = ?',
      params: [groupId, profileId],
    })
    if (existing) return c.json(errorBody('CONFLICT', 'Already a member'), 409)

    const memberRecordId = randomUUID()
    const ts = now()
    await db.run({
      text: 'INSERT INTO business_group_members (id, group_id, profile_id, created_at) VALUES (?, ?, ?, ?)',
      params: [memberRecordId, groupId, profileId, ts],
    })

    return c.json(
      { id: memberRecordId, groupId, profileId, displayName: profile.display_name },
      201,
    )
  })

  // DELETE /api/business-groups/:id/members/:profileId
  app.delete('/api/business-groups/:id/members/:profileId', async (c) => {
    const user = getUser(c)
    if (user.role !== 'admin') return c.json(errorBody('FORBIDDEN', 'Admin only'), 403)

    const groupId = c.req.param('id')
    const profileId = c.req.param('profileId')

    const result = await db.run({
      text: 'DELETE FROM business_group_members WHERE group_id = ? AND profile_id = ?',
      params: [groupId, profileId],
    })
    if (result.changes === 0) return c.json(errorBody('NOT_FOUND', 'Member not found'), 404)

    return c.body(null, 204)
  })

  // GET /api/routing-rules
  app.get('/api/routing-rules', async (c) => {
    const user = getUser(c)
    if (!user.companyId) return c.json(errorBody('FORBIDDEN', 'No company context'), 403)

    const rules = await db.queryAll<{
      id: string
      company_id: string
      category: string
      target_group_id: string
      target_group_name: string
    }>({
      text: `SELECT r.id, r.company_id, r.category, r.target_group_id, g.name AS target_group_name
             FROM category_routing_rules r
             JOIN business_groups g ON g.id = r.target_group_id
             WHERE r.company_id = ? ORDER BY r.created_at ASC`,
      params: [user.companyId],
    })

    return c.json(
      rules.map((r) => ({
        id: r.id,
        companyId: r.company_id,
        category: r.category,
        targetGroupId: r.target_group_id,
        targetGroupName: r.target_group_name,
      })),
    )
  })

  // POST /api/routing-rules
  app.post('/api/routing-rules', async (c) => {
    const user = getUser(c)
    if (user.role !== 'admin') return c.json(errorBody('FORBIDDEN', 'Admin only'), 403)
    if (!user.companyId) return c.json(errorBody('FORBIDDEN', 'No company context'), 403)

    const body = await c.req.json().catch(() => ({}))
    const category = typeof body.category === 'string' ? body.category.trim() : ''
    const targetGroupId = typeof body.targetGroupId === 'string' ? body.targetGroupId.trim() : ''
    if (!category || !targetGroupId)
      return c.json(errorBody('VALIDATION_ERROR', 'category and targetGroupId are required'), 400)

    const group = await db.queryOne<{ id: string; name: string }>({
      text: 'SELECT id, name FROM business_groups WHERE id = ? AND company_id = ?',
      params: [targetGroupId, user.companyId],
    })
    if (!group) return c.json(errorBody('NOT_FOUND', 'Target business group not found'), 404)

    const existing = await db.queryOne<{ id: string }>({
      text: 'SELECT id FROM category_routing_rules WHERE company_id = ? AND category = ?',
      params: [user.companyId, category],
    })
    if (existing) return c.json(errorBody('CONFLICT', 'Routing rule for this category already exists'), 409)

    const id = randomUUID()
    const ts = now()
    await db.run({
      text: 'INSERT INTO category_routing_rules (id, company_id, category, target_group_id, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [id, user.companyId, category, targetGroupId, ts],
    })

    return c.json(
      {
        id,
        companyId: user.companyId,
        category,
        targetGroupId,
        targetGroupName: group.name,
      },
      201,
    )
  })
}
