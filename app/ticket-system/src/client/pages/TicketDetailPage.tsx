import { useNavigate, useParams } from 'react-router-dom'
import { TicketDetail } from '../components/ticket/TicketDetail'

export default function TicketDetailPage() {
  const params = useParams()
  const navigate = useNavigate()
  const ticketId = params.id
  if (!ticketId) return null

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-4xl p-4 lg:p-6">
        <button type="button" onClick={() => navigate(-1)} className="btn-secondary mb-4 py-1.5">
          ← 返回
        </button>
        <TicketDetail ticketId={ticketId} onOpenTicket={targetId => navigate(`/tickets/${targetId}`)} />
      </div>
    </div>
  )
}
