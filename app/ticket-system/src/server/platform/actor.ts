import type { Context } from 'hono'
import { COMPANY_WIDE_ROLES, PERMISSIONS, type PermissionKey } from '../../shared/contracts'
import type { IdentityRepository, MemberContext } from '../identity/repository'
import { currentUserId, forbidden } from './http'
import { authorizationContext, requirePermission, type AuthorizationContext, type PermissionKit } from './permissions'

export type RequestActor = { member: MemberContext; authorization: AuthorizationContext }

/**
 * 由可信会话（Bearer → 本地账号）解析业务成员与授权上下文。
 * 账号没有公司成员归属或成员被停用时按 403 处理；请求体/查询参数永不能提供公司范围。
 */
export async function resolveActor(context: Context, identity: IdentityRepository): Promise<RequestActor> {
  const member = await identity.findMemberContextByUserId(currentUserId(context))
  if (!member || !member.isActive) throw forbidden('No active company membership for the current account')
  return { member, authorization: authorizationContext(member.userId, member.companyId, member.roles) }
}

export async function resolveAuthorizedActor(context: Context, identity: IdentityRepository, permissionKit: PermissionKit, permission: PermissionKey): Promise<RequestActor> {
  const actor = await resolveActor(context, identity)
  requirePermission(permissionKit, actor.authorization, permission)
  return actor
}

/** 仅持 submitter 角色的成员只能看到自己提交的工单；其余角色可见公司内全部工单。 */
export const hasCompanyWideVisibility = (member: MemberContext): boolean =>
  member.roles.some((role) => COMPANY_WIDE_ROLES.includes(role))

export const hasAssignAuthority = (authorization: AuthorizationContext): boolean =>
  authorization.permissions.includes(PERMISSIONS.TICKET_ASSIGN)
