// 当前用户类型，对应 GET /api/auth/me 与 POST /api/auth/login 响应中的 user 字段。
// roles 与 companyId 由服务端认证上下文注入；前端只读引用，不自行决定权限。
export type Role = 'submitter' | 'handler' | 'admin' | 'user'

export interface CurrentUser {
  id: string
  name: string
  email: string
  phone?: string | null
  companyId?: string | null
  roles?: Role[]
  passwordChangeRequired?: boolean
}

export function hasRole(user: CurrentUser | null, role: Role): boolean {
  return Boolean(user?.roles?.includes(role))
}

export function canAdmin(user: CurrentUser | null): boolean {
  return hasRole(user, 'admin')
}

export function canHandle(user: CurrentUser | null): boolean {
  return hasRole(user, 'handler') || hasRole(user, 'admin')
}
