import type { Context } from 'hono'
import type { PermissionKey } from '../../shared/contracts'
import type { initializePlatform } from '../platform/bootstrap'
import { resolveActor, resolveAuthorizedActor, type RequestActor } from '../platform/actor'

export type Platform = Awaited<ReturnType<typeof initializePlatform>>

/** 由可信会话解析业务成员并校验权限；公司范围与对象归属仍由各端点独立强制。 */
export const authorizedActor = (context: Context, platform: Platform, permission: PermissionKey): Promise<RequestActor> =>
  resolveAuthorizedActor(context, platform.identity, platform.permissionKit, permission)

/** 任意已认证成员；仅用于身份上下文端点。 */
export const anyActor = (context: Context, platform: Platform): Promise<RequestActor> =>
  resolveActor(context, platform.identity)

/** 读取可选 JSON 体；缺失或非对象时按空对象处理（供请求体可选的端点使用）。 */
export const readBody = async (context: Context): Promise<Record<string, unknown>> => {
  const body = await context.req.json().catch(() => null)
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
}
