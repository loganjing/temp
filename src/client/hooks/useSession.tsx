import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { getSession, switchSession } from '../api'
import type { Session } from '../api/types'

interface SessionCtx {
  session: Session | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  switchUser: (userId: string) => Promise<void>
}

const Ctx = createContext<SessionCtx | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await getSession()
      setSession(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : '会话加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const switchUser = useCallback(async (userId: string) => {
    setLoading(true)
    setError(null)
    try {
      const s = await switchSession(userId)
      setSession(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换身份失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return (
    <Ctx.Provider value={{ session, loading, error, refresh, switchUser }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSession() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
