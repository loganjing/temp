import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './platform/api'
import type { BootstrapData, BusinessGroup, Company, User } from './platform/contracts'

interface AppContextValue {
  companies: Company[]
  users: User[]
  groups: BusinessGroup[]
  loading: boolean
  error: string | null
  companyId: string | null
  setCompanyId: (id: string) => void
  operatorId: string | null
  setOperatorId: (id: string) => void
  currentUsers: User[]
  currentGroups: BusinessGroup[]
  reload: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BootstrapData>({ companies: [], users: [], groups: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [operatorId, setOperatorId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.bootstrap()
      .then((bootstrap) => {
        setData(bootstrap)
        setCompanyId((current) => current ?? bootstrap.companies[0]?.id ?? null)
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '加载初始数据失败'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const currentUsers = useMemo(
    () => data.users.filter((user) => user.companyId === companyId),
    [data.users, companyId],
  )
  const currentGroups = useMemo(
    () => data.groups.filter((group) => group.companyId === companyId),
    [data.groups, companyId],
  )

  // 公司切换后当前操作者可能不再属于该公司，重置到该公司首位用户。
  useEffect(() => {
    if (companyId && (!operatorId || !currentUsers.some((user) => user.id === operatorId))) {
      setOperatorId(currentUsers[0]?.id ?? null)
    }
    if (!companyId) setOperatorId(null)
  }, [companyId, currentUsers, operatorId])

  const value = useMemo<AppContextValue>(() => ({
    companies: data.companies,
    users: data.users,
    groups: data.groups,
    loading,
    error,
    companyId,
    setCompanyId,
    operatorId,
    setOperatorId,
    currentUsers,
    currentGroups,
    reload: load,
  }), [data, loading, error, companyId, operatorId, currentUsers, currentGroups, load])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp 必须在 AppProvider 内使用')
  return value
}
