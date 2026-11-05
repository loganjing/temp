import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiRequest, TOKEN_STORAGE_KEY, UNAUTHORIZED_EVENT } from './api-client'
import type { LoginResponse, UserProfile } from './types'

type SessionStatus = 'loading' | 'anonymous' | 'authenticated'

interface SessionValue {
  status: SessionStatus
  user: UserProfile | null
  login: (email: string, password: string) => Promise<UserProfile>
  logout: () => void
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [user, setUser] = useState<UserProfile | null>(null)

  const clear = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    setUser(null)
    setStatus('anonymous')
  }, [])

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_STORAGE_KEY)) {
      setUser(null)
      setStatus('anonymous')
      return
    }
    try {
      const profile = await apiRequest<UserProfile>('/api/me')
      setUser(profile)
      setStatus('authenticated')
    } catch {
      clear()
    }
  }, [clear])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, clear)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, clear)
  }, [clear])

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    localStorage.setItem(TOKEN_STORAGE_KEY, result.token)
    setUser(result.user)
    setStatus('authenticated')
    return result.user
  }, [])

  const logout = useCallback(() => clear(), [clear])

  const value = useMemo<SessionValue>(() => ({ status, user, login, logout, refresh }), [status, user, login, logout, refresh])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside SessionProvider')
  return value
}

export function defaultPathFor(user: UserProfile): string {
  if (user.roles.includes('platform_stats')) return '/stats'
  if (user.roles.includes('company_admin') || user.roles.includes('agent')) return '/workbench'
  return '/my-tickets'
}