// 中文文案与状态色映射（契约 §9 状态文案、枚举含义）与通用格式化。
import type { TicketAction, TicketStatus } from './contract'

export const STATUS_LABELS: Record<TicketStatus, string> = {
  created: '创建',
  pending_assignment: '待分配',
  pending_processing: '待处理',
  completed: '完成',
  cancelled: '取消',
}

export const STATUS_STYLES: Record<TicketStatus, string> = {
  created: 'bg-slate-100 text-slate-600 border-slate-200',
  pending_assignment: 'bg-amber-50 text-amber-700 border-amber-200',
  pending_processing: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
}

export const PRIORITY_STYLES: Record<string, string> = {
  P0: 'bg-red-50 text-red-700 border-red-200',
  P1: 'bg-orange-50 text-orange-700 border-orange-200',
  P2: 'bg-amber-50 text-amber-700 border-amber-200',
  P3: 'bg-sky-50 text-sky-700 border-sky-200',
  P4: 'bg-slate-100 text-slate-600 border-slate-200',
}

export const ACTION_LABELS: Record<TicketAction, string> = {
  ticket_created: '创建工单',
  ticket_assigned: '分配工单',
  ticket_replied: '回复工单',
  ticket_transferred: '转派工单',
  ticket_completed: '完成工单',
  ticket_cancelled: '取消工单',
  ticket_rated: '评价工单',
  notification_failed: '通知发送失败',
}

const CATEGORY_LABELS: Record<string, string> = {
  account: '账号',
  payment: '支付',
  performance: '性能',
  bug: '缺陷',
  feature: '功能',
  other: '其他',
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category
}

export function isActiveStatus(status: TicketStatus): boolean {
  return status === 'created' || status === 'pending_assignment' || status === 'pending_processing'
}

export function formatDateTime(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '暂无数据'
  const rounded = Math.round(minutes * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} 分钟`
}
