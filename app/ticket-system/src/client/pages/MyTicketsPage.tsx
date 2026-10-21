import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createTicket, listCategories } from '../api'
import TicketDetailPanel from '../components/TicketDetailPanel'
import TicketListItem from '../components/TicketListItem'
import { EmptyState, ErrorState, ListSkeleton, apiErrorMessage, useToast } from '../components/ui'
import { useSession } from '../session'
import { useDebouncedValue, useTicketList } from '../hooks'
import {
  priorities,
  statuses,
  statusLabels,
  type Category,
  type Priority,
  type SortField,
  type SortOrder,
  type Status,
} from '../types'

export default function MyTicketsPage() {
  const { user } = useSession()
  const toast = useToast()
  const canCreate = user.role === 'submitter' || user.role === 'agent' || user.role === 'company_admin'

  // 创建工单表单
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState<Priority>('P2')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [categories, setCategories] = useState<Category[]>([])

  // 列表筛选
  const [status, setStatus] = useState<Status | ''>('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortField>('created_at')
  const [order, setOrder] = useState<SortOrder>('desc')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const q = useDebouncedValue(search)

  const query = useMemo(
    () => ({
      mine: 1 as const,
      status: status || undefined,
      q: q || undefined,
      sort,
      order,
    }),
    [status, q, sort, order],
  )
  const { items, total, loading, error, reload } = useTicketList(query)

  useEffect(() => {
    if (!canCreate) return
    void listCategories()
      .then((result) => setCategories(result.items))
      .catch(() => setCategories([]))
  }, [canCreate])

  useEffect(() => {
    setSelectedId(null)
  }, [query])

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!categoryId) {
      setCreateError('请选择问题分类')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const ticket = await createTicket({
        subject: subject.trim(),
        description: description.trim(),
        categoryId: Number(categoryId),
        priority,
      })
      toast.show(`工单 ${ticket.ticketNo} 已创建`)
      setSubject('')
      setDescription('')
      setCategoryId('')
      setPriority('P2')
      reload()
      setSelectedId(ticket.id)
    } catch (cause) {
      setCreateError(apiErrorMessage(cause))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {canCreate && (
        <section className="panel p-4">
          <h3 className="text-sm font-semibold text-slate-800">创建工单</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            提交后系统按公司分配规则自动指派业务组；未命中规则时进入待分配。
          </p>
          <form className="mt-3 grid grid-cols-[minmax(180px,1fr)_150px_120px_auto] items-start gap-3" onSubmit={(event) => void submitCreate(event)}>
            <label className="block">
              <span className="label-text">主题（1–200 字）</span>
              <input
                className="input"
                required
                minLength={1}
                maxLength={200}
                placeholder="简要描述问题"
                value={subject}
                onChange={(event) => setSubject(event.currentTarget.value)}
              />
            </label>
            <label className="block">
              <span className="label-text">分类</span>
              <select
                className="input"
                required
                value={categoryId}
                onChange={(event) => setCategoryId(event.currentTarget.value)}
              >
                <option value="">选择分类</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label-text">SLA 优先级</span>
              <select
                className="input"
                value={priority}
                onChange={(event) => setPriority(event.currentTarget.value as Priority)}
              >
                {priorities.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <div className="pt-6">
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? '提交中…' : '创建工单'}
              </button>
            </div>
            <label className="col-span-4 block">
              <span className="label-text">问题描述（1–5000 字）</span>
              <textarea
                className="input min-h-0 h-auto w-full resize-y px-3 py-2 leading-relaxed"
                rows={3}
                required
                maxLength={5000}
                placeholder="补充问题细节、影响范围与期望结果"
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </label>
            {createError && (
              <p role="alert" className="col-span-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {createError}
              </p>
            )}
          </form>
        </section>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
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
              {loading ? '查询中…' : `我的工单共 ${total} 张`}
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : loading ? (
              <ListSkeleton rows={4} />
            ) : items.length === 0 ? (
              <EmptyState
                title="还没有工单"
                hint={canCreate ? '使用上方表单创建第一张工单，提交后可在此跟踪处理进度。' : '当前账号暂无提交的工单。'}
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
    </div>
  )
}
