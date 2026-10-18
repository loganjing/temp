import { createContext, useCallback, useContext, useEffect, useState, type FormEvent } from 'react'
import { Outlet, matchPath, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, fetchAllPages } from '../domain/api'
import { errorText, localizedName } from '../domain/format'
import { useAsync } from '../domain/hooks'
import { PRIORITIES, TICKET_STATUSES, type Priority, type TicketListQuery, type TicketStatus } from '../domain/types'
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  Input,
  LoadingBlock,
  Pagination,
  Select,
  useToast,
} from '../components/ui'
import { Icon } from '../components/icons'
import { TicketTable } from '../components/TicketTable'
import { TicketDetail } from '../components/TicketDetail'
import { useLocale, usePlatformText } from '../platform/i18n'
import { useSession } from '../platform/session'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

const TicketListRefreshContext = createContext<() => void>(() => {})

/** 供布局子路由（工单详情）触发左侧列表刷新 */
export function useTicketListRefresh(): () => void {
  return useContext(TicketListRefreshContext)
}

/** /tickets/:id 布局子路由：详情更新后同步刷新列表 */
export function TicketDetailRoute() {
  const refresh = useTicketListRefresh()
  const { id } = useParams()
  const ticketId = Number(id)
  if (!Number.isFinite(ticketId) || ticketId <= 0) return null
  return <TicketDetail ticketId={ticketId} onUpdated={refresh} />
}

/** 工单列表布局：筛选条件全部落在 URL 查询参数（KPI/告警卡/工单箱下钻深链复用同一参数） */
export function TicketsLayout() {
  const t = usePlatformText()
  const { locale } = useLocale()
  const { me } = useSession()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()

  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((value) => value + 1), [])

  // ---- 从 URL 解析筛选（默认 updated_at:desc，20 条/页，需求 §6.3/§8） ----
  const statusParam = params.get('status')
  const activeStatuses = statusParam
    ? (statusParam.split(',').filter((value) => TICKET_STATUSES.includes(value as TicketStatus)) as TicketStatus[])
    : []
  const q = params.get('q') ?? ''
  const categoryId = Number(params.get('category')) || ''
  const priority = PRIORITIES.includes(params.get('priority') as Priority) ? (params.get('priority') as Priority) : ''
  const slaAlert = params.get('sla') === 'alert'
  const departmentId = Number(params.get('department')) || ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const pageSize = PAGE_SIZE_OPTIONS.includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20
  const sort = params.get('sort') || 'updated_at:desc'

  const [searchText, setSearchText] = useState(q)
  useEffect(() => setSearchText(q), [q])

  const searchKey = params.toString()
  const query: TicketListQuery = {
    status: activeStatuses.length ? activeStatuses : undefined,
    q: q || undefined,
    category: categoryId || undefined,
    priority: priority || undefined,
    sla: slaAlert ? 'alert' : undefined,
    department: departmentId || undefined,
    page,
    pageSize,
    sort,
  }
  const list = useAsync(() => api.listTickets(query), [searchKey, version])

  const canSeeDepartment = me?.role === 'manager' || me?.role === 'admin'
  const departments = useAsync(
    () => (canSeeDepartment ? fetchAllPages((deptPage) => api.departments(deptPage)) : Promise.resolve([])),
    [canSeeDepartment],
  )
  const categories = useAsync(api.categoryOptions, [])
  const canExport = me?.role !== 'requester'

  function updateParams(patch: Record<string, string | undefined>) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '') next.delete(key)
        else next.set(key, value)
      }
      return next
    })
  }

  function toggleStatus(status: TicketStatus) {
    const next = activeStatuses.includes(status)
      ? activeStatuses.filter((value) => value !== status)
      : [...activeStatuses, status]
    updateParams({ status: next.join(',') || undefined, page: '1' })
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    updateParams({ q: searchText || undefined, page: '1' })
  }

  const hasFilters =
    activeStatuses.length > 0 || !!q || !!categoryId || !!priority || slaAlert || !!departmentId

  function clearFilters() {
    setParams(new URLSearchParams())
  }

  function exportCsv() {
    api
      .exportTicketsCsv(query)
      .catch((reason: unknown) => toast.error(errorText(reason, t('common.error.generic'))))
  }

  const detailOpen = matchPath('/tickets/:id', location.pathname) !== null

  const listPanel = (
    <div className="space-y-3">
      <form className="flex flex-wrap items-center gap-2" onSubmit={submitSearch}>
        <div className="relative w-64">
          <Icon name="search" className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t('tickets.filter.searchPlaceholder')}
            className="pl-8"
          />
        </div>
        <Button type="submit" icon="search">
          {t('common.search')}
        </Button>
        {hasFilters && (
          <Button icon="x" onClick={clearFilters}>
            {t('tickets.filter.clear')}
          </Button>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TICKET_STATUSES.map((status) => {
            const active = activeStatuses.includes(status)
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                {t(`ticket.status.${status}`)}
              </button>
            )
          })}
        </div>
        {slaAlert && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            {t('tickets.filter.slaAlert')}
            <button type="button" onClick={() => updateParams({ sla: undefined })} aria-label="clear-sla-filter">
              <Icon name="x" className="h-3 w-3" />
            </button>
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <Select
            value={categoryId}
            onChange={(event) => updateParams({ category: event.target.value || undefined, page: '1' })}
            className="w-40"
            aria-label={t('common.category')}
          >
            <option value="">{t('tickets.filter.allCategories')}</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {localizedName(category, locale)}
              </option>
            ))}
          </Select>
          <Select
            value={priority}
            onChange={(event) => updateParams({ priority: event.target.value || undefined, page: '1' })}
            className="w-32"
            aria-label={t('common.priority')}
          >
            <option value="">{t('tickets.filter.allPriorities')}</option>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {t(`ticket.priority.${value}`)}
              </option>
            ))}
          </Select>
          {canSeeDepartment && (
            <Select
              value={departmentId}
              onChange={(event) => updateParams({ department: event.target.value || undefined, page: '1' })}
              className="w-40"
              aria-label={t('common.department')}
            >
              <option value="">{t('tickets.filter.allDepartments')}</option>
              {(departments.data ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {localizedName(department, locale)}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {list.loading && !list.data ? (
        <LoadingBlock label={t('common.loading')} />
      ) : list.error ? (
        <ErrorBlock error={list.error} onRetry={list.reload} retryLabel={t('common.retry')} />
      ) : list.data && list.data.items.length === 0 ? (
        <EmptyBlock label={t('tickets.empty')} icon="inbox" />
      ) : list.data ? (
        <>
          <TicketTable tickets={list.data.items} onOpen={(ticket) => void navigate(`/tickets/${ticket.id}`)} />
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            unit={t('common.items')}
            onPage={(next) => updateParams({ page: String(next) })}
            onPageSize={(size) => updateParams({ pageSize: String(size), page: '1' })}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        </>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-800">{t('tickets.title')}</h1>
        <div className="flex gap-2">
          {canExport && (
            <Button icon="download" onClick={exportCsv}>
              {t('tickets.export')}
            </Button>
          )}
          <Button variant="primary" icon="plus" onClick={() => void navigate('/tickets/new')}>
            {t('tickets.new')}
          </Button>
        </div>
      </header>
      <TicketListRefreshContext.Provider value={refresh}>
        {detailOpen ? (
          <div className="flex items-start gap-4">
            <div className="w-[42%] shrink-0">{listPanel}</div>
            <div className="min-w-0 flex-1">
              <Outlet />
            </div>
          </div>
        ) : (
          listPanel
        )}
      </TicketListRefreshContext.Provider>
    </div>
  )
}
