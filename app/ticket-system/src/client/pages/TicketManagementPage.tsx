import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ticketsApi, type TicketListQuery } from '../api/tickets'
import { categoriesApi, groupsApi } from '../api/company'
import { usersApi } from '../api/auth'
import { PriorityBadge, StatusBadge } from '../components/Badges'
import { EmptyState, ErrorState, ForbiddenState, Skeleton, SkeletonRows } from '../components/States'
import { Pagination } from '../components/Pagination'
import { Modal } from '../components/Modal'
import { PlusIcon, RefreshIcon, SearchIcon, SendIcon, StarIcon } from '../components/Icon'
import { formatDateTime, truncate } from '../lib/format'
import {
  ACTION_TYPE_LABEL,
  SLA_PRIORITY_OPTIONS,
  SLA_PRIORITY_WEIGHT,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_OPTIONS,
} from '../lib/constants'
import type {
  OperationLog,
  SLAPriority,
  SubmitterInfo,
  Ticket,
  TicketCategory,
  TicketDetail,
  TicketEvaluation,
  TicketStatus,
  UserInfo,
} from '../types'

type SortField = 'createdAt' | 'slaPriority' | 'status'

export function TicketManagementPage({ user }: { user: UserInfo }) {
  const companyId = user.companyId
  const canCreate = user.role === 'submitter' || user.role === 'admin'

  const [items, setItems] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<TicketStatus | ''>('')
  const [priority, setPriority] = useState<SLAPriority | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [sortBy, setSortBy] = useState<SortField>('createdAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (!companyId) return
    categoriesApi.list(companyId).then(setCategories).catch(() => setCategories([]))
  }, [companyId])

  const query: TicketListQuery = useMemo(
    () => ({
      page,
      pageSize,
      status: status || undefined,
      slaPriority: priority || undefined,
      categoryId: categoryId || undefined,
      keyword: keyword || undefined,
      sortBy,
      sortOrder,
    }),
    [page, status, priority, categoryId, keyword, sortBy, sortOrder],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await ticketsApi.list(query)
      setItems(res.items)
      setTotal(res.total)
      if (!selectedId && res.items.length > 0) setSelectedId(res.items[0].id)
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : '加载工单失败'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [query, selectedId])

  useEffect(() => { void load() }, [load])

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">工单管理</h2>
        {canCreate && (
          <button type="button" className="inline-flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
            <PlusIcon size={15} /> 创建工单
          </button>
        )}
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[420px_1fr]">
        {/* 左侧列表 */}
        <section className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="space-y-2 border-b border-slate-100 p-3">
            <div className="relative">
              <SearchIcon size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="!pl-8" placeholder="搜索主题/描述" value={keyword} onChange={(e) => { setKeyword(e.target.value); setPage(1) }} />
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="!min-h-0 !py-1 text-xs" value={status} onChange={(e) => { setStatus(e.target.value as TicketStatus | ''); setPage(1) }}>
                <option value="">全部状态</option>
                {TICKET_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{TICKET_STATUS_LABEL[s]}</option>)}
              </select>
              <select className="!min-h-0 !py-1 text-xs" value={priority} onChange={(e) => { setPriority(e.target.value as SLAPriority | ''); setPage(1) }}>
                <option value="">全部优先级</option>
                {SLA_PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className="!min-h-0 !py-1 text-xs" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1) }}>
                <option value="">全部分类</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="!min-h-0 !py-1 text-xs" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortField)}>
                <option value="createdAt">创建时间</option>
                <option value="slaPriority">优先级</option>
                <option value="status">状态</option>
              </select>
              <select className="!min-h-0 !py-1 text-xs" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}>
                <option value="desc">降序</option>
                <option value="asc">升序</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-3"><SkeletonRows count={5} /></div>
            ) : error ? (
              <div className="p-3"><ErrorState message={error} onRetry={load} /></div>
            ) : items.length === 0 ? (
              <div className="p-3">
                <EmptyState title="暂无工单" description="创建工单后将在此显示" action={canCreate ? (
                  <button type="button" className="inline-flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
                    <PlusIcon size={15} /> 创建工单
                  </button>
                ) : undefined} />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`flex w-full flex-col gap-1 px-3 py-2.5 text-left hover:bg-slate-50 ${selectedId === t.id ? 'bg-blue-50/60' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-800" title={t.title}>{truncate(t.title, 30)}</span>
                        <PriorityBadge priority={t.slaPriority} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <StatusBadge status={t.status} />
                        <span className="truncate">{t.categoryName}</span>
                        <span>· {formatDateTime(t.createdAt)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-slate-100 px-3">
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </div>
        </section>

        {/* 右侧详情 */}
        <section className="overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {!selectedId ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState title="选择左侧工单查看详情" />
            </div>
          ) : (
            <TicketDetailPanel
              key={selectedId}
              id={selectedId}
              user={user}
              categories={categories}
              onTicketChanged={() => void load()}
            />
          )}
        </section>
      </div>

      {showCreate && (
        <CreateTicketModal
          companyId={companyId}
          categories={categories}
          onClose={() => setShowCreate(false)}
          onCreated={(t) => { setShowCreate(false); setSelectedId(t.id); void load() }}
        />
      )}
    </div>
  )
}

function TicketDetailPanel({
  id,
  user,
  categories,
  onTicketChanged,
}: {
  id: string
  user: UserInfo
  categories: TicketCategory[]
  onTicketChanged: () => void
}) {
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [submitter, setSubmitter] = useState<SubmitterInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')
  const [tab, setTab] = useState<'replies' | 'submitter' | 'logs'>('replies')

  const [action, setAction] = useState<null | 'assign' | 'transfer' | 'complete' | 'cancel' | 'evaluate'>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setForbidden(false)
    try {
      const d = await ticketsApi.detail(id)
      setDetail(d)
      try { setLogs(await ticketsApi.logs(id)) } catch { setLogs([]) }
    } catch (cause) {
      const e = cause as { status?: number; message?: string }
      if (e.status === 403) setForbidden(true)
      setError(e.message ?? '加载详情失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const loadSubmitter = useCallback(async () => {
    try {
      setSubmitter(await ticketsApi.submitterInfo(id))
    } catch {
      setSubmitter(null)
    }
  }, [id])

  useEffect(() => {
    if (tab === 'submitter' && !submitter) void loadSubmitter()
  }, [tab, submitter, loadSubmitter])

  const refreshDetail = async () => {
    try { setDetail(await ticketsApi.detail(id)) } catch { /* keep */ }
  }

  const addReply = async (e: FormEvent) => {
    e.preventDefault()
    if (!reply.trim()) return
    setBusy(true)
    try {
      await ticketsApi.addReply(id, reply.trim())
      setReply('')
      await refreshDetail()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '回复失败')
    } finally {
      setBusy(false)
    }
  }

  const sortedReplies = useMemo(() => {
    if (!detail) return []
    return [...detail.replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [detail])

  if (loading) return <div className="space-y-3 p-4"><Skeleton className="h-8 w-2/3" /><SkeletonRows count={4} /></div>
  if (forbidden) return <div className="p-6"><ForbiddenState /></div>
  if (error || !detail) return <div className="p-6"><ErrorState message={error || '加载失败'} onRetry={load} /></div>

  const t = detail
  const isHandler = user.role === 'handler' || (user.roles ?? []).includes('handler')
  const isAdmin = user.role === 'admin' || (user.roles ?? []).includes('admin')
  const isSubmitter = t.submitterId === user.id || user.role === 'submitter'
  const canAssign = (isAdmin || isHandler) && (t.status === 'pending_assignment')
  const canTransfer = isHandler && t.status === 'pending_processing'
  const canComplete = isHandler && t.status === 'pending_processing'
  const canCancel = (isSubmitter || isAdmin) && (t.status === 'pending_assignment' || t.status === 'pending_processing')
  const canEvaluate = isSubmitter && t.status === 'completed' && !t.evaluation

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusBadge status={t.status} />
              <PriorityBadge priority={t.slaPriority} />
              <span className="text-xs text-slate-400">#{t.id.slice(0, 8)}</span>
            </div>
            <h3 className="mt-2 text-base font-semibold text-slate-800" title={t.title}>{t.title}</h3>
            <p className="mt-1 text-xs text-slate-500">分类：{t.categoryName} · 创建于 {formatDateTime(t.createdAt)}</p>
          </div>
          <button type="button" className="secondary !min-h-0 !px-2 !py-1.5 inline-flex items-center gap-1" onClick={load}>
            <RefreshIcon size={13} /> 刷新
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {canAssign && <button type="button" className="!min-h-0 !px-3 !py-1.5 text-xs" onClick={() => setAction('assign')}>分配</button>}
          {canTransfer && <button type="button" className="!min-h-0 !px-3 !py-1.5 text-xs" onClick={() => setAction('transfer')}>转派</button>}
          {canComplete && <button type="button" className="!min-h-0 !px-3 !py-1.5 text-xs" onClick={() => setAction('complete')}>完成</button>}
          {canCancel && <button type="button" className="secondary !min-h-0 !px-3 !py-1.5 text-xs text-rose-600" onClick={() => setAction('cancel')}>取消</button>}
          {canEvaluate && <button type="button" className="!min-h-0 !px-3 !py-1.5 text-xs" onClick={() => setAction('evaluate')}>评价</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3 text-xs">
        <Field label="提交人" value={t.submitterName} />
        <Field label="分配处理人" value={t.assignedHandlerName ?? '未分配'} />
        <Field label="分配业务组" value={t.assignedGroupName ?? '—'} />
        <Field label="完成处理人" value={t.handlerName ?? '—'} />
        <Field label="完成时间" value={t.handledAt ? formatDateTime(t.handledAt) : '—'} />
        <Field label="更新时间" value={formatDateTime(t.updatedAt)} />
      </div>

      <div className="border-b border-slate-100 px-4 py-2">
        <p className="text-xs font-medium text-slate-500">描述</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{t.description}</p>
      </div>

      {/* 评价结果展示 */}
      {t.evaluation && (
        <div className="border-b border-slate-100 px-4 py-2">
          <p className="text-xs font-medium text-slate-500">满意度评价</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <StarIcon key={i} size={16} filled={i < t.evaluation!.rating} className={i < t.evaluation!.rating ? 'text-amber-400' : 'text-slate-300'} />
              ))}
            </span>
            <span className="text-xs text-slate-600">{t.evaluation.rating} / 5</span>
            {t.evaluation.comment && <span className="text-xs text-slate-500">· {t.evaluation.comment}</span>}
          </div>
        </div>
      )}

      {/* Tab 区域 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex border-b border-slate-100">
          {(['replies', 'submitter', 'logs'] as const).map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className={`!min-h-0 !rounded-none border-b-2 !px-4 !py-2 text-xs ${tab === tb ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'}`}
            >
              {tb === 'replies' ? `回复 (${sortedReplies.length})` : tb === 'submitter' ? '提交人信息' : '操作日志'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'replies' && (
            <div className="space-y-3">
              {sortedReplies.length === 0 ? (
                <EmptyState title="暂无回复" />
              ) : sortedReplies.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{r.replierName}</span>
                    <span>{formatDateTime(r.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{r.content}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'submitter' && (
            <SubmitterInfoView submitter={submitter} loading={!submitter} />
          )}

          {tab === 'logs' && (
            <div className="space-y-2">
              {logs.length === 0 ? <EmptyState title="暂无操作日志" /> : logs.map((l) => (
                <div key={l.id} className="flex items-start gap-3 text-xs">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  <div className="min-w-0">
                    <span className="font-medium text-slate-700">{ACTION_TYPE_LABEL[l.actionType] ?? l.actionType}</span>
                    <span className="text-slate-500"> · {l.actorName}</span>
                    <p className="text-slate-400">{formatDateTime(l.createdAt)}{l.detail ? ` · ${l.detail}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 回复输入 */}
        <form onSubmit={addReply} className="flex items-end gap-2 border-t border-slate-100 p-3">
          <label className="flex-1 text-xs text-slate-500">
            添加回复
            <textarea className="mt-1 min-h-[60px] resize-y" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="输入回复内容…" />
          </label>
          <button type="submit" disabled={busy || !reply.trim()} className="inline-flex items-center gap-1.5 self-end">
            <SendIcon size={15} /> 发送
          </button>
        </form>
      </div>

      {/* 操作弹窗 */}
      {action && detail && (
        <ActionDialog
          action={action}
          ticket={detail}
          user={user}
          categories={categories}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); void load(); onTicketChanged() }}
        />
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{value}</dd>
    </div>
  )
}

function SubmitterInfoView({ submitter, loading }: { submitter: SubmitterInfo | null; loading: boolean }) {
  if (loading) return <SkeletonRows count={3} />
  if (!submitter) return <EmptyState title="无法加载提交人信息" description="可能需要处理人或管理员权限" />
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Field label="姓名" value={submitter.fullName} />
        <Field label="邮箱" value={submitter.email} />
        <Field label="公司" value={submitter.companyName} />
        <Field label="部门" value={submitter.departmentName ?? '—'} />
        <Field label="历史工单数" value={String(submitter.ticketCount)} />
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">历史工单</p>
        {submitter.historyTickets.length === 0 ? (
          <EmptyState title="暂无历史工单" />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {submitter.historyTickets.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="truncate text-slate-700" title={h.title}>{truncate(h.title, 36)}</span>
                <span className="flex items-center gap-2">
                  <PriorityBadge priority={h.slaPriority} />
                  <StatusBadge status={h.status} />
                  <span className="text-slate-400">{formatDateTime(h.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ActionDialog({
  action,
  ticket,
  user,
  categories,
  onClose,
  onDone,
}: {
  action: 'assign' | 'transfer' | 'complete' | 'cancel' | 'evaluate'
  ticket: TicketDetail
  user: UserInfo
  categories: TicketCategory[]
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [targetType, setTargetType] = useState<'user' | 'group'>('group')
  const [targetUserId, setTargetUserId] = useState('')
  const [targetGroupId, setTargetGroupId] = useState('')
  const [reason, setReason] = useState('')
  const [summary, setSummary] = useState('')
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')

  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [members, setMembers] = useState<{ id: string; name: string; email: string }[]>([])

  useEffect(() => {
    groupsApi.list(user.companyId).then((gs) => { setGroups(gs); if (gs[0]) setTargetGroupId(gs[0].id) }).catch(() => setGroups([]))
    usersApi.list(user.companyId).then((r) => setMembers(r.users)).catch(() => setMembers([]))
  }, [user.companyId])

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      if (action === 'assign' || action === 'transfer') {
        if (targetType === 'user' && !targetUserId) throw new Error('请选择目标处理人')
        if (targetType === 'group' && !targetGroupId) throw new Error('请选择目标业务组')
        const body = { targetType, targetUserId: targetType === 'user' ? targetUserId : undefined, targetGroupId: targetType === 'group' ? targetGroupId : undefined, reason: reason || undefined }
        if (action === 'assign') await ticketsApi.assign(ticket.id, body)
        else await ticketsApi.transfer(ticket.id, body)
      } else if (action === 'complete') {
        await ticketsApi.complete(ticket.id, summary || undefined)
      } else if (action === 'cancel') {
        await ticketsApi.cancel(ticket.id, reason || undefined)
      } else if (action === 'evaluate') {
        await ticketsApi.submitEvaluation(ticket.id, rating, comment || undefined)
      }
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const titles: Record<typeof action, string> = {
    assign: '分配工单',
    transfer: '转派工单',
    complete: '完成工单',
    cancel: '取消工单',
    evaluate: '满意度评价',
  }

  return (
    <Modal
      open
      title={titles[action]}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="secondary !min-h-0 !px-3 !py-1.5 text-xs" onClick={onClose}>取消</button>
          <button type="button" disabled={busy} className="!min-h-0 !px-3 !py-1.5 text-xs" onClick={() => void submit()}>{busy ? '处理中…' : '确认'}</button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <p className="text-xs text-rose-600">{error}</p>}

        {(action === 'assign' || action === 'transfer') && (
          <>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
              {(['group', 'user'] as const).map((tt) => (
                <button key={tt} type="button" onClick={() => setTargetType(tt)} className={`!min-h-0 !px-3 !py-1 text-xs ${targetType === tt ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>
                  {tt === 'group' ? '业务组' : '处理人'}
                </button>
              ))}
            </div>
            {targetType === 'group' ? (
              <label className="block text-xs text-slate-500">目标业务组
                <select className="mt-1" value={targetGroupId} onChange={(e) => setTargetGroupId(e.target.value)}>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
            ) : (
              <label className="block text-xs text-slate-500">目标处理人
                <select className="mt-1" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
                  <option value="">选择用户</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.email}</option>)}
                </select>
              </label>
            )}
            {action === 'transfer' && (
              <label className="block text-xs text-slate-500">转派原因（可选）
                <textarea className="mt-1 min-h-[60px]" value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
            )}
          </>
        )}

        {action === 'complete' && (
          <label className="block text-xs text-slate-500">处理摘要（可选）
            <textarea className="mt-1 min-h-[80px]" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="说明处理结果…" />
          </label>
        )}

        {action === 'cancel' && (
          <label className="block text-xs text-slate-500">取消原因（可选）
            <textarea className="mt-1 min-h-[60px]" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}

        {action === 'evaluate' && (
          <>
            <div>
              <p className="text-xs text-slate-500">满意度评分</p>
              <div className="mt-1 flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => {
                  const v = i + 1
                  return (
                    <button key={v} type="button" onClick={() => setRating(v)} className="!min-h-0 !p-1">
                      <StarIcon size={24} filled={v <= rating} className={v <= rating ? 'text-amber-400' : 'text-slate-300'} />
                    </button>
                  )
                })}
                <span className="ml-2 self-center text-xs text-slate-600">{rating} / 5</span>
              </div>
            </div>
            <label className="block text-xs text-slate-500">评论（可选）
              <textarea className="mt-1 min-h-[60px]" value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
          </>
        )}
      </div>
    </Modal>
  )
}

function CreateTicketModal({
  companyId,
  categories,
  onClose,
  onCreated,
}: {
  companyId: string
  categories: TicketCategory[]
  onClose: () => void
  onCreated: (t: Ticket) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState<SLAPriority>('P2')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!categoryId && categories[0]) setCategoryId(categories[0].id)
  }, [categories, categoryId])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim() || !categoryId) return
    setBusy(true)
    setError('')
    try {
      const t = await ticketsApi.create({
        title: title.trim(),
        description: description.trim(),
        categoryId,
        slaPriority: priority,
      })
      onCreated(t)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title="创建工单"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="secondary !min-h-0 !px-3 !py-1.5 text-xs" onClick={onClose}>取消</button>
          <button type="submit" form="create-ticket-form" disabled={busy} className="!min-h-0 !px-3 !py-1.5 text-xs">{busy ? '提交中…' : '创建'}</button>
        </>
      }
    >
      <form id="create-ticket-form" onSubmit={submit} className="space-y-3">
        {error && <p className="text-xs text-rose-600">{error}</p>}
        {categories.length === 0 ? (
          <p className="text-xs text-amber-600">当前公司尚未配置分类，请联系管理员先创建分类。</p>
        ) : (
          <>
            <label className="block text-xs text-slate-500">主题
              <input className="mt-1" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="简明描述问题" />
            </label>
            <label className="block text-xs text-slate-500">描述
              <textarea className="mt-1 min-h-[100px]" value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="详细说明问题现象、影响等" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-slate-500">分类
                <select className="mt-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block text-xs text-slate-500">SLA 优先级
                <select className="mt-1" value={priority} onChange={(e) => setPriority(e.target.value as SLAPriority)}>
                  {SLA_PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>
          </>
        )}
      </form>
    </Modal>
  )
}
