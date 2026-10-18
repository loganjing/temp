import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../domain/api'
import type { Me, Role } from '../domain/types'
import { ApiRequestError, getToken, setToken, UNAUTHORIZED_EVENT } from './api-client'

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous'

interface SessionValue {
  status: SessionStatus
  me: Me | null
  login: (email: string, password: string) => Promise<Me>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: SessionStatus; me: Me | null }>({ status: 'loading', me: null })

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setState({ status: 'anonymous', me: null })
      return
    }
    try {
      const me = await api.me()
      setState({ status: 'authenticated', me })
    } catch {
      // 令牌失效（401 已清并广播）或其他失败：回到匿名态强制重新登录
      setToken(null)
      setState({ status: 'anonymous', me: null })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onUnauthorized = () => setState({ status: 'anonymous', me: null })
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.login(email, password)
    setToken(response.token)
    const me = await api.me()
    setState({ status: 'authenticated', me })
    return me
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      /* 登出失败也清空本地会话 */
    }
    setToken(null)
    setState({ status: 'anonymous', me: null })
  }, [])

  return (
    <SessionContext.Provider value={{ ...state, login, logout, refresh }}>{children}</SessionContext.Provider>
  )
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('SessionProvider is missing')
  return context
}

export function roleHome(role: Role): string {
  if (role === 'manager') return '/inbox'
  if (role === 'admin') return '/dashboard'
  return '/tickets'
}
