import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../platform/api'
import type { HistoricalTicket, TicketDetail, TicketListItem } from '../platform/contracts'
import { useApp } from '../app-context'
import { formatTime, PriorityBadge, StatusBadge } from '../components/badges'

const statusFilters: { value: string; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'pending_assignment', label: '待分配' },
  { value: 'pending_handling', label: '待处理' },
  { value: 'completed', label: '完成' },
  { value: 'cancelled', label: '取消' },
]

export default function WorkbenchPage() {
  const { companies, companyId, operatorId, currentGroups, currentUsers, users } = useApp()

  const [tickets, setTickets] = useState<TicketListItem[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [keyword, setKeyword] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TicketDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  const userName = useMemo(() => new Map(users.map((user) => [user.id, user.name])), [users])
  const groupName = useMemo(() => new Map(currentGroups.map((group) => [group.id, group.name])), [currentGroups])

  const loadTickets = useCallback(() => {
    if (!companyId) return
    setListError(null)
    api.tickets({ companyId, status: statusFilter || undefined, keyword: keyword || undefined })
      .then((result) => setTickets(result.tickets))
      .catch((cause: unknown) => {
        setTickets([])
        setListError(cause instanceof Error ? cause.message : '加载工单列表失败')
      })
  }, [companyId, statusFilter, keyword])

  useEffect(() => { setTickets(null); loadTickets() }, [loadTickets])

  const loadDetail = useCallback((ticketId: string) => {
    setDetailError(null)
    setDetail(null)
    api.ticketDetail(ticketId)
      .then(setDetail)
      .catch((cause: unknown) => setDetailError(cause instanceof Error ? cause.message : '加载工单详情失败'))
  }, [])

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail])

  const [actionError, setActionError] = useState<string | null>(null)
  const runAction = useCallback((action: () => Promise<unknown>) => {
    setActionError(null)
    action()
      .then(() => { if (selectedId) loadDetail(selectedId); loadTickets() })
      .catch((cause: unknown) => setActionError(cause instanceof Error ? cause.message : '操作失败'))
  }, [selectedId, loadDetail, loadTickets])

  const operator = operatorId ?? ''
  const companyGroups = currentGroups

  // 分配
  const [assignGroupId, setAssignGroupId] = useState('')
  useEffect(() => {
    setAssignGroupId(companyGroups[0]?.id ?? '')
  }, [companyGroups])

  // 转派
  const [transferTarget, setTransferTarget] = useState('')
  const [transferNote, setTransferNote] = useState('')
  const transferOptions = useMemo(() => {
    const options = companyGroups.map((group) => ({ value: `group:${group.id}`, label: `业务组：${group.name}` }))
    for (const group of companyGroups) {
      for (const memberId of group.memberIds) {
        options.push({ value: `user:${memberId}`, label: `成员：${userName.get(memberId) ?? memberId}（${group.name}）` })
      }
    }
    return options
  }, [companyGroups, userName])

  // 回复
  const [replyContent, setReplyContent] = useState('')

  // 取消
  const [cancelNote, setCancelNote] = useState('')

  // 历史工单
  const [history, setHistory] = useState<HistoricalTicket[] | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)

  // 评价
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')

  useEffect(() => {
    setHistory(null)
    setHistoryError(null)
    setReplyContent('')
    setActionError(null)
    setTransferNote('')
    setCancelNote('')
  }, [selectedId])

  const status = detail?.ticket.status

  return (
    <div className="flex h-full min-h-0">
      <section className="flex w-96 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold text-slate-700">工单队列</h1>
            <Link
              to="/tickets/new"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              新建工单
            </Link>
          </div>
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {statusFilters.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
              placeholder="主题关键词"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {listError && <p className="p-3 text-xs text-rose-600">{listError}</p>}
          {tickets === null && !listError && <p className="p-3 text-xs text-slate-400">加载中…</p>}
          {tickets?.length === 0 && <p className="p-3 text-xs text-slate-400">暂无工单</p>}
          <ul>
            {tickets?.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  className={`w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50 ${selectedId === ticket.id ? 'bg-slate-100' : ''}`}
                  onClick={() => setSelectedId(ticket.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium" title={ticket.subject}>{ticket.subject}</span>
                    <PriorityBadge priority={ticket.priority} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <StatusBadge status={ticket.status} />
                    <span className="truncate">{ticket.id}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-400">
                    {ticket.submitterName} · {formatTime(ticket.createdAt)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-auto p-4">
        {!selectedId && <p className="text-sm text-slate-400">从左侧选择一张工单查看详情</p>}
        {detailError && <p className="text-sm text-rose-600">{detailError}</p>}
        {selectedId && !detail && !detailError && <p className="text-sm text-slate-400">加载中…</p>}

        {detail && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{detail.ticket.subject}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <StatusBadge status={detail.ticket.status} />
                    <PriorityBadge priority={detail.ticket.priority} />
                    <span>分类：{detail.ticket.category}</span>
                    <span title={detail.ticket.id}>{detail.ticket.id}</span>
                    <span>创建于 {formatTime(detail.ticket.createdAt)}</span>
                  </div>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{detail.ticket.description}</p>
            </div>

            {/* 提交人信息面板 */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-700">提交人信息</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-slate-500">姓名：</span>{detail.ticket.submitter.name}</div>
                <div className="truncate" title={detail.ticket.submitter.email}>
                  <span className="text-slate-500">邮箱：</span>{detail.ticket.submitter.email}
                </div>
                <div><span className="text-slate-500">公司：</span>{companies.find((company) => company.id === detail.ticket.submitter.companyId)?.name ?? detail.ticket.submitter.companyId}</div>
                <div><span className="text-slate-500">部门：</span>{detail.ticket.submitter.department ?? '—'}</div>
              </div>
              <div className="mt-2">
                {history === null ? (
                  <button
                    type="button"
                    className="text-xs text-blue-700 hover:underline"
                    onClick={() => {
                      setHistoryError(null)
                      api.userTickets(detail.ticket.submitter.id)
                        .then((result) => setHistory(result.tickets))
                        .catch((cause: unknown) => setHistoryError(cause instanceof Error ? cause.message : '加载历史工单失败'))
                    }}
                  >
                    查看历史工单
                  </button>
                ) : (
                  <div>
                    <p className="text-xs font-medium text-slate-600">历史工单（共 {history.length} 张）</p>
                    {historyError && <p className="text-xs text-rose-600">{historyError}</p>}
                    {history.length === 0 && <p className="text-xs text-slate-400">暂无历史工单</p>}
                    <ul className="mt-1 flex flex-col gap-1">
                      {history.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-slate-50"
                            onClick={() => setSelectedId(item.id)}
                          >
                            <StatusBadge status={item.status} />
                            <PriorityBadge priority={item.priority} />
                            <span className="truncate" title={item.subject}>{item.subject}</span>
                            <span className="ml-auto shrink-0 text-slate-400">{formatTime(item.createdAt)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* 操作区 */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-700">操作</h3>
              {actionError && <p className="mt-2 text-xs text-rose-600">{actionError}</p>}
              {status === 'pending_assignment' && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-600">分配到业务组</span>
                  <select
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    value={assignGroupId}
                    onChange={(event) => setAssignGroupId(event.target.value)}
                  >
                    {companyGroups.map((group) => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    disabled={!operator || !assignGroupId}
                    onClick={() => runAction(() => api.assignTicket(detail.ticket.id, operator, assignGroupId))}
                  >
                    分配
                  </button>
                </div>
              )}
              {status === 'pending_handling' && (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-600">转派到</span>
                    <select
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      value={transferTarget}
                      onChange={(event) => setTransferTarget(event.target.value)}
                    >
                      <option value="">选择目标</option>
                      {transferOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input
                      className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs"
                      placeholder="转派说明（可选）"
                      value={transferNote}
                      onChange={(event) => setTransferNote(event.target.value)}
                    />
                    <button
                      type="button"
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                      disabled={!operator || !transferTarget}
                      onClick={() => {
                        const [kind, id] = transferTarget.split(':')
                        return runAction(() => api.transferTicket(detail.ticket.id, {
                          operatorId: operator,
                          ...(kind === 'group' ? { toGroupId: id } : { toUserId: id }),
                          note: transferNote.trim() || null,
                        }))
                      }}
                    >
                      转派
                    </button>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                      disabled={!operator}
                      onClick={() => runAction(() => api.completeTicket(detail.ticket.id, operator))}
                    >
                      完成处理
                    </button>
                  </div>
                </div>
              )}
              {(status === 'created' || status === 'pending_assignment' || status === 'pending_handling') && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs"
                    placeholder="取消原因（可选）"
                    value={cancelNote}
                    onChange={(event) => setCancelNote(event.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded-md border border-rose-300 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    disabled={!operator}
                    onClick={() => runAction(() => api.cancelTicket(detail.ticket.id, operator, cancelNote.trim() || null))}
                  >
                    取消工单
                  </button>
                </div>
              )}
              {(status === 'completed' || status === 'cancelled') && (
                <p className="mt-2 text-xs text-slate-400">当前状态无可执行操作</p>
              )}
            </div>

            {/* 回复线程 */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-700">回复线程</h3>
              {detail.replies.length === 0 && <p className="mt-2 text-xs text-slate-400">暂无回复</p>}
              <ul className="mt-2 flex flex-col gap-2">
                {detail.replies.map((reply) => (
                  <li key={reply.id} className="rounded-md bg-slate-50 px-3 py-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{reply.authorName}</span>
                      <span>{formatTime(reply.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{reply.content}</p>
                  </li>
                ))}
              </ul>
              {detail.ticket.status !== 'cancelled' && (
                <div className="mt-3 flex gap-2">
                  <input
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    placeholder={`以 ${userName.get(operator) ?? '当前身份'} 回复…`}
                    value={replyContent}
                    onChange={(event) => setReplyContent(event.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    disabled={!operator || !replyContent.trim()}
                    onClick={() => runAction(async () => {
                      await api.createReply(detail.ticket.id, operator, replyContent.trim())
                      setReplyContent('')
                    })}
                  >
                    回复
                  </button>
                </div>
              )}
            </div>

            {/* 处理记录 */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-700">处理记录</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-slate-500">处理人：</span>
                  {detail.ticket.handlerId ? (userName.get(detail.ticket.handlerId) ?? detail.ticket.handlerId) : '—'}
                </div>
                <div>
                  <span className="text-slate-500">处理时间：</span>
                  {detail.ticket.handledAt ? formatTime(detail.ticket.handledAt) : '—'}
                </div>
                <div>
                  <span className="text-slate-500">当前归属：</span>
                  {detail.ticket.assignedGroupId ? (groupName.get(detail.ticket.assignedGroupId) ?? detail.ticket.assignedGroupId) : '未分配'}
                </div>
                <div>
                  <span className="text-slate-500">取消时间：</span>
                  {detail.ticket.cancelledAt ? formatTime(detail.ticket.cancelledAt) : '—'}
                </div>
              </div>
            </div>

            {/* 转派记录 */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-700">转派记录</h3>
              {detail.transfers.length === 0 && <p className="mt-2 text-xs text-slate-400">暂无转派</p>}
              <ul className="mt-2 flex flex-col gap-2">
                {detail.transfers.map((transfer) => (
                  <li key={transfer.id} className="text-xs text-slate-600">
                    <span className="font-medium text-slate-700">{formatTime(transfer.createdAt)}</span>
                    {' '}由 {userName.get(transfer.operatorId) ?? transfer.operatorId} 转派：
                    {transfer.fromGroupId ? (groupName.get(transfer.fromGroupId) ?? transfer.fromGroupId) : '未分配'}
                    {' → '}
                    {transfer.toGroupId ? (groupName.get(transfer.toGroupId) ?? transfer.toGroupId) : ''}
                    {transfer.toUserId ? `成员 ${userName.get(transfer.toUserId) ?? transfer.toUserId}` : ''}
                    {transfer.note ? `（${transfer.note}）` : ''}
                  </li>
                ))}
              </ul>
            </div>

            {/* 满意度评价区 */}
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-700">满意度评价</h3>
              {detail.evaluation ? (
                <div className="mt-2 text-sm">
                  <p>
                    <span className="text-slate-500">评分：</span>
                    <span className="font-medium">{detail.evaluation.rating} / 5</span>
                    <span className="ml-3 text-slate-500">评价时间：{formatTime(detail.evaluation.updatedAt)}</span>
                  </p>
                  {detail.evaluation.comment && <p className="mt-1 text-slate-700">{detail.evaluation.comment}</p>}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-400">暂无评价</p>
              )}
              {status === 'completed' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    value={rating}
                    onChange={(event) => setRating(Number(event.target.value))}
                  >
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>{value} 分</option>
                    ))}
                  </select>
                  <input
                    className="w-56 rounded-md border border-slate-300 px-2 py-1 text-xs"
                    placeholder="评价内容（可选）"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    disabled={!operator}
                    onClick={() => runAction(() => api.submitEvaluation(
                      detail.ticket.id,
                      operator,
                      rating,
                      comment.trim() || null,
                    ))}
                  >
                    {detail.evaluation ? '更新评价' : '提交评价'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
