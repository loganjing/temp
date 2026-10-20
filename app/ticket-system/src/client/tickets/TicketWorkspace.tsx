import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listTickets } from '../api/tickets'
import { listCategories, listGroups } from '../api/admin'
import { useResource } from '../hooks/useResource'
import { PRIORITY_LABELS, PRIORITY_OPTIONS, STATUS_LABELS, TICKET_STATUS_OPTIONS, formatDateTime } from '../domain/labels'
import { PriorityBadge, StatusBadge } from '../components/badges'
import { EmptyState, ErrorBanner, LoadingIndicator, buttonPrimaryClass, inputClass } from '../components/feedback'
import { Pagination } from '../components/Pagination'
import type { TicketSort, TicketView } from '../platform/types'
import TicketDetail from './TicketDetail'

export interface TicketWorkspaceProps {
  view: Extract<TicketView, 'workbench' | 'mine'>
}

const PAGE_SIZE = 20

const SORT_OPTIONS: { value: TicketSort; label: string }[] = [
  { value: 'created_at', label: '创建时间' },
  { value: 'priority', label: '优先级' },
  { value: 'status', label: '状态' },
]

const isWorkbench = (view: TicketWorkspaceProps['view']) => view === 'workbench'

export default function TicketWorkspace({ view }: TicketWorkspaceProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchText, setSearchText] = useState(searchParams.get('q') ?? '')

  const selectedTicketId = searchParams.get('ticket')
  const selectedStatuses = useMemo(() => (searchParams.get('status') ?? '').split(',').filter(Boolean), [searchParams])
  const category = searchParams.get('category') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const group = searchParams.get('group') ?? ''
  const q = searchParams.get('q') ?? ''
  const sort = (searchParams.get('sort') ?? 'created_at') as TicketSort
  const order = searchParams.get('order') ?? 'desc'
  const page = Math.max(Number(searchParams.get('page') ?? 1) || 1, 1)

  const updateParams = useCallback(
    (patch: Record<string, string | null>, resetPage = false) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === '') next.delete(key)
            else next.set(key, value)
          }
          if (resetPage) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // 搜索输入防抖后写入查询参数。
  useEffect(() => {
    setSearchText(q)
  }, [q])
  useEffect(() => {
    if (searchText === q) return
    const timer = window.setTimeout(() => {
      updateParams({ q: searchText || null }, true)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchText, q, updateParams])

  const categories = useResource(() => listCategories(), '分类清单加载失败')
  const groups = useResource(() => listGroups(), '业务组加载失败')

  const loader = useCallback(
    () =>
      listTickets({
        view,
        status: selectedStatuses,
        category: category || undefined,
        priority: priority || undefined,
        group: group ? Number(group) : undefined,
        q: q || undefined,
        sort,
        order: order === 'asc' ? 'asc' : 'desc',
        page,
        pageSize: PAGE_SIZE,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 查询参数决定重载。
    [view, searchParams],
  )
  const tickets = useResource(loader, '工单列表加载失败')

  const toggleStatus = (status: string) => {
    const next = selectedStatuses.includes(status) ? selectedStatuses.filter((item) => item !== status) : [...selectedStatuses, status]
    updateParams({ status: next.length > 0 ? next.join(',') : null }, true)
  }

  const selectTicket = (id: number) => {
    updateParams({ ticket: String(id) })
  }

  const title = isWorkbench(view) ? '工单工作台' : '我的工单'
  const description = isWorkbench(view)
    ? '查看本公司工单并处理；支持按状态、分类、优先级、业务组筛选与关键字搜索。'
    : '我提交的工单；完成后可进行满意度评价。'
  const items = tickets.data?.items ?? []

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 xl:flex-row">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          </div>
          <Link to="/tickets/new" className={buttonPrimaryClass}>
            新建工单
          </Link>
        </div>

        <div className="grid shrink-0 gap-2.5 border-b border-slate-100 px-5 py-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            className={inputClass}
            value={searchText}
            placeholder="搜索工单编号或主题…"
            aria-label="搜索工单"
            onChange={(event) => setSearchText(event.currentTarget.value)}
          />
          <select className={inputClass} aria-label="按分类筛选" value={category} onChange={(event) => updateParams({ category: event.currentTarget.value || null }, true)}>
            <option value="">全部分类</option>
            {categories.data?.items.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select className={inputClass} aria-label="按优先级筛选" value={priority} onChange={(event) => updateParams({ priority: event.currentTarget.value || null }, true)}>
            <option value="">全部优先级</option>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {PRIORITY_LABELS[option]}
              </option>
            ))}
          </select>
          {isWorkbench(view) && (
            <select className={inputClass} aria-label="按业务组筛选" value={group} onChange={(event) => updateParams({ group: event.currentTarget.value || null }, true)}>
              <option value="">全部业务组</option>
              {groups.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
          <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs text-slate-500">状态：</span>
            {TICKET_STATUS_OPTIONS.map((status) => (
              <label key={status} className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
                  checked={selectedStatuses.includes(status)}
                  onChange={() => toggleStatus(status)}
                />
                {STATUS_LABELS[status]}
              </label>
            ))}
            <span className="ml-auto flex items-center gap-2">
              <select
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
                aria-label="排序字段"
                value={sort}
                onChange={(event) => updateParams({ sort: event.currentTarget.value }, true)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    按{option.label}排序
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                aria-label={order === 'desc' ? '当前降序，切换为升序' : '当前升序，切换为降序'}
                onClick={() => updateParams({ order: order === 'desc' ? 'asc' : 'desc' }, true)}
              >
                {order === 'desc' ? '降序' : '升序'}
              </button>
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tickets.loading && items.length === 0 ? (
            <LoadingIndicator label="加载工单列表…" />
          ) : tickets.error ? (
            <div className="p-5">
              <ErrorBanner message={tickets.error} />
            </div>
          ) : items.length === 0 ? (
            <div className="p-5">
              <EmptyState title="暂无符合条件的工单" hint={q ? '试试更换关键字或清除筛选条件。' : '新建工单后会出现在这里。'} />
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="px-4 py-2.5 font-medium">编号</th>
                  <th className="px-3 py-2.5 font-medium">主题</th>
                  <th className="px-3 py-2.5 font-medium">分类</th>
                  <th className="px-3 py-2.5 font-medium">优先级</th>
                  <th className="px-3 py-2.5 font-medium">状态</th>
                  <th className="px-3 py-2.5 font-medium">提交人</th>
                  <th className="px-3 py-2.5 font-medium">业务组</th>
                  <th className="px-4 py-2.5 font-medium">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const selected = selectedTicketId === String(item.id)
                  return (
                    <tr
                      key={item.id}
                      className={`cursor-pointer border-b border-slate-50 transition-colors ${selected ? 'bg-indigo-50/70' : 'hover:bg-slate-50'}`}
                      onClick={() => selectTicket(item.id)}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-indigo-700">
                        {item.ticketNo}
                      </td>
                      <td className="max-w-52 truncate px-3 py-2.5 text-slate-700" title={item.subject}>
                        {item.subject}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{item.category}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <PriorityBadge priority={item.priority} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{item.submitterName}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{item.groupName ?? '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{formatDateTime(item.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={tickets.data?.total ?? 0}
          onPage={(nextPage) => updateParams({ page: nextPage === 1 ? null : String(nextPage) })}
        />
      </section>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white xl:w-[480px] xl:shrink-0">
        {selectedTicketId && Number(selectedTicketId) > 0 ? (
          <TicketDetail
            ticketId={Number(selectedTicketId)}
            onClose={() => updateParams({ ticket: null })}
            onTicketChange={() => tickets.reload()}
            onSelectTicket={(id) => selectTicket(id)}
          />
        ) : (
          <div className="grid h-full min-h-60 place-items-center p-6">
            <EmptyState title="选择左侧工单查看详情" hint="详情面板提供回复、转派、完成、取消与评价操作。" />
          </div>
        )}
      </aside>
    </div>
  )
}
