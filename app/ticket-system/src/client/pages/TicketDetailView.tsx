import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type {
  AuthUser,
  Group,
  LogEntry,
  SubmitterContext,
  Ticket,
  TicketDetail,
  UserBrief,
} from '../contract'
import { CATEGORY_OPTIONS } from '../contract'
import { ACTION_LABELS, formatDateTime, isActiveStatus } from '../labels'
import { useAsyncData, type AsyncHandle } from '../app/useAsyncData'
import {
  assignTicket,
  cancelTicket,
  claimTicket,
  completeTicket,
  fetchGroups,
  fetchSubmitterContext,
  fetchTicketDetail,
  fetchTicketLogs,
  fetchUsers,
  rateTicket,
  replyTicket,
  transferTicket,
} from '../api'
import { describeError } from '../platform/api-client'
import {
  Card,
  CategoryChip,
  DataState,
  Feedback,
  Field,
  PriorityBadge,
  StarPicker,
  Stars,
  StatusBadge,
  type FeedbackMessage,
} from '../components/ui'

export type DetailMode = 'workbench' | 'mine'
export type TicketActionName = 'claim' | 'reply' | 'transfer' | 'complete' | 'cancel' | 'assign' | 'rating'

// ---------------------------------------------------------------------------
// 处理视图（容器）：负责按契约取数与执行动作；页面级状态反馈集中在此。
// ---------------------------------------------------------------------------

export interface TicketDetailSectionProps {
  me: AuthUser
  mode: DetailMode
  ticketId: number
  onTicketChanged: () => void
  onOpenTicket: (ticketId: number) => void
  onBack?: () => void
  backLabel?: string
}

