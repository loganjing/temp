import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiRequest } from './api-client'
import type { LoginResponse, MeResponse, OrgRef, SessionUser } from '../types'

const TOKEN_KEY = 'platform-token'

interface SessionContextValue {
  status: 'checking' | 'anonymous' | 'authenticated'
  user: SessionUser | null
  permissions: string[]
  can: (permission: string) => boolean
  orgs: OrgRef[]
  orgName: (orgId: string | null | undefined) => string
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionContextValue['status']>('checking')
  const [user, setUser] = useState<SessionUser | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [orgs, setOrgs] = useState<OrgRef[]>([])

  const loadOrgs = useCallback(async () => {
    try {
      const result = await apiRequest<{ items: OrgRef[] }>('/api/orgs')
      setOrgs(result.items)
    } catch {
      setOrgs([])
    }
  }, [])

  const applySession = useCallback((me: MeResponse) => {
    setUser(me.user)
    setPermissions(me.permissions)
    setStatus('authenticated')
    void loadOrgs()
  }, [loadOrgs])

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
    setPermissions([])
    setStatus('anonymous')
  }, [])

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      clearSession()
      return
    }
    try {
      applySession(await apiRequest<MeResponse>('/api/auth/me'))
    } catch {
      clearSession()
    }
  }, [applySession, clearSession])

  useEffect(() => { void refresh() }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    const result = await apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    localStorage.setItem(TOKEN_KEY, result.token)
    applySession(await apiRequest<MeResponse>('/api/auth/me'))
  }, [applySession])

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' })
    } catch {
      // 登出幂等：令牌失效时忽略服务端错误，客户端丢弃会话即可
    }
    clearSession()
  }, [clearSession])

  const can = useCallback((permission: string) => permissions.includes(permission), [permissions])

  const orgName = useCallback((orgId: string | null | undefined) => {
    if (!orgId) return '未绑定组织'
    return orgs.find((org) => org.id === orgId)?.name ?? orgId
  }, [orgs])

  const value = useMemo<SessionContextValue>(
    () => ({ status, user, permissions, can, orgs, orgName, login, logout, refresh }),
    [status, user, permissions, can, orgs, orgName, login, logout, refresh],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession 必须在 SessionProvider 内使用')
  return context
}
