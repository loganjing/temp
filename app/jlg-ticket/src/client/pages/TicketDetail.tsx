import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiGet, apiPost, apiPatch } from '../platform/api-client'
import {
  type TicketResponse,
  type UserResponse,
  type CategoriesResponse,
  type GroupsResponse,
  type ReplyResponse,
  type EvaluationResponse,
  type TicketDetail as TicketDetailType,
  type UserDetail,
  type BusinessGroup,
  type Category,
  type TicketStatus,
  RATING_LABELS,
} from '../platform/types'
import {
  StatusBadge,
  PriorityBadge,
  ExpandableText,
  ErrorBanner,
  Spinner,
  SectionTitle,
  Collapsible,
  formatDate,
  useToast,
} from '../components/ui'
import { SendIcon, ArrowRightIcon, CheckIcon, XIcon, StarIcon, ClockIcon } from '../components/icons'

const STATUS_TRANSITIONS: { status: TicketStatus; label: string }[] = [
  { status: 'pending_processing', label: '分配并处理' },
  { status: 'completed', label: '完成' },
  { status: 'cancelled', label: '取消' },
]

export default function TicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const { showToast } = useToast()

  const [ticket, setTicket] = useState<TicketDetailType | null>(null)
  const [user, setUser] = useState<UserDetail | null>(null)
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // action forms
  const [replyContent, setReplyContent] = useState('')
  const [replyReplierId, setReplyReplierId] = useState('')
  const [replyError, setReplyError] = useState<string | null>(null)
  const [replySubmitting, setReplySubmitting] = useState(false)

  const [assignGroupId, setAssignGroupId] = useState('')
  const [assignAssigneeId, setAssignAssigneeId] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSubmitting, setActionSubmitting] = useState(false)

  const [transferFromUserId, setTransferFromUserId] = useState('')
  const [transferTargetType, setTransferTargetType] = useState<'user' | 'group'>('user')
  const [transferToUserId, setTransferToUserId] = useState('')
  const [transferToGroupId, setTransferToGroupId] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [transferError, setTransferError] = useState<string | null>(null)
  const [transferSubmitting, setTransferSubmitting] = useState(false)

  const [evalRating, setEvalRating] = useState(5)
  const [evalComment, setEvalComment] = useState('')
  const [evalError, setEvalError] = useState<string | null>(null)
  const [evalSubmitting, setEvalSubmitting] = useState(false)

  const fetchTicket = useCallback(async () => {
    if (!ticketId) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<TicketResponse>(`/api/tickets/${ticketId}`)
      setTicket(data.ticket)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载工单详情失败')
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  const fetchUser = useCallback(async (submitterId: number) => {
    try {
      const data = await apiGet<UserResponse>(`/api/users/${submitterId}`)
      setUser(data.user)
    } catch {
      setUser(null)
    }
  }, [])

  const fetchGroups = useCallback(async (companyId: number) => {
    try {
      const data = await apiGet<GroupsResponse>(`/api/companies/${companyId}/business-groups`)
      setGroups(data.groups ?? [])
    } catch {
      setGroups([])
    }
  }, [])

  useEffect(() => {
    fetchTicket()
  }, [fetchTicket])

  useEffect(() => {
    if (ticket?.submitterId) {
      fetchUser(ticket.submitterId)
    }
  }, [ticket?.submitterId, fetchUser])

  useEffect(() => {
    if (ticket?.submitter?.companyId) {
      fetchGroups(ticket.submitter.companyId)
    }
  }, [ticket?.submitter?.companyId, fetchGroups])

  const handleReply = async () => {
    if (!ticketId) return
    const replierId = Number(replyReplierId)
    if (!replierId || !replyContent.trim()) {
      setReplyError('请填写回复人 ID 和回复内容')
      return
    }
    setReplySubmitting(true)
    setReplyError(null)
    try {
      await apiPost<ReplyResponse>(`/api/tickets/${ticketId}/replies`, {
        replierId,
        content: replyContent.trim(),
      })
      setReplyContent('')
      setReplyReplierId('')
      showToast('回复已添加')
      fetchTicket()
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : '添加回复失败')
    } finally {
      setReplySubmitting(false)
    }
  }

  const handleStatusChange = async (status: TicketStatus) => {
    if (!ticketId || !ticket) return
    setActionSubmitting(true)
    setActionError(null)
    try {
      const body: Record<string, unknown> = { status }
      if (status === 'pending_processing') {
        if (assignGroupId) body.groupId = Number(assignGroupId)
        if (assignAssigneeId) body.assigneeId = Number(assignAssigneeId)
      }
      await apiPatch<{ ticket: TicketDetailType }>(`/api/tickets/${ticketId}/status`, body)
      showToast('状态已更新')
      setAssignGroupId('')
      setAssignAssigneeId('')
      fetchTicket()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '状态更新失败')
    } finally {
      setActionSubmitting(false)
    }
  }

  const handleTransfer = async () => {
    if (!ticketId) return
    const fromUserId = Number(transferFromUserId)
    if (!fromUserId) {
      setTransferError('请填写当前处理人 ID')
      return
    }
    if (transferTargetType === 'user' && !transferToUserId) {
      setTransferError('请填写转派目标处理人 ID')
      return
    }
    if (transferTargetType === 'group' && !transferToGroupId) {
      setTransferError('请选择转派目标业务组')
      return
    }
    setTransferSubmitting(true)
    setTransferError(null)
    try {
      const body: Record<string, unknown> = {
        fromUserId,
        reason: transferReason.trim() || undefined,
      }
      if (transferTargetType === 'user') {
        body.toUserId = Number(transferToUserId)
      } else {
        body.toGroupId = Number(transferToGroupId)
      }
      await apiPost<{ ticket: TicketDetailType }>(`/api/tickets/${ticketId}/transfer`, body)
      showToast('工单已转派')
      setTransferFromUserId('')
      setTransferToUserId('')
      setTransferToGroupId('')
      setTransferReason('')
      fetchTicket()
    } catch (e) {
      setTransferError(e instanceof Error ? e.message : '转派失败')
    } finally {
      setTransferSubmitting(false)
    }
  }

  const handleEvaluation = async () => {
    if (!ticketId) return
    setEvalSubmitting(true)
    setEvalError(null)
    try {
      await apiPost<EvaluationResponse>(`/api/tickets/${ticketId}/evaluation`, {
        rating: evalRating,
        comment: evalComment.trim() || undefined,
      })
      showToast('评价已提交')
      setEvalComment('')
      fetchTicket()
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : '评价提交失败')
    } finally {
      setEvalSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorBanner message={error} onRetry={fetchTicket} />
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        未选中工单
      </div>
    )
  }

  const canAssign = ticket.status === 'pending_assignment'
  const canComplete = ticket.status === 'pending_processing'
  const canCancel = ticket.status === 'pending_assignment' || ticket.status === 'pending_processing'
  const canTransfer = ticket.status === 'pending_processing'
  const canEvaluate = ticket.status === 'completed' && !ticket.evaluation
  const evaluation = ticket.evaluation

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-gray-400 font-mono">{ticket.ticketNo}</span>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
        <h2 className="text-xl font-semibold text-gray-800" title={ticket.subject}>
          {ticket.subject}
        </h2>
      </div>

      {/* Basic info */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <SectionTitle>基本信息</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-gray-400 text-xs">分类</dt>
            <dd className="text-gray-700">{ticket.categoryName}</dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs">创建时间</dt>
            <dd className="text-gray-700">{formatDate(ticket.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs">分配业务组</dt>
            <dd className="text-gray-700">{ticket.assignedGroup?.name ?? '未分配'}</dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs">处理人</dt>
            <dd className="text-gray-700">{ticket.assignee?.name ?? '未指派'}</dd>
          </div>
          {ticket.completedAt && (
            <div>
              <dt className="text-gray-400 text-xs">完成时间</dt>
              <dd className="text-gray-700">{formatDate(ticket.completedAt)}</dd>
            </div>
          )}
          {ticket.handledAt && (
            <div>
              <dt className="text-gray-400 text-xs">处理时间</dt>
              <dd className="text-gray-700">{formatDate(ticket.handledAt)}</dd>
            </div>
          )}
        </dl>
        {ticket.description && (
          <div className="mt-3">
            <dt className="text-gray-400 text-xs mb-1">描述</dt>
            <ExpandableText text={ticket.description} />
          </div>
        )}
      </div>

      {/* Submitter info */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <SectionTitle>提交人信息</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-gray-400 text-xs">姓名</dt>
            <dd className="text-gray-700">{ticket.submitter.name}</dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs">邮箱</dt>
            <dd className="text-gray-700">{ticket.submitter.email}</dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs">公司</dt>
            <dd className="text-gray-700">{ticket.submitter.companyName}</dd>
          </div>
          <div>
            <dt className="text-gray-400 text-xs">部门</dt>
            <dd className="text-gray-700">{ticket.submitter.department ?? '—'}</dd>
          </div>
        </dl>
        {user && user.historicalTickets && user.historicalTickets.length > 0 && (
          <div className="mt-3">
            <Collapsible title={`历史工单 (${user.historicalTickets.length})`}>
              <ul className="space-y-2">
                {user.historicalTickets.map((ht) => (
                  <li key={ht.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 font-mono">{ht.ticketNo}</span>
                    <span className="text-gray-500 truncate mx-2">{ht.subject}</span>
                    <StatusBadge status={ht.status} />
                  </li>
                ))}
              </ul>
            </Collapsible>
          </div>
        )}
      </div>

      {/* Reply timeline */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <SectionTitle>回复时间线</SectionTitle>
        {ticket.replies && ticket.replies.length > 0 ? (
          <div className="space-y-3">
            {ticket.replies.map((r) => (
              <div key={r.id} className="flex gap-3">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
                    {r.replierName.charAt(0)}
                  </div>
                  <div className="w-px flex-1 bg-gray-200 mt-1" />
                </div>
                <div className="flex-1 pb-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-700">{r.replierName}</span>
                    <span className="text-xs text-gray-400 flex items-center gap-0.5">
                      <ClockIcon className="w-3 h-3" />
                      {formatDate(r.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{r.content}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">暂无回复</p>
        )}

        {/* Reply form */}
        <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
          <div className="flex gap-2">
            <input
              type="number"
              value={replyReplierId}
              onChange={(e) => setReplyReplierId(e.target.value)}
              placeholder="回复人 ID"
              className="w-32 text-sm border border-gray-300 rounded px-2 py-1.5 flex-shrink-0"
            />
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="输入回复内容..."
              rows={2}
              className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5 resize-none"
            />
          </div>
          {replyError && <p className="text-xs text-red-600">{replyError}</p>}
          <div className="flex justify-end">
            <button
              onClick={handleReply}
              disabled={replySubmitting}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <SendIcon className="w-4 h-4" />
              {replySubmitting ? '提交中...' : '回复'}
            </button>
          </div>
        </div>
      </div>

      {/* Transfer history */}
      {ticket.transfers && ticket.transfers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <SectionTitle>转派历史</SectionTitle>
          <div className="space-y-2">
            {ticket.transfers.map((tr) => (
              <div key={tr.id} className="flex items-center gap-2 text-sm">
                <span className="text-gray-700">{tr.fromUserName ?? '—'}</span>
                <ArrowRightIcon className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700">
                  {tr.toUserName ?? tr.toGroupName ?? '—'}
                </span>
                {tr.reason && <span className="text-xs text-gray-400">({tr.reason})</span>}
                <span className="text-xs text-gray-400 ml-auto">{formatDate(tr.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transfer form */}
      {canTransfer && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <SectionTitle>转派工单</SectionTitle>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="number"
                value={transferFromUserId}
                onChange={(e) => setTransferFromUserId(e.target.value)}
                placeholder="当前处理人 ID"
                className="w-40 text-sm border border-gray-300 rounded px-2 py-1.5"
              />
              <select
                value={transferTargetType}
                onChange={(e) => setTransferTargetType(e.target.value as 'user' | 'group')}
                className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
              >
                <option value="user">转派给处理人</option>
                <option value="group">转派给业务组</option>
              </select>
              {transferTargetType === 'user' ? (
                <input
                  type="number"
                  value={transferToUserId}
                  onChange={(e) => setTransferToUserId(e.target.value)}
                  placeholder="目标处理人 ID"
                  className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5"
                />
              ) : (
                <select
                  value={transferToGroupId}
                  onChange={(e) => setTransferToGroupId(e.target.value)}
                  className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
                >
                  <option value="">选择业务组</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <input
              type="text"
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder="转派原因（可选）"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
            {transferError && <p className="text-xs text-red-600">{transferError}</p>}
            <div className="flex justify-end">
              <button
                onClick={handleTransfer}
                disabled={transferSubmitting}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                <ArrowRightIcon className="w-4 h-4" />
                {transferSubmitting ? '转派中...' : '转派'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evaluation */}
      {evaluation && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <SectionTitle>满意度评价</SectionTitle>
          <div className="flex items-center gap-2 mb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <StarIcon
                key={i}
                className={`w-5 h-5 ${i < evaluation.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
              />
            ))}
            <span className="text-sm text-gray-600 ml-2">
              {RATING_LABELS[evaluation.rating] ?? evaluation.rating}
            </span>
          </div>
          {evaluation.comment && (
            <p className="text-sm text-gray-600 mt-1">{evaluation.comment}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{formatDate(evaluation.createdAt)}</p>
        </div>
      )}

      {/* Evaluation form */}
      {canEvaluate && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <SectionTitle>提交评价</SectionTitle>
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => {
                const rating = i + 1
                return (
                  <button
                    key={rating}
                    onClick={() => setEvalRating(rating)}
                    className="p-0.5"
                  >
                    <StarIcon
                      className={`w-7 h-7 ${rating <= evalRating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`}
                    />
                  </button>
                )
              })}
              <span className="text-sm text-gray-600 ml-2">{RATING_LABELS[evalRating]}</span>
            </div>
            <textarea
              value={evalComment}
              onChange={(e) => setEvalComment(e.target.value)}
              placeholder="评价备注（可选）"
              rows={2}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 resize-none"
            />
            {evalError && <p className="text-xs text-red-600">{evalError}</p>}
            <div className="flex justify-end">
              <button
                onClick={handleEvaluation}
                disabled={evalSubmitting}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                <StarIcon className="w-4 h-4" />
                {evalSubmitting ? '提交中...' : '提交评价'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <SectionTitle>操作</SectionTitle>
        {actionError && (
          <div className="mb-3">
            <ErrorBanner message={actionError} />
          </div>
        )}
        <div className="space-y-3">
          {canAssign && (
            <div className="flex items-end gap-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">分配到业务组</label>
                <select
                  value={assignGroupId}
                  onChange={(e) => setAssignGroupId(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
                >
                  <option value="">选择业务组</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">处理人 ID（可选）</label>
                <input
                  type="number"
                  value={assignAssigneeId}
                  onChange={(e) => setAssignAssigneeId(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1.5 w-40"
                />
              </div>
              <button
                onClick={() => handleStatusChange('pending_processing')}
                disabled={actionSubmitting || !assignGroupId}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                分配
              </button>
            </div>
          )}
          <div className="flex gap-2">
            {canComplete && (
              <button
                onClick={() => handleStatusChange('completed')}
                disabled={actionSubmitting}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <CheckIcon className="w-4 h-4" />
                完成处理
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => handleStatusChange('cancelled')}
                disabled={actionSubmitting}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                <XIcon className="w-4 h-4" />
                取消工单
              </button>
            )}
            {!canAssign && !canComplete && !canCancel && (
              <p className="text-sm text-gray-400">当前状态无可执行操作</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
