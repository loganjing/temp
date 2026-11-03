import type { Context } from 'hono'
import type { AuthUser } from '@commonapp/userkit'
import { ServiceError } from '../services/errors'

export function getUser(c: Context): AuthUser {
  const user = (c as unknown as { get(key: string): AuthUser }).get('currentUser')
  if (!user) throw new ServiceError(401, 'unauthorized', 'Not authenticated')
  return user
}

export function isAdmin(user: AuthUser): boolean {
  return user.roles.includes('admin')
}

export function isHandler(user: AuthUser): boolean {
  return user.roles.includes('handler') || isAdmin(user)
}

export function getCompanyScope(user: AuthUser, queryCompanyId?: string): string {
  if (isAdmin(user) && queryCompanyId) return queryCompanyId
  if (!user.companyId) throw new ServiceError(403, 'forbidden', 'No company associated with your account')
  return user.companyId
}

export function errorResponse(c: Context, status: 400 | 401 | 403 | 404 | 409 | 500, code: string, message: string) {
  return c.json({ error: { code, message } }, status)
}

export function handleServiceError(c: Context, error: unknown) {
  if (error instanceof ServiceError) return errorResponse(c, error.status, error.code, error.message)
  throw error
}

export function requireString(value: unknown, name: string, maxLength = 2000): string {
  if (typeof value !== 'string' || !value.trim()) throw new ServiceError(400, 'invalid_input', `${name} is required`)
  if (value.length > maxLength) throw new ServiceError(400, 'invalid_input', `${name} is too long`)
  return value.trim()
}
