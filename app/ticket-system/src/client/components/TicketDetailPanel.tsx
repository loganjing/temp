// 工单详情面板：提交人信息卡、历史工单、回复时间线、日志视图，
// 按角色渲染回复 / 转派 / 完成 / 取消 / 评价操作。
// 角色与数据域校验在服务端；本组件只做角色渲染（按契约第 8 节）。
import { useEffect, useState, type FormEvent } from 'react'
import {
  addReply,
  cancelTicket,
  completeTicket,
  getTicket,
  listTicketLogs,
  rateSatisfaction,
  transferTicket,
} from '../api/tickets'
import { useAuth } from '../App'
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  inputClass,
  PriorityBadge,
  Skeleton,
  Spinner,
  StarRating,
  StatusBadge,
  SuccessNote,
} from './ui'
import {
  IconArrowLeftRight,
  IconBuilding2,
  IconCheckCircle2,
  IconHistory,
  IconMail,
  IconMessageSquare,
  IconSend,
  IconStar,
  IconUser,
  IconXCircle,
} from './icons'
import {
  actionLabel,
  emailStatusLabel,
  formatDateTime,
  sideLabels,
} from '../contracts/labels'
import type { TicketDetail } from '../contracts/types'
import { useAsync, errorMessage } from '../hooks/useAsync'
import { ApiRequestError } from '../platform/api-client'

const CANCELLABLE_STATUSES = ['created', 'pending_assignment', 'in_progress'] as const

export interface TicketDetailPanelProps {
  ticketId: number
  layout?: 'page' | 'panel'
  /** 工单状态或回复变化后通知父级（如刷新工作台队列）。 */
  onChanged?: () => void
}

