import { useState, useEffect, useCallback } from 'react'
import { ticketApi, companyApi, groupApi } from '../platform/api-client'
import type { BusinessGroup, Evaluation, GroupMember, Reply, SubmitterInfo, TicketDetail, TransferRecord } from '../types'
import {
  Skeleton, ErrorBanner, EmptyState, StatusBadge, PriorityBadge,
  Modal, FormField, TextInput, SelectInput, TextArea, PrimaryButton, SecondaryButton,
  formatTime, STATUS_LABELS, PRIORITY_LABELS,
} from '../components/ui'

export default function TicketDetailPanel({
  ticketId,
  onUpdated,
}: {
  ticketId: string
  onUpdated: () => void
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [submitterInfo, setSubmitterInfo] = useState<SubmitterInfo | null>(null)
  const [replies, setReplies] = useState<Reply[]>([])
  const [transfers, setTransfers] = useState<TransferRecord[]>([])
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<null | 'assign' | 'transfer' | 'complete' | 'evaluate'>(null)
  const [replyName, setReplyName] = useState('')
  const [replyContent, setReplyContent] = useState('')
  const [replyError, setReplyError] = useState<string | null>(null)
  const [submittingReply, setSubmittingReply] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const t = await ticketApi.get(ticketId)
      setTicket(t)
      // Load dependent data in parallel
      const [info, reps, xfers] = await Promise.all([
        ticketApi.getSubmitterInfo(ticketId).catch(() => null),
        ticketApi.getReplies(ticketId).then((r) => r.items).catch(() => []),
        ticketApi.getTransfers(ticketId).then((r) => r.items).catch(() => []),
      ])
      setSubmitterInfo(info)
      setReplies(reps)
      setTransfers(xfers)
      // Evaluation is optional — 404 means no evaluation yet
      const evalResult = await ticketApi.getEvaluation(ticketId).catch(() => null)
      setEvaluation(evalResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载工单详情失败')
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => { loadAll() }, [loadAll])

  function refreshTicket(t: TicketDetail) {
    setTicket(t)
    onUpdated()
    loadAll()
  }

  async function handleCancel() {
    if (!ticket || ticket.status === 'cancelled') return
    if (!confirm('确认取消此工单？')) return
    try {
      const updated = await ticketApi.updateStatus(ticket.id, 'cancelled')
      refreshTicket(updated)
    } catch (e) {
      alert(e instanceof Error ? e.message : '取消失败')
    }
  }

  async function handleAddReply(e: React.FormEvent) {
    e.preventDefault()
    if (!ticket) return
    setSubmittingReply(true)
    setReplyError(null)
    try {
      await ticketApi.addReply(ticket.id, replyName, replyContent)
      setReplyName('')
      setReplyContent('')
      const res = await ticketApi.getReplies(ticket.id)
      setReplies(res.items)
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : '回复失败')
    } finally {
      setSubmittingReply(false)
    }
  }

  if (loading) return <Skeleton lines={6} />
  if (error) return <ErrorBanner message={error} onRetry={loadAll} />
  if (!ticket) return <EmptyState message="未找到工单" />

  const canAssign = ticket.status === 'pending_assign'
  const canTransfer = ticket.status === 'pending_process'
  const canComplete = ticket.status === 'pending_process'
  const canCancel = ticket.status === 'pending_assign' || ticket.status === 'pending_process'
  const canEvaluate = ticket.status === 'completed' && !evaluation

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      {/* Header */}
      <div className="bg-white rounded-md border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-xl font-semibold text-gray-900">{ticket.subject}</h1>
          <div className="flex gap-2 shrink-0">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.slaPriority} />
          </div>
        </div>
        <div className="text-sm text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
          <span>分类：{ticket.category}</span>
          <span>创建时间：{formatTime(ticket.createdAt)}</span>
          {ticket.currentGroupName && <span>当前业务组：{ticket.currentGroupName}</span>}
        </div>
        <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap">{ticket.description}</p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {canAssign && <PrimaryButton onClick={() => setAction('assign')}>分配</PrimaryButton>}
        {canTransfer && <PrimaryButton onClick={() => setAction('transfer')}>转派</PrimaryButton>}
        {canComplete && <PrimaryButton onClick={() => setAction('complete')}>完成处理</PrimaryButton>}
        {canEvaluate && <PrimaryButton onClick={() => setAction('evaluate')}>评价</PrimaryButton>}
        {canCancel && <SecondaryButton onClick={handleCancel}>取消工单</SecondaryButton>}
      </div>

      {/* Processing info */}
      {ticket.status === 'completed' && (
        <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm">
          <p className="text-green-800">
            处理人：{ticket.handlerName ?? '—'} · 处理时间：{formatTime(ticket.processedAt)}
          </p>
        </div>
      )}

      {/* Submitter info */}
      {submitterInfo && (
        <div className="bg-white rounded-md border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">提交人信息</h2>
          <div className="grid grid-cols-2 gap-y-2 text-sm text-gray-600">
            <div>姓名：{submitterInfo.name}</div>
            <div>公司：{submitterInfo.company}</div>
            <div>部门：{submitterInfo.department}</div>
            <div>邮箱：{submitterInfo.email}</div>
          </div>
          {submitterInfo.historyTickets.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500 mb-2">历史工单（{submitterInfo.historyTickets.length}）</p>
              <div className="space-y-1">
                {submitterInfo.historyTickets.map((ht) => (
                  <div key={ht.id} className="flex items-center gap-2 text-xs text-gray-600">
                    <StatusBadge status={ht.status} />
                    <span className="line-clamp-1">{ht.subject}</span>
                    <span className="text-gray-400">{formatTime(ht.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evaluation */}
      {evaluation && (
        <div className="bg-white rounded-md border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">满意度评价</h2>
          <div className="flex items-center gap-1 mb-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={n <= evaluation.rating ? 'text-yellow-400' : 'text-gray-300'}>&#9733;</span>
            ))}
            <span className="text-sm text-gray-600 ml-2">{evaluation.rating}/5</span>
          </div>
          {evaluation.comment && <p className="text-sm text-gray-600">{evaluation.comment}</p>}
          <p className="text-xs text-gray-400 mt-1">{formatTime(evaluation.createdAt)}</p>
        </div>
      )}

      {/* Replies */}
      <div className="bg-white rounded-md border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">回复（{replies.length}）</h2>
        {replies.length === 0 ? (
          <p className="text-sm text-gray-400">暂无回复</p>
        ) : (
          <div className="space-y-3 mb-4">
            {replies.map((r) => (
              <div key={r.id} className="border-l-2 border-indigo-200 pl-3">
                <div className="text-sm font-medium text-gray-700">{r.replierName}</div>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{r.content}</p>
                <p className="text-xs text-gray-400 mt-1">{formatTime(r.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleAddReply} className="border-t border-gray-100 pt-3 space-y-2">
          <div className="flex gap-2">
            <TextInput
              placeholder="回复人姓名"
              value={replyName}
              onChange={(e) => setReplyName(e.target.value)}
              required
              className="w-32"
            />
            <TextInput
              placeholder="回复内容..."
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              required
            />
          </div>
          {replyError && <p className="text-sm text-red-600">{replyError}</p>}
          <div className="flex justify-end">
            <PrimaryButton type="submit" disabled={submittingReply}>{submittingReply ? '提交中...' : '添加回复'}</PrimaryButton>
          </div>
        </form>
      </div>

      {/* Transfer history */}
      {transfers.length > 0 && (
        <div className="bg-white rounded-md border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">转派记录（{transfers.length}）</h2>
          <div className="space-y-2">
            {transfers.map((tr) => (
              <div key={tr.id} className="text-sm text-gray-600 flex items-center gap-2">
                <span className="font-medium">{tr.fromGroupName}</span>
                <span className="text-gray-400">&rarr;</span>
                <span className="font-medium">{tr.toGroupName}</span>
                <span className="text-gray-400">· {tr.transferredBy}</span>
                <span className="text-xs text-gray-400">{formatTime(tr.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action modals */}
      {action === 'assign' && ticket && (
        <AssignModal ticket={ticket} onClose={() => setAction(null)} onDone={refreshTicket} />
      )}
      {action === 'transfer' && ticket && (
        <TransferModal ticket={ticket} onClose={() => setAction(null)} onDone={refreshTicket} />
      )}
      {action === 'complete' && ticket && (
        <CompleteModal ticket={ticket} onClose={() => setAction(null)} onDone={refreshTicket} />
      )}
      {action === 'evaluate' && ticket && (
        <EvaluateModal ticket={ticket} onClose={() => setAction(null)} onDone={refreshTicket} />
      )}
    </div>
  )
}

// === Assign Modal ===

function AssignModal({ ticket, onClose, onDone }: { ticket: TicketDetail; onClose: () => void; onDone: (t: TicketDetail) => void }) {
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [groupId, setGroupId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    companyApi.getGroups(ticket.submitterCompanyId)
      .then((res) => setGroups(res.items))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ticket.submitterCompanyId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const updated = await ticketApi.assign(ticket.id, groupId)
      onDone(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : '分配失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="分配工单到业务组" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="目标业务组">
          {loading ? (
            <p className="text-sm text-gray-400">加载中...</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400">该公司下暂无业务组</p>
          ) : (
            <SelectInput required value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">请选择业务组</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </SelectInput>
          )}
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">取消</button>
          <PrimaryButton type="submit" disabled={submitting || !groupId}>{submitting ? '提交中...' : '确认分配'}</PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}

// === Transfer Modal ===

function TransferModal({ ticket, onClose, onDone }: { ticket: TicketDetail; onClose: () => void; onDone: (t: TicketDetail) => void }) {
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [toGroupId, setToGroupId] = useState('')
  const [transferredBy, setTransferredBy] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    companyApi.getGroups(ticket.submitterCompanyId)
      .then((res) => setGroups(res.items.filter((g) => g.id !== ticket.currentGroupId)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ticket.submitterCompanyId, ticket.currentGroupId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const updated = await ticketApi.transfer(ticket.id, toGroupId, transferredBy)
      onDone(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : '转派失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="转派工单" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-gray-500">当前业务组：{ticket.currentGroupName ?? '—'}</p>
        <FormField label="目标业务组">
          {loading ? (
            <p className="text-sm text-gray-400">加载中...</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400">没有可转派的目标业务组</p>
          ) : (
            <SelectInput required value={toGroupId} onChange={(e) => setToGroupId(e.target.value)}>
              <option value="">请选择业务组</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </SelectInput>
          )}
        </FormField>
        <FormField label="操作人姓名">
          <TextInput required value={transferredBy} onChange={(e) => setTransferredBy(e.target.value)} placeholder="操作人姓名" />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">取消</button>
          <PrimaryButton type="submit" disabled={submitting || !toGroupId}>{submitting ? '提交中...' : '确认转派'}</PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}

// === Complete Modal ===

function CompleteModal({ ticket, onClose, onDone }: { ticket: TicketDetail; onClose: () => void; onDone: (t: TicketDetail) => void }) {
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [memberId, setMemberId] = useState('')
  const [handlerName, setHandlerName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ticket.currentGroupId) { setLoading(false); return }
    groupApi.getMembers(ticket.currentGroupId)
      .then((res) => setMembers(res.items))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ticket.currentGroupId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const updated = await ticketApi.complete(ticket.id, memberId, handlerName)
      onDone(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : '完成失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="完成处理" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="处理人">
          {loading ? (
            <p className="text-sm text-gray-400">加载中...</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-400">当前业务组暂无成员</p>
          ) : (
            <SelectInput
              required
              value={memberId}
              onChange={(e) => {
                setMemberId(e.target.value)
                const m = members.find((m) => m.id === e.target.value)
                if (m) setHandlerName(m.name)
              }}
            >
              <option value="">请选择处理人</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </SelectInput>
          )}
        </FormField>
        <FormField label="处理人姓名">
          <TextInput required value={handlerName} onChange={(e) => setHandlerName(e.target.value)} placeholder="处理人姓名" />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">取消</button>
          <PrimaryButton type="submit" disabled={submitting || !memberId}>{submitting ? '提交中...' : '确认完成'}</PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}

// === Evaluate Modal ===

function EvaluateModal({ ticket, onClose, onDone }: { ticket: TicketDetail; onClose: () => void; onDone: (t: TicketDetail) => void }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await ticketApi.addEvaluation(ticket.id, rating, comment || undefined)
      const updated = await ticketApi.get(ticket.id)
      onDone(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : '评价失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="满意度评价" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <FormField label="满意度评分">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={`text-2xl ${n <= rating ? 'text-yellow-400' : 'text-gray-300'} hover:text-yellow-500`}
              >
                &#9733;
              </button>
            ))}
            <span className="text-sm text-gray-600 ml-2">{rating}/5</span>
          </div>
        </FormField>
        <FormField label="评价备注（可选）">
          <TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="评价备注..." />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">取消</button>
          <PrimaryButton type="submit" disabled={submitting}>{submitting ? '提交中...' : '提交评价'}</PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
