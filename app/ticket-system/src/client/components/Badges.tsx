import type { SLAPriority, TicketStatus } from '../types'
import { SLA_PRIORITY_CLASS, SLA_PRIORITY_LABEL, TICKET_STATUS_CLASS, TICKET_STATUS_LABEL } from '../lib/constants'

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TICKET_STATUS_CLASS[status]}`}>
      {TICKET_STATUS_LABEL[status]}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: SLAPriority }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${SLA_PRIORITY_CLASS[priority]}`}>
      {SLA_PRIORITY_LABEL[priority]}
    </span>
  )
}
