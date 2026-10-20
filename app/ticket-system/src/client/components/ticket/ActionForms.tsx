import { useEffect, useState, type FormEvent } from 'react'
import { fetchGroups } from '../../api/config'
import { fetchUsers } from '../../api/auth'
import { apiErrorText } from '../../api/helpers'
import { assignTicket, cancelTicket, completeTicket, reassignTicket } from '../../api/tickets'
import type { Group, Ticket, UserListItem } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { roleLabels } from '../../format'
import { useToast } from '../Toast'
import { ErrorBanner, SkeletonBlock } from '../ui'

function useCompanyResources(companyId: string) {
  const [groups, setGroups] = useState<Group[]>([])
  const [users, setUsers] = useState<UserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([fetchGroups(companyId), fetchUsers(companyId)])
      .then(([groupResult, userResult]) => {
        if (cancelled) return
        setGroups(groupResult.items)
        setUsers(userResult.items)
      })
      .catch(err => {
        if (!cancelled) setError(apiErrorText(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [companyId])

  return { groups, users, loading, error }
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return <p className="text-xs text-red-600">{message}</p>
}

export function TicketActions({ ticket, onMutated }: { ticket: Ticket; onMutated: () => void }) {
  const { user } = useAuth()
  if (!user) return null
  const handlerSide = user.role === 'handler' || user.role === 'admin'
  const open = ticket.status === 'PENDING_ASSIGNMENT' || ticket.status === 'PROCESSING'
  const canAssign = handlerSide && ticket.status === 'PENDING_ASSIGNMENT'
  const canTransfer = handlerSide && ticket.status === 'PROCESSING'
  const canCancel = open && (user.role === 'admin' || (user.role === 'submitter' && ticket.submitter.id === user.id))
  const hasAction = canAssign || canTransfer || canCancel

  return (
    <div className="card-base space-y-4 p-4">
      <h3 className="section-title">处理操作</h3>
      {canAssign && <AssignForm ticket={ticket} onMutated={onMutated} />}
      {canTransfer && <ReassignForm ticket={ticket} onMutated={onMutated} />}
      {canTransfer && <CompleteForm ticket={ticket} onMutated={onMutated} />}
      {canCancel && <CancelForm ticket={ticket} onMutated={onMutated} />}
      {!hasAction && (
        <p className="text-sm text-slate-400">
          {ticket.status === 'COMPLETED'
            ? '工单已完成（终态），不再支持流转操作。'
            : ticket.status === 'CANCELLED'
              ? '工单已取消（终态），不再支持流转操作。'
              : '当前角色在该状态下暂无可执行操作。'}
        </p>
      )}
    </div>
  )
}

function AssignForm({ ticket, onMutated }: { ticket: Ticket; onMutated: () => void }) {
  const toast = useToast()
  const { groups, users, loading, error } = useCompanyResources(ticket.companyId)
  const [groupId, setGroupId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const handlers = users.filter(candidate => candidate.role === 'handler' || candidate.role === 'admin')

  const submit = async () => {
    if (!groupId) {
      setFormError('请选择要分配到的业务组')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      await assignTicket(ticket.id, groupId, assigneeId || undefined)
      toast.push('success', '分配成功，工单已进入待处理')
      onMutated()
    } catch (err) {
      setFormError(apiErrorText(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3.5">
      <div>
        <p className="text-sm font-medium text-slate-700">人工分配</p>
        <p className="mt-0.5 text-xs text-slate-400">将该待分配工单指派到业务组，分配后工单进入待处理。</p>
      </div>
      {error ? (
        <ErrorBanner message={error} />
      ) : loading ? (
        <div className="space-y-2">
          <SkeletonBlock className="h-9 w-full" />
          <SkeletonBlock className="h-9 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-slate-500">业务组</span>
            <select value={groupId} onChange={event => setGroupId(event.target.value)} className="input-base">
              <option value="">请选择业务组</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500">处理人（可选）</span>
            <select value={assigneeId} onChange={event => setAssigneeId(event.target.value)} className="input-base">
              <option value="">暂不指定</option>
              {handlers.map(candidate => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}（{roleLabels[candidate.role]}）
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <FormError message={formError} />
      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={submitting || loading} className="btn-primary">
          {submitting ? '提交中…' : '确认分配'}
        </button>
      </div>
    </div>
  )
}

function ReassignForm({ ticket, onMutated }: { ticket: Ticket; onMutated: () => void }) {
  const toast = useToast()
  const { groups, users, loading, error } = useCompanyResources(ticket.companyId)
  const [groupId, setGroupId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const handlers = users.filter(candidate => candidate.role === 'handler' || candidate.role === 'admin')

  const submit = async () => {
    if (!groupId && !assigneeId) {
      setFormError('请选择转派目标业务组或处理人（至少一项）')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      await reassignTicket(ticket.id, { groupId: groupId || undefined, assigneeId: assigneeId || undefined })
      toast.push('success', '转派成功，工单归属已更新')
      onMutated()
    } catch (err) {
      setFormError(apiErrorText(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3.5">
      <div>
        <p className="text-sm font-medium text-slate-700">转派</p>
        <p className="mt-0.5 text-xs text-slate-400">转派后工单保持待处理状态，转派目标可在操作日志中追溯。</p>
      </div>
      {error ? (
        <ErrorBanner message={error} />
      ) : loading ? (
        <div className="space-y-2">
          <SkeletonBlock className="h-9 w-full" />
          <SkeletonBlock className="h-9 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-slate-500">目标业务组（可选）</span>
            <select value={groupId} onChange={event => setGroupId(event.target.value)} className="input-base">
              <option value="">保持不变</option>
              {groups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500">转派给处理人（可选）</span>
            <select value={assigneeId} onChange={event => setAssigneeId(event.target.value)} className="input-base">
              <option value="">保持不变</option>
              {handlers.map(candidate => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}（{roleLabels[candidate.role]}）
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <FormError message={formError} />
      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={submitting || loading} className="btn-primary">
          {submitting ? '提交中…' : '确认转派'}
        </button>
      </div>
    </div>
  )
}

function CompleteForm({ ticket, onMutated }: { ticket: Ticket; onMutated: () => void }) {
  const toast = useToast()
  const [resolution, setResolution] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      await completeTicket(ticket.id, resolution.trim() || undefined)
      toast.push('success', '工单已完成，完成通知将发送至提交人邮箱')
      onMutated()
    } catch (err) {
      setFormError(apiErrorText(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 p-3.5">
      <div>
        <p className="text-sm font-medium text-slate-700">完成处理</p>
        <p className="mt-0.5 text-xs text-slate-400">
          完成后工单进入终态，并向提交人邮箱（{ticket.submitter.email}）发送完成通知邮件。
        </p>
      </div>
      <textarea
        value={resolution}
        onChange={event => setResolution(event.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="完成说明（选填，最多 2000 字）"
        className="input-base resize-y"
      />
      <FormError message={formError} />
      <div className="flex justify-end">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? '提交中…' : '确认完成'}
        </button>
      </div>
    </form>
  )
}

function CancelForm({ ticket, onMutated }: { ticket: Ticket; onMutated: () => void }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      await cancelTicket(ticket.id, reason.trim() || undefined)
      toast.push('success', '工单已取消')
      onMutated()
    } catch (err) {
      setFormError(apiErrorText(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 p-3.5">
      <div>
        <p className="text-sm font-medium text-slate-700">取消工单</p>
        <p className="mt-0.5 text-xs text-slate-400">取消后工单进入终态，不可恢复。</p>
      </div>
      <textarea
        value={reason}
        onChange={event => setReason(event.target.value)}
        rows={2}
        maxLength={200}
        placeholder="取消原因（选填，最多 200 字）"
        className="input-base resize-y"
      />
      <FormError message={formError} />
      <div className="flex justify-end">
        <button type="submit" disabled={submitting} className="btn-danger">
          {submitting ? '提交中…' : '确认取消'}
        </button>
      </div>
    </form>
  )
}
