import type { MiddlewareHandler } from 'hono'

// 未选择 authkit 的项目仍需按批准设计实现认证边界；绑定前受保护 API 不可访问。
export const authBoundary: MiddlewareHandler = async (context) => context.json({
  error: { code: 'AUTH_NOT_CONFIGURED', message: 'Authentication is not configured' },
}, 503)
