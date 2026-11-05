import type { SlaPriority, TicketStatus } from './api/types'

export const STATUS_LABEL: Record<TicketStatus, string> = {
  created: '已创建',
  pending_assignment: '待分配',
  pending_processing: '待处理',
  completed: '已完成',
  cancelled: '已取消',
}

export const STATUS_COLOR: Record<TicketStatus, string> = {
  created: 'default',
  pending_assignment: 'gold',
  pending_processing: 'processing',
  completed: 'success',
  cancelled: 'default',
}

export const PRIORITY_LABEL: Record<SlaPriority, string> = {
  P0: 'P0 紧急',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 常规',
  P4: 'P4 低',
}

export const PRIORITY_COLOR: Record<SlaPriority, string> = {
  P0: 'red',
  P1: 'volcano',
  P2: 'orange',
  P3: 'blue',
  P4: 'default',
}

export const PRIORITY_OPTIONS: { value: SlaPriority; label: string }[] = [
  { value: 'P0', label: 'P0 紧急' },
  { value: 'P1', label: 'P1 高' },
  { value: 'P2', label: 'P2 中' },
  { value: 'P3', label: 'P3 常规' },
  { value: 'P4', label: 'P4 低' },
]

export const TERMINAL_STATUSES: TicketStatus[] = ['completed', 'cancelled']

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('zh-CN', { hour12: false })
}
