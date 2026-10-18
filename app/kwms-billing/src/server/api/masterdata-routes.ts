import type { Hono } from 'hono'
import { errors } from '../common/errors'
import { jsonBody, route } from '../common/http'
import { assertOrgFilterAllowed, currentUserOf, orgScopeOf, requirePermission, type Platform } from '../common/scope'
import { createMasterdataService } from '../services/masterdata'
import { authorizationRegistry } from '../platform/authorization'

// masterdata 域路由：组织/仓库/货主/合同（只读引用，组织范围过滤）与
// 费用类型、货品类别维护（masterdata:maintain）。

export function registerMasterdataRoutes(app: Hono, platform: Platform) {
  const masterdata = createMasterdataService(platform.db, platform.auditKit)

  app.get('/api/orgs', route(async (context) => {
    const user = currentUserOf(context)
    const scope = orgScopeOf(user)
    // 用户可见组织：管理员全量，其余=所属组织（技术契约第 12 节）
    const items = await masterdata.listOrgs(scope.isAdmin ? null : scope.orgId)
    return context.json({ items })
  }))

  app.get('/api/warehouses', route(async (context) => {
    const user = currentUserOf(context)
    const requested = context.req.query('orgId') || null
    assertOrgFilterAllowed(user, requested)
    const items = await masterdata.listWarehouses(requested ?? orgScopeOf(user).orgId)
    return context.json({ items })
  }))

  app.get('/api/owners', route(async (context) => {
    const user = currentUserOf(context)
    const requested = context.req.query('orgId') || null
    assertOrgFilterAllowed(user, requested)
    const ownerType = context.req.query('ownerType') || null
    const items = await masterdata.listOwners(requested ?? orgScopeOf(user).orgId, ownerType)
    return context.json({ items })
  }))

  app.get('/api/contracts', route(async (context) => {
    const user = currentUserOf(context)
    const requested = context.req.query('orgId') || null
    assertOrgFilterAllowed(user, requested)
    const items = await masterdata.listContracts(requested ?? orgScopeOf(user).orgId)
    return context.json({ items })
  }))

  app.get('/api/masterdata/fee-types', route(async (context) => context.json({ items: await masterdata.listFeeTypes() })))
  app.post('/api/masterdata/fee-types', requirePermission(platform, authorizationRegistry.permissions.masterdataMaintain.key), route(async (context) => {
    const user = currentUserOf(context)
    const body = await jsonBody(context)
    const item = await masterdata.upsertFeeType(user.id, null, { code: optionalTrimmed(body, 'code', 64), name: optionalTrimmed(body, 'name', 200) })
    return context.json({ item }, 201)
  }))
  app.put('/api/masterdata/fee-types/:id', requirePermission(platform, authorizationRegistry.permissions.masterdataMaintain.key), route(async (context) => {
    const id = context.req.param('id') ?? ''
    const existing = await platform.db.queryOne({ text: 'SELECT id FROM fee_types WHERE id = ?', params: [id] })
    if (!existing) throw errors.notFound('费用类型不存在')
    const user = currentUserOf(context)
    const body = await jsonBody(context)
    const item = await masterdata.upsertFeeType(user.id, id, { code: optionalTrimmed(body, 'code', 64), name: optionalTrimmed(body, 'name', 200) })
    return context.json({ item })
  }))

  app.get('/api/masterdata/goods-categories', route(async (context) => context.json({ items: await masterdata.listGoodsCategories() })))
  app.post('/api/masterdata/goods-categories', requirePermission(platform, authorizationRegistry.permissions.masterdataMaintain.key), route(async (context) => {
    const user = currentUserOf(context)
    const body = await jsonBody(context)
    const item = await masterdata.upsertGoodsCategory(user.id, null, { code: optionalTrimmed(body, 'code', 64), name: optionalTrimmed(body, 'name', 200) })
    return context.json({ item }, 201)
  }))
  app.put('/api/masterdata/goods-categories/:id', requirePermission(platform, authorizationRegistry.permissions.masterdataMaintain.key), route(async (context) => {
    const id = context.req.param('id') ?? ''
    const existing = await platform.db.queryOne({ text: 'SELECT id FROM goods_categories WHERE id = ?', params: [id] })
    if (!existing) throw errors.notFound('货品类别不存在')
    const user = currentUserOf(context)
    const body = await jsonBody(context)
    const item = await masterdata.upsertGoodsCategory(user.id, id, { code: optionalTrimmed(body, 'code', 64), name: optionalTrimmed(body, 'name', 200) })
    return context.json({ item })
  }))
}

function optionalTrimmed(body: Record<string, unknown>, field: string, maxLength: number): string | undefined {
  const value = body[field]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw errors.invalidInput(`${field} 须为字符串`, field)
  const trimmed = value.trim()
  if (trimmed.length > maxLength) throw errors.invalidInput(`${field}长度超出限制`, field)
  return trimmed
}
