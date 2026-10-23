import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore, type AuthUser, type UserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'

/** 扩展 AuthUser，携带 departmentId 供 /api/auth/me 返回 */
export type AppAuthUser = AuthUser & { departmentId: string | null }

/** 从 user_role_assignments 表加载用户角色列表 */
async function loadUserRoles(db: DbClient, userId: string): Promise<string[]> {
  const rows = await db.queryAll<{ role_key: string }>({
    text: 'SELECT role_key FROM user_role_assignments WHERE user_id = ?',
    params: [userId],
  })
  return rows.length > 0 ? rows.map((r) => r.role_key) : ['user']
}

/** 从 users 表加载 department_id 列 */
async function loadDepartmentId(db: DbClient, userId: string): Promise<string | null> {
  const row = await db.queryOne<{ department_id: string | null }>({
    text: 'SELECT department_id FROM users WHERE id = ?',
    params: [userId],
  })
  return row?.department_id ?? null
}

/** 创建带角色和部门扩展的用户解析器 */
function createAppUserResolver(db: DbClient, userStore: UserStore) {
  const base = createUserResolver(userStore, {
    getRoles: (userId: string) => loadUserRoles(db, userId),
  })
  const enhance = async (user: AuthUser | null): Promise<AppAuthUser | null> => {
    if (!user) return null
    const departmentId = await loadDepartmentId(db, user.id)
    return { ...user, departmentId }
  }
  return {
    findById: async (id: string) => enhance(await base.findById(id)),
    findByField: async (field: string, value: string) => enhance(await base.findByField(field, value)),
    findByCredential: (identifier: string, field?: 'email' | 'phone') => base.findByCredential(identifier, field),
  }
}

export function createApplicationAuth(db: DbClient, options: { permissionKit: { getRoles: (userId: string) => Promise<string[]> } }) {
  const userStore = createUserStore(db)
  const userResolver = createAppUserResolver(db, userStore)
  const auth = createAuth({ userResolver })
  const loginRoute = auth.createLoginRoute({
    loginField: 'email',
    findByCredential: async (email) => {
      const user = await userStore.findByCredential(email, 'email')
      if (!user) return null
      const roles = await options.permissionKit.getRoles(user.id)
      const departmentId = await loadDepartmentId(db, user.id)
      return {
        id: user.id,
        role: roles[0] ?? 'user',
        status: user.enabled ? 'active' : 'disabled',
        passwordHash: user.passwordHash,
        name: user.name,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId,
        departmentId,
        roles: roles.length > 0 ? roles : ['user'],
        passwordChangeRequired: user.passwordChangeRequired,
      }
    },
    responseTransform: (user, token) => ({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        roles: user.roles,
        passwordChangeRequired: user.passwordChangeRequired,
        companyId: user.companyId,
        departmentId: (user as AppAuthUser).departmentId ?? null,
      },
    }),
  })
  const requireAnyAuth: MiddlewareHandler = async (context, next) => {
    let passwordChangeRequired = false
    await (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const user = (context as unknown as { get(key: string): unknown }).get('currentUser') as AppAuthUser | undefined
      if (user?.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        passwordChangeRequired = true
        return
      }
      await next()
    })
    if (passwordChangeRequired) {
      return context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
    }
  }
  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute }
}
