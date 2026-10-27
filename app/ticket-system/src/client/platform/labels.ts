import type { SlaPriority, TicketStatus } from './types'

export const STATUS_LABELS: Record<TicketStatus, string> = {
  created: '创建',
  pending_assignment: '待分配',
  pending_processing: '待处理',
  completed: '完成',
  cancelled: '取消',
}

export const PRIORITY_LABELS: Record<SlaPriority, string> = {
  P0: 'P0 紧急',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 普通',
  P4: 'P4 低',
}

export const PRIORITY_ORDER: SlaPriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as TicketStatus[]
