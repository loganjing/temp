import { useState, type FormEvent } from 'react'
import { ticketApi, STATUS_LABELS, formatDateTime, type TicketDetail, type CurrentUser, type AdminUser } from '../api/ticket-api'
import { useToast } from './Toast'
import ReplyStream from './ReplyStream'
import SubmitterInfo from './SubmitterInfo'
import EvaluationPanel from './EvaluationPanel'

interface Props {
  detail: TicketDetail
  currentUser: CurrentUser
  onUpdated: () => void
}

export default function TicketDetail({ detail, currentUser, onUpdated }: Props) {
  const [busy, setBusy] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferTarget, setTransferTarget] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [resolution, setResolution] = useState('')
  const [showComplete, setShowComplete] = useState(false)
  const [users, setUsers] = useState<AdminUser[]>([])
  const showToast = useToast()

  const isSubmitter = detail.submitterId === currentUser.id
  const isHandler = detail.handlerId === currentUser.id
  const canCancel = (isSubmitter || isHandler) && ['pending_assign', 'pending_handle'].includes(detail.status)
  const canComplete = isHandler && detail.status === 'pending_handle'
  const canTransfer = isHandler && detail.status === 'pending_handle'
  const canReply = isSubmitter || isHandler

  const handleCancel = async () => {
    setBusy(true)
    try {
      await ticketApi.cancelTicket(detail.id)
      showToast('工单已取消')
      onUpdated()
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : '取消失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const loadUsers = async () => {
    try {
      const result = await ticketApi.getAdminUsers()
      setUsers(result.users.filter((u) => u.id !== currentUser.id))
    } catch { /* ignore */ }
  }

  const handleTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!transferTarget) return
    setBusy(true)
    try {
      await ticketApi.transferTicket(detail.id, transferTarget, transferReason.trim())
      showToast('工单已转派')
      setShowTransfer(false)
      setTransferTarget('')
      setTransferReason('')
      onUpdated()
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : '转派失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleComplete = async () => {
    setBusy(true)
    try {
      await ticketApi.completeTicket(detail.id, resolution.trim())
      showToast('工单已完成')
      setShowComplete(false)
      setResolution('')
      onUpdated()
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : '完成失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const statusColor: Record<string, string> = {
    created: 'var(--muted)', pending_assign: 'var(--accent)', pending_handle: 'var(--accent)',
    completed: 'var(--success)', cancelled: 'var(--danger)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <section className="card">
        <div className="section-heading">
          <h2 style={{ margin: 0 }}>{detail.subject}</h2>
          <span style={{
            fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: '4px',
            background: 'var(--page)', color: statusColor[detail.status] ?? 'var(--text)',
          }}>
            {STATUS_LABELS[detail.status] ?? detail.status}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginTop: '0.75rem', fontSize: '0.9rem' }}>
          <div><span style={{ color: 'var(--muted)' }}>优先级：</span>{detail.priority}</div>
          <div><span style={{ color: 'var(--muted)' }}>分类：</span>{detail.category}</div>
          <div><span style={{ color: 'var(--muted)' }}>创建时间：</span>{formatDateTime(detail.createdAt)}</div>
          <div><span style={{ color: 'var(--muted)' }}>处理时间：</span>{formatDateTime(detail.handledAt)}</div>
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>描述</span>
          <p style={{ margin: '0.25rem 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{detail.description}</p>
        </div>
      </section>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {canCancel && <button className="secondary" disabled={busy} onClick={() => void handleCancel()}>取消工单</button>}
        {canTransfer && !showTransfer && <button disabled={busy} onClick={() => { void loadUsers(); setShowTransfer(true) }}>转派</button>}
        {canComplete && !showComplete && <button disabled={busy} onClick={() => setShowComplete(true)}>完成</button>}
      </div>

      {showTransfer && (
        <section className="card">
          <h3 style={{ margin: '0 0 0.5rem' }}>转派工单</h3>
          <form onSubmit={(event) => void handleTransfer(event)} className="stack">
            <label>选择处理人
              <select value={transferTarget} onChange={(event) => setTransferTarget(event.currentTarget.value)} required>
                <option value="">请选择…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
              </select>
            </label>
            <label>转派原因（可选）
              <input value={transferReason} onChange={(event) => setTransferReason(event.currentTarget.value)} maxLength={500} />
            </label>
            <div className="row-actions">
              <button disabled={busy || !transferTarget}>{busy ? '转派中…' : '确认转派'}</button>
              <button type="button" className="secondary" onClick={() => setShowTransfer(false)}>取消</button>
            </div>
          </form>
        </section>
      )}

      {showComplete && (
        <section className="card">
          <h3 style={{ margin: '0 0 0.5rem' }}>完成工单</h3>
          <label style={{ marginBottom: '0.5rem' }}>处理说明
            <textarea
              value={resolution}
              onChange={(event) => setResolution(event.currentTarget.value)}
              maxLength={1000}
              style={{ width: '100%', minHeight: '80px', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px', resize: 'vertical', font: 'inherit', background: 'var(--surface)', color: 'var(--text)' }}
            />
          </label>
          <div className="row-actions">
            <button disabled={busy} onClick={() => void handleComplete()}>{busy ? '提交中…' : '确认完成'}</button>
            <button type="button" className="secondary" onClick={() => setShowComplete(false)}>取消</button>
          </div>
        </section>
      )}

      <ReplyStream
        ticketId={detail.id}
        replies={detail.replies}
        onReplyAdded={onUpdated}
        canReply={canReply}
      />

      <SubmitterInfo ticketId={detail.id} />

      <EvaluationPanel
        ticketId={detail.id}
        isCompleted={detail.status === 'completed'}
        isSubmitter={isSubmitter}
      />
    </div>
  )
}
