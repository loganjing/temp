import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { apiRequest } from '../platform/api-client'
import { describeError } from '../platform/errors'
import {
  eventActionLabels,
  eventDetailLabels,
  isRole,
  notificationStatusLabels,
  priorities,
  roleLabels,
  statusLabels,
  type BusinessGroup,
  type CurrentUser,
  type NotificationStatus,
  type SubmitterProfile,
  type TicketDetail,
  type TicketEvent,
  type TicketNotification,
  type TicketPriority,
  type TicketReply,
} from '../tickets/types'
import { formatDateTime, formatDetailValue, formatScore } from '../tickets/format'
import {
  EmptyState,
  ErrorNotice,
  LoadingBlock,
  NotificationBadge,
  PriorityBadge,
  RatingBadge,
  StatusBadge,
  SuccessNote,
} from '../components/Feedback'

export type TicketDetailData = {
  ticket: TicketDetail
  replies: TicketReply[]
  events: TicketEvent[]
  groups: BusinessGroup[]
  notifications?: TicketNotification[]
  submitter?: SubmitterProfile
  notificationsError?: unknown
  submitterError?: unknown
  repliesError?: unknown
  eventsError?: unknown
  groupsError?: unknown
  notificationsLoading?: boolean
  submitterLoading?: boolean
  repliesLoading?: boolean
  eventsLoading?: boolean
  onRetryNotifications?: () => void
  onRetrySubmitter?: () => void
  onRetryReplies?: () => void
  onRetryEvents?: () => void
}

type Props = {
  data: TicketDetailData
  currentUser: CurrentUser
  refresh: () => void
  initialNotice?: string
  onClose?: () => void
  onChanged?: () => void
}

const ratingScores = [1, 2, 3, 4, 5]

