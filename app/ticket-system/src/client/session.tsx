import { createContext, useContext } from 'react'
import type { UserProfileSummary } from './types'

export interface Session {
  user: UserProfileSummary
  refresh: () => Promise<boolean>
  signOut: () => Promise<void>
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('SessionContext 未挂载')
  return session
}
