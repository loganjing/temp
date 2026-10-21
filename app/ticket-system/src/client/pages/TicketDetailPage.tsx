// 工单详情独立页（登录用户可达；可见性由服务端判定，越权/不存在返回 404）。
import { useParams } from 'react-router-dom'
import { TicketDetailPanel } from '../components/TicketDetailPanel'

export function TicketDetailPage() {
  const params = useParams<{ ticketId: string }>()
  const ticketId = Number(params.ticketId)
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
        工单编号无效
      </div>
    )
  }
  return <TicketDetailPanel ticketId={ticketId} layout="page" />
}