export function TicketDetailPanel({ ticketId, layout = 'page', onChanged }: TicketDetailPanelProps) {
  const { user } = useAuth()
  const detail = useAsync<TicketDetail>(
    async () => {
      try {
        return await getTicket(ticketId)
      } catch (cause) {
        // 越权或不存在统一为资源隐藏（契约 404），转换为用户可读文案。
        if (cause instanceof ApiRequestError && cause.status === 404) {
          throw new Error('工单不存在或无权访问')
        }
        throw cause
      }
    },
    [ticketId],
  )
  const logs = useAsync(() => listTicketLogs(ticketId), [ticketId])

  const [replyText, setReplyText] = useState('')
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferGroupId, setTransferGroupId] = useState('')
  const [ratingValue, setRatingValue] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [busy, setBusy] = useState<'reply' | 'transfer' | 'complete' | 'cancel' | 'rate' | null>(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setReplyText('')
    setTransferOpen(false)
    setTransferGroupId('')
    setRatingValue(0)
    setRatingComment('')
    setActionError('')
    setNotice('')
  }, [ticketId])

  const reloadAll = () => {
    detail.reload()
    logs.reload()
    onChanged?.()
  }

  const submitReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = replyText.trim()
    if (!content) return
    setBusy('reply')
    setActionError('')
    setNotice('')
    try {
      await addReply(ticketId, content)
      setReplyText('')
      setNotice('回复已发送')
      reloadAll()
    } catch (cause) {
      setActionError(errorMessage(cause, '回复失败'))
    } finally {
      setBusy(null)
    }
  }

  const submitTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const targetGroupId = Number(transferGroupId)
    if (!Number.isInteger(targetGroupId) || targetGroupId <= 0) {
      setActionError('请输入有效的目标业务组 ID')
      return
    }
    setBusy('transfer')
    setActionError('')
    setNotice('')
    try {
      await transferTicket(ticketId, targetGroupId)
      setTransferOpen(false)
      setTransferGroupId('')
      setNotice(`已转派至业务组 #${targetGroupId}`)
      reloadAll()
    } catch (cause) {
      setActionError(errorMessage(cause, '转派失败'))
    } finally {
      setBusy(null)
    }
  }

  const submitComplete = async () => {
    if (!window.confirm('确认将该工单标记为完成？完成后将向提交人邮箱发送通知邮件。')) return
    setBusy('complete')
    setActionError('')
    setNotice('')
    try {
      const result = await completeTicket(ticketId)
      const email = result.emailLog
      setNotice(
        `工单已完成。完成通知邮件（${email.toEmail}）：${emailStatusLabel(email.status)}${
          email.error ? ` — ${email.error}` : ''
        }`,
      )
      reloadAll()
    } catch (cause) {
      setActionError(errorMessage(cause, '完成操作失败'))
    } finally {
      setBusy(null)
    }
  }

  const submitCancel = async () => {
    if (!window.confirm('确认取消该工单？取消后进入终态，无法再流转。')) return
    setBusy('cancel')
    setActionError('')
    setNotice('')
    try {
      await cancelTicket(ticketId)
      setNotice('工单已取消')
      reloadAll()
    } catch (cause) {
      setActionError(errorMessage(cause, '取消操作失败'))
    } finally {
      setBusy(null)
    }
  }

  const submitRating = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (ratingValue < 1) {
      setActionError('请先选择满意度评分（1-5 星）')
      return
    }
    setBusy('rate')
    setActionError('')
    setNotice('')
    try {
      await rateSatisfaction(ticketId, ratingValue, ratingComment.trim())
      setRatingValue(0)
      setRatingComment('')
      setNotice('评价已提交')
      reloadAll()
    } catch (cause) {
      setActionError(errorMessage(cause, '评价提交失败'))
    } finally {
      setBusy(null)
    }
  }

  if (detail.loading && !detail.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (detail.error || !detail.data) {
    return <ErrorBanner message={detail.error ?? '工单加载失败'} />
  }

  const { ticket, submitter, submitterHistory, replies, satisfaction, emailLog } = detail.data
  const isAgent = user.role === 'agent'
  const isSubmitter = user.role === 'submitter'
  const isAdmin = user.role === 'admin'
  const canTransfer = isAgent && ticket.status === 'in_progress'
  const canComplete = isAgent && ticket.status === 'in_progress'
  const canCancel =
    (isSubmitter || isAdmin) && CANCELLABLE_STATUSES.includes(ticket.status as (typeof CANCELLABLE_STATUSES)[number])
  const canRate = isSubmitter && ticket.status === 'completed' && !satisfaction

  const mainSections = (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-slate-500">{ticket.ticketNo}</span>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <span className="text-xs text-slate-400">
            创建于{' '}
            <span title={ticket.createdAt}>{formatDateTime(ticket.createdAt)}</span>
          </span>
        </div>
        <h2 className="text-lg font-semibold break-words text-slate-900" title={ticket.subject}>
          {ticket.subject}
        </h2>
        <p className="text-xs text-slate-500">
          {ticket.categoryName} · {ticket.companyName} · 提交人 {ticket.submitterName}
        </p>
      </div>

      <SuccessNote message={notice || null} />
      <ErrorBanner message={actionError || null} />

      {(canTransfer || canComplete || canCancel) && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {canComplete && (
              <Button onClick={() => void submitComplete()} disabled={busy !== null}>
                {busy === 'complete' ? <Spinner /> : <IconCheckCircle2 />}
                标记完成
              </Button>
            )}
            {canTransfer && (
              <Button variant="secondary" onClick={() => setTransferOpen((open) => !open)} disabled={busy !== null}>
                <IconArrowLeftRight />
                转派
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" onClick={() => void submitCancel()} disabled={busy !== null}>
                {busy === 'cancel' ? <Spinner /> : <IconXCircle />}
                取消工单
              </Button>
            )}
          </div>
          {transferOpen && canTransfer && (
            <form onSubmit={(event) => void submitTransfer(event)} className="flex flex-wrap items-end gap-2">
              <Field label="目标业务组 ID" className="w-48" hint="同公司的其他业务组；ID 可在分配配置页查看">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={transferGroupId}
                  onChange={(event) => setTransferGroupId(event.currentTarget.value)}
                  placeholder="如 12"
                />
              </Field>
              <Button type="submit" disabled={busy !== null}>
                {busy === 'transfer' ? <Spinner /> : <IconArrowLeftRight />}
                确认转派
              </Button>
            </form>
          )}
        </div>
      )}

      <Card title="问题描述">
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-slate-700">
          {ticket.description}
        </p>
      </Card>

      <Card title="处理记录" description="处理人与处理时间（由服务端记录）">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm lg:grid-cols-3">
          <div>
            <dt className="text-xs text-slate-500">当前业务组</dt>
            <dd className="mt-0.5 text-slate-800">{ticket.assignedGroupName ?? '待分配（无匹配规则）'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">处理人</dt>
            <dd className="mt-0.5 text-slate-800">{ticket.completedByName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">完成时间</dt>
            <dd className="mt-0.5 text-slate-800" title={ticket.completedAt ?? undefined}>
              {formatDateTime(ticket.completedAt)}
            </dd>
          </div>
          {ticket.cancelledByName && (
            <div>
              <dt className="text-xs text-slate-500">取消人</dt>
              <dd className="mt-0.5 text-slate-800">{ticket.cancelledByName}</dd>
            </div>
          )}
          {ticket.cancelledAt && (
            <div>
              <dt className="text-xs text-slate-500">取消时间</dt>
              <dd className="mt-0.5 text-slate-800" title={ticket.cancelledAt}>
                {formatDateTime(ticket.cancelledAt)}
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <Card title="满意度评价">
        {satisfaction ? (
          <div className="space-y-1.5">
            <StarRating rating={satisfaction.rating} />
            <p className="text-xs text-slate-500">
              评分 {satisfaction.rating} / 5 · 评价于{' '}
              <span title={satisfaction.ratedAt}>{formatDateTime(satisfaction.ratedAt)}</span>
            </p>
            {satisfaction.comment && (
              <p className="text-sm break-words text-slate-700">{satisfaction.comment}</p>
            )}
          </div>
        ) : canRate ? (
          <form onSubmit={(event) => void submitRating(event)} className="space-y-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-600">
                满意度评分（1-5 星）<span className="ml-0.5 text-rose-500">*</span>
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${value} 星`}
                    className="rounded p-1 text-2xl text-amber-400 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                    onClick={() => setRatingValue(value)}
                  >
                    <IconStar {...(value <= ratingValue ? { fill: 'currentColor' } : { fill: 'none' })} />
                  </button>
                ))}
                {ratingValue > 0 && <span className="ml-2 text-sm text-slate-600">{ratingValue} 分</span>}
              </div>
            </div>
            <Field label="评价留言（可选）">
              <textarea
                className={`${inputClass} min-h-20`}
                maxLength={500}
                value={ratingComment}
                onChange={(event) => setRatingComment(event.currentTarget.value)}
                placeholder="对本次处理的其他反馈"
              />
            </Field>
            <Button type="submit" disabled={busy !== null}>
              {busy === 'rate' ? <Spinner /> : <IconStar />}
              提交评价
            </Button>
          </form>
        ) : (
          <p className="text-sm text-slate-500">
            {ticket.status === 'completed' ? '该工单暂未评价' : '工单完成后可提交满意度评价'}
          </p>
        )}
      </Card>

      <Card
        title={`回复时间线（${replies.length}）`}
        description="提交人与处理人的多轮沟通记录"
        actions={<IconMessageSquare className="size-4 text-slate-400" />}
      >
        {replies.length === 0 ? (
          <p className="text-sm text-slate-500">暂无回复</p>
        ) : (
          <ol className="space-y-4">
            {replies.map((reply) => (
              <li key={reply.id} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-medium text-slate-600">
                  {reply.authorName.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{reply.authorName}</span>
                    <Badge
                      tone={
                        reply.authorSide === 'submitter'
                          ? 'bg-slate-100 text-slate-600 ring-slate-300'
                          : 'bg-blue-50 text-blue-700 ring-blue-300'
                      }
                    >
                      {sideLabels[reply.authorSide]}
                    </Badge>
                    <span className="text-xs text-slate-400" title={reply.createdAt}>
                      {formatDateTime(reply.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap text-slate-700">
                    {reply.content}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <form onSubmit={(event) => void submitReply(event)} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          <Field label="添加回复">
            <textarea
              className={`${inputClass} min-h-20`}
              maxLength={5000}
              value={replyText}
              onChange={(event) => setReplyText(event.currentTarget.value)}
              placeholder="输入回复内容…"
            />
          </Field>
          <Button type="submit" disabled={busy !== null || !replyText.trim()}>
            {busy === 'reply' ? <Spinner /> : <IconSend />}
            发送回复
          </Button>
        </form>
      </Card>

      <Card
        title={`操作日志（${logs.data?.total ?? 0}）`}
        description="创建、分配、状态变更、转派、回复、完成、取消、评价等关键操作"
        actions={<IconHistory className="size-4 text-slate-400" />}
      >
        {logs.loading && !logs.data ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : logs.error ? (
          <ErrorBanner message={logs.error} />
        ) : !logs.data || logs.data.items.length === 0 ? (
          <p className="text-sm text-slate-500">暂无日志</p>
        ) : (
          <ol className="space-y-4">
            {logs.data.items.map((log) => (
              <li key={log.id} className="relative flex gap-3 pl-1">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{actionLabel(log.action)}</span>
                    <span className="text-xs text-slate-500">操作人 {log.operatorName}</span>
                    <span className="text-xs text-slate-400" title={log.createdAt}>
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                  {log.detail && (
                    <p className="mt-0.5 text-xs break-words text-slate-500" title={log.detail}>
                      {log.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {logs.data && logs.data.items.length < logs.data.total && (
          <p className="mt-3 text-xs text-slate-400">共 {logs.data.total} 条，仅显示最近 {logs.data.items.length} 条</p>
        )}
      </Card>
    </>
  )

  const sideSections = (
    <>
      <Card title="提交人信息" actions={<IconUser className="size-4 text-slate-400" />}>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <IconUser className="size-4 shrink-0 text-slate-400" />
            <span className="font-medium text-slate-800">{submitter.displayName}</span>
          </div>
          <div className="flex items-center gap-2">
            <IconMail className="size-4 shrink-0 text-slate-400" />
            <span className="min-w-0 break-all text-slate-700" title={submitter.email}>
              {submitter.email}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <IconBuilding2 className="size-4 shrink-0 text-slate-400" />
            <span className="text-slate-700">{submitter.companyName}</span>
          </div>
          <div>
            <dt className="text-xs text-slate-500">部门</dt>
            <dd className="mt-0.5 text-slate-800">{submitter.department || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">历史工单</dt>
            <dd className="mt-0.5 text-slate-800">共 {submitter.historyTotal} 张</dd>
          </div>
        </dl>
      </Card>

      <Card title={`历史工单（${submitterHistory.length} / ${submitter.historyTotal}）`}>
        {submitterHistory.length === 0 ? (
          <p className="text-sm text-slate-500">该提交人暂无历史工单</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {submitterHistory.map((item) => (
              <li key={item.ticketNo} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-slate-500">{item.ticketNo}</span>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-0.5 truncate text-sm text-slate-700" title={item.subject}>
                  {item.subject}
                </p>
                <p className="mt-0.5 text-xs text-slate-400" title={item.createdAt}>
                  {formatDateTime(item.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {emailLog && (
        <Card title="完成通知邮件" description="提交人邮箱的发送记录">
          <div className="space-y-2 text-sm">
            <p className="break-all text-slate-700">
              收件人：<span title={emailLog.toEmail}>{emailLog.toEmail}</span>
            </p>
            <p>
              状态：
              <Badge
                tone={
                  emailLog.status === 'sent'
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-300'
                    : emailLog.status === 'failed'
                      ? 'bg-rose-50 text-rose-700 ring-rose-300'
                      : 'bg-slate-100 text-slate-600 ring-slate-300'
                }
              >
                {emailStatusLabel(emailLog.status)}
              </Badge>
            </p>
            <p className="text-xs text-slate-500" title={emailLog.sentAt}>
              发送时间：{formatDateTime(emailLog.sentAt)}
            </p>
          </div>
        </Card>
      )}
    </>
  )

  return layout === 'page' ? (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">{mainSections}</div>
      <div className="space-y-5">{sideSections}</div>
    </div>
  ) : (
    <div className="space-y-5">
      {mainSections}
      {sideSections}
    </div>
  )
}
