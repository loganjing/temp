import type { Context } from 'hono'
import type { AuthUser } from '@commonapp/userkit'
import type { Identity, IdentityService } from '../services/identity'
import { forbidden, readBody, unauthenticated } from '../errors'

export function currentAuthUser(context: Context): AuthUser {
  const user = (context as unknown as { get(name: string): AuthUser | undefined }).get('currentUser')
  if (!user) throw unauthenticated()
  return user
}

export async function currentIdentity(context: Context, identityService: IdentityService): Promise<Identity> {
  const user = currentAuthUser(context)
  const identity = await identityService.getById(user.id)
  if (!identity) throw forbidden('账号未分配公司或部门，请联系管理员')
  return identity
}

export async function jsonBody(context: Context): Promise<Record<string, unknown>> {
  return readBody(await context.req.json().catch(() => ({})))
}

export function optionalString(query: string | undefined): string | undefined {
  return query === undefined || query === '' ? undefined : query
}

export function optionalNumber(query: string | undefined): number | undefined {
  if (query === undefined || query.trim() === '') return undefined
  const value = Number(query)
  return Number.isFinite(value) ? value : undefined
}
