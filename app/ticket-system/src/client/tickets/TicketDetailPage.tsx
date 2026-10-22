import { Link, useParams } from 'react-router-dom'
import TicketDetailPanel from './TicketDetailPanel'

export default function TicketDetailPage() {
  const { ticketId } = useParams()
  const id = ticketId && /^\d+$/.test(ticketId) ? Number(ticketId) : null

  return (
    <div className="stack">
      <div className="section-heading">
        <h2>工单详情</h2>
        <Link className="link-button" to="/workbench">返回工作台</Link>
      </div>
      {id === null
        ? <p className="state muted">工单标识无效。</p>
        : <TicketDetailPanel ticketId={id} />}
    </div>
  )
}