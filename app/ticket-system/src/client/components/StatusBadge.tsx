import type { TicketStatus, SlaPriority } from '../api/types'

const STATUS_LABEL: Record<TicketStatus, string> = {
  created: '创建',
  pending_assign: '待分配',
  pending_process: '待处理',
  completed: '完成',
  cancelled: '取消',
}

const STATUS_CLASS: Record<TicketStatus, string> = {
  created: 'badge-created',
  pending_assign: 'badge-pending',
  pending_process: 'badge-pending',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
}

const PRIORITY_CLASS: Record<SlaPriority, string> = {
  P0: 'badge-cancelled',
  P1: 'badge-priority-high',
  P2: 'badge-pending',
  P3: 'badge-created',
  P4: 'badge-completed',
}

export function PriorityBadge({ priority }: { priority: SlaPriority }) {
  return <span className={`badge ${PRIORITY_CLASS[priority]}`}>{priority}</span>
}
