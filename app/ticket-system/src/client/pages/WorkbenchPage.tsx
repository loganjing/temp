import { useEffect, useState } from 'react'
import { apiRequest } from '../platform/api-client'
import TicketDetailPanel from '../components/TicketDetailPanel'
import { TicketRow } from '../components/TicketRow'
import { useSession } from '../components/AppShell'
import { useAsyncData } from '../components/useAsyncData'
import {
  EmptyState,
  ErrorNotice,
  PageHeader,
  Pagination,
  PRIORITIES,
  SkeletonList,
  TICKET_STATUSES,
  STATUS_META,
  buildQuery,
} from '../components/ui'
import type { Distribution, Group, Page, TicketListItem, TicketStatus } from '../types'

const PAGE_SIZE = 20

type Filters = {
  status: TicketStatus | ''
  priority: string
  category: string
  groupId: string
  companyKey: string
  sort: string
  order: string
}

const DEFAULT_FILTERS: Filters = {
  status: 'pending_processing',
  priority: '',
  category: '',
  groupId: '',
  companyKey: '',
  sort: 'createdAt',
  order: 'desc',
}

/** 工单工作台：split-master-detail（左列表 + 右详情）。 */
export default function WorkbenchPage() {
  const { user } = useSession()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const groups = useAsyncData<{ items: Group[] }>(() => apiRequest('/api/groups'), [])
  const categories = useAsyncData<{ items: string[] }>(() => apiRequest('/api/categories'), [])
  // 公司筛选选项来自需求授权的跨公司聚合端点；列表结果仍由服务端按公司隔离过滤。
  const companies = useAsyncData<Distribution>(() => apiRequest('/api/stats/distribution?dimension=company'), [])
  const query = buildQuery({
    status: filters.status,
    category: filters.category,
    priority: filters.priority,
    groupId: filters.groupId,
    companyId: filters.companyKey,
    q: search,
    sort: filters.sort,
    order: filters.order,
    page,
    pageSize: PAGE_SIZE,
  })
  const tickets = useAsyncData<Page<TicketListItem>>(() => apiRequest(`/api/tickets?${query}`), [query])

  const updateFilter = (patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }))
    setPage(1)
  }

  const companyOptions = (companies.data?.items ?? []).filter((item) => item.label !== user.companyName)
  const items = tickets.data?.items ?? []

  return (
    <div>
      <PageHeader
        title="工单工作台"
        description="查看待处理工单并逐条处理：筛选、搜索、排序后选择工单，在右侧查看提交人完整信息与回复流。"
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="card flex min-w-0 flex-col">
          <div className="border-b border-slate-200 p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <label className="field">
                <span className="label">状态</span>
                <select
                  className="input"
                  value={filters.status}
                  onChange={(event) => updateFilter({ status: event.target.value as TicketStatus | '' })}
                >
                  <option value="">全部状态</option>
                  {TICKET_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_META[status].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">优先级</span>
                <select className="input" value={filters.priority} onChange={(event) => updateFilter({ priority: event.target.value })}>
                  <option value="">全部优先级</option>
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">分类</span>
                <select className="input" value={filters.category} onChange={(event) => updateFilter({ category: event.target.value })}>
                  <option value="">全部分类</option>
                  {(categories.data?.items ?? []).map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">业务组</span>
                <select className="input" value={filters.groupId} onChange={(event) => updateFilter({ groupId: event.target.value })}>
                  <option value="">全部业务组</option>
                  {(groups.data?.items ?? []).map((group) => (
                    <option key={group.groupId} value={group.groupId}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">公司（默认本公司）</span>
                <select
                  className="input"
                  value={filters.companyKey}
                  onChange={(event) => updateFilter({ companyKey: event.target.value })}
                  title="公司筛选；跨公司数据由服务端隔离，选择其他公司将返回空结果"
                >
                  <option value="">我的公司（{user.companyName || '未填写'}）</option>
                  {companyOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="field">
                  <span className="label">排序字段</span>
                  <select className="input" value={filters.sort} onChange={(event) => updateFilter({ sort: event.target.value })}>
                    <option value="createdAt">创建时间</option>
                    <option value="priority">优先级</option>
                    <option value="ticketNo">工单号</option>
                  </select>
                </label>
                <label className="field">
                  <span className="label">方向</span>
                  <select className="input" value={filters.order} onChange={(event) => updateFilter({ order: event.target.value })}>
                    <option value="desc">降序</option>
                    <option value="asc">升序</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="search"
                className="input"
                placeholder="搜索工单号 / 主题关键字"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label="搜索工单号或主题关键字"
              />
              <button
                type="button"
                className="btn-secondary shrink-0"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS)
                  setSearchInput('')
                  setPage(1)
                }}
              >
                重置
              </button>
            </div>
          </div>

          {tickets.loading ? (
            <SkeletonList rows={6} />
          ) : tickets.error ? (
            <div className="p-4">
              <ErrorNotice error={tickets.error} onRetry={tickets.reload} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="没有符合条件的工单"
              hint="可调整筛选条件、搜索关键字或切换排序后重试；未匹配自动分配规则的工单会先进入待分配。"
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((ticket) => (
                <TicketRow
                  key={ticket.ticketId}
                  ticket={ticket}
                  selected={selectedId === ticket.ticketId}
                  onSelect={() => setSelectedId(ticket.ticketId)}
                />
              ))}
            </div>
          )}
          {!tickets.loading && !tickets.error && (
            <Pagination
              page={tickets.data?.page ?? page}
              pageSize={tickets.data?.pageSize ?? PAGE_SIZE}
              total={tickets.data?.total ?? 0}
              onPage={setPage}
            />
          )}
        </section>

        <section className="min-w-0">
          {selectedId == null ? (
            <div className="card">
              <EmptyState
                title="从左侧选择一张工单"
                hint="右侧将展示提交人完整信息、历史工单、回复记录与处理操作。"
              />
            </div>
          ) : (
            <TicketDetailPanel ticketId={selectedId} onTicketChanged={() => tickets.reload()} />
          )}
        </section>
      </div>
    </div>
  )
}
