import type { Context, Hono } from 'hono'
import type { initializePlatform } from '../platform/bootstrap'
import { contextUser, intParam, readJson, wrap } from '../http'
import { loadSession, requireRole } from '../session'
import {
  addMember,
  createCompany,
  createGroup,
  createRoutingRule,
  deleteGroup,
  deleteRoutingRule,
  listCompanies,
  listCategories,
  listGroups,
  listMembers,
  listRoutingRules,
  removeMember,
  renameGroup,
  updateRoutingRule,
} from '../services/org-config'
import { requireInt, requireString } from '../validation'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

/** org-config 域（契约 §3/§4/§5）：公司、分类字典、业务组、成员、分类自动分配规则。 */

export function registerOrgRoutes(app: Hono, platform: Platform) {
  const adminOf = async (c: Context) => requireRole(await loadSession(platform.db, contextUser(c)), 'admin')

  app.get('/api/companies', wrap(async (c) => {
    await adminOf(c)
    return c.json(await listCompanies(platform.db))
  }))

  app.post('/api/companies', wrap(async (c) => {
    await adminOf(c)
    const body = await readJson(c)
    return c.json(await createCompany(platform.db, requireString(body.name, 'name', 1, 100)), 201)
  }))

  app.get('/api/categories', wrap(async (c) => {
    await loadSession(platform.db, contextUser(c))
    return c.json(await listCategories(platform.db))
  }))

  app.get('/api/companies/:companyId/groups', wrap(async (c) => {
    await adminOf(c)
    return c.json(await listGroups(platform.db, intParam(c, 'companyId', 'Company')))
  }))

  app.post('/api/companies/:companyId/groups', wrap(async (c) => {
    await adminOf(c)
    const body = await readJson(c)
    const group = await createGroup(platform.db, intParam(c, 'companyId', 'Company'), requireString(body.name, 'name', 1, 100))
    return c.json(group, 201)
  }))

  app.put('/api/groups/:groupId', wrap(async (c) => {
    await adminOf(c)
    const body = await readJson(c)
    return c.json(await renameGroup(platform.db, intParam(c, 'groupId', 'Group'), requireString(body.name, 'name', 1, 100)))
  }))

  app.delete('/api/groups/:groupId', wrap(async (c) => {
    await adminOf(c)
    await deleteGroup(platform.db, intParam(c, 'groupId', 'Group'))
    return c.body(null, 204)
  }))

  app.get('/api/groups/:groupId/members', wrap(async (c) => {
    await adminOf(c)
    return c.json(await listMembers(platform.db, intParam(c, 'groupId', 'Group')))
  }))

  app.post('/api/groups/:groupId/members', wrap(async (c) => {
    await adminOf(c)
    const body = await readJson(c)
    return c.json(await addMember(platform.db, intParam(c, 'groupId', 'Group'), requireString(body.userId, 'userId', 1, 64)), 201)
  }))

  app.delete('/api/groups/:groupId/members/:userId', wrap(async (c) => {
    await adminOf(c)
    await removeMember(platform.db, intParam(c, 'groupId', 'Group'), c.req.param('userId') ?? '')
    return c.body(null, 204)
  }))

  app.get('/api/companies/:companyId/routing-rules', wrap(async (c) => {
    await adminOf(c)
    return c.json(await listRoutingRules(platform.db, intParam(c, 'companyId', 'Company')))
  }))

  app.post('/api/companies/:companyId/routing-rules', wrap(async (c) => {
    await adminOf(c)
    const body = await readJson(c)
    const rule = await createRoutingRule(platform.db, intParam(c, 'companyId', 'Company'), {
      categoryId: requireInt(body.categoryId, 'categoryId'),
      groupId: requireInt(body.groupId, 'groupId'),
    })
    return c.json(rule, 201)
  }))

  app.put('/api/routing-rules/:ruleId', wrap(async (c) => {
    await adminOf(c)
    const body = await readJson(c)
    return c.json(await updateRoutingRule(platform.db, intParam(c, 'ruleId', 'Routing rule'), requireInt(body.groupId, 'groupId')))
  }))

  app.delete('/api/routing-rules/:ruleId', wrap(async (c) => {
    await adminOf(c)
    await deleteRoutingRule(platform.db, intParam(c, 'ruleId', 'Routing rule'))
    return c.body(null, 204)
  }))
}
