// 枚举的中文标签与视觉色调映射、时间与时长格式化。
import type { AuditEventType, Priority, TicketSort, TicketStatus } from './contracts'

export const ticketStatusLabels: Record<TicketStatus, string> = {
  awaiting_assignment: '待分配',
  pending: '待处理',
  completed: '已完成',
  cancelled: '已取消',
}

export type StatusTone = 'amber' | 'blue' | 'green' | 'gray'

export const ticketStatusTones: Record<TicketStatus, StatusTone> = {
  awaiting_assignment: 'amber',
  pending: 'blue',
  completed: 'green',
  cancelled: 'gray',
}

export const priorities: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export const priorityLabels: Record<Priority, string> = {
  P0: 'P0 紧急',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 低',
  P4: 'P4 最低',
}

export type PriorityTone = 'red' | 'orange' | 'amber' | 'blue' | 'gray'

export const priorityTones: Record<Priority, PriorityTone> = {
  P0: 'red',
  P1: 'orange',
  P2: 'amber',
  P3: 'blue',
  P4: 'gray',
}

export const replySideLabels: Record<string, string> = {
  submitter: '提交人',
  handler: '处理方',
}

export const sortLabels: Record<TicketSort, string> = {
  created_at_desc: '创建时间 降序',
  created_at_asc: '创建时间 升序',
  priority_asc: '优先级 紧急在前',
  priority_desc: '优先级 紧急在后',
}

export const auditEventLabels: Record<AuditEventType, string> = {
  ticket_created: '创建工单',
  ticket_auto_assigned: '自动分配',
  ticket_manually_assigned: '手工分配',
  ticket_transferred: '转派',
  ticket_replied: '回复',
  ticket_completed: '完成处理',
  ticket_email_sent: '发送完成通知',
  ticket_email_failed: '完成通知发送失败',
  ticket_cancelled: '取消工单',
  ticket_rated: '满意度评价',
}

const auditDetailKeyLabels: Record<string, string> = {
  fromGroupId: '原业务组',
  toGroupId: '目标业务组',
  groupId: '业务组',
  score: '评分',
  recipient: '收件人',
  error: '失败原因',
}

export function auditDetailKeyLabel(key: string): string {
  return auditDetailKeyLabels[key] ?? key
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${Math.round(seconds)} 秒`
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} 分钟`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} 小时`
  return `${(seconds / 86400).toFixed(1)} 天`
}
