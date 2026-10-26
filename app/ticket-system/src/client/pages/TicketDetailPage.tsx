import { useState, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiRequest } from '../platform/api-client'
import { useAsync, type AsyncState } from '../hooks/useAsync'
import { Skeleton, EmptyState, ErrorState, useSuccessToast } from '../components/StateViews'
import { StatusBadge, PriorityBadge } from '../components/Badge'
import { canHandle, type CurrentUser } from '../types/auth'
import {
  STATUS_LABELS,
  type AuditLog,
  type BusinessGroup,
  type SubmitterInfo,
  type Ticket,
  type TicketEvaluation,
  type TicketReply,
} from '../types/ticket'

type StatusAction = 'assign' | 'process' | 'complete' | 'cancel'

interface TicketDetailPageProps {
  user: CurrentUser
}

// 工单详情：工单信息、多轮回复、提交人完整信息、操作日志、满意度评价。
export default function TicketDetailPage({ user }: TicketDetailPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const ticketId = id ?? ''
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const { message: toast, notify } = useSuccessToast()

  const ticketState = useAsync<Ticket>(
    () => apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}`),
    [ticketId],
  )
  const repliesState = useAsync<TicketReply[]>(
    () => apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/replies`),
    [ticketId],
  )
  const logsState = useAsync<{ data: AuditLog[] }>(
    () => apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/logs`),
    [ticketId],
  )
  const evaluationState = useAsync<TicketEvaluation | null>(
    () => apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/evaluation`),
    [ticketId],
  )
  const submitterState = useAsync<SubmitterInfo | null>(
    () => canHandle(user)
      ? apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/submitter-info`)
      : Promise.resolve(null),
    [ticketId, user.id],
  )

  const refreshAll = () => {
    void ticketState.reload()
    void repliesState.reload()
    void logsState.reload()
    void evaluationState.reload()
    void submitterState.reload()
  }

  if (ticketState.loading) return <section className="card"><Skeleton lines={6} /></section>
  if (ticketState.error) return <section className="card"><ErrorState message={ticketState.error} onRetry={ticketState.reload} /></section>
  const ticket = ticketState.data
  if (!ticket) return <section className="card"><EmptyState title="工单不存在或无权查看" /></section>

  const changeStatus = async (action: StatusAction, extra?: Record<string, string>) => {
    setBusy(true)
    setActionError('')
    try {
      await apiRequest<Ticket>(`/api/tickets/${encodeURIComponent(ticketId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ action, ...extra }),
      })
      notify('操作成功')
      void ticketState.reload()
      void logsState.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {toast && <p role="status" className="success">{toast}</p>}

      <section className="card">
        <div className="section-heading">
          <div className="flex items-center gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <button className="secondary" onClick={() => navigate('/workbench')}>返回工作台</button>
        </div>
        <h2 className="text-xl font-semibold">{ticket.subject}</h2>
        <p className="mt-2 whitespace-pre-wrap text-[var(--muted)]">{ticket.description}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div><dt className="text-[var(--muted)]">分类</dt><dd>{ticket.category}</dd></div>
          <div><dt className="text-[var(--muted)]">创建时间</dt><dd>{new Date(ticket.created_at).toLocaleString()}</dd></div>
          <div><dt className="text-[var(--muted)]">首次分配</dt><dd>{ticket.first_assigned_at ? new Date(ticket.first_assigned_at).toLocaleString() : '—'}</dd></div>
          <div><dt className="text-[var(--muted)]">完成时间</dt><dd>{ticket.completed_at ? new Date(ticket.completed_at).toLocaleString() : '—'}</dd></div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {canHandle(user) && ticket.status === 'pending_assignment' && (
            <button disabled={busy} onClick={() => void changeStatus('assign')}>分配给我</button>
          )}
          {canHandle(user) && ticket.status === 'pending_processing' && (
            <>
              <button disabled={busy} onClick={() => void changeStatus('process', { assigned_handler_id: user.id })}>开始处理</button>
              <button disabled={busy} onClick={() => void changeStatus('complete')}>标记完成</button>
            </>
          )}
          {ticket.status === 'completed' && <span className="text-[var(--success)]">工单已完成</span>}
          {(ticket.status === 'created' || ticket.status === 'pending_assignment' || ticket.status === 'pending_processing') && (
            <button className="secondary" disabled={busy} onClick={() => void changeStatus('cancel')}>取消工单</button>
          )}
        </div>
        {actionError && <p role="alert" className="error mt-2">{actionError}</p>}
      </section>

      <ReplySection
        ticketId={ticketId}
        replies={repliesState.data ?? []}
        loading={repliesState.loading}
        error={repliesState.error}
        onReload={repliesState.reload}
      />

      {canHandle(user) && <SubmitterPanel state={submitterState} />}

      {canHandle(user) && ticket.status === 'pending_processing' && (
        <TransferPanel ticketId={ticketId} onDone={() => { notify('转派成功'); refreshAll() }} />
      )}

      {ticket.status === 'completed' && (
        <EvaluationPanel
          ticketId={ticketId}
          evaluation={evaluationState.data ?? null}
          loading={evaluationState.loading}
          error={evaluationState.error}
          onReload={evaluationState.reload}
        />
      )}

      <section className="card">
        <div className="section-heading"><h3>操作日志</h3></div>
        {logsState.loading && <Skeleton lines={3} />}
        {logsState.error && <ErrorState message={logsState.error} onRetry={logsState.reload} />}
        {logsState.data && logsState.data.data.length === 0 && <EmptyState title="暂无操作日志" />}
        {logsState.data && logsState.data.data.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>操作类型</th><th>操作人</th><th>时间</th></tr></thead>
              <tbody>{logsState.data.data.map((log) => (
                <tr key={log.id}>
                  <td>{log.action}</td>
                  <td title={log.actor_id}>{log.actor_id}</td>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

interface ReplySectionProps {
  ticketId: string
  replies: TicketReply[]
  loading: boolean
  error: string | undefined
  onReload: () => void
}

function ReplySection({ ticketId, replies, loading, error, onReload }: ReplySectionProps) {
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/replies`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      setContent('')
      void onReload()
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : '回复失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="section-heading"><h3>回复 ({replies.length})</h3></div>
      {loading && <Skeleton lines={3} />}
      {error && <ErrorState message={error} onRetry={onReload} />}
      {!loading && !error && replies.length === 0 && <EmptyState title="暂无回复" />}
      <ul className="flex flex-col gap-2">
        {replies.map((reply) => (
          <li key={reply.id} className="rounded-md border border-[var(--border)] p-3">
            <div className="flex items-center justify-between text-xs text-[var(--muted)]">
              <span title={reply.author_id}>{reply.author_id}</span>
              <span>{new Date(reply.created_at).toLocaleString()}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap">{reply.content}</p>
          </li>
        ))}
      </ul>
      <form className="stack mt-3" onSubmit={(event) => void submit(event)}>
        <label>添加回复
          <textarea value={content} onChange={(e) => setContent(e.currentTarget.value)} required rows={3} className="w-full" style={{ minHeight: 80 }} />
        </label>
        {err && <p role="alert" className="error">{err}</p>}
        <div><button disabled={busy || !content.trim()}>{busy ? '提交中…' : '发送回复'}</button></div>
      </form>
    </section>
  )
}

function SubmitterPanel({ state }: { state: AsyncState<SubmitterInfo | null> }) {
  return (
    <section className="card">
      <div className="section-heading"><h3>提交人信息</h3></div>
      {state.loading && <Skeleton lines={3} />}
      {state.error && <ErrorState message={state.error} onRetry={state.reload} />}
      {state.data && (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div><dt className="text-[var(--muted)]">姓名</dt><dd>{state.data.display_name}</dd></div>
            <div><dt className="text-[var(--muted)]">邮箱</dt><dd>{state.data.email}</dd></div>
            <div><dt className="text-[var(--muted)]">公司</dt><dd>{state.data.company.name}</dd></div>
            <div><dt className="text-[var(--muted)]">部门</dt><dd>{state.data.department.name ?? '—'}</dd></div>
          </dl>
          <div>
            <h4 className="mb-1 text-sm font-medium text-[var(--muted)]">历史工单</h4>
            {state.data.history_tickets.length === 0 ? <p className="text-sm text-[var(--muted)]">无历史工单</p> : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>主题</th><th>状态</th><th>优先级</th><th>创建时间</th></tr></thead>
                  <tbody>{state.data.history_tickets.map((t) => (
                    <tr key={t.id}>
                      <td><strong title={t.subject}>{t.subject}</strong></td>
                      <td>{STATUS_LABELS[t.status]}</td>
                      <td>{t.priority}</td>
                      <td>{new Date(t.created_at).toLocaleString()}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function TransferPanel({ ticketId, onDone }: { ticketId: string; onDone: () => void }) {
  const [toHandler, setToHandler] = useState('')
  const [toGroup, setToGroup] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const groupsState = useAsync<BusinessGroup[]>(() => apiRequest('/api/business-groups'), [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!toHandler && !toGroup) { setErr('请选择目标处理人或业务组'); return }
    setBusy(true)
    setErr('')
    try {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/transfer`, {
        method: 'POST',
        body: JSON.stringify({
          to_handler_id: toHandler || undefined,
          to_group_id: toGroup || undefined,
          reason: reason || undefined,
        }),
      })
      setToHandler(''); setToGroup(''); setReason('')
      onDone()
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : '转派失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="section-heading"><h3>转派工单</h3></div>
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        <label>目标处理人 ID（可选）<input value={toHandler} onChange={(e) => setToHandler(e.currentTarget.value)} /></label>
        <label>目标业务组
          <select value={toGroup} onChange={(e) => setToGroup(e.currentTarget.value)}>
            <option value="">不指定</option>
            {(groupsState.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label>转派原因（可选）<input value={reason} onChange={(e) => setReason(e.currentTarget.value)} /></label>
        <div className="flex items-end"><button disabled={busy}>{busy ? '提交中…' : '转派'}</button></div>
      </form>
      {err && <p role="alert" className="error mt-2">{err}</p>}
      {groupsState.error && <p className="error mt-2 text-sm">业务组加载失败：{groupsState.error}</p>}
    </section>
  )
}

interface EvaluationPanelProps {
  ticketId: string
  evaluation: TicketEvaluation | null
  loading: boolean
  error: string | undefined
  onReload: () => void
}

function EvaluationPanel({ ticketId, evaluation, loading, error, onReload }: EvaluationPanelProps) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/evaluation`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment: comment || undefined }),
      })
      setComment('')
      void onReload()
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : '评价失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="section-heading"><h3>满意度评价</h3></div>
      {loading && <Skeleton lines={2} />}
      {error && <ErrorState message={error} onRetry={onReload} />}
      {evaluation && (
        <p className="text-sm">已评价：{evaluation.rating} 星{evaluation.comment ? ` — ${evaluation.comment}` : ''}</p>
      )}
      {!evaluation && !loading && !error && (
        <form className="stack" onSubmit={(event) => void submit(event)} style={{ maxWidth: 460 }}>
          <label>评分
            <select value={rating} onChange={(e) => setRating(Number(e.currentTarget.value))}>
              {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} 星</option>)}
            </select>
          </label>
          <label>备注（可选）<input value={comment} onChange={(e) => setComment(e.currentTarget.value)} /></label>
          {err && <p role="alert" className="error">{err}</p>}
          <div><button disabled={busy}>{busy ? '提交中…' : '提交评价'}</button></div>
        </form>
      )}
    </section>
  )
}
