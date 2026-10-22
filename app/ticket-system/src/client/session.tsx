import { createContext, useContext } from 'react'
import type { AuthUser, Profile } from './api/types'

export type Session = { user: AuthUser; profile: Profile | null; signOut: () => void }

const SessionContext = createContext<Session | null>(null)

export const SessionProvider = SessionContext.Provider

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used within the authenticated shell')
  return session
}
