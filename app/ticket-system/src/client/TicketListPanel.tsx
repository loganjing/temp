// 工单列表面板：筛选、搜索、排序与工单队列。工单页与工作台共用。
import { useEffect, useState } from 'react'
import { RefreshCw, Search, SearchX } from 'lucide-react'
import type { CompanyRef, TicketSort, TicketStatus, TicketSummary } from './contracts'
import { sortLabels, ticketStatusLabels, ticketStatusTones, priorityTones, formatDateTime } from './labels'
import { Badge, EmptyState, ListSkeleton } from './shared'

export type CompanyOption = CompanyRef

export type ListFilters = {
  q: string
  sort: TicketSort
  status: '' | TicketStatus
  companyId: '' | string
}

export const defaultFilters: ListFilters = { q: '', sort: 'created_at_desc', status: '', companyId: '' }

export function TicketListPanel({
  title,
  tickets,
  loading,
  selectedId,
  onSelect,
  filters,
  onFiltersChange,
  onRefresh,
  showStatusFilter,
  showCompanyFilter,
  companies,
  emptyTitle,
  emptyDescription,
  toolbar,
}: {
  title: string
  tickets: TicketSummary[]
  loading: boolean
  selectedId: number | null
  onSelect: (id: number) => void
  filters: ListFilters
  onFiltersChange: (next: ListFilters) => void
  onRefresh: () => void
  showStatusFilter: boolean
  showCompanyFilter: boolean
  companies: CompanyOption[]
  emptyTitle: string
  emptyDescription: string
  toolbar?: React.ReactNode
}) {
  const [searchInput, setSearchInput] = useState(filters.q)

  useEffect(() => {
    setSearchInput(filters.q)
  }, [filters.q])

  // 搜索输入防抖，避免每次击键都请求。
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.q) onFiltersChange({ ...filters, q: searchInput })
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, filters, onFiltersChange])

  return (
    <section className="flex min-h-0 w-80 shrink-0 flex-col rounded-xl border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <div className="flex items-center gap-1.5">
            {toolbar}
            <button type="button" className="btn btn-secondary h-8 w-8 px-0" aria-label="刷新列表" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-2.5 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-8"
              placeholder="搜索工单ID、主题、提交人"
              value={searchInput}
              onChange={(event) => setSearchInput(event.currentTarget.value)}
              aria-label="搜索工单"
            />
          </div>
          <div className="flex gap-2">
            {showStatusFilter && (
              <select
                className="input"
                aria-label="按状态筛选"
                value={filters.status}
                onChange={(event) => onFiltersChange({ ...filters, status: event.currentTarget.value as ListFilters['status'] })}
              >
                <option value="">全部状态</option>
                {(Object.keys(ticketStatusLabels) as TicketStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {ticketStatusLabels[status]}
                  </option>
                ))}
              </select>
            )}
            {showCompanyFilter && (
              <select
                className="input"
                aria-label="按公司筛选"
                value={filters.companyId}
                onChange={(event) => onFiltersChange({ ...filters, companyId: event.currentTarget.value })}
              >
                <option value="">全部公司</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            )}
            <select
              className="input"
              aria-label="排序方式"
              value={filters.sort}
              onChange={(event) => onFiltersChange({ ...filters, sort: event.currentTarget.value as TicketSort })}
            >
              {(Object.keys(sortLabels) as TicketSort[]).map((sort) => (
                <option key={sort} value={sort}>
                  {sortLabels[sort]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <ListSkeleton rows={6} />
        ) : tickets.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={<SearchX className="h-8 w-8" />}
              title={emptyTitle}
              description={emptyDescription}
            />
          </div>
        ) : (
          <ul className="space-y-1.5">
            {tickets.map((ticket) => {
              const active = ticket.id === selectedId
              return (
                <li key={ticket.id}>
                  <button
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                    onClick={() => onSelect(ticket.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-900" title={ticket.subject}>
                        #{ticket.id} {ticket.subject}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={ticketStatusTones[ticket.status]}>{ticketStatusLabels[ticket.status]}</Badge>
                      <Badge tone={priorityTones[ticket.priority]}>{ticket.priority}</Badge>
                      {showCompanyFilter && (
                        <Badge tone="gray" title={ticket.company.name}>
                          {ticket.company.name}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1.5 truncate text-xs text-slate-500" title={`${ticket.submitter.name} · ${formatDateTime(ticket.createdAt)}`}>
                      {ticket.submitter.name} · {formatDateTime(ticket.createdAt)}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {!loading && tickets.length > 0 && (
        <footer className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">共 {tickets.length} 个工单</footer>
      )}
    </section>
  )
}
