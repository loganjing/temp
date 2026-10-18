/**
 * identity 域（契约形状）：/api/users、/api/roles、/api/auth/logout、/api/auth/me 权限汇总。
 * 平台级 /api/admin/* 路由保留在 routes.ts（骨架），本域只补契约第 1 节端点。
 */
import type { Hono } from 'hono'
import type { Platform } from '../platform/bootstrap'
import { newId } from '../platform/authorization'
import { errors, readJsonBody, requiredString, optionalString, currentActor, pagedResponse } from '../lib/api'
import { auditEvent, nowIso, requirePermission, type DomainRoutes, type Row } from '../lib/db'

function mapUser(row: Row, roles: string[]) {
  return {
    id: String(row.id),
    username: String(row.email),
    displayName: String(row.name),
    active: Boolean(row.enabled),
    roles,
  }
}

export const registerIdentityRoutes: DomainRoutes = (app, platform) => {
  app.post('/api/auth/logout', async (context) => {
    const actor = currentActor(context)
    const header = context.req.header('Authorization')
    if (header?.startsWith('Bearer ')) platform.auth.revokeToken(header.slice(7))
    await auditEvent(platform, { type: 'platform.user.logged_out', actorUserId: actor.id, objectType: 'user', objectId: actor.id, summary: '用户注销' })
    return context.body(null, 204)
  })

  app.get('/api/auth/me', async (context) => {
    const actor = currentActor(context)
    const user = await platform.auth.userStore.findById(actor.id)
    if (!user) throw errors.notFound('User not found')
    const roles = await platform.permissionKit.getRoles(actor.id)
    const permissions = await platform.auth.permissionsOf(actor.id)
    return context.json({
      id: user.id,
      username: user.email,
      displayName: user.name,
      roles,
      permissions,
    })
  })

  app.get('/api/users', async (context) => {
    await requirePermission(context, platform, 'users:manage')
    const roleId = context.req.query('roleId')
    const active = context.req.query('active')
    let rows = await platform.db.queryAll<Row>({ text: 'SELECT * FROM users ORDER BY created_at' })
    if (roleId || active !== undefined) {
      const assignments = new Set(
        (await platform.db.queryAll<Row>(roleId ? { text: 'SELECT user_id FROM user_role_assignments WHERE role_key = ?', params: [roleId] } : { text: 'SELECT user_id FROM user_role_assignments' }))
          .map((row) => String(row.user_id))
      )
      rows = rows.filter((row) => {
        if (roleId && !assignments.has(String(row.id))) return false
        if (active !== undefined) {
          const isActive = Boolean(row.enabled)
          if (active === 'true' ? !isActive : isActive) return false
        }
        return true
      })
    }
    const users = await Promise.all(
      rows.map(async (row) => mapUser(row, await platform.permissionKit.getRoles(String(row.id))))
    )
    return context.json(pagedResponse(users, users.length, 1, Math.max(users.length, 1)))
  })

  app.post('/api/users', async (context) => {
    await requirePermission(context, platform, 'users:manage')
    const actor = currentActor(context)
    const body = await readJsonBody(context)
    const displayName = requiredString(body.displayName, 'displayName')
    const username = requiredString(body.username, 'username', 320).toLowerCase()
    const password = requiredString(body.password, 'password', 256)
    if (!username.includes('@')) throw errors.validationFailed([{ field: 'username', reason: 'must be an email-style identifier' }])
    if (password.length < 12) throw errors.validationFailed([{ field: 'password', reason: 'must contain at least 12 characters' }])
    const roleIds = Array.isArray(body.roleIds) ? body.roleIds.map((item) => String(item)) : []
    const active = body.active === false ? false : true
    const id = newId('usr')
    const timestamp = nowIso()
    await platform.db.transaction(async (tx) => {
      await tx.run({
        text: 'INSERT INTO users (id, name, email, phone, enabled, company_id, password_hash, password_change_required, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, NULL, ?, 0, ?, ?)',
        params: [id, displayName, username, active ? 1 : 0, platform.auth.hashPassword(password), timestamp, timestamp],
      })
      for (const roleKey of roleIds) {
        await tx.run({
          text: 'INSERT INTO user_role_assignments (user_id, role_key, scope_type, scope_id, created_at) VALUES (?, ?, ?, ?, ?)',
          params: [id, roleKey, '', '', timestamp],
        })
      }
    })
    await auditEvent(platform, { type: 'platform.user.created', actorUserId: actor.id, objectType: 'user', objectId: id, summary: `创建用户 ${username}` })
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM users WHERE id = ?', params: [id] })
    return context.json(mapUser(row!, await platform.permissionKit.getRoles(id)), 201)
  })

  app.patch('/api/users/:id', async (context) => {
    await requirePermission(context, platform, 'users:manage')
    const actor = currentActor(context)
    const id = context.req.param('id')
    const existing = await platform.auth.userStore.findById(id)
    if (!existing) throw errors.notFound('User not found')
    const body = await readJsonBody(context)
    const updates: Record<string, unknown> = {}
    if (body.displayName !== undefined) updates.name = requiredString(body.displayName, 'displayName')
    if (body.username !== undefined) {
      const username = requiredString(body.username, 'username', 320).toLowerCase()
      if (!username.includes('@')) throw errors.validationFailed([{ field: 'username', reason: 'must be an email-style identifier' }])
      updates.email = username
    }
    if (body.active !== undefined) updates.enabled = body.active === true ? 1 : 0
    if (Object.keys(updates).length > 0) {
      updates.updated_at = nowIso()
      const setSql = Object.keys(updates).map((key) => `${key} = ?`).join(', ')
      await platform.db.run({ text: `UPDATE users SET ${setSql} WHERE id = ?`, params: [...Object.values(updates), id] })
    }
    if (Array.isArray(body.roleIds)) {
      const timestamp = nowIso()
      const roleKeys = body.roleIds.map((item) => String(item))
      await platform.db.transaction(async (tx) => {
        await tx.run({ text: 'DELETE FROM user_role_assignments WHERE user_id = ?', params: [id] })
        for (const roleKey of roleKeys) {
          await tx.run({
            text: 'INSERT INTO user_role_assignments (user_id, role_key, scope_type, scope_id, created_at) VALUES (?, ?, ?, ?, ?)',
            params: [id, roleKey, '', '', timestamp],
          })
        }
      })
    }
    await auditEvent(platform, { type: 'platform.user.updated', actorUserId: actor.id, objectType: 'user', objectId: id, summary: '更新用户资料/角色' })
    const row = await platform.db.queryOne<Row>({ text: 'SELECT * FROM users WHERE id = ?', params: [id] })
    return context.json(mapUser(row!, await platform.permissionKit.getRoles(id)))
  })

  app.get('/api/roles', async (context) => {
    await requirePermission(context, platform, 'roles:manage')
    const roles = await platform.db.queryAll<Row>({ text: 'SELECT r.role_key, r.name FROM roles r ORDER BY r.role_key' })
    const permissions = await platform.db.queryAll<Row>({ text: 'SELECT role_key, permission_key FROM role_permissions' })
    return context.json({
      items: roles.map((role) => ({
        id: String(role.role_key),
        code: String(role.role_key),
        name: String(role.name),
        permissionCodes: permissions.filter((entry) => String(entry.role_key) === String(role.role_key)).map((entry) => String(entry.permission_key)),
      })),
    })
  })

  app.post('/api/roles', async (context) => {
    await requirePermission(context, platform, 'roles:manage')
    const actor = currentActor(context)
    const body = await readJsonBody(context)
    const code = requiredString(body.code, 'code', 60)
    const name = requiredString(body.name, 'name', 100)
    const permissionCodes = Array.isArray(body.permissionCodes) ? body.permissionCodes.map((item) => String(item)) : []
    const existing = await platform.db.queryOne<Row>({ text: 'SELECT role_key FROM roles WHERE role_key = ?', params: [code] })
    if (existing) throw errors.statusConflict(`role ${code} already exists`)
    const timestamp = nowIso()
    await platform.db.transaction(async (tx) => {
      await tx.run({ text: 'INSERT INTO roles (role_key, name, updated_at) VALUES (?, ?, ?)', params: [code, name, timestamp] })
      for (const permissionCode of permissionCodes) {
        const known = await tx.queryOne<Row>({ text: 'SELECT permission_key FROM permissions WHERE permission_key = ?', params: [permissionCode] })
        if (!known) throw errors.validationFailed([{ field: 'permissionCodes', reason: `unknown permission ${permissionCode}` }])
        await tx.run({ text: 'INSERT INTO role_permissions (role_key, permission_key) VALUES (?, ?)', params: [code, permissionCode] })
      }
    })
    await auditEvent(platform, { type: 'platform.role.created', actorUserId: actor.id, objectType: 'role', objectId: code, summary: `创建角色 ${code}` })
    return context.json({ id: code, code, name, permissionCodes }, 201)
  })

  void optionalString
}
