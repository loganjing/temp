import type { Priority, TicketStatus } from '../types/ticket'
import { PRIORITY_LABELS, STATUS_LABELS } from '../types/ticket'

const STATUS_STYLES: Record<TicketStatus, string> = {
  created: 'bg-slate-100 text-slate-700',
  pending_assignment: 'bg-amber-100 text-amber-800',
  pending_processing: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-rose-100 text-rose-700',
}

const PRIORITY_STYLES: Record<Priority, string> = {
  P0: 'bg-rose-100 text-rose-800',
  P1: 'bg-orange-100 text-orange-800',
  P2: 'bg-amber-100 text-amber-800',
  P3: 'bg-slate-100 text-slate-700',
  P4: 'bg-slate-50 text-slate-500',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  )
}
