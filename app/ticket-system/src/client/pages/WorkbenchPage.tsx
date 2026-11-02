import { useCallback, useEffect, useMemo, useState } from 'react'
import { workbenchApi, type WorkbenchQuery } from '../api/statistics'
import { categoriesApi } from '../api/company'
import { PriorityBadge, StatusBadge } from '../components/Badges'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'
import { Pagination } from '../components/Pagination'
import { SearchIcon } from '../components/Icon'
import { formatDateTime, truncate } from '../lib/format'
import {
  SLA_PRIORITY_OPTIONS,
  SLA_PRIORITY_WEIGHT,
  TICKET_STATUS_OPTIONS,
  TICKET_STATUS_LABEL,
} from '../lib/constants'
import type { SLAPriority, Ticket, TicketStatus, UserInfo } from '../types'

type SortField = 'slaPriority' | 'createdAt' | 'updatedAt'

export function WorkbenchPage({ user }: { user: UserInfo }) {
  const isAdmin = user.role === 'admin' || (user.roles ?? []).includes('admin')
  const companyId = user.companyId

  const [items, setItems] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<TicketStatus>('pending_processing')
  const [priority, setPriority] = useState<SLAPriority | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [sortBy, setSortBy] = useState<SortField>('slaPriority')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (!companyId) return
    categoriesApi.list(companyId).then(setCategories).catch(() => setCategories([]))
  }, [companyId])

  const query: WorkbenchQuery = useMemo(
    () => ({
      page,
      pageSize,
      status,
      slaPriority: priority || undefined,
      categoryId: categoryId || undefined,
      companyId: isAdmin ? undefined : undefined,
      keyword: keyword || undefined,
      sortBy,
      sortOrder,
    }),
    [page, status, priority, categoryId, keyword, sortBy, sortOrder, isAdmin],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await workbenchApi.list(query)
      setItems(res.items)
      setTotal(res.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载工作台失败')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => { void load() }, [load])

  // 工作台默认按 SLA 优先级降序；后端未提供时前端兜底排序。
  const sortedItems = useMemo(() => {
    if (sortBy !== 'slaPriority' || sortOrder !== 'desc') return items
    return [...items].sort(
      (a, b) => SLA_PRIORITY_WEIGHT[b.slaPriority] - SLA_PRIORITY_WEIGHT[a.slaPriority],
    )
  }, [items, sortBy, sortOrder])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">工单工作台</h2>
          <p className="text-xs text-slate-500">待处理工单默认按 SLA 优先级降序排列</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[200px] text-xs text-slate-500">
            关键词搜索（主题/描述）
            <div className="relative mt-1">
              <SearchIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="!pl-8"
                value={keyword}
                placeholder="输入关键词"
                onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
              />
            </div>
          </label>
          <FilterSelect label="状态" value={status} onChange={(v) => { setStatus(v as TicketStatus); setPage(1) }}
            options={TICKET_STATUS_OPTIONS.map((s) => ({ value: s, label: TICKET_STATUS_LABEL[s] }))} />
          <FilterSelect label="优先级" value={priority} onChange={(v) => { setPriority(v as SLAPriority | ''); setPage(1) }}
            options={[{ value: '', label: '全部' }, ...SLA_PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))]} />
          <FilterSelect label="分类" value={categoryId} onChange={(v) => { setCategoryId(v); setPage(1) }}
            options={[{ value: '', label: '全部分类' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
          <FilterSelect label="排序字段" value={sortBy} onChange={(v) => setSortBy(v as SortField)}
            options={[{ value: 'slaPriority', label: '优先级' }, { value: 'createdAt', label: '创建时间' }, { value: 'updatedAt', label: '更新时间' }]} />
          <FilterSelect label="排序方向" value={sortOrder} onChange={(v) => setSortOrder(v as 'asc' | 'desc')}
            options={[{ value: 'desc', label: '降序' }, { value: 'asc', label: '升序' }]} />
        </div>
      </div>

      {loading ? (
        <SkeletonRows count={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : sortedItems.length === 0 ? (
        <EmptyState title="暂无待处理工单" description="当前筛选条件下没有待处理工单" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <Th>主题</Th>
                  <Th>优先级</Th>
                  <Th>状态</Th>
                  <Th>分类</Th>
                  <Th>提交人</Th>
                  <Th>分配处理人</Th>
                  <Th>创建时间</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedItems.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 font-medium text-slate-800" title={t.title}>{truncate(t.title, 40)}</td>
                    <td className="px-3 py-2.5"><PriorityBadge priority={t.slaPriority} /></td>
                    <td className="px-3 py-2.5"><StatusBadge status={t.status} /></td>
                    <td className="px-3 py-2.5 text-slate-600">{t.categoryName}</td>
                    <td className="px-3 py-2.5 text-slate-600">{t.submitterName}</td>
                    <td className="px-3 py-2.5 text-slate-600">{t.assignedHandlerName ?? '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{formatDateTime(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-3">
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </div>
        </div>
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2.5 font-medium">{children}</th>
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="text-xs text-slate-500">
      {label}
      <select className="mt-1" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}
