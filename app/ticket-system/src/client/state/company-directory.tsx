// 公司名称目录：为顶栏与筛选控件解析 company_id → 名称。
// 名称来源均为契约端点已返回的数据（管理端公司列表 / 工单列表 company_name / 分布统计 label）；
// 未解析到时回退显示“公司 #id”，不额外发明接口。

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Company, CurrentUser } from '../contracts'
import { fetchDistribution, listCompanies, listTickets } from '../api'

interface CompanyDirectoryValue {
  /** ops 角色的全量公司列表（供筛选下拉使用）；其他角色为空数组。 */
  companies: Company[]
  resolve: (companyId: number | null | undefined) => string
  register: (entries: Array<{ id: number; name: string }>) => void
  /** 重新拉取 ops 可见的公司全量列表（管理页新增公司后调用）。 */
  refresh: () => void
}

const CompanyDirectoryContext = createContext<CompanyDirectoryValue | null>(null)

export function CompanyDirectoryProvider({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const [names, setNames] = useState<Record<number, string>>({})
  const [companies, setCompanies] = useState<Company[]>([])

  const register = useCallback((entries: Array<{ id: number; name: string }>) => {
    if (!entries.length) return
    setNames((previous) => {
      let changed = false
      const next = { ...previous }
      for (const entry of entries) {
        if (entry.name && next[entry.id] !== entry.name) {
          next[entry.id] = entry.name
          changed = true
        }
      }
      return changed ? next : previous
    })
  }, [])

  const resolve = useCallback(
    (companyId: number | null | undefined) =>
      companyId == null ? '—' : names[companyId] ?? `公司 #${companyId}`,
    [names],
  )

  // 按角色用各自数据域内可见的数据源补齐本公司名称；失败时保持回退展示，不阻塞页面。
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (user.role === 'ops') {
          const { items } = await listCompanies()
          if (cancelled) return
          setCompanies(items)
          register(items.map((company) => ({ id: company.id, name: company.name })))
        } else if (user.role === 'handler') {
          const distribution = await fetchDistribution('company')
          if (cancelled) return
          register(distribution.items.map((item) => ({ id: Number(item.key), name: item.label })))
        } else {
          const result = await listTickets({ scope: 'mine', page_size: 1 })
          if (cancelled) return
          register(result.items.map((ticket) => ({ id: ticket.company_id, name: ticket.company_name })))
        }
      } catch {
        // 名称解析失败：顶栏回退显示 公司 #id
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user.id, user.role, register])

  const refresh = useCallback(() => {
    if (user.role !== 'ops') return
    void listCompanies()
      .then(({ items }) => {
        setCompanies(items)
        register(items.map((company) => ({ id: company.id, name: company.name })))
      })
      .catch(() => undefined)
  }, [user.role, register])

  const value = useMemo(() => ({ companies, resolve, register, refresh }), [companies, resolve, register, refresh])
  return <CompanyDirectoryContext.Provider value={value}>{children}</CompanyDirectoryContext.Provider>
}

export function useCompanyDirectory(): CompanyDirectoryValue {
  const value = useContext(CompanyDirectoryContext)
  if (!value) throw new Error('useCompanyDirectory 必须在 CompanyDirectoryProvider 内使用')
  return value
}
