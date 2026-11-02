import { createContext, useContext, type ReactNode } from 'react'
import type { CurrentUser } from '../tickets/types'

const SessionContext = createContext<CurrentUser | null>(null)

export function SessionProvider({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>
}

export function useSession(): CurrentUser {
  const user = useContext(SessionContext)
  if (!user) throw new Error('Session is not available')
  return user
}