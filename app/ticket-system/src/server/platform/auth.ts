import { createAuth } from '@commonapp/authkit'
import type { MiddlewareHandler } from 'hono'
import { createUserResolver, createUserStore } from '@commonapp/userkit'
import type { DbClient } from '@commonapp/dbkit'

export function createApplicationAuth(db: DbClient) {
  const userStore = createUserStore(db)
  // 从 users.role 列读取工单系统角色（submitter/handler/admin）
  const getRoles = async (userId: string): Promise<string[]> => {
    const row = await db.queryOne<{ role: string | null }>({
      text: 'SELECT role FROM users WHERE id = ?',
      params: [userId],
    })
    return row?.role ? [row.role] : ['submitter']
  }
  const baseResolver = createUserResolver(userStore, { getRoles })
  // 包装 resolver，补充 department_id 供工单业务使用
  const userResolver = {
    findById: async (id: string) => {
      const user = await baseResolver.findById(id)
      if (!user) return null
      const row = await db.queryOne<{ department_id: string | null }>({
        text: 'SELECT department_id FROM users WHERE id = ?',
        params: [id],
      })
      return { ...user, departmentId: row?.department_id ?? null }
    },
    findByField: async (field: string, value: string) => {
      const user = await baseResolver.findByField(field, value)
      if (!user) return null
      const row = await db.queryOne<{ department_id: string | null }>({
        text: 'SELECT department_id FROM users WHERE id = ?',
        params: [user.id],
      })
      return { ...user, departmentId: row?.department_id ?? null }
    },
    findByCredential: (identifier: string, field?: 'email' | 'phone') =>
      baseResolver.findByCredential(identifier, field),
  }
  const auth = createAuth({ userResolver })
  const loginRoute = auth.createLoginRoute({
    loginField: 'email',
    findByCredential: async (email) => {
      const user = await userStore.findByCredential(email, 'email')
      if (!user) return null
      const roles = await getRoles(user.id)
      return {
        id: user.id,
        role: roles.includes('admin') ? 'admin' : (roles[0] ?? 'user'),
        status: user.enabled ? 'active' : 'disabled',
        passwordHash: user.passwordHash,
        name: user.name,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId,
        roles,
        passwordChangeRequired: user.passwordChangeRequired,
      }
    },
    responseTransform: (user, token) => ({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, companyId: user.companyId, role: user.role, roles: user.roles, passwordChangeRequired: user.passwordChangeRequired },
    }),
  })
  const requireAnyAuth: MiddlewareHandler = (context, next) =>
    (auth.requireAnyAuth as MiddlewareHandler)(context, async () => {
      const user = (context as unknown as { get(key: string): { passwordChangeRequired?: boolean } }).get('currentUser')
      if (user.passwordChangeRequired && !['/api/auth/me', '/api/auth/password'].includes(context.req.path)) {
        context.res = context.json({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing' } }, 403)
        return
      }
      await next()
    })
  return { ...auth, requireAnyAuth, userStore, userResolver, loginRoute }
}
