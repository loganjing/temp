import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setUnauthorizedHandler } from '../platform/api-client'
import { fetchCurrentUser, login as loginRequest } from '../api/auth'
import type { UserProfile } from '../platform/types'

type AuthStatus = 'checking' | 'anonymous' | 'authenticated'

interface AuthContextValue {
  status: AuthStatus
  user: UserProfile | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [user, setUser] = useState<UserProfile | null>(null)

  const logout = useCallback(() => {
    localStorage.removeItem('platform-token')
    setUser(null)
    setStatus('anonymous')
  }, [])

  // 全局 401：认证会话失效时清除本地令牌并回到登录页。
  useEffect(() => {
    setUnauthorizedHandler(() => logout())
    return () => setUnauthorizedHandler(null)
  }, [logout])

  useEffect(() => {
    const token = localStorage.getItem('platform-token')
    if (!token) {
      setStatus('anonymous')
      return
    }
    let cancelled = false
    fetchCurrentUser()
      .then((result) => {
        if (cancelled) return
        setUser(result.user)
        setStatus('authenticated')
      })
      .catch(() => {
        // 401 已由全局处理器清理会话；其余启动期失败按未登录处理。
        if (cancelled) return
        if (localStorage.getItem('platform-token')) return
        setStatus('anonymous')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const result = await loginRequest(username, password)
    localStorage.setItem('platform-token', result.token)
    setUser(result.user)
    setStatus('authenticated')
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ status, user, login, logout }), [status, user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return value
}
