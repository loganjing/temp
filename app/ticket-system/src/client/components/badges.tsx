import type { Priority, TicketStatus } from '../platform/contracts'

const statusStyles: Record<TicketStatus, string> = {
  created: 'bg-slate-100 text-slate-700',
  pending_assignment: 'bg-amber-100 text-amber-800',
  pending_handling: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-rose-100 text-rose-700',
}

const statusLabels: Record<TicketStatus, string> = {
  created: '创建',
  pending_assignment: '待分配',
  pending_handling: '待处理',
  completed: '完成',
  cancelled: '取消',
}

const priorityStyles: Record<Priority, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-orange-100 text-orange-700',
  P2: 'bg-yellow-100 text-yellow-800',
  P3: 'bg-sky-100 text-sky-700',
  P4: 'bg-slate-100 text-slate-600',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${priorityStyles[priority]}`}>
      {priority}
    </span>
  )
}

export function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false })
}
