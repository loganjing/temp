import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchCurrentUser, login as loginRequest, logout as logoutRequest } from '../api/endpoints'
import type { UserSummary } from '../api/types'
import { clearStoredToken, readStoredToken, storeToken } from '../api/session'
import { setUnauthorizedHandler } from '../platform/api-client'
import { SkeletonBlock } from '../components/feedback'

type AuthStatus = 'restoring' | 'authenticated' | 'guest'

interface AuthContextValue {
  user: UserSummary | null
  status: AuthStatus
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null)
  const [status, setStatus] = useState<AuthStatus>('restoring')
  const navigate = useNavigate()

  // 启动时恢复持久化的会话令牌。
  useEffect(() => {
    const token = readStoredToken()
    if (!token) {
      setStatus('guest')
      return
    }
    fetchCurrentUser()
      .then((current) => {
        setUser(current)
        setStatus('authenticated')
      })
      .catch(() => {
        // 令牌缺失/失效/过期：清除本地会话，进入登录页
        clearStoredToken()
        setStatus('guest')
      })
  }, [])

  // 任何 API 请求返回 401 时统一登出并跳转登录页。
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearStoredToken()
      setUser(null)
      setStatus('guest')
      navigate('/login', { replace: true })
    })
    return () => setUnauthorizedHandler(null)
  }, [navigate])

  const login = useCallback(async (username: string, password: string) => {
    const result = await loginRequest(username, password)
    storeToken(result.token)
    setUser(result.user)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } catch {
      // 服务端会话已失效时忽略，本地照常清理
    }
    clearStoredToken()
    setUser(null)
    setStatus('guest')
    navigate('/login', { replace: true })
  }, [navigate])

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return context
}

function SessionRestoring() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50">
      <div className="flex flex-col items-center gap-3" role="status" aria-label="会话恢复中">
        <SkeletonBlock className="h-8 w-40" />
        <SkeletonBlock className="h-4 w-56" />
      </div>
      <p className="text-xs text-slate-400">正在恢复会话…</p>
    </div>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'restoring') return <SessionRestoring />
  if (status === 'guest') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <>{children}</>
}
