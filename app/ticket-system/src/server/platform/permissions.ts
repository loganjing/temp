import { createPermissionKit, type PermissionRegistry } from '@commonapp/permissionkit'
import { PERMISSION_KEYS, ROLE_CODES, ROLE_PERMISSIONS, type PermissionKey, type RoleCode } from '../../shared/contracts'
import { forbidden } from './http'

export type PermissionKit = ReturnType<typeof createPermissionKit>

/** 项目授权上下文：角色来自 company_member_roles，权限由注册表映射得出，范围固定为本公司。 */
export type AuthorizationContext = {
  userId: string
  roles: RoleCode[]
  permissions: PermissionKey[]
  scopes: { type: string; id: string }[]
}

/**
 * permissionkit 注册表承载项目声明的权限键与角色映射（技术契约第 6 节）。
 * `admin` 是平台内部超集角色，用于满足 permissionkit 对显式管理员角色的要求；
 * 业务角色仍只来自 company_member_roles，不会自动获得 admin。
 */
export function permissionRegistry(): PermissionRegistry {
  const permissions: Record<string, { key: string; description: string }> = {}
  for (const key of PERMISSION_KEYS) permissions[key] = { key, description: key }
  const roles: Record<string, string[]> = {}
  for (const role of ROLE_CODES) roles[role] = [...ROLE_PERMISSIONS[role]]
  roles.admin = [...PERMISSION_KEYS]
  return { permissions, roles }
}

export function permissionsForRoles(roles: readonly RoleCode[]): PermissionKey[] {
  const granted = new Set<PermissionKey>()
  for (const role of roles) for (const permission of ROLE_PERMISSIONS[role] ?? []) granted.add(permission)
  return PERMISSION_KEYS.filter((key) => granted.has(key))
}

export function authorizationContext(userId: string, companyId: string, roles: readonly RoleCode[]): AuthorizationContext {
  return {
    userId,
    roles: [...roles],
    permissions: permissionsForRoles(roles),
    scopes: [{ type: 'company', id: companyId }],
  }
}

/** 权限只表达能力；公司范围与对象归属由各端点独立强制。 */
export function requirePermission(permissionKit: PermissionKit, authorization: AuthorizationContext, permission: PermissionKey): void {
  if (!permissionKit.hasPermission(authorization, permission)) throw forbidden(`Missing permission: ${permission}`)
}
