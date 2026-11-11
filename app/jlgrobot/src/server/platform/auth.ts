import type { MiddlewareHandler } from 'hono'

// 需求未规定用户角色与权限策略，未选择 authkit。
// 认证边界保持 no-op 放行实现；后续接入 authkit 时替换此处。
export const authBoundary: MiddlewareHandler = async (_context, next) => next()
