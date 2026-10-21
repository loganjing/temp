// 认证上下文：登录、登出、强制改密流程与 /api/auth/me 档案缓存。
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiRequestError } from './platform/api-client'
import { apiBootstrapAccount, apiBootstrapStatus, apiChangePassword, apiLogin, apiLogout, apiMe } from './api'
import type { MeResponse } from './contracts'

export type AuthPhase = 'checking' | 'login' | 'change-password' | 'ready'

type AuthContextValue = {
  phase: AuthPhase
  me: MeResponse | null
  connectionError: string
  bootstrapRequired: boolean
  login: (username: string, password: string) => Promise<void>
  createFirstAccount: (name: string, email: string, password: string) => Promise<string>
  submitNewPassword: (password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>('checking')
  const [me, setMe] = useState<MeResponse | null>(null)
  const [connectionError, setConnectionError] = useState('')
  const [bootstrapRequired, setBootstrapRequired] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('platform-token')
    if (!token) {
      setPhase('login')
      return
    }
    void apiMe()
      .then((profile) => {
        setMe(profile)
        setConnectionError('')
        setPhase(profile.user.passwordChangeRequired ? 'change-password' : 'ready')
      })
      .catch((cause) => {
        localStorage.removeItem('platform-token')
        if (cause instanceof ApiRequestError && cause.status === 401) {
          setConnectionError('')
        } else {
          setConnectionError('无法连接服务，请确认服务已启动')
        }
        setPhase('login')
      })
  }, [])

  useEffect(() => {
    if (phase !== 'login' || bootstrapRequired) return
    let cancelled = false
    void apiBootstrapStatus()
      .then((status) => {
        if (!cancelled) setBootstrapRequired(status.required)
      })
      .catch(() => {
        if (!cancelled) setConnectionError('无法连接服务，请确认服务已启动')
      })
    return () => {
      cancelled = true
    }
  }, [phase, bootstrapRequired])

  const login = useCallback(async (username: string, password: string) => {
    const result = await apiLogin(username, password)
    localStorage.setItem('platform-token', result.token)
    const profile = await apiMe()
    setMe(profile)
    setConnectionError('')
    setPhase(profile.user.passwordChangeRequired || result.user.passwordChangeRequired ? 'change-password' : 'ready')
  }, [])

  const createFirstAccount = useCallback(async (name: string, email: string, password: string) => {
    await apiBootstrapAccount({ name, email, password })
    setBootstrapRequired(false)
    return '账户已创建，请使用该账户登录。'
  }, [])

  const submitNewPassword = useCallback(async (password: string) => {
    await apiChangePassword(password)
    if (localStorage.getItem('platform-token')) {
      const profile = await apiMe()
      setMe(profile)
    }
    setPhase('ready')
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } catch {
      // 登出请求失败不阻塞本地会话清理。
    }
    localStorage.removeItem('platform-token')
    setMe(null)
    setPhase('login')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      phase,
      me,
      connectionError,
      bootstrapRequired,
      login,
      createFirstAccount,
      submitNewPassword,
      logout,
    }),
    [phase, me, connectionError, bootstrapRequired, login, createFirstAccount, submitNewPassword, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return context
}
