import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchMe, login as loginRequest } from '../api/auth'
import type { CurrentUser, Role } from '../api/types'
import { onUnauthorized, setAuthToken } from '../platform/api-client'
import { clearStoredToken, readStoredToken, storeToken } from './session'

interface AuthContextValue {
  user: CurrentUser | null
  booting: boolean
  login: (email: string, password: string) => Promise<CurrentUser>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function roleHome(role: Role): string {
  return role === 'submitter' ? '/tickets' : '/workbench'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    onUnauthorized(() => {
      clearStoredToken()
      setUser(null)
    })
    const token = readStoredToken()
    if (!token) {
      setBooting(false)
      return
    }
    setAuthToken(token)
    fetchMe()
      .then(setUser)
      .catch(() => {
        setAuthToken(null)
        clearStoredToken()
      })
      .finally(() => setBooting(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password)
    setAuthToken(result.token)
    storeToken(result.token)
    setUser(result.user)
    return result.user
  }, [])

  const logout = useCallback(() => {
    setAuthToken(null)
    clearStoredToken()
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, booting, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
