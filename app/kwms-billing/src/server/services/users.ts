import type { DbClient } from '@commonapp/dbkit'
import type { AuthUser } from '@commonapp/userkit'
import { errors } from '../common/errors'
import { recordAuditEvent } from './auditlog'

// 用户与角色管理（技术契约第 12 节）：承载 user:manage 与 role:config；
// username 即登录名（本地密码身份以 users.email 存储），凭证只写不读。

export function createUsersService(db: DbClient, platform: {
  userStore: {
    findById(id: string): Promise<{ id: string; name: string; email: string; companyId: string | null; enabled: boolean } | null>
    findByField(field: string, value: string): Promise<{ id: string } | null>
    create(input: { name: string; email: string; companyId?: string | null; passwordChangeRequired?: boolean }, passwordHash: string): Promise<{ id: string }>
    update(id: string, input: { name: string; email: string; phone?: string | null; companyId?: string | null }): Promise<{ id: string } | null>
    setEnabled(id: string, enabled: boolean): Promise<boolean>
  }
  hashPassword(password: string): string
  permissionKit: {
    getRoles(userId: string): Promise<string[]>
    assignRole(userId: string, roleKey: string, scope?: { type?: string; id?: string }): Promise<void>
    revokeRole(userId: string, roleKey: string, scope?: { type?: string; id?: string }): Promise<void>
    listRoles(): Promise<Array<{ key: string; name: string }>>
  }
  auditKit: { record(event: { type: string; actorUserId?: string; metadata?: Record<string, unknown> }): Promise<void> }
}) {
  interface PublicUserRow {
    id: string
    username: string
    name: string
    roles: string[]
    orgId: string | null
    status: string
  }

  async function toPublicUser(userId: string): Promise<PublicUserRow> {
    const user = await platform.userStore.findById(userId)
    if (!user) throw errors.notFound('用户不存在')
    const roles = await platform.permissionKit.getRoles(userId)
    return {
      id: user.id,
      username: user.email,
      name: user.name,
      roles,
      orgId: user.companyId,
      status: user.enabled ? 'active' : 'disabled',
    }
  }

  async function list(page: number, pageSize: number): Promise<{ items: PublicUserRow[]; total: number }> {
    const total = await db.queryOne<{ total: number }>({ text: 'SELECT COUNT(*) AS total FROM users' })
    const rows = await db.queryAll<{ id: string }>({
      text: 'SELECT id FROM users ORDER BY created_at, id LIMIT ? OFFSET ?',
      params: [pageSize, (page - 1) * pageSize],
    })
    const items = await Promise.all(rows.map((row) => toPublicUser(row.id)))
    return { items, total: Number(total?.total ?? 0) }
  }

  async function create(operator: AuthUser, payload: { username?: string; password?: string; name?: string; roles?: string[]; orgId?: string }): Promise<PublicUserRow> {
    if (!payload.username?.trim()) throw errors.required('username')
    if (!payload.password) throw errors.required('password')
    if (!payload.name?.trim()) throw errors.required('name')
    if (payload.password.length < 12) throw errors.invalidInput('密码长度至少 12 位', 'password')
    const username = payload.username.trim().toLowerCase()
    if (!username.includes('@')) throw errors.invalidInput('username 必须为邮箱格式', 'username')
    const existing = await platform.userStore.findByField('email', username)
    if (existing) throw errors.invalidInput('用户名已存在', 'username')
    const validRoles = new Set((await platform.permissionKit.listRoles()).map((role) => role.key))
    const roles = payload.roles ?? []
    if (roles.some((role) => !validRoles.has(role))) throw errors.invalidInput('角色不存在', 'roles')

    const user = await platform.userStore.create({ name: payload.name.trim(), email: username, companyId: payload.orgId ?? null, passwordChangeRequired: false }, platform.hashPassword(payload.password))
    for (const role of roles) {
      await platform.permissionKit.assignRole(user.id, role)
    }
    await recordAuditEvent(platform.auditKit, { action: '新增', entityType: 'user', entityId: user.id, actorUserId: operator.id, metadata: { username, roles } })
    return toPublicUser(user.id)
  }

  async function update(operator: AuthUser, id: string, payload: { name?: string; roles?: string[]; orgId?: string | null; status?: string }): Promise<PublicUserRow> {
    const existing = await platform.userStore.findById(id)
    if (!existing) throw errors.notFound('用户不存在')
    if (payload.name !== undefined && !payload.name.trim()) throw errors.required('name')
    if (payload.name !== undefined) {
      await platform.userStore.update(id, { name: payload.name.trim(), email: existing.email })
    }
    if (payload.orgId !== undefined) {
      await platform.userStore.update(id, { name: payload.name?.trim() ?? existing.name, email: existing.email, companyId: payload.orgId })
    }
    if (payload.roles !== undefined) {
      const validRoles = new Set((await platform.permissionKit.listRoles()).map((role) => role.key))
      if (payload.roles.some((role) => !validRoles.has(role))) throw errors.invalidInput('角色不存在', 'roles')
      const current = await platform.permissionKit.getRoles(id)
      for (const role of current) {
        if (!payload.roles.includes(role)) await platform.permissionKit.revokeRole(id, role)
      }
      for (const role of payload.roles) {
        if (!current.includes(role)) await platform.permissionKit.assignRole(id, role)
      }
    }
    if (payload.status !== undefined) {
      if (payload.status !== 'active' && payload.status !== 'disabled') throw errors.invalidInput('status 取值无效（active|disabled）', 'status')
      await platform.userStore.setEnabled(id, payload.status === 'active')
    }
    await recordAuditEvent(platform.auditKit, { action: '编辑', entityType: 'user', entityId: id, actorUserId: operator.id, metadata: { roles: payload.roles, status: payload.status } })
    return toPublicUser(id)
  }

  return { list, create, update }
}

export type UsersService = ReturnType<typeof createUsersService>
