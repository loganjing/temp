import { createContext, useContext, type ReactNode } from 'react'

const PermissionContext = createContext<Set<string>>(new Set())

/** 权限上下文：App 登录后注入 /api/auth/me 返回的 permissions（契约第 1 节）。 */
export function PermissionProvider({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  return <PermissionContext.Provider value={new Set(permissions)}>{children}</PermissionContext.Provider>
}

export function useCan(): (permission: string) => boolean {
  const granted = useContext(PermissionContext)
  return (permission: string) => granted.has(permission)
}
