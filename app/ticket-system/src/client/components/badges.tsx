import { MAIL_KIND_LABELS, MAIL_STATUS_LABELS, TICKET_STATUS_LABELS } from '../lib/labels'

const STATUS_BADGE_CLASSES: Record<string, string> = {
  created: 'bg-slate-100 text-slate-600 ring-slate-200',
  pending_assignment: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending_process: 'bg-blue-50 text-blue-700 ring-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-gray-100 text-gray-500 ring-gray-200',
}

const PRIORITY_BADGE_CLASSES: Record<string, string> = {
  P0: 'bg-red-50 text-red-700 ring-red-200',
  P1: 'bg-orange-50 text-orange-700 ring-orange-200',
  P2: 'bg-amber-50 text-amber-700 ring-amber-200',
  P3: 'bg-sky-50 text-sky-700 ring-sky-200',
  P4: 'bg-slate-100 text-slate-600 ring-slate-200',
}

function badgeClass(extra: string): string {
  return `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${extra}`
}

export function StatusBadge({ status }: { status: string }) {
  const label = TICKET_STATUS_LABELS[status] ?? status
  const extra = STATUS_BADGE_CLASSES[status] ?? 'bg-slate-100 text-slate-600 ring-slate-200'
  return <span className={badgeClass(extra)}>{label}</span>
}

export function PriorityBadge({ priority }: { priority: string }) {
  const extra = PRIORITY_BADGE_CLASSES[priority] ?? 'bg-slate-100 text-slate-600 ring-slate-200'
  return <span className={badgeClass(extra)}>{priority}</span>
}

export function MailKindBadge({ kind }: { kind: string }) {
  const label = MAIL_KIND_LABELS[kind] ?? kind
  return <span className={badgeClass('bg-indigo-50 text-indigo-700 ring-indigo-200')}>{label}</span>
}

export function MailStatusBadge({ status }: { status: string }) {
  const label = MAIL_STATUS_LABELS[status] ?? status
  return <span className={badgeClass('bg-slate-100 text-slate-600 ring-slate-200')}>{label}</span>
}
