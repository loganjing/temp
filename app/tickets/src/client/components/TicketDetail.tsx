import { useEffect, useState, useCallback } from 'react'
import { apiRequest, apiPost, apiPatch } from '../platform/api-client'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { StatusBadge, PriorityBadge, formatDate, Spinner, EmptyState } from './common'
import type {
  TicketDetail as TicketDetailType,
  SubmitterInfo,
  BusinessGroup,
  Evaluation,
  TicketStatus,
} from '../hooks/types'

interface Props {
  ticket: TicketDetailType
  onTicketUpdated: () => void
}

export function TicketDetail({ ticket, onTicketUpdated }: Props) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  const [submitterInfo, setSubmitterInfo] = useState<SubmitterInfo | null>(null)
  const [loadingSubmitterInfo, setLoadingSubmitterInfo] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [loadingEval, setLoadingEval] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const isHandlerOrAdmin = user?.role === 'handler' || user?.role === 'admin'
  const isSubmitter = user?.role === 'submitter'
  const isOwnTicket = user?.id === ticket.submitterId

  // Load submitter info for handler/admin
  const loadSubmitterInfo = useCallback(async () => {
    if (!isHandlerOrAdmin) return
    setLoadingSubmitterInfo(true)
    try {
      const info = await apiRequest<SubmitterInfo>(`/api/tickets/${ticket.id}/submitter-info`)
      setSubmitterInfo(info)
    } catch {
      // Non-critical; panel shows a fallback
    } finally {
      setLoadingSubmitterInfo(false)
    }
  }, [ticket.id, isHandlerOrAdmin])

  useEffect(() => {
    setSubmitterInfo(null)
    setEvaluation(null)
    loadSubmitterInfo()
    if (ticket.status === 'completed') {
      setLoadingEval(true)
      apiRequest<Evaluation>(`/api/tickets/${ticket.id}/evaluation`)
        .then(setEvaluation)
        .catch(() => setEvaluation(null))
        .finally(() => setLoadingEval(false))
    }
  }, [ticket.id, ticket.status, loadSubmitterInfo])

  const handleReply = async () => {
    if (!replyText.trim()) return
    setSubmittingReply(true)
    try {
      await apiPost(`/api/tickets/${ticket.id}/replies`, { content: replyText.trim() })
      setReplyText('')
      showToast('回复成功')
      onTicketUpdated()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '回复失败', 'error')
    } finally {
      setSubmittingReply(false)
    }
  }

  const handleStatusChange = async (status: TicketStatus) => {
    setActionLoading(true)
    try {
      await apiPatch(`/api/tickets/${ticket.id}/status`, { status })
      showToast('状态更新成功')
      onTicketUpdated()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '操作失败', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleComplete = async () => {
    setActionLoading(true)
    try {
      await apiPost(`/api/tickets/${ticket.id}/complete`)
      showToast('工单已完成')
      onTicketUpdated()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '完成操作失败', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Ticket attributes */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-400">#{ticket.id}</span>
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.slaPriority} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{ticket.title}</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <InfoRow label="分类" value={ticket.category} />
          <InfoRow label="提交人" value={ticket.submitterName} />
          <InfoRow label="提交人邮箱" value={ticket.submitterEmail} />
          <InfoRow label="提交人部门" value={ticket.submitterDepartment || '—'} />
          <InfoRow label="处理人" value={ticket.handlerName ?? '未分配'} />
          <InfoRow label="业务组" value={ticket.assignedGroupName ?? '—'} />
          <InfoRow label="创建时间" value={formatDate(ticket.createdAt)} />
          <InfoRow label="处理时间" value={formatDate(ticket.handledAt)} />
        </div>
        <div className="mt-3 text-sm text-gray-600">
          <div className="font-medium text-gray-700 mb-1">描述</div>
          <p className="whitespace-pre-wrap">{ticket.description}</p>
        </div>

        {/* Action buttons */}
        {isHandlerOrAdmin && actionLoading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <Spinner className="w-4 h-4" /> 处理中...
          </div>
        )}
        {isHandlerOrAdmin && !actionLoading && (
          <div className="mt-4 flex flex-wrap gap-2">
            {ticket.status === 'pending_assignment' && (
              <button
                onClick={() => handleStatusChange('pending_processing')}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                分配处理
              </button>
            )}
            {ticket.status === 'pending_processing' && (
              <>
                <button
                  onClick={() => setShowTransfer(true)}
                  className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  转派
                </button>
                <button
                  onClick={handleComplete}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  完成工单
                </button>
              </>
            )}
            {(ticket.status === 'pending_assignment' || ticket.status === 'pending_processing') && (
              <button
                onClick={() => handleStatusChange('cancelled')}
                className="px-3 py-1.5 text-sm bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300"
              >
                取消工单
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Reply section */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
            {ticket.replies.length === 0 ? (
              <EmptyState message="暂无回复" />
            ) : (
              ticket.replies.map((reply) => (
                <div key={reply.id} className="flex flex-col">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-700">{reply.replierName}</span>
                    <span className="text-xs text-gray-400">{formatDate(reply.createdAt)}</span>
                  </div>
                  <div className="ml-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                    {reply.content}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Reply input */}
          <div className="px-6 py-3 border-t border-gray-200 bg-white">
            <div className="flex gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="输入回复内容..."
                className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={2}
              />
              <button
                onClick={handleReply}
                disabled={!replyText.trim() || submittingReply}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 self-end"
              >
                {submittingReply ? <Spinner /> : '回复'}
              </button>
            </div>
          </div>
        </div>

        {/* Right sidebar: submitter info + evaluation */}
        <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-white overflow-auto">
          {/* Submitter info panel */}
          {isHandlerOrAdmin && (
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">提交人信息</h3>
              {loadingSubmitterInfo ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Spinner className="w-4 h-4" /> 加载中...
                </div>
              ) : submitterInfo ? (
                <div className="space-y-2 text-sm">
                  <InfoRow label="姓名" value={submitterInfo.name} />
                  <InfoRow label="公司" value={submitterInfo.companyName} />
                  <InfoRow label="部门" value={submitterInfo.department || '—'} />
                  <InfoRow label="邮箱" value={submitterInfo.email} />
                  <div>
                    <div className="text-gray-400 text-xs mb-1 mt-3">历史工单 ({submitterInfo.historyTickets.length})</div>
                    {submitterInfo.historyTickets.length === 0 ? (
                      <div className="text-xs text-gray-400">暂无历史工单</div>
                    ) : (
                      <div className="space-y-1">
                        {submitterInfo.historyTickets.map((ht) => (
                          <div key={ht.id} className="text-xs">
                            <span className="text-gray-400">#{ht.id}</span>{' '}
                            <span className="text-gray-600">{ht.title}</span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <StatusBadge status={ht.status} />
                              <span className="text-gray-400">{formatDate(ht.createdAt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-400">加载失败</div>
              )}
            </div>
          )}

          {/* Evaluation section */}
          {ticket.status === 'completed' && (
            <div className="p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">满意度评价</h3>
              {loadingEval ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Spinner className="w-4 h-4" /> 加载中...
                </div>
              ) : evaluation ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star} className={star <= evaluation.rating ? 'text-yellow-400' : 'text-gray-200'}>
                        ★
                      </span>
                    ))}
                    <span className="ml-2 text-gray-600">{evaluation.rating}/5</span>
                  </div>
                  {evaluation.comment && (
                    <p className="text-gray-600 text-sm">{evaluation.comment}</p>
                  )}
                  <div className="text-xs text-gray-400">{formatDate(evaluation.createdAt)}</div>
                </div>
              ) : isSubmitter && isOwnTicket ? (
                <EvaluationForm
                  ticketId={ticket.id}
                  onSubmitted={() => {
                    onTicketUpdated()
                  }}
                />
              ) : (
                <div className="text-xs text-gray-400">暂无评价</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Transfer dialog */}
      {showTransfer && (
        <TransferDialog
          ticketId={ticket.id}
          onClose={() => setShowTransfer(false)}
          onTransferred={() => {
            setShowTransfer(false)
            showToast('转派成功')
            onTicketUpdated()
          }}
        />
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-gray-400 text-xs flex-shrink-0">{label}</span>
      <span className="text-gray-700">{value}</span>
    </div>
  )
}

// --- Evaluation form ---
function EvaluationForm({
  ticketId,
  onSubmitted,
}: {
  ticketId: string
  onSubmitted: () => void
}) {
  const { showToast } = useToast()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hoverRating, setHoverRating] = useState(0)

  const handleSubmit = async () => {
    if (rating < 1 || rating > 5) {
      showToast('请选择评分', 'error')
      return
    }
    setSubmitting(true)
    try {
      await apiPost(`/api/tickets/${ticketId}/evaluation`, {
        rating,
        comment: comment.trim() || undefined,
      })
      showToast('评价提交成功')
      onSubmitted()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '评价提交失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            className={`text-2xl transition-colors ${
              star <= (hoverRating || rating) ? 'text-yellow-400' : 'text-gray-200'
            }`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="评价备注（可选）"
        className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
        rows={2}
      />
      <button
        onClick={handleSubmit}
        disabled={submitting || rating === 0}
        className="w-full px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700"
      >
        {submitting ? <Spinner /> : '提交评价'}
      </button>
    </div>
  )
}

// --- Transfer dialog ---
function TransferDialog({
  ticketId,
  onClose,
  onTransferred,
}: {
  ticketId: string
  onClose: () => void
  onTransferred: () => void
}) {
  const { showToast } = useToast()
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [targetType, setTargetType] = useState<'group' | 'user'>('group')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiRequest<{ items: BusinessGroup[] }>('/api/business-groups')
      .then((res) => {
        setGroups(res.items)
        if (res.items.length > 0) setSelectedGroupId(res.items[0].id)
      })
      .catch(() => showToast('加载业务组失败', 'error'))
      .finally(() => setLoading(false))
  }, [showToast])

  const handleSubmit = async () => {
    const body: Record<string, unknown> = { reason: reason.trim() }
    if (targetType === 'group') {
      body.toGroupId = selectedGroupId
    } else {
      body.toUserId = selectedUserId
    }
    if (!body.toGroupId && !body.toUserId) {
      showToast('请选择转派目标', 'error')
      return
    }
    setSubmitting(true)
    try {
      await apiPost(`/api/tickets/${ticketId}/transfer`, body)
      onTransferred()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '转派失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Collect all members from all groups
  const allMembers = groups.flatMap((g) => g.members)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-[420px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">转派工单 #{ticketId}</h3>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Spinner className="w-4 h-4" /> 加载中...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Target type selector */}
            <div className="flex gap-2">
              <button
                onClick={() => setTargetType('group')}
                className={`px-3 py-1.5 text-sm rounded-lg ${
                  targetType === 'group'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                转派到业务组
              </button>
              <button
                onClick={() => setTargetType('user')}
                className={`px-3 py-1.5 text-sm rounded-lg ${
                  targetType === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                转派到成员
              </button>
            </div>

            {targetType === 'group' ? (
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">选择成员...</option>
                {allMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.userName} ({m.email})
                  </option>
                ))}
              </select>
            )}

            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="转派原因"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              rows={2}
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700"
              >
                {submitting ? <Spinner /> : '确认转派'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
