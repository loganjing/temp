import type { MiddlewareHandler } from 'hono'
import type { UserRole } from '../shared/types'

/** 请求上下文中的当前用户（由认证中间件注入，含工单系统扩展字段）。 */
export interface TicketUser {
  id: string
  role: string
  status: string
  name: string
  email: string
  phone: string | null
  companyId: string | null
  roles: string[]
  passwordChangeRequired: boolean
  departmentId: string | null
}

export function currentUser(context: unknown): TicketUser {
  return (context as { get(name: string): unknown }).get('currentUser') as TicketUser
}

/** 要求当前用户属于指定角色之一，否则 403。 */
export function requireRole(...roles: UserRole[]): MiddlewareHandler {
  const allowed = new Set<string>(roles)
  return async (context, next) => {
    const user = currentUser(context)
    if (!user || !allowed.has(user.role)) {
      return context.json({ error: { code: 'FORBIDDEN', message: 'Insufficient role' } }, 403)
    }
    await next()
  }
}

/**
 * 公司隔离中间件：路径参数中的 :companyId 必须与当前用户公司一致，否则 403。
 * 用于 /api/companies/:companyId/* 路由。
 */
export const requireCompanyMatch: MiddlewareHandler = async (context, next) => {
  const user = currentUser(context)
  const pathCompanyId = context.req.param('companyId')
  if (!user?.companyId || user.companyId !== pathCompanyId) {
    return context.json({ error: { code: 'FORBIDDEN', message: 'Company mismatch' } }, 403)
  }
  await next()
}

/** 确保用户已绑定公司，否则 403。 */
export const requireCompanyBound: MiddlewareHandler = async (context, next) => {
  const user = currentUser(context)
  if (!user?.companyId) {
    return context.json({ error: { code: 'FORBIDDEN', message: 'User has no company' } }, 403)
  }
  await next()
}
