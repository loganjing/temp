import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { describeError } from '../platform/api-client'
import { ErrorState, LoadingState, Notice } from '../platform/states'
import {
  assignTicket,
  cancelTicket,
  completeTicket,
  getTicket,
  listGroups,
  listOrgMembers,
  rateTicket,
  replyToTicket,
  transferTicket,
} from './api'
import {
  assignmentKindLabels,
  formatDateTime,
  label,
  notificationStatusLabels,
  priorityBadgeClass,
  roleLabels,
  statusBadgeClass,
  statusLabels,
} from './labels'
import { PERMISSIONS, type BusinessGroupSummary, type MeContext, type OrgMember, type PermissionKey, type Ticket } from '../../shared/contracts'

const openStatuses = ['created', 'pending_assignment', 'pending_processing']

// 工单详情：提交人完整信息与历史工单、回复流、转派轨迹、处理记录、
// 通知结果、满意度评价与操作区。写操作成功后以服务端返回的最新对象刷新视图。
export function TicketDetailPanel({
  ticketId,
  context,
  onChanged,
  onSelectTicket,
}: {
  ticketId: string
  context: MeContext
  onChanged?: () => void
  onSelectTicket?: (id: string) => void
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [groups, setGroups] = useState<BusinessGroupSummary[]>([])
  const [members, setMembers] = useState<OrgMember[]>([])
  const [replyContent, setReplyContent] = useState('')
  const [assignGroupId, setAssignGroupId] = useState('')
  const [assignMemberId, setAssignMemberId] = useState('')
  const [transferMemberId, setTransferMemberId] = useState('')
  const [transferGroupId, setTransferGroupId] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [resolution, setResolution] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [ratingScore, setRatingScore] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [notificationResult, setNotificationResult] = useState<{ status: string; error: string | null } | null>(null)

  const permits = (permission: PermissionKey) => context.permissions.includes(permission)
  const needsAssign = permits(PERMISSIONS.TICKET_ASSIGN)
  const needsTransfer = permits(PERMISSIONS.TICKET_TRANSFER)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const result = await getTicket(ticketId)
      setTicket(result.ticket)
    } catch (cause) {
      setTicket(null)
      setLoadError(describeError(cause, '无法加载工单 / Could not load ticket'))
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    setReplyContent('')
    setAssignGroupId('')
    setAssignMemberId('')
    setTransferMemberId('')
    setTransferGroupId('')
    setTransferReason('')
    setResolution('')
    setCancelReason('')
    setRatingScore(0)
    setRatingComment('')
    setNotice('')
    setActionError('')
    setNotificationResult(null)
    void load()
  }, [load])

  useEffect(() => {
    if (!needsAssign && !needsTransfer) return
    let cancelled = false
    const emptyGroups: BusinessGroupSummary[] = []
    const emptyMembers: OrgMember[] = []
    void Promise.all([
      listGroups().then((result) => result.items).catch(() => emptyGroups),
      listOrgMembers({ activeOnly: true }).then((result) => result.items).catch(() => emptyMembers),
    ]).then(([groupItems, memberItems]) => {
      if (cancelled) return
      setGroups(groupItems)
      setMembers(memberItems)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [needsAssign, needsTransfer])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      await action()
      onChanged?.()
    } catch (cause) {
      setActionError(describeError(cause))
    } finally {
      setBusy(false)
    }
  }

  const submitReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!replyContent.trim()) return
    void run(async () => {
      await replyToTicket(ticketId, replyContent.trim())
      const fresh = await getTicket(ticketId)
      setTicket(fresh.ticket)
      setReplyContent('')
      setNotice('回复已提交 / Reply submitted')
    })
  }

  const submitAssign = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!assignGroupId) return
    void run(async () => {
      const result = await assignTicket(ticketId, {
        groupId: assignGroupId,
        assigneeMemberId: assignMemberId || undefined,
      })
      setTicket(result.ticket)
      setAssignMemberId('')
      setNotice('分配已保存 / Assignment saved')
    })
  }

  const submitTransfer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!transferMemberId) return
    void run(async () => {
      const result = await transferTicket(ticketId, {
        toMemberId: transferMemberId,
        toGroupId: transferGroupId || undefined,
        reason: transferReason.trim() || undefined,
      })
      setTicket(result.ticket)
      setTransferMemberId('')
      setTransferGroupId('')
      setTransferReason('')
      setNotice('转派已完成 / Transfer completed')
    })
  }

  const submitComplete = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(async () => {
      const result = await completeTicket(ticketId, resolution.trim() ? { resolution: resolution.trim() } : {})
      setTicket(result.ticket)
      setResolution('')
      setNotificationResult(result.notification)
      setNotice('工单已完成 / Ticket completed')
    })
  }

  const submitCancel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void run(async () => {
      const result = await cancelTicket(ticketId, cancelReason.trim() ? { reason: cancelReason.trim() } : {})
      setTicket(result.ticket)
      setCancelReason('')
      setNotice('工单已取消 / Ticket cancelled')
    })
  }

  const submitRating = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (ratingScore < 1) return
    void run(async () => {
      await rateTicket(ticketId, { score: ratingScore, comment: ratingComment.trim() || undefined })
      const fresh = await getTicket(ticketId)
      setTicket(fresh.ticket)
      setRatingComment('')
      setNotice('评价已提交 / Rating submitted')
    })
  }

  if (loading) return <LoadingState />
  if (loadError) return <ErrorState message={loadError} onRetry={() => void load()} />
  if (!ticket) return null

  const canReply = permits(PERMISSIONS.TICKET_REPLY) && openStatuses.includes(ticket.status)
  const canAssign = permits(PERMISSIONS.TICKET_ASSIGN) && ['created', 'pending_assignment'].includes(ticket.status)
  const canTransfer = permits(PERMISSIONS.TICKET_TRANSFER) && ['pending_assignment', 'pending_processing'].includes(ticket.status)
  const canComplete = permits(PERMISSIONS.TICKET_COMPLETE) && ticket.status === 'pending_processing'
  const canCancel = permits(PERMISSIONS.TICKET_CANCEL) && openStatuses.includes(ticket.status)
  const canRate = permits(PERMISSIONS.TICKET_RATE) && ticket.status === 'completed' && !ticket.rating
  const hasActions = canReply || canAssign || canTransfer || canComplete || canCancel || canRate

  return (
    <div className="detail">
      <header className="detail-header">
        <div className="detail-title">
          <p className="subtext">{ticket.ticketNo}</p>
          <h2 title={ticket.subject}>{ticket.subject}</h2>
        </div>
        <span className={statusBadgeClass(ticket.status)}>{label(statusLabels, ticket.status)}</span>
      </header>

      <div className="meta-grid">
        <div className="kv"><span>分类 / Category</span><strong>{ticket.category}</strong></div>
        <div className="kv"><span>优先级 / Priority</span><strong><span className={priorityBadgeClass(ticket.priority)}>{ticket.priority}</span></strong></div>
        <div className="kv"><span>业务组 / Group</span><strong>{ticket.groupName ?? '—'}</strong></div>
        <div className="kv"><span>处理人 / Assignee</span><strong>{ticket.assigneeName ?? '—'}</strong></div>
        <div className="kv"><span>创建时间 / Created</span><strong>{formatDateTime(ticket.createdAt)}</strong></div>
      </div>

      <section className="detail-section">
        <h3>描述 / Description</h3>
        <p className="long-text">{ticket.description}</p>
      </section>

      <section className="detail-section">
        <h3>提交人信息 / Submitter</h3>
        <div className="meta-grid">
          <div className="kv"><span>姓名 / Name</span><strong>{ticket.submitter.name}</strong></div>
          <div className="kv"><span>公司 / Company</span><strong>{ticket.submitter.companyName}</strong></div>
          <div className="kv"><span>部门 / Department</span><strong>{ticket.submitter.departmentName ?? '未设置部门 / Not set'}</strong></div>
          <div className="kv"><span>邮箱 / Email</span><strong title={ticket.submitter.email}>{ticket.submitter.email}</strong></div>
        </div>
      </section>

      <section className="detail-section">
        <h3>历史工单 / Submitter history ({ticket.submitterHistory.length})</h3>
        {ticket.submitterHistory.length === 0
          ? <p className="subtext">该提交人暂无其他工单。/ No other tickets from this submitter.</p>
          : (
            <ul className="record-list">
              {ticket.submitterHistory.map((item) => (
                <li key={item.id} className="record">
                  <button type="button" className="link-button" disabled={!onSelectTicket} onClick={() => onSelectTicket?.(item.id)}>
                    <strong>{item.ticketNo}</strong> · <span title={item.subject}>{item.subject}</span>
                  </button>
                  <span className="subtext">{item.category} · <span className={statusBadgeClass(item.status)}>{label(statusLabels, item.status)}</span> · {formatDateTime(item.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="detail-section">
        <h3>操作 / Actions</h3>
        <Notice kind="success" text={notice} />
        <Notice kind="error" text={actionError} />

        {canReply && (
          <form className="action-form" onSubmit={(event) => void submitReply(event)}>
            <label>回复 / Reply<textarea value={replyContent} onChange={(event) => setReplyContent(event.currentTarget.value)} required maxLength={5000} rows={3} /></label>
            <button disabled={busy}>{busy ? '提交中 / Working…' : '提交回复 / Submit reply'}</button>
          </form>
        )}

        {canAssign && (
          <form className="action-form" onSubmit={(event) => void submitAssign(event)}>
            <div className="form-grid">
              <label>目标业务组 / Target group
                <select value={assignGroupId} onChange={(event) => setAssignGroupId(event.currentTarget.value)} required>
                  <option value="">请选择 / Select</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <label>指定处理人（可选）/ Assignee (optional)
                <select value={assignMemberId} onChange={(event) => setAssignMemberId(event.currentTarget.value)}>
                  <option value="">仅落到业务组 / Group only</option>
                  {members.map((member) => <option key={member.memberId} value={member.memberId}>{member.displayName}</option>)}
                </select>
              </label>
            </div>
            <p className="subtext">指定处理人须为目标业务组成员，由服务端校验。/ Validated by the server.</p>
            <button disabled={busy}>分配 / Assign</button>
          </form>
        )}

        {canTransfer && (
          <form className="action-form" onSubmit={(event) => void submitTransfer(event)}>
            <div className="form-grid">
              <label>目标处理人 / Target assignee
                <select value={transferMemberId} onChange={(event) => setTransferMemberId(event.currentTarget.value)} required>
                  <option value="">请选择 / Select</option>
                  {members.map((member) => <option key={member.memberId} value={member.memberId}>{member.displayName}</option>)}
                </select>
              </label>
              <label>目标业务组（可选）/ Target group (optional)
                <select value={transferGroupId} onChange={(event) => setTransferGroupId(event.currentTarget.value)}>
                  <option value="">沿用当前业务组 / Keep current</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <label>转派说明（可选）/ Reason (optional)
                <input value={transferReason} onChange={(event) => setTransferReason(event.currentTarget.value)} maxLength={500} />
              </label>
            </div>
            <button disabled={busy}>转派 / Transfer</button>
          </form>
        )}

        {canComplete && (
          <form className="action-form" onSubmit={(event) => void submitComplete(event)}>
            <label>处理说明（可选）/ Resolution (optional)
              <textarea value={resolution} onChange={(event) => setResolution(event.currentTarget.value)} maxLength={2000} rows={3} />
            </label>
            <button disabled={busy}>完成工单 / Complete ticket</button>
          </form>
        )}

        {canCancel && (
          <details className="action-form">
            <summary>取消工单 / Cancel ticket</summary>
            <form className="stack" onSubmit={(event) => void submitCancel(event)}>
              <label>取消原因（可选）/ Reason (optional)
                <input value={cancelReason} onChange={(event) => setCancelReason(event.currentTarget.value)} maxLength={500} />
              </label>
              <button className="danger" disabled={busy}>确认取消 / Confirm cancel</button>
            </form>
          </details>
        )}

        {!hasActions && <p className="subtext">当前状态下没有可执行的操作。/ No actions available in this state.</p>}
      </section>

      <section className="detail-section">
        <h3>回复流 / Replies ({ticket.replies.length})</h3>
        {ticket.replies.length === 0
          ? <p className="subtext">暂无回复。/ No replies yet.</p>
          : (
            <ul className="record-list">
              {ticket.replies.map((reply) => (
                <li key={reply.id} className="record">
                  <div className="record-head">
                    <strong>{reply.authorName}</strong>
                    <span className="subtext">{label(roleLabels, reply.authorRole)} · {formatDateTime(reply.createdAt)}</span>
                  </div>
                  <p className="long-text">{reply.content}</p>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="detail-section">
        <h3>转派轨迹 / Assignment trail ({ticket.assignments.length})</h3>
        {ticket.assignments.length === 0
          ? <p className="subtext">暂无分配或转派记录。/ No assignment records.</p>
          : (
            <ul className="record-list">
              {ticket.assignments.map((item) => (
                <li key={item.id} className="record">
                  <div className="record-head">
                    <strong>{label(assignmentKindLabels, item.kind)}</strong>
                    <span className="subtext">{formatDateTime(item.createdAt)}</span>
                  </div>
                  <span className="subtext">
                    {item.fromMemberName ? `来自 ${item.fromMemberName} · ` : ''}
                    {item.toMemberName ? `至处理人 ${item.toMemberName}` : '未指定处理人'}
                    {item.toGroupName ? ` · 业务组 ${item.toGroupName}` : ''}
                    {item.actorName ? ` · 操作人 ${item.actorName}` : ' · 系统自动'}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="detail-section">
        <h3>处理记录 / Processing record</h3>
        <div className="meta-grid">
          <div className="kv"><span>当前状态 / Status</span><strong>{label(statusLabels, ticket.status)}</strong></div>
          <div className="kv"><span>当前处理人 / Assignee</span><strong>{ticket.assigneeName ?? '—'}</strong></div>
          <div className="kv"><span>完成时间 / Completed at</span><strong>{formatDateTime(ticket.completedAt)}</strong></div>
          <div className="kv"><span>完成人 / Completed by</span><strong>{ticket.completedByName ?? '—'}</strong></div>
          <div className="kv"><span>取消时间 / Cancelled at</span><strong>{formatDateTime(ticket.cancelledAt)}</strong></div>
        </div>
      </section>

      <section className="detail-section">
        <h3>通知结果 / Notifications</h3>
        {notificationResult && (
          <Notice
            kind={notificationResult.status === 'success' ? 'success' : 'error'}
            text={`完成通知发送结果：${label(notificationStatusLabels, notificationResult.status)}${notificationResult.error ? ` · ${notificationResult.error}` : ''}`}
          />
        )}
        {ticket.notifications.length === 0
          ? <p className="subtext">暂无通知记录。/ No notification records.</p>
          : (
            <ul className="record-list">
              {ticket.notifications.map((item) => (
                <li key={item.id} className="record">
                  <div className="record-head">
                    <strong>{item.channel} → {item.recipientEmail}</strong>
                    <span className="subtext">{label(notificationStatusLabels, item.status)} · {formatDateTime(item.createdAt)}</span>
                  </div>
                  {item.error && <p className="error">{item.error}</p>}
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="detail-section">
        <h3>满意度评价 / Satisfaction</h3>
        {ticket.rating
          ? (
            <div className="record">
              <div className="record-head">
                <strong>{'★'.repeat(ticket.rating.score)}{'☆'.repeat(Math.max(0, 5 - ticket.rating.score))} ({ticket.rating.score}/5)</strong>
                <span className="subtext">{formatDateTime(ticket.rating.createdAt)}</span>
              </div>
              {ticket.rating.comment && <p className="long-text">{ticket.rating.comment}</p>}
            </div>
          )
          : canRate
            ? (
              <form className="action-form" onSubmit={(event) => void submitRating(event)}>
                <fieldset className="rating-scale">
                  <legend>评分 / Rating（1–5）</legend>
                  {[1, 2, 3, 4, 5].map((score) => (
                    <label key={score} className="rating-option">
                      <input type="radio" name="score" value={score} checked={ratingScore === score} onChange={() => setRatingScore(score)} required />
                      <span>{score}</span>
                    </label>
                  ))}
                </fieldset>
                <label>评价说明（可选）/ Comment (optional)
                  <textarea value={ratingComment} onChange={(event) => setRatingComment(event.currentTarget.value)} maxLength={1000} rows={3} />
                </label>
                <button disabled={busy || ratingScore < 1}>提交评价 / Submit rating</button>
              </form>
            )
            : <p className="subtext">工单完成并由提交人评价后，评价结果与时间显示在此处。/ Rating appears here after the submitter rates the completed ticket.</p>}
      </section>
    </div>
  )
}
