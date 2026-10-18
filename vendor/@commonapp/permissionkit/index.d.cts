export type PermissionDefinition = { key: string; description?: string }
export type PermissionRegistry = { permissions: Readonly<Record<string, PermissionDefinition>>; roles: Readonly<Record<string, readonly string[]>> }
export type AuthorizationContext = { userId: string; roles: string[]; permissions: string[]; scopes: Array<{ type: string; id: string }> }
export class PermissionDeniedError extends Error { permissionKey: string }
export function createPermissionKit(db: unknown, options?: { now?: () => string }): {
  syncRegistry(registry: PermissionRegistry): Promise<{ roles: number; permissions: number }>
  assignRole(userId: string, roleKey: string, scope?: { type?: string; id?: string }): Promise<void>
  revokeRole(userId: string, roleKey: string, scope?: { type?: string; id?: string }): Promise<void>
  getRoles(userId: string): Promise<string[]>
  listRoles(): Promise<Array<{ key: string; name: string }>>
  loadAuthorizationContext(userId: string): Promise<AuthorizationContext>
  hasPermission(context: AuthorizationContext, permissionKey: string): boolean
  requirePermission(userId: string, permissionKey: string): Promise<AuthorizationContext>
}
