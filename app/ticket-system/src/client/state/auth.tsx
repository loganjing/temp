import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { CurrentUser } from '../contracts'

export interface AuthContextValue {
  user: CurrentUser
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ user, logout, children }: AuthContextValue & { children: ReactNode }) {
  const value = useMemo(() => ({ user, logout }), [user, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return value
}
