import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { UserDetail } from '../types'
import { apiGet } from '../platform/api-client'

const STORAGE_KEY = 'jlg-ticket.currentUserId'

export interface CurrentUserValue {
  user: UserDetail | null
  loading: boolean
  error: string | null
  /** 按 ID 解析并设置当前身份；解析失败时保留原状态并抛出错误供调用方处理。 */
  setCurrentUserId: (id: string) => Promise<void>
  clear: () => void
}

const CurrentUserContext = createContext<CurrentUserValue | null>(null)

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resolve = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const detail = await apiGet<UserDetail>(`/api/users/${id}`)
      setUser(detail)
      localStorage.setItem(STORAGE_KEY, id)
    } catch (err) {
      setUser(null)
      const msg = err instanceof Error ? err.message : '解析用户失败'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setUser(null)
    setError(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  // 启动时尝试恢复上次保存的身份
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      void resolve(saved).catch(() => {
        /* 解析失败时保持未登录态，错误已记录在 state 中 */
      })
    }
  }, [resolve])

  return (
    <CurrentUserContext.Provider value={{ user, loading, error, setCurrentUserId: resolve, clear }}>
      {children}
    </CurrentUserContext.Provider>
  )
}

export function useCurrentUser(): CurrentUserValue {
  const ctx = useContext(CurrentUserContext)
  if (!ctx) throw new Error('useCurrentUser 必须在 CurrentUserProvider 内使用')
  return ctx
}
