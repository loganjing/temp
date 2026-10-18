// Shared route-handler helpers: session/role guards, safe JSON bodies and
// numeric path params. Malformed ids surface as 404, never as a 500.
import type { Context } from 'hono'
import type { Locale } from '../../shared/domain'
import { forbidden, notFound, validation } from '../core/errors'
import { message } from '../core/messages'
import { requestLocale, requireSession, type AppEnv, type SessionUser } from '../core/session'

export function requireAdmin(c: Context<AppEnv>): SessionUser {
  const user = requireSession(c)
  if (user.role !== 'admin') throw forbidden(message(requestLocale(c), 'forbidden'))
  return user
}

export function numericParam(c: Context<AppEnv>, name: string): number {
  const value = Number(c.req.param(name))
  if (!Number.isInteger(value) || value <= 0) throw notFound(message(requestLocale(c), 'notFound'))
  return value
}

export async function safeJsonBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json<unknown>()
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>
  } catch {
    // Invalid bodies behave like empty ones; downstream field validation
    // produces the contract error.
  }
  return {}
}

export function stringOf(body: Record<string, unknown>, field: string): string {
  const value = body[field]
  return typeof value === 'string' ? value : ''
}

export function requireString(body: Record<string, unknown>, field: string, locale: Locale): string {
  const value = body[field]
  if (typeof value !== 'string' || !value.trim()) {
    throw validation(message(locale, 'validation'), [field])
  }
  return value
}

export function pageParam(c: Context<AppEnv>): number {
  return Math.max(1, Number(c.req.query('page') ?? 1) || 1)
}

export function csvResponse(csv: string): Response {
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } })
}