export default function TicketDetailView({ data, currentUser, refresh, initialNotice, onClose, onChanged }: Props) {
  const { ticket, replies, events, groups, notifications, submitter } = data
  const [notice, setNotice] = useState(initialNotice ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [assignGroupId, setAssignGroupId] = useState('')
  const [transferGroupId, setTransferGroupId] = useState('')
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority)
  const [ratingScore, setRatingScore] = useState(4)
  const [ratingComment, setRatingComment] = useState('')

  const terminal = ticket.status === 'completed' || ticket.status === 'cancelled'
  const hasActions = ticket.canAssign || ticket.canTransfer || ticket.canChangePriority || ticket.canComplete || ticket.canCancel || ticket.canRate
  const readOnlyRole = currentUser.role === 'ops'
  const transferTargets = groups.filter((group) => group.id !== ticket.groupId)
  const showSubmitter = currentUser.role !== 'submitter'
  const showNotifications = currentUser.role !== 'submitter'
  const canResendNotification = currentUser.role === 'handler' || currentUser.role === 'admin'

  useEffect(() => { setPriority(ticket.priority) }, [ticket.priority])
  useEffect(() => { setNotice(initialNotice ?? ''); setError('') }, [ticket.id, initialNotice])

  const perform = async (key: string, action: () => Promise<string>) => {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      setNotice(await action())
      refresh()
      onChanged?.()
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setBusy(null)
    }
  }

  const submitReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!replyBody.trim()) return
    void perform('reply', async () => {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticket.id)}/replies`, {
        method: 'POST',
        body: JSON.stringify({ body: replyBody }),
      })
      setReplyBody('')
      return '回复已提交，对话已更新。'
    })
  }

  const assign = () => {
    if (!assignGroupId) return
    void perform('assign', async () => {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticket.id)}/assign`, {
        method: 'POST',
        body: JSON.stringify({ groupId: assignGroupId }),
      })
      setAssignGroupId('')
      return '工单已分配给所选业务组，状态更新为待处理。'
    })
  }

  const transfer = () => {
    if (!transferGroupId) return
    void perform('transfer', async () => {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticket.id)}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ toGroupId: transferGroupId }),
      })
      setTransferGroupId('')
      return '工单已转派，承接业务组已更新。'
    })
  }

  const changePriority = () => {
    void perform('priority', async () => {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticket.id)}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ priority }),
      })
      return '优先级已调整。'
    })
  }

  const complete = () => {
    void perform('complete', async () => {
      const result = await apiRequest<{ notification?: { status?: NotificationStatus } }>(`/api/tickets/${encodeURIComponent(ticket.id)}/complete`, { method: 'POST' })
      const status = result?.notification?.status
      return status ? `工单已完成，完成通知状态：${notificationStatusLabels[status] ?? status}。` : '工单已完成，完成通知记录已生成。'
    })
  }

  const cancel = () => {
    void perform('cancel', async () => {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticket.id)}/cancel`, { method: 'POST' })
      return '工单已取消。'
    })
  }

  const submitRating = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void perform('rating', async () => {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticket.id)}/rating`, {
        method: 'POST',
        body: JSON.stringify({ score: ratingScore, ...(ratingComment.trim() ? { comment: ratingComment.trim() } : {}) }),
      })
      setRatingComment('')
      return '感谢反馈，满意度评价已保存。'
    })
  }

  const resendNotification = (notification: TicketNotification) => {
    void perform(`resend-${notification.id}`, async () => {
      await apiRequest(`/api/tickets/${encodeURIComponent(ticket.id)}/notifications/${encodeURIComponent(notification.id)}/resend`, { method: 'POST' })
      return '已提交重发，新的发送结果已记录在通知列表中。'
    })
  }

  return (
    <article className="ticket-detail" aria-label={`工单 ${ticket.id}`}>
      <header className="detail-header">
        <div>
          <div className="detail-ident">
            <span className="mono ticket-id">{ticket.id}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            {ticket.status === 'completed' && <RatingBadge score={ticket.satisfactionScore} />}
          </div>
          <h2 className="detail-title" title={ticket.title}>{ticket.title}</h2>
          <p className="subtext">
            {ticket.companyName} · {ticket.departmentName} · {ticket.categoryName} · 创建于 {formatDateTime(ticket.createdAt)}
          </p>
        </div>
        {onClose && <button type="button" className="secondary btn-sm" onClick={onClose}>关闭详情</button>}
      </header>

      {notice && <SuccessNote>{notice}</SuccessNote>}
      {error && <div className="notice notice-error" role="alert"><span>{error}</span></div>}
      {terminal && (
        <div className="notice notice-muted" role="status">
          该工单已{statusLabels[ticket.status]}（{formatDateTime(ticket.status === 'completed' ? ticket.completedAt : ticket.cancelledAt)}），状态、回复、分配、转派与优先级均不可再变更。
        </div>
      )}

      <section className="panel" aria-labelledby="ticket-meta-heading">
        <h3 id="ticket-meta-heading">工单信息</h3>
        <dl className="meta-grid">
          <Meta label="问题分类" value={ticket.categoryName} />
          <Meta label="当前状态" value={<StatusBadge status={ticket.status} />} />
          <Meta label="优先级" value={<PriorityBadge priority={ticket.priority} />} />
          <Meta label="所属公司" value={ticket.companyName} />
          <Meta label="所属部门" value={ticket.departmentName} />
          <Meta label="承接业务组" value={ticket.groupName ?? '未分配'} />
          <Meta label="处理人" value={ticket.assigneeName ?? '未分配'} />
          <Meta label="提交人" value={`${ticket.submitterName}（${ticket.submitterEmail}）`} />
          <Meta label="创建时间" value={formatDateTime(ticket.createdAt)} />
          <Meta label="首次响应" value={formatDateTime(ticket.firstResponseAt)} />
          <Meta label="完成时间" value={formatDateTime(ticket.completedAt)} />
          <Meta label="取消时间" value={formatDateTime(ticket.cancelledAt)} />
          <Meta label="满意度" value={formatScore(ticket.satisfactionScore)} />
        </dl>
      </section>

      <section className="panel" aria-labelledby="ticket-description-heading">
        <h3 id="ticket-description-heading">问题描述</h3>
        <p className="body-text" title={ticket.description}>{ticket.description}</p>
      </section>

      {hasActions && (
        <section className="panel" aria-labelledby="ticket-actions-heading">
          <h3 id="ticket-actions-heading">处理操作</h3>
          {data.groupsError ? <p className="notice notice-error" role="alert">业务组加载失败，请刷新后重试。</p> : null}
          <div className="action-grid">
            {ticket.canAssign && (
              <ActionCard title="分配业务组" hint="仅待分配工单可人工指定业务组。">
                {groups.length === 0
                  ? <p className="subtext">暂无可选业务组，请联系管理员先配置业务组。</p>
                  : <>
                    <label>业务组
                      <select aria-label="分配业务组" value={assignGroupId} onChange={(event) => setAssignGroupId(event.currentTarget.value)}>
                        <option value="">请选择业务组</option>
                        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </select>
                    </label>
                    <button type="button" disabled={busy !== null || !assignGroupId} onClick={assign}>{busy === 'assign' ? '分配中…' : '确认分配'}</button>
                  </>}
              </ActionCard>
            )}

            {ticket.canTransfer && (
              <ActionCard title="转派工单" hint="转派到本公司其他业务组，工单保持待处理。">
                {transferTargets.length === 0
                  ? <p className="subtext">没有其他可转派的业务组。</p>
                  : <>
                    <label>目标业务组
                      <select aria-label="目标业务组" value={transferGroupId} onChange={(event) => setTransferGroupId(event.currentTarget.value)}>
                        <option value="">请选择目标业务组</option>
                        {transferTargets.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </select>
                    </label>
                    <button type="button" disabled={busy !== null || !transferGroupId} onClick={transfer}>{busy === 'transfer' ? '转派中…' : '确认转派'}</button>
                  </>}
              </ActionCard>
            )}

            {ticket.canChangePriority && (
              <ActionCard title="调整优先级" hint="调整会写入工单日志。">
                <label>优先级
                  <select aria-label="优先级" value={priority} onChange={(event) => setPriority(event.currentTarget.value as TicketPriority)}>
                    {priorities.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <button type="button" disabled={busy !== null || priority === ticket.priority} onClick={changePriority}>{busy === 'priority' ? '保存中…' : '保存优先级'}</button>
              </ActionCard>
            )}

            {ticket.canComplete && (
              <ActionCard title="完成工单" hint="完成后将记录处理人与完成时间，并向提交人发送完成通知。">
                <button type="button" disabled={busy !== null} onClick={complete}>{busy === 'complete' ? '完成中…' : '完成工单'}</button>
              </ActionCard>
            )}

            {ticket.canCancel && (
              <ActionCard title="取消工单" hint="取消后为终态，不可再变更。">
                <button type="button" className="danger" disabled={busy !== null} onClick={cancel}>{busy === 'cancel' ? '取消中…' : '取消工单'}</button>
              </ActionCard>
            )}
          </div>
        </section>
      )}

      {!terminal && !hasActions && (
        <div className="notice notice-muted" role="status">
          {readOnlyRole ? '当前身份为只读访问，可查看工单与日志，但不能回复或处理工单。' : '当前身份没有可执行的工单处理操作。'}
        </div>
      )}

      <section className="panel" aria-labelledby="ticket-replies-heading">
        <div className="section-heading">
          <h3 id="ticket-replies-heading">回复记录 <span className="count">{replies.length}</span></h3>
        </div>
        {data.repliesError
          ? <ErrorNotice error={data.repliesError} title="回复加载失败" onRetry={data.onRetryReplies} />
          : data.repliesLoading && replies.length === 0
            ? <LoadingBlock label="正在加载回复…" rows={2} />
            : replies.length === 0
              ? <EmptyState title="暂无回复" hint="双方回复后会按时间顺序显示在这里。" />
              : <ol className="conversation">
            {replies.map((reply) => (
              <li key={reply.id} className="reply">
                <div className="reply-head">
                  <strong>{reply.authorName}</strong>
                  <span className="badge badge-plain">{isRole(reply.authorRole) ? roleLabels[reply.authorRole] : reply.authorRole}</span>
                  <time dateTime={reply.createdAt}>{formatDateTime(reply.createdAt)}</time>
                </div>
                <p className="body-text">{reply.body}</p>
              </li>
            ))}
              </ol>}

        {terminal
          ? <p className="subtext">工单已结束，无法继续回复。</p>
          : ticket.canReply
            ? <form className="reply-form" onSubmit={submitReply}>
              <label htmlFor={`reply-body-${ticket.id}`}>回复内容</label>
              <textarea id={`reply-body-${ticket.id}`} name="body" rows={3} value={replyBody} onChange={(event) => setReplyBody(event.currentTarget.value)} placeholder="填写回复内容，提交后双方都可在对话中看到。" />
              <button disabled={busy !== null || !replyBody.trim()}>{busy === 'reply' ? '提交中…' : '提交回复'}</button>
            </form>
            : <p className="subtext">当前身份不能回复该工单。</p>}
      </section>

      {ticket.status === 'completed' && (
        <section className="panel" aria-labelledby="ticket-rating-heading">
          <h3 id="ticket-rating-heading">满意度评价</h3>
          {ticket.satisfactionScore !== null ? (
            <div className="rating-summary">
              <div><RatingBadge score={ticket.satisfactionScore} /><span className="rating-score">{formatScore(ticket.satisfactionScore)}</span></div>
              {ticket.satisfactionComment && <p className="body-text" title={ticket.satisfactionComment}>{ticket.satisfactionComment}</p>}
              <p className="subtext">评价时间：{formatDateTime(ticket.satisfactionAt)}</p>
            </div>
          ) : ticket.canRate ? (
            <form className="rating-form" onSubmit={submitRating}>
              <fieldset className="rating-field">
                <legend>整体满意度（1–5 分）</legend>
                <div className="rating-options">
                  {ratingScores.map((value) => (
                    <label key={value} className={ratingScore === value ? 'selected' : ''}>
                      <input type="radio" name="score" value={value} checked={ratingScore === value} onChange={() => setRatingScore(value)} />
                      <span aria-hidden="true">{'★'.repeat(value)}</span>
                      <span className="sr-only">{value} 分</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>评价意见（可选）<textarea name="comment" rows={2} value={ratingComment} onChange={(event) => setRatingComment(event.currentTarget.value)} placeholder="可补充说明你的使用体验。" /></label>
              <button disabled={busy !== null}>{busy === 'rating' ? '提交中…' : '提交评价'}</button>
            </form>
          ) : (
            <p className="subtext"><RatingBadge score={null} /> 提交人尚未提交评价。</p>
          )}
        </section>
      )}

      {showSubmitter && (
        <section className="panel" aria-labelledby="ticket-submitter-heading">
          <h3 id="ticket-submitter-heading">提交人信息与历史工单</h3>
          {data.submitterError
            ? <ErrorNotice error={data.submitterError} title="提交人信息加载失败" onRetry={data.onRetrySubmitter} />
            : !submitter
              ? <LoadingBlock label="正在加载提交人信息…" rows={2} />
              : <>
                <dl className="meta-grid">
                  <Meta label="姓名" value={submitter.name} />
                  <Meta label="邮箱" value={submitter.email} />
                  <Meta label="公司" value={submitter.companyName} />
                  <Meta label="部门" value={submitter.departmentName} />
                </dl>
                <h4>历史工单 <span className="count">{submitter.history.length}</span></h4>
                {submitter.history.length === 0
                  ? <EmptyState title="该提交人暂无其他工单" />
                  : <div className="table-scroll">
                    <table className="compact-table">
                      <thead><tr><th>工单 ID</th><th>主题</th><th>分类</th><th>优先级</th><th>状态</th><th>创建时间</th></tr></thead>
                      <tbody>{submitter.history.map((item) => (
                        <tr key={item.id}>
                          <td className="mono">{item.id}</td>
                          <td title={item.title}>{item.title}</td>
                          <td>{item.categoryName}</td>
                          <td><PriorityBadge priority={item.priority} /></td>
                          <td><StatusBadge status={item.status} /></td>
                          <td>{formatDateTime(item.createdAt)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>}
              </>}
        </section>
      )}

      {showNotifications && (
        <section className="panel" aria-labelledby="ticket-notifications-heading">
          <h3 id="ticket-notifications-heading">完成通知记录</h3>
          {data.notificationsError
            ? <ErrorNotice error={data.notificationsError} title="通知记录加载失败" onRetry={data.onRetryNotifications} />
            : !notifications
              ? <LoadingBlock label="正在加载通知记录…" rows={2} />
              : notifications.length === 0
                ? <EmptyState title="暂无完成通知记录" hint="工单完成时会向提交人邮箱发送完成通知，发送结果记录在这里。" />
                : <div className="table-scroll">
                  <table className="compact-table">
                    <thead><tr><th>状态</th><th>收件人</th><th>主题</th><th>尝试</th><th>创建时间</th><th>发送时间</th><th>操作</th></tr></thead>
                    <tbody>{notifications.map((notification) => (
                      <tr key={notification.id}>
                        <td><NotificationBadge status={notification.status} /></td>
                        <td>{notification.recipientEmail}</td>
                        <td title={notification.subject}>{notification.subject}</td>
                        <td>{notification.attempt}</td>
                        <td>{formatDateTime(notification.createdAt)}</td>
                        <td>{formatDateTime(notification.sentAt)}</td>
                        <td>
                          {notification.status === 'sent'
                            ? <span className="subtext">已发送</span>
                            : !canResendNotification
                              ? <span className="subtext">不可重发</span>
                              : <button type="button" className="secondary btn-sm" disabled={busy !== null} onClick={() => resendNotification(notification)}>{busy === `resend-${notification.id}` ? '重发中…' : '重发'}</button>}
                          {notification.errorMessage && <span className="subtext error" title={notification.errorMessage}>{notification.errorMessage}</span>}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>}
        </section>
      )}

      <section className="panel" aria-labelledby="ticket-events-heading">
        <h3 id="ticket-events-heading">工单日志 <span className="count">{events.length}</span></h3>
        {data.eventsError
          ? <ErrorNotice error={data.eventsError} title="工单日志加载失败" onRetry={data.onRetryEvents} />
          : data.eventsLoading && events.length === 0
            ? <LoadingBlock label="正在加载日志…" rows={2} />
            : events.length === 0
              ? <EmptyState title="暂无日志" />
              : <ol className="timeline">
            {events.map((event) => (
              <li key={event.id}>
                <div className="timeline-head">
                  <strong>{eventActionLabels[event.action] ?? event.action}</strong>
                  {event.result === 'failed' && <span className="badge badge-danger">失败</span>}
                  <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                </div>
                <p className="subtext">{event.actorName}{event.actorId === 'system' ? '（系统）' : ''}</p>
                {event.detail && <EventDetail detail={event.detail} />}
              </li>
            ))}
              </ol>}
      </section>
    </article>
  )
}

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function ActionCard({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="action-card">
      <h4>{title}</h4>
      <p className="subtext">{hint}</p>
      {children}
    </div>
  )
}

function EventDetail({ detail }: { detail: Record<string, unknown> }) {
  const entries = Object.entries(detail)
  if (entries.length === 0) return null
  return (
    <details className="event-detail">
      <summary>查看详情</summary>
      <dl>
        {entries.map(([key, value]) => (
          <div key={key}><dt>{eventDetailLabels[key] ?? key}</dt><dd>{formatDetailValue(value)}</dd></div>
        ))}
      </dl>
    </details>
  )
}
