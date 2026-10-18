import type { Context, MiddlewareHandler } from 'hono'
import type { AuthUser } from '@commonapp/userkit'
import type { initializePlatform } from '../platform/bootstrap'
import { errors } from './errors'

export type Platform = Awaited<ReturnType<typeof initializePlatform>>

// 从 Hono 上下文取认证用户（app 未声明 Variables 泛型，此处集中收口类型转换）
export function currentUserOf(context: Context): AuthUser {
  const user = (context as unknown as { get(key: string): unknown }).get('currentUser') as AuthUser | undefined
  if (!user) throw errors.unauthenticated('未登录或会话已失效')
  return user
}

// 组织数据范围：非系统管理员仅限所属组织（users.company_id 由服务端会话推导，不接受请求体指定）
export interface OrgScope {
  orgId: string | null
  isAdmin: boolean
}

export function orgScopeOf(user: AuthUser): OrgScope {
  return { orgId: user.companyId ?? null, isAdmin: user.roles.includes('admin') }
}

// 访问指定组织数据前的越权校验（系统管理员跨组织处理异常例外）
export function assertCanAccessOrg(user: AuthUser, orgId: string): void {
  const scope = orgScopeOf(user)
  if (scope.isAdmin) return
  if (!scope.orgId || scope.orgId !== orgId) throw errors.orgForbidden()
}

// 查询参数 orgId 过滤的越权校验：非管理员仅允许本组织（或省略）
export function assertOrgFilterAllowed(user: AuthUser, requestedOrgId: string | null | undefined): void {
  if (!requestedOrgId) return
  assertCanAccessOrg(user, requestedOrgId)
}

// 权限点校验中间件（permissionkit 承载，失败返回 PERMISSION_DENIED）
export function requirePermission(platform: Platform, permissionKey: string): MiddlewareHandler {
  return async (context, next) => {
    try {
      await platform.permissionKit.requirePermission(currentUserOf(context).id, permissionKey)
    } catch (error) {
      if (error instanceof Error && error.name === 'PermissionDeniedError') {
        throw errors.permissionDenied()
      }
      throw error
    }
    await next()
  }
}
