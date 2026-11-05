import type { NotificationStatus, Priority, TicketAction, TicketStatus, UserProfile } from './types'

export const STATUS_LABEL: Record<TicketStatus, string> = {
  pending_assignment: '待分配',
  pending: '待处理',
  completed: '完成',
  cancelled: '取消',
}

export const STATUS_COLOR: Record<TicketStatus, string> = {
  pending_assignment: 'gold',
  pending: 'blue',
  completed: 'green',
  cancelled: 'default',
}

export const STATUS_OPTIONS: Array<{ value: TicketStatus; label: string }> = [
  { value: 'pending_assignment', label: '待分配' },
  { value: 'pending', label: '待处理' },
  { value: 'completed', label: '完成' },
  { value: 'cancelled', label: '取消' },
]

export const PRIORITY_LABEL: Record<Priority, string> = {
  P0: 'P0 紧急',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 低',
  P4: 'P4 最低',
}

export const PRIORITY_COLOR: Record<Priority, string> = {
  P0: 'red',
  P1: 'volcano',
  P2: 'orange',
  P3: 'blue',
  P4: 'default',
}

export const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABEL) as Priority[]).map((value) => ({ value, label: PRIORITY_LABEL[value] }))

export const NOTIFICATION_STATUS_LABEL: Record<NotificationStatus, string> = {
  sent: '已发送',
  failed: '发送失败',
  skipped: '未配置',
}

export const NOTIFICATION_STATUS_COLOR: Record<NotificationStatus, string> = {
  sent: 'green',
  failed: 'red',
  skipped: 'orange',
}

export const ACTION_LABEL: Record<TicketAction, string> = {
  reply: '回复',
  assign: '指派',
  transfer: '转派',
  complete: '完成',
  cancel: '取消工单',
  rate: '评价',
  retryNotification: '重试通知',
}

export const ROLE_LABEL: Record<string, string> = {
  company_admin: '公司管理员',
  agent: '处理人',
  platform_stats: '平台统计',
  user: '普通用户',
}

export function hasRole(user: UserProfile | null, role: string): boolean {
  return Boolean(user?.roles?.includes(role))
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(1)} 分钟`
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(1)} 分`
}

/** 日期输入框（yyyy-MM-dd）转 ISO 8601 边界：from 取当天 00:00，to 取当天 23:59:59.999。 */
export function dayBoundary(value: string, edge: 'start' | 'end'): string | undefined {
  if (!value) return undefined
  const suffix = edge === 'start' ? 'T00:00:00.000' : 'T23:59:59.999'
  const date = new Date(`${value}${suffix}`)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export function ticketStatusLabel(status: string): string {
  return STATUS_LABEL[status as TicketStatus] ?? status
}

export function ticketStatusColor(status: string): string {
  return STATUS_COLOR[status as TicketStatus] ?? 'default'
}
