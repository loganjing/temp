import { useCallback, useEffect, useState } from 'react'
import { apiErrorText } from '../../api/helpers'
import { fetchTicket } from '../../api/tickets'
import type { Ticket } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { formatDateTime, formatText } from '../../format'
import { ApiRequestError } from '../../platform/api-client'
import { ErrorBanner, ExpandableText, PriorityBadge, SkeletonBlock, StatusBadge } from '../ui'
import { TicketActions } from './ActionForms'
import { LogsSection } from './LogsSection'
import { NotificationsSection } from './NotificationsSection'
import { RatingSection } from './RatingSection'
import { RepliesSection } from './RepliesSection'
import { SubmitterInfoCard } from './SubmitterInfoCard'

interface TicketDetailProps {
  ticketId: string
  onTicketMutated?: () => void
  onOpenTicket?: (ticketId: string) => void
}

export function TicketDetail({ ticketId, onTicketMutated, onOpenTicket }: TicketDetailProps) {
  const { user } = useAuth()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ status: number; message: string } | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTicket(await fetchTicket(ticketId))
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 404 || err.status === 403)) {
        setError({
          status: err.status,
          message: err.status === 404 ? '工单不存在或无权访问' : '无权限查看该工单',
        })
      } else {
        setError({ status: 0, message: apiErrorText(err) })
      }
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    setTicket(null)
    void refresh()
  }, [refresh])

  const handleMutated = useCallback(() => {
    void refresh()
    onTicketMutated?.()
  }, [refresh, onTicketMutated])

  if (loading && !ticket) return <DetailSkeleton />
  if (error) {
    if (error.status === 404 || error.status === 403) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-base font-medium text-slate-700">{error.message}</p>
          <p className="max-w-sm text-sm text-slate-400">
            {error.status === 403
              ? '当前账号无权访问该工单，请确认账号角色与所属公司。'
              : '请确认工单号是否正确，或该工单是否在当前账号可见范围内。'}
          </p>
        </div>
      )
    }
    return (
      <div className="p-4">
        <ErrorBanner message={error.message} onRetry={() => void refresh()} />
      </div>
    )
  }
  if (!ticket || !user) return null

  const handlerSide = user.role === 'handler' || user.role === 'admin'
  const canViewNotifications = handlerSide || user.id === ticket.submitter.id

  return (
    <div className="space-y-4 p-4 lg:p-5">
      <div className="card-base p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-500">{ticket.id}</span>
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
          <span className="ml-auto text-xs text-slate-400">创建于 {formatDateTime(ticket.createdAt)}</span>
        </div>
        <h2 className="mt-2 break-words text-lg font-semibold text-slate-900">{ticket.title}</h2>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm lg:grid-cols-3">
          <Field label="分类" value={ticket.category} />
          <Field label="所属公司" value={ticket.companyName} />
          <Field label="首次回复时间" value={formatDateTime(ticket.firstReplyAt)} />
          <Field label="提交人" value={ticket.submitter.name} />
          <Field label="提交人邮箱" value={ticket.submitter.email} />
          <Field label="提交人部门" value={formatText(ticket.submitter.department)} />
          <Field label="归属业务组" value={formatText(ticket.assignedGroupName)} />
          <Field label="处理人" value={formatText(ticket.assigneeName)} />
          {ticket.status === 'COMPLETED' && <Field label="完成时间" value={formatDateTime(ticket.completedAt)} />}
        </div>
      </div>

      <div className="card-base p-4">
        <h3 className="section-title">问题描述</h3>
        <ExpandableText text={ticket.description} className="mt-2" />
      </div>

      {handlerSide && <SubmitterInfoCard ticket={ticket} onOpenTicket={onOpenTicket} />}

      <RepliesSection ticket={ticket} onMutated={handleMutated} />

      <TicketActions ticket={ticket} onMutated={handleMutated} />

      <RatingSection ticket={ticket} onMutated={handleMutated} />

      <LogsSection ticketId={ticket.id} />

      {canViewNotifications && <NotificationsSection ticketId={ticket.id} />}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate text-slate-800" title={value}>
        {value}
      </dd>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-4 lg:p-5">
      <div className="card-base space-y-3 p-4">
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="h-6 w-3/4" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonBlock key={index} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <SkeletonBlock className="h-24 w-full rounded-xl" />
      <SkeletonBlock className="h-40 w-full rounded-xl" />
    </div>
  )
}
