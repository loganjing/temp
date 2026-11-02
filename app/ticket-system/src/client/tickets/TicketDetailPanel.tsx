import { readList } from '../platform/api-client'
import { isForbidden, isNotFound } from '../platform/errors'
import { useApiResource } from '../platform/use-api'
import { ErrorNotice, ForbiddenNotice, LoadingBlock, NotFoundNotice } from '../components/Feedback'
import TicketDetailView, { type TicketDetailData } from './TicketDetailView'
import type {
  BusinessGroup,
  CurrentUser,
  SubmitterProfile,
  TicketDetail,
  TicketEvent,
  TicketNotification,
  TicketReply,
} from './types'

type ListResponse<T> = T[] | { items: T[] }

type Props = {
  ticketId: string
  currentUser: CurrentUser
  initialNotice?: string
  onClose?: () => void
  onChanged?: () => void
}

export default function TicketDetailPanel({ ticketId, currentUser, initialNotice, onClose, onChanged }: Props) {
  const base = `/api/tickets/${encodeURIComponent(ticketId)}`
  const canReadRelated = currentUser.role !== 'submitter'
  const canHandle = currentUser.role === 'handler' || currentUser.role === 'admin'

  const detail = useApiResource<TicketDetail>(base)
  const replies = useApiResource<ListResponse<TicketReply>>(`${base}/replies`)
  const events = useApiResource<ListResponse<TicketEvent>>(`${base}/events`)
  const groups = useApiResource<ListResponse<BusinessGroup>>(canHandle ? '/api/groups' : null)
  const submitter = useApiResource<SubmitterProfile>(canReadRelated ? `${base}/submitter` : null)
  const notifications = useApiResource<ListResponse<TicketNotification>>(canReadRelated ? `${base}/notifications` : null)

  const refresh = () => {
    detail.reload()
    replies.reload()
    events.reload()
    groups.reload()
    submitter.reload()
    notifications.reload()
  }

  if (!detail.data) {
    if (isForbidden(detail.error)) return <ForbiddenNotice />
    if (isNotFound(detail.error)) return <NotFoundNotice what="工单" />
    if (detail.loading) return <LoadingBlock label="正在加载工单详情…" rows={6} />
    return <ErrorNotice error={detail.error} title="工单详情加载失败" onRetry={detail.reload} />
  }

  const data: TicketDetailData = {
    ticket: detail.data,
    replies: readList(replies.data),
    events: readList(events.data),
    groups: readList(groups.data),
    notifications: canReadRelated ? readList(notifications.data) : undefined,
    submitter: canReadRelated ? submitter.data : undefined,
    notificationsError: notifications.error,
    submitterError: submitter.error,
    notificationsLoading: notifications.loading,
    submitterLoading: submitter.loading,
    repliesLoading: replies.loading,
    eventsLoading: events.loading,
    repliesError: replies.error,
    eventsError: events.error,
    groupsError: groups.error,
    onRetryNotifications: notifications.reload,
    onRetrySubmitter: submitter.reload,
    onRetryReplies: replies.reload,
    onRetryEvents: events.reload,
  }

  return (
    <>
      {detail.error ? <ErrorNotice error={detail.error} title="工单当前内容刷新失败" onRetry={detail.reload} /> : null}
      <TicketDetailView data={data} currentUser={currentUser} refresh={refresh} initialNotice={initialNotice} onClose={onClose} onChanged={onChanged} />
    </>
  )
}
