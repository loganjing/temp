import type { MiddlewareHandler } from 'hono'

// 需求未要求认证；authBoundary 直通，允许业务路由直接访问。
export const authBoundary: MiddlewareHandler = async (_c, next) => { await next() }