export function TicketDetailSection(props: TicketDetailSectionProps) {
  const { me, mode, ticketId, onTicketChanged } = props
  const detail = useAsyncData(() => fetchTicketDetail(ticketId), [ticketId])
  const logs = useAsyncData(() => fetchTicketLogs(ticketId), [ticketId])
  const submitterContext = useAsyncData(() => fetchSubmitterContext(ticketId), [ticketId], { enabled: mode === 'workbench' })
  const ticket = detail.phase === 'ready' ? detail.data.ticket : null
  const users = useAsyncData(() => fetchUsers(), [], {
    enabled: mode === 'workbench' && ticket?.status === 'pending_processing',
  })
  const groups = useAsyncData(() => fetchGroups(), [], {
    enabled: mode === 'workbench' && ticket?.status === 'pending_assignment',
  })
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null)
  const [busyAction, setBusyAction] = useState<TicketActionName | null>(null)

  useEffect(() => { setFeedback(null) }, [ticketId])

  const reloadDetail = () => {
    detail.reload()
    logs.reload()
    if (mode === 'workbench') submitterContext.reload()
  }

  const runAction = async (name: TicketActionName, action: () => Promise<void>): Promise<boolean> => {
    setBusyAction(name)
    setFeedback(null)
    try {
      await action()
      return true
    } catch (cause) {
      setFeedback({ tone: 'error', message: describeError(cause) })
      return false
    } finally {
      setBusyAction(null)
    }
  }

  const handleClaim = () =>
    runAction('claim', async () => {
      await claimTicket(ticketId)
      setFeedback({ tone: 'success', message: '已接单，当前处理责任归属你' })
      reloadDetail()
      onTicketChanged()
    })

  const handleReply = (content: string) =>
    runAction('reply', async () => {
      await replyTicket(ticketId, content)
      setFeedback({ tone: 'success', message: '回复已提交' })
      reloadDetail()
    })

  const handleTransfer = (targetUserId: number) =>
    runAction('transfer', async () => {
      await transferTicket(ticketId, targetUserId)
      const targetName = users.phase === 'ready'
        ? users.data.find((user) => user.id === targetUserId)?.displayName
        : undefined
      setFeedback({ tone: 'success', message: `已转派至 ${targetName ?? `用户 #${targetUserId}`}` })
      reloadDetail()
      onTicketChanged()
    })

  const handleComplete = (resolution: string) =>
    runAction('complete', async () => {
      const result = await completeTicket(ticketId, resolution)
      if (result.notification.sent) {
        setFeedback({ tone: 'success', message: '工单已完成，已向提交人发送通知邮件' })
      } else {
        setFeedback({
          tone: 'warning',
          message: `工单已完成，但邮件通知发送失败${result.notification.error !== null ? `：${result.notification.error}` : ''}`,
        })
      }
      reloadDetail()
      onTicketChanged()
    })

  const handleCancel = () =>
    runAction('cancel', async () => {
      await cancelTicket(ticketId)
      setFeedback({ tone: 'success', message: '工单已取消，不再进入处理流程' })
      reloadDetail()
      onTicketChanged()
    })

  const handleAssign = (groupId: number) =>
    runAction('assign', async () => {
      await assignTicket(ticketId, groupId)
      const groupName = groups.phase === 'ready' ? groups.data.find((group) => group.id === groupId)?.name : undefined
      setFeedback({ tone: 'success', message: `已分配至 ${groupName ?? `业务组 #${groupId}`}，工单进入待处理` })
      reloadDetail()
      onTicketChanged()
    })

  const handleRate = (score: number) =>
    runAction('rating', async () => {
      await rateTicket(ticketId, score)
      setFeedback({ tone: 'success', message: `已提交 ${score} 分满意度评价` })
      reloadDetail()
    })

  return (
    <TicketDetailView
      me={me}
      mode={mode}
      detail={detail}
      logs={logs}
      submitterContext={mode === 'workbench' ? submitterContext : null}
      users={mode === 'workbench' ? users : null}
      groups={mode === 'workbench' ? groups : null}
      feedback={feedback}
      busyAction={busyAction}
      onClaim={handleClaim}
      onReply={handleReply}
      onTransfer={handleTransfer}
      onComplete={handleComplete}
      onCancel={handleCancel}
      onAssign={handleAssign}
      onRate={handleRate}
      onOpenTicket={props.onOpenTicket}
      onBack={props.onBack}
      backLabel={props.backLabel}
    />
  )
}

// ---------------------------------------------------------------------------
// 处理视图（展示）：纯 props 驱动，便于用契约推导的 mock 数据核对渲染。
// ---------------------------------------------------------------------------

export interface TicketDetailViewProps {
  me: AuthUser
  mode: DetailMode
  detail: AsyncHandle<TicketDetail>
  logs: AsyncHandle<LogEntry[]>
  submitterContext: AsyncHandle<SubmitterContext> | null
  users: AsyncHandle<UserBrief[]> | null
  groups: AsyncHandle<Group[]> | null
  feedback: FeedbackMessage | null
  busyAction: TicketActionName | null
  onClaim: () => void
  onReply: (content: string) => Promise<boolean>
  onTransfer: (targetUserId: number) => void
  onComplete: (resolution: string) => void
  onCancel: () => void
  onAssign: (groupId: number) => void
  onRate: (score: number) => Promise<boolean>
  onOpenTicket: (ticketId: number) => void
  onBack?: () => void
  backLabel?: string
}

export function TicketDetailView(props: TicketDetailViewProps) {
  const groupsById = new Map<number, string>(
    props.groups !== null && props.groups.phase === 'ready' ? props.groups.data.map((group) => [group.id, group.name] as const) : [],
  )
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {props.onBack !== undefined && (
        <button type="button" className="btn-secondary self-start" onClick={props.onBack}>
          ← {props.backLabel ?? '返回列表'}
        </button>
      )}
      {props.feedback !== null && <Feedback tone={props.feedback.tone}>{props.feedback.message}</Feedback>}
      <DataState state={props.detail}>
        {(data) => (
          <>
            <TicketHeaderCard ticket={data.ticket} groupsById={groupsById} />
            {props.mode === 'workbench' && props.submitterContext !== null && (
              <SubmitterInfoCard context={props.submitterContext} onOpenTicket={props.onOpenTicket} />
            )}
            <ActionPanel
              me={props.me}
              mode={props.mode}
              ticket={data.ticket}
              users={props.users}
              groups={props.groups}
              busyAction={props.busyAction}
              onClaim={props.onClaim}
              onTransfer={props.onTransfer}
              onComplete={props.onComplete}
              onCancel={props.onCancel}
              onAssign={props.onAssign}
            />
            <ReplySection
              me={props.me}
              ticket={data.ticket}
              replies={data.replies}
              busyAction={props.busyAction}
              onReply={props.onReply}
            />
            <RatingSection
              me={props.me}
              ticket={data.ticket}
              rating={data.rating}
              busyAction={props.busyAction}
              onRate={props.onRate}
            />
            <LogsCard logs={props.logs} />
          </>
        )}
      </DataState>
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-slate-800" title={typeof value === 'string' ? value : undefined}>{value}</dd>
    </div>
  )
}

function TicketHeaderCard({ ticket, groupsById }: { ticket: Ticket; groupsById: Map<number, string> }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">#{ticket.id}</p>
          <h2 className="mt-0.5 text-lg font-semibold text-slate-900" title={ticket.subject}>{ticket.subject}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <CategoryChip category={ticket.category} />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-3">
        <MetaItem
          label="提交人"
          value={`${ticket.submitter.displayName} · ${ticket.submitter.companyName}${ticket.submitter.departmentName !== null ? ` · ${ticket.submitter.departmentName}` : ''}`}
        />
        <MetaItem label="提交人邮箱" value={ticket.submitter.email} />
        <MetaItem label="创建时间" value={formatDateTime(ticket.createdAt)} />
        <MetaItem label="更新时间" value={formatDateTime(ticket.updatedAt)} />
        <MetaItem
          label="分配业务组"
          value={ticket.assignedGroupId === null ? '未分配' : groupsById.get(ticket.assignedGroupId) ?? `业务组 #${ticket.assignedGroupId}`}
        />
        <MetaItem label="当前处理人" value={ticket.currentAssignee === null ? '未接单' : ticket.currentAssignee.displayName} />
        <MetaItem label="首次回复" value={formatDateTime(ticket.firstReplyAt)} />
        {ticket.completedBy !== null && <MetaItem label="处理完成人" value={ticket.completedBy.displayName} />}
        {ticket.completedAt !== null && <MetaItem label="完成时间" value={formatDateTime(ticket.completedAt)} />}
        {ticket.cancelledAt !== null && <MetaItem label="取消时间" value={formatDateTime(ticket.cancelledAt)} />}
      </dl>
      <div className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{ticket.description}</div>
    </Card>
  )
}

function SubmitterInfoCard({ context, onOpenTicket }: { context: AsyncHandle<SubmitterContext>; onOpenTicket: (ticketId: number) => void }) {
  return (
    <Card title="提交人信息（处理上下文）">
      <DataState state={context}>
        {(data) => (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-4">
              <MetaItem label="姓名" value={data.name} />
              <MetaItem label="邮箱" value={data.email} />
              <MetaItem label="公司" value={data.companyName} />
              <MetaItem label="部门" value={data.departmentName ?? '未分配部门'} />
            </dl>
            <h3 className="mt-4 mb-1 text-xs font-semibold text-slate-500">{`历史工单（${data.historyTickets.length}）`}</h3>
            {data.historyTickets.length === 0 ? (
              <p className="text-sm text-slate-400">该提交人暂无历史工单</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.historyTickets.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 py-2 text-left transition hover:text-indigo-600"
                      onClick={() => onOpenTicket(item.id)}
                      title={item.subject}
                    >
                      <span className="min-w-0 truncate text-sm text-slate-700">
                        <span className="text-slate-400">#{item.id}</span> {item.subject}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <CategoryChip category={item.category} />
                        <PriorityBadge priority={item.priority} />
                        <StatusBadge status={item.status} />
                        <span className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </DataState>
    </Card>
  )
}

function ActionRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-slate-100 pb-4 last:border-0 last:pb-0 sm:grid-cols-[190px_1fr] sm:items-center">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {hint !== undefined && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function ActionPanel(props: {
  me: AuthUser
  mode: DetailMode
  ticket: Ticket
  users: AsyncHandle<UserBrief[]> | null
  groups: AsyncHandle<Group[]> | null
  busyAction: TicketActionName | null
  onClaim: () => void
  onTransfer: (targetUserId: number) => void
  onComplete: (resolution: string) => void
  onCancel: () => void
  onAssign: (groupId: number) => void
}) {
  const { me, mode, ticket } = props
  const [transferTarget, setTransferTarget] = useState('')
  const [assignTarget, setAssignTarget] = useState('')
  const [resolution, setResolution] = useState('')
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const sameCompany = ticket.companyId === me.companyId
  const active = isActiveStatus(ticket.status)
  const isAssignee = ticket.currentAssignee !== null && ticket.currentAssignee.id === me.id
  const canClaim = sameCompany && mode === 'workbench' && ticket.status === 'pending_processing' && ticket.currentAssignee === null
  const canAssign = sameCompany && mode === 'workbench' && ticket.status === 'pending_assignment'
  const canTransfer = sameCompany && mode === 'workbench' && ticket.status === 'pending_processing' && isAssignee
  const canComplete = sameCompany && mode === 'workbench' && ticket.status === 'pending_processing' && (ticket.currentAssignee === null || isAssignee)
  const canCancel = sameCompany && active

  if (!canClaim && !canAssign && !canTransfer && !canComplete && !canCancel) {
    if (sameCompany) return null
    return (
      <Card title="处理操作">
        <p className="text-sm text-slate-500">跨公司视角下仅可查看该工单；工单操作仅限本公司。</p>
      </Card>
    )
  }

  return (
    <Card title="处理操作">
      <div className="space-y-4">
        {canClaim && (
          <ActionRow label="接单" hint="确立当前处理责任">
            <button type="button" className="btn-primary" disabled={props.busyAction !== null} onClick={props.onClaim}>
              {props.busyAction === 'claim' ? '接单中…' : '接单'}
            </button>
          </ActionRow>
        )}
        {canAssign && (
          <ActionRow label="人工分配到业务组" hint="自动分配未命中时的兜底路径">
            {props.groups !== null && props.groups.phase === 'ready' ? (
              <>
                <select
                  className="input-base w-56"
                  value={assignTarget}
                  onChange={(event) => setAssignTarget(event.currentTarget.value)}
                >
                  <option value="">选择业务组…</option>
                  {props.groups.data.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={props.busyAction !== null || assignTarget === ''}
                  onClick={() => { props.onAssign(Number(assignTarget)); setAssignTarget('') }}
                >
                  {props.busyAction === 'assign' ? '分配中…' : '分配'}
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-400">正在加载本公司业务组…</span>
            )}
          </ActionRow>
        )}
        {canTransfer && (
          <ActionRow label="转派给其他处理人" hint="处理责任随转派转移，并记录转派人、时间">
            {props.users !== null && props.users.phase === 'ready' ? (
              <>
                <select
                  className="input-base w-56"
                  value={transferTarget}
                  onChange={(event) => setTransferTarget(event.currentTarget.value)}
                >
                  <option value="">选择转派目标…</option>
                  {props.users.data
                    .filter((user) => user.id !== me.id)
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {`${user.displayName}（${user.departmentName ?? '未分配部门'}）`}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={props.busyAction !== null || transferTarget === ''}
                  onClick={() => { props.onTransfer(Number(transferTarget)); setTransferTarget('') }}
                >
                  {props.busyAction === 'transfer' ? '转派中…' : '转派'}
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-400">正在加载可转派用户…</span>
            )}
          </ActionRow>
        )}
        {canComplete && (
          <ActionRow label="完成处理" hint="完成后将向提交人邮箱发送通知邮件">
            <textarea
              className="input-base w-full sm:max-w-md"
              rows={2}
              maxLength={5000}
              placeholder="处理说明（可选，0-5000 字）"
              value={resolution}
              onChange={(event) => setResolution(event.currentTarget.value)}
            />
            <button type="button" className="btn-primary" disabled={props.busyAction !== null} onClick={() => props.onComplete(resolution)}>
              {props.busyAction === 'complete' ? '完成中…' : '完成处理'}
            </button>
          </ActionRow>
        )}
        {canCancel && (
          <ActionRow label="取消工单" hint="完成前可取消；取消后不再进入处理流程">
            {confirmingCancel ? (
              <>
                <span className="text-xs text-amber-700">确认取消？该操作不可恢复。</span>
                <button type="button" className="btn-danger" disabled={props.busyAction !== null} onClick={props.onCancel}>
                  {props.busyAction === 'cancel' ? '取消中…' : '确认取消'}
                </button>
                <button type="button" className="btn-secondary" disabled={props.busyAction !== null} onClick={() => setConfirmingCancel(false)}>
                  再想想
                </button>
              </>
            ) : (
              <button type="button" className="btn-danger" disabled={props.busyAction !== null} onClick={() => setConfirmingCancel(true)}>
                取消工单
              </button>
            )}
          </ActionRow>
        )}
      </div>
    </Card>
  )
}

function ReplySection(props: {
  me: AuthUser
  ticket: Ticket
  replies: TicketDetail['replies']
  busyAction: TicketActionName | null
  onReply: (content: string) => Promise<boolean>
}) {
  const [content, setContent] = useState('')
  const sameCompany = props.ticket.companyId === props.me.companyId
  const canReply = sameCompany && isActiveStatus(props.ticket.status)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = content.trim()
    if (trimmed === '') return
    const ok = await props.onReply(trimmed)
    if (ok) setContent('')
  }

  return (
    <Card title={`回复记录（${props.replies.length}）`}>
      {props.replies.length === 0 ? (
        <p className="text-sm text-slate-400">暂无回复</p>
      ) : (
        <ul className="space-y-3">
          {props.replies.map((reply) => (
            <li key={reply.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">
                  {reply.replier.displayName}
                  <span className="text-slate-400"> · {reply.replier.companyName}</span>
                </span>
                <span>{formatDateTime(reply.createdAt)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800">{reply.content}</p>
            </li>
          ))}
        </ul>
      )}
      {canReply ? (
        <form className="mt-4 space-y-2" onSubmit={(event) => { void submit(event) }}>
          <textarea
            className="input-base"
            rows={3}
            maxLength={5000}
            required
            placeholder="输入回复内容（1-5000 字），按时间先后显示在回复流中"
            value={content}
            onChange={(event) => setContent(event.currentTarget.value)}
          />
          <button type="submit" className="btn-primary" disabled={props.busyAction !== null}>
            {props.busyAction === 'reply' ? '发送中…' : '提交回复'}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-slate-400">
          {props.ticket.status === 'completed'
            ? '工单已完成，回复已关闭'
            : props.ticket.status === 'cancelled'
              ? '工单已取消，回复已关闭'
              : ''}
        </p>
      )}
    </Card>
  )
}

function RatingSection(props: {
  me: AuthUser
  ticket: Ticket
  rating: TicketDetail['rating']
  busyAction: TicketActionName | null
  onRate: (score: number) => Promise<boolean>
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const canRate =
    props.me.id === props.ticket.submitter.id && props.ticket.status === 'completed' && props.rating === null
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (picked === null) return
    void props.onRate(picked)
  }

  return (
    <Card title="满意度评价">
      {props.rating !== null ? (
        <div className="flex items-center gap-3">
          <Stars score={props.rating.score} />
          <span className="text-sm text-slate-600">
            {props.rating.score} / 5 分 · 评价于 {formatDateTime(props.rating.createdAt)}
          </span>
        </div>
      ) : canRate ? (
        <form className="flex flex-wrap items-center gap-3" onSubmit={submit}>
          <StarPicker value={picked} onChange={setPicked} disabled={props.busyAction !== null} />
          <span className="text-xs text-slate-400">暂未评价（提交人可评 1-5 分）</span>
          <button type="submit" className="btn-primary" disabled={props.busyAction !== null || picked === null}>
            {props.busyAction === 'rating' ? '提交中…' : '提交评价'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-400">
          {props.ticket.status === 'completed' ? '暂未评价（完成后可由提交人评价 1-5 分）' : '工单完成后可由提交人评价'}
        </p>
      )}
    </Card>
  )
}

function LogsCard({ logs }: { logs: AsyncHandle<LogEntry[]> }) {
  return (
    <Card title="操作日志">
      <DataState state={logs} isEmpty={(items) => items.length === 0} empty="该工单暂无操作日志">
        {(items) => (
          <ol className="space-y-2">
            {items.map((entry) => (
              <li key={entry.id} className="flex gap-3 text-sm">
                <span className="w-36 shrink-0 text-xs text-slate-400">{formatDateTime(entry.createdAt)}</span>
                <span className="w-20 shrink-0 font-medium text-slate-600">{ACTION_LABELS[entry.action]}</span>
                <span className="w-24 shrink-0 truncate text-slate-600" title={entry.actor === 'system' ? '系统' : entry.actor.displayName}>
                  {entry.actor === 'system' ? '系统' : entry.actor.displayName}
                </span>
                <span className="min-w-0 flex-1 text-slate-500">{entry.detail}</span>
              </li>
            ))}
          </ol>
        )}
      </DataState>
    </Card>
  )
}
