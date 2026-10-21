import type { Context, Hono } from 'hono'
import type { initializePlatform } from '../platform/bootstrap'
import { contextUser, readJson, wrap } from '../http'
import { loadSession, requireRole, ROLES } from '../session'
import { createUserAccount, listUsers, updateUserAccount } from '../services/user-profile'
import { optionalInt, parsePagination, requireEmail, requireEnum, requireInt, requireSecret, requireString } from '../validation'

type Platform = Awaited<ReturnType<typeof initializePlatform>>

/** user-profile 域（契约 §2）：开户与业务档案；路由级 admin 角色收紧（架构基线第 6 节）。 */

export function registerUserRoutes(app: Hono, platform: Platform) {
  const sessionOf = (c: Context) => loadSession(platform.db, contextUser(c))

  app.get('/api/users', wrap(async (c) => {
    requireRole(await sessionOf(c), 'admin')
    const companyId = optionalInt(c.req.query('companyId'), 'companyId')
    const { page, pageSize } = parsePagination(c.req.query())
    return c.json(await listUsers(platform.db, { companyId, page, pageSize }))
  }))

  app.post('/api/users', wrap(async (c) => {
    requireRole(await sessionOf(c), 'admin')
    const body = await readJson(c)
    const account = await createUserAccount(platform.db, platform.auth.hashPassword, {
      username: requireString(body.username, 'username', 3, 64),
      password: requireSecret(body.password, 'password', 8, 128),
      displayName: requireString(body.displayName, 'displayName', 1, 64),
      email: requireEmail(body.email, 'email'),
      companyId: requireInt(body.companyId, 'companyId'),
      department: requireString(body.department, 'department', 0, 64),
      role: requireEnum(body.role, 'role', ROLES),
    })
    return c.json(account, 201)
  }))

  app.put('/api/users/:userId/profile', wrap(async (c) => {
    requireRole(await sessionOf(c), 'admin')
    const body = await readJson(c)
    const account = await updateUserAccount(platform.db, c.req.param('userId') ?? '', {
      displayName: body.displayName === undefined ? undefined : requireString(body.displayName, 'displayName', 1, 64),
      email: body.email === undefined ? undefined : requireEmail(body.email, 'email'),
      companyId: body.companyId === undefined ? undefined : requireInt(body.companyId, 'companyId'),
      department: body.department === undefined ? undefined : requireString(body.department, 'department', 0, 64),
      role: body.role === undefined ? undefined : requireEnum(body.role, 'role', ROLES),
    })
    return c.json(account)
  }))
}
