import type { MiddlewareHandler } from 'hono'

// 未选择 authkit 的项目由批准设计自行实现认证边界。
export const authBoundary: MiddlewareHandler = async (_context, next) => next()
