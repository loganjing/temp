// 工单双栏页：左列表右详情协同。工单页（全部可见工单）与工作台（待处理队列）共用。
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { apiListTickets } from './api'
import { useAuth } from './auth'
import { TicketCreateDialog } from './TicketCreateDialog'
import { TicketDetailPanel } from './TicketDetailPanel'
import { defaultFilters, TicketListPanel, type CompanyOption, type ListFilters } from './TicketListPanel'
import type { TicketDetail, TicketSummary } from './contracts'
import { apiErrorMessage, EmptyState, ErrorBanner, Skeleton } from './shared'

export function TicketBoard({ mode }: { mode: 'tickets' | 'workbench' }) {
  const { me } = useAuth()
  const navigate = useNavigate()
  const { ticketId } = useParams()
  const selectedId = ticketId != null && /^\d+$/.test(ticketId) ? Number(ticketId) : null
  const basePath = mode === 'tickets' ? '/tickets' : '/workbench'

  const [filters, setFilters] = useState<ListFilters>(defaultFilters)
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const query = useMemo(() => {
    const next: Parameters<typeof apiListTickets>[0] = { sort: filters.sort }
    if (mode === 'workbench') {
      next.status = 'pending'
      if (filters.companyId) next.companyId = Number(filters.companyId)
    } else if (filters.status) {
      next.status = filters.status
    }
    if (filters.q.trim()) next.q = filters.q.trim()
    return next
  }, [mode, filters])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setListError('')
    apiListTickets(query)
      .then((result) => {
        if (cancelled) return
        setTickets(result.tickets)
        if (query.companyId == null) {
          const seen = new Map<number, string>()
          for (const ticket of result.tickets) seen.set(ticket.company.id, ticket.company.name)
          setCompanies(
            [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
      })
      .catch((cause) => {
        if (!cancelled) setListError(apiErrorMessage(cause, '工单列表加载失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [query, reloadKey])

  const selectTicket = (id: number) => navigate(`${basePath}/${id}`)
  const refreshList = () => setReloadKey((key) => key + 1)

  const onCreated = (ticket: TicketDetail) => {
    setCreateOpen(false)
    navigate(`${basePath}/${ticket.id}`)
    refreshList()
  }

  return (
    <div className="flex h-full min-h-0 gap-4">
      <TicketListPanel
        title={mode === 'workbench' ? '待处理工单' : '工单'}
        tickets={tickets}
        loading={loading}
        selectedId={selectedId}
        onSelect={selectTicket}
        filters={filters}
        onFiltersChange={setFilters}
        onRefresh={refreshList}
        showStatusFilter={mode === 'tickets'}
        showCompanyFilter={mode === 'workbench'}
        companies={companies}
        emptyTitle={mode === 'workbench' ? '当前没有待处理工单' : '暂无工单'}
        emptyDescription={
          filters.q || (mode === 'tickets' && filters.status) || (mode === 'workbench' && filters.companyId)
            ? '没有符合当前筛选条件的工单，可调整搜索或筛选条件。'
            : mode === 'workbench'
              ? '分配到你所加入业务组的工单会出现在这里。'
              : '点击右上角“新建工单”创建第一张工单。'
        }
        toolbar={
          mode === 'tickets' ? (
            <button type="button" className="btn btn-primary h-8" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              新建工单
            </button>
          ) : undefined
        }
      />

      {listError && (
        <div className="flex min-w-0 flex-1 items-start justify-center rounded-xl border border-slate-200 bg-white p-8">
          <ErrorBanner message={listError} />
        </div>
      )}

      {!listError && selectedId == null && (
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white">
          <EmptyState
            title={mode === 'workbench' ? '选择一个待处理工单' : '选择一个工单查看详情'}
            description="从左侧列表选择工单后，可在此查看详情、回复与执行操作。"
          />
        </div>
      )}

      {!listError && selectedId != null && me == null && (
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white p-8">
          <Skeleton className="h-6 w-48" />
        </div>
      )}

      {!listError && selectedId != null && me != null && (
        <TicketDetailPanel
          key={selectedId}
          ticketId={selectedId}
          me={me}
          onTicketChanged={refreshList}
          onOpenTicket={selectTicket}
        />
      )}

      <TicketCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={onCreated} />
    </div>
  )
}
