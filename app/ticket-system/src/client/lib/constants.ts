import type { SLAPriority, TicketStatus, UserRole } from '../types'

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  created: '已创建',
  pending_assignment: '待分配',
  pending_processing: '待处理',
  completed: '已完成',
  cancelled: '已取消',
}

export const TICKET_STATUS_CLASS: Record<TicketStatus, string> = {
  created: 'bg-slate-100 text-slate-700 ring-slate-200',
  pending_assignment: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending_processing: 'bg-blue-50 text-blue-700 ring-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export const SLA_PRIORITY_LABEL: Record<SLAPriority, string> = {
  P0: 'P0 紧急',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 低',
  P4: 'P4 最低',
}

export const SLA_PRIORITY_CLASS: Record<SLAPriority, string> = {
  P0: 'bg-rose-50 text-rose-700 ring-rose-200',
  P1: 'bg-orange-50 text-orange-700 ring-orange-200',
  P2: 'bg-amber-50 text-amber-700 ring-amber-200',
  P3: 'bg-sky-50 text-sky-700 ring-sky-200',
  P4: 'bg-slate-100 text-slate-600 ring-slate-200',
}

// 优先级权重，用于排序时降序比较（P0 最高）。
export const SLA_PRIORITY_WEIGHT: Record<SLAPriority, number> = {
  P0: 5,
  P1: 4,
  P2: 3,
  P3: 2,
  P4: 1,
}

export const SLA_PRIORITY_OPTIONS: SLAPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const TICKET_STATUS_OPTIONS: TicketStatus[] = [
  'created',
  'pending_assignment',
  'pending_processing',
  'completed',
  'cancelled',
]

export const ROLE_LABEL: Record<UserRole, string> = {
  submitter: '提交人',
  handler: '处理人',
  admin: '管理员',
}

export const ACTION_TYPE_LABEL: Record<string, string> = {
  ticket_create: '创建工单',
  ticket_assign: '分配工单',
  ticket_auto_assign: '自动分配',
  ticket_transfer: '转派工单',
  ticket_reply: '添加回复',
  ticket_complete: '完成工单',
  ticket_cancel: '取消工单',
}
