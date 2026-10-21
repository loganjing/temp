import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthUser } from '../contract'
import { fetchMe, login as loginRequest, logout as logoutRequest } from '../api'
import { ApiRequestError, describeError, setSessionExpiredHandler } from '../platform/api-client'

const TOKEN_KEY = 'platform-token'

type SessionStatus = 'checking' | 'anonymous' | 'authenticated'

interface SessionValue {
  status: SessionStatus
  user: AuthUser | null
  bootstrapError: string
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('checking')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [bootstrapError, setBootstrapError] = useState('')

  const expire = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
    setStatus('anonymous')
  }, [])

  useEffect(() => {
    setSessionExpiredHandler(() => expire())
    return () => setSessionExpiredHandler(null)
  }, [expire])

  useEffect(() => {
    let alive = true
    const token = localStorage.getItem(TOKEN_KEY)
    if (token === null) {
      setStatus('anonymous')
      return
    }
    fetchMe().then(
      (me) => { if (alive) { setUser(me); setStatus('authenticated') } },
      (error) => {
        if (!alive) return
        localStorage.removeItem(TOKEN_KEY)
        if (!(error instanceof ApiRequestError && error.status === 401)) {
          setBootstrapError(describeError(error))
        }
        setStatus('anonymous')
      },
    )
    return () => { alive = false }
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await loginRequest(username, password)
    localStorage.setItem(TOKEN_KEY, result.token)
    setUser(result.user)
    setStatus('authenticated')
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logoutRequest()
    } catch {
      // 会话令牌已失效时仍应完成本地退出
    }
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
    setStatus('anonymous')
  }, [])

  const value = useMemo<SessionValue>(
    () => ({ status, user, bootstrapError, signIn, signOut }),
    [status, user, bootstrapError, signIn, signOut],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (value === null) throw new Error('useSession 必须在 SessionProvider 内使用')
  return value
}

// 页面仅在已认证分支渲染；此钩子向页面提供非空当前用户。
export function useCurrentUser(): AuthUser {
  const session = useSession()
  if (session.status !== 'authenticated' || session.user === null) {
    throw new Error('会话未就绪，页面不应在未认证状态下渲染')
  }
  return session.user
}
