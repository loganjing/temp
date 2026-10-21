import { useEffect, useMemo, useState } from 'react'
import { listCategories, listCompanies, listGroups } from '../api'
import TicketDetailPanel from '../components/TicketDetailPanel'
import TicketListItem from '../components/TicketListItem'
import { EmptyState, ErrorState, ListSkeleton } from '../components/ui'
import { useSession } from '../session'
import { useDebouncedValue, useTicketList } from '../hooks'
import {
  priorities,
  statuses,
  statusLabels,
  type BusinessGroup,
  type Category,
  type CompanyOption,
  type ListScope,
  type Priority,
  type SortField,
  type SortOrder,
  type Status,
} from '../types'

export default function WorkbenchPage() {
  const { user } = useSession()
  const isOps = user.role === 'platform_ops'
  const isAgent = user.role === 'agent'
  const companyScoped = user.role === 'agent' || user.role === 'company_admin'

  const [status, setStatus] = useState<Status | ''>('processing')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortField>('created_at')
  const [order, setOrder] = useState<SortOrder>('desc')
  const [scope, setScope] = useState<ListScope>('group')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const q = useDebouncedValue(search)

  const query = useMemo(
    () => ({
      status: status || undefined,
      priority: priority || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      groupId: groupId ? Number(groupId) : undefined,
      companyId: isOps && companyId ? Number(companyId) : undefined,
      q: q || undefined,
      sort,
      order,
      scope: isAgent ? scope : undefined,
    }),
    [status, priority, categoryId, groupId, companyId, q, sort, order, scope, isOps, isAgent],
  )
  const { items, total, loading, error, reload } = useTicketList(query)

  const [categories, setCategories] = useState<Category[]>([])
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  useEffect(() => {
    if (companyScoped) {
      void listCategories()
        .then((result) => setCategories(result.items))
        .catch(() => setCategories([]))
      void listGroups()
        .then((result) => setGroups(result.items))
        .catch(() => setGroups([]))
    }
    if (isOps) {
      void listCompanies()
        .then((result) => setCompanies(result.items))
        .catch(() => setCompanies([]))
    }
  }, [companyScoped, isOps])

  // 组合条件变化时清空当前选中，避免详情与列表口径不一致
  useEffect(() => {
    setSelectedId(null)
  }, [query])

  return (
    <div className="flex h-full min-h-0 gap-4">
      <section className="flex min-h-0 w-[430px] shrink-0 flex-col gap-3">
        <div className="panel p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input w-52"
              placeholder="搜索工单号或主题"
              aria-label="搜索工单号或主题"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <select
              className="input w-28"
              aria-label="状态筛选"
              value={status}
              onChange={(event) => setStatus(event.currentTarget.value as Status | '')}
            >
              <option value="">全部状态</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
            <select
              className="input w-24"
              aria-label="优先级筛选"
              value={priority}
              onChange={(event) => setPriority(event.currentTarget.value as Priority | '')}
            >
              <option value="">优先级</option>
              {priorities.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            {companyScoped && (
              <select
                className="input w-32"
                aria-label="分类筛选"
                value={categoryId}
                onChange={(event) => setCategoryId(event.currentTarget.value)}
              >
                <option value="">全部分类</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            )}
            {companyScoped && (
              <select
                className="input w-32"
                aria-label="业务组筛选"
                value={groupId}
                onChange={(event) => setGroupId(event.currentTarget.value)}
              >
                <option value="">全部业务组</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            )}
            {isOps && (
              <select
                className="input w-40"
                aria-label="公司筛选"
                value={companyId}
                onChange={(event) => setCompanyId(event.currentTarget.value)}
              >
                <option value="">全部公司</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            )}
            {isAgent && (
              <div className="flex rounded-lg border border-slate-300 bg-white p-0.5" role="group" aria-label="查看范围">
                <button
                  type="button"
                  className={`min-h-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    scope === 'group' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setScope('group')}
                >
                  我的组
                </button>
                <button
                  type="button"
                  className={`min-h-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    scope === 'company' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setScope('company')}
                >
                  全公司
                </button>
              </div>
            )}
            <select
              className="input w-32"
              aria-label="排序字段"
              value={sort}
              onChange={(event) => setSort(event.currentTarget.value as SortField)}
            >
              <option value="created_at">按创建时间</option>
              <option value="priority">按优先级</option>
            </select>
            <button
              type="button"
              className="btn btn-secondary w-24"
              aria-label={`当前${order === 'desc' ? '降序' : '升序'}，点击切换`}
              title={`当前${order === 'desc' ? '降序' : '升序'}，点击切换`}
              onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')}
            >
              {order === 'desc' ? '降序 ↓' : '升序 ↑'}
            </button>
          </div>
          <p className="mt-2 px-1 text-xs text-slate-500">
            {loading ? '查询中…' : `共 ${total} 张工单`}
            {status && !loading && ` · 状态：${statusLabels[status]}`}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : loading ? (
            <ListSkeleton rows={5} />
          ) : items.length === 0 ? (
            <EmptyState
              title="没有符合条件的工单"
              hint="调整状态、优先级、分类、公司筛选或搜索关键词后重新查询。"
            />
          ) : (
            items.map((ticket) => (
              <TicketListItem
                key={ticket.id}
                ticket={ticket}
                selected={selectedId === ticket.id}
                onSelect={setSelectedId}
              />
            ))
          )}
        </div>
      </section>

      <section className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
        <TicketDetailPanel ticketId={selectedId} currentUser={user} onTicketChanged={reload} />
      </section>
    </div>
  )
}
