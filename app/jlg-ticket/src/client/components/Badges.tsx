import type { Priority, TicketStatus } from '../types'
import { PRIORITY_LABEL, STATUS_LABEL } from '../types'

const STATUS_STYLES: Record<TicketStatus, string> = {
  created: 'bg-slate-100 text-slate-700 ring-slate-200',
  pending_assign: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending_process: 'bg-blue-50 text-blue-700 ring-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-slate-100 text-slate-500 ring-slate-200',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

const PRIORITY_STYLES: Record<Priority, string> = {
  P0: 'bg-red-50 text-red-700 ring-red-200',
  P1: 'bg-orange-50 text-orange-700 ring-orange-200',
  P2: 'bg-amber-50 text-amber-700 ring-amber-200',
  P3: 'bg-sky-50 text-sky-700 ring-sky-200',
  P4: 'bg-slate-50 text-slate-600 ring-slate-200',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PRIORITY_STYLES[priority]}`}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  )
}
