import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { AsyncHandle } from '../app/useAsyncData'
import { useAsyncData } from '../app/useAsyncData'
import { useCompanyOptions } from '../app/useCompanyOptions'
import { useCurrentUser } from '../app/session'
import { fetchTickets } from '../api'
import { CATEGORY_OPTIONS, type Category, type DistributionStats, type Priority, type SortOrder, type Ticket, type TicketListResult, type TicketSortField } from '../contract'
import { formatDateTime } from '../labels'
import { Card, CategoryChip, DataState, Field, Pagination, PriorityBadge, StatusBadge } from '../components/ui'
import { TicketDetailSection } from './TicketDetailView'

const WORKBENCH_PAGE_SIZE = 20

export interface WorkbenchFilters {
  status: 'pending_processing' | 'pending_assignment'
  category: Category | ''
  priority: Priority | ''
  companyId: number | undefined
  q: string
  sort: TicketSortField
  order: SortOrder
}

export const DEFAULT_WORKBENCH_FILTERS: WorkbenchFilters = {
  status: 'pending_processing',
  category: '',
  priority: '',
  companyId: undefined,
  q: '',
  sort: 'createdAt',
  order: 'desc',
}

export default function WorkbenchPage() {
  const me = useCurrentUser()
  const navigate = useNavigate()
  const routeParams = useParams()
  const selectedTicketId = /^\d+$/.test(routeParams.ticketId ?? '') ? Number(routeParams.ticketId) : null
  const [filters, setFilters] = useState<WorkbenchFilters>(DEFAULT_WORKBENCH_FILTERS)
  const [searchDraft, setSearchDraft] = useState('')
  const [page, setPage] = useState(1)
  const list = useAsyncData(
    () =>
      fetchTickets({
        scope: 'workbench',
        status: filters.status,
        category: filters.category || undefined,
        priority: filters.priority || undefined,
        companyId: filters.companyId,
        q: filters.q.trim() || undefined,
        sort: filters.sort,
        order: filters.order,
        page,
        pageSize: WORKBENCH_PAGE_SIZE,
      }),
    [filters, page],
  )
  const companyOptions = useCompanyOptions(me)

  const patchFilters = (patch: Partial<WorkbenchFilters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(1)
  }
  const applySearch = () => patchFilters({ q: searchDraft.trim() })
  const clearSearch = () => {
    setSearchDraft('')
    patchFilters({ q: '' })
  }

  return (
    <div className="flex h-full min-h-0 gap-4">
      <WorkbenchListPanel
        me={me}
        filters={filters}
        onFiltersChange={patchFilters}
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        onSearchSubmit={applySearch}
        onSearchClear={clearSearch}
        companyOptions={companyOptions}
        list={list}
        onPageChange={setPage}
        selectedTicketId={selectedTicketId}
        onSelectTicket={(ticketId) => { void navigate(`/workbench/${ticketId}`) }}
      />
      {selectedTicketId === null ? (
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="text-center">
            <p className="text-sm font-medium text-slate-600">选择左侧工单</p>
            <p className="mt-1 text-xs text-slate-400">查看详情、回复与处理操作</p>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <TicketDetailSection
              me={me}
              mode="workbench"
              ticketId={selectedTicketId}
              onTicketChanged={() => { list.reload() }}
              onOpenTicket={(ticketId) => { void navigate(`/workbench/${ticketId}`) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export interface WorkbenchListPanelProps {
  me: { crossCompanyView: boolean }
  filters: WorkbenchFilters
  onFiltersChange: (patch: Partial<WorkbenchFilters>) => void
  searchDraft: string
  onSearchDraftChange: (value: string) => void
  onSearchSubmit: () => void
  onSearchClear: () => void
  companyOptions: AsyncHandle<DistributionStats> | null
  list: AsyncHandle<TicketListResult>
  onPageChange: (page: number) => void
  selectedTicketId: number | null
  onSelectTicket: (ticketId: number) => void
}

export function WorkbenchListPanel(props: WorkbenchListPanelProps) {
  const { filters, list } = props
  return (
    <div className="flex h-full w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">工单列表</h2>
        <span className="text-xs text-slate-500">{list.phase === 'ready' ? `共 ${list.data.total} 条` : ''}</span>
      </header>
      <div className="space-y-2.5 border-b border-slate-100 px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="状态">
            <select
              className="input-base"
              value={filters.status}
              onChange={(event) => props.onFiltersChange({ status: event.currentTarget.value as WorkbenchFilters['status'] })}
            >
              <option value="pending_processing">待处理工单</option>
              <option value="pending_assignment">待分配工单</option>
            </select>
          </Field>
          <Field label="分类">
            <select
              className="input-base"
              value={filters.category}
              onChange={(event) => props.onFiltersChange({ category: event.currentTarget.value as Category | '' })}
            >
              <option value="">全部分类</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="优先级">
            <select
              className="input-base"
              value={filters.priority}
              onChange={(event) => props.onFiltersChange({ priority: event.currentTarget.value as Priority | '' })}
            >
              <option value="">全部优先级</option>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
              <option value="P4">P4</option>
            </select>
          </Field>
          {props.companyOptions !== null ? (
            <Field label="公司" hint={props.companyOptions.phase === 'error' ? '公司列表加载失败' : null}>
              <select
                className="input-base"
                value={filters.companyId === undefined ? '' : filters.companyId}
                onChange={(event) =>
                  props.onFiltersChange({ companyId: event.currentTarget.value === '' ? undefined : Number(event.currentTarget.value) })
                }
              >
                <option value="">全部公司</option>
                {props.companyOptions.phase === 'ready'
                  ? props.companyOptions.data.items.map((item) => (
                    <option key={String(item.key)} value={item.key}>{item.label}</option>
                  ))
                  : null}
              </select>
            </Field>
          ) : null}
        </div>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); props.onSearchSubmit() }}>
          <input
            className="input-base"
            placeholder="搜索主题 / 描述 / 工单ID"
            value={props.searchDraft}
            onChange={(event) => props.onSearchDraftChange(event.currentTarget.value)}
          />
          <button type="submit" className="btn-secondary shrink-0">搜索</button>
          {filters.q !== '' && (
            <button type="button" className="btn-secondary shrink-0" onClick={props.onSearchClear}>清除</button>
          )}
        </form>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label="排序">
              <select
                className="input-base"
                value={filters.sort}
                onChange={(event) => props.onFiltersChange({ sort: event.currentTarget.value as TicketSortField })}
              >
                <option value="createdAt">创建时间</option>
                <option value="priority">优先级</option>
                <option value="status">状态</option>
                <option value="firstReplyAt">首次回复时间</option>
              </select>
            </Field>
          </div>
          <button
            type="button"
            className="btn-secondary shrink-0"
            onClick={() => props.onFiltersChange({ order: filters.order === 'desc' ? 'asc' : 'desc' })}
          >
            {filters.order === 'desc' ? '降序' : '升序'}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <DataState state={list} isEmpty={(result) => result.items.length === 0} empty="当前筛选条件下没有工单，可调整筛选或搜索条件">
          {(result) => (
            <ul className="divide-y divide-slate-100">
              {result.items.map((ticket) => (
                <li key={ticket.id}>
                  <TicketRow
                    ticket={ticket}
                    selected={props.selectedTicketId === ticket.id}
                    showCompany={props.me.crossCompanyView}
                    onSelect={props.onSelectTicket}
                  />
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </div>
      {list.phase === 'ready' && (
        <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={props.onPageChange} />
      )}
    </div>
  )
}

function TicketRow(props: { ticket: Ticket; selected: boolean; showCompany: boolean; onSelect: (ticketId: number) => void }) {
  const { ticket } = props
  return (
    <button
      type="button"
      className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${props.selected ? 'bg-indigo-50/60' : ''}`}
      onClick={() => props.onSelect(ticket.id)}
      title={ticket.subject}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-slate-800">{ticket.subject}</span>
        <span className="shrink-0 text-xs font-medium text-slate-400">#{ticket.id}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        <CategoryChip category={ticket.category} />
      </div>
      <p className="mt-1.5 truncate text-xs text-slate-500">
        {`${ticket.submitter.displayName}${props.showCompany ? ` · ${ticket.submitter.companyName}` : ''} · ${formatDateTime(ticket.createdAt)}`}
      </p>
    </button>
  )
}
