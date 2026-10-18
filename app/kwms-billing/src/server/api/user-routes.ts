import type { Hono } from 'hono'
import { jsonBody, paramOf, paginated, paginationOf, route } from '../common/http'
import { currentUserOf, requirePermission, type Platform } from '../common/scope'
import { authorizationRegistry } from '../platform/authorization'
import { createUsersService } from '../services/users'

// user 域路由（技术契约第 12 节）：用户管理与角色配置。
// GET/POST /api/users（user:manage；POST 含角色需 role:config）；
// PUT /api/users/{id}（user:manage；roles 字段需 role:config）。

export function registerUserRoutes(app: Hono, platform: Platform) {
  const users = createUsersService(platform.db, {
    userStore: platform.auth.userStore,
    hashPassword: platform.auth.hashPassword,
    permissionKit: platform.permissionKit,
    auditKit: platform.auditKit,
  })

  app.get('/api/users', requirePermission(platform, authorizationRegistry.permissions.userManage.key), route(async (context) => {
    const pagination = paginationOf(context)
    const result = await users.list(pagination.page, pagination.pageSize)
    return context.json(paginated(result.items, result.total, pagination))
  }))

  app.post('/api/users', requirePermission(platform, authorizationRegistry.permissions.userManage.key), requirePermission(platform, authorizationRegistry.permissions.roleConfig.key), route(async (context) => {
    const operator = currentUserOf(context)
    const body = await jsonBody(context)
    const created = await users.create(operator, {
      username: body.username as string | undefined,
      password: body.password as string | undefined,
      name: body.name as string | undefined,
      roles: Array.isArray(body.roles) ? body.roles as string[] : [],
      orgId: body.orgId as string | undefined,
    })
    return context.json({ user: created }, 201)
  }))

  app.put('/api/users/:id', requirePermission(platform, authorizationRegistry.permissions.userManage.key), route(async (context) => {
    const operator = currentUserOf(context)
    const body = await jsonBody(context)
    if (body.roles !== undefined) {
      await platform.permissionKit.requirePermission(operator.id, authorizationRegistry.permissions.roleConfig.key)
    }
    const updated = await users.update(operator, paramOf(context, 'id'), {
      name: body.name as string | undefined,
      roles: body.roles as string[] | undefined,
      orgId: body.orgId as string | null | undefined,
      status: body.status as string | undefined,
    })
    return context.json({ user: updated })
  }))
}
