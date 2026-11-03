import type { TicketStatus, SLAPriority, AuditAction } from '../types'
import { STATUS_LABELS, ACTION_LABELS } from '../types'

const STATUS_CLASS: Record<TicketStatus, string> = {
  pending_assignment: 'badge-status-pending-assignment',
  pending_processing: 'badge-status-pending-processing',
  completed: 'badge-status-completed',
  cancelled: 'badge-status-cancelled',
}

const PRIORITY_CLASS: Record<SLAPriority, string> = {
  P0: 'badge-priority-p0',
  P1: 'badge-priority-p1',
  P2: 'badge-priority-p2',
  P3: 'badge-priority-p3',
  P4: 'badge-priority-p4',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{STATUS_LABELS[status]}</span>
}

export function PriorityBadge({ priority }: { priority: SLAPriority }) {
  return <span className={`badge ${PRIORITY_CLASS[priority]}`}>{priority}</span>
}

export function ActionLabel({ action }: { action: AuditAction }) {
  return <>{ACTION_LABELS[action]}</>
}
