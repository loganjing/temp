import type { MiddlewareHandler } from 'hono'

export const localeMiddleware: MiddlewareHandler = async (_context, next) => next()
