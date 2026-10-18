import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../domain/api'
import { IDEMPOTENCY_KEY_PREFIX } from '../domain/constants'
import { errorText, formatDateTime, localizedName, localizedUser, subjectOf } from '../domain/format'
import { useAsync } from '../domain/hooks'
import { PRIORITIES, type TimelineItem, type TicketDetail as TicketDetailModel } from '../domain/types'
import { useLocale, usePlatformText } from '../platform/i18n'
import { useSession } from '../platform/session'
import { Icon } from './icons'
import { ConfirmModal, TicketActionModals, type ActionKind } from './TicketActionModals'
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PriorityBadge,
  Select,
  SlaBadgeView,
  StatusBadge,
  Textarea,
  useToast,
} from './ui'

type ConfirmKind = 'submit' | 'deleteDraft' | 'confirmResolve' | null

const REPLY_KIND_BADGE: Record<string, string> = {
  normal: 'bg-slate-100 text-slate-600',
  resolution: 'bg-emerald-50 text-emerald-700',
  rejection: 'bg-red-50 text-red-700',
}

export interface TicketDetailProps {
  ticketId: number
  embedded?: boolean
  onUpdated?: () => void
  onClose?: () => void
}

function Avatar({ name }: { name?: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
      {(name ?? '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

function activityLabel(action: string | null | undefined, t: (key: string) => string): string {
  if (!action) return ''
  const key = `activity.action.${action}`
  const translated = t(key)
  return translated === key ? action : translated
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const t = usePlatformText()
  const { locale } = useLocale()
  const isReply = item.kind === 'reply'
  const replyKind = isReply && item.action && REPLY_KIND_BADGE[item.action] ? item.action : null

  if (isReply) {
    return (
      <div className="flex gap-3 px-5 py-4">
        <Avatar name={item.author ? localizedUser(item.author, locale) : undefined} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-700">
              {item.author ? localizedUser(item.author, locale) : '—'}
            </span>
            {replyKind && (
              <span className={`rounded-full px-2 py-0.5 text-xs ${REPLY_KIND_BADGE[replyKind]}`}>
                {t(`reply.kind.${replyKind}`)}
              </span>
            )}
            <span className="text-xs text-slate-400">{formatDateTime(item.occurredAt)}</span>
          </div>
          {item.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{item.body}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 px-5 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon name="document" className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="text-sm font-medium text-slate-700">{activityLabel(item.action, t)}</span>
          {item.author && <span>{localizedUser(item.author, locale)}</span>}
          <span>{formatDateTime(item.occurredAt)}</span>
          {item.source && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5">{t(`activity.source.${item.source}`)}</span>
          )}
        </div>
        {(item.fromStatus || item.toStatus) && (
          <div className="flex flex-wrap items-center gap-1">
            {item.fromStatus && <StatusBadge status={item.fromStatus} label={t(`ticket.status.${item.fromStatus}`)} />}
            {item.fromStatus && item.toStatus && <Icon name="chevronRight" className="h-3 w-3 text-slate-300" />}
            {item.toStatus && <StatusBadge status={item.toStatus} label={t(`ticket.status.${item.toStatus}`)} />}
          </div>
        )}
        {item.fieldChanges?.map((change) => (
          <div key={change.field} className="text-xs text-slate-500">
            {change.field}: <span className="line-through">{change.oldValue || '—'}</span> → {change.newValue || '—'}
          </div>
        ))}
        {item.body && <p className="whitespace-pre-wrap break-words text-sm text-slate-600">{item.body}</p>}
      </div>
    </div>
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-700">{children}</dd>
    </div>
  )
}

/** 工单详情：合并时间线倒序 + 全部处理动作（标准工作台与嵌入式工作台共用） */
export function TicketDetail({ ticketId, embedded = false, onUpdated, onClose }: TicketDetailProps) {
  const t = usePlatformText()
  const { locale } = useLocale()
  const { me } = useSession()
  const toast = useToast()
  const navigate = useNavigate()

  const [version, setVersion] = useState(0)
  const detail = useAsync(() => api.getTicket(ticketId), [ticketId, version])
  const timeline = useAsync(() => api.timeline(ticketId), [ticketId, version])
  const categories = useAsync(api.categoryOptions, [])

  const [activeModal, setActiveModal] = useState<ActionKind | null>(null)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null)
  const [busy, setBusy] = useState(false)
  const [replyBody, setReplyBody] = useState('')

  function bump() {
    setVersion((value) => value + 1)
    onUpdated?.()
  }

  async function run(fn: () => Promise<unknown>, successKey: string) {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      toast.success(t(successKey))
      setConfirmKind(null)
      bump()
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  async function submitDraft() {
    if (busy) return
    setBusy(true)
    try {
      const slot = `${IDEMPOTENCY_KEY_PREFIX}${ticketId}`
      let key: string
      try {
        key = localStorage.getItem(slot) ?? crypto.randomUUID()
        localStorage.setItem(slot, key)
      } catch {
        key = crypto.randomUUID()
      }
      const result = await api.submitDraft(ticketId, key)
      try {
        localStorage.removeItem(slot)
      } catch {
        /* 忽略存储不可用 */
      }
      toast.success(
        result.assignment.result === 'assigned'
          ? t('form.submitAssigned', {
              person: result.assignment.assignee ? localizedUser(result.assignment.assignee, locale) : '',
            })
          : t('form.submitPending'),
      )
      setConfirmKind(null)
      bump()
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  async function deleteDraft() {
    await run(() => api.deleteDraft(ticketId), 'detail.deleteDraft.success')
    if (!embedded) navigate('/tickets', { replace: true })
  }

  async function sendReply() {
    if (!replyBody.trim() || busy) return
    setBusy(true)
    try {
      await api.reply(ticketId, replyBody.trim())
      setReplyBody('')
      toast.success(t('detail.reply.success'))
      bump()
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
    } finally {
      setBusy(false)
    }
  }

  async function changeCategory(nextCategoryId: number) {
    if (busy || !detail.data || nextCategoryId === detail.data.category.id) return
    setBusy(true)
    try {
      await api.changeCategory(ticketId, nextCategoryId)
      toast.success(t('detail.changeCategory.success'))
      bump()
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
      bump()
    } finally {
      setBusy(false)
    }
  }

  async function changePriority(nextPriority: string) {
    if (busy || !detail.data || nextPriority === detail.data.priority) return
    setBusy(true)
    try {
      await api.changePriority(ticketId, nextPriority as (typeof PRIORITIES)[number])
      toast.success(t('detail.changePriority.success'))
      bump()
    } catch (error) {
      toast.error(errorText(error, t('common.error.generic')))
      bump()
    } finally {
      setBusy(false)
    }
  }

  if (detail.loading) return <LoadingBlock label={t('common.loading')} />
  if (detail.error) return <ErrorBlock error={detail.error} onRetry={detail.reload} retryLabel={t('common.retry')} />
  const ticket = detail.data
  if (!ticket) return <EmptyBlock label={t('common.empty')} />

  // 契约 can 未含 start 标志：按「当前处理人 + 已分配」推断展示开始处理入口，服务端独立校验
  const canStart = ticket.status === 'assigned' && me?.id === ticket.assignee?.id
  const timelineItems = timeline.data?.items ?? []

  return (
    <div className="min-h-full space-y-4 p-4">
      {embedded && onClose && (
        <Button icon="arrowLeft" onClick={onClose}>
          {t('common.back')}
        </Button>
      )}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-mono">{ticket.ticketNo ?? t('detail.draftNo')}</span>
              <StatusBadge status={ticket.status} label={t(`ticket.status.${ticket.status}`)} />
              <PriorityBadge priority={ticket.priority} label={t(`ticket.priority.${ticket.priority}`)} />
            </div>
            <h2 className="break-words text-lg font-semibold text-slate-800" title={subjectOf(ticket, locale)}>
              {subjectOf(ticket, locale)}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!embedded && ticket.can.editDraft && (
              <Button icon="edit" onClick={() => navigate(`/tickets/${ticket.id}/edit`)}>
                {t('detail.editDraft')}
              </Button>
            )}
            {ticket.can.submit && (
              <Button variant="primary" onClick={() => setConfirmKind('submit')}>
                {t('form.submit')}
              </Button>
            )}
            {ticket.can.deleteDraft && (
              <Button variant="danger" icon="trash" onClick={() => setConfirmKind('deleteDraft')}>
                {t('common.delete')}
              </Button>
            )}
            {canStart && (
              <Button icon="clock" onClick={() => void run(() => api.start(ticketId), 'detail.startSuccess')}>
                {t('detail.start')}
              </Button>
            )}
            {ticket.can.resolve && (
              <Button variant="primary" onClick={() => setActiveModal('resolve')}>
                {t('detail.resolve.title')}
              </Button>
            )}
            {ticket.can.confirm && (
              <Button variant="primary" icon="check" onClick={() => setConfirmKind('confirmResolve')}>
                {t('detail.confirmResolve')}
              </Button>
            )}
            {ticket.can.reject && (
              <Button onClick={() => setActiveModal('reject')}>{t('detail.reject.title')}</Button>
            )}
            {ticket.can.hold && <Button onClick={() => setActiveModal('hold')}>{t('detail.hold.title')}</Button>}
            {ticket.can.resume && (
              <Button onClick={() => void run(() => api.resume(ticketId), 'detail.resumeSuccess')}>
                {t('detail.resume')}
              </Button>
            )}
            {ticket.can.cancel && (
              <Button variant="danger" onClick={() => setActiveModal('cancel')}>
                {t('detail.cancelTicket.title')}
              </Button>
            )}
            {ticket.can.assign && <Button onClick={() => setActiveModal('assign')}>{t('detail.assign.title')}</Button>}
            {ticket.can.transfer && (
              <Button onClick={() => setActiveModal('transfer')}>{t('detail.transfer.title')}</Button>
            )}
            {ticket.can.rate && (
              <Button icon="star" onClick={() => setActiveModal('rating')}>
                {t('detail.rating.title')}
              </Button>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-3">
          <Meta label={t('common.category')}>
            {ticket.can.changeCategory ? (
              <Select
                value={ticket.category.id}
                disabled={busy}
                onChange={(event) => void changeCategory(Number(event.target.value))}
                className="w-44"
              >
                {(categories.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {localizedName(category, locale)}
                  </option>
                ))}
              </Select>
            ) : (
              <span>{localizedName(ticket.category, locale)}</span>
            )}
          </Meta>
          <Meta label={t('common.subCategory')}>
            <span>{ticket.subCategory ? localizedName(ticket.subCategory, locale) : '—'}</span>
          </Meta>
          <Meta label={t('common.priority')}>
            {ticket.can.changePriority ? (
              <Select
                value={ticket.priority}
                disabled={busy}
                onChange={(event) => void changePriority(event.target.value)}
                className="w-44"
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {t(`ticket.priority.${priority}`)}
                  </option>
                ))}
              </Select>
            ) : (
              <span>{t(`ticket.priority.${ticket.priority}`)}</span>
            )}
          </Meta>
          <Meta label={t('tickets.col.requester')}>
            <span>{localizedUser(ticket.requester, locale)}</span>
          </Meta>
          <Meta label={t('tickets.col.assignee')}>
            <span>{ticket.assignee ? localizedUser(ticket.assignee, locale) : '—'}</span>
          </Meta>
          <Meta label={t('common.team')}>
            <span>{ticket.team ? localizedName(ticket.team, locale) : '—'}</span>
          </Meta>
          <Meta label={t('common.department')}>
            <span>{ticket.department ? localizedName(ticket.department, locale) : '—'}</span>
          </Meta>
          <Meta label={t('common.createdAt')}>
            <span>{formatDateTime(ticket.createdAt)}</span>
          </Meta>
          <Meta label={t('common.updatedAt')}>
            <span>{formatDateTime(ticket.updatedAt)}</span>
          </Meta>
          <Meta label={t('detail.submittedAt')}>
            <span>{formatDateTime(ticket.submittedAt)}</span>
          </Meta>
          <Meta label={t('detail.firstResponseAt')}>
            <span>{formatDateTime(ticket.firstResponseAt)}</span>
          </Meta>
          <Meta label={t('detail.resolvedAt')}>
            <span>{formatDateTime(ticket.resolvedAt)}</span>
          </Meta>
          <Meta label={t('detail.closedAt')}>
            <span>{formatDateTime(ticket.closedAt)}</span>
          </Meta>
        </dl>
        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 px-5 py-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-slate-400">{t('sla.firstResponse')}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <SlaBadgeView badge={ticket.slaFirstResponse} />
              {ticket.slaFirstResponseDeadline && (
                <span className="text-xs text-slate-500">{formatDateTime(ticket.slaFirstResponseDeadline)}</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-400">{t('sla.resolution')}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <SlaBadgeView badge={ticket.slaResolution} />
              {ticket.slaResolutionDeadline && (
                <span className="text-xs text-slate-500">{formatDateTime(ticket.slaResolutionDeadline)}</span>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="mb-1 text-xs font-medium text-slate-400">{t('form.description')}</div>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{ticket.description}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">
          {t('detail.timeline')}
        </div>
        <div className="divide-y divide-slate-100">
          {timeline.loading ? (
            <LoadingBlock label={t('common.loading')} />
          ) : timeline.error ? (
            <ErrorBlock error={timeline.error} onRetry={timeline.reload} retryLabel={t('common.retry')} />
          ) : timelineItems.length === 0 ? (
            <EmptyBlock label={t('detail.timelineEmpty')} />
          ) : (
            timelineItems.map((item, index) => (
              <TimelineRow key={`${item.kind}-${item.occurredAt}-${index}`} item={item} />
            ))
          )}
        </div>
        {ticket.can.reply && (
          <div className="border-t border-slate-100 p-4">
            <Textarea
              rows={3}
              value={replyBody}
              placeholder={t('detail.reply.placeholder')}
              onChange={(event) => setReplyBody(event.target.value)}
            />
            <div className="mt-2 flex justify-end">
              <Button variant="primary" icon="message" disabled={!replyBody.trim() || busy} onClick={() => void sendReply()}>
                {t('detail.reply.submit')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmKind === 'submit'}
        title={t('form.submit')}
        message={t('detail.submitDraftConfirm')}
        confirmLabel={t('form.submit')}
        busy={busy}
        onConfirm={() => void submitDraft()}
        onClose={() => setConfirmKind(null)}
      />
      <ConfirmModal
        open={confirmKind === 'deleteDraft'}
        title={t('common.delete')}
        message={t('detail.deleteDraftConfirm')}
        confirmLabel={t('common.delete')}
        danger
        busy={busy}
        onConfirm={() => void deleteDraft()}
        onClose={() => setConfirmKind(null)}
      />
      <ConfirmModal
        open={confirmKind === 'confirmResolve'}
        title={t('detail.confirmResolve')}
        message={t('detail.confirmResolveMessage')}
        confirmLabel={t('detail.confirmResolve')}
        busy={busy}
        onConfirm={() => void run(() => api.confirm(ticketId), 'detail.confirmResolveSuccess')}
        onClose={() => setConfirmKind(null)}
      />
      <TicketActionModals
        ticket={ticket as TicketDetailModel}
        active={activeModal}
        onClose={() => setActiveModal(null)}
        onChanged={() => {
          setActiveModal(null)
          bump()
        }}
      />
    </div>
  )
}
